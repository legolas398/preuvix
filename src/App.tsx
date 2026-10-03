import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  FileCheck2,
  Fingerprint,
  FolderLock,
  ImagePlus,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  Camera,
  Clock3,
  ExternalLink,
  Github,
  Info,
} from 'lucide-react';
import type { AppConfig, Proof, PublicProof } from '../shared/types';
import { certificationLabels } from '../shared/certification-policy';
import ChallengeReview from './ChallengeReview';
import { shortId } from '../shared/format';
import { api } from './api';
import ProtectionPanel from './ProtectionPanel';
import RecipientLinks from './RecipientLinks';
import RecipientPage from './RecipientPage';
import { HEIF_MESSAGE, MAX_PHOTO_BYTES, photoFormat } from '../shared/photo-format';
import { sha256File } from './file-hash';
import LocalFileCheck from './LocalFileCheck';
import Welcome, { JusticeLoading } from './Welcome';
import PartnerDirectory from './PartnerDirectory';
import BillingPanel from './BillingPanel';
import CapturePanel from './CapturePanel';

const date = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));
const size = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Fingerprint size={25} strokeWidth={1.7} />
      </span>
      <span>
        preuvix<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Spinner() {
  return <LoaderCircle size={18} className="spin" aria-label="Chargement" />;
}
function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`notice ${danger ? 'danger' : ''}`} role={danger ? 'alert' : 'status'}>
      <Info size={18} />
      <div>{children}</div>
    </div>
  );
}
function Status({ proof }: { proof: Pick<Proof, 'status'> }) {
  return (
    <span className={`status ${proof.status === 'timestamped' ? 'complete' : 'pending'}`}>
      {proof.status === 'timestamped' ? <ShieldCheck size={13} /> : <Clock3 size={13} />}
      {proof.status === 'timestamped' ? 'Horodatage vérifié' : 'Horodatage en attente'}
    </span>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? 'wide' : ''}`}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Fermer">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState('');
  const token = window.location.pathname.match(/^\/verification\/([a-f0-9]{48})$/)?.[1];
  useEffect(() => {
    api<AppConfig>('/api/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const recipientToken = window.location.pathname.match(/^\/dossier\/([a-f0-9]{64})$/)?.[1];
  if (token) return <PublicVerification token={token} />;
  if (recipientToken) return <RecipientPage token={recipientToken} />;
  if (error)
    return (
      <div className="loading-page">
        <Brand />
        <Notice danger>{error}</Notice>
        <button className="button" onClick={() => location.reload()}>
          Réessayer
        </button>
      </div>
    );
  if (!config) return <JusticeLoading />;
  if (!config.authenticated)
    return <Login onLogin={() => api<AppConfig>('/api/config').then(setConfig)} />;
  return (
    <Workspace
      config={config}
      onLogout={async () => {
        await api('/api/logout', { method: 'POST' });
        setConfig({ ...config, authenticated: false });
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Welcome>
      <form className="login-card" onSubmit={submit}>
        <div className="round-icon">
          <KeyRound size={24} />
        </div>
        <h2>Votre espace de preuves</h2>
        <p>Connectez-vous à votre installation PREUVIX.</p>
        <label htmlFor="password">Mot de passe de l’espace</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Votre mot de passe"
        />
        {error && <Notice danger>{error}</Notice>}
        <button className="button primary" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : (
            <>
              Ouvrir mon espace <ArrowRight size={17} />
            </>
          )}
        </button>
        <span className="form-footnote">
          <LockKeyhole size={13} /> Accès réservé au propriétaire de cette installation.
        </span>
      </form>
    </Welcome>
  );
}

function Workspace({ config, onLogout }: { config: AppConfig; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<'proofs' | 'verify' | 'about' | 'billing'>(() => {
    try {
      if (
        window.location.hash === '#billing' ||
        sessionStorage.getItem('preuvix-open-billing') === '1'
      )
        return 'billing';
    } catch {
      /* Use normal navigation when storage is unavailable. */
    }
    return 'proofs';
  });
  const [storageLimit, setStorageLimit] = useState(config.maxStorageMb);
  useEffect(() => {
    try {
      sessionStorage.removeItem('preuvix-open-billing');
    } catch {
      /* Optional navigation preference. */
    }
  }, []);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Proof | null>(null);
  const refresh = async () => {
    const data = await api<{ proofs: Proof[]; usedBytes: number }>('/api/proofs');
    setProofs(data.proofs);
    setUsed(data.usedBytes);
  };
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = proofs.filter(
    (p) =>
      `${p.manifest.title} ${shortId(p.id)}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || p.status === filter),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-avatar">P</span>
          <div>
            Mon espace privé<small>Installation personnelle</small>
          </div>
          <LockKeyhole size={14} />
        </div>
        <span className="nav-label">ESPACE DE TRAVAIL</span>
        <nav>
          <button className={tab === 'proofs' ? 'active' : ''} onClick={() => setTab('proofs')}>
            <FolderLock size={19} /> Mes preuves <span className="nav-count">{proofs.length}</span>
          </button>
          <button className={tab === 'verify' ? 'active' : ''} onClick={() => setTab('verify')}>
            <ScanLine size={19} /> Vérifier un fichier
          </button>
          <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
            <CircleHelp size={19} /> Comprendre PREUVIX
          </button>
          <button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}>
            <Sparkles size={19} /> Mon abonnement
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-card">
            <div>
              <span>Stockage privé</span>
              <span>
                {size(used)} / {storageLimit} Mo
              </span>
            </div>
            <progress value={used} max={storageLimit * 1024 * 1024} />
            <small>Vous gardez le contrôle de vos fichiers.</small>
          </div>
          <div className="opensource-note">
            <Github size={17} />
            <span>
              Ouvert par conviction.<small>Application libre · Licence MIT</small>
            </span>
          </div>
          <button className="logout" onClick={() => onLogout().catch((e) => setError(e.message))}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Mon espace <ChevronRight size={14} />
            <strong>
              {tab === 'proofs'
                ? 'Mes preuves'
                : tab === 'verify'
                  ? 'Vérification'
                  : tab === 'billing'
                    ? 'Abonnement'
                    : 'Fonctionnement'}
            </strong>
          </div>
          <div className="private-tag">
            <span /> Espace privé <span className="avatar">P</span>
            <button
              className="icon-button mobile-logout"
              aria-label="Se déconnecter"
              onClick={() => onLogout().catch((e) => setError(e.message))}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {error && <Notice danger>{error}</Notice>}
          {tab === 'proofs' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">VOTRE MÉMOIRE NUMÉRIQUE</span>
                  <h1>
                    Mes preuves<span className="heading-dot">.</span>
                  </h1>
                  <p>Conservez l’original. Documentez son intégrité. Gardez la main.</p>
                </div>
                <button className="button primary" onClick={() => setCreating(true)}>
                  <Plus size={18} /> Créer une preuve
                </button>
              </div>
              <section className="intro-card">
                <div>
                  <span className="intro-kicker">
                    <span /> SIMPLE À CRÉER, POSSIBLE À VÉRIFIER
                  </span>
                  <h2>
                    Une photo aujourd’hui.
                    <br />
                    Une trace pour demain.
                  </h2>
                  <p>
                    Déposez une photo et retrouvez son original,
                    <br className="desktop-break" /> son empreinte et son rapport au même endroit.
                  </p>
                  <button className="text-link" onClick={() => setTab('about')}>
                    Comment vos fichiers sont protégés <ArrowRight size={16} />
                  </button>
                </div>
                <div className="proof-illustration" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="illustration-card">
                    <div className="illustration-top">
                      <Fingerprint size={20} />
                      <span>PREUVIX</span>
                      <span className="illustration-dot" />
                    </div>
                    <div className="illustration-image">
                      <div className="illustration-sun" />
                      <div className="illustration-hill hill-one" />
                      <div className="illustration-hill hill-two" />
                    </div>
                    <div className="illustration-line" />
                    <div className="illustration-line short" />
                    <div className="illustration-bottom">
                      <LockKeyhole size={12} /> ORIGINAL CONSERVÉ
                    </div>
                  </div>
                  <div className="floating-seal">
                    <ShieldCheck size={28} />
                  </div>
                  <span className="illustration-spark spark-one">+</span>
                  <span className="illustration-spark spark-two">+</span>
                </div>
              </section>
              <section className="stats-grid">
                <div className="stat">
                  <span className="stat-icon">
                    <FolderLock size={20} />
                  </span>
                  <div>
                    <span>Preuves conservées</span>
                    <strong>{proofs.length.toString().padStart(2, '0')}</strong>
                  </div>
                  <small>Originaux privés</small>
                </div>
                <div className="stat">
                  <span className="stat-icon sage">
                    <ShieldCheck size={20} />
                  </span>
                  <div>
                    <span>Horodatages vérifiés</span>
                    <strong>
                      {proofs
                        .filter((p) => p.status === 'timestamped')
                        .length.toString()
                        .padStart(2, '0')}
                    </strong>
                  </div>
                  <small>Jetons RFC 3161</small>
                </div>
                <div className="stat">
                  <span className="stat-icon sand">
                    <Link2 size={20} />
                  </span>
                  <div>
                    <span>Liens de vérification</span>
                    <strong>
                      {proofs
                        .filter((p) => p.shareToken)
                        .length.toString()
                        .padStart(2, '0')}
                    </strong>
                  </div>
                  <small>Partage à votre initiative</small>
                </div>
              </section>
              {!config.timestampConfigured && (
                <div className="provider-note">
                  <Clock3 size={17} />
                  <span>
                    <strong>Horodatage indépendant non configuré.</strong> Vos dépôts sont conservés
                    en attente. Aucun horodatage qualifié n’est revendiqué.
                  </span>
                  <button onClick={() => setTab('about')}>
                    En savoir plus <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <section className="records">
                <div className="records-heading">
                  <h2>
                    Tous les dossiers <span>{proofs.length}</span>
                  </h2>
                  <div className="search">
                    <Search size={16} />
                    <input
                      aria-label="Rechercher un dossier"
                      placeholder="Rechercher un dossier…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-tabs">
                  {[
                    ['all', 'Tous'],
                    ['timestamped', 'Horodatés'],
                    ['pending', 'En attente'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFilter(value)}
                      className={filter === value ? 'selected' : ''}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {loading ? (
                  <div className="empty-state">
                    <Spinner />
                    <p>Chargement de vos dossiers…</p>
                  </div>
                ) : visible.length ? (
                  <div className="proof-table">
                    <div className="table-head">
                      <span>DOSSIER</span>
                      <span>DATE DE DÉPÔT</span>
                      <span>STATUT</span>
                      <span />
                    </div>
                    {visible.map((proof) => (
                      <button
                        className="proof-row"
                        key={proof.id}
                        onClick={() => setSelected(proof)}
                      >
                        <div className="file-cell">
                          {proof.manifest.file.mime.startsWith('video/') ? (
                            <span aria-label="Vidéo">▶</span>
                          ) : (
                            <img src={`/api/proofs/${proof.id}/original`} alt="" loading="lazy" />
                          )}
                          <div>
                            <strong>{proof.manifest.title}</strong>
                            <small>
                              {shortId(proof.id)} <span>·</span> {size(proof.manifest.file.size)}
                            </small>
                          </div>
                        </div>
                        <span className="date-cell">{date(proof.manifest.receivedAt)}</span>
                        <Status proof={proof} />
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <ImagePlus size={27} />
                      <span>
                        <Plus size={11} />
                      </span>
                    </div>
                    <h3>
                      {proofs.length
                        ? 'Aucun dossier trouvé'
                        : 'Votre première preuve commence ici'}
                    </h3>
                    <p>
                      {proofs.length
                        ? 'Essayez un autre titre ou un autre filtre.'
                        : 'Une photo, un titre, et un original conservé dans votre espace privé.'}
                    </p>
                    {!proofs.length && (
                      <button className="button secondary" onClick={() => setCreating(true)}>
                        <Plus size={16} /> Déposer ma première photo
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div className="bottom-assurance">
                <span>
                  <LockKeyhole size={14} /> Privé par défaut
                </span>
                <span>
                  <Fingerprint size={14} /> Intégrité vérifiable
                </span>
                <span>
                  <ArrowDownToLine size={14} /> Export à tout moment
                </span>
              </div>
            </>
          ) : tab === 'billing' ? (
            <section className="billing-workspace">
              <BillingPanel privateWorkspace onQuotaChange={setStorageLimit} />
            </section>
          ) : tab === 'verify' ? (
            <VerificationEntry />
          ) : (
            <About config={config} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            © {new Date().getFullYear()} PREUVIX <span>·</span> Le contrôle vous appartient.
          </span>
          <span>France · Version pilote</span>
        </footer>
      </div>
      {creating && (
        <CreateProof
          config={config}
          close={() => setCreating(false)}
          onCreated={async (proof) => {
            setCreating(false);
            setSelected(proof);
            await refresh();
          }}
        />
      )}
      {selected && (
        <ProofDetail
          proof={selected}
          config={config}
          close={() => setSelected(null)}
          onChange={async (proof) => {
            setSelected(proof);
            await refresh();
          }}
          onDelete={async () => {
            setSelected(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateProof({
  config,
  close,
  onCreated,
}: {
  config: AppConfig;
  close: () => void;
  onCreated: (proof: Proof) => Promise<void>;
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
  const [author, setAuthor] = useState('');
  const [context, setContext] = useState('');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
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
      await onCreated(await api<Proof>('/api/proofs', { method: 'POST', body }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Créer une preuve"
      close={() => {
        if (!busy) close();
      }}
    >
      <p className="modal-subtitle">
        Capturez ou importez une photo ou une vidéo, documentez les faits et obtenez votre
        attestation technique PDF.
      </p>
      {camera ? (
        <CapturePanel
          close={() => setCamera(false)}
          onCapture={(f, id) => choose(f, 'camera', id)}
        />
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div
              className="upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) choose(e.dataTransfer.files[0], 'upload');
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
                  <h3>Déposez votre photo ou vidéo ici</h3>
                  <p>
                    Photo : JPEG, PNG, WebP · 10 Mo. Vidéo : MP4, WebM · 50 Mo, 120 secondes
                    maximum.
                  </p>
                </>
              )}
              <div className="button-row">
                <label className="button secondary file-button">
                  <ImagePlus size={16} /> {file ? 'Changer la photo' : 'Choisir un fichier'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={(e) => choose(e.target.files?.[0], 'upload')}
                    aria-label="Choisir une photo"
                  />
                </label>
                <button type="button" className="button secondary" onClick={() => setCamera(true)}>
                  <Camera size={16} /> Caméra
                </button>
              </div>
            </div>
            <p className="phone-format-help">
              Sur iPhone, choisissez une copie JPEG si la photo est au format HEIC. Aucun fichier
              n’est converti automatiquement.
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
                Privé par défaut. Aucune géolocalisation demandée. L’original peut toutefois
                contenir ses propres métadonnées.
              </span>
            </div>
            <div className="capture-declaration">
              <h3>Documenter les faits</h3>
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
                Je décris les faits de bonne foi, signale les modifications connues et conserve les
                éléments utiles au débat contradictoire.
              </label>
              <p>
                Ces déclarations sont ajoutées au manifeste signé uniquement si vous cochez la case
                et complétez les deux champs. Aucun score « sans IA » ni garantie de recevabilité
                n’est délivré.
              </p>
            </div>
            {!config.timestampConfigured && (
              <Notice>
                Le fichier sera conservé <strong>en attente d’horodatage</strong>. Le prestataire
                indépendant n’est pas encore configuré.
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
                    <Plus size={17} /> Conserver ma preuve
                  </>
                )}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

function ProofDetail({
  proof,
  config,
  close,
  onChange,
  onDelete,
}: {
  proof: Proof;
  config: AppConfig;
  close: () => void;
  onChange: (proof: Proof) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [copied, setCopied] = useState(false);
  const act = async (action: () => Promise<void>) => {
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
  return (
    <Modal title={proof.manifest.title} close={close} wide>
      <div className="detail-meta">
        <span>{shortId(proof.id)}</span>
        <Status proof={proof} />
      </div>
      <div className="detail-layout">
        <div className="detail-image">
          {proof.manifest.file.mime.startsWith('video/') ? (
            <video
              src={`/api/proofs/${proof.id}/original`}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={`/api/proofs/${proof.id}/original`} alt={proof.manifest.title} />
          )}
          <span>
            <LockKeyhole size={12} /> ORIGINAL PRIVÉ
          </span>
        </div>
        <div className="detail-facts">
          <div>
            <span>Réception par le serveur</span>
            <strong>{date(proof.manifest.receivedAt)}</strong>
            <small>Date serveur, non qualifiée · heure de Paris</small>
          </div>
          <div>
            <span>Source déclarée</span>
            <strong>
              {proof.manifest.source === 'camera' ? 'Caméra du navigateur' : 'Fichier importé'}
            </strong>
            <small>Origine non authentifiée</small>
          </div>
          <div>
            <span>Format de l’original</span>
            <strong>
              {proof.manifest.file.mime.split('/')[1].toUpperCase()} ·{' '}
              {size(proof.manifest.file.size)}
            </strong>
            <small>
              {proof.manifest.file.width} × {proof.manifest.file.height} pixels
            </small>
          </div>
        </div>
      </div>
      {proof.manifest.description && (
        <p className="detail-description">{proof.manifest.description}</p>
      )}
      <div className="hash-box">
        <span>
          <Fingerprint size={16} /> EMPREINTE SHA-256 DE L’ORIGINAL
        </span>
        <code>{proof.manifest.file.sha256}</code>
      </div>
      <details className="private-verification">
        <summary>Comparer une copie avec ce dossier</summary>
        <LocalFileCheck expectedHash={proof.manifest.file.sha256} />
      </details>
      <section className="capture-evidence" aria-label="Attestation technique">
        {proof.manifest.certification && (
          <section aria-label="Processus de certification">
            <h3>Certification photo / vidéo · protection contre les falsifications</h3>
            <p
              className={`provenance-label ${proof.manifest.certification.status === 'review_required' ? 'signal' : ''}`}
            >
              {certificationLabels[proof.manifest.certification.status]}
            </p>
            <ol>
              {proof.manifest.certification.checks.map((check) => (
                <li key={check.id}>
                  <strong>
                    {check.result === 'passed'
                      ? 'Contrôlé'
                      : check.result === 'review'
                        ? 'À examiner'
                        : 'Non établi'}
                  </strong>{' '}
                  — {check.detail}
                </li>
              ))}
            </ol>
            <p>
              {proof.manifest.certification.aiAuthenticity === 'camera_provenance_verified'
                ? 'Cette évaluation est incluse dans le manifeste signé. La signature de l’appareil atteste une capture matérielle ; une mise en scène ou un écran photographié restent possibles.'
                : 'Cette évaluation est incluse dans le manifeste signé. Aucun certificat « sans IA » n’est délivré. En présence d’indices, faites examiner l’original et son contexte avant de vous fier à la scène.'}
            </p>
          </section>
        )}
        <ChallengeReview
          proof={proof}
          busy={busy}
          submit={(input) =>
            act(async () =>
              onChange(
                await api(`/api/proofs/${proof.id}/review`, {
                  method: 'POST',
                  body: JSON.stringify(input),
                }),
              ),
            )
          }
        />
        <h3>Attestation technique et protection du dossier</h3>
        <p>
          {proof.attestation
            ? 'Manifeste signé par cette installation (Ed25519). Le PDF explique les contrôles ; le ZIP contient la signature et la clé publique.'
            : 'Dossier antérieur : aucune signature technique enregistrée.'}
        </p>
        <p>
          {proof.manifest.capture
            ? `Capture engagée auprès du serveur le ${new Date(proof.manifest.capture.committedAt).toLocaleString('fr-FR')}.`
            : 'Pas de session de capture engagée : origine uniquement déclarée.'}
        </p>
        <p>
          Identité du déposant non vérifiée · réalité des faits non certifiée · aucun verdict
          automatique sur l’IA. Les indices ne justifient pas, seuls, de rejeter une preuve.
        </p>
        {proof.manifest.declaration && (
          <p>
            Auteur déclaré : {proof.manifest.declaration.author}
            <br />
            {proof.manifest.declaration.context}
          </p>
        )}
      </section>
      <section className="detail-section">
        <h3>
          <Clock3 size={17} /> Horodatage indépendant
        </h3>
        {proof.receipt ? (
          <>
            <p>
              Jeton RFC 3161 signé par <strong>{proof.receipt.provider}</strong>, daté du{' '}
              {date(proof.receipt.time)}. Signature vérifiée à la réception.
            </p>
            <p className="muted">
              Qualification :{' '}
              {proof.receipt.qualification === 'operator_reviewed'
                ? 'service examiné par l’opérateur. La qualification eIDAS n’est pas validée automatiquement.'
                : 'non évaluée.'}
            </p>
          </>
        ) : (
          <>
            <p>
              Aucun jeton indépendant obtenu. La date du dépôt n’est pas un horodatage qualifié.
            </p>
            <button
              className="button secondary small"
              disabled={busy || !config.timestampConfigured}
              onClick={() =>
                act(async () =>
                  onChange(await api(`/api/proofs/${proof.id}/timestamp`, { method: 'POST' })),
                )
              }
            >
              {busy ? <Spinner /> : <Clock3 size={15} />} Réessayer l’horodatage
            </button>
          </>
        )}
      </section>
      <section className="detail-section">
        <h3>
          <Sparkles size={17} /> Provenance & indices IA
        </h3>
        <span
          className={`provenance-label ${proof.manifest.provenance.signals.length ? 'signal' : ''}`}
        >
          {proof.manifest.provenance.signals.length
            ? 'Indices déclaratifs présents'
            : 'Résultat inconclusif'}
        </span>
        {proof.manifest.provenance.signals.length > 0 && (
          <ul>
            {proof.manifest.provenance.signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        <p>{proof.manifest.provenance.explanation}</p>
        <ContentCredentialsSummary proof={proof} />
      </section>
      <ProtectionPanel
        proof={proof}
        onChange={async () => onChange(await api<Proof>(`/api/proofs/${proof.id}`))}
      />
      <RecipientLinks proof={proof} onChange={onChange} />
      <section className="detail-section">
        <h3>
          <Link2 size={17} /> Partage de vérification
        </h3>
        <p>
          Le lien révèle les empreintes et le statut d’horodatage, sans exposer la photo ni sa
          description. Toute personne ayant ce lien peut le consulter.
        </p>
        {proof.shareToken ? (
          <>
            <div className="share-url">
              <code>
                {location.origin}/verification/{proof.shareToken}
              </code>
              <button
                className="icon-button"
                aria-label="Copier le lien"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${location.origin}/verification/${proof.shareToken}`)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError('Copie indisponible. Sélectionnez le lien pour le copier.'),
                    )
                }
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <div className="button-row">
              <a
                className="text-link"
                href={`/verification/${proof.shareToken}`}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir la vérification <ExternalLink size={14} />
              </a>
              <button
                className="text-link muted"
                disabled={busy}
                onClick={() =>
                  act(async () =>
                    onChange(
                      await api(`/api/proofs/${proof.id}/share`, {
                        method: 'POST',
                        body: JSON.stringify({ enabled: false }),
                      }),
                    ),
                  )
                }
              >
                Révoquer le lien
              </button>
            </div>
          </>
        ) : (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              act(async () =>
                onChange(
                  await api(`/api/proofs/${proof.id}/share`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled: true }),
                  }),
                ),
              )
            }
          >
            <Link2 size={15} /> Activer un lien de vérification
          </button>
        )}
      </section>
      <details className="event-list">
        <summary>Historique du dossier</summary>
        {proof.events.map((event, index) => (
          <div key={index}>
            <span>{date(event.at)}</span>
            <span>
              {(
                {
                  original_received: 'Original reçu',
                  manifest_frozen: 'Manifeste figé',
                  timestamp_verified: 'Jeton d’horodatage vérifié',
                  challenge_reviewed: 'Défi vérifié visuellement',
                  protected_copy_issued: 'Copie protégée émise',
                  recipient_link_created: 'Lien destinataire créé',
                  recipient_link_revoked: 'Lien destinataire révoqué',
                  recipient_viewed: 'Dossier consulté par un destinataire',
                } as Record<string, string>
              )[event.kind] || event.kind}
            </span>
          </div>
        ))}
        <p>Historique applicatif ; ne constitue pas un journal d’audit indépendant.</p>
      </details>
      {error && <Notice danger>{error}</Notice>}
      <div className="detail-downloads">
        <a className="button primary" href={`/api/proofs/${proof.id}/export`}>
          <ArrowDownToLine size={17} /> Dossier complet (.zip)
        </a>
        <a className="button secondary" href={`/api/proofs/${proof.id}/report`}>
          <FileCheck2 size={17} /> Rapport PDF
        </a>
      </div>
      <details className="proof-partners">
        <summary>Faire constater les faits avec un partenaire Preuvix</summary>
        <PartnerDirectory />
      </details>
      {deleting ? (
        <div className="delete-panel">
          <h3>Supprimer définitivement ce dossier ?</h3>
          <p>
            L’original, les métadonnées, le jeton et le lien seront supprimés de cette installation.
            Les exports et sauvegardes externes ne sont pas rappelés.
          </p>
          <label htmlFor="delete-confirm">Tapez SUPPRIMER pour confirmer</label>
          <input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
          <div className="button-row">
            <button className="button secondary small" onClick={() => setDeleting(false)}>
              Annuler
            </button>
            <button
              className="button destructive small"
              disabled={busy || confirmation !== 'SUPPRIMER'}
              onClick={() =>
                act(async () => {
                  await api(`/api/proofs/${proof.id}`, { method: 'DELETE' });
                  await onDelete();
                })
              }
            >
              <Trash2 size={15} /> Supprimer le dossier
            </button>
          </div>
        </div>
      ) : (
        <button className="delete-link" onClick={() => setDeleting(true)}>
          <Trash2 size={14} /> Supprimer ce dossier
        </button>
      )}
    </Modal>
  );
}

function VerificationEntry() {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const token = link.trim().match(/(?:^|\/verification\/)([a-f0-9]{48})\/?$/)?.[1];
    if (!token) {
      setError('Collez un lien de vérification PREUVIX valide.');
      return;
    }
    location.assign(`/verification/${token}`);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NE VOUS CONTENTEZ PAS DE NOUS CROIRE</span>
          <h1>Vérifier un fichier.</h1>
          <p>Calculez une empreinte ou comparez une copie, sans l’envoyer au serveur.</p>
        </div>
      </div>
      <LocalFileCheck />
      <form className="verify-entry" onSubmit={submit}>
        <div className="round-icon">
          <ScanLine size={28} />
        </div>
        <h2>Vous avez un lien de vérification ?</h2>
        <p>Retrouvez-le dans le rapport PDF ou demandez-le au propriétaire.</p>
        <label htmlFor="verify-link">Lien ou jeton de vérification</label>
        <input
          id="verify-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…/verification/…"
          required
        />
        {error && <Notice danger>{error}</Notice>}
        <button className="button primary">
          Ouvrir le dossier <ArrowRight size={17} />
        </button>
      </form>
      <Notice>
        La comparaison établit si les octets correspondent au fichier déposé. Elle ne détecte pas à
        elle seule une image générée par IA.
      </Notice>
    </>
  );
}

function PublicVerification({ token }: { token: string }) {
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<'match' | 'mismatch' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<PublicProof>(`/api/verification/${token}`)
      .then(setProof)
      .catch((e) => setError(e.message));
  }, [token]);
  const compare = async (file: File | undefined) => {
    if (!file || !proof) return;
    setComparison(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('Choisissez un fichier de 10 Mo maximum.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const hex = await sha256File(file);
      setComparison(hex === proof.fileHash ? 'match' : 'mismatch');
    } catch {
      setError('Comparaison indisponible. Utilisez un navigateur compatible sur HTTPS.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="public-page">
      <header>
        <Brand />
        <a className="text-link" href="/">
          <ArrowLeft size={16} /> Mon espace
        </a>
      </header>
      <main className="verification-card">
        <span className="eyebrow">VÉRIFICATION PARTAGÉE</span>
        <h1>Vérifier, en toute clarté.</h1>
        <p>Un contrôle technique. Des conclusions précises.</p>
        {error && <Notice danger>{error}</Notice>}
        {!proof && !error && <Spinner />}
        {proof && (
          <>
            <div className="verification-found">
              <FileCheck2 size={24} />
              <div>
                <strong>Dossier trouvé</strong>
                <span>{shortId(proof.id)}</span>
              </div>
              <Status proof={proof} />
            </div>
            <div className="verification-check">
              <CheckCheck size={20} />
              <div>
                <strong>
                  {proof.storedFileMatches && proof.manifestMatches
                    ? 'Original et manifeste cohérents avec les empreintes enregistrées'
                    : 'Anomalie d’intégrité détectée'}
                </strong>
                <p>Contrôle effectué sur les données conservées par cette installation.</p>
              </div>
            </div>
            <div className="hash-box">
              <span>EMPREINTE SHA-256 ATTENDUE</span>
              <code>{proof.fileHash}</code>
            </div>
            <div className="detail-section">
              <h3>Horodatage</h3>
              <p>
                {proof.receipt
                  ? `Jeton RFC 3161 : ${date(proof.receipt.time)} · ${proof.receipt.provider}. Signature vérifiée à la réception (${date(proof.receipt.verifiedAt)}).`
                  : 'Aucun horodatage indépendant obtenu.'}
              </p>
              {proof.receipt && (
                <p>
                  La qualification eIDAS et la validité à long terme ne sont pas vérifiées
                  automatiquement sur cette page.
                </p>
              )}
            </div>
            <div className="local-compare">
              <ScanLine size={28} />
              <h2>Est-ce exactement le même fichier ?</h2>
              <p>
                Sélectionnez votre copie. Le calcul s’effectue dans votre navigateur :{' '}
                <strong>votre fichier n’est pas envoyé.</strong>
              </p>
              <label className="button primary file-button">
                {busy ? <Spinner /> : <Upload size={17} />} Choisir le fichier à comparer
                <input
                  type="file"
                  disabled={busy}
                  onChange={(e) => {
                    compare(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  aria-label="Fichier à comparer localement"
                />
              </label>
              {comparison && (
                <div className={`comparison ${comparison}`} role="status">
                  {comparison === 'match' ? <CheckCheck size={21} /> : <X size={21} />}
                  <div>
                    <strong>
                      {comparison === 'match'
                        ? 'Correspondance exacte des octets'
                        : 'Le fichier est différent'}
                    </strong>
                    <p>
                      {comparison === 'match'
                        ? 'Cette copie correspond à l’empreinte publiée. Cela n’atteste pas la réalité de la scène.'
                        : 'L’empreinte diffère. Une modification, une compression ou un autre fichier peuvent l’expliquer.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <Notice>
              <strong>Intégrité ≠ authenticité de la scène.</strong> Un fichier généré par IA peut
              avoir une empreinte et un horodatage valides. Cette page ne certifie ni l’auteur, ni
              le lieu, ni la date de capture.
            </Notice>
          </>
        )}
      </main>
      <footer>PREUVIX · Open source · Aucun contenu privé n’est affiché sur cette page.</footer>
    </div>
  );
}

function About({ config }: { config: AppConfig }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LA TRANSPARENCE FAIT PARTIE DU PRODUIT</span>
          <h1>Ce que PREUVIX établit.</h1>
          <p>Comprendre les garanties, et leurs limites.</p>
        </div>
      </div>
      <div className="about-grid">
        <article>
          <Fingerprint />
          <h2>Intégrité du fichier</h2>
          <p>
            L’original est conservé sans réencodage après réception. Son empreinte SHA-256 et un
            manifeste figé permettent de détecter un changement d’octets. La capture caméra est
            encodée en JPEG avant son dépôt.
          </p>
        </article>
        <article>
          <Clock3 />
          <h2>Une date indépendante</h2>
          <p>
            Un prestataire RFC 3161 peut horodater l’empreinte du manifeste. PREUVIX vérifie sa
            signature, la chaîne, le signataire épinglé et la politique attendue.
          </p>
          <span className="provenance-label">
            {config.timestampConfigured ? 'Prestataire configuré' : 'Prestataire non configuré'}
          </span>
          <p>
            {config.timestampConfigured
              ? `Prestataire configuré : ${config.providerName}. Le statut de chaque dossier dépend de son jeton.`
              : 'Prestataire non configuré. Les dates serveur ne sont pas qualifiées.'}
          </p>
        </article>
        <article>
          <Sparkles />
          <h2>Indices IA, pas verdict</h2>
          <p>
            Des métadonnées peuvent déclarer un outil génératif. Elles sont falsifiables et
            supprimables. PREUVIX ne fournit aucun score « réel / faux » et ne valide pas encore les
            signatures C2PA.
          </p>
        </article>
        <article>
          <Trash2 />
          <h2>Vous pouvez supprimer</h2>
          <p>
            La suppression retire le dossier, l’original, le jeton et son partage de la base active.
            Les copies téléchargées, les sauvegardes et les journaux du prestataire suivent leurs
            propres durées de conservation.
          </p>
        </article>
      </div>
      <section className="about-legal">
        <h2>Avant une ouverture au public en France</h2>
        <p>
          Cette installation est un pilote pour un seul propriétaire. Elle ne remplace pas un
          constat de commissaire de justice et ne garantit pas la recevabilité d’une pièce.
        </p>
        <p>
          Le service d’horodatage choisi doit être qualifié pour le service concerné et la date du
          jeton. Une configuration opérateur n’est pas une validation eIDAS automatisée.
        </p>
        <p>
          L’opérateur doit préciser son identité, les finalités, les bases légales, la durée de
          conservation, les sous-traitants et les modalités d’exercice des droits. Aucun outil de
          suivi publicitaire n’est intégré ; un cookie de session de 12 heures sert à la connexion.
        </p>
        <div className="reference-links">
          <a
            href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461"
            target="_blank"
            rel="noreferrer"
          >
            Article 1366 du Code civil <ExternalLink size={13} />
          </a>
          <a
            href="https://digital-strategy.ec.europa.eu/en/policies/eu-trusted-lists"
            target="_blank"
            rel="noreferrer"
          >
            Listes de confiance européennes <ExternalLink size={13} />
          </a>
        </div>
      </section>
    </>
  );
}

const credentialStates = {
  absent: 'Aucune signature d’appareil (C2PA)',
  unsupported: 'Validation C2PA non disponible pour ce format',
  invalid: 'Signature C2PA invalide — fichier modifié après signature',
  valid_untrusted: 'Signature C2PA intègre — signataire non reconnu',
  trusted: 'Signature C2PA intègre — signataire de confiance',
};

function ContentCredentialsSummary({ proof }: { proof: Proof }) {
  const credentials = proof.manifest.provenance.contentCredentials;
  if (!credentials)
    return proof.manifest.provenance.credentialsDetected ? (
      <p>Un marqueur C2PA a été repéré. Sa signature n’a pas été validée (dossier antérieur).</p>
    ) : null;
  return (
    <>
      <span
        className={`provenance-label ${credentials.state === 'invalid' || credentials.aiDeclared ? 'signal' : ''}`}
      >
        {credentialStates[credentials.state]}
      </span>
      {credentials.state !== 'absent' && credentials.state !== 'unsupported' && (
        <ul>
          {credentials.signer && (
            <li>
              Signataire : {credentials.signer.commonName ?? '?'} · émetteur{' '}
              {credentials.signer.issuer ?? '?'}
              {credentials.signer.time && ` · ${date(credentials.signer.time)}`}
            </li>
          )}
          {credentials.claimGenerator && <li>Générateur : {credentials.claimGenerator}</li>}
          {credentials.digitalSourceTypes.length > 0 && (
            <li>
              Source déclarée : {credentials.digitalSourceTypes.join(', ')}
              {credentials.aiDeclared && ' — contenu synthétique ou IA déclaré'}
            </li>
          )}
          {credentials.failures.length > 0 && (
            <li>Anomalies : {credentials.failures.join(', ')}</li>
          )}
        </ul>
      )}
    </>
  );
}
