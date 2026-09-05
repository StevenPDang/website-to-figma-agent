import type { QaReportArtifact } from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { selectBestQaCandidate } from './rank.js';
import type { QaCandidate } from './rank.js';

function report(ssim: number, changedPixelRatio: number): QaReportArtifact {
  return {
    schemaVersion: '1.0.0',
    artifactKind: 'qa-report',
    runId: 'run:rank',
    sourceUrl: 'https://example.com',
    capturedAt: '2026-01-01T00:00:00.000Z',
    viewport: { width: 10, height: 10, deviceScaleFactor: 1 },
    payload: {
      status: 'fail',
      sourceNodeIds: [],
      reference: { width: 10, height: 10 },
      candidate: { width: 10, height: 10 },
      metrics: { ssim, changedPixelRatio },
      discrepancyRegions: [],
      diagnostics: [],
    },
  };
}

describe('selectBestQaCandidate', () => {
  it('rejects editability and structural regressions before pixel scores', () => {
    const bestPixels: QaCandidate = {
      revision: 2,
      report: report(0.99, 0.01),
      classifications: [
        {
          category: 'missing-content',
          priority: 'high',
          region: { x: 0, y: 0, width: 1, height: 1 },
          diagnosticCode: 'MISSING_ASSET',
        },
      ],
      editabilityViolations: 0,
    };
    const editable = {
      revision: 1,
      report: report(0.9, 0.1),
      classifications: [],
      editabilityViolations: 0,
    };
    const flattened = {
      revision: 3,
      report: report(1, 0),
      classifications: [],
      editabilityViolations: 1,
    };
    expect(
      selectBestQaCandidate([bestPixels, flattened, editable])?.revision,
    ).toBe(1);
  });

  it('uses similarity, changed pixels, then revision as deterministic tie breakers', () => {
    const candidates = [
      {
        revision: 2,
        report: report(0.95, 0.04),
        classifications: [],
        editabilityViolations: 0,
      },
      {
        revision: 1,
        report: report(0.95, 0.04),
        classifications: [],
        editabilityViolations: 0,
      },
      {
        revision: 3,
        report: report(0.96, 0.05),
        classifications: [],
        editabilityViolations: 0,
      },
    ];
    expect(selectBestQaCandidate(candidates)?.revision).toBe(3);
    candidates[2] = {
      revision: 3,
      report: report(0.95, 0.04),
      classifications: [],
      editabilityViolations: 0,
    };
    expect(selectBestQaCandidate(candidates)?.revision).toBe(1);
  });
});
