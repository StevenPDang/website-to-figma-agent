export const SCHEMA_VERSION = '1.0.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
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

interface ArtifactEnvelope<Kind extends ArtifactKind, Payload> {
  schemaVersion: SchemaVersion;
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

export type InferenceArtifact = ArtifactEnvelope<
  'inference',
  {
    sourceNodeIds: string[];
    decisions: InferenceDecision[];
  }
>;

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
}

export type FigmaSceneArtifact = ArtifactEnvelope<
  'figma-scene',
  {
    sourceNodeIds: string[];
    rootNodeIds: string[];
    nodes: FigmaSceneNode[];
    assets: AssetReference[];
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
