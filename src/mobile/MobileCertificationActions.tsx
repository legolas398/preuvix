import { useState } from 'react';
import type { CaseDetail } from '../../shared/cases';
import { mobileApi } from './api';
import { shareDownload } from './device';

export default function MobileCertificationActions({
  dossier,
  disabled,
  run,
  onChange,
}: {
  dossier: CaseDetail;
  disabled: boolean;
  run: (label: string, action: () => Promise<void>) => Promise<void>;
  onChange: (detail: CaseDetail) => void;
}) {
  const [anchorConsent, setAnchorConsent] = useState(false);
  const base = `/api/cases/${dossier.manifest.id}`;
  const refresh = async () =>
    onChange(await mobileApi<CaseDetail>(`${base}?version=${dossier.manifest.version}`));
  const perform = (label: string, path: string, body?: object) =>
    void run(label, async () => {
      try {
        await mobileApi(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      } finally {
        await refresh();
      }
    });
  return (
    <div className="certification-actions" aria-label="Actions de certification">
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => void run('Actualisation des justificatifs', refresh)}
      >
        Actualiser les justificatifs
      </button>
      <button
        className="button secondary"
        disabled={
          disabled ||
          !dossier.manifest.files.length ||
          !dossier.services.timestamp.configured ||
          dossier.operations.some((op) => op.kind === 'timestamp')
        }
        onClick={() =>
          perform('Demande d’horodatage', `${base}/services/timestamp`, {
            version: dossier.manifest.version,
            consent: true,
          })
        }
      >
        Demander un horodatage prestataire
      </button>
      <label className="mobile-check">
        <input
          type="checkbox"
          checked={anchorConsent}
          disabled={disabled}
          onChange={(event) => setAnchorConsent(event.target.checked)}
        />
        J’autorise l’ancrage de la seule empreinte de cette version sur le réseau configuré. Une
        publication sur blockchain ne peut généralement pas être retirée.
      </label>
      <button
        className="button secondary"
        disabled={
          disabled ||
          !anchorConsent ||
          !dossier.manifest.files.length ||
          !dossier.services.anchor.configured ||
          dossier.operations.some((op) => op.kind === 'anchor')
        }
        onClick={() =>
          perform('Demande d’ancrage', `${base}/services/anchor`, {
            version: dossier.manifest.version,
            consent: true,
          })
        }
      >
        Demander l’ancrage blockchain
      </button>
      {dossier.operations.map((op) => (
        <div key={op.id} className="certification-actions">
          {op.state !== 'confirmed' && op.kind !== 'signature' && (
            <button
              className="button secondary"
              disabled={disabled || !dossier.services[op.kind].configured}
              onClick={() =>
                perform('Actualisation de la demande', `${base}/operations/${op.id}/retry`)
              }
            >
              {op.state === 'failed' ? 'Réessayer' : 'Actualiser la demande'} ·{' '}
              {op.kind === 'anchor' ? 'ancrage' : 'horodatage'}
            </button>
          )}
          {op.kind === 'anchor' && op.result?.otsProofBase64 && (
            <>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() =>
                  perform('Vérification Bitcoin', `${base}/operations/${op.id}/verify-blockchain`)
                }
              >
                Vérifier la preuve Bitcoin
              </button>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() =>
                  void run('Téléchargement de la preuve', () =>
                    shareDownload(
                      `${base}/operations/${op.id}/blockchain-proof`,
                      'dossier.json.ots',
                    ),
                  )
                }
              >
                Enregistrer / partager la preuve .ots
              </button>
            </>
          )}
        </div>
      ))}
      <p className="mobile-small">
        Une demande en attente n’est pas une confirmation. Actualisez les justificatifs pour
        consulter le résultat du prestataire.
      </p>
    </div>
  );
}
