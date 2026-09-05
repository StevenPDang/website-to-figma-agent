import type {
  AgenticInferenceArtifact,
  QaReportArtifact,
} from '@website-to-figma/contracts';
import type { QaCandidate } from '@website-to-figma/visual-qa';
import { describe, expect, it } from 'vitest';

import {
  appendCandidateHistory,
  finishCandidateHistory,
} from './candidate-history.js';

const inference = {
  schemaVersion: '1.1.0',
  artifactKind: 'inference',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00Z',
  viewport: { width: 100, height: 100, deviceScaleFactor: 1 },
  payload: {
    sourceNodeIds: ['source:root'],
    decisions: [],
    deterministicDecisions: [],
    proposedDecisions: [],
    rejectedDecisions: [],
    mergeOutcomes: [],
  },
} satisfies AgenticInferenceArtifact;

function qa(revision: number, ssim: number): QaCandidate {
  return {
    revision,
    report: {
      schemaVersion: '1.0.0',
      artifactKind: 'qa-report',
      runId: inference.runId,
      sourceUrl: inference.sourceUrl,
      capturedAt: inference.capturedAt,
      viewport: inference.viewport,
      payload: {
        status: 'partial',
        sourceNodeIds: ['source:root'],
        reference: { width: 100, height: 100 },
        candidate: { width: 100, height: 100 },
        metrics: { ssim, changedPixelRatio: 1 - ssim },
        discrepancyRegions: [],
        diagnostics: [],
      },
    } satisfies QaReportArtifact,
    classifications: [],
    editabilityViolations: 0,
  };
}

describe('candidate history', () => {
  it('appends monotonic immutable records and selects the best revision', () => {
    const first = appendCandidateHistory(
      { passes: [] },
      {
        revision: 0,
        stage: 'baseline',
        inference,
        qa: qa(0, 0.8),
        diagnostics: [],
      },
    );
    const second = appendCandidateHistory(first, {
      revision: 1,
      stage: 'correction',
      inference,
      qa: qa(1, 0.9),
      diagnostics: [],
    });
    expect(finishCandidateHistory(second, 'render-limit')).toMatchObject({
      selectedRevision: 1,
      stopReason: 'render-limit',
    });
    const duplicate = second.passes[0];
    if (duplicate === undefined) throw new Error('Missing history fixture.');
    expect(() =>
      appendCandidateHistory(second, {
        ...duplicate,
        revision: 1,
      }),
    ).toThrow('unique and monotonic');
  });
});
