import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

export type CarouselDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'carousel' }
>;

export type CarouselResolution =
  | {
      ok: true;
      carousel: {
        decisionId: string;
        viewportSourceNodeId: string;
        panelSourceNodeIds: string[];
        suppressedCloneSourceNodeIds: string[];
        clipContent: boolean;
      };
    }
  | {
      ok: false;
      code: 'CAROUSEL_PANEL_NOT_VISIBLE' | 'CAROUSEL_CLONE_NOT_PROVEN';
      reason: string;
    };

export function resolveCarouselDecision(
  ir: WebsiteIrArtifact,
  decision: CarouselDecision,
): CarouselResolution {
  const nodes = new Map(
    ir.payload.nodes.map((node) => [node.sourceNodeId, node]),
  );
  const viewport = nodes.get(decision.payload.viewportSourceNodeId);
  const hiddenPanel = decision.payload.panelSourceNodeIds.find((id) => {
    const panel = nodes.get(id);
    return (
      panel === undefined ||
      panel.visible === false ||
      !intersects(panel, viewport)
    );
  });
  if (hiddenPanel !== undefined) {
    return {
      ok: false,
      code: 'CAROUSEL_PANEL_NOT_VISIBLE',
      reason: `Panel ${hiddenPanel} is not visible in the captured viewport.`,
    };
  }
  const panelFingerprints = new Set(
    decision.payload.panelSourceNodeIds.map((id) => fingerprint(id, ir)),
  );
  const unproven = decision.payload.cloneSourceNodeIds.find(
    (id) => !panelFingerprints.has(fingerprint(id, ir)),
  );
  if (unproven !== undefined) {
    return {
      ok: false,
      code: 'CAROUSEL_CLONE_NOT_PROVEN',
      reason: `Clone ${unproven} has unique visible content.`,
    };
  }
  return {
    ok: true,
    carousel: {
      decisionId: decision.decisionId,
      viewportSourceNodeId: decision.payload.viewportSourceNodeId,
      panelSourceNodeIds: [...decision.payload.panelSourceNodeIds],
      suppressedCloneSourceNodeIds: [...decision.payload.cloneSourceNodeIds],
      clipContent: decision.payload.clipContent,
    },
  };
}

function intersects(
  node: WebsiteIrNode,
  viewport: WebsiteIrNode | undefined,
): boolean {
  if (node.rect === undefined || viewport?.rect === undefined) return true;
  return (
    node.rect.x < viewport.rect.x + viewport.rect.width &&
    node.rect.x + node.rect.width > viewport.rect.x &&
    node.rect.y < viewport.rect.y + viewport.rect.height &&
    node.rect.y + node.rect.height > viewport.rect.y
  );
}

function fingerprint(sourceNodeId: string, ir: WebsiteIrArtifact): string {
  const node = ir.payload.nodes.find(
    (candidate) => candidate.sourceNodeId === sourceNodeId,
  );
  if (node === undefined) return 'missing';
  const assets = ir.payload.assets
    .filter((asset) => asset.sourceNodeId === sourceNodeId)
    .map(
      (asset) =>
        asset.contentHash ??
        `${asset.kind}:${asset.width ?? 0}x${asset.height ?? 0}`,
    )
    .sort();
  return JSON.stringify({
    kind: node.kind,
    text: node.text ?? '',
    width: node.rect?.width,
    height: node.rect?.height,
    childCount: node.childNodeIds.length,
    assets,
  });
}
