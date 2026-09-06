import { expect, it } from 'vitest';
import { formatRunReport } from './run-report.js';

it('formats a readable report grouped by diagnostic code', () => {
  const report = formatRunReport({
    runId: 'run:test',
    sourceUrl: 'https://example.com',
    outputDir: '.artifacts/test',
    status: 'partial',
    inferenceMode: 'deterministic',
    counts: { created: 4, skipped: 2, failed: 1, assets: 3 },
    diagnostics: [
      {
        code: 'NODE_IMPORT_FAILED',
        severity: 'error',
        message: 'Image unsupported.',
      },
      {
        code: 'NODE_IMPORT_FAILED',
        severity: 'error',
        message: 'Image unsupported.',
      },
    ],
    metrics: { ssim: 0.8, changedPixelRatio: 0.2 },
  });
  expect(report).toContain('### NODE_IMPORT_FAILED (2; 2 errors)');
  expect(report).toContain('Created nodes: **4**');
  expect(report).toContain('Image unsupported.');
});

it('reports agentic provider usage, selection, stop reason, and recovery', () => {
  const report = formatRunReport({
    runId: 'run:agentic',
    sourceUrl: 'https://example.com',
    outputDir: '.artifacts/agentic',
    status: 'partial',
    inferenceMode: 'agentic',
    providerId: 'local-codex',
    counts: { created: 4, skipped: 0, failed: 0, assets: 1 },
    diagnostics: [
      {
        code: 'CODEX_TIMEOUT',
        severity: 'error',
        message: 'Provider timed out.',
      },
    ],
    metrics: { ssim: 0.9, changedPixelRatio: 0.1 },
    usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    history: {
      passes: [],
      selectedRevision: 0,
      stopReason: 'provider-failure',
    },
  });
  expect(report).toContain('**Provider:** local-codex');
  expect(report).toContain('Total tokens: **25**');
  expect(report).toContain('Stop reason: **provider-failure**');
  expect(report).toContain('best completed candidate was retained');
});
