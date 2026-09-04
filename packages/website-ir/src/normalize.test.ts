import { describe, expect, it } from 'vitest';
import { normalizeRawCapture } from './normalize.js';
import type { RawCaptureArtifact } from '@website-to-figma/contracts';

const raw: RawCaptureArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'raw-capture',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'dom:0',
    assets: [],
    nodes: [
      {
        sourceNodeId: 'dom:0',
        parentSourceNodeId: null,
        childSourceNodeIds: ['dom:0.0'],
        kind: 'element',
        tagName: 'main',
        rect: { x: 0, y: 0, width: 800, height: 600 },
        visible: true,
      },
      {
        sourceNodeId: 'dom:0.0',
        parentSourceNodeId: 'dom:0',
        childSourceNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
    ],
  },
};

describe('normalizeRawCapture', () => {
  it('normalizes hierarchy and preserves source traceability', () => {
    const ir = normalizeRawCapture(raw);
    expect(ir.payload.nodes[0]).toMatchObject({
      nodeId: 'ir:0',
      sourceNodeId: 'dom:0',
      kind: 'frame',
    });
    expect(ir.payload.nodes[1]).toMatchObject({
      nodeId: 'ir:0.0',
      kind: 'text',
      text: 'Hello',
    });
    expect(ir.payload.nodes[0]?.childNodeIds).toEqual(['ir:0.0']);
  });
});
