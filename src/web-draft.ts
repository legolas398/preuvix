export type DraftCase = {
  id: string;
  title: string;
  expectedVersion: number;
  replaceFileId?: string;
};
export type WebDraft = {
  id: string;
  revision: number;
  file: File;
  captureId: string;
  captureNonce?: string;
  caseTarget?: DraftCase;
  title: string;
  description: string;
  author: string;
  context: string;
  declared: boolean;
  requestKey: string;
  savedAt: string;
};
type Tombstone = { id: string; revision: number; deleted: true };
type Stored = WebDraft | Tombstone;
export class DraftConflict extends Error {
  constructor() {
    super(
      'Ce brouillon a été modifié ou supprimé dans un autre onglet. Fermez cette fenêtre et rouvrez-le depuis la liste ; votre capture reste téléchargeable ici.',
    );
  }
}
function notify() {
  window.dispatchEvent(new Event('preuvix-drafts-changed'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('preuvix-drafts');
    channel.postMessage('changed');
    channel.close();
  }
}
export function subscribeDrafts(callback: () => void) {
  window.addEventListener('preuvix-drafts-changed', callback);
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('preuvix-drafts') : null;
  if (channel) channel.onmessage = callback;
  return () => {
    window.removeEventListener('preuvix-drafts-changed', callback);
    channel?.close();
  };
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('preuvix-web-drafts', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains('drafts')
        ? request.transaction!.objectStore('drafts')
        : db.createObjectStore('drafts');
      const legacy = store.get('pending');
      legacy.onsuccess = () => {
        if (legacy.result) {
          const id = legacy.result.requestKey || crypto.randomUUID();
          store.put({ ...legacy.result, id, revision: 1 }, id);
          store.delete('pending');
        }
      };
    };
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(
        new Error(
          'Fermez les anciens onglets Preuvix puis réessayez pour mettre à jour les brouillons.',
        ),
      );
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readonly');
      const request = operation(transaction.objectStore('drafts'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function listDrafts() {
  return (await read<Stored[]>((store) => store.getAll()))
    .filter((item): item is WebDraft => !('deleted' in item))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function readDraft(id: string) {
  const item = await read<Stored | undefined>((store) => store.get(id));
  return item && !('deleted' in item) ? item : undefined;
}
async function mutate(id: string, expectedRevision: number, next?: Omit<WebDraft, 'revision'>) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      const request = store.get(id);
      let conflict = false;
      request.onsuccess = () => {
        const current: Stored | undefined = request.result;
        if ((current?.revision ?? 0) !== expectedRevision || (current && 'deleted' in current)) {
          conflict = true;
          transaction.abort();
          return;
        }
        store.put(
          next
            ? { ...next, id, revision: expectedRevision + 1 }
            : { id, revision: expectedRevision + 1, deleted: true },
          id,
        );
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(
          conflict
            ? new DraftConflict()
            : (transaction.error ?? new Error('Stockage local interrompu.')),
        );
    });
  } finally {
    db.close();
  }
  notify();
  return expectedRevision + 1;
}
export const saveDraft = (draft: Omit<WebDraft, 'revision'>, expectedRevision: number) =>
  mutate(draft.id, expectedRevision, draft);
export const deleteDraft = (id: string, expectedRevision: number) => mutate(id, expectedRevision);
