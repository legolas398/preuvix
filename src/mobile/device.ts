import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { LocationSample } from '../../shared/capture';
import { mobileFetch } from './api';

export async function readLocation(): Promise<LocationSample> {
  try {
    const permission = Capacitor.isNativePlatform()
      ? await Geolocation.requestPermissions({ permissions: ['location'] })
      : null;
    if (permission && permission.location === 'denied' && permission.coarseLocation === 'denied')
      return { status: 'denied' };
    const value = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    return {
      status: 'recorded',
      source: 'android_geolocation',
      latitude: value.coords.latitude,
      longitude: value.coords.longitude,
      accuracy: value.coords.accuracy,
      measuredAt: new Date(value.timestamp).toISOString(),
    };
  } catch (error) {
    const message = String((error as Error).message);
    return { status: /denied|permission|refus/i.test(message) ? 'denied' : 'unavailable' };
  }
}
export async function photoFile(photo: { webPath?: string; uri?: string }) {
  const uri = photo.uri ? Capacitor.convertFileSrc(photo.uri) : photo.webPath;
  if (!uri) throw new Error('La caméra n’a renvoyé aucun fichier.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Impossible de lire la photo de la caméra.');
  const blob = await response.blob();
  return new File([blob], `capture-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
}
export async function capturePhoto() {
  // No resizing, editing or gallery write. JPEG processing is explicitly disclosed in UI/manifest.
  return photoFile(
    await Camera.takePhoto({
      quality: 100,
      saveToGallery: false,
      editable: 'no',
      correctOrientation: false,
    }),
  );
}
export async function selectFile(photos: boolean) {
  const result = photos
    ? await FilePicker.pickImages({ limit: 1, readData: false, skipTranscoding: true })
    : await FilePicker.pickFiles({
        types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        limit: 1,
        readData: false,
      });
  const selected = result.files[0];
  if (!selected) return null;
  if (selected.size > 10 * 1024 * 1024)
    throw new Error('Maximum 10 Mo. Le fichier n’a pas été compressé.');
  if (!selected.blob && !selected.path)
    throw new Error('Le sélecteur n’a pas fourni de fichier lisible.');
  const blob =
    selected.blob ?? (await (await fetch(Capacitor.convertFileSrc(selected.path!))).blob());
  return new File([blob], selected.name, { type: selected.mimeType });
}
export async function shareDownload(path: string, name: string) {
  const response = await mobileFetch(path);
  // Bound allocations before Base64 crosses the native bridge. The complete export stays on the server.
  const limit = 32 * 1024 * 1024;
  const tooLarge = () =>
    new Error(
      'Export supérieur à 32 Mo : téléchargez ce dossier depuis le site web. Les originaux restent sur le serveur.',
    );
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw tooLarge();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Téléchargement vide ou indisponible.');
  const chunks: BlobPart[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const blob = new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const safeName = name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180);
  const file = await Filesystem.writeFile({
    path: `exports/${crypto.randomUUID()}-${safeName}`,
    directory: Directory.Cache,
    data,
    recursive: true,
  });
  // Keep file available to the receiving app; Android may later evict cache.
  await Share.share({
    title: name,
    files: [file.uri],
    dialogTitle: 'Enregistrer ou partager le dossier',
  });
}
