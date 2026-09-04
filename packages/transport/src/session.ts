import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  validateProtocolMessage,
  transitionProtocolState,
  type ProtocolState,
} from '@website-to-figma/contracts';

export interface TransportSession {
  url: string;
  authToken: string;
  close: () => Promise<void>;
  state: () => ProtocolState;
}

export async function createTransportSession(
  port = 0,
): Promise<TransportSession> {
  const authToken = randomBytes(32).toString('hex');
  let currentState: ProtocolState = 'awaiting-auth';
  const server = new WebSocketServer({ host: '127.0.0.1', port });
  server.on('connection', (socket: WebSocket) => {
    socket.on('message', (raw) => {
      let input: unknown;
      try {
        input = JSON.parse(
          Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Buffer.concat(raw as Buffer[]).toString('utf8'),
        );
      } catch {
        return;
      }
      const validated = validateProtocolMessage(input);
      if (!validated.ok) return;
      const message = validated.value;
      if (message.type === 'hello' && message.authToken !== authToken) return;
      const transition = transitionProtocolState(currentState, message);
      if (transition.state === 'failed') return;
      currentState = transition.state;
      if (message.type === 'hello')
        socket.send(
          JSON.stringify({
            protocolVersion: '1.0.0',
            runId: message.runId,
            type: 'hello-ack',
            accepted: true,
            schemaVersion: '1.0.0',
            capabilities: ['scene-import'],
          }),
        );
    });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Transport server did not expose a port');
  return {
    url: `ws://127.0.0.1:${address.port}`,
    authToken,
    state: () => currentState,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
