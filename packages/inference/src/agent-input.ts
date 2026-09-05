import type {
  Diagnostic,
  InferenceArtifact,
  WebsiteIrArtifact,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

import type { AgentInferenceRequest, AgentNodeEvidence } from './provider.js';

const SAFE_STYLE_NAMES = new Set([
  'align-content',
  'align-items',
  'align-self',
  'background-color',
  'border-radius',
  'color',
  'display',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'grid-template-columns',
  'height',
  'justify-content',
  'letter-spacing',
  'line-height',
  'margin',
  'max-width',
  'min-width',
  'opacity',
  'overflow',
  'padding',
  'position',
  'text-align',
  'text-transform',
  'width',
  'z-index',
]);

export interface AgentInputOptions {
  maxNodesPerRequest: number;
  maxTextCharactersPerNode: number;
  maxRequestBytes: number;
  maxDecisionsPerRequest: number;
  stage?: 'initial' | 'correction';
  pass?: number;
  remainingPasses?: number;
  diagnostics?: Diagnostic[];
}

export interface AgentInferenceRequestBatch {
  requests: AgentInferenceRequest[];
  totalNodes: number;
}

export function buildAgentInferenceRequests(
  ir: WebsiteIrArtifact,
  deterministic: InferenceArtifact,
  options: AgentInputOptions,
): AgentInferenceRequestBatch {
  validateOptions(options);
  if (ir.runId !== deterministic.runId) {
    throw new Error(
      'Website IR and deterministic inference run IDs must match.',
    );
  }

  const nodesById = new Map(
    ir.payload.nodes.map((node) => [node.nodeId, node]),
  );
  const root = nodesById.get(ir.payload.rootNodeId);
  if (root === undefined)
    throw new Error('Website IR root node does not exist.');
  const sectionRoots =
    root.childNodeIds.length > 0 ? root.childNodeIds : [root.nodeId];
  const sections = sectionRoots.flatMap((sectionRootId) =>
    partition(
      collectSubtree(sectionRootId, nodesById),
      options.maxNodesPerRequest,
    ).map((nodes, partitionIndex) => ({
      sectionId:
        nodesById.get(sectionRootId)?.sourceNodeId ?? root.sourceNodeId,
      partition: partitionIndex,
      nodes,
    })),
  );

  const deterministicDecisions =
    deterministic.schemaVersion === '1.0.0'
      ? deterministic.payload.decisions
      : deterministic.payload.deterministicDecisions;
  const shared = {
    deterministicDecisions: structuredClone(deterministicDecisions),
    assets: ir.payload.assets.map((asset) => ({ ...asset })),
  };

  const requests = sections.map((section) => {
    const request: AgentInferenceRequest = {
      runId: ir.runId,
      stage: options.stage ?? 'initial',
      pass: options.pass ?? 1,
      remainingPasses: options.remainingPasses ?? 0,
      viewport: { ...ir.viewport },
      section: {
        sectionId: section.sectionId,
        ...(section.partition > 0 ? { partition: section.partition } : {}),
        nodes: section.nodes.map((node) =>
          sanitizeNode(node, options.maxTextCharactersPerNode),
        ),
      },
      shared,
      diagnostics: structuredClone(options.diagnostics ?? []),
      invariants: {
        sourceNodeIds: [...ir.payload.sourceNodeIds],
        maxDecisions: options.maxDecisionsPerRequest,
        ordinaryTextMustRemainEditable: true,
      },
    };
    const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
    if (bytes > options.maxRequestBytes) {
      throw new Error(
        `Sanitized section ${section.sectionId} exceeds the ${options.maxRequestBytes}-byte budget.`,
      );
    }
    return request;
  });

  return { requests, totalNodes: ir.payload.nodes.length };
}

function collectSubtree(
  rootId: string,
  nodesById: ReadonlyMap<string, WebsiteIrNode>,
): WebsiteIrNode[] {
  const result: WebsiteIrNode[] = [];
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (nodeId === undefined || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (node === undefined) continue;
    result.push(node);
    pending.push(...node.childNodeIds);
  }
  return result;
}

function partition<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sanitizeNode(
  node: WebsiteIrNode,
  maxTextCharacters: number,
): AgentNodeEvidence {
  const styles = Object.fromEntries(
    Object.entries(node.styles ?? {}).filter(([name]) =>
      SAFE_STYLE_NAMES.has(name),
    ),
  );
  return {
    nodeId: node.nodeId,
    sourceNodeId: node.sourceNodeId,
    parentNodeId: node.parentNodeId,
    childNodeIds: [...node.childNodeIds],
    kind: node.kind,
    ...(node.rect === undefined ? {} : { rect: { ...node.rect } }),
    ...(node.text === undefined
      ? {}
      : { text: truncate(node.text, maxTextCharacters) }),
    ...(Object.keys(styles).length === 0 ? {} : { styles }),
    ...(node.visible === undefined ? {} : { visible: node.visible }),
  };
}

function truncate(value: string, maxCharacters: number): string {
  return value.length <= maxCharacters
    ? value
    : `${value.slice(0, maxCharacters)}…`;
}

function validateOptions(options: AgentInputOptions): void {
  for (const [name, value] of Object.entries({
    maxNodesPerRequest: options.maxNodesPerRequest,
    maxTextCharactersPerNode: options.maxTextCharactersPerNode,
    maxRequestBytes: options.maxRequestBytes,
    maxDecisionsPerRequest: options.maxDecisionsPerRequest,
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
}
