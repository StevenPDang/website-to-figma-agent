import type {
  Diagnostic,
  DiscrepancyRegion,
  QaReportArtifact,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';

export type StructuralQaCategory =
  | 'missing-content'
  | 'overlap'
  | 'clipping'
  | 'ordering'
  | 'geometry'
  | 'rendering-noise';

export interface ClassifiedDiscrepancy {
  category: StructuralQaCategory;
  priority: 'high' | 'medium' | 'low';
  region: DiscrepancyRegion;
  sourceNodeId?: string;
  diagnosticCode: string;
}

const CATEGORY_BY_CODE: ReadonlyArray<{
  pattern: RegExp;
  category: StructuralQaCategory;
}> = [
  { pattern: /MISSING|ASSET.*FAILED|NO_VISIBLE/i, category: 'missing-content' },
  { pattern: /OVERLAP/i, category: 'overlap' },
  { pattern: /CLIP/i, category: 'clipping' },
  { pattern: /ORDER|Z_INDEX|HIERARCHY/i, category: 'ordering' },
  { pattern: /GEOMETRY|DIMENSION|POSITION|SIZE/i, category: 'geometry' },
  {
    pattern: /ANTIALIAS|FONT.*(?:RASTER|RENDER)/i,
    category: 'rendering-noise',
  },
];

export function classifyQaDiscrepancies(
  report: QaReportArtifact,
  ir: WebsiteIrArtifact,
  diagnostics: Diagnostic[] = report.payload.diagnostics,
): ClassifiedDiscrepancy[] {
  if (report.payload.discrepancyRegions.length === 0) return [];
  return diagnostics.flatMap((diagnostic, diagnosticIndex) => {
    const category = classifyCode(diagnostic.code);
    const region =
      report.payload.discrepancyRegions[
        Math.min(diagnosticIndex, report.payload.discrepancyRegions.length - 1)
      ];
    if (region === undefined) return [];
    const sourceNodeId =
      diagnostic.sourceNodeId ??
      region.sourceNodeId ??
      findSmallestIntersectingNode(region, ir);
    return [
      {
        category,
        priority: category === 'rendering-noise' ? 'low' : 'high',
        region: {
          ...region,
          ...(sourceNodeId === undefined ? {} : { sourceNodeId }),
        },
        ...(sourceNodeId === undefined ? {} : { sourceNodeId }),
        diagnosticCode: diagnostic.code,
      },
    ];
  });
}

function classifyCode(code: string): StructuralQaCategory {
  return (
    CATEGORY_BY_CODE.find(({ pattern }) => pattern.test(code))?.category ??
    'geometry'
  );
}

function findSmallestIntersectingNode(
  region: DiscrepancyRegion,
  ir: WebsiteIrArtifact,
): string | undefined {
  return ir.payload.nodes
    .filter((node) => node.rect !== undefined && intersects(region, node.rect))
    .sort((left, right) => area(left.rect) - area(right.rect))[0]?.sourceNodeId;
}

function intersects(
  left: DiscrepancyRegion,
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function area(rect: { width: number; height: number } | undefined): number {
  return rect === undefined
    ? Number.POSITIVE_INFINITY
    : rect.width * rect.height;
}
