import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareImages } from './compare.js';

describe('compareImages', () => {
  it('passes identical images and fails dimension mismatches', () => {
    const image = {
      bytes: PNG.sync.write(
        Object.assign(new PNG({ width: 2, height: 2 }), {
          data: Buffer.alloc(16, 255),
        }),
      ),
      width: 2,
      height: 2,
    };
    expect(compareImages(image, image).payload.status).toBe('pass');
    const mismatch = compareImages(image, {
      bytes: PNG.sync.write(
        Object.assign(new PNG({ width: 3, height: 2 }), {
          data: Buffer.alloc(24, 255),
        }),
      ),
      width: 3,
      height: 2,
    });
    expect(mismatch.payload.status).toBe('fail');
    expect(mismatch.payload.diagnostics[0]?.code).toBe('DIMENSION_MISMATCH');
  });
});
