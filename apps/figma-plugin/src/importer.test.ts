import { describe, expect, it } from 'vitest';
import type { FigmaSceneArtifact } from '@website-to-figma/contracts';
import { createMemoryFigmaAdapter } from './figma-adapter.js';
import { importScene } from './importer.js';

const scene: FigmaSceneArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'figma-scene',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    sourceNodeIds: ['dom:0', 'dom:0.0'],
    rootNodeIds: ['scene:0'],
    assets: [],
    nodes: [
      {
        sceneNodeId: 'scene:0.0',
        sourceNodeId: 'dom:0.0',
        parentNodeId: 'scene:0',
        childNodeIds: [],
        kind: 'text',
        name: 'Child',
        text: 'Hi',
      },
      {
        sceneNodeId: 'scene:0',
        sourceNodeId: 'dom:0',
        parentNodeId: null,
        childNodeIds: ['scene:0.0'],
        kind: 'frame',
        name: 'Root',
      },
    ],
  },
};

describe('importScene', () => {
  it('validates, orders parents first, and is idempotent on replay', () => {
    const adapter = createMemoryFigmaAdapter();
    importScene(scene, adapter);
    importScene(scene, adapter);
    expect(adapter.nodes().map((node) => node.sceneNodeId)).toEqual([
      'scene:0',
      'scene:0.0',
    ]);
    expect(adapter.nodes()).toHaveLength(2);
  });
});
