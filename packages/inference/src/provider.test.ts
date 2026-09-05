import { describe, expect, it } from 'vitest';

import type { AgentInferenceRequest } from './provider.js';
import { createFakeInferenceProvider } from './provider.js';

const request: AgentInferenceRequest = {
  runId: 'run:test',
  stage: 'initial',
  pass: 1,
  remainingPasses: 2,
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  section: { sectionId: 'source:root', nodes: [] },
  shared: { deterministicDecisions: [], assets: [] },
  diagnostics: [],
  invariants: {
    sourceNodeIds: ['source:root'],
    maxDecisions: 10,
    ordinaryTextMustRemainEditable: true,
  },
};

describe('createFakeInferenceProvider', () => {
  it('returns queued success, partial, and failure results deterministically', async () => {
    const provider = createFakeInferenceProvider('fake:test', [
      { ok: true, proposal: { decisions: [] } },
      {
        ok: true,
        proposal: { decisions: [] },
        diagnostic: {
          code: 'PARTIAL_PROPOSAL',
          severity: 'warning',
          message: 'One section was skipped.',
        },
      },
      {
        ok: false,
        diagnostic: {
          code: 'PROVIDER_FAILED',
          severity: 'error',
          message: 'Provider failed.',
        },
      },
    ]);

    expect((await provider.infer(request)).ok).toBe(true);
    expect((await provider.infer(request)).diagnostic?.code).toBe(
      'PARTIAL_PROPOSAL',
    );
    expect((await provider.infer(request)).ok).toBe(false);
    expect(provider.requests).toEqual([request, request, request]);
  });

  it('returns a structured failure after queued results are exhausted', async () => {
    const provider = createFakeInferenceProvider('fake:empty', []);
    const result = await provider.infer(request);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostic.code).toBe('FAKE_PROVIDER_EXHAUSTED');
  });
});
