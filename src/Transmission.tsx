import { useEffect, useRef, useState } from 'react';
import type { Proof } from '../shared/types';
import {
  transmissionLabels,
  type Transmission,
  type TransmissionAccess,
  type TransmissionInput,
  type TransmissionPreview,
} from '../shared/transmission';
import { api } from './api';

const day = (s: string) => new Date(s).toLocaleString('fr-FR');
const steps = [
  'Sélectionner les pièces',
  'Vérifier le résumé',
  'Choisir les informations',
  'Préciser le destinataire',
  'Confirmer',
];
const empty: TransmissionInput = {
  proofIds: [],
  recipient: '',
  summary: '',
  includeOriginals: false,
  includeNotes: false,
  days: 7,
};

export function PremiumCard({ enabled, onOpen }: { enabled: boolean; onOpen: () => void }) {
  return (
    <section className="premium-preparation" aria-label="Transmission Premium">
      <span className="eyebrow">
        PREMIUM · {enabled ? 'ACCÈS DE TEST' : 'OFFRE EN PRÉPARATION'}
      </span>
      <h2>Préparer une transmission à un commissaire de justice</h2>
      <p>
        Sélectionnez les pièces, préparez un résumé et contrôlez les informations accessibles par un
        lien révocable.
      </p>
      <button className="button secondary" onClick={onOpen}>
        {enabled ? 'Préparer la transmission' : 'Découvrir l’option Premium'}
      </button>
    </section>
  );
}

export function SelectionPreview({ data }: { data: TransmissionPreview }) {
  return (
    <section className="selection-preview" aria-label="Informations accessibles">
      <h3>Ce qui sera accessible</h3>
      <p>
        <strong>Étiquette destinataire :</strong> {data.recipient || 'À renseigner'}
      </p>
      <p>
        <strong>Résumé :</strong> {data.summary || 'À renseigner'}
      </p>
      <ul>
        {data.documents.map((d) => (
          <li key={d.id}>
            <strong>{d.title}</strong>
            <br />
            <span>
              Référence : {d.id} · {d.bytes} octets
            </span>
            <br />
            <code>{d.sha256}</code>
            {data.includeNotes && <p>Note de contexte : {d.notes || 'Aucune note'}</p>}
          </li>
        ))}
      </ul>
      <p>
        Rapport de sélection : titres, références, tailles, empreintes, résumé et étiquette
        ci-dessus.
      </p>
      <p>
        Originaux :{' '}
        <strong>
          {data.includeOriginals ? 'téléchargeables, avec leurs métadonnées intégrées' : 'exclus'}
        </strong>
        . Notes de contexte :{' '}
        <strong>{data.includeNotes ? 'incluses ci-dessus' : 'exclues'}</strong>.
      </p>
      {!data.includeOriginals && (
        <p>
          Mode empreintes seules : préparez le rapport et les références. Joignez les fichiers
          séparément par un moyen convenu avec le destinataire ; ce lien ne transfère aucun
          original.
        </p>
      )}
    </section>
  );
}

