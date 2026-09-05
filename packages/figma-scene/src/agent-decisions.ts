import type {
  AgenticInferenceArtifact,
  AgenticInferenceDecision,
  Diagnostic,
  FigmaSceneNode,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import {
  resolveCarouselDecision,
  resolveComponentDecision,
  resolveFallbackDecision,
  resolveLayoutIntent,
  resolveResponsiveIntent,
  resolveSemanticName,
  resolveTypographyDecision,
} from '@website-to-figma/inference';

export interface AgentScenePlan {
  patches: Map<string, Partial<FigmaSceneNode>>;
  suppressedSourceNodeIds: Set<string>;
  diagnostics: Diagnostic[];
}

export function createAgentScenePlan(
  ir: WebsiteIrArtifact,
  inference: AgenticInferenceArtifact,
): AgentScenePlan {
  const decisions = inference.payload.decisions.filter(isAgentDecision);
  const patches = new Map<string, Partial<FigmaSceneNode>>();
  const suppressedSourceNodeIds = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const nodeBySource = new Map(
    ir.payload.nodes.map((node) => [node.sourceNodeId, node]),
  );
  const nodeById = new Map(ir.payload.nodes.map((node) => [node.nodeId, node]));
  const warn = (
    decision: AgenticInferenceDecision,
    code: string,
    message: string,
  ) => {
    diagnostics.push({
      code,
      severity: 'warning',
      message,
      ...(decision.sourceNodeIds[0] === undefined
        ? {}
        : { sourceNodeId: decision.sourceNodeIds[0] }),
    });
  };

  decisions.forEach((decision) => {
    const sourceNodeId = decision.sourceNodeIds[0];
    if (sourceNodeId === undefined) return;
    switch (decision.kind) {
      case 'layout': {
        const result = resolveLayoutIntent(ir, decision);
        if (!result.ok) warn(decision, result.code, result.reason);
        else
          patch(patches, sourceNodeId, decision.decisionId, {
            layoutMode: result.intent.layoutMode,
            layoutIntent: result.intent.mode,
            layoutWrap: result.intent.wrap,
            ...(result.intent.gap === undefined
              ? {}
              : { itemSpacing: result.intent.gap }),
            ...(result.intent.padding === undefined
              ? {}
              : { padding: result.intent.padding }),
          });
        break;
      }
      case 'semantic-name':
      case 'section': {
        const node = nodeBySource.get(sourceNodeId);
        if (node !== undefined) {
          const resolved = resolveSemanticName(node, decisions);
          patch(patches, sourceNodeId, decision.decisionId, {
            name: resolved.name,
          });
        }
        break;
      }
      case 'responsive': {
        const resolved = resolveResponsiveIntent(decision);
        patch(patches, sourceNodeId, decision.decisionId, {
          constraints: {
            horizontal: resolved.horizontal,
            vertical: resolved.vertical,
            ...(resolved.minWidth === undefined
              ? {}
              : { minWidth: resolved.minWidth }),
            ...(resolved.maxWidth === undefined
              ? {}
              : { maxWidth: resolved.maxWidth }),
            provenance: resolved.provenance,
          },
        });
        break;
      }
      case 'component': {
        const result = resolveComponentDecision(ir, decision);
        if (!result.ok) warn(decision, result.code, result.reason);
        else {
          result.component.instanceSourceNodeIds.forEach((id, index) => {
            patch(patches, id, decision.decisionId, {
              kind: index === 0 ? 'component' : 'instance',
              name: result.component.name,
              componentSourceNodeId: result.component.componentSourceNodeId,
            });
          });
        }
        break;
      }
      case 'carousel': {
        const result = resolveCarouselDecision(ir, decision);
        if (!result.ok) warn(decision, result.code, result.reason);
        else {
          patch(
            patches,
            result.carousel.viewportSourceNodeId,
            decision.decisionId,
            { clipsContent: result.carousel.clipContent },
          );
          result.carousel.suppressedCloneSourceNodeIds.forEach((id) => {
            const root = nodeBySource.get(id);
            if (root !== undefined) {
              collectSubtreeSources(root.nodeId, nodeById).forEach((source) =>
                suppressedSourceNodeIds.add(source),
              );
            }
          });
        }
        break;
      }
      case 'typography': {
        const node = nodeBySource.get(sourceNodeId);
        const family =
          decision.payload.substituteFamily ??
          decision.payload.requestedFamily ??
          node?.styles?.['font-family']
            ?.split(',')[0]
            ?.replace(/["']/g, '')
            .trim() ??
          'Inter';
        const result = resolveTypographyDecision(ir, decision, [
          {
            family,
            weight: decision.payload.weight ?? 400,
            style: decision.payload.style ?? 'normal',
          },
        ]);
        if (!result.ok) warn(decision, result.code, result.reason);
        else {
          const currentStyles = patches.get(sourceNodeId)?.styles ?? {};
          patch(patches, sourceNodeId, decision.decisionId, {
            styles: {
              ...currentStyles,
              'font-family': result.typography.resolvedFamily,
              'font-weight': String(result.typography.weight),
              'font-style': result.typography.style,
              ...(result.typography.lineHeight === undefined
                ? {}
                : { 'line-height': `${result.typography.lineHeight}px` }),
              ...(result.typography.letterSpacing === undefined
                ? {}
                : {
                    'letter-spacing': `${result.typography.letterSpacing}px`,
                  }),
            },
            typography: {
              requestedFamily: result.typography.requestedFamily,
              resolvedFamily: result.typography.resolvedFamily,
              weight: result.typography.weight,
              style: result.typography.style,
              preserveLineCount: result.typography.preserveLineCount,
              ...(result.typography.expectedLineCount === undefined
                ? {}
                : {
                    expectedLineCount: result.typography.expectedLineCount,
                  }),
            },
          });
        }
        break;
      }
      case 'fallback': {
        const result = resolveFallbackDecision(ir, decision);
        if (!result.ok) warn(decision, result.code, result.reason);
        else
          patch(patches, sourceNodeId, decision.decisionId, {
            fallbackRepresentation: result.fallback.representation,
            ...(result.fallback.representation === 'raster'
              ? { kind: 'image' }
              : {}),
          });
        break;
      }
      case 'qa-priority':
      case 'token':
        warn(
          decision,
          'INFERENCE_DECISION_DEFERRED',
          `${decision.kind} decisions are retained for QA or design-system stages.`,
        );
        break;
    }
  });
  return { patches, suppressedSourceNodeIds, diagnostics };
}

function isAgentDecision(
  decision: AgenticInferenceArtifact['payload']['decisions'][number],
): decision is AgenticInferenceDecision {
  return 'origin' in decision && decision.origin === 'agent';
}

function patch(
  patches: Map<string, Partial<FigmaSceneNode>>,
  sourceNodeId: string,
  decisionId: string,
  value: Partial<FigmaSceneNode>,
): void {
  const current = patches.get(sourceNodeId) ?? {};
  patches.set(sourceNodeId, {
    ...current,
    ...value,
    inferenceDecisionIds: [
      ...new Set([...(current.inferenceDecisionIds ?? []), decisionId]),
    ],
  });
}

function collectSubtreeSources(
  rootNodeId: string,
  nodesById: ReadonlyMap<string, WebsiteIrArtifact['payload']['nodes'][number]>,
): string[] {
  const result: string[] = [];
  const pending = [rootNodeId];
  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (nodeId === undefined) continue;
    const node = nodesById.get(nodeId);
    if (node === undefined) continue;
    result.push(node.sourceNodeId);
    pending.push(...node.childNodeIds);
  }
  return result;
}
