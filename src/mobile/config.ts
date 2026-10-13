export function backendOrigin(value: string, development: boolean) {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('Le serveur doit être une origine HTTP(S), sans chemin ni identifiants.');
  if (
    !development &&
    (url.protocol !== 'https:' ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(':') ||
      !url.hostname.includes('.') ||
      /\.(localhost|local|lan|internal|test|invalid|example)$/.test(url.hostname))
  )
    throw new Error('La production exige un domaine public HTTPS.');
  return url.origin;
}
export const backend = () =>
  backendOrigin(
    import.meta.env.VITE_BACKEND_URL || '',
    import.meta.env.MODE === 'android-development',
  );
