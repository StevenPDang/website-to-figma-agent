import {
  parseLiveMessage,
  type ImportRequest,
  type ImportResponse,
  type Diagnostic,
  type ImportedNodeResult,
} from '@website-to-figma/contracts';

export function solidPaint(css: string | undefined): SolidPaint | undefined {
  if (!css) return;
  const m = css.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  );
  if (!m) return;
  return {
    type: 'SOLID',
    color: {
      r: Number(m[1]) / 255,
      g: Number(m[2]) / 255,
      b: Number(m[3]) / 255,
    },
    opacity: m[4] === undefined ? 1 : Number(m[4]),
  };
}
export function gradientPaint(
  css: string | undefined,
): GradientPaint | undefined {
  if (!css?.startsWith('linear-gradient(')) return;
  const colors = [...css.matchAll(/rgba?\([^)]*\)/g)]
    .map((match) => solidPaint(match[0]))
    .filter(Boolean) as SolidPaint[];
  if (colors.length < 2) return;
  const angle = Number(
    css.match(/linear-gradient\(\s*([\d.]+)deg/)?.[1] ?? 180,
  );
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [
      [Math.cos(radians), -Math.sin(radians), 0.5],
      [Math.sin(radians), Math.cos(radians), 0.5],
    ],
    gradientStops: colors.map((paint, index) => ({
      position: index / (colors.length - 1),
      color: { ...paint.color, a: paint.opacity ?? 1 },
    })),
  };
}
export function shadowEffect(
  css: string | undefined,
): DropShadowEffect | undefined {
  if (!css || css === 'none' || css.includes('inset')) return;
  const colorMatch = css.match(/rgba?\([^)]*\)/);
  const values = [
    ...css.replace(colorMatch?.[0] ?? '', '').matchAll(/-?[\d.]+px/g),
  ].map((m) => Number.parseFloat(m[0]));
  const color = solidPaint(colorMatch?.[0]);
  if (values.length < 3 || !color) return;
  return {
    type: 'DROP_SHADOW',
    color: { ...color.color, a: color.opacity ?? 1 },
    offset: { x: values[0] ?? 0, y: values[1] ?? 0 },
    radius: Math.max(0, values[2] ?? 0),
    spread: values[3] ?? 0,
    visible: true,
    blendMode: 'NORMAL',
  };
}
const number = (value: string | undefined, fallback = 0) => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
};

