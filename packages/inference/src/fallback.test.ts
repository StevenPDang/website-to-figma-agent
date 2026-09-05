import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveFallbackDecision } from './fallback.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:fallback',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: ['source:root', 'source:media', 'source:text'],
    assets: [
      {
        assetId: 'asset:media',
        sourceNodeId: 'source:media',
        kind: 'video',
        contentHash: 'hash',
      },
    ],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:media', 'ir:text'],
        kind: 'frame',
      },
      {
        nodeId: 'ir:media',
        sourceNodeId: 'source:media',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'image',
      },
      {
        nodeId: 'ir:text',
        sourceNodeId: 'source:text',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'text',
        text: 'Editable',
      },
    ],
  },
};
function fallback(
  sourceNodeId: string,
): Extract<AgenticInferenceDecision, { kind: 'fallback' }> {
  return {
    decisionId: `decision:${sourceNodeId}`,
    sourceNodeIds: [sourceNodeId],
    kind: 'fallback',
    confidence: 0.9,
    evidence: ['unsupported media'],
    fallback: 'independent-nodes',
    origin: 'agent',
    payload: { representation: 'raster', reason: 'Captured media frame' },
  };
}

describe('resolveFallbackDecision', () => {
  it('allows only the smallest eligible unsupported media root', () => {
    const media = resolveFallbackDecision(ir, fallback('source:media'));
    expect(media.ok).toBe(true);
    if (media.ok) {
      expect(media.fallback).toMatchObject({
        sourceNodeId: 'source:media',
        representation: 'raster',
      });
    }
    expect(resolveFallbackDecision(ir, fallback('source:text'))).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'FALLBACK_TARGET_NOT_ELIGIBLE',
      }),
    );
    expect(resolveFallbackDecision(ir, fallback('source:root'))).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});
