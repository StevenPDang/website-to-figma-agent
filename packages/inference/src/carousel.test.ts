import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveCarouselDecision } from './carousel.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:carousel',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 600, height: 300, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:viewport',
    sourceNodeIds: ['source:viewport', 'source:a', 'source:b', 'source:clone'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:viewport',
        sourceNodeId: 'source:viewport',
        parentNodeId: null,
        childNodeIds: ['ir:a', 'ir:b', 'ir:clone'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 600, height: 300 },
      },
      {
        nodeId: 'ir:a',
        sourceNodeId: 'source:a',
        parentNodeId: 'ir:viewport',
        childNodeIds: [],
        kind: 'frame',
        text: 'A',
        rect: { x: 0, y: 0, width: 200, height: 300 },
      },
      {
        nodeId: 'ir:b',
        sourceNodeId: 'source:b',
        parentNodeId: 'ir:viewport',
        childNodeIds: [],
        kind: 'frame',
        text: 'B',
        rect: { x: 200, y: 0, width: 200, height: 300 },
      },
      {
        nodeId: 'ir:clone',
        sourceNodeId: 'source:clone',
        parentNodeId: 'ir:viewport',
        childNodeIds: [],
        kind: 'frame',
        text: 'A',
        rect: { x: 400, y: 0, width: 200, height: 300 },
      },
    ],
  },
};

const carousel: Extract<AgenticInferenceDecision, { kind: 'carousel' }> = {
  decisionId: 'decision:carousel',
  sourceNodeIds: ['source:viewport'],
  kind: 'carousel',
  confidence: 0.95,
  evidence: ['repeated panel fingerprint'],
  fallback: 'independent-nodes',
  origin: 'agent',
  payload: {
    viewportSourceNodeId: 'source:viewport',
    panelSourceNodeIds: ['source:a', 'source:b'],
    cloneSourceNodeIds: ['source:clone'],
    clipContent: true,
  },
};

describe('resolveCarouselDecision', () => {
  it('keeps ordered editable panels and suppresses only proven clones', () => {
    const result = resolveCarouselDecision(ir, carousel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.carousel).toMatchObject({
        panelSourceNodeIds: ['source:a', 'source:b'],
        suppressedCloneSourceNodeIds: ['source:clone'],
        clipContent: true,
      });
    }
  });

  it('rejects suppression of unique content', () => {
    const unique = structuredClone(ir);
    const clone = unique.payload.nodes[3];
    if (clone === undefined) throw new Error('Missing carousel clone fixture.');
    clone.text = 'Unique';
    expect(resolveCarouselDecision(unique, carousel)).toEqual(
      expect.objectContaining({ ok: false, code: 'CAROUSEL_CLONE_NOT_PROVEN' }),
    );
  });
});
