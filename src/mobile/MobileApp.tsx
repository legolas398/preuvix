import ServiceEvidence from '../ServiceEvidence';
import MobileCertificationActions from './MobileCertificationActions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FolderOpen, Camera, RefreshCw, ArrowLeft, LogOut, Download } from 'lucide-react';
import { type CaseDetail, type CaseSummary } from '../../shared/cases';
import { locationDescription } from '../../shared/capture';
import type { MobileEvidence } from '../../shared/mobile';
import { SignatureControl } from '../CaptureEvidence';
import { backend } from './config';
import { mobileApi, setSession } from './api';
import { listDrafts, newDraft, removeDraft, saveDraft, type Draft } from './drafts';
import { readLocation, shareDownload } from './device';
import CapturePanel from '../CapturePanel';
import type { CaptureRecord } from '../../shared/capture';
import { sendDraft } from './upload';

const captureRequest = <T,>(url: string, body: unknown) =>
  mobileApi<T>(url, { method: 'POST', body: JSON.stringify(body) });
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
  const [capturing, setCapturing] = useState(false);
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
  async function stage(file: File, captureId: string, record: CaptureRecord) {
    if (!detail || record.location?.start.status !== 'recorded')
      throw new Error('Localisation obligatoire.');
    if (record.kind === 'video' && record.location.end?.status !== 'recorded')
      throw new Error('Localisation de fin obligatoire. Recommencez la vidéo.');
    if (file.size > (record.kind === 'video' ? 50 : 10) * 1024 * 1024)
      throw new Error('Maximum 10 Mo par photo ou 50 Mo par vidéo. Recommencez la capture.');
    const evidence: MobileEvidence = {
      origin: 'in_app_camera',
      selectedAt: record.startedAt,
      transformation: record.kind === 'video' ? 'camera_video_encoding' : 'camera_jpeg_processing',
      location: record.location.start,
    };
    await saveDraft({
      ...newDraft('file'),
      title: file.name,
      caseId: detail.manifest.id,
      file,
      fileName: file.name,
      evidence,
      captureId,
    });
    await reloadDrafts();
    setCapturing(false);
    setTab('drafts');
    setDetail(null);
    setNotice(
      'Capture en direct enregistrée. Envoyez-la dans les 24 heures, avec la même connexion.',
    );
  }
  useEffect(() => {
    const expire = () => {
      setAuthenticated(false);
      setCapturing(false);
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
    const listener = NativeApp.addListener('backButton', () => {
      if (active.current) {
        setNotice('Une action est en cours ; attendez son résultat.');
        return;
      }
      if (capturing) setCapturing(false);
      else if (creating) setCreating(false);
      else if (detail) setDetail(null);
      else if (tab === 'drafts') setTab('cases');
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [creating, detail, tab, capturing]);
  const back = () => {
    setCapturing(false);
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
            Aucun réseau détecté. Une connexion USB au serveur peut rester disponible : vous
            pouvez essayer l’envoi. Les brouillons sont conservés en cas d’échec.
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
                          {draft.evidence.origin !== 'system_file_picker'
                            ? draft.evidence.transformation === 'camera_video_encoding'
                              ? 'Vidéo en direct · encodage MP4 / WebM'
                              : 'Photo de la caméra · encodage JPEG'
                            : 'Fichier importé · aucune transformation par Preuvix'}
                        </p>
                        <p>{locationDescription(draft.evidence.location)}</p>
                      </>
                    )}
                    {draft.kind === 'file' && !draft.proof && !draft.completed && (
                      <p className="mobile-small">
                        {draft.captureId && draft.evidence?.origin === 'in_app_camera'
                          ? 'Envoyez cette capture dans les 24 heures et avant de vous déconnecter. Une nouvelle connexion exige une nouvelle capture si le serveur n’a pas encore reçu le fichier.'
                          : 'Ancien brouillon non admissible : recommencez une capture en direct avec localisation. Aucun nouvel import n’est autorisé.'}
                      </p>
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
                        disabled={
                          !!busy ||
                          (draft.kind === 'file' &&
                            !draft.proof &&
                            (!draft.captureId ||
                              draft.evidence?.origin !== 'in_app_camera' ||
                              draft.evidence.location.status !== 'recorded'))
                        }
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
                  <h2>Ajouter une capture en direct</h2>
                  <p>
                    Photo ou vidéo de 60 secondes maximum. Caméra et localisation obligatoires, au
                    début et à la fin de la vidéo. Aucun import. Une connexion au serveur est
                    nécessaire pour engager la capture.
                  </p>
                  {capturing ? (
                    <CapturePanel
                      request={captureRequest}
                      readPosition={readLocation}
                      close={() => setCapturing(false)}
                      onCapture={(file, captureId, record) =>
                        void run('Enregistrement de la capture', () =>
                          stage(file, captureId, record),
                        )
                      }
                    />
                  ) : (
                    <button
                      disabled={!!busy}
                      className="button primary"
                      onClick={() => setCapturing(true)}
                    >
                      <Camera size={20} /> Prendre une photo ou une vidéo
                    </button>
                  )}
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
                          ? file.mobileEvidence.origin !== 'system_file_picker'
                            ? 'Caméra Android — capture documentée'
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
                            : file.mobileEvidence.transformation === 'camera_video_encoding'
                              ? 'Vidéo encodée par la caméra intégrée ; octets reçus conservés.'
                              : 'Aucune transformation par Preuvix.'}
                        </p>
                      )}
                      {file.capture?.kind === 'video' && (
                        <p>
                          Position en fin de vidéo :{' '}
                          {locationDescription(file.capture.location?.end)}
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
                  <ServiceEvidence dossier={detail} />
                  <MobileCertificationActions
                    key={detail.manifest.id + ':' + detail.manifest.version}
                    dossier={detail}
                    disabled={!!busy}
                    run={run}
                    onChange={setDetail}
                  />
                  <p className="mobile-small">
                    La signature technique protège le manifeste. Elle ne certifie pas la réalité de
                    la scène. La signature électronique auprès d’un prestataire se demande sur le
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
