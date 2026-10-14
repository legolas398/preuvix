import type { MobileEvidence } from '../../shared/mobile';
import type { CaseInput } from '../../shared/cases';
import type { Proof } from '../../shared/types';
import { backend } from './config';

export type Draft = {
  id: string;
  backend: string;
  createdAt: string;
  kind: 'case' | 'file';
  title: string;
  description: string;
  caseId?: string;
  file?: Blob;
  fileName?: string;
  evidence?: MobileEvidence;
  captureId?: string;
  proof?: Proof;
  completed?: boolean;
  dossier?: CaseInput;
};
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('preuvix-mobile-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Stockage local indisponible. Aucun envoi effectué.'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('drafts', mode);
    const request = action(tx.objectStore('drafts'));
    tx.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      database.close();
      reject(new Error('Impossible de conserver le brouillon. Vérifiez l’espace disponible.'));
    };
  });
}
export async function saveDraft(draft: Draft) {
  await transaction('readwrite', (store) => store.put(draft));
}
export async function removeDraft(id: string) {
  await transaction('readwrite', (store) => store.delete(id));
}
export async function listDrafts(): Promise<Draft[]> {
  const all = await transaction<Draft[]>('readonly', (store) => store.getAll());
  return all
    .filter((draft) => draft.backend === backend())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function newDraft(kind: Draft['kind']): Draft {
  return {
    id: crypto.randomUUID(),
    backend: backend(),
    kind,
    title: '',
    description: '',
    createdAt: new Date().toISOString(),
  };
}
