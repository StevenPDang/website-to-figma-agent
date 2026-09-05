import {
  INFERENCE_SCHEMA_VERSION,
  type AgenticInferenceDecision,
  type RejectedInferenceDecision,
  validateArtifact,
} from '@website-to-figma/contracts';

export interface ParsedAgentInferenceProposal {
  proposedDecisions: AgenticInferenceDecision[];
  rejectedDecisions: RejectedInferenceDecision[];
}

export function parseAgentInferenceProposal(
  input: unknown,
): ParsedAgentInferenceProposal {
  if (!isClosedProposal(input)) {
    return {
      proposedDecisions: [],
      rejectedDecisions: [
        {
          decisionId: 'decision:proposal-envelope',
          code: 'INVALID_PROPOSAL_SCHEMA',
          reason:
            'Proposal must be an object containing only a decisions array.',
        },
      ],
    };
  }

  const proposedDecisions: AgenticInferenceDecision[] = [];
  const rejectedDecisions: RejectedInferenceDecision[] = [];
  input.decisions.forEach((candidate, index) => {
    const decisionId = readDecisionId(candidate, index);
    const sourceNodeIds = collectReferencedSourceIds(candidate);
    const validation = validateArtifact({
      schemaVersion: INFERENCE_SCHEMA_VERSION,
      artifactKind: 'inference',
      runId: 'run:proposal-validation',
      sourceUrl: 'https://proposal-validation.invalid/',
      capturedAt: '1970-01-01T00:00:00.000Z',
      viewport: { width: 1, height: 1, deviceScaleFactor: 1 },
      payload: {
        sourceNodeIds,
        decisions: [candidate],
        deterministicDecisions: [],
        proposedDecisions: [candidate],
        rejectedDecisions: [],
        mergeOutcomes: [],
      },
    });
    if (
      validation.ok &&
      validation.value.schemaVersion === INFERENCE_SCHEMA_VERSION
    ) {
      const decision = validation.value.payload.proposedDecisions[0];
      if (decision !== undefined) proposedDecisions.push(decision);
      return;
    }
    rejectedDecisions.push({
      decisionId,
      code: 'INVALID_DECISION_SCHEMA',
      reason: validation.ok
        ? 'Decision is missing from the validated proposal.'
        : (validation.issues[0]?.message ??
          'Decision does not match its schema.'),
    });
  });
  return { proposedDecisions, rejectedDecisions };
}

function isClosedProposal(input: unknown): input is { decisions: unknown[] } {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 1 &&
    Array.isArray(Reflect.get(input, 'decisions'))
  );
}

function readDecisionId(candidate: unknown, index: number): string {
  if (typeof candidate === 'object' && candidate !== null) {
    const value = Reflect.get(candidate, 'decisionId');
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return `decision:proposal-${index}`;
}

function collectReferencedSourceIds(candidate: unknown): string[] {
  if (typeof candidate !== 'object' || candidate === null) return [];
  const values = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string') values.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') values.add(item);
      });
    }
  };
  add(Reflect.get(candidate, 'sourceNodeIds'));
  const payload = Reflect.get(candidate, 'payload');
  if (typeof payload === 'object' && payload !== null) {
    add(Reflect.get(payload, 'viewportSourceNodeId'));
    add(Reflect.get(payload, 'panelSourceNodeIds'));
    add(Reflect.get(payload, 'cloneSourceNodeIds'));
    add(Reflect.get(payload, 'instanceSourceNodeIds'));
    add(Reflect.get(payload, 'overrideSourceNodeIds'));
  }
  return [...values];
}
