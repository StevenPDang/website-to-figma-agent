import { describe, expect, it } from 'vitest';

import { parseAgentInferenceProposal } from './proposal.js';

const validDecision = {
  decisionId: 'decision:name',
  sourceNodeIds: ['source:root'],
  kind: 'semantic-name',
  confidence: 0.9,
  evidence: ['Visible heading'],
  fallback: 'geometry',
  origin: 'agent',
  payload: { name: 'Hero' },
} as const;

describe('parseAgentInferenceProposal', () => {
  it('keeps valid siblings when another decision has unknown properties', () => {
    const result = parseAgentInferenceProposal({
      decisions: [
        validDecision,
        { ...validDecision, decisionId: 'decision:bad', command: 'rm -rf /' },
      ],
    });

    expect(result.proposedDecisions).toEqual([validDecision]);
    expect(result.rejectedDecisions).toEqual([
      expect.objectContaining({
        decisionId: 'decision:bad',
        code: 'INVALID_DECISION_SCHEMA',
      }),
    ]);
  });

  it('rejects an unclosed proposal envelope', () => {
    const result = parseAgentInferenceProposal({
      decisions: [],
      provider: 'specific',
    });
    expect(result.rejectedDecisions[0]?.code).toBe('INVALID_PROPOSAL_SCHEMA');
  });
});
