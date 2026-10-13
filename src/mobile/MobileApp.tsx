import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  FolderOpen,
  Camera,
  FilePlus,
  RefreshCw,
  ArrowLeft,
  LogOut,
  Download,
  MapPin,
} from 'lucide-react';
import {
  serviceLabels,
  serviceStateLabel,
  type CaseDetail,
  type CaseSummary,
} from '../../shared/cases';
import { locationDescription, type LocationSample } from '../../shared/capture';
import type { MobileEvidence } from '../../shared/mobile';
import { SignatureControl } from '../CaptureEvidence';
import { backend } from './config';
import { mobileApi, setSession } from './api';
import { listDrafts, newDraft, removeDraft, saveDraft, type Draft } from './drafts';
import { capturePhoto, photoFile, readLocation, selectFile, shareDownload } from './device';
import { sendDraft } from './upload';

type PendingCamera = {
  id: string;
  caseId: string;
  backend: string;
  location: LocationSample;
  selectedAt: string;
};
const cameraKey = 'preuvix-pending-camera';
function configuration() {
  try {
    return { url: backend(), error: '' };
  } catch {
    return {
      url: '',
      error:
        'Le serveur Android n’est pas configuré. Consultez README_ANDROID.md puis reconstruisez l’application.',
    };
  }
}

