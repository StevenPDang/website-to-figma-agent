import type { Page } from 'playwright';

export interface ScreenshotOptions {
  fullPage?: boolean;
  maxBytes?: number;
}

export interface ScreenshotResult {
  bytes: Buffer;
  width: number;
  height: number;
  diagnostics: {
    code: string;
    severity: 'warning' | 'error';
    message: string;
  }[];
}

export async function captureScreenshot(
  page: Page,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const fullPage = options.fullPage ?? true;
  const bytes = await page.screenshot({ type: 'png', fullPage });
  const maxBytes = options.maxBytes ?? 500 * 1024 * 1024;
  const diagnostics: ScreenshotResult['diagnostics'] = [];
  if (bytes.byteLength > maxBytes) {
    diagnostics.push({
      code: 'SCREENSHOT_TOO_LARGE',
      severity: 'error',
      message: `Screenshot is ${bytes.byteLength} bytes, exceeding limit ${maxBytes}.`,
    });
  }
  const dimensions = await page.evaluate(
    (isFullPage) => ({
      width: isFullPage
        ? Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          )
        : window.innerWidth,
      height: isFullPage
        ? Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
          )
        : window.innerHeight,
    }),
    fullPage,
  );
  return {
    bytes,
    width: dimensions.width,
    height: dimensions.height,
    diagnostics,
  };
}
