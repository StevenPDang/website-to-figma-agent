import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';

export type LayoutDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'layout' }
>;

export interface ResolvedLayoutIntent {
  decisionId: string;
  mode: LayoutDecision['payload']['mode'];
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  wrap: boolean;
  gap?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  align?: LayoutDecision['payload']['align'];
  justify?: LayoutDecision['payload']['justify'];
}

export type LayoutResolution =
  | { ok: true; intent: ResolvedLayoutIntent }
  | { ok: false; code: 'LAYOUT_BOUNDS_EXCEEDED'; reason: string };

export function resolveLayoutIntent(
  ir: WebsiteIrArtifact,
  decision: LayoutDecision,
  tolerance = 0.05,
): LayoutResolution {
  const container = ir.payload.nodes.find(
    (node) => node.sourceNodeId === decision.sourceNodeIds[0],
  );
  if (container?.rect !== undefined) {
    const containerRect = container.rect;
    const children = container.childNodeIds
      .map((id) => ir.payload.nodes.find((node) => node.nodeId === id))
      .filter((node) => node?.rect !== undefined);
    const permittedX = containerRect.width * tolerance;
    const permittedY = containerRect.height * tolerance;
    const outside = children.some((child) => {
      if (child?.rect === undefined) return false;
      return (
        child.rect.x < containerRect.x - permittedX ||
        child.rect.y < containerRect.y - permittedY ||
        child.rect.x + child.rect.width >
          containerRect.x + containerRect.width + permittedX ||
        child.rect.y + child.rect.height >
          containerRect.y + containerRect.height + permittedY
      );
    });
    if (outside) {
      return {
        ok: false,
        code: 'LAYOUT_BOUNDS_EXCEEDED',
        reason: 'Measured children exceed the captured container tolerance.',
      };
    }
  }
  const mode = decision.payload.mode;
  return {
    ok: true,
    intent: {
      decisionId: decision.decisionId,
      mode,
      layoutMode:
        mode === 'horizontal' || mode === 'wrap'
          ? 'HORIZONTAL'
          : mode === 'vertical'
            ? 'VERTICAL'
            : 'NONE',
      wrap: mode === 'wrap',
      ...(decision.payload.gap === undefined
        ? {}
        : { gap: decision.payload.gap }),
      ...(decision.payload.padding === undefined
        ? {}
        : { padding: { ...decision.payload.padding } }),
      ...(decision.payload.align === undefined
        ? {}
        : { align: decision.payload.align }),
      ...(decision.payload.justify === undefined
        ? {}
        : { justify: decision.payload.justify }),
    },
  };
}
