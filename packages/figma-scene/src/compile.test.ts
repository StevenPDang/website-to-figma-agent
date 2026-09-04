import { describe, expect, it } from 'vitest';
import { compileScene } from './compile.js';
import type { WebsiteIrArtifact } from '@website-to-figma/contracts';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:0',
    sourceNodeIds: ['dom:0'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:0',
        sourceNodeId: 'dom:0',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
    ],
  },
};

describe('compileScene', () => {
  it('creates deterministic editable scene nodes with source links', () => {
    const scene = compileScene(ir);
    expect(scene.payload.rootNodeIds).toEqual(['scene:0']);
    expect(scene.payload.nodes[0]).toMatchObject({
      sceneNodeId: 'scene:0',
      sourceNodeId: 'dom:0',
      kind: 'text',
      text: 'Hello',
    });
  });
});
