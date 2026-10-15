import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Upload, Camera, Fingerprint, LockKeyhole, Plus } from 'lucide-react';
import type { AppConfig, Proof } from '../shared/types';
import { HEIF_MESSAGE, MAX_PHOTO_BYTES, photoFormat } from '../shared/photo-format';
import {
  readDraft,
  saveDraft,
  deleteDraft,
  DraftConflict,
  type WebDraft,
  type DraftCase,
} from './web-draft';
import { api, ApiError } from './api';
import { sha256File } from './file-hash';
import CapturePanel from './CapturePanel';
import { Modal, Notice, Spinner, date, size } from './workspace-ui';
import './proof-workspace.css';
export default function CreateProof({
  config,
  initialDraft,
  initialCase,
  close,
  onCreated,
}: {
  config: AppConfig;
  initialDraft?: WebDraft;
  initialCase?: DraftCase;
  close: () => void;
  onCreated: (proof: Proof, target?: DraftCase) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [hashing, setHashing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'upload' | 'camera'>('upload');
  const [camera, setCamera] = useState(false);
  const [captureId, setCaptureId] = useState('');
  const [captureNonce, setCaptureNonce] = useState<string | undefined>();
  const [caseTarget, setCaseTarget] = useState<DraftCase | undefined>(initialCase);
  const draftId = useRef(initialDraft?.id ?? crypto.randomUUID());
  const revision = useRef(0);
  const conflict = useRef(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [author, setAuthor] = useState('');
  const [context, setContext] = useState('');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef<string>(crypto.randomUUID());
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('Recherche d’un brouillon local…');
  const [savedProof, setSavedProof] = useState<Proof | null>(null);
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const submitted = useRef(false);
  useEffect(() => {
    let active = true;
    (initialDraft ? readDraft(initialDraft.id) : Promise.resolve(undefined))
      .then((draft) => {
        if (!active) return;
        if (draft) {
          revision.current = draft.revision;
          setCaptureNonce(draft.captureNonce);
          setCaseTarget(draft.caseTarget);
          setFile(draft.file);
          setSource('camera');
          setCaptureId(draft.captureId);
          setTitle(draft.title);
          setDescription(draft.description);
          setAuthor(draft.author);
          setContext(draft.context);
          setDeclared(draft.declared);
          key.current = draft.requestKey;
          setDraftStatus(
            'Brouillon retrouvé sur cet appareil. Vérifiez l’aperçu puis réessayez le dépôt.',
          );
        } else if (initialDraft) {
          conflict.current = true;
          setDraftConflict(true);
          setDraftStatus('Ce brouillon a été supprimé dans un autre onglet. Fermez cette fenêtre.');
        } else setDraftStatus('Nouvelle capture : un brouillon distinct sera créé.');
      })
      .catch(() => {
        if (active)
          setDraftStatus(
            'Stockage local indisponible : gardez cette fenêtre ouverte jusqu’au dépôt.',
          );
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draftReady || !file || submitted.current || conflict.current) return;
    let active = true;
    setDraftStatus('Enregistrement du brouillon sur cet appareil…');
    const draft = {
      id: draftId.current,
      captureNonce,
      caseTarget,
      file,
      captureId,
      title,
      description,
      author,
      context,
      declared,
      requestKey: key.current,
      savedAt: new Date().toISOString(),
    };
    draftQueue.current = draftQueue.current
      .catch(() => {})
      .then(async () => {
        if (conflict.current) throw new DraftConflict();
        revision.current = await saveDraft(draft, revision.current);
      });
    void draftQueue.current.then(
      () => {
        if (active)
          setDraftStatus(
            'Brouillon enregistré sur cet appareil uniquement. Le fichier n’est pas encore confirmé sur le serveur.',
          );
      },
      (error) => {
        if (error instanceof DraftConflict) {
          conflict.current = true;
          if (active) {
            setDraftConflict(true);
            setDraftStatus(error.message);
          }
          return;
        }
        if (active)
          setDraftStatus(
            'Échec de sauvegarde locale. Gardez cette fenêtre ouverte et réessayez le dépôt.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [
    draftReady,
    file,
    captureId,
    captureNonce,
    caseTarget,
    title,
    description,
    author,
    context,
    declared,
  ]);
  useEffect(() => {
    if (!file || savedProof) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [file, savedProof]);
  useEffect(() => {
    let cancelled = false;
    setFileHash('');
    if (!file) {
      setHashing(false);
      return;
    }
    setHashing(true);
    (async () => {
      const format = photoFormat(new Uint8Array(await file.slice(0, 256).arrayBuffer()));
      if (format === 'heif') throw new Error(HEIF_MESSAGE);
      const isVideo =
        new Uint8Array(await file.slice(0, 4).arrayBuffer()).join(',') === '26,69,223,163' ||
        new TextDecoder().decode(await file.slice(4, 8).arrayBuffer()) === 'ftyp';
      if (!format && !isVideo)
        throw new Error('Format non pris en charge. Choisissez une photo JPEG, PNG ou WebP.');
      return sha256File(file);
    })()
      .then((value) => {
        if (!cancelled) setFileHash(value);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setHashing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  useEffect(() => {
    if (!file || !fileHash) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, fileHash]);
  const choose = (selected: File | undefined, from: 'upload' | 'camera', sessionId = '') => {
    if (!selected) return;
    if (from !== 'camera' || !sessionId) {
      setError('Capture en direct avec localisation obligatoire. Les imports sont désactivés.');
      return;
    }
    setFileHash('');
    setFile(null);
    if (selected.size > (selected.type.startsWith('video/') ? 50 * 1024 * 1024 : MAX_PHOTO_BYTES)) {
      setError('La photo dépasse la limite de 10 Mo.');
      return;
    }
    key.current = crypto.randomUUID();
    setError('');
    setFile(selected);
    setSource(from);
    setCaptureId(sessionId);
    setCamera(false);
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, '').slice(0, 120));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !fileHash || hashing) return;
    setBusy(true);
    setError('');
    const body = new FormData();
    body.append('file', file);
    body.append('title', title);
    body.append('description', description);
    body.append('source', source);
    body.append('requestKey', key.current);
    body.append('clientSha256', fileHash);
    if (captureId) body.append('captureId', captureId);
    if (declared)
      body.append(
        'declaration',
        JSON.stringify({
          author,
          context,
          statement:
            'Je décris les faits de bonne foi, signale les modifications connues et conserve les éléments utiles au débat contradictoire.',
        }),
      );
    try {
      await draftQueue.current.catch((e) => {
        if (e instanceof DraftConflict) throw e;
      });
      if (conflict.current) throw new DraftConflict();
      const current = await readDraft(draftId.current).catch(() => undefined);
      if (revision.current && (!current || current.revision !== revision.current))
        throw new DraftConflict();
      const resumed = await api<{ proofId: string | null }>(`/api/captures/${captureId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ sha256: fileHash, nonce: captureNonce }),
      });
      const proof = resumed.proofId
        ? await api<Proof>(`/api/proofs/${resumed.proofId}`)
        : await api<Proof>('/api/proofs', {
            method: 'POST',
            body,
            signal: AbortSignal.timeout(90000),
          });
      submitted.current = true;
      await draftQueue.current.catch(() => {});
      setDraftStatus(
        'Le fichier est conservé. Ouvrez la preuve pour finaliser son rattachement au dossier et supprimer le brouillon local.',
      );
      setSavedProof(proof);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
      if (e instanceof DraftConflict) {
        conflict.current = true;
        setDraftConflict(true);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function complete(proof: Proof) {
    await onCreated(proof, caseTarget);
    // Keep the association recoverable if the tab closes between upload and completion.
    // A concurrent edit is never deleted: its revision must still match.
    await deleteDraft(draftId.current, revision.current).catch(() => {});
  }
  return (
    <Modal
      title="Créer une preuve"
      close={() => {
        if (!busy) {
          if (savedProof) {
            setBusy(true);
            void complete(savedProof)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          } else close();
        }
      }}
    >
      <p className="modal-subtitle">
        Capturez en direct une photo ou une vidéo avec sa localisation, documentez les faits et
        obtenez votre attestation technique PDF.
      </p>
      {caseTarget && (
        <p className="capture-storage">
          Dossier associé : <strong>{caseTarget.title}</strong> · version{' '}
          {caseTarget.expectedVersion}
        </p>
      )}
      {!savedProof && (
        <button
          className="text-link"
          type="button"
          disabled={busy}
          onClick={() => setNeedsLogin((v) => !v)}
        >
          Me reconnecter sans perdre mes brouillons
        </button>
      )}
      {needsLogin && (
        <form
          className="capture-storage"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
              setPassword('');
              setNeedsLogin(false);
              setDraftStatus('Reconnexion réussie. Vous pouvez réessayer le dépôt.');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Mot de passe pour reprendre
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="button primary" disabled={busy}>
            Reconnecter et garder le brouillon
          </button>
        </form>
      )}
      {savedProof ? (
        <section className="capture-storage" role="status">
          <h2>Preuve enregistrée sur le serveur</h2>
          <p>
            {savedProof.manifest.title} · reçue le {date(savedProof.manifest.receivedAt)}.
          </p>
          <p>{draftStatus}</p>
          <p>
            {savedProof.receipt
              ? 'Horodatage externe obtenu.'
              : 'Horodatage externe non obtenu ; le fichier est bien conservé.'}
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await complete(savedProof);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Ouvrir la preuve enregistrée
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
      ) : (
        <>
          <ol className="capture-steps" aria-label="Étapes de création">
            <li aria-current={!file ? 'step' : undefined}>Localisation et caméra</li>
            <li aria-current={file && !busy ? 'step' : undefined}>Aperçu et description</li>
            <li aria-current={busy ? 'step' : undefined}>Enregistrement serveur</li>
          </ol>
          <section className="capture-storage" aria-label="État de sauvegarde">
            <p>{draftStatus}</p>
            <p>
              Un brouillon reste dans ce navigateur, accessible aux utilisateurs de ce profil.
              Déposez-le dans les 24 heures. Une reconnexion permet de reprendre une capture récente
              sans modifier son engagement initial. Effacer les données du navigateur supprime les
              brouillons.
            </p>
            {file && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  const url = URL.createObjectURL(file);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = file.name;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Télécharger ma capture locale
              </button>
            )}
            {file && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await draftQueue.current.catch(() => {});
                    await deleteDraft(draftId.current, revision.current);
                    setFile(null);
                    setCaptureId('');
                    setDraftStatus('Brouillon local supprimé.');
                    close();
                  } catch {
                    setError('Impossible de supprimer le brouillon.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Supprimer le brouillon local
              </button>
            )}
          </section>
          {camera ? (
            <CapturePanel
              close={() => setCamera(false)}
              onCapture={(f, id, record) => {
                setCaptureNonce(record.nonce);
                choose(f, 'camera', id);
              }}
            />
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={busy || !draftReady || draftConflict || needsLogin}>
                <div
                  className="upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!busy)
                      setError(
                        'Les imports sont désactivés. Utilisez la caméra avec la localisation.',
                      );
                  }}
                >
                  {preview ? (
                    <>
                      {file?.type.startsWith('video/') ? (
                        <video className="upload-preview" src={preview} controls playsInline />
                      ) : (
                        <img
                          className="upload-preview"
                          src={preview}
                          alt="Aperçu du fichier sélectionné"
                        />
                      )}
                      <span>
                        {file?.name} · {size(file?.size || 0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="round-icon">
                        <Upload size={25} />
                      </div>
                      <h3>Capturez votre photo ou vidéo en direct</h3>
                      <p>Caméra et localisation obligatoires. Vidéo : 60 secondes maximum.</p>
                    </>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setCamera(true)}
                    >
                      <Camera size={16} /> Caméra
                    </button>
                  </div>
                </div>
                <p className="phone-format-help">
                  Autorisez la caméra et la localisation dans votre navigateur pour créer une
                  preuve.
                </p>
                {hashing && (
                  <div className="hash-progress" role="status">
                    <Spinner /> Calcul de l’empreinte sur votre appareil…
                  </div>
                )}
                {fileHash && (
                  <div className="hash-box" aria-label="Empreinte avant dépôt">
                    <span>
                      <Fingerprint size={16} /> SHA-256 CALCULÉ AVANT L’ENVOI
                    </span>
                    <code>{fileHash}</code>
                    <p>
                      Le serveur recalculera cette empreinte. Le dépôt sera refusé si les résultats
                      diffèrent. Le fichier n’a pas encore été envoyé.
                    </p>
                  </div>
                )}
                <label htmlFor="proof-title">
                  Titre du dossier <span>*</span>
                </label>
                <input
                  id="proof-title"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    key.current = crypto.randomUUID();
                    setTitle(e.target.value);
                  }}
                  placeholder="Ex. État du mur avant travaux"
                />
                <label htmlFor="proof-description">
                  Contexte <small>facultatif</small>
                </label>
                <textarea
                  id="proof-description"
                  rows={3}
                  maxLength={1500}
                  value={description}
                  onChange={(e) => {
                    key.current = crypto.randomUUID();
                    setDescription(e.target.value);
                  }}
                  placeholder="Décrivez ce que vous souhaitez documenter…"
                />
                <div className="privacy-hint">
                  <LockKeyhole size={15} />
                  <span>
                    Privé par défaut. La localisation obligatoire est conservée avec la capture et
                    incluse dans ses exports. L’original peut aussi contenir ses propres
                    métadonnées.
                  </span>
                </div>
                <details className="capture-declaration">
                  <summary>Déclarations complémentaires (facultatives)</summary>
                  {captureId && (
                    <p>
                      Empreinte engagée auprès du serveur. Déposez ce média dans les 24 heures.
                      L’identité de l’auteur et la réalité de la scène ne sont pas vérifiées.
                    </p>
                  )}
                  <label htmlFor="declared-author">Auteur déclaré (facultatif)</label>
                  <input
                    id="declared-author"
                    maxLength={120}
                    value={author}
                    onChange={(e) => {
                      setAuthor(e.target.value);
                      key.current = crypto.randomUUID();
                    }}
                  />
                  <label htmlFor="declared-context">
                    Lieu, circonstances et modifications connues (facultatif)
                  </label>
                  <textarea
                    id="declared-context"
                    maxLength={1200}
                    rows={3}
                    value={context}
                    onChange={(e) => {
                      setContext(e.target.value);
                      key.current = crypto.randomUUID();
                    }}
                    placeholder="Distinguez ce que vous avez observé de vos interprétations. Signalez tout montage, filtre ou usage d’IA connu."
                  />
                  <label className="capture-check">
                    <input
                      type="checkbox"
                      checked={declared}
                      onChange={(e) => {
                        setDeclared(e.target.checked);
                        key.current = crypto.randomUUID();
                      }}
                    />{' '}
                    Je décris les faits de bonne foi, signale les modifications connues et conserve
                    les éléments utiles au débat contradictoire.
                  </label>
                  <p>
                    Ces déclarations sont ajoutées au manifeste signé uniquement si vous cochez la
                    case et complétez les deux champs. Aucun score « sans IA » ni garantie de
                    recevabilité n’est délivré.
                  </p>
                </details>
                {!config.timestampConfigured && (
                  <Notice>
                    Le fichier sera conservé <strong>en attente d’horodatage</strong>. Le
                    prestataire indépendant n’est pas encore configuré.
                  </Notice>
                )}
                {error && <Notice danger>{error}</Notice>}
                <div className="modal-actions">
                  <button type="button" className="button secondary" onClick={close}>
                    Annuler
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !file ||
                      !fileHash ||
                      hashing ||
                      !title.trim() ||
                      busy ||
                      (declared && (author.trim().length < 2 || context.trim().length < 5))
                    }
                  >
                    {busy ? (
                      <>
                        <Spinner /> Dépôt et vérification…
                      </>
                    ) : (
                      <>
                        <Plus size={17} /> {error ? 'Réessayer le dépôt' : 'Conserver ma preuve'}
                      </>
                    )}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
