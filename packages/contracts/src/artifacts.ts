export const SCHEMA_VERSION = '1.0.0' as const;
export const INFERENCE_SCHEMA_VERSION = '1.1.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
export type InferenceSchemaVersion =
  SchemaVersion | typeof INFERENCE_SCHEMA_VERSION;
export type ArtifactKind =
  | 'raw-capture'
  | 'website-ir'
  | 'inference'
  | 'figma-scene'
  | 'import-result'
  | 'qa-report';

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

interface ArtifactEnvelope<
  Kind extends ArtifactKind,
  Payload,
  Version extends string = SchemaVersion,
> {
  schemaVersion: Version;
  artifactKind: Kind;
  runId: string;
  sourceUrl: string;
  capturedAt: string;
  viewport: Viewport;
  payload: Payload;
}

export interface Diagnostic {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  sourceNodeId?: string;
}

export interface RawNodeObservation {
  sourceNodeId: string;
  parentSourceNodeId: string | null;
  childSourceNodeIds: string[];
  kind: 'element' | 'text' | 'pseudo-element' | 'shadow-root';
  tagName?: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  visible?: boolean;
  clipped?: boolean;
  zIndex?: string;
  styles?: Record<string, string>;
  pseudo?: 'before' | 'after';
  coordinateSpace?: 'document';
}

