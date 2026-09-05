export interface RgbaImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** RGBA pixels, composited on white. SSIM uses non-overlapping 8px windows. */
export function comparePixels(reference: RgbaImage, candidate: RgbaImage) {
  for (const image of [reference, candidate]) {
    if (
      !Number.isSafeInteger(image.width) ||
      !Number.isSafeInteger(image.height) ||
      image.width <= 0 ||
      image.height <= 0 ||
      image.bytes.length !== image.width * image.height * 4
    )
      throw new Error('Invalid RGBA image dimensions or buffer');
  }
  if (
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  )
    return { ssim: 0, changedPixelRatio: 1 };
  const channel = (image: RgbaImage, offset: number, component: number) => {
    const alpha = (image.bytes[offset + 3] ?? 0) / 255;
    return (image.bytes[offset + component] ?? 0) * alpha + 255 * (1 - alpha);
  };
  let changed = 0;
  let totalSsim = 0;
  let windows = 0;
  for (let top = 0; top < reference.height; top += 8) {
    for (let left = 0; left < reference.width; left += 8) {
      let count = 0,
        sumA = 0,
        sumB = 0,
        squareA = 0,
        squareB = 0,
        product = 0;
      for (let y = top; y < Math.min(top + 8, reference.height); y++) {
        for (let x = left; x < Math.min(left + 8, reference.width); x++) {
          const offset = (y * reference.width + x) * 4;
          let a = 0,
            b = 0,
            different = false;
          for (let c = 0; c < 3; c++) {
            const ca = channel(reference, offset, c),
              cb = channel(candidate, offset, c);
            different ||= Math.abs(ca - cb) > 16;
            const weight = [0.2126, 0.7152, 0.0722][c] ?? 0;
            a += ca * weight;
            b += cb * weight;
          }
          if (different) changed++;
          count++;
          sumA += a;
          sumB += b;
          squareA += a * a;
          squareB += b * b;
          product += a * b;
        }
      }
      const meanA = sumA / count,
        meanB = sumB / count;
      const varianceA = Math.max(0, squareA / count - meanA * meanA);
      const varianceB = Math.max(0, squareB / count - meanB * meanB);
      const covariance = product / count - meanA * meanB;
      totalSsim +=
        ((2 * meanA * meanB + 6.5025) * (2 * covariance + 58.5225)) /
        ((meanA * meanA + meanB * meanB + 6.5025) *
          (varianceA + varianceB + 58.5225));
      windows++;
    }
  }
  return {
    ssim: Math.max(0, Math.min(1, totalSsim / windows)),
    changedPixelRatio: changed / (reference.width * reference.height),
  };
}
