import type { Page } from 'playwright';
import type {
  Diagnostic,
  RawNodeObservation,
} from '@website-to-figma/contracts';

export interface DomCaptureOptions {
  maxNodes?: number;
}

export interface DomCaptureResult {
  rootNodeId: string;
  nodes: RawNodeObservation[];
  diagnostics: Diagnostic[];
}

const captureInPage = (maxNodes: number) => {
  const nodes: RawNodeObservation[] = [];
  const diagnostics: Diagnostic[] = [];
  const stylesToCapture = [
    'display',
    'position',
    'z-index',
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'white-space',
    'text-align',
    'text-transform',
    'text-decoration-line',
    'background-image',
    'object-fit',
    'border-top-color',
    'border-top-style',
    'line-height',
    'letter-spacing',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-radius',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'box-shadow',
    'opacity',
    'overflow',
    'overflow-x',
    'overflow-y',
    'transform',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'gap',
    'grid-template-columns',
  ];
  const idFor = (path: string) => `dom:${path}`;
  const add = (node: RawNodeObservation) => {
    if (nodes.length >= maxNodes) return false;
    nodes.push(node);
    return true;
  };
  const rectOf = (element: Element) => {
    const r = element.getBoundingClientRect();
    return {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    };
  };
  const visibleOf = (
    element: Element,
    rect: { width: number; height: number },
  ) => {
    let ancestor: Element | null = element;
    while (ancestor) {
      const computed = getComputedStyle(ancestor);
      if (
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        computed.opacity === '0'
      )
        return false;
      ancestor = ancestor.parentElement;
    }
    const style = getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const stylesOf = (element: Element) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(
      stylesToCapture.map((name) => [name, style.getPropertyValue(name)]),
    );
  };
  const clippedOf = (
    element: Element,
    rect: { x: number; y: number; width: number; height: number },
  ) => {
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (
        style.overflow !== 'visible' ||
        style.overflowX !== 'visible' ||
        style.overflowY !== 'visible'
      ) {
        const clip = rectOf(ancestor);
        if (
          rect.x < clip.x ||
          rect.y < clip.y ||
          rect.x + rect.width > clip.x + clip.width ||
          rect.y + rect.height > clip.y + clip.height
        )
          return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  };
  const walk = (
    node: Node,
    path: string,
    parentSourceNodeId: string | null,
  ) => {
    if (nodes.length >= maxNodes) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text.trim()) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      add({
        rect: {
          x: box.x + window.scrollX,
          y: box.y + window.scrollY,
          width: box.width,
          height: box.height,
        },
        visible: !!node.parentElement && visibleOf(node.parentElement, box),
        coordinateSpace: 'document',
        sourceNodeId: idFor(path),
        parentSourceNodeId,
        childSourceNodeIds: [],
        kind: 'text',
        text,
        ...(node.parentElement ? { styles: stylesOf(node.parentElement) } : {}),
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (
      ['HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(
        element.tagName,
      )
    )
      return;
    const sourceNodeId = idFor(path);
    const rect = rectOf(element);
    const childSourceNodeIds: string[] = [];
    const observation: RawNodeObservation = {
      sourceNodeId,
      parentSourceNodeId,
      childSourceNodeIds,
      kind: 'element',
      tagName: element.tagName.toLowerCase(),
      rect,
      visible: visibleOf(element, rect),
      clipped: clippedOf(element, rect),
      zIndex: getComputedStyle(element).zIndex,
      styles: stylesOf(element),
      coordinateSpace: 'document',
    };
    if (!add(observation)) return;
    if (['CANVAS', 'VIDEO', 'IFRAME'].includes(element.tagName))
      diagnostics.push({
        code: 'UNSUPPORTED_MEDIA',
        severity: 'warning',
        sourceNodeId,
        message: 'Canvas, video, and embedded documents are not reconstructed.',
      });
    const before = getComputedStyle(element, '::before');
    const after = getComputedStyle(element, '::after');
    for (const [pseudo, style] of [
      ['before', before],
      ['after', after],
    ] as const) {
      const content = style.content;
      if (content && content !== 'none' && content !== 'normal') {
        const pseudoId = idFor(`${path}:${pseudo}`);
        if (
          add({
            sourceNodeId: pseudoId,
            parentSourceNodeId: sourceNodeId,
            childSourceNodeIds: [],
            kind: 'pseudo-element',
            text: content.replace(/^['"]|['"]$/g, ''),
            rect,
            visible: observation.visible ?? false,
            pseudo,
            coordinateSpace: 'document',
          })
        )
          childSourceNodeIds.push(pseudoId);
      }
    }
    if (element.shadowRoot) {
      const shadowId = idFor(`${path}:shadow`);
      const shadowChildren: string[] = [];
      if (
        add({
          sourceNodeId: shadowId,
          parentSourceNodeId: sourceNodeId,
          childSourceNodeIds: shadowChildren,
          kind: 'shadow-root',
        })
      )
        childSourceNodeIds.push(shadowId);
      Array.from(element.shadowRoot.childNodes).forEach((child, i) => {
        const beforeCount = nodes.length;
        walk(child, `${path}:shadow.${i}`, shadowId);
        const captured = nodes[beforeCount];
        if (captured) shadowChildren.push(captured.sourceNodeId);
      });
    }
    Array.from(element.childNodes).forEach((child, i) => {
      const beforeCount = nodes.length;
      walk(child, `${path}.${i}`, sourceNodeId);
      const firstChild = nodes[beforeCount];
      if (firstChild) childSourceNodeIds.push(firstChild.sourceNodeId);
    });
    if (element.tagName === 'IFRAME') {
      try {
        const frameDocument = (element as HTMLIFrameElement).contentDocument;
        if (frameDocument === null && (element as HTMLIFrameElement).src) {
          diagnostics.push({
            code: 'INACCESSIBLE_FRAME',
            severity: 'warning',
            message: 'Iframe document was not accessible.',
            sourceNodeId,
          });
        }
      } catch {
        diagnostics.push({
          code: 'CROSS_ORIGIN_FRAME',
          severity: 'warning',
          message: 'Cross-origin iframe content was not accessible.',
          sourceNodeId,
        });
      }
    }
  };
  walk(document.documentElement, '0', null);
  if (nodes.length >= maxNodes)
    diagnostics.push({
      code: 'MAX_NODES_EXCEEDED',
      severity: 'error',
      message: `DOM capture stopped at ${maxNodes} nodes.`,
    });
  return { rootNodeId: idFor('0'), nodes, diagnostics };
};

export async function captureDom(
  page: Page,
  options: DomCaptureOptions = {},
): Promise<DomCaptureResult> {
  return page.evaluate(captureInPage, options.maxNodes ?? 15_000);
}