export interface AssetReference {
  assetId: string;
  sourceNodeId: string;
  kind: 'image' | 'svg' | 'font' | 'video' | 'canvas' | 'other';
  contentHash?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

export type RawCaptureArtifact = ArtifactEnvelope<
  'raw-capture',
  {
    rootNodeId: string;
    nodes: RawNodeObservation[];
    assets: AssetReference[];
  }
>;

export interface WebsiteIrNode {
  nodeId: string;
  sourceNodeId: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  kind: 'frame' | 'text' | 'rectangle' | 'ellipse' | 'image' | 'svg' | 'group';
  rect?: { x: number; y: number; width: number; height: number };
  text?: string;
  styles?: Record<string, string>;
  visible?: boolean;
}

export type WebsiteIrArtifact = ArtifactEnvelope<
  'website-ir',
  {
    rootNodeId: string;
    sourceNodeIds: string[];
    nodes: WebsiteIrNode[];
    assets: AssetReference[];
  }
>;

export interface InferenceDecision {
  decisionId: string;
  sourceNodeIds: string[];
  kind: 'section' | 'layout' | 'component' | 'token';
  confidence: number;
  evidence: string[];
  fallback: 'geometry' | 'independent-nodes' | 'unsupported';
}

export type LegacyInferenceArtifact = ArtifactEnvelope<
  'inference',
  {
    sourceNodeIds: string[];
    decisions: InferenceDecision[];
  }
>;

export type AgenticDecisionKind =
  | 'section'
  | 'layout'
  | 'component'
  | 'carousel'
  | 'typography'
  | 'semantic-name'
  | 'responsive'
  | 'fallback'
  | 'qa-priority'
  | 'token';

interface AgenticDecisionBase<Kind extends AgenticDecisionKind, Payload> {
  decisionId: string;
  sourceNodeIds: string[];
  kind: Kind;
  confidence: number;
  evidence: string[];
  fallback: 'geometry' | 'independent-nodes' | 'unsupported';
  origin: 'deterministic' | 'agent';
  payload: Payload;
}

export type AgenticInferenceDecision =
  | AgenticDecisionBase<
      'section',
      {
        role:
          'navigation' | 'hero' | 'content' | 'gallery' | 'footer' | 'other';
      }
    >
  | AgenticDecisionBase<
      'layout',
      {
        mode:
          'horizontal' | 'vertical' | 'wrap' | 'grid' | 'freeform' | 'overlay';
        gap?: number;
        padding?: { top: number; right: number; bottom: number; left: number };
        align?: 'start' | 'center' | 'end' | 'stretch';
        justify?: 'start' | 'center' | 'end' | 'space-between';
      }
    >
  | AgenticDecisionBase<
      'component',
      {
        name: string;
        instanceSourceNodeIds: string[];
        overrideSourceNodeIds: string[];
      }
    >
  | AgenticDecisionBase<
      'carousel',
      {
        viewportSourceNodeId: string;
        panelSourceNodeIds: string[];
        cloneSourceNodeIds: string[];
        clipContent: boolean;
      }
    >
  | AgenticDecisionBase<
      'typography',
      {
        requestedFamily?: string;
        substituteFamily?: string;
        weight?: number;
        style?: 'normal' | 'italic';
        lineHeight?: number;
        letterSpacing?: number;
        preserveLineCount: boolean;
      }
    >
  | AgenticDecisionBase<'semantic-name', { name: string }>
  | AgenticDecisionBase<
      'responsive',
      {
        horizontal: 'fixed' | 'fill' | 'hug' | 'left-right';
        vertical: 'fixed' | 'fill' | 'hug' | 'top-bottom';
        minWidth?: number;
        maxWidth?: number;
      }
    >
  | AgenticDecisionBase<
      'fallback',
      { representation: 'editable' | 'raster'; reason: string }
    >
  | AgenticDecisionBase<
      'qa-priority',
      {
        category:
          | 'missing-content'
          | 'overlap'
          | 'clipping'
          | 'ordering'
          | 'geometry'
          | 'rendering-noise';
        priority: 'high' | 'medium' | 'low';
      }
    >
  | AgenticDecisionBase<
      'token',
      {
        tokenType: 'color' | 'typography' | 'spacing' | 'radius' | 'effect';
        name: string;
        value: string;
      }
    >;

export interface RejectedInferenceDecision {
  decisionId: string;
  code: string;
  reason: string;
}

export interface InferenceMergeOutcome {
  decisionId: string;
  status: 'accepted' | 'rejected' | 'fallback';
  supersedesDecisionId?: string;
}

export type AgenticInferenceArtifact = ArtifactEnvelope<
  'inference',
  {
    sourceNodeIds: string[];
    decisions: Array<InferenceDecision | AgenticInferenceDecision>;
    deterministicDecisions: InferenceDecision[];
    proposedDecisions: AgenticInferenceDecision[];
    rejectedDecisions: RejectedInferenceDecision[];
    mergeOutcomes: InferenceMergeOutcome[];
  },
  typeof INFERENCE_SCHEMA_VERSION
>;

export type InferenceArtifact =
  LegacyInferenceArtifact | AgenticInferenceArtifact;

export interface FigmaSceneNode {
  sceneNodeId: string;
  sourceNodeId: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  kind:
    | 'frame'
    | 'text'
    | 'rectangle'
    | 'ellipse'
    | 'image'
    | 'svg'
    | 'vector'
    | 'component'
    | 'instance'
    | 'group';
  name: string;
  rect?: { x: number; y: number; width: number; height: number };
  text?: string;
  styles?: Record<string, string>;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  layoutIntent?:
    'horizontal' | 'vertical' | 'wrap' | 'grid' | 'freeform' | 'overlay';
  layoutWrap?: boolean;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  clipsContent?: boolean;
  componentSourceNodeId?: string;
  constraints?: {
    horizontal: 'fixed' | 'fill' | 'hug' | 'left-right';
    vertical: 'fixed' | 'fill' | 'hug' | 'top-bottom';
    minWidth?: number;
    maxWidth?: number;
    provenance: 'inferred-single-viewport';
  };
  typography?: {
    requestedFamily: string;
    resolvedFamily: string;
    weight: number;
    style: 'normal' | 'italic';
    preserveLineCount: boolean;
    expectedLineCount?: number;
  };
  fallbackRepresentation?: 'editable' | 'raster';
  inferenceDecisionIds?: string[];
  fills?: string[];
  opacity?: number;
  cornerRadius?: number;
  effects?: string[];
}

export type FigmaSceneArtifact = ArtifactEnvelope<
  'figma-scene',
  {
    sourceNodeIds: string[];
    rootNodeIds: string[];
    nodes: FigmaSceneNode[];
    assets: AssetReference[];
    diagnostics?: Diagnostic[];
  }
>;

export interface ImportedNodeResult {
  sceneNodeId: string;
  figmaNodeId?: string;
  status: 'created' | 'skipped' | 'failed';
}

export type ImportResultArtifact = ArtifactEnvelope<
  'import-result',
  {
    status: 'success' | 'partial' | 'failed';
    sceneNodeIds: string[];
    nodes: ImportedNodeResult[];
    diagnostics: Diagnostic[];
  }
>;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface DiscrepancyRegion {
  sourceNodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QaReportArtifact = ArtifactEnvelope<
  'qa-report',
  {
    status: 'pass' | 'partial' | 'fail';
    sourceNodeIds: string[];
    reference: ImageDimensions;
    candidate: ImageDimensions;
    metrics: {
      ssim: number;
      changedPixelRatio: number;
    };
    discrepancyRegions: DiscrepancyRegion[];
    diagnostics: Diagnostic[];
  }
>;

export type Artifact =
  | RawCaptureArtifact
  | WebsiteIrArtifact
  | InferenceArtifact
  | FigmaSceneArtifact
  | ImportResultArtifact
  | QaReportArtifact;

export interface ArtifactValidationIssue {
  code: 'SCHEMA_VALIDATION' | 'DUPLICATE_ID' | 'DANGLING_REFERENCE';
  path: string;
  message: string;
}

export type ArtifactValidationResult =
  | { ok: true; value: Artifact }
  | { ok: false; issues: ArtifactValidationIssue[] };
