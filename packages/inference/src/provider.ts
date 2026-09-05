import type {
  AgenticInferenceDecision,
  AssetReference,
  Diagnostic,
  InferenceDecision,
  Viewport,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

export interface AgentNodeEvidence extends Pick<
  WebsiteIrNode,
  | 'nodeId'
  | 'sourceNodeId'
  | 'parentNodeId'
  | 'childNodeIds'
  | 'kind'
  | 'rect'
  | 'text'
  | 'styles'
  | 'visible'
> {}

export interface AgentAssetEvidence extends Pick<
  AssetReference,
  | 'assetId'
  | 'sourceNodeId'
  | 'kind'
  | 'contentHash'
  | 'mimeType'
  | 'width'
  | 'height'
  | 'byteLength'
> {}

export interface AgentInferenceRequest {
  runId: string;
  stage: 'initial' | 'correction';
  pass: number;
  remainingPasses: number;
  viewport: Viewport;
  section: {
    sectionId: string;
    partition?: number;
    nodes: AgentNodeEvidence[];
  };
  shared: {
    deterministicDecisions: InferenceDecision[];
    assets: AgentAssetEvidence[];
  };
  diagnostics: Diagnostic[];
  invariants: {
    sourceNodeIds: string[];
    maxDecisions: number;
    ordinaryTextMustRemainEditable: true;
  };
}

export interface AgentInferenceProposal {
  decisions: AgenticInferenceDecision[];
}

export interface InferenceUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type AgentInferenceResult =
  | {
      ok: true;
      proposal: AgentInferenceProposal;
      usage?: InferenceUsage;
      diagnostic?: Diagnostic;
    }
  | { ok: false; diagnostic: Diagnostic };

export interface InferenceProvider {
  readonly providerId: string;
  infer(request: AgentInferenceRequest): Promise<AgentInferenceResult>;
}

export interface FakeInferenceProvider extends InferenceProvider {
  readonly requests: AgentInferenceRequest[];
}

export function createFakeInferenceProvider(
  providerId: string,
  results: readonly AgentInferenceResult[],
): FakeInferenceProvider {
  let resultIndex = 0;
  const requests: AgentInferenceRequest[] = [];
  return {
    providerId,
    requests,
    async infer(request) {
      requests.push(structuredClone(request));
      const result = results[resultIndex];
      resultIndex += 1;
      return result === undefined
        ? {
            ok: false,
            diagnostic: {
              code: 'FAKE_PROVIDER_EXHAUSTED',
              severity: 'error',
              message: `Fake provider ${providerId} has no queued result.`,
            },
          }
        : structuredClone(result);
    },
  };
}
