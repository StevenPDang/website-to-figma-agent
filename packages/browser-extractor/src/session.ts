import { existsSync } from 'node:fs';

import { chromium, type Page } from 'playwright';

import { assertNavigableUrl } from './url-policy.js';

export interface BrowserViewport {
  width: number;
  height: number;
}

export interface BrowserSessionOptions {
  url: string;
  viewport: BrowserViewport;
  allowLoopback?: boolean;
  executablePath?: string;
  timeoutMs?: number;
  maxDocumentHeight?: number;
  maxNodes?: number;
}

export interface BrowserSession {
  page: Page;
  finalUrl: string;
  viewport: BrowserViewport;
  documentSize: { width: number; height: number };
  nodeCount: number;
  close: () => Promise<void>;
}

const defaultChromePath =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function openBrowserSession(
  options: BrowserSessionOptions,
): Promise<BrowserSession> {
  const url = assertNavigableUrl(options.url, {
    ...(options.allowLoopback === undefined
      ? {}
      : { allowLoopback: options.allowLoopback }),
  });
  const executablePath = options.executablePath ?? defaultChromePath;
  if (!existsSync(executablePath)) {
    throw new Error(`Chrome executable not found at ${executablePath}`);
  }

  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext({ viewport: options.viewport });
    const page = await context.newPage();
    await page.goto(url.href, {
      timeout: options.timeoutMs ?? 10_000,
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => {
      await Promise.race([
        Promise.all([
          document.fonts.ready,
          ...Array.from(document.images).map((image) =>
            image.decode().catch(() => {}),
          ),
        ]),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    });
    const metrics = await page.evaluate(() => ({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ),
      nodeCount: document.querySelectorAll('*').length,
    }));

    const maxHeight = options.maxDocumentHeight ?? 30_000;
    const maxNodes = options.maxNodes ?? 15_000;
    if (metrics.height > maxHeight) {
      throw new Error(
        `Page document height ${metrics.height} exceeds limit ${maxHeight}`,
      );
    }
    if (metrics.nodeCount > maxNodes) {
      throw new Error(
        `Page node count ${metrics.nodeCount} exceeds limit ${maxNodes}`,
      );
    }

    return {
      page,
      finalUrl: page.url(),
      viewport: options.viewport,
      documentSize: { width: metrics.width, height: metrics.height },
      nodeCount: metrics.nodeCount,
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
