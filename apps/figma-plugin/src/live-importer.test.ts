import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import type {
  CandidateRequest,
  CandidateResponse,
} from '@website-to-figma/contracts';
import {
  gradientPaint,
  importLiveScene,
  shadowEffect,
} from './live-importer.js';
const request: CandidateRequest = {
  protocolVersion: '1.2.0',
  type: 'candidate-request',
  revision: 0,
  runId: 'run:test',
  width: 200,
  height: 100,
  assets: [],
  destination: { documentName: 'Test', pageName: 'Page', pageId: 'page:1' },
  scene: {
    schemaVersion: '1.0.0',
    artifactKind: 'figma-scene',
    runId: 'run:test',
    sourceUrl: 'https://example.com/',
    capturedAt: '2026-09-04T00:00:00Z',
    viewport: { width: 200, height: 100, deviceScaleFactor: 1 },
    payload: {
      sourceNodeIds: ['dom:0', 'dom:1'],
      rootNodeIds: ['scene:0'],
      assets: [],
      nodes: [
        {
          sceneNodeId: 'scene:0',
          sourceNodeId: 'dom:0',
          parentNodeId: null,
          childNodeIds: ['scene:1'],
          kind: 'frame',
          name: 'Root',
          rect: { x: 0, y: 0, width: 200, height: 100 },
        },
        {
          sceneNodeId: 'scene:1',
          sourceNodeId: 'dom:1',
          parentNodeId: 'scene:0',
          childNodeIds: [],
          kind: 'text',
          name: 'Heading',
          text: 'Editable',
          rect: { x: 12, y: 20, width: 100, height: 24 },
          styles: {
            'font-family': 'Inter',
            'font-size': '20px',
            color: 'rgb(0, 0, 0)',
          },
        },
      ],
    },
  },
};
class TestNode {
  id: string;
  name = '';
  type: string;
  x = 0;
  y = 0;
  width = 1;
  height = 1;
  fills: unknown[] = [];
  opacity = 1;
  cornerRadius = 0;
  strokes: unknown[] = [];
  children: TestNode[] = [];
  data = new Map<string, string>();
  characters = '';
  removed = false;
  constructor(type: string, id: string) {
    this.type = type;
    this.id = id;
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  appendChild(node: TestNode) {
    this.children.push(node);
  }
  setPluginData(k: string, v: string) {
    this.data.set(k, v);
  }
  getPluginData(k: string) {
    return this.data.get(k) ?? '';
  }
  remove() {
    this.removed = true;
  }
  exportAsync() {
    return Promise.resolve(new Uint8Array([1, 2, 3]));
  }
}
function harness() {
  const nodes: TestNode[] = [];
  const create = (type: string) => {
    const n = new TestNode(type, `node:${nodes.length}`);
    nodes.push(n);
    return n;
  };
  const api = {
    root: { name: 'Test' },
    currentPage: {
      id: 'page:1',
      name: 'Page',
      selection: [],
      findAll: (predicate: (node: TestNode) => boolean) =>
        nodes.filter(predicate),
    },
    viewport: { scrollAndZoomIntoView: () => {} },
    createFrame: () => create('FRAME'),
    createText: () => create('TEXT'),
    createRectangle: () => create('RECTANGLE'),
    createEllipse: () => create('ELLIPSE'),
    listAvailableFontsAsync: () =>
      Promise.resolve([{ fontName: { family: 'Inter', style: 'Regular' } }]),
    loadFontAsync: () => Promise.resolve(),
    base64Encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
    base64Decode: (value: string) =>
      new Uint8Array(Buffer.from(value, 'base64')),
  };
  return { nodes, api };
}
it('creates editable text with parent-relative geometry and source identity', async () => {
  const { api, nodes } = harness();
  const result = await importLiveScene(
    api as unknown as PluginAPI,
    request,
    new Map(),
  );
  expect(result.result.payload.status).toBe('success');
  const text = nodes.find((n) => n.type === 'TEXT');
  expect(text?.characters).toBe('Editable');
  expect(text?.x).toBe(12);
  expect(text?.data.get('sourceNodeId')).toBe('dom:1');
});

it('removes collapsed boundary whitespace from editable browser text', async () => {
  const { api, nodes } = harness();
  const spaced = structuredClone(request);
  const source = spaced.scene.payload.nodes.find(
    (node) => node.kind === 'text',
  );
  if (!source) throw new Error('Missing text fixture');
  source.text = '\n\n  Featured work\n\n';
  source.styles = { ...source.styles, 'white-space': 'normal' };
  await importLiveScene(api as unknown as PluginAPI, spaced, new Map());
  expect(nodes.find((node) => node.type === 'TEXT')?.characters).toBe(
    'Featured work',
  );
});

it('maps CSS gradients and shadows to Figma paints and effects', () => {
  const gradient = gradientPaint(
    'linear-gradient(90deg, rgb(0, 0, 0), rgba(255, 255, 255, 0.5))',
  );
  expect(gradient?.type).toBe('GRADIENT_LINEAR');
  expect(gradient?.gradientStops).toHaveLength(2);
  const shadow = shadowEffect('rgba(0, 0, 0, 0.2) 0px 4px 12px 0px');
  expect(shadow).toMatchObject({
    type: 'DROP_SHADOW',
    offset: { x: 0, y: 4 },
    radius: 12,
  });
});
it('rejects cyclic or incompatible scenes before creating nodes', async () => {
  const { api, nodes } = harness();
  const bad = structuredClone(request);
  bad.scene.payload.nodes[0]?.childNodeIds.push('scene:0');
  await expect(
    importLiveScene(api as unknown as PluginAPI, bad, new Map()),
  ).rejects.toThrow();
  expect(nodes).toHaveLength(0);
});
it('runs the packaged controller, deduplicates retries, and finalizes owned revisions', async () => {
  const { api, nodes } = harness();
  const userNode = new TestNode('FRAME', 'user:1');
  nodes.push(userNode);
  const responses: unknown[] = [];
  const ui: {
    onmessage?: (value: unknown) => void;
    postMessage: (value: unknown) => void;
  } = {
    postMessage: (value) => {
      responses.push(value);
    },
  };
  let html = '';
  const context = vm.createContext(
    {
      figma: {
        ...api,
        ui,
        showUI: (value: string) => {
          html = value;
        },
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  vm.runInContext(
    await readFile(new URL('../dist/plugin/code.js', import.meta.url), 'utf8'),
    context,
  );
  expect(html).toContain('Connect and import');
  ui.onmessage?.(request);
  ui.onmessage?.(request);
  await expect.poll(() => responses.length).toBe(2);
  expect((responses[0] as CandidateResponse).type).toBe('candidate-result');
  expect(nodes.filter((n) => n.type === 'TEXT' && !n.removed)).toHaveLength(1);

  ui.onmessage?.({ ...request, revision: 1 });
  await expect.poll(() => responses.length).toBe(3);
  ui.onmessage?.({
    protocolVersion: '1.2.0',
    runId: request.runId,
    type: 'finalize-request',
    selectedRevision: 0,
  });
  await expect.poll(() => responses.length).toBe(4);
  expect(Reflect.get(responses[3] as object, 'type')).toBe('finalize-result');
  const roots = nodes.filter(
    (node) => node.getPluginData('candidateRoot') === 'true',
  );
  expect(
    roots.find((node) => node.getPluginData('candidateRevision') === '0')
      ?.removed,
  ).toBe(false);
  expect(
    roots.find((node) => node.getPluginData('candidateRevision') === '1')
      ?.removed,
  ).toBe(true);
  expect(userNode.removed).toBe(false);
});
