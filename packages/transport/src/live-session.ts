import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  LIVE_PROTOCOL_VERSION,
  MAX_WIRE_BYTES,
  parseLiveMessage,
  type Destination,
  type ImportRequest,
  type ImportResponse,
} from '@website-to-figma/contracts';

export interface ConnectionDescriptor {
  url: string;
  authToken: string;
  runId: string;
}
export async function createLiveSession(
  runId: string,
  timeoutMs = 120_000,
  port = 0,
) {
  const authToken = randomBytes(32).toString('hex');
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port,
    maxPayload: MAX_WIRE_BYTES,
    perMessageDeflate: false,
  });
  let client: WebSocket | undefined;
  let identity: string | undefined;
  let destination: Destination | undefined;
  let request: ImportRequest | undefined;
  let reconnects = 0;
  let completed = false;
  let resolveResult: (value: ImportResponse) => void = () => {};
  let rejectResult: (reason: Error) => void = () => {};
  const result = new Promise<ImportResponse>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // Consumers may attach after capture has finished.
  void result.catch(() => {});
  const timer = setTimeout(() => {
    rejectResult(new Error('Timed out waiting for Figma plugin import'));
  }, timeoutMs);
  const sendRequest = () => {
    if (client?.readyState === WebSocket.OPEN && request && destination) {
      client.send(JSON.stringify({ ...request, destination }));
    }
  };
  server.on('connection', (socket) => {
    let authenticated = false;
    const authTimer = setTimeout(() => {
      socket.close(1008, 'Authentication required');
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
          if (
            client ||
            completed ||
            (identity && identity !== message.clientId)
          )
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
          identity = message.clientId;
          destination = message.destination;
          client = socket;
          if (request) {
            request = { ...request, destination: message.destination };
          }
          socket.send(
            JSON.stringify({
              protocolVersion: LIVE_PROTOCOL_VERSION,
              runId,
              type: 'hello-ack',
              accepted: true,
            }),
          );
          sendRequest();
          return;
        }
        if (socket !== client) throw new Error('Inactive client');
        if (message.type === 'error') {
          rejectResult(new Error(message.message));
          return;
        }
        if (message.type !== 'import-result' || !request || !destination)
          throw new Error('Unexpected message');
        if (JSON.stringify(destination) !== JSON.stringify(message.destination))
          throw new Error('Destination mismatch');
        const expected = new Set(
          request.scene.payload.nodes.map((n) => n.sceneNodeId),
        );
        const actual = message.result.payload.nodes.map((n) => n.sceneNodeId);
        if (
          actual.length !== expected.size ||
          new Set(actual).size !== expected.size ||
          actual.some((id) => !expected.has(id)) ||
          message.result.sourceUrl !== request.scene.sourceUrl
        )
          throw new Error('Result membership mismatch');
        completed = true;
        clearTimeout(timer);
        resolveResult(message);
        socket.close(1000, 'Import received');
      } catch {
        socket.close(1008, 'Invalid session message');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No loopback port');
  return {
    descriptor: { url: `ws://localhost:${address.port}`, authToken, runId },
    async importScene(
      value: Omit<ImportRequest, 'destination'>,
    ): Promise<ImportResponse> {
      if (request) throw new Error('Only one import per session');
      request = {
        ...value,
        destination: destination ?? {
          documentName: 'pending',
          pageName: 'pending',
          pageId: 'pending',
        },
      };
      parseLiveMessage(request);
      if (Buffer.byteLength(JSON.stringify(request)) > MAX_WIRE_BYTES)
        throw new Error('Wire payload limit exceeded');
      sendRequest();
      return result;
    },
    async close() {
      clearTimeout(timer);
      rejectResult(new Error('Session closed'));
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
