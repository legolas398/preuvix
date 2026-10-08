import { createHash } from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import type { Provenance } from '../shared/types';
import { HEIF_MESSAGE, photoFormat } from '../shared/photo-format';
import { aiMetadataSignals, pngText } from './ai-metadata';

export const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

export async function inspectImage(bytes: Buffer) {
  if (photoFormat(bytes.subarray(0, 256)) === 'heif') throw new Error(HEIF_MESSAGE);
  let metadata;
  try {
    metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: false,
    }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1)
      throw new Error();
    // Decode all pixels to reject truncated files; original bytes remain untouched.
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).stats();
  } catch {
    throw new Error(
      'Photo invalide. Utilisez un JPEG, PNG ou WebP non animé, de 40 mégapixels maximum.',
    );
  }
  let tags: Record<string, unknown> = {};
  try {
    tags =
      (await exifr.parse(bytes, {
        pick: ['Software', 'CreatorTool', 'ImageDescription', 'UserComment'],
        gps: false,
      })) || {};
  } catch {
    /* Missing metadata is normal. */
  }
  const text = [
    JSON.stringify(tags),
    metadata.xmp?.toString('utf8') || '',
    metadata.exif?.toString('utf8') || '',
    ...pngText(bytes),
  ];
  const signals = aiMetadataSignals(text);
  // C2PA markers are only hints here: no signature or trust validation is implied.
  const raw = bytes.toString('latin1');
  const credentialsDetected = raw.includes('c2pa') || raw.includes('C2PA');
  const provenance: Provenance = {
    result: signals.length ? 'signals_found' : 'inconclusive',
    signals,
    credentialsDetected,
    explanation:
      'Analyse limitée de métadonnées non authentifiées. Ces indices peuvent être retirés ou falsifiés. Leur présence ne prouve pas une génération IA ; leur absence ne prouve pas une capture réelle. Les signatures C2PA ne sont pas validées.',
  };
  return {
    width: metadata.width,
    height: metadata.height,
    mime: metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`,
    provenance,
  };
}
