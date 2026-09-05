import type {
  AgenticInferenceDecision,
  AssetReference,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';

export type FallbackDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'fallback' }
>;

const RASTER_ASSET_KINDS = new Set<AssetReference['kind']>([
  'video',
  'canvas',
  'other',
]);

export type FallbackResolution =
  | {
      ok: true;
      fallback: {
        decisionId: string;
        sourceNodeId: string;
        representation: 'editable' | 'raster';
        reason: string;
      };
    }
  | {
      ok: false;
      code: 'FALLBACK_TARGET_NOT_ELIGIBLE' | 'FALLBACK_NOT_SCOPED';
      reason: string;
    };

export function resolveFallbackDecision(
  ir: WebsiteIrArtifact,
  decision: FallbackDecision,
): FallbackResolution {
  const sourceNodeId = decision.sourceNodeIds[0] ?? '';
  if (decision.payload.representation === 'editable') {
    return {
      ok: true,
      fallback: {
        decisionId: decision.decisionId,
        sourceNodeId,
        representation: 'editable',
        reason: decision.payload.reason,
      },
    };
  }
  const eligibleAssets = ir.payload.assets.filter(
    (asset) =>
      asset.sourceNodeId === sourceNodeId && RASTER_ASSET_KINDS.has(asset.kind),
  );
  if (eligibleAssets.length === 0) {
    return {
      ok: false,
      code: 'FALLBACK_TARGET_NOT_ELIGIBLE',
      reason:
        'Raster fallback requires a captured video, canvas, or unsupported media asset.',
    };
  }
  const node = ir.payload.nodes.find(
    (candidate) => candidate.sourceNodeId === sourceNodeId,
  );
  if (
    node === undefined ||
    node.kind === 'text' ||
    node.nodeId === ir.payload.rootNodeId
  ) {
    return {
      ok: false,
      code: 'FALLBACK_NOT_SCOPED',
      reason: 'Raster fallback must target the smallest eligible media root.',
    };
  }
  return {
    ok: true,
    fallback: {
      decisionId: decision.decisionId,
      sourceNodeId,
      representation: 'raster',
      reason: decision.payload.reason,
    },
  };
}

export function isRasterFallbackEligible(
  ir: WebsiteIrArtifact,
  sourceNodeId: string,
): boolean {
  return ir.payload.assets.some(
    (asset) =>
      asset.sourceNodeId === sourceNodeId && RASTER_ASSET_KINDS.has(asset.kind),
  );
}
