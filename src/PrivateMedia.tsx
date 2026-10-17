import { useEffect, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react';
import { appFetch, embedded } from './transport';

function usePrivateMedia(path: string) {
  const [result, setResult] = useState({ path: '', url: '', error: '' });
  useEffect(() => {
    if (!embedded) return;
    const controller = new AbortController();
    let objectUrl = '';
    appFetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Aperçu indisponible. Réessayez après reconnexion.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ path, url: objectUrl, error: '' });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setResult({ path, url: '', error: error.message });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return embedded
    ? result.path === path
      ? result
      : { url: '', error: '' }
    : { url: path, error: '' };
}
export function PrivateImage({
  src,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const { url, error } = usePrivateMedia(src);
  return error ? <span role="status">{error}</span> : <img {...props} src={url || undefined} />;
}
export function PrivateVideo({
  src,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & { src: string }) {
  const { url, error } = usePrivateMedia(src);
  return error ? <span role="status">{error}</span> : <video {...props} src={url || undefined} />;
}
