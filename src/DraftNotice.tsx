import { useEffect, useState } from 'react';
import { readDraft } from './web-draft';
export default function DraftNotice({ resume }: { resume: () => void }) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    readDraft()
      .then((draft) => {
        if (active && draft) setTitle(draft.title || draft.file.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return title === null ? null : (
    <aside className="capture-storage" aria-label="Brouillon local en attente">
      <strong>Brouillon sur cet appareil : {title}</strong>
      <p>
        Le dépôt serveur n’est pas confirmé. Reprenez le brouillon pour vérifier son état ou
        réessayer.
      </p>
      <button className="button secondary" onClick={resume}>
        Reprendre le brouillon
      </button>
    </aside>
  );
}
