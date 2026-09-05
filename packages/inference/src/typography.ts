import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';

export type TypographyDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'typography' }
>;

export interface AvailableFontFace {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

export type TypographyResolution =
  | {
      ok: true;
      typography: {
        decisionId: string;
        requestedFamily: string;
        resolvedFamily: string;
        weight: number;
        style: 'normal' | 'italic';
        lineHeight?: number;
        letterSpacing?: number;
        expectedLineCount?: number;
        preserveLineCount: boolean;
      };
    }
  | {
      ok: false;
      code: 'TYPOGRAPHY_TARGET_NOT_TEXT' | 'FONT_UNAVAILABLE';
      reason: string;
    };

export function resolveTypographyDecision(
  ir: WebsiteIrArtifact,
  decision: TypographyDecision,
  availableFaces: AvailableFontFace[],
): TypographyResolution {
  const node = ir.payload.nodes.find(
    (candidate) => candidate.sourceNodeId === decision.sourceNodeIds[0],
  );
  if (node?.kind !== 'text') {
    return {
      ok: false,
      code: 'TYPOGRAPHY_TARGET_NOT_TEXT',
      reason: 'Typography decisions require an editable text node.',
    };
  }
  const requestedFamily =
    decision.payload.requestedFamily ??
    cleanFamily(node.styles?.['font-family']) ??
    'Inter';
  const desiredFamily = decision.payload.substituteFamily ?? requestedFamily;
  const desiredWeight =
    decision.payload.weight ?? number(node.styles?.['font-weight'], 400);
  const desiredStyle =
    decision.payload.style ??
    (node.styles?.['font-style'] === 'italic' ? 'italic' : 'normal');
  const familyFaces = availableFaces.filter(
    (face) => face.family === desiredFamily,
  );
  const candidates = familyFaces.filter((face) => face.style === desiredStyle);
  const face = [...(candidates.length > 0 ? candidates : familyFaces)].sort(
    (left, right) =>
      Math.abs(left.weight - desiredWeight) -
        Math.abs(right.weight - desiredWeight) || left.weight - right.weight,
  )[0];
  if (face === undefined) {
    return {
      ok: false,
      code: 'FONT_UNAVAILABLE',
      reason: `No available face for ${desiredFamily}.`,
    };
  }
  const capturedLineHeight = number(node.styles?.['line-height']);
  const expectedLineCount =
    node.rect !== undefined && capturedLineHeight > 0
      ? Math.max(1, Math.round(node.rect.height / capturedLineHeight))
      : undefined;
  const compensatedLineHeight =
    decision.payload.preserveLineCount &&
    expectedLineCount !== undefined &&
    node.rect !== undefined
      ? node.rect.height / expectedLineCount
      : decision.payload.lineHeight;
  return {
    ok: true,
    typography: {
      decisionId: decision.decisionId,
      requestedFamily,
      resolvedFamily: face.family,
      weight: face.weight,
      style: face.style,
      ...(compensatedLineHeight === undefined
        ? {}
        : { lineHeight: compensatedLineHeight }),
      ...(decision.payload.letterSpacing === undefined
        ? {}
        : { letterSpacing: decision.payload.letterSpacing }),
      ...(expectedLineCount === undefined ? {} : { expectedLineCount }),
      preserveLineCount: decision.payload.preserveLineCount,
    },
  };
}

function cleanFamily(value: string | undefined): string | undefined {
  return value?.split(',')[0]?.trim().replace(/["']/g, '');
}

function number(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}
