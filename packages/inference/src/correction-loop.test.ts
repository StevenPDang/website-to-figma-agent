import type {
  AgenticInferenceArtifact,
  QaReportArtifact,
} from '@website-to-figma/contracts';
import type { QaCandidate } from '@website-to-figma/visual-qa';
import { describe, expect, it, vi } from 'vitest';

import { runCorrectionLoop } from './correction-loop.js';
import { createFakeInferenceProvider } from './provider.js';
import type { AgentInferenceRequest } from './provider.js';

const baseline = {
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
const request: AgentInferenceRequest = {
  runId: 'run:test',
  stage: 'correction',
  pass: 1,
  remainingPasses: 1,
  viewport: baseline.viewport,
  section: { sectionId: 'source:root', nodes: [] },
  shared: { deterministicDecisions: [], assets: [] },
  diagnostics: [],
  invariants: {
    sourceNodeIds: ['source:root'],
    maxDecisions: 5,
    ordinaryTextMustRemainEditable: true,
  },
};

function candidate(
  revision: number,
  ssim: number,
  structuralDefects: number,
): QaCandidate {
  return {
    revision,
    report: {
      schemaVersion: '1.0.0',
      artifactKind: 'qa-report',
      runId: baseline.runId,
      sourceUrl: baseline.sourceUrl,
      capturedAt: baseline.capturedAt,
      viewport: baseline.viewport,
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
    classifications: Array.from({ length: structuralDefects }, (_, index) => ({
      category: 'geometry' as const,
      priority: 'high' as const,
      region: { x: index, y: 0, width: 1, height: 1 },
      diagnosticCode: 'GEOMETRY_DRIFT',
    })),
    editabilityViolations: 0,
  };
}

function options(values: QaCandidate[]) {
  const provider = createFakeInferenceProvider('fake', [
    { ok: true, proposal: { decisions: [] }, usage: { totalTokens: 10 } },
    { ok: true, proposal: { decisions: [] }, usage: { totalTokens: 12 } },
  ]);
  return {
    provider,
    baselineInference: baseline,
    renderCandidate: vi.fn((_inference, revision: number) => {
      const qa = values[revision];
      if (qa === undefined)
        return Promise.reject(new Error('Missing QA fixture'));
      return Promise.resolve({ qa });
    }),
    buildRequest: vi.fn(() => request),
    mergeProposal: vi.fn(() => baseline),
  };
}

describe('correction loop', () => {
  it('renders three bounded candidates and selects the structurally best pass', async () => {
    const result = await runCorrectionLoop(
      options([
        candidate(0, 0.9, 2),
        candidate(1, 0.92, 1),
        candidate(2, 0.96, 0),
      ]),
    );
    expect(result.history).toMatchObject({
      stopReason: 'automated-pass',
      selectedRevision: 2,
    });
    expect(result.history.passes).toHaveLength(3);
    expect(result.history.passes[1]?.request).toEqual(request);
    expect(result.history.passes[2]?.usage).toEqual({ totalTokens: 12 });
  });

  it('stops when a correction does not improve on the best candidate', async () => {
    const setup = options([candidate(0, 0.9, 0), candidate(1, 0.85, 0)]);
    const result = await runCorrectionLoop({
      ...setup,
      isPassing: () => false,
    });
    expect(result.history.stopReason).toBe('no-improvement');
    expect(result.selected.revision).toBe(0);
    expect(setup.renderCandidate).toHaveBeenCalledTimes(2);
  });

  it('retains the baseline on provider failure, invalid output, or budget exhaustion', async () => {
    const failed = options([candidate(0, 0.8, 1)]);
    failed.provider = createFakeInferenceProvider('failed', [
      {
        ok: false,
        diagnostic: {
          code: 'PROVIDER_FAILED',
          severity: 'error',
          message: 'Unavailable',
        },
      },
    ]);
    await expect(
      runCorrectionLoop({ ...failed, isPassing: () => false }),
    ).resolves.toMatchObject({
      history: {
        stopReason: 'provider-failure',
        selectedRevision: 0,
        failedAttempt: {
          revision: 1,
          request,
          diagnostics: [{ code: 'PROVIDER_FAILED' }],
        },
      },
    });

    const invalid = options([candidate(0, 0.8, 1)]);
    invalid.mergeProposal = vi.fn(() => {
      throw new Error('invalid');
    });
    await expect(
      runCorrectionLoop({ ...invalid, isPassing: () => false }),
    ).resolves.toMatchObject({ history: { stopReason: 'invalid-output' } });

    const exhausted = options([candidate(0, 0.8, 1)]);
    await expect(
      runCorrectionLoop({
        ...exhausted,
        isPassing: () => false,
        budgetExhausted: () => true,
      }),
    ).resolves.toMatchObject({ history: { stopReason: 'budget-exhausted' } });
  });

  it('validates its render cap and matching QA revisions', async () => {
    await expect(
      runCorrectionLoop({ ...options([]), maxRenders: 4 }),
    ).rejects.toThrow('between one and three');
    await expect(
      runCorrectionLoop(options([candidate(2, 0.9, 1)])),
    ).rejects.toThrow('does not match');
  });

  it('retains the best completed candidate when a later render fails', async () => {
    const setup = options([candidate(0, 0.8, 1), candidate(1, 0.9, 0)]);
    setup.renderCandidate.mockImplementation((_inference, revision) =>
      revision === 0
        ? Promise.resolve({ qa: candidate(0, 0.8, 1) })
        : Promise.reject(new Error('Plugin disconnected')),
    );
    await expect(
      runCorrectionLoop({ ...setup, isPassing: () => false }),
    ).resolves.toMatchObject({
      selected: { revision: 0 },
      history: {
        stopReason: 'invalid-output',
        failedAttempt: {
          revision: 1,
          diagnostics: [{ code: 'CANDIDATE_RENDER_FAILED' }],
        },
      },
    });
  });
});
