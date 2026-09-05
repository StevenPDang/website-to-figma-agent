import type { AgenticInferenceDecision } from '@website-to-figma/contracts';

export type ResponsiveDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'responsive' }
>;

export interface ResolvedResponsiveIntent {
  decisionId: string;
  horizontal: ResponsiveDecision['payload']['horizontal'];
  vertical: ResponsiveDecision['payload']['vertical'];
  minWidth?: number;
  maxWidth?: number;
  provenance: 'inferred-single-viewport';
}

export function resolveResponsiveIntent(
  decision: ResponsiveDecision,
): ResolvedResponsiveIntent {
  return {
    decisionId: decision.decisionId,
    horizontal: decision.payload.horizontal,
    vertical: decision.payload.vertical,
    ...(decision.payload.minWidth === undefined
      ? {}
      : { minWidth: decision.payload.minWidth }),
    ...(decision.payload.maxWidth === undefined
      ? {}
      : { maxWidth: decision.payload.maxWidth }),
    provenance: 'inferred-single-viewport',
  };
}
