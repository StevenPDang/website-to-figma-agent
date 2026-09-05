import type {
  AgenticInferenceArtifact,
  Diagnostic,
} from '@website-to-figma/contracts';
import {
  rankQaCandidates,
  type QaCandidate,
} from '@website-to-figma/visual-qa';

import {
  appendCandidateHistory,
  finishCandidateHistory,
  type CandidateHistory,
  type CorrectionPassRecord,
  type CorrectionStopReason,
} from './candidate-history.js';
import type {
  AgentInferenceProposal,
  AgentInferenceRequest,
  InferenceProvider,
} from './provider.js';

export interface CandidateEvaluation {
  qa: QaCandidate;
  diagnostics?: Diagnostic[];
}

export interface CorrectionLoopOptions {
  provider: InferenceProvider;
  baselineInference: AgenticInferenceArtifact;
  renderCandidate(
    inference: AgenticInferenceArtifact,
    revision: number,
  ): Promise<CandidateEvaluation>;
  buildRequest(
    revision: number,
    history: CandidateHistory,
  ): AgentInferenceRequest;
  mergeProposal(
    proposal: AgentInferenceProposal,
    previous: AgenticInferenceArtifact,
  ): AgenticInferenceArtifact;
  maxRenders?: number;
  isPassing?: (candidate: QaCandidate) => boolean;
  budgetExhausted?: (history: CandidateHistory) => boolean;
}

export interface CorrectionLoopResult {
  history: CandidateHistory;
  selected: CorrectionPassRecord;
}

export async function runCorrectionLoop(
  options: CorrectionLoopOptions,
): Promise<CorrectionLoopResult> {
  const maxRenders = options.maxRenders ?? 3;
  if (!Number.isInteger(maxRenders) || maxRenders < 1 || maxRenders > 3)
    throw new Error('Correction loop allows between one and three renders.');
  const isPassing =
    options.isPassing ??
    ((candidate: QaCandidate) =>
      candidate.editabilityViolations === 0 &&
      candidate.classifications.every(
        (item) => item.category === 'rendering-noise',
      ) &&
      candidate.report.payload.metrics.ssim >= 0.95);
  let history: CandidateHistory = { passes: [] };
  let inference = options.baselineInference;
  for (let revision = 0; revision < maxRenders; revision += 1) {
    let request: AgentInferenceRequest | undefined;
    let usage: CorrectionPassRecord['usage'];
    const providerDiagnostics: Diagnostic[] = [];
    if (revision > 0) {
      if (options.budgetExhausted?.(history) === true)
        return finish(history, 'budget-exhausted');
      request = options.buildRequest(revision, history);
      const result = await options.provider.infer(request);
      if (!result.ok) {
        providerDiagnostics.push(result.diagnostic);
        history = {
          ...history,
          failedAttempt: {
            revision,
            request,
            diagnostics: providerDiagnostics,
          },
        };
        return finish(history, 'provider-failure');
      }
      usage = result.usage;
      if (result.diagnostic !== undefined)
        providerDiagnostics.push(result.diagnostic);
      try {
        inference = options.mergeProposal(result.proposal, inference);
      } catch {
        history = {
          ...history,
          failedAttempt: {
            revision,
            request,
            diagnostics: [
              ...providerDiagnostics,
              {
                code: 'CORRECTION_PROPOSAL_INVALID',
                severity: 'error',
                message: 'Correction proposal could not be merged.',
              },
            ],
            ...(usage === undefined ? {} : { usage }),
          },
        };
        return finish(history, 'invalid-output');
      }
    }
    let evaluation: CandidateEvaluation;
    try {
      evaluation = await options.renderCandidate(inference, revision);
    } catch (error) {
      if (history.passes.length === 0) throw error;
      history = {
        ...history,
        failedAttempt: {
          revision,
          ...(request === undefined ? {} : { request }),
          diagnostics: [
            ...providerDiagnostics,
            {
              code: 'CANDIDATE_RENDER_FAILED',
              severity: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Candidate render failed.',
            },
          ],
          ...(usage === undefined ? {} : { usage }),
        },
      };
      return finish(history, 'invalid-output');
    }
    if (evaluation.qa.revision !== revision)
      throw new Error(
        'QA candidate revision does not match the render revision.',
      );
    const record: CorrectionPassRecord = {
      revision,
      stage: revision === 0 ? 'baseline' : 'correction',
      inference,
      qa: evaluation.qa,
      diagnostics: [...providerDiagnostics, ...(evaluation.diagnostics ?? [])],
      ...(request === undefined ? {} : { request }),
      ...(usage === undefined ? {} : { usage }),
    };
    const previousBest = rankQaCandidates(
      history.passes.map((item) => item.qa),
    )[0];
    history = appendCandidateHistory(history, record);
    if (isPassing(evaluation.qa)) return finish(history, 'automated-pass');
    if (
      previousBest !== undefined &&
      rankQaCandidates([previousBest, evaluation.qa])[0]?.revision ===
        previousBest.revision
    )
      return finish(history, 'no-improvement');
  }
  return finish(history, 'render-limit');
}

function finish(
  history: CandidateHistory,
  reason: CorrectionStopReason,
): CorrectionLoopResult {
  const finished = finishCandidateHistory(history, reason);
  const selected = finished.passes.find(
    (item) => item.revision === finished.selectedRevision,
  );
  if (selected === undefined)
    throw new Error('Correction loop has no completed candidate.');
  return { history: finished, selected };
}
