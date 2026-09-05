import type {
  AgenticInferenceArtifact,
  Diagnostic,
} from '@website-to-figma/contracts';
import {
  rankQaCandidates,
  type QaCandidate,
} from '@website-to-figma/visual-qa';

import type { AgentInferenceRequest, InferenceUsage } from './provider.js';

export type CorrectionStopReason =
  | 'automated-pass'
  | 'no-improvement'
  | 'provider-failure'
  | 'invalid-output'
  | 'budget-exhausted'
  | 'render-limit';

export interface CorrectionPassRecord {
  revision: number;
  stage: 'baseline' | 'correction';
  inference: AgenticInferenceArtifact;
  qa: QaCandidate;
  diagnostics: Diagnostic[];
  request?: AgentInferenceRequest;
  usage?: InferenceUsage;
}

export interface CandidateHistory {
  passes: CorrectionPassRecord[];
  failedAttempt?: {
    revision: number;
    request?: AgentInferenceRequest;
    diagnostics: Diagnostic[];
    usage?: InferenceUsage;
  };
  selectedRevision?: number;
  stopReason?: CorrectionStopReason;
}

export function appendCandidateHistory(
  history: CandidateHistory,
  record: CorrectionPassRecord,
): CandidateHistory {
  if (
    record.revision !== history.passes.length ||
    history.passes.some((item) => item.revision === record.revision)
  )
    throw new Error('Candidate revisions must be unique and monotonic.');
  return { ...history, passes: [...history.passes, structuredClone(record)] };
}

export function selectBestCandidateRevision(
  history: CandidateHistory,
): number | undefined {
  return rankQaCandidates(history.passes.map((item) => item.qa))[0]?.revision;
}

export function finishCandidateHistory(
  history: CandidateHistory,
  stopReason: CorrectionStopReason,
): CandidateHistory {
  const selectedRevision = selectBestCandidateRevision(history);
  return {
    ...history,
    ...(selectedRevision === undefined ? {} : { selectedRevision }),
    stopReason,
  };
}
