import { describe, expect, it } from 'vitest';

import { startFixtureServer } from './fixture-server.js';
import { openBrowserSession } from './session.js';

describe('openBrowserSession', () => {
  it('opens the deterministic fixture at the requested viewport and cleans up', async () => {
    const fixture = await startFixtureServer();
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });

    try {
      expect(await session.page.title()).toBe('Website-to-Figma Fixture');
      expect(session.viewport).toEqual({ width: 800, height: 600 });
      expect(session.documentSize.height).toBeGreaterThan(600);
      expect(session.nodeCount).toBeGreaterThan(0);
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);

  it('rejects a fixture that exceeds the configured document-height limit', async () => {
    const fixture = await startFixtureServer(
      '<main style="height: 2000px">Fixture</main>',
    );

    await expect(
      openBrowserSession({
        url: fixture.url,
        viewport: { width: 800, height: 600 },
        allowLoopback: true,
        maxDocumentHeight: 1000,
      }),
    ).rejects.toThrow('document height');

    await fixture.close();
  }, 20_000);
});
