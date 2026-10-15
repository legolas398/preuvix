import { useEffect, useState } from 'react';
import { listDrafts, subscribeDrafts, type WebDraft } from './web-draft';
export default function DraftNotice({ resume }: { resume: (draft: WebDraft) => void }) {
  const [drafts, setDrafts] = useState<WebDraft[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listDrafts()
        .then((items) => {
          if (active) {
            setDrafts(items);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    };
    const unsubscribe = subscribeDrafts(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  if (error) return <p role="alert">Brouillons locaux : {error}</p>;
  return !drafts.length ? null : (
    <aside className="capture-storage" aria-label="Brouillons locaux en attente">
      <h2>{drafts.length} brouillon(s) sur cet appareil</h2>
      <p>
        Le dépôt serveur n’est pas confirmé. Chaque capture est conservée séparément dans ce
        navigateur.
      </p>
      <ul className="draft-list">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <div>
              <strong>{draft.title || draft.file.name}</strong>
              <small>
                {draft.caseTarget?.title || 'Sans dossier'} ·{' '}
                {new Date(draft.savedAt).toLocaleString('fr-FR')}
              </small>
            </div>
            <button className="button secondary" onClick={() => resume(draft)}>
              Reprendre le brouillon
              <span className="sr-only"> : {draft.title || draft.file.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
