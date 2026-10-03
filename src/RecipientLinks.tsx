import { useState } from 'react';
import { Check, Copy, Mail, Scale, Send, X } from 'lucide-react';
import type { Proof } from '../shared/types';
import { shortId } from '../shared/format';
import { api } from './api';
import './protection.css';

const day = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(
    new Date(value),
  );

function emailBody(proof: Proof, url: string, expiresAt: string) {
  return `Bonjour,

Je vous transmets un dossier de preuve préparé avec Preuvix, en vue d’échanger sur un éventuel constat.

Dossier : ${shortId(proof.id)} — ${proof.manifest.title}
Lien de consultation (valable jusqu’au ${day(expiresAt)}) :
${url}

Ce lien donne accès en lecture à l’original, au rapport de certification PDF et à l’export vérifiable (ZIP).
Empreinte SHA-256 de l’original : ${proof.manifest.file.sha256}

Pourriez-vous m’indiquer vos disponibilités, les modalités d’intervention et vos honoraires ?

Cordialement,`;
}

export default function RecipientLinks({
  proof,
  onChange,
}: {
  proof: Proof;
  onChange: (proof: Proof) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const links = proof.recipientLinks ?? [];
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const result = await api<{ url: string; proof: Proof }>(
        `/api/proofs/${proof.id}/recipient-links`,
        { method: 'POST', body: JSON.stringify({ label, days }) },
      );
      setCreated({ url: result.url, expiresAt: result.proof.recipientLinks![0].expiresAt });
      setCopied(false);
      setLabel('');
      await onChange(result.proof);
    });
  const subject = `Dossier de preuve ${shortId(proof.id)} — demande de constat`;
  return (
    <section className="detail-section recipient-links" aria-label="Envoyer à un commissaire">
      <h3>
        <Scale size={17} /> Envoyer à un commissaire de justice
      </h3>
      <p>
        Créez un lien privé en lecture seule : le commissaire consulte l’original, le rapport de
        certification et télécharge l’export vérifiable, sans compte. Vous pouvez le révoquer à tout
        moment.
      </p>
      {created ? (
        <div className="recipient-created" role="status">
          <strong>
            <Check size={16} /> Lien créé — valable jusqu’au {day(created.expiresAt)}
          </strong>
          <span>Copiez-le maintenant : pour votre sécurité, il ne sera plus affiché.</span>
          <code>{created.url}</code>
          <div className="button-row">
            <button
              className="button secondary small"
              onClick={() =>
                navigator.clipboard
                  .writeText(created.url)
                  .then(() => setCopied(true))
                  .catch(() => setError('Copie indisponible. Sélectionnez le lien pour le copier.'))
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copié' : 'Copier'}
            </button>
            <a
              className="button primary small"
              href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody(proof, created.url, created.expiresAt))}`}
            >
              <Mail size={15} /> Préparer l’e-mail
            </a>
            <button className="button secondary small" onClick={() => setCreated(null)}>
              Terminé
            </button>
          </div>
        </div>
      ) : (
        <form
          className="recipient-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label>
            Destinataire
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. : Étude Dupont, commissaires de justice"
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Validité
            <select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}>
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </label>
          <button className="button primary small" disabled={busy} type="submit">
            <Send size={15} /> Créer le lien
          </button>
        </form>
      )}
      {links.length > 0 && (
        <ul className="recipient-list">
          {links.map((link) => {
            const active = !link.revokedAt && Date.parse(link.expiresAt) > Date.now();
            return (
              <li key={link.id} className={active ? '' : 'inactive'}>
                <div>
                  <strong>{link.label}</strong>
                  <span>
                    {link.revokedAt
                      ? `Révoqué le ${day(link.revokedAt)}`
                      : active
                        ? `Actif jusqu’au ${day(link.expiresAt)}`
                        : `Expiré le ${day(link.expiresAt)}`}{' '}
                    ·{' '}
                    {link.views
                      ? `${link.views} consultation${link.views > 1 ? 's' : ''}`
                      : 'jamais ouvert'}
                    {link.lastViewAt && ` (dernière le ${day(link.lastViewAt)})`}
                  </span>
                </div>
                {active && (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      run(async () =>
                        onChange(
                          await api<Proof>(`/api/proofs/${proof.id}/recipient-links/${link.id}`, {
                            method: 'DELETE',
                          }),
                        ),
                      )
                    }
                  >
                    <X size={14} /> Révoquer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="protection-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
