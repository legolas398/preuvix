export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(30000),
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
  } catch (e) {
    if (e instanceof DOMException && ['TimeoutError', 'AbortError'].includes(e.name))
      throw new ApiError(
        'Le serveur met trop de temps à répondre. Vérifiez la connexion puis réessayez ; aucune confirmation de dépôt n’a été reçue.',
        0,
      );
    throw new ApiError('Connexion interrompue. Vérifiez le réseau puis réessayez.', 0);
  }
  if (res.status === 401)
    throw new ApiError('Votre connexion a expiré. Reconnectez-vous pour reprendre.', 401);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      body?.error || `Le serveur est indisponible (${res.status}). Réessayez.`,
      res.status,
    );
  if (body === null) throw new ApiError('Réponse du serveur illisible. Réessayez.', res.status);
  return body;
}
