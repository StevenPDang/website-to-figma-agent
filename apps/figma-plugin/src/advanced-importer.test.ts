import { describe, expect, it } from 'vitest';
import { createMemoryFigmaAdapter } from './figma-adapter.js';
import { importAdvancedScene } from './advanced-importer.js';
import type { FigmaSceneArtifact } from '@website-to-figma/contracts';

const scene: FigmaSceneArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'figma-scene',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
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
        kind: 'text',
        name: 'Text',
        text: 'Hello',
        styles: { 'font-family': 'Missing Font' },
      },
    ],
  },
};

describe('importAdvancedScene', () => {
  it('reports deterministic font substitutions as partial diagnostics', () => {
    const result = importAdvancedScene(scene, createMemoryFigmaAdapter());
    expect(result.payload.status).toBe('partial');
    expect(result.payload.diagnostics[0]).toMatchObject({
      code: 'FONT_SUBSTITUTED',
      sourceNodeId: 'dom:0',
    });
  });
});
