import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCheck,
  FileCheck2,
  Fingerprint,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { RecipientDossier } from '../shared/types';
import { certificationLabels } from '../shared/certification-policy';
import { shortId } from '../shared/format';
import { api } from './api';
import './protection.css';
import { PageAppearance } from './Theme';

const date = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));
const resultLabel = { passed: 'Contrôlé', review: 'À examiner', unverified: 'Non établi' };
const outcomeLabel = {
  confirmed: 'Défi visible et conforme',
  absent: 'Défi absent ou non conforme',
  unclear: 'Défi illisible ou incertain',
};

export default function RecipientPage({ token }: { token: string }) {
  const [dossier, setDossier] = useState<RecipientDossier | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<RecipientDossier>(`/api/dossier/${token}`)
      .then(setDossier)
      .catch((e) => setError(e.message));
  }, [token]);
  const base = `/api/dossier/${token}`;
  const proof = dossier?.proof;
  const manifest = proof?.manifest;
  const intact = dossier?.integrity.originalMatches && dossier.integrity.manifestMatches;
  return (
    <div className="public-page recipient-page">
      <header>
        <span className="recipient-brand">
          <Fingerprint size={24} />
          <span>
            preuvix<em>.</em>
          </span>
        </span>
        <span className="recipient-readonly">Lecture seule</span>
      </header>
      <PageAppearance />
      <main className="verification-card recipient-card">
        <span className="eyebrow">DOSSIER DE PREUVE TRANSMIS</span>
        {error && (
          <p className="protection-error" role="alert">
            {error}
          </p>
        )}
        {!dossier && !error && <LoaderCircle className="spin" aria-label="Chargement" />}
        {dossier && proof && manifest && (
          <>
            <h1>{manifest.title}</h1>
            <p>
              {shortId(proof.id)} · déposé le {date(manifest.receivedAt)} · transmis à{' '}
              <strong>{dossier.label}</strong> · accessible jusqu’au {date(dossier.expiresAt)}
            </p>
            <div className="recipient-media">
              {manifest.file.mime.startsWith('video/') ? (
                <video src={`${base}/original`} controls playsInline preload="metadata" />
              ) : (
                <img src={`${base}/original`} alt={`Original du dossier ${shortId(proof.id)}`} />
              )}
            </div>
            <div className="recipient-downloads">
              <a className="button primary" href={`${base}/report`}>
                <FileCheck2 size={17} /> Rapport de certification (PDF)
              </a>
              <a className="button secondary" href={`${base}/export`}>
                <ArrowDownToLine size={17} /> Export vérifiable (.zip)
              </a>
              <a className="button secondary" href={`${base}/original`} download>
                <ArrowDownToLine size={17} /> Original
              </a>
            </div>
            <div className={`verification-check ${intact ? '' : 'recipient-alert'}`}>
              {intact ? <CheckCheck size={20} /> : <TriangleAlert size={20} />}
              <div>
                <strong>
                  {intact
                    ? 'Original et manifeste conformes aux empreintes enregistrées'
                    : 'Anomalie d’intégrité détectée'}
                </strong>
                <p>
                  Contrôle effectué à l’instant sur les données conservées.{' '}
                  {proof.attestation
                    ? 'Manifeste signé par l’installation (Ed25519).'
                    : 'Dossier antérieur, non signé.'}
                </p>
              </div>
            </div>
            {manifest.certification && (
              <section className="detail-section">
                <h3>
                  <ShieldCheck size={17} /> Certification
                </h3>
                <p className="recipient-status">
                  {certificationLabels[manifest.certification.status]}
                </p>
                <ul className="recipient-checks">
                  {manifest.certification.checks.map((check) => (
                    <li key={check.id} className={check.result}>
                      <strong>{resultLabel[check.result]}</strong> — {check.detail}
                    </li>
                  ))}
                </ul>
                {(proof.reviews ?? []).map(({ review, signature }) => (
                  <p key={signature}>
                    <strong>{outcomeLabel[review.outcome]}</strong> — vérification visuelle du{' '}
                    {date(review.reviewedAt)} par {review.reviewer} (nom déclaré)
                    {review.note && ` : ${review.note}`}. Signée séparément.
                  </p>
                ))}
              </section>
            )}
            {manifest.capture?.challenge && (
              <section className="detail-section">
                <h3>Défi en direct</h3>
                <p>
                  Le média doit montrer le code <code>{manifest.capture.challenge.code}</code> et le
                  geste « {manifest.capture.challenge.gesture.replace(/^Montrez /, '')} », émis par
                  le serveur {manifest.capture.elapsedSeconds ?? '?'} s avant l’engagement de
                  l’empreinte.
                </p>
              </section>
            )}
            <section className="detail-section">
              <h3>Empreintes</h3>
              <div className="hash-box">
                <span>SHA-256 DE L’ORIGINAL</span>
                <code>{manifest.file.sha256}</code>
              </div>
              <div className="hash-box">
                <span>SHA-256 DU MANIFESTE SIGNÉ</span>
                <code>{proof.manifestHash}</code>
              </div>
              <p>
                {proof.receipt
                  ? `Horodatage RFC 3161 : ${date(proof.receipt.time)} · ${proof.receipt.provider}.`
                  : 'Aucun horodatage indépendant obtenu à ce jour.'}
              </p>
            </section>
            {manifest.declaration && (
              <section className="detail-section">
                <h3>Déclaration du déposant</h3>
                <p>
                  {manifest.declaration.author} (identité non vérifiée) —{' '}
                  {manifest.declaration.context}
                </p>
              </section>
            )}
            <p className="recipient-boundary">
              Ce dossier documente l’intégrité et le processus de dépôt d’un fichier. Il ne
              constitue pas un constat et ne certifie pas la réalité de la scène : vos propres
              constatations restent seules à faire foi. Pour une vérification indépendante, extrayez
              l’export ZIP et suivez le fichier LISEZ-MOI.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
