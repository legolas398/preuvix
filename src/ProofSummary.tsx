import { useEffect, useState } from 'react';
import type { Proof } from '../shared/types';
import { locationDescription } from '../shared/capture';
import { api } from './api';
import './proof-workspace.css';

type Integrity = {
  originalMatches: boolean;
  manifestMatches: boolean;
  signatureVerified: boolean;
  checkedAt: string;
};
export default function ProofSummary({ proof }: { proof: Proof }) {
  const [check, setCheck] = useState<Integrity | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setCheck(null);
    setError('');
    api<Integrity>(`/api/proofs/${proof.id}/integrity`, { signal: controller.signal })
      .then((value) => {
        if (active) setCheck(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [proof.id, attempt]);
  const m = proof.manifest;
  const sample = m.mobileEvidence?.location ?? m.capture?.location?.start;
  return (
    <section className="proof-summary" aria-label="Les cinq contrôles de la preuve">
      <h3>Ce que cette preuve permet de vérifier</h3>
      <p>
        Enregistrée sur le serveur le {new Date(m.receivedAt).toLocaleString('fr-FR')}. Ce statut ne
        confirme pas une sauvegarde externe.
      </p>
      <dl className="proof-status-grid">
        <div>
          <dt>Intégrité</dt>
          <dd>
            {check
              ? check.originalMatches && check.manifestMatches
                ? 'Original et manifeste conformes'
                : 'Anomalie détectée'
              : error
                ? 'Contrôle indisponible'
                : 'Contrôle en cours…'}
          </dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>
            {check
              ? check.signatureVerified
                ? 'Signature technique Ed25519 vérifiée'
                : 'Aucune signature technique'
              : 'Vérification en attente'}
          </dd>
        </div>
        <div>
          <dt>Horodatage</dt>
          <dd>
            {proof.receipt
              ? `Horodatage externe : ${proof.receipt.provider} · ${new Date(proof.receipt.time).toLocaleString('fr-FR')}`
              : 'Aucun horodatage externe obtenu'}
          </dd>
        </div>
        <div>
          <dt>Localisation</dt>
          <dd>{locationDescription(sample)}</dd>
        </div>
        <div>
          <dt>Origine</dt>
          <dd>
            {m.source === 'camera'
              ? m.mobileEvidence
                ? 'Caméra Android déclarée'
                : 'Caméra du navigateur déclarée'
              : 'Fichier importé'}{' '}
            · origine non authentifiée
          </dd>
        </div>
      </dl>
      {error && (
        <p role="alert">
          {error}{' '}
          <button className="text-link" onClick={() => setAttempt((v) => v + 1)}>
            Réessayer le contrôle
          </button>
        </p>
      )}
      <details>
        <summary>Voir les détails techniques</summary>
        <p>
          Réception serveur : {m.receivedAt}. Heure déclarée par l’appareil :{' '}
          {m.capture?.startedAt ?? m.mobileEvidence?.selectedAt ?? 'non disponible'}.
        </p>
        <p>
          Clé de signature : <code>{proof.attestation?.keyId ?? 'aucune'}</code>
        </p>
        <p>
          SHA-256 du fichier : <code>{m.file.sha256}</code>
        </p>
        {check && (
          <p>Dernier contrôle serveur : {new Date(check.checkedAt).toLocaleString('fr-FR')}.</p>
        )}
        <p>
          La signature identifie la clé de cette installation. Elle ne vérifie pas l’identité civile
          de l’auteur. Le GPS et l’heure de capture sont déclarés par l’appareil. Un horodatage
          externe ne prouve pas la date de prise de vue.
        </p>
      </details>
      <p>L’intégrité et la signature ne certifient pas la réalité de la scène photographiée.</p>
    </section>
  );
}
