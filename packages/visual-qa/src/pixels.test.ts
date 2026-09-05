import { expect, it } from 'vitest';
import { comparePixels } from './pixels.js';

it('measures changed pixels and local structural similarity', () => {
  const bytes = new Uint8Array(16 * 16 * 4).fill(255);
  const original = { bytes, width: 16, height: 16 };
  expect(comparePixels(original, original)).toMatchObject({
    ssim: 1,
    changedPixelRatio: 0,
  });
  const changed = bytes.slice();
  changed.fill(0, 0, 3);
  const result = comparePixels(original, { ...original, bytes: changed });
  expect(result.changedPixelRatio).toBe(1 / 256);
  expect(result.ssim).toBeLessThan(1);
  expect(result.ssim).toBeGreaterThan(0);
});

it('composites transparency on white and rejects malformed buffers', () => {
  expect(
    comparePixels(
      { bytes: new Uint8Array([0, 0, 0, 0]), width: 1, height: 1 },
      { bytes: new Uint8Array([255, 255, 255, 255]), width: 1, height: 1 },
    ).changedPixelRatio,
  ).toBe(0);
  expect(() =>
    comparePixels(
      { bytes: new Uint8Array(1), width: 1, height: 1 },
      { bytes: new Uint8Array(4), width: 1, height: 1 },
    ),
  ).toThrow();
});
