import type {
  InferenceArtifact,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { mergeAgentInference } from './merge.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: ['source:root', 'source:text'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:text'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 800, height: 600 },
      },
      {
        nodeId: 'ir:text',
        sourceNodeId: 'source:text',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
    ],
  },
};
const deterministic: InferenceArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'inference',
  runId: ir.runId,
  sourceUrl: ir.sourceUrl,
  capturedAt: ir.capturedAt,
  viewport: ir.viewport,
  payload: {
    sourceNodeIds: ir.payload.sourceNodeIds,
    decisions: [
      {
        decisionId: 'decision:layout:root',
        sourceNodeIds: ['source:root'],
        kind: 'layout',
        confidence: 0.6,
        evidence: ['geometry'],
        fallback: 'geometry',
      },
      {
        decisionId: 'decision:section:root',
        sourceNodeIds: ['source:root'],
        kind: 'section',
        confidence: 0.8,
        evidence: ['root'],
        fallback: 'geometry',
      },
    ],
  },
};

describe('mergeAgentInference', () => {
  it('rejects artifacts from another run', () => {
    expect(() =>
      mergeAgentInference(
        ir,
        { ...deterministic, runId: 'run:other' },
        { decisions: [] },
        { maxDecisions: 5 },
      ),
    ).toThrow('run IDs must match');
  });

  it('merges valid decisions per kind and falls invalid siblings back independently', () => {
    const result = mergeAgentInference(
      ir,
      deterministic,
      {
        decisions: [
          {
            decisionId: 'decision:agent-layout',
            sourceNodeIds: ['source:root'],
            kind: 'layout',
            confidence: 0.95,
            evidence: ['aligned children'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { mode: 'vertical', gap: 20 },
          },
          {
            decisionId: 'decision:raster-text',
            sourceNodeIds: ['source:text'],
            kind: 'fallback',
            confidence: 0.5,
            evidence: ['complex'],
            fallback: 'independent-nodes',
            origin: 'agent',
            payload: { representation: 'raster', reason: 'complex' },
          },
        ],
      },
      { maxDecisions: 5 },
    );

    expect(result.payload.decisions.map((item) => item.decisionId)).toEqual([
      'decision:section:root',
      'decision:agent-layout',
    ]);
    expect(result.payload.rejectedDecisions[0]?.code).toBe(
      'FORBIDDEN_RASTERIZATION',
    );
    expect(result.payload.mergeOutcomes).toEqual(
      expect.arrayContaining([
        {
          decisionId: 'decision:agent-layout',
          status: 'accepted',
          supersedesDecisionId: 'decision:layout:root',
        },
        { decisionId: 'decision:raster-text', status: 'rejected' },
      ]),
    );
  });

  it('is deterministic for the same inputs and falls back on an invalid envelope', () => {
    const proposal = { decisions: [], provider: 'leak' };
    const first = mergeAgentInference(ir, deterministic, proposal, {
      maxDecisions: 5,
    });
    const second = mergeAgentInference(ir, deterministic, proposal, {
      maxDecisions: 5,
    });
    expect(first).toEqual(second);
    expect(first.payload.decisions).toEqual(deterministic.payload.decisions);
    expect(first.payload.rejectedDecisions[0]?.code).toBe(
      'INVALID_PROPOSAL_SCHEMA',
    );
  });

  it('selects one agent winner per property by confidence', () => {
    const result = mergeAgentInference(
      ir,
      deterministic,
      {
        decisions: [
          {
            decisionId: 'decision:name-low',
            sourceNodeIds: ['source:text'],
            kind: 'semantic-name',
            confidence: 0.6,
            evidence: ['possible label'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { name: 'Label' },
          },
          {
            decisionId: 'decision:name-high',
            sourceNodeIds: ['source:text'],
            kind: 'semantic-name',
            confidence: 0.9,
            evidence: ['visible heading'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { name: 'Heading' },
          },
        ],
      },
      { maxDecisions: 5 },
    );

    const decisionIds = result.payload.decisions.map((item) => item.decisionId);
    expect(decisionIds).toContain('decision:name-high');
    expect(decisionIds).not.toContain('decision:name-low');
    expect(result.payload.rejectedDecisions).toContainEqual(
      expect.objectContaining({
        decisionId: 'decision:name-low',
        code: 'AGENT_DECISION_CONFLICT',
      }),
    );
  });

  it('uses decision ID as the stable tie breaker and rejects ID collisions', () => {
    const result = mergeAgentInference(
      ir,
      deterministic,
      {
        decisions: [
          {
            decisionId: 'decision:z-name',
            sourceNodeIds: ['source:text'],
            kind: 'semantic-name',
            confidence: 0.8,
            evidence: ['candidate'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { name: 'Zed' },
          },
          {
            decisionId: 'decision:a-name',
            sourceNodeIds: ['source:text'],
            kind: 'semantic-name',
            confidence: 0.8,
            evidence: ['candidate'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { name: 'Alpha' },
          },
          {
            decisionId: 'decision:layout:root',
            sourceNodeIds: ['source:text'],
            kind: 'semantic-name',
            confidence: 0.9,
            evidence: ['collision'],
            fallback: 'geometry',
            origin: 'agent',
            payload: { name: 'Collision' },
          },
        ],
      },
      { maxDecisions: 5 },
    );
    expect(result.payload.decisions.map((item) => item.decisionId)).toContain(
      'decision:a-name',
    );
    expect(result.payload.rejectedDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionId: 'decision:z-name',
          code: 'AGENT_DECISION_CONFLICT',
        }),
        expect.objectContaining({
          decisionId: 'decision:layout:root',
          code: 'DUPLICATE_DECISION_ID',
        }),
      ]),
    );
  });

  it('reads deterministic decisions from an enriched artifact', () => {
    const enriched = mergeAgentInference(
      ir,
      deterministic,
      { decisions: [] },
      { maxDecisions: 5 },
    );
    const repeated = mergeAgentInference(
      ir,
      enriched,
      { decisions: [] },
      { maxDecisions: 5 },
    );
    expect(repeated.payload.deterministicDecisions).toEqual(
      deterministic.payload.decisions,
    );
  });
});
