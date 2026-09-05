import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import {
  startFixtureServer,
  openBrowserSession,
} from '@website-to-figma/browser-extractor';
import { createLiveSession } from '@website-to-figma/transport';
import type { FigmaSceneArtifact } from '@website-to-figma/contracts';
it('connects the packaged browser UI and exchanges a validated request and response', async () => {
  let html = '';
  vm.runInNewContext(
    await readFile(
      new URL('../../apps/figma-plugin/dist/plugin/code.js', import.meta.url),
      'utf8',
    ),
    {
      figma: {
        showUI: (value: string) => {
          html = value;
        },
        ui: {},
      },
    },
    { contextCodeGeneration: { strings: false, wasm: false } },
  );
  const destination = {
    documentName: 'UI fixture',
    pageName: 'Page',
    pageId: 'page:1',
  };
  const fixture = await startFixtureServer(
    `<script>window.addEventListener('message',event=>{const m=event.data.pluginMessage;if(m?.type==='destination')event.source.postMessage({pluginMessage:{type:'destination',destination:${JSON.stringify(destination)}}},'*');if(m?.type==='import-request')window.received=m;});</script><iframe title="Plugin" style="width:460px;height:370px" srcdoc="${html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`,
  );
  const browser = await openBrowserSession({
    url: fixture.url,
    allowLoopback: true,
    viewport: { width: 800, height: 600 },
  });
  const transport = await createLiveSession('run:ui', 5000);
  try {
    const errors: string[] = [];
    browser.page.on('pageerror', (error) => errors.push(error.message));
    const frame = browser.page.frameLocator('iframe');
    await expect
      .poll(() => frame.locator('#destination').textContent())
      .toContain('UI fixture');
    await frame.locator('textarea').fill(JSON.stringify(transport.descriptor));
    await frame.locator('button').click();
    const scene: FigmaSceneArtifact = {
      schemaVersion: '1.0.0',
      artifactKind: 'figma-scene',
      runId: 'run:ui',
      sourceUrl: 'https://example.com/',
      capturedAt: '2026-09-04T00:00:00Z',
      viewport: { width: 10, height: 10, deviceScaleFactor: 1 },
      payload: {
        sourceNodeIds: ['dom:0'],
        rootNodeIds: ['scene:0'],
        assets: [],
        nodes: [
          {
            sceneNodeId: 'scene:0',
            sourceNodeId: 'dom:0',
            parentNodeId: null,
            childNodeIds: [],
            kind: 'frame',
            name: 'Root',
            rect: { x: 0, y: 0, width: 10, height: 10 },
          },
        ],
      },
    };
    const response = transport.importScene({
      protocolVersion: '1.1.0',
      runId: 'run:ui',
      type: 'import-request',
      scene,
      assets: [],
      width: 10,
      height: 10,
    });
    await expect
      .poll(() =>
        browser.page.evaluate(() => Boolean(Reflect.get(window, 'received'))),
      )
      .toBe(true);
    await browser.page.evaluate(
      ({ scene, destination }) => {
        document.querySelector('iframe')?.contentWindow?.postMessage(
          {
            pluginMessage: {
              protocolVersion: '1.1.0',
              runId: 'run:ui',
              type: 'import-result',
              destination,
              png: '',
              result: {
                ...scene,
                artifactKind: 'import-result',
                payload: {
                  status: 'partial',
                  sceneNodeIds: ['scene:0'],
                  nodes: [
                    {
                      sceneNodeId: 'scene:0',
                      status: 'created',
                      figmaNodeId: '1:3',
                    },
                  ],
                  diagnostics: [],
                },
              },
            },
          },
          '*',
        );
      },
      { scene, destination },
    );
    expect((await response).result.payload.nodes[0]?.figmaNodeId).toBe('1:3');
    expect(errors).toEqual([]);
  } finally {
    await transport.close();
    await browser.close();
    await fixture.close();
  }
}, 20_000);
