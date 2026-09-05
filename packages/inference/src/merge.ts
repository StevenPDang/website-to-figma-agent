import {
  INFERENCE_SCHEMA_VERSION,
  type AgenticInferenceArtifact,
  type AgenticInferenceDecision,
  type InferenceArtifact,
  type InferenceDecision,
  type InferenceMergeOutcome,
  validateArtifact,
  type WebsiteIrArtifact,
} from '@website-to-figma/contracts';

import { parseAgentInferenceProposal } from './proposal.js';
import {
  validateProposalPolicy,
  type ProposalPolicyOptions,
} from './proposal-policy.js';

export function mergeAgentInference(
  ir: WebsiteIrArtifact,
  deterministic: InferenceArtifact,
  proposal: unknown,
  options: ProposalPolicyOptions,
): AgenticInferenceArtifact {
  if (ir.runId !== deterministic.runId) {
    throw new Error(
      'Website IR and deterministic inference run IDs must match.',
    );
  }
  const deterministicDecisions = readDeterministicDecisions(deterministic);
  const parsed = parseAgentInferenceProposal(proposal);
  const policy = validateProposalPolicy(
    { decisions: parsed.proposedDecisions },
    ir,
    options,
  );
  const deterministicIds = new Set(
    deterministicDecisions.map((decision) => decision.decisionId),
  );
  const collisionRejections = policy.acceptedDecisions
    .filter((decision) => deterministicIds.has(decision.decisionId))
    .map((decision) => ({
      decisionId: decision.decisionId,
      code: 'DUPLICATE_DECISION_ID',
      reason: 'Agent decision ID conflicts with a deterministic decision.',
    }));
  const collisionFreeDecisions = policy.acceptedDecisions.filter(
    (decision) => !deterministicIds.has(decision.decisionId),
  );
  const selection = selectAgentWinners(collisionFreeDecisions);
  const acceptedDecisions = selection.winners;
  const rejectedDecisions = deduplicateRejections([
    ...parsed.rejectedDecisions,
    ...policy.rejectedDecisions,
    ...collisionRejections,
    ...selection.rejections,
  ]);
  const acceptedKeys = new Map(
    acceptedDecisions.map((decision) => [conflictKey(decision), decision]),
  );
  const rejectedKeys = new Set(
    policy.proposedDecisions
      .filter((decision) =>
        rejectedDecisions.some(
          (rejection) => rejection.decisionId === decision.decisionId,
        ),
      )
      .map(conflictKey),
  );
  const superseded = new Map<string, InferenceDecision>();
  deterministicDecisions.forEach((decision) => {
    const replacement = acceptedKeys.get(conflictKey(decision));
    if (replacement !== undefined)
      superseded.set(replacement.decisionId, decision);
  });
  const decisions = [
    ...deterministicDecisions.filter(
      (decision) => !acceptedKeys.has(conflictKey(decision)),
    ),
    ...acceptedDecisions,
  ];
  const artifact: AgenticInferenceArtifact = {
    schemaVersion: INFERENCE_SCHEMA_VERSION,
    artifactKind: 'inference',
    runId: ir.runId,
    sourceUrl: ir.sourceUrl,
    capturedAt: ir.capturedAt,
    viewport: ir.viewport,
    payload: {
      sourceNodeIds: [...ir.payload.sourceNodeIds],
      decisions,
      deterministicDecisions,
      proposedDecisions: policy.proposedDecisions,
      rejectedDecisions,
      mergeOutcomes: [
        ...deterministicDecisions.map((decision) => {
          const status: InferenceMergeOutcome['status'] =
            acceptedKeys.has(conflictKey(decision)) ||
            rejectedKeys.has(conflictKey(decision))
              ? 'fallback'
              : 'accepted';
          return { decisionId: decision.decisionId, status };
        }),
        ...acceptedDecisions.map((decision) => {
          const replaced = superseded.get(decision.decisionId);
          return {
            decisionId: decision.decisionId,
            status: 'accepted' as const,
            ...(replaced === undefined
              ? {}
              : { supersedesDecisionId: replaced.decisionId }),
          };
        }),
        ...rejectedDecisions.map((decision) => ({
          decisionId: decision.decisionId,
          status: 'rejected' as const,
        })),
      ],
    },
  };
  const validation = validateArtifact(artifact);
  if (!validation.ok) {
    throw new Error(
      `Merged inference artifact is invalid: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`,
    );
  }
  return artifact;
}

function selectAgentWinners(decisions: AgenticInferenceDecision[]): {
  winners: AgenticInferenceDecision[];
  rejections: Array<{ decisionId: string; code: string; reason: string }>;
} {
  const winnersByKey = new Map<string, AgenticInferenceDecision>();
  decisions.forEach((candidate) => {
    const key = conflictKey(candidate);
    const current = winnersByKey.get(key);
    if (
      current === undefined ||
      candidate.confidence > current.confidence ||
      (candidate.confidence === current.confidence &&
        candidate.decisionId.localeCompare(current.decisionId) < 0)
    ) {
      winnersByKey.set(key, candidate);
    }
  });
  const winnerIds = new Set(
    [...winnersByKey.values()].map((decision) => decision.decisionId),
  );
  return {
    winners: decisions.filter((decision) => winnerIds.has(decision.decisionId)),
    rejections: decisions
      .filter((decision) => !winnerIds.has(decision.decisionId))
      .map((decision) => ({
        decisionId: decision.decisionId,
        code: 'AGENT_DECISION_CONFLICT',
        reason:
          'A higher-confidence agent decision targets the same property and source node.',
      })),
  };
}

function deduplicateRejections<T extends { decisionId: string }>(
  rejections: T[],
): T[] {
  const seen = new Set<string>();
  return rejections.filter((rejection) => {
    if (seen.has(rejection.decisionId)) return false;
    seen.add(rejection.decisionId);
    return true;
  });
}

function readDeterministicDecisions(
  artifact: InferenceArtifact,
): InferenceDecision[] {
  return structuredClone(
    artifact.schemaVersion === '1.0.0'
      ? artifact.payload.decisions
      : artifact.payload.deterministicDecisions,
  );
}

function conflictKey(
  decision: InferenceDecision | AgenticInferenceDecision,
): string {
  return `${decision.kind}:${decision.sourceNodeIds[0] ?? ''}`;
}
