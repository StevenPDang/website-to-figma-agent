import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { startFixtureServer } from '@website-to-figma/browser-extractor';
import {
  parseLiveMessage,
  validateArtifact,
} from '@website-to-figma/contracts';
import { runImport } from '../../apps/cli/src/pipeline.js';

it('runs Chrome capture through authenticated result exchange and measured PNG QA', async () => {
  const fixture = await startFixtureServer(
    '<main><h1>Editable fixture</h1></main>',
  );
  const outputDir = await mkdtemp(join(tmpdir(), 'live-figma-'));
  let socket: WebSocket | undefined;
  let connectionCreatedBeforeCapture = false;
  try {
    const result = await runImport({
      url: fixture.url,
      allowLoopback: true,
      outputDir,
      pluginTimeoutMs: 5000,
      pluginPort: 0,
      onConnection: (descriptor) => {
        connectionCreatedBeforeCapture = !existsSync(
          join(outputDir, 'raw-capture.json'),
        );
        socket = new WebSocket(descriptor.url);
        socket.on('open', () => {
          socket?.send(
            JSON.stringify({
              type: 'hello',
              protocolVersion: '1.1.0',
              runId: descriptor.runId,
              authToken: descriptor.authToken,
              clientId: 'fixture-client',
              destination: {
                documentName: 'Fixture document',
                pageName: 'Page',
                pageId: '1:2',
              },
            }),
          );
        });
        socket.on('message', (raw) => {
          void (async () => {
            const message = parseLiveMessage(
              JSON.parse(
                Buffer.isBuffer(raw)
                  ? raw.toString()
                  : Buffer.from(raw as ArrayBuffer).toString(),
              ) as unknown,
            );
            if (message.type !== 'import-request') return;
            // Synthetic peer: this tests orchestration/PNG QA, not Figma's renderer.
            const png = (
              await readFile(join(outputDir, 'reference.png'))
            ).toString('base64');
            socket?.send(
              JSON.stringify({
                type: 'import-result',
                protocolVersion: '1.1.0',
                runId: descriptor.runId,
                destination: message.destination,
                png,
                result: {
                  ...message.scene,
                  artifactKind: 'import-result',
                  payload: {
                    status: 'success',
                    sceneNodeIds: message.scene.payload.nodes.map(
                      (n) => n.sceneNodeId,
                    ),
                    nodes: message.scene.payload.nodes.map((n, i) => ({
                      sceneNodeId: n.sceneNodeId,
                      figmaNodeId: `1:${i + 3}`,
                      status: 'created',
                    })),
                    diagnostics: [],
                  },
                },
              }),
            );
          })();
        });
      },
    });
    expect(connectionCreatedBeforeCapture).toBe(true);
    expect(result.status).toBe('success');
    expect(result.metrics).toEqual({ ssim: 1, changedPixelRatio: 0 });
    for (const name of [
      'raw-capture',
      'website-ir',
      'inference',
      'figma-scene',
      'import-result',
      'qa-report',
    ])
      expect(
        validateArtifact(
          JSON.parse(
            await readFile(join(outputDir, `${name}.json`), 'utf8'),
          ) as unknown,
        ).ok,
      ).toBe(true);
    expect(
      (await readFile(join(outputDir, 'figma.png'))).length,
    ).toBeGreaterThan(0);
  } finally {
    socket?.terminate();
    await fixture.close();
    await rm(outputDir, { recursive: true, force: true });
  }
}, 20_000);
