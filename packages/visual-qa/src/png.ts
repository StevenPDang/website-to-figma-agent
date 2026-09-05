import { PNG } from 'pngjs';
import type { RgbaImage } from './pixels.js';
export function decodePng(bytes: Uint8Array): RgbaImage {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 33 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.subarray(12, 16).toString() !== 'IHDR'
  )
    throw new Error('Invalid PNG header');
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width * height > 50_000_000 ||
    buffer.length > 500 * 1024 * 1024
  )
    throw new Error('PNG dimensions exceed limit');
  const decoded = PNG.sync.read(buffer, { checkCRC: true });
  return { bytes: decoded.data, width: decoded.width, height: decoded.height };
}
