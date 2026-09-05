import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { validateProposalPolicy } from './proposal-policy.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 1000, height: 800, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: [
      'source:root',
      'source:text',
      'source:card',
      'source:clone',
    ],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:text', 'ir:card', 'ir:clone'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 1000, height: 800 },
      },
      {
        nodeId: 'ir:text',
        sourceNodeId: 'source:text',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
      {
        nodeId: 'ir:card',
        sourceNodeId: 'source:card',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        nodeId: 'ir:clone',
        sourceNodeId: 'source:clone',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'frame',
        rect: { x: 220, y: 0, width: 210, height: 100 },
      },
    ],
  },
};

function decision(
  overrides: Partial<AgenticInferenceDecision> = {},
): AgenticInferenceDecision {
  return {
    decisionId: 'decision:name',
    sourceNodeIds: ['source:card'],
    kind: 'semantic-name',
    confidence: 0.9,
    evidence: ['visual grouping'],
    fallback: 'geometry',
    origin: 'agent',
    payload: { name: 'Card' },
    ...overrides,
  } as AgenticInferenceDecision;
}

describe('validateProposalPolicy', () => {
  it.each([
    [decision({ sourceNodeIds: ['source:missing'] }), 'UNKNOWN_SOURCE_NODE'],
    [
      decision({
        kind: 'layout',
        payload: { mode: 'vertical', gap: 3000 },
      }),
      'GEOMETRY_OUT_OF_BOUNDS',
    ],
    [
      decision({
        sourceNodeIds: ['source:text'],
        kind: 'fallback',
        payload: { representation: 'raster', reason: 'easier' },
      }),
      'FORBIDDEN_RASTERIZATION',
    ],
    [
      decision({
        sourceNodeIds: ['source:root'],
        kind: 'fallback',
        payload: { representation: 'raster', reason: 'large' },
      }),
      'FORBIDDEN_RASTERIZATION',
    ],
  ])('rejects unsafe proposal decisions independently', (candidate, code) => {
    const result = validateProposalPolicy({ decisions: [candidate] }, ir, {
      maxDecisions: 5,
    });
    expect(result.acceptedDecisions).toEqual([]);
    expect(result.rejectedDecisions[0]?.code).toBe(code);
  });

  it('rejects unproven carousel clones and accepts fingerprint matches', () => {
    const carousel = decision({
      decisionId: 'decision:carousel',
      sourceNodeIds: ['source:root'],
      kind: 'carousel',
      payload: {
        viewportSourceNodeId: 'source:root',
        panelSourceNodeIds: ['source:card'],
        cloneSourceNodeIds: ['source:clone'],
        clipContent: true,
      },
    });
    const rejected = validateProposalPolicy({ decisions: [carousel] }, ir, {
      maxDecisions: 5,
    });
    expect(rejected.rejectedDecisions[0]?.code).toBe('UNPROVEN_CAROUSEL_CLONE');

    const matching = structuredClone(ir);
    const card = matching.payload.nodes[2];
    if (card === undefined) throw new Error('Missing card fixture.');
    matching.payload.nodes[3] = {
      ...card,
      nodeId: 'ir:clone',
      sourceNodeId: 'source:clone',
    };
    expect(
      validateProposalPolicy({ decisions: [carousel] }, matching, {
        maxDecisions: 5,
      }).acceptedDecisions,
    ).toEqual([carousel]);
  });

  it('rejects decisions beyond the run budget and nodes in cyclic hierarchy', () => {
    const cyclic = structuredClone(ir);
    const cyclicRoot = cyclic.payload.nodes[0];
    const cyclicCard = cyclic.payload.nodes[2];
    if (cyclicRoot === undefined || cyclicCard === undefined) {
      throw new Error('Missing cyclic hierarchy fixtures.');
    }
    cyclicRoot.parentNodeId = 'ir:card';
    cyclicCard.childNodeIds = ['ir:root'];
    const result = validateProposalPolicy(
      {
        decisions: [
          decision(),
          decision({
            decisionId: 'decision:second',
            sourceNodeIds: ['source:text'],
          }),
        ],
      },
      cyclic,
      { maxDecisions: 1 },
    );
    expect(result.rejectedDecisions.map((item) => item.code)).toEqual([
      'HIERARCHY_CYCLE',
      'BUDGET_EXCEEDED',
    ]);
  });
});
