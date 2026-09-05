import { describe, expect, it } from 'vitest';

import { startFixtureServer } from './fixture-server.js';
import { openBrowserSession } from './session.js';
import { captureDom } from './dom-capture.js';
import { captureAssets } from './asset-capture.js';
import { captureScreenshot } from './screenshot.js';

describe('asset capture', () => {
  it('captures screenshot dimensions and deduplicated inline assets', async () => {
    const pixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const fixture = await startFixtureServer(
      `<img src="${pixel}"><img src="${pixel}"><svg width="10" height="20"><rect width="10" height="20"/></svg>`,
    );
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });
    try {
      const screenshot = await captureScreenshot(session.page);
      expect(screenshot.width).toBe(800);
      expect(screenshot.height).toBeGreaterThanOrEqual(600);
      expect(screenshot.bytes.byteLength).toBeGreaterThan(0);
      const dom = await captureDom(session.page);
      const result = await captureAssets(session.page);
      for (const asset of result.assets) {
        expect(
          dom.nodes.find((node) => node.sourceNodeId === asset.sourceNodeId)
            ?.tagName,
        ).toBe(asset.kind === 'svg' ? 'svg' : 'img');
      }
      expect(new Set(result.assets.map((asset) => asset.assetId)).size).toBe(3);
      expect(result.assets).toHaveLength(3);
      expect(result.assets[0]?.contentHash).toBe(result.assets[1]?.contentHash);
      expect(
        result.assets.find((asset) => asset.kind === 'svg')?.mimeType,
      ).toBe('image/svg+xml');
      expect(result.diagnostics).toEqual([]);
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);

  it('captures a rendered video element when no poster or readable frame exists', async () => {
    const fixture = await startFixtureServer(
      '<video style="display:block;width:160px;height:90px;background:rgb(12,34,56)"></video>',
    );
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });
    try {
      const dom = await captureDom(session.page);
      const video = dom.nodes.find((node) => node.tagName === 'video');
      const result = await captureAssets(session.page);
      expect(result.assets).toContainEqual(
        expect.objectContaining({
          sourceNodeId: video?.sourceNodeId,
          kind: 'image',
          mimeType: 'image/png',
          width: 160,
          height: 90,
        }),
      );
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);

  it('keeps transformed carousel panels as individual editable images', async () => {
    const pixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const fixture = await startFixtureServer(`
      <div id="carousel" style="width:300px;height:100px;overflow-x:hidden">
        <div style="display:flex;transform:translateX(-20px)">
          <img src="${pixel}" style="width:100px;height:100px">
          <img src="${pixel}" style="width:100px;height:100px">
          <img src="${pixel}" style="width:100px;height:100px">
        </div>
      </div>
    `);
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });
    try {
      const dom = await captureDom(session.page);
      const imageNodeIds = dom.nodes
        .filter((node) => node.tagName === 'img')
        .map((node) => node.sourceNodeId);
      const result = await captureAssets(session.page);
      expect(result.assets).toHaveLength(3);
      expect(result.assets.map((asset) => asset.sourceNodeId)).toEqual(
        imageNodeIds,
      );
      expect(result.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'image',
            width: 1,
            height: 1,
          }),
        ]),
      );
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);
});
