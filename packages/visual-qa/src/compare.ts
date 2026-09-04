import type { QaReportArtifact } from '@website-to-figma/contracts';

export interface ImageInput {
  bytes: Uint8Array;
  width: number;
  height: number;
}
export interface CompareOptions {
  runId?: string;
  sourceUrl?: string;
  capturedAt?: string;
  threshold?: number;
}

export function compareImages(
  reference: ImageInput,
  candidate: ImageInput,
  options: CompareOptions = {},
): QaReportArtifact {
  const sameDimensions =
    reference.width === candidate.width &&
    reference.height === candidate.height;
  const identical =
    sameDimensions &&
    reference.bytes.length === candidate.bytes.length &&
    reference.bytes.every((byte, index) => byte === candidate.bytes[index]);
  const ssim = identical ? 1 : 0;
  const changedPixelRatio = identical ? 0 : 1;
  const threshold = options.threshold ?? 0.95;
  const diagnostics = sameDimensions
    ? []
    : [
        {
          code: 'DIMENSION_MISMATCH',
          severity: 'error' as const,
          message: 'Reference and candidate dimensions differ.',
        },
      ];
  return {
    schemaVersion: '1.0.0',
    artifactKind: 'qa-report',
    runId: options.runId ?? 'run:qa',
    sourceUrl: options.sourceUrl ?? 'https://qa.invalid',
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    viewport: {
      width: reference.width,
      height: reference.height,
      deviceScaleFactor: 1,
    },
    payload: {
      status: sameDimensions && ssim >= threshold ? 'pass' : 'fail',
      sourceNodeIds: [],
      reference: { width: reference.width, height: reference.height },
      candidate: { width: candidate.width, height: candidate.height },
      metrics: { ssim, changedPixelRatio },
      discrepancyRegions: identical
        ? []
        : [{ x: 0, y: 0, width: candidate.width, height: candidate.height }],
      diagnostics,
    },
  };
}
