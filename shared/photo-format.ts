export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const HEIF_MESSAGE =
  'Ce fichier HEIC/HEIF n’est pas pris en charge dans ce pilote. Exportez une copie JPEG depuis votre photothèque, puis importez-la. PREUVIX conservera et calculera l’empreinte de cette copie, pas celle du fichier HEIC initial.';

// Format hints only. The server still fully decodes accepted images before storage.
export function photoFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heif' | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') {
    const brands = new Set([
      'heic',
      'heix',
      'hevc',
      'hevx',
      'heim',
      'heis',
      'hevm',
      'hevs',
      'mif1',
      'msf1',
    ]);
    if (brands.has(ascii(8, 12))) return 'heif';
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.length, 256); offset += 4) {
      if (brands.has(ascii(offset, offset + 4))) return 'heif';
    }
  }
  return null;
}
