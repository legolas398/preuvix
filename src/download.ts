import { Capacitor } from '@capacitor/core';
import { appFetch } from './transport';

export async function saveBlob(blob: Blob, name: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const safeName = name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180);
  const path = `exports/${crypto.randomUUID()}-${safeName}`;
  const file = await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: '',
    recursive: true,
  });
  try {
    // Small bridge messages also support video and multi-file exports.
    for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(blob.slice(offset, offset + 512 * 1024));
      });
      await Filesystem.appendFile({ path, directory: Directory.Cache, data });
    }
  } catch (error) {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    throw error;
  }
  await Share.share({ title: name, files: [file.uri], dialogTitle: 'Enregistrer ou partager' });
}

export async function downloadFile(url: string, name?: string) {
  const response = await appFetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Téléchargement impossible. Reconnectez-vous puis réessayez.');
  }
  const blob = await response.blob();
  const extension =
    (
      {
        'application/pdf': 'pdf',
        'application/zip': 'zip',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'video/webm': 'webm',
        'video/mp4': 'mp4',
        'application/json': 'json',
      } as Record<string, string>
    )[blob.type] || 'bin';
  const suggested = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1];
  await saveBlob(blob, name || suggested || `preuvix-${url.split('/').at(-1)}.${extension}`);
}