export default function MobileApp() {
  const config = configuration();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<'cases' | 'drafts'>('cases');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [busy, setBusy] = useState('');
  const active = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const reloadDrafts = useCallback(async () => setDrafts(await listDrafts()), []);
  async function run(label: string, action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      if (/cancel|annul/i.test(message)) setNotice('Action annulée. Aucun nouvel envoi.');
      else setError(message);
    } finally {
      active.current = false;
      setBusy('');
    }
  }
  async function refresh() {
    await reloadDrafts();
    setCases((await mobileApi<{ cases: CaseSummary[] }>('/api/cases')).cases);
  }
  const stage = useCallback(
    async (file: File, context: PendingCamera, camera: boolean) => {
      if (file.size > 10 * 1024 * 1024)
        throw new Error(
          'Maximum 10 Mo : aucune compression automatique. La photo n’a pas été enregistrée comme brouillon.',
        );
      const evidence: MobileEvidence = {
        origin: camera ? 'native_camera' : 'system_file_picker',
        selectedAt: context.selectedAt,
        transformation: camera ? 'camera_jpeg_processing' : 'none_by_preuvix',
        location: context.location,
      };
      const draft = {
        ...newDraft('file'),
        id: context.id,
        backend: context.backend,
        title: file.name.slice(0, 120),
        caseId: context.caseId,
        file,
        fileName: file.name,
        evidence,
      };
      await saveDraft(draft);
      if (camera) localStorage.removeItem(cameraKey);
      await reloadDrafts();
      setTab('drafts');
      setDetail(null);
      setNotice('Brouillon local enregistré. Aucun fichier n’a encore été envoyé.');
    },
    [reloadDrafts],
  );
  useEffect(() => {
    const expire = () => {
      setAuthenticated(false);
      setDetail(null);
      setPassword('');
    };
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('preuvix-session-expired', expire);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      window.removeEventListener('preuvix-session-expired', expire);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('appRestoredResult', async (event) => {
      if (event.pluginId !== 'Camera' || event.methodName !== 'takePhoto') return;
      try {
        const raw = localStorage.getItem(cameraKey);
        if (!raw)
          throw new Error('Une capture a été interrompue sans contexte de dossier récupérable.');
        const context: PendingCamera = JSON.parse(raw);
        if (context.backend !== backend())
          throw new Error('La capture interrompue appartient à un autre serveur.');
        if (!event.success) throw new Error(event.error?.message || 'Capture interrompue.');
        await stage(await photoFile(event.data), context, true);
      } catch (failure) {
        setError((failure as Error).message);
      }
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [stage]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (active.current) {
        setNotice('Une action est en cours ; attendez son résultat.');
        return;
      }
      if (creating) setCreating(false);
      else if (detail) setDetail(null);
      else if (tab === 'drafts') setTab('cases');
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [creating, detail, tab]);
  async function addFile(camera: boolean, photos = false) {
    if (!detail) return;
    const location = locationEnabled ? await readLocation() : { status: 'not_requested' as const };
    const context: PendingCamera = {
      id: crypto.randomUUID(),
      caseId: detail.manifest.id,
      backend: backend(),
      location,
      selectedAt: new Date().toISOString(),
    };
    if (camera) localStorage.setItem(cameraKey, JSON.stringify(context));
    const file = camera ? await capturePhoto() : await selectFile(photos);
    if (file) await stage(file, context, camera);
  }
  const back = () => {
    setDetail(null);
    setCreating(false);
  };
  return (
    <div className="mobile-app">
      <header className="mobile-header">
        {detail || creating ? (
          <button aria-label="Retour aux dossiers" disabled={!!busy} onClick={back}>
            <ArrowLeft />
          </button>
        ) : (
          <FolderOpen aria-hidden="true" />
        )}
        <div>
          <strong>PREUVIX</strong>
          <span>Vos preuves, à portée de main</span>
        </div>
        {authenticated && (
          <button
            aria-label="Se déconnecter"
            disabled={!!busy}
            onClick={() =>
              void run('Déconnexion', async () => {
                await mobileApi('/api/logout', { method: 'POST' });
                setSession('');
                setAuthenticated(false);
                setDetail(null);
                setCases([]);
                setPassword('');
              })
            }
          >
            <LogOut />
          </button>
        )}
      </header>
      <main className="mobile-main">
        {!online && (
          <p className="mobile-notice" role="status">
            Hors connexion. Les brouillons restent sur cet appareil. Aucun envoi automatique.
          </p>
        )}
        {(config.error || error) && (
          <p className="mobile-error" role="alert">
            {config.error || error}
          </p>
        )}
        {busy && (
          <p role="status" aria-live="polite">
            {busy}…
          </p>
        )}
        {notice && (
          <p className="mobile-notice" role="status">
            {notice}
          </p>
        )}
        {!authenticated ? (
          <section className="mobile-card">
            <h1>Mon espace de preuve</h1>
            <p>Connectez-vous avec le mot de passe de votre installation Preuvix.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run('Connexion', async () => {
                  const result = await mobileApi<{ token: string }>('/api/mobile/login', {
                    method: 'POST',
                    body: JSON.stringify({ password }),
                  });
                  setSession(result.token);
                  setPassword('');
                  setAuthenticated(true);
                  await refresh();
                });
              }}
            >
              <label>
                Mot de passe de l’espace
                <input
                  autoComplete="current-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="button primary" disabled={!!busy || !!config.error}>
                Ouvrir mon espace
              </button>
            </form>
            <p className="mobile-small">{config.url}</p>
            <p className="mobile-small">
              La session reste en mémoire et expire après 12 heures. Les brouillons sont conservés
              sur cet appareil, même après fermeture.
            </p>
          </section>
        ) : (
          <>
            <nav className="mobile-tabs" aria-label="Navigation principale">
              <button
                aria-current={tab === 'cases' ? 'page' : undefined}
                disabled={!!busy}
                onClick={() => {
                  setTab('cases');
                  back();
                }}
              >
                Dossiers
              </button>
              <button
                aria-current={tab === 'drafts' ? 'page' : undefined}
                disabled={!!busy}
                onClick={() => {
                  setTab('drafts');
                  back();
                  void run('Lecture des brouillons', reloadDrafts);
                }}
              >
                Brouillons ({drafts.filter((d) => !d.completed).length})
              </button>
            </nav>
            {tab === 'drafts' ? (
              <section>
                <h1>Brouillons de cet appareil</h1>
                <p>
                  Conservés localement jusqu’à suppression explicite. L’effacement des données de
                  l’application les supprime.
                </p>
                {!drafts.length && <p>Aucun brouillon local.</p>}
                {drafts.map((draft) => (
                  <article className="mobile-card" key={draft.id}>
                    <h2>{draft.title}</h2>
                    <p>
                      {draft.completed
                        ? 'Reçu par le serveur et ajouté au dossier'
                        : draft.proof
                          ? 'Fichier reçu par le serveur · ajout au dossier à terminer'
                          : 'Brouillon local · non envoyé'}
                    </p>
                    {draft.evidence && (
                      <>
                        <p>
                          {draft.evidence.origin === 'native_camera'
                            ? 'Photo produite par la caméra Android · traitement JPEG possible'
                            : 'Fichier importé · aucune transformation par Preuvix'}
                        </p>
                        <p>{locationDescription(draft.evidence.location)}</p>
                      </>
                    )}
                    {draft.proof && (
                      <p>
                        {draft.proof.status === 'timestamped' && draft.proof.receipt
                          ? `Jeton d’horodatage vérifié : ${draft.proof.receipt.time}`
                          : 'Pas d’horodatage validé pour ce fichier.'}
                      </p>
                    )}
                    {!draft.completed && (
                      <button
                        className="button primary"
                        disabled={!!busy || !online}
                        onClick={() =>
                          void run('Envoi en cours', async () => {
                            const result = await sendDraft(draft);
                            setCases((previous) => [
                              {
                                id: result.manifest.id,
                                title: result.manifest.title,
                                description: result.manifest.description,
                                version: result.manifest.version,
                                createdAt:
                                  previous.find((item) => item.id === result.manifest.id)
                                    ?.createdAt ?? result.manifest.createdAt,
                                updatedAt: result.manifest.createdAt,
                              },
                              ...previous.filter((item) => item.id !== result.manifest.id),
                            ]);
                            await reloadDrafts();
                            setNotice(
                              'Reçu par le serveur. Consultez le dossier pour les justificatifs disponibles.',
                            );
                            setDetail(result);
                            setTab('cases');
                          }).finally(() => reloadDrafts().catch(() => {}))
                        }
                      >
                        {draft.proof ? 'Terminer l’ajout au dossier' : 'Envoyer ce brouillon'}
                      </button>
                    )}
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Supprimer la copie locale de ce brouillon ? Un fichier déjà reçu par le serveur reste conservé.',
                          )
                        )
                          void run('Suppression locale', async () => {
                            await removeDraft(draft.id);
                            await reloadDrafts();
                          });
                      }}
                    >
                      Supprimer la copie locale
                    </button>
                  </article>
                ))}
              </section>
            ) : creating ? (
              <section className="mobile-card">
                <h1>Nouveau dossier</h1>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run('Enregistrement local', async () => {
                      const draft = newDraft('case');
                      draft.title = title.trim();
                      draft.description = description;
                      draft.dossier = { title: title.trim(), description, declaredAddress: '' };
                      await saveDraft(draft);
                      await reloadDrafts();
                      setCreating(false);
                      setTab('drafts');
                      setTitle('');
                      setDescription('');
                      setNotice(
                        'Dossier enregistré en brouillon local. Envoyez-le pour y ajouter des pièces.',
                      );
                    });
                  }}
                >
                  <label>
                    Titre du dossier
                    <input
                      required
                      maxLength={120}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      maxLength={3000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={!!busy || !title.trim()}>
                    Enregistrer le brouillon
                  </button>
                </form>
              </section>
            ) : detail ? (
              <section>
                <h1>{detail.manifest.title}</h1>
                <p>{detail.manifest.description}</p>
                <label>
                  Version du dossier
                  <select
                    disabled={!!busy}
                    value={detail.manifest.version}
                    onChange={(e) =>
                      void run('Chargement de la version', async () =>
                        setDetail(
                          await mobileApi(
                            `/api/cases/${detail.manifest.id}?version=${e.target.value}`,
                          ),
                        ),
                      )
                    }
                  >
                    {detail.versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        Version {v.version}
                      </option>
                    ))}
                  </select>
                </label>
                <section className="mobile-card">
                  <h2>Ajouter une pièce</h2>
                  <p>
                    Photos JPEG, PNG, WebP ou documents PDF · 10 Mo maximum. Les octets reçus sont
                    conservés.
                  </p>
                  <label className="mobile-check">
                    <input
                      type="checkbox"
                      checked={locationEnabled}
                      onChange={(e) => setLocationEnabled(e.target.checked)}
                    />
                    <MapPin size={20} />
                    Ajouter ma position au moment de l’action
                  </label>
                  <p className="mobile-small">
                    Facultatif. Un refus n’empêche pas l’ajout. La position décrit le téléphone, pas
                    nécessairement le lieu de la scène ou du document.
                  </p>
                  <div className="mobile-actions">
                    <button
                      disabled={!!busy}
                      className="button primary"
                      onClick={() => void run('Ouverture de la caméra', () => addFile(true))}
                    >
                      <Camera size={20} />
                      Prendre une photo
                    </button>
                    <button
                      disabled={!!busy}
                      className="button secondary"
                      onClick={() => void run('Sélection de photo', () => addFile(false, true))}
                    >
                      Choisir une photo
                    </button>
                    <button
                      disabled={!!busy}
                      className="button secondary"
                      onClick={() => void run('Sélection de fichier', () => addFile(false))}
                    >
                      <FilePlus size={20} />
                      Choisir un document
                    </button>
                  </div>
                  <p className="mobile-small">
                    La caméra produit un JPEG et peut le traiter. Aucun défi web ni origine
                    matérielle authentifiée n’est revendiqué. L’heure du téléphone n’est pas un
                    horodatage qualifié.
                  </p>
                </section>
                <section aria-label="Pièces du dossier">
                  <h2>Pièces et traçabilité</h2>
                  {!detail.manifest.files.length && (
                    <p>Ce dossier ne contient pas encore de pièce.</p>
                  )}
                  {detail.manifest.files.map((file) => (
                    <article className="mobile-card" key={file.fileId}>
                      <h3>{file.title}</h3>
                      <p>
                        {file.file.name} · {file.file.size.toLocaleString('fr-FR')} octets
                      </p>
                      <p>
                        {file.mobileEvidence
                          ? file.mobileEvidence.origin === 'native_camera'
                            ? 'Caméra Android — origine déclarée'
                            : 'Import original reçu — origine déclarée'
                          : file.capture
                            ? 'Capture web avec session'
                            : 'Pièce historique'}
                      </p>
                      <p>Réception serveur : {new Date(file.receivedAt).toLocaleString('fr-FR')}</p>
                      <p>
                        {locationDescription(
                          file.mobileEvidence?.location ?? file.capture?.location?.start,
                        )}
                      </p>
                      {file.mobileEvidence && (
                        <p>
                          Heure du téléphone : {file.mobileEvidence.selectedAt}.{' '}
                          {file.mobileEvidence.transformation === 'camera_jpeg_processing'
                            ? 'Traitement JPEG possible par la caméra / le plugin.'
                            : 'Aucune transformation par Preuvix.'}
                        </p>
                      )}
                      <details>
                        <summary>Empreinte SHA-256</summary>
                        <code>{file.file.sha256}</code>
                      </details>
                      <button
                        disabled={!!busy}
                        className="button secondary"
                        onClick={() =>
                          void run('Téléchargement de la pièce', () =>
                            shareDownload(`/api/proofs/${file.proofId}/original`, file.file.name),
                          )
                        }
                      >
                        Enregistrer / partager la pièce
                      </button>
                    </article>
                  ))}
                </section>
                <section className="mobile-card">
                  <h2>Justificatifs disponibles</h2>
                  {(['timestamp', 'anchor', 'signature'] as const).map((kind) => {
                    const operation = detail.operations.find((op) => op.kind === kind);
                    return (
                      <p key={kind}>
                        <strong>{serviceLabels[kind]}</strong> :{' '}
                        {serviceStateLabel(
                          kind,
                          operation?.state,
                          detail.services[kind].configured,
                        )}
                        {detail.services[kind].provider
                          ? ` · ${detail.services[kind].provider}`
                          : ''}
                        {operation?.error ? ` · ${operation.error}` : ''}
                      </p>
                    );
                  })}
                  <p className="mobile-small">
                    La réception serveur et la signature technique du manifeste ne constituent pas
                    un horodatage qualifié. Les demandes de prestation restent disponibles sur le
                    site web.
                  </p>
                  <SignatureControl attestation={detail.attestation} />
                  <details>
                    <summary>Historique et manifeste signé</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          manifest: detail.manifest,
                          operations: detail.operations,
                          events: detail.events,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </section>
                <div className="mobile-actions">
                  <button
                    disabled={!!busy}
                    className="button primary"
                    onClick={() =>
                      void run('Téléchargement du PDF', () =>
                        shareDownload(
                          `/api/cases/${detail.manifest.id}/report?version=${detail.manifest.version}`,
                          'dossier-preuvix.pdf',
                        ),
                      )
                    }
                  >
                    <Download size={20} />
                    Enregistrer / partager le PDF
                  </button>
                  <button
                    disabled={!!busy}
                    className="button secondary"
                    onClick={() =>
                      void run('Téléchargement du dossier', () =>
                        shareDownload(
                          `/api/cases/${detail.manifest.id}/export?version=${detail.manifest.version}&originals=true`,
                          'dossier-preuvix.zip',
                        ),
                      )
                    }
                  >
                    Partager le ZIP avec les originaux
                  </button>
                  <button
                    disabled={!!busy}
                    className="button secondary"
                    onClick={() =>
                      void run('Actualisation du dossier', async () =>
                        setDetail(await mobileApi(`/api/cases/${detail.manifest.id}`)),
                      )
                    }
                  >
                    Actualiser le dossier
                  </button>
                </div>
              </section>
            ) : (
              <section>
                <h1>Mes dossiers de preuve</h1>
                <div className="mobile-actions">
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() => setCreating(true)}
                  >
                    Créer un dossier
                  </button>
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() => void run('Actualisation', refresh)}
                  >
                    <RefreshCw size={20} />
                    Actualiser
                  </button>
                </div>
                {!cases.length && (
                  <p>Aucun dossier chargé. Créez un dossier ou actualisez la liste.</p>
                )}
                {cases.map((item) => (
                  <button
                    className="mobile-card mobile-case"
                    disabled={!!busy}
                    key={item.id}
                    onClick={() =>
                      void run('Ouverture du dossier', async () =>
                        setDetail(await mobileApi(`/api/cases/${item.id}`)),
                      )
                    }
                  >
                    <strong>{item.title}</strong>
                    <span>
                      Version {item.version} ·{' '}
                      {new Date(item.updatedAt).toLocaleDateString('fr-FR')}
                    </span>
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
