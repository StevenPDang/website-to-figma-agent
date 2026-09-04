import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import type { AssetReference, Diagnostic } from '@website-to-figma/contracts';

export interface AssetCaptureOptions {
  maxAssetBytes?: number;
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

const discoverAssets = () => {
  const result: DiscoveredAsset[] = [];
  document.querySelectorAll('img').forEach((element, index) => {
    const image = element;
    result.push({
      sourceNodeId: `dom:${index}`,
      kind: 'image',
      url: image.currentSrc || image.src,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    });
  });
  document.querySelectorAll('svg').forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    result.push({
      sourceNodeId: `dom:svg-${index}`,
      kind: 'svg',
      markup: element.outerHTML,
      width: rect.width,
      height: rect.height,
    });
  });
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
  for (const item of discovered) {
    try {
      let bytes: Buffer;
      let mimeType =
        item.kind === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
      if (item.kind === 'svg') bytes = Buffer.from(item.markup ?? '', 'utf8');
      else if (item.url?.startsWith('data:')) {
        const match = item.url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!match) throw new Error('Invalid data URL');
        mimeType = match[1] ?? mimeType;
        bytes = Buffer.from(match[3] ?? '', match[2] ? 'base64' : 'utf8');
      } else {
        if (!item.url) throw new Error('Image has no source URL');
        const response = await page.request.get(item.url);
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        mimeType =
          response.headers()['content-type']?.split(';')[0] ?? mimeType;
        bytes = await response.body();
      }
      if (bytes.byteLength > maxBytes) {
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
          assetId: `asset:${hash}`,
          sourceNodeId: item.sourceNodeId,
        });
        continue;
      }
      const asset: CapturedAsset = {
        assetId: `asset:${hash}`,
        sourceNodeId: item.sourceNodeId,
        kind: item.kind,
        contentHash: hash,
        mimeType,
        width: item.width,
        height: item.height,
        byteLength: bytes.byteLength,
        bytes,
      };
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
