import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createTransportSession } from './session.js';

describe('transport session', () => {
  it('authenticates a hello message and acknowledges it', async () => {
    const session = await createTransportSession();
    try {
      const socket = new WebSocket(session.url);
      const response = await new Promise<string>((resolve) => {
        socket.once('open', () => {
          socket.send(
            JSON.stringify({
              protocolVersion: '1.0.0',
              runId: 'run:test',
              type: 'hello',
              authToken: session.authToken,
            }),
          );
        });
        socket.once('message', (data) => {
          resolve(
            Buffer.isBuffer(data)
              ? data.toString('utf8')
              : Buffer.concat(data as Buffer[]).toString('utf8'),
          );
        });
      });
      expect(JSON.parse(response)).toMatchObject({
        type: 'hello-ack',
        accepted: true,
      });
      expect(session.state()).toBe('ready');
      socket.close();
    } finally {
      await session.close();
    }
  });
});
