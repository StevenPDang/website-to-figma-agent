import { decodePng } from './png.js';
import { comparePixels } from './pixels.js';
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
  const decodedReference = decodePng(reference.bytes);
  const decodedCandidate = decodePng(candidate.bytes);
  if (
    decodedReference.width !== reference.width ||
    decodedReference.height !== reference.height ||
    decodedCandidate.width !== candidate.width ||
    decodedCandidate.height !== candidate.height
  )
    throw new Error('PNG dimensions do not match declared dimensions');
  const { ssim, changedPixelRatio } = comparePixels(
    decodedReference,
    decodedCandidate,
  );
  const identical = ssim === 1 && changedPixelRatio === 0;
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
      status:
        sameDimensions &&
        ssim >= Math.max(0.95, threshold) &&
        changedPixelRatio <= 0.05
          ? 'pass'
          : 'fail',
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
