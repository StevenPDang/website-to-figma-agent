import type {
  Diagnostic,
  FigmaSceneArtifact,
  ImportResultArtifact,
} from '@website-to-figma/contracts';
import { importScene } from './importer.js';
import type { FigmaAdapter } from './figma-adapter.js';
import { loadFont } from './font-loader.js';
import { indexAssets } from './asset-loader.js';

export function importAdvancedScene(
  scene: FigmaSceneArtifact,
  adapter: FigmaAdapter,
  availableFonts = new Set(['Inter']),
): ImportResultArtifact {
  const diagnostics: Diagnostic[] = [];
  const assets = indexAssets(scene.payload.assets);
  for (const node of scene.payload.nodes) {
    const family = node.styles?.['font-family'];
    if (family) {
      const familyName = family.split(',')[0] ?? family;
      const result = loadFont(
        familyName.trim().replace(/["']/g, ''),
        availableFonts,
      );
      if (result.substituted)
        diagnostics.push({
          code: 'FONT_SUBSTITUTED',
          severity: 'warning',
          message: result.diagnostic ?? 'Font substitution applied.',
          sourceNodeId: node.sourceNodeId,
        });
    }
    if (node.kind === 'image' || node.kind === 'svg') {
      const assetId = node.styles?.['asset-id'];
      if (assetId && !assets.has(assetId))
        diagnostics.push({
          code: 'ASSET_MISSING',
          severity: 'error',
          message: `Missing asset ${assetId}.`,
          sourceNodeId: node.sourceNodeId,
        });
    }
  }
  const result = importScene(scene, adapter);
  return {
    ...result,
    payload: {
      ...result.payload,
      status: diagnostics.some((item) => item.severity === 'error')
        ? 'partial'
        : diagnostics.length
          ? 'partial'
          : result.payload.status,
      diagnostics,
    },
  };
}
