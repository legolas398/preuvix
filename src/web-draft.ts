// One pending capture per browser profile. No password or session token is stored here.
export type WebDraft = {
  file: File;
  captureId: string;
  title: string;
  description: string;
  author: string;
  context: string;
  declared: boolean;
  requestKey: string;
  savedAt: string;
};
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('preuvix-web-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('drafts', mode);
      const request = operation(transaction.objectStore('drafts'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Stockage interrompu'));
    });
  } finally {
    db.close();
  }
}
export const readDraft = () =>
  access<WebDraft | undefined>('readonly', (store) => store.get('pending'));
export const saveDraft = (draft: WebDraft) =>
  access('readwrite', (store) => store.put(draft, 'pending'));
export const deleteDraft = () => access('readwrite', (store) => store.delete('pending'));
