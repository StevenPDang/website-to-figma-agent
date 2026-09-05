import type { Diagnostic } from '@website-to-figma/contracts';
import type { Page } from 'playwright';

export interface PreparePageOptions {
  mediaTimeoutMs?: number;
}

export interface PreparePageResult {
  diagnostics: Diagnostic[];
}

async function suppressConsentOverlays(page: Page): Promise<number> {
  return page.evaluate(() => {
    const marker = 'data-website-to-figma-consent-suppressed';
    const getParentElement = (element: Element): Element | null => {
      if (element.parentElement) return element.parentElement;
      const root = element.getRootNode();
      return root instanceof ShadowRoot ? root.host : null;
    };
    const collectElements = (root: Document | ShadowRoot): Element[] => {
      const elements = [...root.querySelectorAll('*')];
      for (const element of [...elements]) {
        if (element.shadowRoot)
          elements.push(...collectElements(element.shadowRoot));
      }
      return elements;
    };
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0 &&
        rect.width >= 40 &&
        rect.height >= 24
      );
    };
    const hasConsentIntent = (element: Element) => {
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      const metadata = [
        element.id,
        element.className,
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('title') ?? '',
      ]
        .join(' ')
        .toLowerCase();
      const explicitText =
        /\bmanage\s+(?:cookie\s+)?consent\b/i.test(text) ||
        /\bcookie\s+(?:consent|preferences|settings|policy)\b/i.test(text) ||
        (/\bcookies?\b/i.test(text) &&
          /\b(?:accept|allow|consent|preferences|reject|necessary)\b/i.test(
            text,
          ));
      const knownManager =
        /(?:cookiebot|cookieyes|cookie[-_]?consent|consent[-_]?manager|onetrust|osano|quantcast|trustarc|usercentrics|gdpr)/i.test(
          metadata,
        );
      return explicitText || knownManager;
    };
    const fixedContainer = (element: Element): HTMLElement | null => {
      let current: Element | null = element;
      let container: HTMLElement | null = null;
      while (current && current !== document.documentElement) {
        const position = getComputedStyle(current).position;
        if (
          current instanceof HTMLElement &&
          (position === 'fixed' || position === 'sticky')
        )
          container = current;
        current = getParentElement(current);
      }
      return container;
    };
    const roots = new Set<HTMLElement>();
    for (const element of collectElements(document)) {
      if (!isVisible(element) || !hasConsentIntent(element)) continue;
      const container = fixedContainer(element);
      if (container) roots.add(container);
    }
    const suppressed = new Set<HTMLElement>(roots);
    for (const root of roots) {
      const parent = getParentElement(root);
      if (!parent) continue;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || sibling === root) continue;
        const style = getComputedStyle(sibling);
        const rect = sibling.getBoundingClientRect();
        const identity = `${sibling.id} ${sibling.className}`;
        const isNamedBackdrop = /(?:backdrop|overlay|scrim)/i.test(identity);
        const fillsViewport =
          rect.width >= window.innerWidth * 0.8 &&
          rect.height >= window.innerHeight * 0.8;
        if (
          isNamedBackdrop &&
          fillsViewport &&
          (style.position === 'fixed' || style.position === 'sticky')
        )
          suppressed.add(sibling);
      }
    }
    let count = 0;
    for (const element of suppressed) {
      if (element.hasAttribute(marker)) continue;
      element.setAttribute(marker, 'true');
      element.style.setProperty('display', 'none', 'important');
      count += 1;
    }
    return count;
  });
}

export async function preparePageForCapture(
  page: Page,
  options: PreparePageOptions = {},
): Promise<PreparePageResult> {
  let suppressedConsentElements = await suppressConsentOverlays(page);
  await page.evaluate(async (mediaTimeoutMs) => {
    const frame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    const step = Math.max(1, Math.floor(window.innerHeight * 0.8));
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await frame();
    }
    window.scrollTo(0, height);
    await frame();
    window.scrollTo(0, 0);

    const videos = [...document.querySelectorAll('video')];
    await Promise.race([
      Promise.all(
        videos.map((video) =>
          video.readyState >= 2
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                video.addEventListener(
                  'loadeddata',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              }),
        ),
      ),
      new Promise<void>((resolve) => {
        setTimeout(resolve, mediaTimeoutMs);
      }),
    ]);
    videos.forEach((video) => {
      video.pause();
    });
    await frame();
    await frame();
  }, options.mediaTimeoutMs ?? 3000);
  suppressedConsentElements += await suppressConsentOverlays(page);
  return {
    diagnostics:
      suppressedConsentElements > 0
        ? [
            {
              code: 'CONSENT_OVERLAY_SUPPRESSED',
              severity: 'warning',
              message: `Suppressed ${suppressedConsentElements} cookie or consent overlay elements locally without activating controls.`,
            },
          ]
        : [],
  };
}
