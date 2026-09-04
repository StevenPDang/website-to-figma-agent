export interface FontLoadResult {
  fontFamily: string;
  substituted: boolean;
  diagnostic?: string;
}
export function loadFont(
  fontFamily: string,
  available: ReadonlySet<string>,
  fallback = 'Inter',
): FontLoadResult {
  if (available.has(fontFamily)) return { fontFamily, substituted: false };
  return {
    fontFamily: fallback,
    substituted: true,
    diagnostic: `Font ${fontFamily} unavailable; substituted with ${fallback}.`,
  };
}
