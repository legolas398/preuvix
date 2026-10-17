import { backend } from './mobile/config';

export const embedded = ['android', 'android-development'].includes(import.meta.env.MODE);
let session = '';
export const publicOrigin = () => (embedded ? backend() : location.origin);

// Only the configured API receives the in-memory mobile credential.
export async function appFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!embedded || !url.startsWith('/api/')) return fetch(url, options);
  const login = url === '/api/login';
  const headers = new Headers(options.headers);
  if (session && !login) headers.set('Authorization', `Bearer ${session}`);
  const response = await fetch(backend() + (login ? '/api/mobile/login' : url), {
    ...options,
    headers,
    credentials: 'omit',
    redirect: 'error',
  });
  if (login && response.ok) {
    const data = await response.clone().json();
    session = data.token;
  }
  if ((url === '/api/logout' && response.ok) || (!login && response.status === 401)) {
    session = '';
    window.dispatchEvent(new Event('preuvix-session-expired'));
  }
  return response;
}
