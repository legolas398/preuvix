import { useState } from 'react';
import type { Proof } from '../shared/types';
import { api } from './api';
import './protection.css';
export default function RecipientLinks({
  proof,
  onChange,
}: {
  proof: Proof;
  onChange: (proof: Proof) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!proof.recipientLinks?.length) return null;
  return (
    <details>
      <summary>Gérer les anciens accès au dossier complet</summary>
      <p>
        Ces liens antérieurs donnent accès à l’original et à l’export complet. Toute personne
        possédant un lien peut le consulter, indépendamment de son étiquette.
      </p>
      <ul className="recipient-list">
        {proof.recipientLinks.map((link) => (
          <li key={link.id}>
            <div>
              <strong>{link.label}</strong>
              <span>
                {link.revokedAt
                  ? 'Révoqué'
                  : Date.parse(link.expiresAt) <= Date.now()
                    ? 'Expiré'
                    : 'Lien créé'}{' '}
                · {link.views} ouverture(s), sans identification du lecteur
              </span>
            </div>
            {!link.revokedAt && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await onChange(
                      await api<Proof>('/api/proofs/' + proof.id + '/recipient-links/' + link.id, {
                        method: 'DELETE',
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Révoquer
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
