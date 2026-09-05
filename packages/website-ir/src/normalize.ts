import type {
  RawCaptureArtifact,
  WebsiteIrArtifact,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

export function normalizeRawCapture(
  raw: RawCaptureArtifact,
): WebsiteIrArtifact {
  const rasterFallbacks = new Set(
    raw.payload.assets
      .filter((asset) => asset.kind === 'image')
      .map((asset) => asset.sourceNodeId),
  );
  const nodes: WebsiteIrNode[] = raw.payload.nodes.map((source) => {
    const tag = source.tagName ?? '';
    let kind: WebsiteIrNode['kind'] = source.kind === 'text' ? 'text' : 'group';
    if (source.kind === 'element') {
      if (tag === 'img') kind = 'image';
      else if (
        (tag === 'video' || tag === 'canvas') &&
        rasterFallbacks.has(source.sourceNodeId)
      )
        kind = 'image';
      else if (tag === 'svg') kind = 'svg';
      else if (tag === 'ellipse' || tag === 'circle') kind = 'ellipse';
      else if (
        [
          'div',
          'main',
          'section',
          'header',
          'footer',
          'nav',
          'article',
          'aside',
          'body',
          'html',
        ].includes(tag)
      )
        kind = 'frame';
      else kind = 'rectangle';
    }
    if (
      source.rect &&
      Object.values(source.rect).some(
        (value) =>
          !Number.isFinite(value) ||
          (value < 0 &&
            (value === source.rect?.width || value === source.rect?.height)),
      )
    ) {
      throw new Error(`Non-finite geometry for ${source.sourceNodeId}`);
    }
    return {
      nodeId: `ir:${source.sourceNodeId.slice(4)}`,
      sourceNodeId: source.sourceNodeId,
      parentNodeId: source.parentSourceNodeId
        ? `ir:${source.parentSourceNodeId.slice(4)}`
        : null,
      childNodeIds: source.childSourceNodeIds.map((id) => `ir:${id.slice(4)}`),
      kind,
      ...(source.rect ? { rect: source.rect } : {}),
      ...(source.text ? { text: source.text } : {}),
      ...(source.styles ? { styles: source.styles } : {}),
      ...(source.visible === undefined ? {} : { visible: source.visible }),
    };
  });
  return {
    schemaVersion: raw.schemaVersion,
    artifactKind: 'website-ir',
    runId: raw.runId,
    sourceUrl: raw.sourceUrl,
    capturedAt: raw.capturedAt,
    viewport: raw.viewport,
    payload: {
      rootNodeId: `ir:${raw.payload.rootNodeId.slice(4)}`,
      sourceNodeIds: raw.payload.nodes.map((node) => node.sourceNodeId),
      nodes,
      assets: raw.payload.assets,
    },
  };
}
