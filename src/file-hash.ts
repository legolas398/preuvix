import { MAX_PHOTO_BYTES } from '../shared/photo-format';

export async function sha256File(file: File): Promise<string> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Choisissez un fichier de 50 Mo maximum.');
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'Le calcul SHA-256 nécessite HTTPS ou localhost. Ouvrez PREUVIX sur une adresse sécurisée.',
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
