import type {
  AgenticInferenceDecision,
  RejectedInferenceDecision,
  WebsiteIrArtifact,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

import type { AgentInferenceProposal } from './provider.js';
import { isRasterFallbackEligible } from './fallback.js';
import { carouselFingerprint } from './carousel.js';

export interface ProposalPolicyOptions {
  maxDecisions: number;
  maxGeometryScale?: number;
}

export interface ProposalPolicyResult {
  proposedDecisions: AgenticInferenceDecision[];
  acceptedDecisions: AgenticInferenceDecision[];
  rejectedDecisions: RejectedInferenceDecision[];
}

export function validateProposalPolicy(
  proposal: AgentInferenceProposal,
  ir: WebsiteIrArtifact,
  options: ProposalPolicyOptions,
): ProposalPolicyResult {
  const acceptedDecisions: AgenticInferenceDecision[] = [];
  const rejectedDecisions: RejectedInferenceDecision[] = [];
  const sourceNodes = new Map(
    ir.payload.nodes.map((node) => [node.sourceNodeId, node]),
  );
  const cyclicSourceIds = findCyclicSourceIds(ir.payload.nodes);
  const idCounts = new Map<string, number>();
  proposal.decisions.forEach((item) =>
    idCounts.set(item.decisionId, (idCounts.get(item.decisionId) ?? 0) + 1),
  );
  const proposedDecisions = proposal.decisions.filter(
    (item) => idCounts.get(item.decisionId) === 1,
  );

  proposal.decisions.forEach((candidate, index) => {
    const rejection =
      index >= options.maxDecisions
        ? reject(
            candidate,
            'BUDGET_EXCEEDED',
            'Decision exceeds the configured run budget.',
          )
        : (idCounts.get(candidate.decisionId) ?? 0) > 1
          ? reject(
              candidate,
              'DUPLICATE_DECISION_ID',
              'Decision ID must be unique.',
            )
          : validateDecision(
              candidate,
              ir,
              sourceNodes,
              cyclicSourceIds,
              options,
            );
    if (rejection === undefined) acceptedDecisions.push(candidate);
    else if (
      !rejectedDecisions.some(
        (item) => item.decisionId === rejection.decisionId,
      )
    ) {
      rejectedDecisions.push(rejection);
    }
  });
  return { proposedDecisions, acceptedDecisions, rejectedDecisions };
}

function validateDecision(
  candidate: AgenticInferenceDecision,
  ir: WebsiteIrArtifact,
  sourceNodes: ReadonlyMap<string, WebsiteIrNode>,
  cyclicSourceIds: ReadonlySet<string>,
  options: ProposalPolicyOptions,
): RejectedInferenceDecision | undefined {
  if (candidate.origin !== 'agent') {
    return reject(
      candidate,
      'INVALID_ORIGIN',
      'Provider proposals must have agent origin.',
    );
  }
  const references = decisionSourceIds(candidate);
  const unknownId = references.find((id) => !sourceNodes.has(id));
  if (unknownId !== undefined) {
    return reject(
      candidate,
      'UNKNOWN_SOURCE_NODE',
      `Source node ${unknownId} does not exist.`,
    );
  }
  if (references.some((id) => cyclicSourceIds.has(id))) {
    return reject(
      candidate,
      'HIERARCHY_CYCLE',
      'Decision targets a cyclic source hierarchy.',
    );
  }
  if (!allFinite(candidate.payload)) {
    return reject(
      candidate,
      'GEOMETRY_OUT_OF_BOUNDS',
      'Decision contains non-finite numeric values.',
    );
  }
  const geometryLimit =
    Math.max(ir.viewport.width, ir.viewport.height) *
    (options.maxGeometryScale ?? 2);
  if (
    candidate.kind === 'layout' &&
    [
      candidate.payload.gap,
      ...Object.values(candidate.payload.padding ?? {}),
    ].some(
      (value) => value !== undefined && (value < 0 || value > geometryLimit),
    )
  ) {
    return reject(
      candidate,
      'GEOMETRY_OUT_OF_BOUNDS',
      'Layout geometry exceeds viewport bounds.',
    );
  }
  if (
    candidate.kind === 'responsive' &&
    candidate.payload.minWidth !== undefined &&
    candidate.payload.maxWidth !== undefined &&
    candidate.payload.minWidth > candidate.payload.maxWidth
  ) {
    return reject(
      candidate,
      'GEOMETRY_OUT_OF_BOUNDS',
      'Responsive minimum width exceeds maximum width.',
    );
  }
  if (
    candidate.kind === 'fallback' &&
    candidate.payload.representation === 'raster' &&
    candidate.sourceNodeIds.some((id) => {
      const node = sourceNodes.get(id);
      return node?.kind === 'text' || isMajorSection(node, ir);
    })
  ) {
    return reject(
      candidate,
      'FORBIDDEN_RASTERIZATION',
      'Ordinary text and major sections must remain editable.',
    );
  }
  if (
    candidate.kind === 'fallback' &&
    candidate.payload.representation === 'raster' &&
    !candidate.sourceNodeIds.every((id) => isRasterFallbackEligible(ir, id))
  ) {
    return reject(
      candidate,
      'FALLBACK_TARGET_NOT_ELIGIBLE',
      'Raster fallback requires captured unsupported media.',
    );
  }
  if (candidate.kind === 'carousel') {
    const panelFingerprints = new Set(
      candidate.payload.panelSourceNodeIds.map((id) =>
        carouselFingerprint(id, ir),
      ),
    );
    const unproven = candidate.payload.cloneSourceNodeIds.find(
      (id) => !panelFingerprints.has(carouselFingerprint(id, ir)),
    );
    if (unproven !== undefined) {
      return reject(
        candidate,
        'UNPROVEN_CAROUSEL_CLONE',
        `Clone ${unproven} does not match a visible panel.`,
      );
    }
  }
  return undefined;
}

function decisionSourceIds(decision: AgenticInferenceDecision): string[] {
  const ids = [...decision.sourceNodeIds];
  if (decision.kind === 'component') {
    ids.push(
      ...decision.payload.instanceSourceNodeIds,
      ...decision.payload.overrideSourceNodeIds,
    );
  }
  if (decision.kind === 'carousel') {
    ids.push(
      decision.payload.viewportSourceNodeId,
      ...decision.payload.panelSourceNodeIds,
      ...decision.payload.cloneSourceNodeIds,
    );
  }
  return [...new Set(ids)];
}

function isMajorSection(
  node: WebsiteIrNode | undefined,
  ir: WebsiteIrArtifact,
): boolean {
  if (node === undefined) return false;
  if (node.nodeId === ir.payload.rootNodeId) return true;
  return (
    node.kind === 'frame' &&
    node.rect !== undefined &&
    node.rect.width >= ir.viewport.width * 0.8 &&
    node.rect.height >= ir.viewport.height * 0.4
  );
}

function findCyclicSourceIds(nodes: WebsiteIrNode[]): Set<string> {
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const cyclic = new Set<string>();
  const visited = new Set<string>();
  const active: string[] = [];
  const visit = (nodeId: string): void => {
    const activeIndex = active.indexOf(nodeId);
    if (activeIndex >= 0) {
      active.slice(activeIndex).forEach((id) => {
        const node = nodesById.get(id);
        if (node !== undefined) cyclic.add(node.sourceNodeId);
      });
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    active.push(nodeId);
    nodesById.get(nodeId)?.childNodeIds.forEach(visit);
    active.pop();
  };
  nodes.forEach((node) => {
    visit(node.nodeId);
  });
  return cyclic;
}

function allFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (typeof value === 'object' && value !== null)
    return Object.values(value).every(allFinite);
  return true;
}

function reject(
  decision: AgenticInferenceDecision,
  code: string,
  reason: string,
): RejectedInferenceDecision {
  return { decisionId: decision.decisionId, code, reason };
}
