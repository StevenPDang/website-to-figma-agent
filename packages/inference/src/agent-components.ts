import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

export type ComponentDecision = Extract<
  AgenticInferenceDecision,
  { kind: 'component' }
>;

export interface ResolvedComponent {
  decisionId: string;
  name: string;
  componentSourceNodeId: string;
  instanceSourceNodeIds: string[];
  overrideSourceNodeIds: string[];
}

export type ComponentResolution =
  | { ok: true; component: ResolvedComponent }
  | {
      ok: false;
      code:
        | 'COMPONENT_REQUIRES_REPETITION'
        | 'COMPONENT_STRUCTURE_MISMATCH'
        | 'COMPONENT_OVERRIDES_INCOMPLETE';
      reason: string;
    };

export function resolveComponentDecision(
  ir: WebsiteIrArtifact,
  decision: ComponentDecision,
): ComponentResolution {
  if (decision.payload.instanceSourceNodeIds.length < 2) {
    return {
      ok: false,
      code: 'COMPONENT_REQUIRES_REPETITION',
      reason: 'A reusable component requires at least two instances.',
    };
  }
  const nodesBySource = new Map(
    ir.payload.nodes.map((node) => [node.sourceNodeId, node]),
  );
  const nodesById = new Map(
    ir.payload.nodes.map((node) => [node.nodeId, node]),
  );
  const roots = decision.payload.instanceSourceNodeIds.map((id) =>
    nodesBySource.get(id),
  );
  if (roots.some((node) => node === undefined)) {
    return {
      ok: false,
      code: 'COMPONENT_STRUCTURE_MISMATCH',
      reason: 'Every component instance must reference an existing root.',
    };
  }
  const presentRoots = roots.filter(
    (node): node is WebsiteIrNode => node !== undefined,
  );
  const signatures = presentRoots.map((node) =>
    structuralSignature(node, nodesById),
  );
  if (new Set(signatures).size !== 1) {
    return {
      ok: false,
      code: 'COMPONENT_STRUCTURE_MISMATCH',
      reason: 'Component instances must have the same editable structure.',
    };
  }
  const first = presentRoots[0];
  if (first === undefined) {
    return {
      ok: false,
      code: 'COMPONENT_REQUIRES_REPETITION',
      reason: 'A component root is required.',
    };
  }
  const requiredOverrides = presentRoots
    .slice(1)
    .flatMap((root) => differingSources(first, root, nodesById));
  const declaredOverrides = new Set(decision.payload.overrideSourceNodeIds);
  const missing = requiredOverrides.find((id) => !declaredOverrides.has(id));
  if (missing !== undefined) {
    return {
      ok: false,
      code: 'COMPONENT_OVERRIDES_INCOMPLETE',
      reason: `Meaningful difference at ${missing} is not preserved as an override.`,
    };
  }
  return {
    ok: true,
    component: {
      decisionId: decision.decisionId,
      name: decision.payload.name.trim(),
      componentSourceNodeId: first.sourceNodeId,
      instanceSourceNodeIds: [...decision.payload.instanceSourceNodeIds],
      overrideSourceNodeIds: [...decision.payload.overrideSourceNodeIds],
    },
  };
}

function structuralSignature(
  node: WebsiteIrNode,
  nodesById: ReadonlyMap<string, WebsiteIrNode>,
): string {
  return `${node.kind}(${node.childNodeIds
    .map((id) => nodesById.get(id))
    .filter((child): child is WebsiteIrNode => child !== undefined)
    .map((child) => structuralSignature(child, nodesById))
    .join(',')})`;
}

function differingSources(
  canonical: WebsiteIrNode,
  instance: WebsiteIrNode,
  nodesById: ReadonlyMap<string, WebsiteIrNode>,
): string[] {
  const differences: string[] = [];
  if (
    canonical.text !== instance.text ||
    JSON.stringify(canonical.styles ?? {}) !==
      JSON.stringify(instance.styles ?? {})
  ) {
    differences.push(instance.sourceNodeId);
  }
  canonical.childNodeIds.forEach((canonicalId, index) => {
    const canonicalChild = nodesById.get(canonicalId);
    const instanceId = instance.childNodeIds[index];
    const instanceChild =
      instanceId === undefined ? undefined : nodesById.get(instanceId);
    if (canonicalChild !== undefined && instanceChild !== undefined) {
      differences.push(
        ...differingSources(canonicalChild, instanceChild, nodesById),
      );
    }
  });
  return differences;
}
