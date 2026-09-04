import { describe, expect, it } from 'vitest';

import { startFixtureServer } from './fixture-server.js';
import { captureDom } from './dom-capture.js';
import { openBrowserSession } from './session.js';

describe('captureDom', () => {
  it('captures deterministic hierarchy, text, geometry, visibility, and styles', async () => {
    const fixture = await startFixtureServer(
      '<main><h1>Hello</h1><p style="display:none">Hidden</p></main>',
    );
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });
    try {
      const capture = await captureDom(session.page);
      const heading = capture.nodes.find((node) => node.tagName === 'h1');
      const text = capture.nodes.find(
        (node) => node.kind === 'text' && node.text === 'Hello',
      );
      const hidden = capture.nodes.find((node) => node.tagName === 'p');
      expect(capture.rootNodeId).toBe('dom:0');
      expect(heading?.coordinateSpace).toBe('document');
      expect(heading?.rect?.width).toBeGreaterThan(0);
      expect(heading?.styles?.display).toBe('block');
      expect(text?.parentSourceNodeId).toBe(heading?.sourceNodeId);
      expect(hidden?.visible).toBe(false);
      expect(capture.diagnostics).toEqual([]);
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);

  it('returns a structured limit diagnostic', async () => {
    const fixture = await startFixtureServer('<main><h1>Hello</h1></main>');
    const session = await openBrowserSession({
      url: fixture.url,
      viewport: { width: 800, height: 600 },
      allowLoopback: true,
    });
    try {
      const capture = await captureDom(session.page, { maxNodes: 2 });
      expect(capture.nodes).toHaveLength(2);
      expect(capture.diagnostics[0]?.code).toBe('MAX_NODES_EXCEEDED');
    } finally {
      await session.close();
      await fixture.close();
    }
  }, 20_000);
});
