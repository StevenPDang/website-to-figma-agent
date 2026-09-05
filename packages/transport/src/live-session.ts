import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  LIVE_PROTOCOL_VERSION,
  MAX_WIRE_BYTES,
  parseLiveMessage,
  type CandidateRequest,
  type CandidateResponse,
  type Destination,
  type LiveMessage,
} from '@website-to-figma/contracts';

export interface ConnectionDescriptor {
  url: string;
  authToken: string;
  runId: string;
}

type OutboundOperation =
  | Omit<CandidateRequest, 'destination'>
  | Extract<LiveMessage, { type: 'finalize-request' | 'cancel-request' }>;
type InboundOperation = Extract<
  LiveMessage,
  { type: 'candidate-result' | 'finalize-result' | 'cancel-result' }
>;

export async function createLiveSession(
  runId: string,
  timeoutMs = 120_000,
  port = 0,
) {
  const authToken = randomBytes(32).toString('hex');
  const server = new WebSocketServer({
    host: 'localhost',
    port,
    maxPayload: MAX_WIRE_BYTES,
    perMessageDeflate: false,
  });
  let client: WebSocket | undefined;
  let identity: string | undefined;
  let destination: Destination | undefined;
  let reconnects = 0;
  let ended = false;
  let active:
    | {
        outbound: OutboundOperation;
        resolve: (value: InboundOperation) => void;
        reject: (reason: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  const candidateResults = new Map<number, CandidateResponse>();
  let resolveConnection: (value: Destination) => void = () => {};
  let rejectConnection: (reason: Error) => void = () => {};
  const connection = new Promise<Destination>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });
  void connection.catch(() => {});
  const connectionTimer = setTimeout(() => {
    rejectConnection(
      new Error('Timed out waiting for Figma plugin connection'),
    );
  }, timeoutMs);
  const sendActive = () => {
    if (client?.readyState !== WebSocket.OPEN || active === undefined) return;
    const outbound =
      active.outbound.type === 'candidate-request'
        ? { ...active.outbound, destination }
        : active.outbound;
    client.send(JSON.stringify(outbound));
  };
  const failActive = (error: Error) => {
    if (active === undefined) return;
    clearTimeout(active.timer);
    active.reject(error);
    active = undefined;
  };
  const completeActive = (message: InboundOperation) => {
    if (active === undefined) throw new Error('Unexpected lifecycle result');
    clearTimeout(active.timer);
    const resolve = active.resolve;
    active = undefined;
    resolve(message);
  };
  server.on('connection', (socket) => {
    let authenticated = false;
    const authTimer = setTimeout(() => {
      socket.close(4008, 'Authentication required');
    }, 5000);
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(authTimer);
      if (client === socket) client = undefined;
    });
    socket.on('message', (raw) => {
      try {
        const input: unknown = JSON.parse(
          Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString('utf8')
              : Buffer.from(raw).toString('utf8'),
        );
        const candidateVersion =
          typeof input === 'object' && input !== null
            ? (input as Record<string, unknown>).protocolVersion
            : undefined;
        if (candidateVersion !== LIVE_PROTOCOL_VERSION) {
          socket.send(
            JSON.stringify({
              protocolVersion: candidateVersion,
              runId,
              type: 'error',
              message:
                'Plugin protocol is incompatible. Rebuild and reload the plugin.',
            }),
            () => {
              socket.close(4008, 'Incompatible protocol');
            },
          );
          return;
        }
        const message = parseLiveMessage(input);
        if (message.runId !== runId) throw new Error('Run mismatch');
        if (!authenticated) {
          if (
            message.type !== 'hello' ||
            !timingSafeEqual(
              Buffer.from(message.authToken),
              Buffer.from(authToken),
            )
          )
            throw new Error('Authentication rejected');
          if (client || ended || (identity && identity !== message.clientId))
            throw new Error('Session is bound to another plugin instance');
          if (identity && ++reconnects > 3)
            throw new Error('Reconnect limit exceeded');
          if (
            destination &&
            JSON.stringify(destination) !== JSON.stringify(message.destination)
          )
            throw new Error('Destination changed');
          authenticated = true;
          clearTimeout(authTimer);
          clearTimeout(connectionTimer);
          identity = message.clientId;
          destination = message.destination;
          client = socket;
          resolveConnection(message.destination);
          socket.send(
            JSON.stringify({
              protocolVersion: LIVE_PROTOCOL_VERSION,
              runId,
              type: 'hello-ack',
              accepted: true,
            }),
          );
          sendActive();
          return;
        }
        if (socket !== client) throw new Error('Inactive client');
        if (message.type === 'error') {
          failActive(new Error(message.message));
          return;
        }
        if (message.type === 'candidate-result') {
          if (
            active?.outbound.type !== 'candidate-request' ||
            message.revision !== active.outbound.revision ||
            destination === undefined ||
            JSON.stringify(destination) !== JSON.stringify(message.destination)
          )
            throw new Error('Candidate result mismatch');
          assertResultMembership(active.outbound, message);
          candidateResults.set(message.revision, message);
          completeActive(message);
          return;
        }
        if (message.type === 'finalize-result') {
          if (
            active?.outbound.type !== 'finalize-request' ||
            message.selectedRevision !== active.outbound.selectedRevision
          )
            throw new Error('Finalization mismatch');
          ended = true;
          completeActive(message);
          socket.close(1000, 'Candidate finalized');
          return;
        }
        if (message.type === 'cancel-result') {
          if (active?.outbound.type !== 'cancel-request')
            throw new Error('Cancellation mismatch');
          ended = true;
          completeActive(message);
          socket.close(1000, 'Candidate run cancelled');
          return;
        }
        throw new Error('Unexpected message');
      } catch {
        socket.close(4008, 'Invalid session message');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', (error) => {
      clearTimeout(connectionTimer);
      reject(error);
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No loopback port');
  const exchange = <T extends InboundOperation>(
    outbound: OutboundOperation,
  ): Promise<T> => {
    if (ended) return Promise.reject(new Error('Candidate session has ended'));
    if (active !== undefined)
      return Promise.reject(new Error('Another candidate operation is active'));
    parseLiveMessage(
      outbound.type === 'candidate-request'
        ? {
            ...outbound,
            destination: destination ?? {
              documentName: 'pending',
              pageName: 'pending',
              pageId: 'pending',
            },
          }
        : outbound,
    );
    if (Buffer.byteLength(JSON.stringify(outbound)) > MAX_WIRE_BYTES)
      return Promise.reject(new Error('Wire payload limit exceeded'));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        active = undefined;
        reject(new Error('Timed out waiting for Figma plugin operation'));
      }, timeoutMs);
      active = {
        outbound,
        resolve: (value) => {
          resolve(value as T);
        },
        reject,
        timer,
      };
      sendActive();
    });
  };
  return {
    descriptor: { url: `ws://localhost:${address.port}`, authToken, runId },
    waitForConnection(): Promise<Destination> {
      return connection;
    },
    renderCandidate(
      value: Omit<CandidateRequest, 'destination'>,
    ): Promise<CandidateResponse> {
      const cached = candidateResults.get(value.revision);
      if (cached !== undefined) return Promise.resolve(cached);
      return exchange<CandidateResponse>(value);
    },
    importScene(
      value: Omit<CandidateRequest, 'destination'>,
    ): Promise<CandidateResponse> {
      return this.renderCandidate(value);
    },
    finalize(selectedRevision: number) {
      return exchange<Extract<LiveMessage, { type: 'finalize-result' }>>({
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId,
        type: 'finalize-request',
        selectedRevision,
      });
    },
    cancel(reason?: string) {
      return exchange<Extract<LiveMessage, { type: 'cancel-result' }>>({
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId,
        type: 'cancel-request',
        ...(reason === undefined ? {} : { reason }),
      });
    },
    async close() {
      clearTimeout(connectionTimer);
      rejectConnection(new Error('Session closed'));
      failActive(new Error('Session closed'));
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

function assertResultMembership(
  request: Omit<CandidateRequest, 'destination'>,
  response: CandidateResponse,
): void {
  const expected = new Set(
    request.scene.payload.nodes.map((node) => node.sceneNodeId),
  );
  const actual = response.result.payload.nodes.map((node) => node.sceneNodeId);
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== expected.size ||
    actual.some((id) => !expected.has(id)) ||
    response.result.sourceUrl !== request.scene.sourceUrl
  )
    throw new Error('Result membership mismatch');
}
