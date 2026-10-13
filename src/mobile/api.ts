import { backend } from './config';
let session = '';
export const setSession = (token: string) => {
  session = token;
};
export async function mobileFetch(path: string, options: RequestInit = {}) {
  if (!path.startsWith('/api/')) throw new Error('Route API invalide.');
  const headers = new Headers(options.headers);
  if (session) headers.set('Authorization', `Bearer ${session}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(backend() + path, {
      ...options,
      headers,
      credentials: 'omit',
      redirect: 'error',
      signal: options.signal ?? AbortSignal.timeout(90000),
    });
  } catch {
    throw new Error(
      'Serveur inaccessible ou délai dépassé. Le brouillon est conservé ; vérifiez la connexion puis réessayez.',
    );
  }
  if (response.status === 401 && path !== '/api/mobile/login') {
    session = '';
    window.dispatchEvent(new Event('preuvix-session-expired'));
    throw new Error('Session expirée. Reconnectez-vous ; vos brouillons sont conservés.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erreur serveur (${response.status}). Brouillon conservé.`);
  }
  return response;
}
export async function mobileApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await mobileFetch(path, options);
  return response.status === 204 ? (undefined as T) : response.json();
}