export async function importLiveScene(
  api: PluginAPI,
  request: ImportRequest,
  bytesByHash: Map<string, Uint8Array>,
): Promise<ImportResponse> {
  parseLiveMessage(request);
  if (
    api.currentPage.id !== request.destination.pageId ||
    api.root.name !== request.destination.documentName
  )
    throw new Error('Destination changed before import');
  const { scene } = request;
  const diagnostics: Diagnostic[] = [];
  const results: ImportedNodeResult[] = [];
  const sources = new Map(scene.payload.nodes.map((n) => [n.sceneNodeId, n]));
  const created = new Map<string, SceneNode>();
  const sceneIdByNode = new Map<SceneNode, string>();
  const assets = new Map(scene.payload.assets.map((a) => [a.sourceNodeId, a]));
  const available = await api.listAvailableFontsAsync();
  const loaded = new Set<string>();
  const wrapper = api.createFrame();
  wrapper.name = `${scene.sourceUrl} — ${scene.viewport.width}px`;
  wrapper.resize(request.width, request.height);
  wrapper.clipsContent = true;
  wrapper.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  wrapper.setPluginData('runId', scene.runId);
  const queue = [...scene.payload.rootNodeIds];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const source = id ? sources.get(id) : undefined;
    if (!source) continue;
    queue.push(...source.childNodeIds);
    const styles = source.styles ?? {};
    const warn = (code: string, message: string) =>
      diagnostics.push({
        code,
        message,
        severity: 'warning',
        sourceNodeId: source.sourceNodeId,
      });
    // SVG descendants are represented by the imported vector hierarchy.
    let ancestor = source.parentNodeId;
    let insideSvg = false;
    while (ancestor) {
      const p = sources.get(ancestor);
      if (p?.kind === 'svg') insideSvg = true;
      ancestor = p?.parentNodeId ?? null;
    }
    if (insideSvg) {
      results.push({ sceneNodeId: source.sceneNodeId, status: 'skipped' });
      warn(
        'SVG_DESCENDANT',
        'Represented by the enclosing editable SVG vector hierarchy.',
      );
      continue;
    }
    let node: SceneNode | undefined;
    try {
      const rect = source.rect;
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        results.push({ sceneNodeId: source.sceneNodeId, status: 'skipped' });
        warn('NO_VISIBLE_GEOMETRY', 'Source has no rendered geometry.');
        continue;
      }
      if (source.kind === 'text') {
        const family =
          (styles['font-family'] ?? 'Inter')
            .split(',')[0]
            ?.trim()
            .replace(/["']/g, '') ?? 'Inter';
        const weight = number(styles['font-weight'], 400);
        const weightStyle =
          weight >= 700
            ? 'Bold'
            : weight >= 600
              ? 'Semi Bold'
              : weight >= 500
                ? 'Medium'
                : 'Regular';
        const italic = styles['font-style'] === 'italic';
        const desired = italic
          ? weightStyle === 'Regular'
            ? 'Italic'
            : `${weightStyle} Italic`
          : weightStyle;
        let font = available.find(
          (f) => f.fontName.family === family && f.fontName.style === desired,
        )?.fontName;
        // Preserve the requested face characteristics when the website family
        // is unavailable by selecting a common Figma family with the same style.
        font ??= available.find(
          (f) => f.fontName.family === 'Inter' && f.fontName.style === desired,
        )?.fontName;
        font ??= available.find((f) => f.fontName.family === family)?.fontName;
        if (!font) {
          font = available.find((f) => f.fontName.family === 'Inter')
            ?.fontName ?? { family: 'Inter', style: 'Regular' };
          warn(
            'FONT_SUBSTITUTED',
            `${family} ${desired} unavailable; using ${font.family} ${font.style}.`,
          );
        } else if (font.family !== family || font.style !== desired)
          warn(
            'FONT_STYLE_SUBSTITUTED',
            `${family} ${desired} unavailable; using ${font.family} ${font.style}.`,
          );
        const key = JSON.stringify(font);
        if (!loaded.has(key)) {
          await api.loadFontAsync(font);
          loaded.add(key);
        }
        const text = api.createText();
        node = text;
        text.fontName = font;
        text.fontSize = Math.max(1, number(styles['font-size'], 16));
        const browserText = source.text ?? '';
        let characters = browserText;
        if (
          !['pre', 'pre-wrap', 'break-spaces'].includes(
            styles['white-space'] ?? '',
          )
        ) {
          characters = characters.replace(/\s+/g, ' ');
          if (/^[ \t]*[\r\n]/.test(browserText))
            characters = characters.trimStart();
          if (/[\r\n][ \t]*$/.test(browserText))
            characters = characters.trimEnd();
        }
        if (styles['text-transform'] === 'uppercase')
          characters = characters.toUpperCase();
        if (styles['text-transform'] === 'lowercase')
          characters = characters.toLowerCase();
        text.characters = characters;
        text.textAutoResize = 'NONE';
        text.fills = solidPaint(styles.color)
          ? [solidPaint(styles.color) as SolidPaint]
          : [];
        if (
          styles['line-height'] !== 'normal' &&
          number(styles['line-height']) > 0
        )
          text.lineHeight = {
            unit: 'PIXELS',
            value: number(styles['line-height']),
          };
        text.letterSpacing = {
          unit: 'PIXELS',
          value: number(styles['letter-spacing']),
        };
        if (styles['text-align'] === 'center')
          text.textAlignHorizontal = 'CENTER';
        if (styles['text-align'] === 'right')
          text.textAlignHorizontal = 'RIGHT';
        if (styles['text-decoration-line']?.includes('underline'))
          text.textDecoration = 'UNDERLINE';
      } else if (
        source.kind === 'svg' ||
        (source.kind === 'image' &&
          assets.get(source.sourceNodeId)?.mimeType === 'image/svg+xml')
      ) {
        const asset = assets.get(source.sourceNodeId);
        const bytes = asset?.contentHash
          ? bytesByHash.get(asset.contentHash)
          : undefined;
        if (!bytes) throw new Error('SVG asset missing');
        // UTF-8 decoding is done in the UI; convert bytes without Node globals.
        const markup = decodeUtf8(bytes);
        if (
          /<\s*(script|foreignObject)|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i.test(
            markup,
          )
        )
          throw new Error(
            'SVG contains unsupported active or external content',
          );
        node = api.createNodeFromSvg(markup);
      } else if (source.kind === 'ellipse') node = api.createEllipse();
      else if (source.kind === 'image') {
        const rectangle = api.createRectangle();
        node = rectangle;
        const asset = assets.get(source.sourceNodeId);
        const bytes = asset?.contentHash
          ? bytesByHash.get(asset.contentHash)
          : undefined;
        if (!bytes) throw new Error('Image asset missing');
        rectangle.fills = [
          {
            type: 'IMAGE',
            imageHash: api.createImage(bytes).hash,
            scaleMode: styles['object-fit'] === 'contain' ? 'FIT' : 'FILL',
          },
        ];
      } else {
        const frame = api.createFrame();
        node = frame;
        frame.clipsContent = ['hidden', 'clip', 'scroll', 'auto'].includes(
          styles.overflow ?? '',
        );
        frame.fills = [];
      }
      node.name = source.name;
      node.setPluginData('sourceNodeId', source.sourceNodeId);
      node.setPluginData('sceneNodeId', source.sceneNodeId);
      let parent = source.parentNodeId
        ? created.get(source.parentNodeId)
        : undefined;
      if (styles.position === 'fixed') parent = wrapper;
      if (!parent || !('appendChild' in parent)) parent = wrapper;
      (parent as FrameNode).appendChild(node);
      const parentSource = source.parentNodeId
        ? sources.get(source.parentNodeId)
        : undefined;
      node.resize(Math.max(0.01, rect.width), Math.max(0.01, rect.height));
      node.x = rect.x - (parent === wrapper ? 0 : (parentSource?.rect?.x ?? 0));
      node.y = rect.y - (parent === wrapper ? 0 : (parentSource?.rect?.y ?? 0));
      if (
        source.kind !== 'text' &&
        source.kind !== 'image' &&
        source.kind !== 'svg' &&
        'fills' in node
      ) {
        const fill = solidPaint(styles['background-color']);
        const gradient = gradientPaint(styles['background-image']);
        node.fills = gradient ? [gradient] : fill ? [fill] : [];
      }
      if (source.kind !== 'text' && 'opacity' in node)
        node.opacity = Math.max(0, Math.min(1, source.opacity ?? 1));
      if ('cornerRadius' in node && source.cornerRadius !== undefined)
        node.cornerRadius = Math.max(0, source.cornerRadius);
      if ('strokes' in node && number(styles['border-top-width']) > 0) {
        const stroke = solidPaint(styles['border-top-color']);
        if (stroke) {
          node.strokes = [stroke];
          node.strokeWeight = number(styles['border-top-width']);
          node.strokeAlign = 'INSIDE';
        }
      }
      if (
        styles['background-image'] &&
        styles['background-image'] !== 'none' &&
        !gradientPaint(styles['background-image'])
      )
        warn(
          'BACKGROUND_UNSUPPORTED',
          'CSS background image could not be mapped.',
        );
      if (styles.transform && styles.transform !== 'none')
        warn(
          'TRANSFORM_GEOMETRY_FALLBACK',
          'Transform represented by its rendered bounding box.',
        );
      if (source.effects?.length && 'effects' in node) {
        const effect = shadowEffect(source.effects[0]);
        if (effect) node.effects = [effect];
        else warn('SHADOW_UNSUPPORTED', 'CSS shadow could not be parsed.');
      }
      if (
        source.kind === 'text' &&
        styles['font-style'] === 'italic' &&
        !(
          'fontName' in node &&
          typeof node.fontName === 'object' &&
          'style' in node.fontName &&
          node.fontName.style.includes('Italic')
        )
      )
        warn(
          'FONT_STYLE_UNSUPPORTED',
          'Italic style requires an available matching face.',
        );
      created.set(source.sceneNodeId, node);
      sceneIdByNode.set(node, source.sceneNodeId);
      results.push({
        sceneNodeId: source.sceneNodeId,
        figmaNodeId: node.id,
        status: 'created',
      });
    } catch (error) {
      node?.remove();
      diagnostics.push({
        code: 'NODE_IMPORT_FAILED',
        severity: 'error',
        sourceNodeId: source.sourceNodeId,
        message: error instanceof Error ? error.message : 'Node import failed',
      });
      results.push({ sceneNodeId: source.sceneNodeId, status: 'failed' });
    }
  }
  // Geometry remains authoritative. Figma Auto Layout would recompute child
  // positions using sizing rules that do not yet cover every CSS constraint.
  for (const source of scene.payload.nodes) {
    if (source.layoutMode && source.layoutMode !== 'NONE')
      diagnostics.push({
        code: 'LAYOUT_GEOMETRY_FALLBACK',
        severity: 'warning',
        sourceNodeId: source.sourceNodeId,
        message:
          'CSS layout was preserved as measured editable geometry; Auto Layout was not enabled.',
      });
  }
  // CSS stacking can differ from DOM order. Reorder only explicit numeric
  // z-index children; auto layers retain their source order.
  for (const source of scene.payload.nodes) {
    const frame = created.get(source.sceneNodeId);
    if (frame?.type !== 'FRAME') continue;
    const ordered = frame.children
      .map((child, index) => ({
        child,
        index,
        z:
          Number.parseInt(
            sources.get(sceneIdByNode.get(child) ?? '')?.styles?.['z-index'] ??
              '0',
            10,
          ) || 0,
      }))
      .sort((a, b) => a.z - b.z || a.index - b.index);
    const insertChild = Reflect.get(frame, 'insertChild');
    if (typeof insertChild === 'function')
      ordered.forEach((entry, index) => {
        insertChild.call(frame, index, entry.child);
      });
  }
  api.currentPage.selection = [wrapper];
  api.viewport.scrollAndZoomIntoView([wrapper]);
  let png = '';
  try {
    png = api.base64Encode(
      await wrapper.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 },
        useAbsoluteBounds: true,
      }),
    );
  } catch {
    diagnostics.push({
      code: 'EXPORT_FAILED',
      severity: 'error',
      message: 'Figma PNG export failed.',
    });
  }
  return {
    protocolVersion: request.protocolVersion,
    runId: request.runId,
    type: 'import-result',
    destination: request.destination,
    png,
    result: {
      schemaVersion: scene.schemaVersion,
      artifactKind: 'import-result',
      runId: scene.runId,
      sourceUrl: scene.sourceUrl,
      capturedAt: scene.capturedAt,
      viewport: scene.viewport,
      payload: {
        status: diagnostics.length ? 'partial' : 'success',
        sceneNodeIds: scene.payload.nodes.map((n) => n.sceneNodeId),
        nodes: results,
        diagnostics,
      },
    },
  };
}
function decodeUtf8(bytes: Uint8Array) {
  // Figma's sandbox has no TextDecoder.
  let escaped = '';
  for (const byte of bytes) escaped += `%${byte.toString(16).padStart(2, '0')}`;
  return decodeURIComponent(escaped);
}
