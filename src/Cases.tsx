import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { sha256File } from './file-hash';
import LocalFileCheck from './LocalFileCheck';
import { CaptureLocation, SignatureControl } from './CaptureEvidence';
import {
  serviceLabels,
  serviceStateLabel,
  type CaseDetail,
  type CaseInput,
  type CaseSummary,
  type ServiceKind,
} from '../shared/cases';
import type { Proof } from '../shared/types';
import './cases.css';

type ShareLink = {
  id: string;
  version: number;
  includeOriginals: boolean;
  expiresAt: string;
  revokedAt: string | null;
};
const empty: CaseInput = { title: '', description: '', declaredAddress: '' };
const utc = (value: string) =>
  new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
async function download(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Téléchargement impossible. Réessayez.');
  }
  const objectUrl = URL.createObjectURL(await response.blob()),
    link = document.createElement('a');
  link.href = objectUrl;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
function Fields({ value, onChange }: { value: CaseInput; onChange: (value: CaseInput) => void }) {
  return (
    <>
      <label>
        Titre du dossier multi-fichiers
        <input
          required
          maxLength={120}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </label>
      <label>
        Description du dossier
        <textarea
          rows={3}
          maxLength={3000}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Adresse saisie (facultative)
        <input
          maxLength={300}
          value={value.declaredAddress}
          onChange={(e) => onChange({ ...value, declaredAddress: e.target.value })}
        />
      </label>
      <p className="case-muted">
        L’adresse est une déclaration. Elle ne remplace pas une position capturée avec votre accord.
      </p>
    </>
  );
}
function EvidenceFiles({
  dossier,
  privateView = true,
}: {
  dossier: CaseDetail;
  privateView?: boolean;
}) {
  return (
    <section aria-label="Fichiers et traçabilité">
      <h2>Fichiers et traçabilité</h2>
      {!dossier.manifest.files.length && (
        <p>Aucun fichier pour le moment. Ajoutez un original ou choisissez une preuve existante.</p>
      )}
      {dossier.manifest.files.map((file) => (
        <article className="case-file" key={file.fileId}>
          <h3>
            {file.title} <small>· fichier v{file.fileVersion}</small>
          </h3>
          <p>
            {file.file.name} · {file.file.mime} ·{' '}
            {(file.file.size / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko
          </p>
          <ul className="case-statuses">
            <li>Fichier enregistré</li>
            <li>Empreinte calculée · SHA-256</li>
            <li>Date de réception disponible · serveur UTC</li>
            <li>
              {file.capture?.location?.start.status === 'recorded'
                ? 'Localisation renseignée · position capturée'
                : 'Localisation non renseignée'}
            </li>
            <li>
              Ancrage de la version :{' '}
              {serviceStateLabel(
                'anchor',
                dossier.operations.find((op) => op.kind === 'anchor')?.state,
                dossier.services.anchor.configured,
              )}
            </li>
            <li>
              Signature de la version :{' '}
              {serviceStateLabel(
                'signature',
                dossier.operations.find((op) => op.kind === 'signature')?.state,
                dossier.services.signature.configured,
              )}
            </li>
            <li>
              Horodatage prestataire de la version :{' '}
              {serviceStateLabel(
                'timestamp',
                dossier.operations.find((op) => op.kind === 'timestamp')?.state,
                dossier.services.timestamp.configured,
              )}
            </li>
          </ul>
          <p>
            Réception serveur : {utc(file.receivedAt)}. Cette date n’est pas un horodatage certifié.
          </p>
          <code>{file.file.sha256}</code>
          {file.supersedes && <p>Version précédente conservée dans l’historique du dossier.</p>}
          <details>
            <summary>Informations de localisation</summary>
            <CaptureLocation capture={file.capture ?? undefined} />
          </details>
          <details>
            <summary>Vérifier une copie de ce fichier</summary>
            <LocalFileCheck expectedHash={file.file.sha256} />
          </details>
          {privateView && (
            <a href={`/api/proofs/${file.proofId}/original`} download>
              Télécharger cet original
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
function ServiceEvidence({ dossier }: { dossier: CaseDetail }) {
  return (
    <>
      {(['timestamp', 'anchor', 'signature'] as const).map((kind) => {
        const op = dossier.operations.find((op) => op.kind === kind),
          result = op?.result;
        return (
          <article className="case-service" key={kind}>
            <h3>{serviceLabels[kind]}</h3>
            <strong>{serviceStateLabel(kind, op?.state, dossier.services[kind].configured)}</strong>
            {result?.provider && <p>Prestataire : {result.provider}</p>}
            {result?.transactionId && (
              <p>
                Réseau : {result.network}
                <br />
                Transaction : <code>{result.transactionId}</code>
                <br />
                Confirmations annoncées : {result.confirmations}
              </p>
            )}
            {result?.timestamp && (
              <p>
                Jeton RFC 3161 disponible · {utc(result.timestamp.time)}
                <br />
                Qualification :{' '}
                {result.timestamp.qualification === 'operator_reviewed'
                  ? 'examinée par l’exploitant, non validée automatiquement'
                  : 'non évaluée'}
              </p>
            )}
            {result?.reportedLevel && (
              <p>
                Niveau annoncé par le prestataire : {result.reportedLevel}. Qualification eIDAS non
                vérifiée par PREUVIX.
              </p>
            )}
            {result?.evidenceReference && <p>Justificatif : {result.evidenceReference}</p>}
            {op?.error && <p className="case-error">{op.error}</p>}
            {op && (
              <p className="case-muted">
                {op.attempts} tentative(s) · mise à jour {utc(op.updatedAt)}
              </p>
            )}
          </article>
        );
      })}
    </>
  );
}

export default function Cases({
  proofs,
  refreshProofs,
  requestCapture,
}: {
  proofs: Proof[];
  refreshProofs: () => Promise<void>;
  requestCapture: (callback: (proof: Proof) => Promise<void>) => void;
}) {
  const [list, setList] = useState<CaseSummary[]>([]),
    [dossier, setDossier] = useState<CaseDetail | null>(null);
  const [creating, setCreating] = useState(false),
    [form, setForm] = useState<CaseInput>(empty);
  const [busy, setBusy] = useState('Chargement des dossiers…'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [proofId, setProofId] = useState(''),
    [replaceFileId, setReplaceFileId] = useState('');
  const [uploads, setUploads] = useState<{ file: File; key: string }[]>([]);
  const [signerEmail, setSignerEmail] = useState(''),
    [anchorConsent, setAnchorConsent] = useState(false),
    [signatureConsent, setSignatureConsent] = useState(false);
  const [includeOriginals, setIncludeOriginals] = useState(false),
    [shareConfirmed, setShareConfirmed] = useState(false),
    [days, setDays] = useState(7);
  const [links, setLinks] = useState<ShareLink[]>([]),
    [shareUrl, setShareUrl] = useState('');
  const createKey = useRef(crypto.randomUUID()),
    locked = useRef(false);
  const latest = Boolean(dossier && dossier.manifest.version === dossier.latestVersion);
  async function refreshList() {
    setList((await api<{ cases: CaseSummary[] }>('/api/cases')).cases);
  }
  async function open(id: string, version?: number) {
    const result = await api<CaseDetail>(`/api/cases/${id}${version ? `?version=${version}` : ''}`);
    setDossier(result);
    setForm({
      title: result.manifest.title,
      description: result.manifest.description,
      declaredAddress: result.manifest.declaredAddress,
    });
    setLinks(await api<ShareLink[]>(`/api/cases/${id}/links`));
    return result;
  }
  async function run(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy('');
    }
  }
  useEffect(() => {
    let alive = true;
    api<{ cases: CaseSummary[] }>('/api/cases')
      .then((value) => {
        if (alive) setList(value.cases);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy('');
      });
    return () => {
      alive = false;
    };
  }, []);
  async function attach(proof: string, current = dossier!) {
    const updated = await api<CaseDetail>(`/api/cases/${current.manifest.id}/files`, {
      method: 'POST',
      body: JSON.stringify({
        expectedVersion: current.manifest.version,
        proofId: proof,
        ...(replaceFileId ? { replaceFileId } : {}),
      }),
    });
    setDossier(updated);
    await refreshList();
    return updated;
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run('Enregistrement de la version…', async () => {
      if (creating) {
        const result = await api<CaseDetail>('/api/cases', {
          method: 'POST',
          body: JSON.stringify({ requestKey: createKey.current, dossier: form }),
        });
        setDossier(result);
        setCreating(false);
        setLinks([]);
        setShareUrl('');
        setUploads([]);
        setReplaceFileId('');
        setProofId('');
        setAnchorConsent(false);
        setSignatureConsent(false);
        setShareConfirmed(false);
        createKey.current = crypto.randomUUID();
      } else {
        const result = await api<CaseDetail>(`/api/cases/${dossier!.manifest.id}`, {
          method: 'PUT',
          body: JSON.stringify({ expectedVersion: dossier!.manifest.version, dossier: form }),
        });
        setDossier(result);
      }
      await refreshList();
      setNotice('Version enregistrée. Les précédentes sont conservées.');
    });
  }
  async function upload() {
    let current = dossier!;
    if (replaceFileId && uploads.length !== 1)
      throw new Error('Choisissez un seul fichier pour remplacer une version.');
    for (const [index, item] of uploads.entries()) {
      setBusy(`Dépôt ${index + 1}/${uploads.length} : ${item.file.name}`);
      const body = new FormData();
      body.append('file', item.file);
      body.append('title', item.file.name.slice(0, 120));
      body.append('source', 'upload');
      body.append('requestKey', item.key);
      body.append('clientSha256', await sha256File(item.file));
      const proof = await api<Proof>('/api/proofs', { method: 'POST', body });
      if (!current.manifest.files.some((file) => file.proofId === proof.id))
        current = await attach(proof.id, current);
    }
    setUploads([]);
    setReplaceFileId('');
    await refreshProofs();
    setNotice('Originaux enregistrés et ajoutés au dossier.');
  }
  async function service(kind: ServiceKind) {
    try {
      await api(`/api/cases/${dossier!.manifest.id}/services/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          version: dossier!.manifest.version,
          consent: true,
          ...(kind === 'signature' ? { signerEmail } : {}),
        }),
      });
    } finally {
      await open(dossier!.manifest.id, dossier!.manifest.version);
    }
  }
  return (
    <div className="cases-workspace" aria-busy={Boolean(busy)}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DOSSIERS · VERSIONS · TRAÇABILITÉ</span>
          <h1>{dossier && !creating ? dossier.manifest.title : 'Dossiers multi-fichiers'}</h1>
          <p>
            Réunissez vos preuves, conservez leurs versions et demandez les justificatifs
            disponibles.
          </p>
        </div>
      </div>
      {busy && <p role="status">{busy}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div role="alert" className="case-error">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() =>
              void run('Actualisation…', async () => {
                await refreshList();
                if (dossier) await open(dossier.manifest.id);
              })
            }
          >
            Actualiser et réessayer
          </button>
        </div>
      )}
      <fieldset disabled={!!busy} className="case-controls">
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => {
              setDossier(null);
              setCreating(false);
              setShareUrl('');
              setUploads([]);
            }}
          >
            Tous les dossiers
          </button>
          <button
            className="button primary"
            onClick={() => {
              setDossier(null);
              setForm(empty);
              setCreating(true);
              setShareUrl('');
              createKey.current = crypto.randomUUID();
            }}
          >
            Créer un dossier
          </button>
        </div>
        {creating && (
          <form className="case-panel" onSubmit={save}>
            <h2>Nouveau dossier</h2>
            <Fields
              value={form}
              onChange={(value) => {
                setForm(value);
                createKey.current = crypto.randomUUID();
              }}
            />
            <button className="button primary">Enregistrer le dossier</button>
          </form>
        )}
        {!dossier && !creating && (
          <section className="case-list" aria-label="Liste des dossiers">
            {!list.length && !busy && (
              <p>Créez votre premier dossier, puis ajoutez les fichiers à conserver.</p>
            )}
            {list.map((item) => (
              <button
                className="case-file"
                key={item.id}
                onClick={() =>
                  void run('Ouverture du dossier…', async () => {
                    setShareUrl('');
                    setReplaceFileId('');
                    setUploads([]);
                    await open(item.id);
                  })
                }
              >
                <strong>{item.title}</strong>
                <span>
                  Version {item.version} · {utc(item.updatedAt)}
                </span>
                <p>{item.description}</p>
              </button>
            ))}
          </section>
        )}
        {dossier && !creating && (
          <>
            <section className="case-panel">
              <label>
                Version du dossier
                <select
                  value={dossier.manifest.version}
                  onChange={(event) =>
                    void run('Chargement de la version…', async () => {
                      setShareUrl('');
                      await open(dossier.manifest.id, Number(event.target.value));
                    })
                  }
                >
                  {dossier.versions.map((version) => (
                    <option key={version.version} value={version.version}>
                      Version {version.version} · {utc(version.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {latest
                  ? 'Version actuelle.'
                  : 'Version historique en lecture seule. Les demandes et exports concernent cette version précise.'}
              </p>
              <p>Empreinte reproductible de cette version :</p>
              <code>{dossier.manifestHash}</code>
            </section>
            {latest && (
              <details className="case-panel">
                <summary>Modifier le titre, la description ou l’adresse</summary>
                <form onSubmit={save}>
                  <Fields value={form} onChange={setForm} />
                  <button className="button secondary">Enregistrer une nouvelle version</button>
                </form>
              </details>
            )}
            <p>{dossier.manifest.description}</p>
            {dossier.manifest.declaredAddress && (
              <p>Adresse saisie, non vérifiée : {dossier.manifest.declaredAddress}</p>
            )}
            {latest && (
              <section className="case-panel">
                <h2>Ajouter ou remplacer un fichier</h2>
                <label>
                  Action
                  <select
                    value={replaceFileId}
                    onChange={(event) => setReplaceFileId(event.target.value)}
                  >
                    <option value="">Ajouter de nouveaux fichiers</option>
                    {dossier.manifest.files.map((file) => (
                      <option value={file.fileId} key={file.fileId}>
                        Nouvelle version de : {file.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fichiers à ajouter
                  <input
                    type="file"
                    multiple={!replaceFileId}
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={(event) =>
                      setUploads(
                        Array.from(event.target.files ?? []).map((file) => ({
                          file,
                          key: crypto.randomUUID(),
                        })),
                      )
                    }
                  />
                </label>
                <p>
                  JPEG, PNG, WebP : 10 Mo ; MP4, WebM : 50 Mo. Les originaux sont conservés sans
                  modification. Un remplacement conserve l’ancienne version.
                </p>
                <button
                  className="button primary"
                  disabled={!uploads.length}
                  onClick={() => void run('Calcul et dépôt…', upload)}
                >
                  Ajouter les fichiers sélectionnés
                </button>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() =>
                      requestCapture(async (proof) => {
                        await attach(proof.id);
                        setReplaceFileId('');
                        setNotice('Capture ajoutée au dossier.');
                      })
                    }
                  >
                    Capturer une photo ou vidéo
                  </button>
                </div>
                <label>
                  Ou choisir une preuve existante
                  <select value={proofId} onChange={(event) => setProofId(event.target.value)}>
                    <option value="">Sélectionner une preuve</option>
                    {proofs
                      .filter(
                        (proof) =>
                          !dossier.manifest.files.some((file) => file.proofId === proof.id),
                      )
                      .map((proof) => (
                        <option key={proof.id} value={proof.id}>
                          {proof.manifest.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={!proofId}
                  onClick={() =>
                    void run('Ajout au dossier…', async () => {
                      await attach(proofId);
                      setProofId('');
                      setReplaceFileId('');
                    })
                  }
                >
                  Ajouter cette preuve
                </button>
              </section>
            )}
            <EvidenceFiles dossier={dossier} />
            <button
              className="button secondary"
              onClick={() =>
                void run('Recalcul des empreintes serveur…', async () => {
                  const result = await api<{
                    manifestMatches: boolean;
                    files: { originalMatches: boolean; manifestMatches: boolean }[];
                  }>(`/api/cases/${dossier.manifest.id}/verify`, {
                    method: 'POST',
                    body: JSON.stringify({ version: dossier.manifest.version }),
                  });
                  if (
                    !result.manifestMatches ||
                    result.files.some((file) => !file.originalMatches || !file.manifestMatches)
                  )
                    throw new Error(
                      'Une différence a été détectée. Consultez les originaux et les versions.',
                    );
                  setNotice(
                    'Intégrité vérifiée : les empreintes recalculées correspondent aux originaux et aux manifestes.',
                  );
                })
              }
            >
              Contrôler l’intégrité du dossier
            </button>
            <section className="case-panel">
              <h2>Ancrage, horodatage et signature</h2>
              <p>
                Chaque demande porte sur la version {dossier.manifest.version}. Une nouvelle version
                nécessite ses propres justificatifs.
              </p>
              <div className="case-services">
                <ServiceEvidence dossier={dossier} />
              </div>
              <button
                className="button secondary"
                disabled={
                  !dossier.services.timestamp.configured ||
                  !dossier.manifest.files.length ||
                  dossier.operations.some((op) => op.kind === 'timestamp')
                }
                onClick={() => void run('Demande d’horodatage…', () => service('timestamp'))}
              >
                Demander un horodatage prestataire
              </button>
              <label className="case-check">
                <input
                  type="checkbox"
                  checked={anchorConsent}
                  onChange={(event) => setAnchorConsent(event.target.checked)}
                />
                J’autorise l’ancrage de la seule empreinte de cette version sur le réseau configuré.
                Une publication sur blockchain ne peut généralement pas être retirée.
              </label>
              <button
                className="button secondary"
                disabled={
                  !anchorConsent ||
                  !dossier.services.anchor.configured ||
                  !dossier.manifest.files.length ||
                  dossier.operations.some((op) => op.kind === 'anchor')
                }
                onClick={() => void run('Demande d’ancrage…', () => service('anchor'))}
              >
                Demander l’ancrage blockchain
              </button>
              <label>
                E-mail du signataire
                <input
                  type="email"
                  value={signerEmail}
                  maxLength={254}
                  onChange={(event) => setSignerEmail(event.target.value)}
                />
              </label>
              <label className="case-check">
                <input
                  type="checkbox"
                  checked={signatureConsent}
                  onChange={(event) => setSignatureConsent(event.target.checked)}
                />
                J’autorise l’envoi du récapitulatif PDF (dont les coordonnées disponibles) et de
                cette adresse e-mail au prestataire de signature. Aucun fichier original n’est
                envoyé.
              </label>
              <button
                className="button secondary"
                disabled={
                  !signatureConsent ||
                  !signerEmail ||
                  !dossier.services.signature.configured ||
                  !dossier.manifest.files.length ||
                  dossier.operations.some((op) => op.kind === 'signature')
                }
                onClick={() =>
                  void run('Création de la demande de signature…', () => service('signature'))
                }
              >
                Demander la signature électronique
              </button>
              {dossier.operations.map((op) => (
                <div className="button-row" key={op.id}>
                  {op.state !== 'confirmed' && (
                    <button
                      className="button secondary"
                      disabled={!dossier.services[op.kind].configured}
                      onClick={() =>
                        void run('Suivi de la demande…', async () => {
                          try {
                            await api(
                              `/api/cases/${dossier.manifest.id}/operations/${op.id}/retry`,
                              { method: 'POST' },
                            );
                          } finally {
                            await open(dossier.manifest.id, dossier.manifest.version);
                          }
                        })
                      }
                    >
                      {op.state === 'failed' ? 'Réessayer' : 'Actualiser'} :{' '}
                      {serviceLabels[op.kind]}
                    </button>
                  )}
                  {op.kind === 'signature' && op.state === 'confirmed' && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void run('Téléchargement…', () =>
                          download(
                            `/api/cases/${dossier.manifest.id}/operations/${op.id}/document`,
                            'document-retourne-signe.pdf',
                          ),
                        )
                      }
                    >
                      Télécharger le document signé
                    </button>
                  )}
                </div>
              ))}
              <p className="case-muted">
                La confirmation d’ancrage et le niveau de signature proviennent du service
                configuré. PREUVIX ne certifie pas leur qualification eIDAS et ne valide pas
                localement les certificats de signature du PDF retourné.
              </p>
            </section>
            <details>
              <summary>
                Signature technique PREUVIX (distincte de la signature électronique)
              </summary>
              <SignatureControl attestation={dossier.attestation} />
            </details>
            <section className="case-panel">
              <h2>Télécharger le dossier</h2>
              <label className="case-check">
                <input
                  type="checkbox"
                  checked={includeOriginals}
                  onChange={(event) => setIncludeOriginals(event.target.checked)}
                />
                Inclure les originaux dans le ZIP (100 Mo maximum)
              </label>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() =>
                    void run('Génération du ZIP…', () =>
                      download(
                        `/api/cases/${dossier.manifest.id}/export?version=${dossier.manifest.version}&originals=${includeOriginals}`,
                        `dossier-v${dossier.manifest.version}.zip`,
                      ),
                    )
                  }
                >
                  Télécharger le dossier ZIP
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    void run('Génération du PDF…', () =>
                      download(
                        `/api/cases/${dossier.manifest.id}/report?version=${dossier.manifest.version}`,
                        'recapitulatif.pdf',
                      ),
                    )
                  }
                >
                  Télécharger le PDF
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    void run('Téléchargement du manifeste…', () =>
                      download(
                        `/api/cases/${dossier.manifest.id}/manifest?version=${dossier.manifest.version}`,
                        'dossier.json',
                      ),
                    )
                  }
                >
                  Télécharger le manifeste JSON
                </button>
              </div>
              <p>
                Le ZIP inclut un manifeste d’export déterministe, les justificatifs disponibles et
                une signature technique. Il indique séparément l’empreinte de version concernée par
                l’ancrage.
              </p>
            </section>
            <details className="case-panel">
              <summary>Partager explicitement cette version</summary>
              <p>
                Le lien donnera accès au titre, à la description, à l’adresse saisie, aux
                informations des fichiers, aux localisations et aux justificatifs de cette version.
                Les originaux seront {includeOriginals ? 'inclus' : 'exclus'} selon le choix de
                téléchargement ci-dessus. Toute personne disposant du lien peut le consulter.
              </p>
              <label>
                Durée du lien
                <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  <option value={7}>7 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={90}>90 jours</option>
                </select>
              </label>
              <label className="case-check">
                <input
                  type="checkbox"
                  checked={shareConfirmed}
                  onChange={(e) => setShareConfirmed(e.target.checked)}
                />
                Je confirme le partage de cette version et des informations indiquées.
              </label>
              <button
                className="button secondary"
                disabled={!shareConfirmed}
                onClick={() =>
                  void run('Création du lien…', async () => {
                    const result = await api<{ url: string }>(
                      `/api/cases/${dossier.manifest.id}/links`,
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          version: dossier.manifest.version,
                          confirmed: true,
                          includeOriginals,
                          days,
                        }),
                      },
                    );
                    setShareUrl(location.origin + result.url);
                    setShareConfirmed(false);
                    setLinks(await api(`/api/cases/${dossier.manifest.id}/links`));
                  })
                }
              >
                Créer un lien révocable
              </button>
              {shareUrl && (
                <p role="status">
                  Copiez ce lien maintenant : <a href={shareUrl}>{shareUrl}</a>
                </p>
              )}
              {links.map((link) => (
                <div className="case-link" key={link.id}>
                  <p>
                    Version {link.version} ·{' '}
                    {link.includeOriginals ? 'avec originaux' : 'sans originaux'} ·{' '}
                    {link.revokedAt
                      ? 'Révoqué'
                      : new Date(link.expiresAt).getTime() < Date.now()
                        ? 'Expiré'
                        : `expire le ${utc(link.expiresAt)}`}
                  </p>
                  {!link.revokedAt && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void run('Révocation…', async () => {
                          await api(`/api/cases/${dossier.manifest.id}/links/${link.id}`, {
                            method: 'DELETE',
                          });
                          setLinks(await api(`/api/cases/${dossier.manifest.id}/links`));
                          setShareUrl('');
                        })
                      }
                    >
                      Révoquer ce lien
                    </button>
                  )}
                </div>
              ))}
              <p>La révocation bloque les accès futurs, pas les copies déjà téléchargées.</p>
            </details>
            <details className="case-panel">
              <summary>Historique des opérations</summary>
              <ul>
                {dossier.events.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    {utc(event.at)} · v{event.version} · {event.kind}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </fieldset>
    </div>
  );
}

export function CaseConsultation({ token }: { token: string }) {
  const [data, setData] = useState<{
      dossier: CaseDetail;
      includeOriginals: boolean;
      expiresAt: string;
    } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<typeof data>(`/api/case-consultation/${token}`)
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
    <main className="knowledge-page cases-workspace">
      <a href="/">PREUVIX</a>
      <h1>Consultation du dossier</h1>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Chargement…</p>}
      {data && (
        <>
          <h2>
            {data.dossier.manifest.title} · version {data.dossier.manifest.version}
          </h2>
          <p>{data.dossier.manifest.description}</p>
          <p>
            Adresse saisie, non vérifiée :{' '}
            {data.dossier.manifest.declaredAddress || 'Non renseignée'}
          </p>
          <p>
            Accès valable jusqu’au {utc(data.expiresAt)}. Originaux{' '}
            {data.includeOriginals ? 'inclus' : 'exclus'}.
          </p>
          <EvidenceFiles dossier={data.dossier} privateView={false} />
          <ServiceEvidence dossier={data.dossier} />
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await download(`/api/case-consultation/${token}/export`, 'dossier-partage.zip');
              } catch (e) {
                setError((e as Error).message);
                setData(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Préparation…' : 'Télécharger le dossier partagé'}
          </button>
        </>
      )}
    </main>
  );
}
