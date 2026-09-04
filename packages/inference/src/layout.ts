import type {
  InferenceArtifact,
  WebsiteIrArtifact,
  InferenceDecision,
} from '@website-to-figma/contracts';

export function inferLayout(ir: WebsiteIrArtifact): InferenceArtifact {
  const decisions: InferenceDecision[] = [];
  for (const node of ir.payload.nodes) {
    if (node.kind !== 'frame') continue;
    const children = node.childNodeIds
      .map((id) =>
        ir.payload.nodes.find((candidate) => candidate.nodeId === id),
      )
      .filter(
        (child): child is NonNullable<typeof child> => child !== undefined,
      );
    const style = node.styles ?? {};
    const display = style.display;
    const direction = style['flex-direction'];
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    const kind = isGrid
      ? 'grid'
      : isFlex
        ? direction === 'column'
          ? 'vertical'
          : 'horizontal'
        : 'freeform';
    const evidence = [
      `display=${display || 'unknown'}`,
      `children=${children.length}`,
      ...(direction ? [`flex-direction=${direction}`] : []),
    ];
    decisions.push({
      decisionId: `decision:layout:${node.nodeId.slice(3)}`,
      sourceNodeIds: [
        node.sourceNodeId,
        ...children.map((child) => child.sourceNodeId),
      ],
      kind: 'layout',
      confidence: isFlex || isGrid ? 0.95 : 0.55,
      evidence,
      fallback: kind === 'freeform' ? 'geometry' : 'independent-nodes',
    });
    if (node.parentNodeId === null)
      decisions.push({
        decisionId: `decision:section:${node.nodeId.slice(3)}`,
        sourceNodeIds: [node.sourceNodeId],
        kind: 'section',
        confidence: 0.8,
        evidence: ['root frame boundary'],
        fallback: 'geometry',
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
