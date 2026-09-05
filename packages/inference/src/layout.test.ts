import { describe, expect, it } from 'vitest';
import { inferLayout } from './layout.js';
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
    sourceNodeIds: ['dom:0', 'dom:0.0'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:0',
        sourceNodeId: 'dom:0',
        parentNodeId: null,
        childNodeIds: ['ir:0.0'],
        kind: 'frame',
        styles: { display: 'flex', 'flex-direction': 'column' },
      },
      {
        nodeId: 'ir:0.0',
        sourceNodeId: 'dom:0.0',
        parentNodeId: 'ir:0',
        childNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
    ],
  },
};

describe('inferLayout', () => {
  it('emits evidence-backed layout and section decisions', () => {
    const result = inferLayout(ir);
    expect(result.payload.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'layout',
          confidence: 0.95,
          fallback: 'independent-nodes',
        }),
        expect.objectContaining({ kind: 'section', fallback: 'geometry' }),
      ]),
    );
  });
});

it.each(['grid', 'inline-grid', 'inline-flex', 'block', ''])(
  'preserves evidence and fallback for %s containers',
  (display) => {
    const input = structuredClone(ir);
    const root = input.payload.nodes[0];
    if (!root) throw new Error('fixture');
    root.styles = { display };
    const layout = inferLayout(input).payload.decisions.find(
      (d) => d.kind === 'layout',
    );
    expect(layout?.fallback).toBe(
      ['grid', 'inline-grid', 'inline-flex'].includes(display)
        ? 'independent-nodes'
        : 'geometry',
    );
    expect(layout?.evidence).toContain(`display=${display || 'unknown'}`);
  },
);
