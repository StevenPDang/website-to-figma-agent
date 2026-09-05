import { expect, it } from 'vitest';
import { formatRunReport } from './run-report.js';

it('formats a readable report grouped by diagnostic code', () => {
  const report = formatRunReport({
    runId: 'run:test',
    sourceUrl: 'https://example.com',
    outputDir: '.artifacts/test',
    status: 'partial',
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
