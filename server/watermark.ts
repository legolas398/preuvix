import { Trustmark } from '@contentauth/c2pa-node';
import sharp from 'sharp';
import { randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';

// TrustMark (Adobe, open source): invisible watermark that survives resizing,
// recompression and cropping. BCH_5 carries 61 payload bits and corrects 5 bit errors.
export const WATERMARK_BITS = 61;
const STRENGTH = 0.95;

export function newWatermarkCode() {
  return Array.from({ length: WATERMARK_BITS }, () => randomInt(2)).join('');
}

export function watermarking(modelPath: string) {
  let engine: Promise<Trustmark> | null = null;
  // Models (~65 MB) are downloaded once into modelPath on first use.
  const load = () => {
    if (!engine) {
      mkdirSync(modelPath, { recursive: true });
      engine = Trustmark.newTrustmark({ variant: 'Q', version: 'BCH_5', modelPath }).catch(
        (error) => {
          engine = null;
          throw error;
        },
      );
    }
    return engine;
  };
  // Normalized pixels: EXIF orientation applied, metadata (GPS, device) dropped.
  const normalize = (bytes: Buffer) =>
    sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().removeAlpha().png().toBuffer({
      resolveWithObject: true,
    });
  async function protect(original: Buffer, code: string) {
    const { data, info } = await normalize(original);
    const raw = await (await load()).encode(data, STRENGTH, code);
    return sharp(raw, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 93 })
      .toBuffer();
  }
  async function read(candidate: Buffer): Promise<string | null> {
    const { data } = await normalize(candidate);
    try {
      const bits = await (await load()).decode(data);
      return /^[01]+$/.test(bits) && bits.length === WATERMARK_BITS ? bits : null;
    } catch {
      return null; // "watermark is corrupt or missing"
    }
  }
  return { protect, read, warm: () => load().then(() => undefined) };
}

const SIDE = 128;
const BLOCK = 8;
async function thumbnail(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(SIDE, SIDE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
}

/**
 * Compares a circulating copy with the original on a 16 × 16 grid of zones.
 * Returns the overall similarity and that of the most altered zone (0–100), so a
 * local retouch shows even when the rest of the image is untouched.
 */
export async function similarity(original: Buffer, candidate: Buffer) {
  const [a, b] = await Promise.all([thumbnail(original), thumbnail(candidate)]);
  let total = 0;
  let worst = 0;
  for (let by = 0; by < SIDE; by += BLOCK)
    for (let bx = 0; bx < SIDE; bx += BLOCK) {
      let block = 0;
      for (let y = by; y < by + BLOCK; y++)
        for (let x = bx; x < bx + BLOCK; x++) block += Math.abs(a[y * SIDE + x] - b[y * SIDE + x]);
      total += block;
      worst = Math.max(worst, block / (BLOCK * BLOCK));
    }
  const score = (diff: number) => Math.round((1 - diff / 255) * 1000) / 10;
  return { overall: score(total / (SIDE * SIDE)), worstZone: score(worst) };
}
