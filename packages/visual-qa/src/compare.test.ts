import { describe, expect, it } from 'vitest';
import { compareImages } from './compare.js';

describe('compareImages', () => {
  it('passes identical images and fails dimension mismatches', () => {
    const image = { bytes: new Uint8Array([1, 2, 3]), width: 2, height: 2 };
    expect(compareImages(image, image).payload.status).toBe('pass');
    const mismatch = compareImages(image, {
      bytes: image.bytes,
      width: 3,
      height: 2,
    });
    expect(mismatch.payload.status).toBe('fail');
    expect(mismatch.payload.diagnostics[0]?.code).toBe('DIMENSION_MISMATCH');
  });
});
