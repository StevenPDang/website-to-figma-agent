import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveComponentDecision } from './agent-components.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:components',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 600, height: 400, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: [
      'source:root',
      'source:a',
      'source:a-text',
      'source:b',
      'source:b-text',
    ],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:a', 'ir:b'],
        kind: 'frame',
      },
      {
        nodeId: 'ir:a',
        sourceNodeId: 'source:a',
        parentNodeId: 'ir:root',
        childNodeIds: ['ir:a-text'],
        kind: 'frame',
      },
      {
        nodeId: 'ir:a-text',
        sourceNodeId: 'source:a-text',
        parentNodeId: 'ir:a',
        childNodeIds: [],
        kind: 'text',
        text: 'Alpha',
      },
      {
        nodeId: 'ir:b',
        sourceNodeId: 'source:b',
        parentNodeId: 'ir:root',
        childNodeIds: ['ir:b-text'],
        kind: 'frame',
      },
      {
        nodeId: 'ir:b-text',
        sourceNodeId: 'source:b-text',
        parentNodeId: 'ir:b',
        childNodeIds: [],
        kind: 'text',
        text: 'Beta',
      },
    ],
  },
};

function component(
  overrides: string[],
): Extract<AgenticInferenceDecision, { kind: 'component' }> {
  return {
    decisionId: 'decision:cards',
    sourceNodeIds: ['source:a', 'source:b'],
    kind: 'component',
    confidence: 0.9,
    evidence: ['matching card hierarchy'],
    fallback: 'independent-nodes',
    origin: 'agent',
    payload: {
      name: 'Project Card',
      instanceSourceNodeIds: ['source:a', 'source:b'],
      overrideSourceNodeIds: overrides,
    },
  };
}

describe('resolveComponentDecision', () => {
  it('preserves meaningful instance differences as declared overrides', () => {
    const result = resolveComponentDecision(ir, component(['source:b-text']));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.component).toMatchObject({
        componentSourceNodeId: 'source:a',
        instanceSourceNodeIds: ['source:a', 'source:b'],
      });
    }
  });

  it('rejects incomplete overrides and structural mismatches', () => {
    expect(resolveComponentDecision(ir, component([]))).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'COMPONENT_OVERRIDES_INCOMPLETE',
      }),
    );
    const mismatch = structuredClone(ir);
    const secondRoot = mismatch.payload.nodes[3];
    if (secondRoot === undefined) throw new Error('Missing component fixture.');
    secondRoot.kind = 'rectangle';
    expect(
      resolveComponentDecision(mismatch, component(['source:b-text'])),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'COMPONENT_STRUCTURE_MISMATCH',
      }),
    );
  });
});