export default function TransmissionWorkspace({
  enabled,
  proofs,
  initialProofId,
}: {
  enabled: boolean;
  proofs: Proof[];
  initialProofId?: string;
}) {
  const [items, setItems] = useState<Transmission[]>([]);
  const [draft, setDraft] = useState<Transmission | null>(null);
  const [input, setInput] = useState<TransmissionInput>(empty);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [inspected, setInspected] = useState<Transmission | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = async () => setItems(await api<Transmission[]>('/api/transmissions'));
  useEffect(() => {
    let alive = true;
    api<Transmission[]>('/api/transmissions')
      .then((data) => {
        if (alive) setItems(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (draft) heading.current?.focus();
  }, [step, draft?.id]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = (patch: Partial<TransmissionInput>) => {
    setInput((v) => ({ ...v, ...patch }));
    setConfirmed(false);
    setNotice('Modifications à enregistrer.');
  };
  async function save(ready = false) {
    if (!draft) throw new Error('Brouillon absent.');
    const result = await api<Transmission>(`/api/transmissions/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({ input, revision: draft.revision, ready }),
    });
    setDraft(result);
    setNotice(
      ready
        ? 'Préparation prête. Vérifiez le récapitulatif avant confirmation.'
        : 'Brouillon enregistré sur cette installation.',
    );
    await refresh();
    return result;
  }
  const next = () =>
    run(async () => {
      if (step === 0 && !input.proofIds.length) throw new Error('Sélectionnez au moins une pièce.');
      if (step === 1 && input.summary.trim().length < 5)
        throw new Error('Renseignez un résumé de cinq caractères minimum.');
      if (step === 3 && input.recipient.trim().length < 2)
        throw new Error('Renseignez une étiquette destinataire.');
      await save(step === 3);
      setStep((s) => s + 1);
      setConfirmed(false);
    });
  const create = () =>
    run(async () => {
      const result = await api<{ transmission: Transmission; url: string }>(
        `/api/transmissions/${draft!.id}/link`,
        { method: 'POST', body: JSON.stringify({ revision: draft!.revision, confirmed }) },
      );
      setUrl(location.origin + result.url);
      setInspected(result.transmission);
      setDraft(null);
      await refresh();
    });
  return (
    <div className="transmission-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PARCOURS PREMIUM · PROTOTYPE PRIVÉ</span>
          <h1>Préparer la transmission</h1>
          <p>Un dossier choisi, un accès maîtrisé. Aucun envoi à un professionnel.</p>
        </div>
      </div>
      <p>
        L’option PREUVIX et les éventuels honoraires du commissaire sont distincts. Aucun constat
        automatique, aucune acceptation du dossier ni garantie juridique.
      </p>
      {!enabled && (
        <section className="premium-preparation">
          <h2>Offre en préparation</h2>
          <p>
            La préparation organise une sélection de pièces, vérifie la présence des champs
            nécessaires et permet un lien de consultation révocable. Ce contrôle de complétude ne
            porte pas sur la valeur juridique du dossier.
          </p>
          <p>
            L’accès de test est désactivé sur cette installation. Les accès existants restent
            consultables et révocables.
          </p>
        </section>
      )}
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {draft ? (
        <section className="wizard" aria-label="Préparation de la transmission">
          <ol className="journey-steps">
            {steps.map((s, i) => (
              <li key={s} aria-current={i === step ? 'step' : undefined}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h2>
          <fieldset disabled={busy || !enabled}>
            {step === 0 && (
              <>
                <p>Seules les pièces cochées feront partie de la préparation.</p>
                {proofs.length ? (
                  proofs.map((p) => (
                    <label className="selection-check" key={p.id}>
                      <input
                        type="checkbox"
                        checked={input.proofIds.includes(p.id)}
                        onChange={(e) =>
                          change({
                            proofIds: e.target.checked
                              ? [...input.proofIds, p.id]
                              : input.proofIds.filter((id) => id !== p.id),
                          })
                        }
                      />
                      {p.manifest.title}
                    </label>
                  ))
                ) : (
                  <p>Créez d’abord un dossier depuis « Mes dossiers ».</p>
                )}
                {input.proofIds.some((id) => !proofs.some((p) => p.id === id)) && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      change({
                        proofIds: input.proofIds.filter((id) => proofs.some((p) => p.id === id)),
                      })
                    }
                  >
                    Retirer les pièces supprimées
                  </button>
                )}
              </>
            )}
            {step === 1 && (
              <>
                <p>
                  {input.proofIds.length} pièce(s) sélectionnée(s). Décrivez les éléments utiles à
                  la demande.
                </p>
                <label>
                  Résumé accessible au destinataire
                  <textarea
                    rows={5}
                    maxLength={1500}
                    value={input.summary}
                    onChange={(e) => change({ summary: e.target.value })}
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  Le rapport contient les titres, références, tailles et empreintes des pièces,
                  ainsi que votre résumé et l’étiquette destinataire.
                </p>
                <label className="selection-check">
                  <input
                    type="checkbox"
                    checked={input.includeOriginals}
                    onChange={(e) => change({ includeOriginals: e.target.checked })}
                  />
                  Autoriser le téléchargement des originaux
                </label>
                <p>
                  Un original peut contenir des métadonnées personnelles intégrées, notamment EXIF
                  et localisation. Elles ne sont pas retirées.
                </p>
                <label className="selection-check">
                  <input
                    type="checkbox"
                    checked={input.includeNotes}
                    onChange={(e) => change({ includeNotes: e.target.checked })}
                  />
                  Inclure les notes de contexte des pièces
                </label>
                <p>
                  Les déclarations avancées, l’historique et l’export complet du dossier restent
                  exclus.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <label>
                  Étiquette destinataire
                  <input
                    maxLength={120}
                    value={input.recipient}
                    onChange={(e) => change({ recipient: e.target.value })}
                    placeholder="Ex. : Étude à contacter"
                  />
                </label>
                <p>
                  Ce nom est une étiquette, pas une restriction d’accès. Toute personne possédant le
                  lien peut le consulter et le transférer. Aucune identité n’est vérifiée.
                </p>
                <label>
                  Durée de l’accès
                  <select
                    value={input.days}
                    onChange={(e) => change({ days: Number(e.target.value) as 7 | 30 | 90 })}
                  >
                    <option value={7}>7 jours</option>
                    <option value={30}>30 jours</option>
                    <option value={90}>90 jours</option>
                  </select>
                </label>
              </>
            )}
            {step === 4 && (
              <>
                <SelectionPreview data={draft.preview} />
                <p>
                  Le lien sera valable {input.days} jours à partir de sa création. Il fonctionne
                  uniquement si cette installation est joignable. La révocation bloque les
                  consultations futures, pas les copies déjà téléchargées.
                </p>
                <p>
                  Toute personne possédant ce lien aura cet accès ; l’étiquette destinataire ne le
                  restreint pas.
                </p>
                <label className="selection-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Je confirme cette sélection et la création du lien, sans envoi.
                </label>
              </>
            )}
            <div className="button-row">
              {step > 0 && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setStep((s) => s - 1);
                    setConfirmed(false);
                  }}
                >
                  Précédent
                </button>
              )}
              {step < 4 ? (
                <button className="button primary" onClick={next}>
                  Continuer
                </button>
              ) : (
                <button className="button primary" disabled={!confirmed} onClick={create}>
                  Créer le lien de consultation
                </button>
              )}
              <button
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    await save(step === 4);
                    setDraft(null);
                  })
                }
              >
                Enregistrer et quitter
              </button>
            </div>
          </fieldset>
        </section>
      ) : (
        <>
          {enabled && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const value = { ...empty, proofIds: initialProofId ? [initialProofId] : [] };
                  const created = await api<Transmission>('/api/transmissions', {
                    method: 'POST',
                    body: JSON.stringify(value),
                  });
                  setDraft(created);
                  setInput(created.input);
                  setStep(0);
                  setUrl('');
                  setInspected(null);
                  await refresh();
                })
              }
            >
              Nouvelle préparation
            </button>
          )}
          {url && (
            <section className="recipient-created" role="status">
              <h2>Lien créé</h2>
              <p>
                Aucun dossier envoyé. Copiez ce lien maintenant : il ne sera plus affiché après
                votre départ.
              </p>
              <code>{url}</code>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(url);
                      setNotice('Lien copié.');
                    })
                  }
                >
                  Copier le lien
                </button>
                <a className="button secondary" href={url} target="_blank" rel="noreferrer">
                  Vérifier la consultation
                </a>
              </div>
            </section>
          )}
          {inspected && (
            <>
              <SelectionPreview data={inspected.preview} />
              <p>État : {transmissionLabels[inspected.state]}</p>
              <button className="text-link" onClick={() => setInspected(null)}>
                Masquer le récapitulatif
              </button>
            </>
          )}
          <h2>Préparations et accès</h2>
          {loading ? (
            <p role="status">Chargement…</p>
          ) : !items.length ? (
            <p>Aucune préparation enregistrée.</p>
          ) : (
            <ul className="transmission-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.input.recipient || 'Destinataire à préciser'}</strong>
                    <span>
                      {transmissionLabels[item.state]} · {item.input.proofIds.length} pièce(s)
                    </span>
                    {item.expiresAt && <small>Expiration : {day(item.expiresAt)}</small>}
                  </div>
                  <div className="button-row">
                    <button className="button secondary small" onClick={() => setInspected(item)}>
                      Consulter la sélection
                    </button>
                    {enabled && ['draft', 'ready'].includes(item.state) && (
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setDraft(item);
                          setInput(item.input);
                          setStep(item.state === 'ready' ? 4 : 0);
                          setConfirmed(false);
                          setUrl('');
                          setError('');
                        }}
                      >
                        Reprendre
                      </button>
                    )}
                    {['created', 'expired'].includes(item.state) && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const result = await api<Transmission>(
                              `/api/transmissions/${item.id}/access`,
                              { method: 'DELETE' },
                            );
                            setInspected(result);
                            setUrl('');
                            await refresh();
                          })
                        }
                      >
                        Révoquer l’accès
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function TransmissionConsultation({ token }: { token: string }) {
  const [data, setData] = useState<TransmissionAccess | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<TransmissionAccess>(`/api/transmission-access/${token}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <main className="consultation-page">
      <span className="eyebrow">PREUVIX · CONSULTATION EN LECTURE SEULE</span>
      <h1>Sélection préparée</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Chargement…</p>
      ) : (
        <>
          <p>
            Accès jusqu’au {day(data.expiresAt)}. Le nom du destinataire est une étiquette ; ce lien
            n’authentifie pas son porteur.
          </p>
          <SelectionPreview data={data.preview} />
          <a className="button primary" href={`/api/transmission-access/${token}/report`}>
            Télécharger le rapport de sélection
          </a>
          <p>Rapport de préparation non signé. Aucun constat ni acceptation de mission.</p>
          {data.preview.includeOriginals &&
            data.preview.documents.map((d) => (
              <p key={d.id}>
                <a href={`/api/transmission-access/${token}/original/${d.id}`}>
                  Télécharger l’original : {d.title}
                </a>
              </p>
            ))}
        </>
      )}
    </main>
  );
}
