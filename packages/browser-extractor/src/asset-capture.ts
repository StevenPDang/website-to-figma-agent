import { assertNavigableUrl } from './url-policy.js';
import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import type { AssetReference, Diagnostic } from '@website-to-figma/contracts';

export interface AssetCaptureOptions {
  maxAssetBytes?: number;
  allowLoopback?: boolean;
}
export interface CapturedAsset extends AssetReference {
  bytes: Buffer;
}
export interface AssetCaptureResult {
  assets: CapturedAsset[];
  diagnostics: Diagnostic[];
}

interface DiscoveredAsset {
  sourceNodeId: string;
  kind: 'image' | 'svg';
  url?: string;
  markup?: string;
  width: number;
  height: number;
}

async function convertRasterToPng(
  page: Page,
  bytes: Buffer,
  mimeType: string,
): Promise<Buffer> {
  if (!/^image\/(?:webp|avif)$/i.test(mimeType)) return bytes;
  const base64 = bytes.toString('base64');
  const encoded = await page.evaluate(
    async ({ base64: input, mime }) => {
      const image = new Image();
      image.src = `data:${mime};base64,${input}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    },
    { base64, mime: mimeType },
  );
  if (!encoded) throw new Error('Raster conversion returned no data');
  return Buffer.from(encoded, 'base64');
}

const discoverAssets = () => {
  const result: DiscoveredAsset[] = [];
  const walk = (node: Node, path: string) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const rect = element.getBoundingClientRect();
    if (element.tagName.toLowerCase() === 'img') {
      const image = element as HTMLImageElement;
      result.push({
        sourceNodeId: `dom:${path}`,
        kind: 'image',
        url: image.currentSrc || image.src,
        width: image.naturalWidth || rect.width,
        height: image.naturalHeight || rect.height,
      });
    } else if (element.tagName.toLowerCase() === 'svg') {
      result.push({
        sourceNodeId: `dom:${path}`,
        kind: 'svg',
        markup: element.outerHTML,
        width: rect.width,
        height: rect.height,
      });
    }
    element.shadowRoot?.childNodes.forEach((child, i) => {
      walk(child, `${path}:shadow.${i}`);
    });
    element.childNodes.forEach((child, i) => {
      walk(child, `${path}.${i}`);
    });
  };
  walk(document.documentElement, '0');
  return result;
};

export async function captureAssets(
  page: Page,
  options: AssetCaptureOptions = {},
): Promise<AssetCaptureResult> {
  const discovered = await page.evaluate(discoverAssets);
  const maxBytes = options.maxAssetBytes ?? 500 * 1024 * 1024;
  const assets: CapturedAsset[] = [];
  const diagnostics: Diagnostic[] = [];
  const byHash = new Map<string, CapturedAsset>();
  let totalBytes = 0;
  const deadline = Date.now() + 60_000;
  for (const item of discovered) {
    if (Date.now() > deadline) {
      diagnostics.push({
        code: 'ASSET_TIMEOUT',
        severity: 'error',
        message: 'Asset capture exceeded its time limit.',
      });
      break;
    }
    try {
      let bytes: Buffer;
      let mimeType =
        item.kind === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
      if (item.kind === 'svg') bytes = Buffer.from(item.markup ?? '', 'utf8');
      else if (item.url?.startsWith('data:')) {
        const match = item.url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!match) throw new Error('Invalid data URL');
        mimeType = match[1] ?? mimeType;
        bytes = match[2]
          ? Buffer.from(match[3] ?? '', 'base64')
          : Buffer.from(decodeURIComponent(match[3] ?? ''), 'utf8');
      } else {
        if (!item.url) throw new Error('Image has no source URL');
        const assetUrl = assertNavigableUrl(item.url, {
          allowLoopback: options.allowLoopback ?? false,
        });
        const response = await page.request.get(assetUrl.href, {
          maxRedirects: 0,
          timeout: Math.max(1, Math.min(10_000, deadline - Date.now())),
        });
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        mimeType =
          response.headers()['content-type']?.split(';')[0] ?? mimeType;
        bytes = await response.body();
      }
      const originalMimeType = mimeType;
      bytes = await convertRasterToPng(page, bytes, originalMimeType);
      if (/image\/(?:webp|avif)/i.test(originalMimeType))
        mimeType = 'image/png';
      if (bytes.byteLength + totalBytes > maxBytes) {
        diagnostics.push({
          code: 'ASSET_TOO_LARGE',
          severity: 'error',
          message: `Asset exceeds ${maxBytes} bytes.`,
          sourceNodeId: item.sourceNodeId,
        });
        continue;
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      const existing = byHash.get(hash);
      if (existing) {
        assets.push({
          ...existing,
          assetId: `asset:${item.sourceNodeId.slice(4)}`,
          sourceNodeId: item.sourceNodeId,
        });
        continue;
      }
      const asset: CapturedAsset = {
        assetId: `asset:${item.sourceNodeId.slice(4)}`,
        sourceNodeId: item.sourceNodeId,
        kind: item.kind,
        contentHash: hash,
        mimeType,
        width: item.width,
        height: item.height,
        byteLength: bytes.byteLength,
        bytes,
      };
      totalBytes += bytes.byteLength;
      byHash.set(hash, asset);
      assets.push(asset);
    } catch (error) {
      diagnostics.push({
        code: 'ASSET_RETRIEVAL_FAILED',
        severity: 'warning',
        message:
          error instanceof Error ? error.message : 'Asset retrieval failed.',
        sourceNodeId: item.sourceNodeId,
      });
    }
  }
  return { assets, diagnostics };
}
