import type {
  FigmaSceneArtifact,
  FigmaSceneNode,
  WebsiteIrArtifact,
  InferenceArtifact,
} from '@website-to-figma/contracts';

export function compileScene(
  ir: WebsiteIrArtifact,
  inference?: InferenceArtifact,
): FigmaSceneArtifact {
  const layoutBySource = new Map(
    (inference?.payload.decisions ?? [])
      .filter((decision) => decision.kind === 'layout')
      .map((decision) => [decision.sourceNodeIds[0], decision] as const),
  );
  const eligible = new Set(
    ir.payload.nodes
      .filter((n) => n.visible !== false || n.parentNodeId === null)
      .map((n) => n.nodeId),
  );
  const byId = new Map(ir.payload.nodes.map((n) => [n.nodeId, n]));
  for (const id of [...eligible]) {
    let parent = byId.get(id)?.parentNodeId;
    while (parent) {
      eligible.add(parent);
      parent = byId.get(parent)?.parentNodeId;
    }
  }
  const nodes: FigmaSceneNode[] = ir.payload.nodes
    .filter((n) => eligible.has(n.nodeId))
    .map((source) => {
      const kind: FigmaSceneNode['kind'] =
        source.kind === 'frame'
          ? 'frame'
          : source.kind === 'text'
            ? 'text'
            : source.kind === 'image'
              ? 'image'
              : source.kind === 'svg'
                ? 'svg'
                : source.kind === 'ellipse'
                  ? 'ellipse'
                  : source.kind === 'rectangle'
                    ? 'rectangle'
                    : 'group';
      const layout = layoutBySource.get(source.sourceNodeId);
      const styles = source.styles ?? {};
      const opacity = styles.opacity
        ? Number.parseFloat(styles.opacity)
        : undefined;
      const radius = styles['border-radius']
        ? Number.parseFloat(styles['border-radius'])
        : undefined;
      const fills =
        styles['background-color'] &&
        styles['background-color'] !== 'rgba(0, 0, 0, 0)'
          ? [styles['background-color']]
          : undefined;
      const effects =
        styles['box-shadow'] && styles['box-shadow'] !== 'none'
          ? [styles['box-shadow']]
          : undefined;
      return {
        sceneNodeId: `scene:${source.nodeId.slice(3)}`,
        sourceNodeId: source.sourceNodeId,
        parentNodeId: source.parentNodeId
          ? `scene:${source.parentNodeId.slice(3)}`
          : null,
        childNodeIds: source.childNodeIds
          .filter((id) => eligible.has(id))
          .map((id) => `scene:${id.slice(3)}`),
        kind,
        name: source.text?.slice(0, 40) || `${kind}-${source.nodeId.slice(3)}`,
        ...(source.rect ? { rect: source.rect } : {}),
        ...(source.text ? { text: source.text } : {}),
        ...(source.styles ? { styles: source.styles } : {}),
        ...(fills ? { fills } : {}),
        ...(typeof opacity === 'number' && Number.isFinite(opacity)
          ? { opacity }
          : {}),
        ...(typeof radius === 'number' && Number.isFinite(radius)
          ? { cornerRadius: radius }
          : {}),
        ...(effects ? { effects } : {}),
        ...(layout &&
        source.kind === 'frame' &&
        layout.evidence.some(
          (item) => item === 'display=flex' || item === 'display=inline-flex',
        )
          ? {
              layoutMode: layout.evidence.some((item) =>
                item.includes('flex-direction=column'),
              )
                ? 'VERTICAL'
                : 'HORIZONTAL',
            }
          : {}),
      };
    });
  return {
    schemaVersion: ir.schemaVersion,
    artifactKind: 'figma-scene',
    runId: ir.runId,
    sourceUrl: ir.sourceUrl,
    capturedAt: ir.capturedAt,
    viewport: ir.viewport,
    payload: {
      sourceNodeIds: ir.payload.sourceNodeIds,
      rootNodeIds: ir.payload.nodes
        .filter((node) => node.parentNodeId === null)
        .map((node) => `scene:${node.nodeId.slice(3)}`),
      nodes,
      assets: ir.payload.assets,
    },
  };
}
