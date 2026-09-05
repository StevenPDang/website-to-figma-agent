import type { QaReportArtifact } from '@website-to-figma/contracts';

import type { ClassifiedDiscrepancy } from './classify.js';

export interface QaCandidate {
  revision: number;
  report: QaReportArtifact;
  classifications: ClassifiedDiscrepancy[];
  editabilityViolations: number;
}

export function rankQaCandidates(candidates: QaCandidate[]): QaCandidate[] {
  return [...candidates].sort((left, right) => {
    const editability =
      left.editabilityViolations - right.editabilityViolations;
    if (editability !== 0) return editability;
    const structural = structuralDefects(left) - structuralDefects(right);
    if (structural !== 0) return structural;
    const similarity =
      right.report.payload.metrics.ssim - left.report.payload.metrics.ssim;
    if (similarity !== 0) return similarity;
    const changed =
      left.report.payload.metrics.changedPixelRatio -
      right.report.payload.metrics.changedPixelRatio;
    if (changed !== 0) return changed;
    return left.revision - right.revision;
  });
}

export function selectBestQaCandidate(
  candidates: QaCandidate[],
): QaCandidate | undefined {
  return rankQaCandidates(candidates)[0];
}

function structuralDefects(candidate: QaCandidate): number {
  return candidate.classifications.filter(
    (item) => item.category !== 'rendering-noise',
  ).length;
}
