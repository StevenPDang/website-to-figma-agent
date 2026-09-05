import { expect, it } from 'vitest';
import { startFixtureServer } from './fixture-server.js';
import { openBrowserSession } from './session.js';
import { preparePageForCapture } from './stabilize.js';

it('loads scroll-triggered content, returns to the top, and pauses media', async () => {
  const fixture = await startFixtureServer(`
    <main style="height:1800px"></main>
    <video id="media"></video>
    <script>
      HTMLMediaElement.prototype.pause = function () { this.dataset.paused = 'true'; };
      addEventListener('scroll', () => {
        if (scrollY > 500 && !document.querySelector('#lazy')) {
          const node = document.createElement('div');
          node.id = 'lazy';
          document.body.append(node);
        }
      });
    </script>
  `);
  const session = await openBrowserSession({
    url: fixture.url,
    viewport: { width: 800, height: 600 },
    allowLoopback: true,
  });
  try {
    await preparePageForCapture(session.page, { mediaTimeoutMs: 10 });
    expect(
      await session.page.evaluate(() => ({
        lazy: !!document.querySelector('#lazy'),
        paused: document.querySelector('video')?.dataset.paused,
        scrollY,
      })),
    ).toEqual({ lazy: true, paused: 'true', scrollY: 0 });
  } finally {
    await session.close();
    await fixture.close();
  }
});

it('suppresses a cookie consent popup and backdrop without hiding ordinary privacy content', async () => {
  const fixture = await startFixtureServer(`
    <main id="content">Read our privacy guide for account settings.</main>
    <div id="consent-backdrop" style="position:fixed;inset:0;background:#0008"></div>
    <section
      id="consent-dialog"
      role="dialog"
      aria-modal="true"
      style="position:fixed;right:10px;bottom:10px;width:420px;height:220px;z-index:20"
    >
      <h2>Manage Consent</h2>
      <p>We use cookies to store and access device information.</p>
      <button>Accept</button><button>Reject</button>
    </section>
  `);
  const session = await openBrowserSession({
    url: fixture.url,
    viewport: { width: 800, height: 600 },
    allowLoopback: true,
  });
  try {
    const result = await preparePageForCapture(session.page, {
      mediaTimeoutMs: 10,
    });
    expect(
      await session.page.evaluate(() => {
        const display = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing fixture element: ${selector}`);
          return getComputedStyle(element).display;
        };
        return {
          backdrop: display('#consent-backdrop'),
          content: display('#content'),
          dialog: display('#consent-dialog'),
        };
      }),
    ).toEqual({ backdrop: 'none', content: 'block', dialog: 'none' });
    expect(result.diagnostics).toEqual([
      {
        code: 'CONSENT_OVERLAY_SUPPRESSED',
        severity: 'warning',
        message:
          'Suppressed 2 cookie or consent overlay elements locally without activating controls.',
      },
    ]);
  } finally {
    await session.close();
    await fixture.close();
  }
});
