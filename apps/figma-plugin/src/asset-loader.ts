import type { AssetReference } from '@website-to-figma/contracts';
export function indexAssets(
  assets: readonly AssetReference[],
): Map<string, AssetReference> {
  return new Map(assets.map((asset) => [asset.assetId, asset]));
}
