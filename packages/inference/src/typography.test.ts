import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveTypographyDecision } from './typography.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:type',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 400, height: 300, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: ['source:text'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:text',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'text',
        text: 'Two lines of editable text',
        rect: { x: 0, y: 0, width: 180, height: 48 },
        styles: {
          'font-family': 'Unavailable Sans',
          'font-weight': '650',
          'font-style': 'italic',
          'line-height': '24px',
        },
      },
    ],
  },
};
const decision: Extract<AgenticInferenceDecision, { kind: 'typography' }> = {
  decisionId: 'decision:type',
  sourceNodeIds: ['source:text'],
  kind: 'typography',
  confidence: 0.9,
  evidence: ['captured two lines'],
  fallback: 'geometry',
  origin: 'agent',
  payload: {
    requestedFamily: 'Unavailable Sans',
    substituteFamily: 'Inter',
    weight: 650,
    style: 'italic',
    preserveLineCount: true,
  },
};

describe('resolveTypographyDecision', () => {
  it('selects the closest face and preserves captured line geometry with provenance', () => {
    const result = resolveTypographyDecision(ir, decision, [
      { family: 'Inter', weight: 400, style: 'normal' },
      { family: 'Inter', weight: 600, style: 'italic' },
      { family: 'Inter', weight: 700, style: 'italic' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.typography).toMatchObject({
        requestedFamily: 'Unavailable Sans',
        resolvedFamily: 'Inter',
        weight: 600,
        style: 'italic',
        expectedLineCount: 2,
        lineHeight: 24,
      });
  });

  it('fails closed when the requested substitute is unavailable', () => {
    expect(resolveTypographyDecision(ir, decision, [])).toEqual(
      expect.objectContaining({ ok: false, code: 'FONT_UNAVAILABLE' }),
    );
  });
});
