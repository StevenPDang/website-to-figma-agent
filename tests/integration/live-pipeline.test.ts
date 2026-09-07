import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { startFixtureServer } from '@website-to-figma/browser-extractor';
import {
  LIVE_PROTOCOL_VERSION,
  parseLiveMessage,
  validateArtifact,
} from '@website-to-figma/contracts';
import { runImport } from '../../apps/cli/src/pipeline.js';
import { createFakeInferenceProvider } from '@website-to-figma/inference';

it.each([1, 3])(
  'runs %i candidate revisions through authenticated exchange and measured PNG QA',
  async (renderCount) => {
    const fixture = await startFixtureServer(
      '<main><h1>Editable fixture</h1></main>',
    );
    const outputDir = await mkdtemp(join(tmpdir(), 'live-figma-'));
    let socket: WebSocket | undefined;
    let connectionCreatedBeforeCapture = false;
    let connectionAttempted = false;
    const provider = createFakeInferenceProvider('integration-provider', [
      ...Array.from({ length: renderCount - 1 }, () => ({
        ok: true as const,
        proposal: { decisions: [] },
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      })),
      {
        ok: true,
        proposal: { decisions: [] },
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      },
    ]);
    try {
      const result = await runImport({
        url: fixture.url,
        allowLoopback: true,
        outputDir,
        pluginTimeoutMs: 5000,
        pluginPort: 0,
        inferenceMode: 'agentic',
        provider,
        onConnection: (descriptor) => {
          connectionCreatedBeforeCapture = !existsSync(
            join(outputDir, 'raw-capture.json'),
          );
          socket = new WebSocket(descriptor.url);
          socket.on('open', () => {
            connectionAttempted = true;
            socket?.send(
              JSON.stringify({
                type: 'hello',
                protocolVersion: '1.2.0',
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
              if (message.type === 'finalize-request') {
                socket?.send(
                  JSON.stringify({
                    type: 'finalize-result',
                    protocolVersion: LIVE_PROTOCOL_VERSION,
                    runId: descriptor.runId,
                    selectedRevision: message.selectedRevision,
                  }),
                );
                return;
              }
              if (message.type !== 'candidate-request') return;
              // Synthetic peer: this tests orchestration/PNG QA, not Figma's renderer.
              const reference = await readFile(
                join(outputDir, 'reference.png'),
              );
              const decoded = PNG.sync.read(reference);
              if (message.revision < renderCount - 1) {
                const delta = message.revision === 0 ? 100 : 50;
                for (let i = 0; i < decoded.data.length; i += 4) {
                  for (let channel = 0; channel < 3; channel += 1) {
                    decoded.data[i + channel] = Math.max(
                      0,
                      (decoded.data[i + channel] ?? 0) - delta,
                    );
                  }
                }
              }
              const png = PNG.sync.write(decoded).toString('base64');
              socket?.send(
                JSON.stringify({
                  type: 'candidate-result',
                  protocolVersion: '1.2.0',
                  runId: descriptor.runId,
                  revision: message.revision,
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
      expect(connectionAttempted).toBe(true);
      expect(result.status).toBe('success');
      expect(result).toMatchObject({
        inferenceMode: 'agentic',
        providerId: 'integration-provider',
        selectedRevision: renderCount - 1,
        stopReason: 'automated-pass',
        usage: { totalTokens: 12 * renderCount },
      });
      expect(provider.requests).toHaveLength(renderCount);
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
      expect(
        JSON.parse(
          await readFile(join(outputDir, 'correction-history.json'), 'utf8'),
        ),
      ).toMatchObject({
        selectedRevision: renderCount - 1,
        stopReason: 'automated-pass',
      });
    } finally {
      socket?.terminate();
      await fixture.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  },
  20_000,
);
