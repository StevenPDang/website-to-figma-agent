import { describe, expect, it } from 'vitest';
import { inferComponents } from './components.js';
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
    sourceNodeIds: ['dom:1', 'dom:2'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:1',
        sourceNodeId: 'dom:1',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'rectangle',
        styles: { 'background-color': 'rgb(1, 2, 3)' },
      },
      {
        nodeId: 'ir:2',
        sourceNodeId: 'dom:2',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'rectangle',
        styles: { 'background-color': 'rgb(1, 2, 3)' },
      },
    ],
  },
};

describe('inferComponents', () => {
  it('groups materially repeated structures with evidence', () => {
    const result = inferComponents(ir);
    expect(result.payload.decisions[0]).toMatchObject({
      kind: 'component',
      confidence: 0.9,
      sourceNodeIds: ['dom:1', 'dom:2'],
    });
  });
});
