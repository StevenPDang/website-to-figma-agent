import type {
  InferenceArtifact,
  InferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';

function fingerprint(
  node: WebsiteIrArtifact['payload']['nodes'][number],
): string {
  return JSON.stringify({
    kind: node.kind,
    text: node.text ?? '',
    styles: node.styles ?? {},
    childCount: node.childNodeIds.length,
  });
}

export function inferComponents(ir: WebsiteIrArtifact): InferenceArtifact {
  const groups = new Map<string, typeof ir.payload.nodes>();
  for (const node of ir.payload.nodes) {
    const key = fingerprint(node);
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  const decisions: InferenceDecision[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    const sourceNodeIds = group.map((node) => node.sourceNodeId);
    decisions.push({
      decisionId: `decision:component:${first.nodeId.slice(3)}`,
      sourceNodeIds,
      kind: 'component',
      confidence: 0.9,
      evidence: [`fingerprint=${key}`, `repeated=${group.length}`],
      fallback: 'independent-nodes',
    });
  }
  return {
    schemaVersion: ir.schemaVersion,
    artifactKind: 'inference',
    runId: ir.runId,
    sourceUrl: ir.sourceUrl,
    capturedAt: ir.capturedAt,
    viewport: ir.viewport,
    payload: { sourceNodeIds: ir.payload.sourceNodeIds, decisions },
  };
}
