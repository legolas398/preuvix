import { lazy, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import ProofSummary from './ProofSummary';
import ProofDownloads from './ProofDownloads';
import DraftNotice from './DraftNotice';
import type { WebDraft, DraftCase } from './web-draft';
import { date, size, Spinner, Notice } from './workspace-ui';
const CreateProof = lazy(() => import('./CreateProof'));
import { locationDescription } from '../shared/capture';
import type { AppConfig, Proof, PublicProof } from '../shared/types';
import { certificationLabels } from '../shared/certification-policy';
import ChallengeReview from './ChallengeReview';
import { shortId } from '../shared/format';
import { api } from './api';
import ProtectionPanel from './ProtectionPanel';
import RecipientLinks from './RecipientLinks';
const RecipientPage = lazy(() => import('./RecipientPage'));
import { HEIF_MESSAGE, MAX_PHOTO_BYTES, photoFormat } from '../shared/photo-format';
import { sha256File } from './file-hash';
import LocalFileCheck from './LocalFileCheck';
const PhotoVerification = lazy(() => import('./PhotoVerification'));
import Welcome, { JusticeLoading, RightsExplorer } from './Welcome';
const PartnerDirectory = lazy(() => import('./PartnerDirectory'));
const TransmissionWorkspace = lazy(() => import('./Transmission'));
const PremiumCard = lazy(() =>
  import('./Transmission').then((module) => ({ default: module.PremiumCard })),
);
const TransmissionConsultation = lazy(() =>
  import('./Transmission').then((module) => ({ default: module.TransmissionConsultation })),
);
import { CaptureLocation, SignatureControl } from './CaptureEvidence';
const Cases = lazy(() => import('./Cases'));
const CaseConsultation = lazy(() =>
  import('./Cases').then((module) => ({ default: module.CaseConsultation })),
);
const Terms = lazy(() => import('./Terms'));
const CommunitySpaces = lazy(() => import('./CommunitySpaces'));
import CapturePanel from './CapturePanel';
import { PageAppearance } from './Theme';

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
function Status({ proof }: { proof: Pick<Proof, 'status'> }) {
  return (
    <span className={`status ${proof.status === 'timestamped' ? 'complete' : 'pending'}`}>
      {proof.status === 'timestamped' ? <ShieldCheck size={13} /> : <Clock3 size={13} />}
      {proof.status === 'timestamped' ? 'Horodatage vérifié' : 'Horodatage en attente'}
    </span>
  );
}
export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState('');
  const dossierToken = window.location.pathname.match(
    /^\/consultation-dossier\/([a-f0-9]{64})$/,
  )?.[1];

  const token = window.location.pathname.match(/^\/verification\/([a-f0-9]{48})$/)?.[1];
  useEffect(() => {
    api<AppConfig>('/api/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const recipientToken = window.location.pathname.match(/^\/dossier\/([a-f0-9]{64})$/)?.[1];
  if (dossierToken) return <CaseConsultation token={dossierToken} />;
  if (token) return <PublicVerification token={token} />;
  if (recipientToken) return <RecipientPage token={recipientToken} />;
  const consultationToken = window.location.pathname.match(/^\/consultation\/([a-f0-9]{64})$/)?.[1];
  if (consultationToken) return <TransmissionConsultation token={consultationToken} />;
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
  if (window.location.pathname === '/comprendre')
    return (
      <main className="knowledge-page">
        <a href="/">← Retour à PREUVIX</a>
        <About config={config} />
        <section id="premium">
          <h2>Premium · 10,99 € par mois</h2>
          <p>
            Tout Free, avec une préparation guidée pour présenter plusieurs pièces ensemble. Offre
            en préparation, accessible en test sur invitation ; aucun paiement activé.
          </p>
          <ul>
            <li>Trois modèles de résumé : immobilier, travaux et internet.</li>
            <li>Des brouillons sauvegardés pour préparer votre demande à votre rythme.</li>
            <li>Une sélection de pièces avec résumé commun et vérification de complétude.</li>
            <li>Le choix d’inclure ou non les originaux et les notes de contexte.</li>
            <li>Un lien valable 7, 30 ou 90 jours, révocable depuis votre espace.</li>
          </ul>
          <p>
            Sélectionnez des pièces, vérifiez un résumé et les informations accessibles, puis créez
            un lien révocable. Le contrôle de complétude vérifie les champs et les pièces, pas leur
            valeur juridique.
          </p>
          <p>
            Le nom du destinataire est une étiquette. Toute personne ayant le lien peut le
            consulter. Aucun envoi, constat automatique, acceptation ou garantie juridique.
          </p>
          <p>L’option PREUVIX et les éventuels honoraires du commissaire sont distincts.</p>
          <a href="/">Revenir à mon espace</a>
        </section>
        <details id="reperes">
          <summary>Repères et sources</summary>
          <RightsExplorer />
        </details>
        <a href="/annuaire">Consulter l’annuaire séparément</a>
        <details>
          <summary>Communauté</summary>
          <CommunitySpaces />
        </details>
        <Terms />
      </main>
    );
  if (window.location.pathname === '/annuaire')
    return (
      <main className="knowledge-page">
        <a href="/">← Retour à PREUVIX</a>
        <h1>Annuaire des commissaires de justice</h1>
        <p>
          La consultation de l’annuaire est indépendante de Premium. Aucun dossier n’est envoyé
          depuis cette page.
        </p>
        <PartnerDirectory />
      </main>
    );
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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const [tab, setTab] = useState<'proofs' | 'verify' | 'about' | 'billing' | 'cases'>(() => {
    try {
      if (
        window.location.hash === '#billing' ||
        sessionStorage.getItem('preuvix-open-billing') === '1'
      )
        return 'billing';
    } catch {
      /* Use normal navigation when storage is unavailable. */
    }
    return 'cases';
  });
  const storageLimit = config.maxStorageMb;
  const [transmissionProof, setTransmissionProof] = useState<string | undefined>();
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
  const [initialDraft, setInitialDraft] = useState<WebDraft | undefined>();
  const [initialCase, setInitialCase] = useState<DraftCase | undefined>();
  const caseCapture = useRef<((proof: Proof) => Promise<void>) | null>(null);
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
        <nav aria-label="Navigation principale">
          <button
            className={tab === 'cases' ? 'active' : ''}
            onClick={() => {
              setSelected(null);
              setTab('cases');
            }}
          >
            <FolderLock size={19} /> Dossiers
          </button>
          <button
            onClick={() => {
              setInitialDraft(undefined);
              setInitialCase(undefined);
              caseCapture.current = null;
              setCreating(true);
            }}
          >
            <Camera size={19} /> Capturer
          </button>
          <button
            className={tab === 'verify' ? 'active' : ''}
            onClick={() => {
              setSelected(null);
              setTab('verify');
            }}
          >
            <ScanLine size={19} /> Vérifier
          </button>
        </nav>
        <details className="workspace-secondary">
          <summary>Preuves et outils</summary>
          <nav aria-label="Outils secondaires">
            <button
              className={tab === 'proofs' ? 'active' : ''}
              onClick={() => {
                setSelected(null);
                setTab('proofs');
              }}
            >
              <FolderLock size={19} /> Toutes les preuves{' '}
              <span className="nav-count">{proofs.length}</span>
            </button>
            <button
              className={tab === 'verify' ? 'active' : ''}
              onClick={() => {
                setSelected(null);
                setTab('verify');
              }}
            >
              <ScanLine size={19} /> Vérifier un fichier
            </button>
            <button
              className={tab === 'about' ? 'active' : ''}
              onClick={() => {
                setSelected(null);
                setTab('about');
              }}
            >
              <CircleHelp size={19} /> Comprendre PREUVIX
            </button>
            <button
              className={tab === 'billing' ? 'active' : ''}
              onClick={() => {
                setSelected(null);
                setTransmissionProof(undefined);
                setTab('billing');
              }}
            >
              <Sparkles size={19} /> Préparation Premium
            </button>
          </nav>
        </details>
        <PageAppearance />
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
              {tab === 'cases'
                ? 'Dossiers'
                : tab === 'proofs'
                  ? 'Toutes les preuves'
                  : tab === 'verify'
                    ? 'Vérification'
                    : tab === 'billing'
                      ? 'Préparation Premium'
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
          {!creating && (
            <DraftNotice
              resume={(draft) => {
                setInitialDraft(draft);
                setInitialCase(draft.caseTarget);
                caseCapture.current = null;
                setCreating(true);
              }}
            />
          )}
          {error && <Notice danger>{error}</Notice>}
          {selected ? (
            <ProofDetail
              proof={selected}
              onTransmission={() => {
                setTransmissionProof(selected.id);
                setSelected(null);
                setTab('billing');
              }}
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
          ) : tab === 'cases' ? (
            <Cases
              proofs={proofs}
              refreshProofs={refresh}
              requestCapture={(callback, target) => {
                setInitialDraft(undefined);
                setInitialCase(target);
                caseCapture.current = callback;
                setCreating(true);
              }}
            />
          ) : tab === 'proofs' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">VOTRE MÉMOIRE NUMÉRIQUE</span>
                  <h1>
                    Toutes les preuves<span className="heading-dot">.</span>
                  </h1>
                  <p>Conservez l’original. Documentez son intégrité. Gardez la main.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setInitialDraft(undefined);
                    setInitialCase(undefined);
                    caseCapture.current = null;
                    setCreating(true);
                  }}
                >
                  <Plus size={18} /> Créer une preuve
                </button>
              </div>
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
                          {proof.manifest.file.mime === 'application/pdf' ? (
                            <span aria-label="Document PDF">PDF</span>
                          ) : proof.manifest.file.mime.startsWith('video/') ? (
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
                      <button
                        className="button secondary"
                        onClick={() => {
                          setInitialDraft(undefined);
                          setInitialCase(undefined);
                          caseCapture.current = null;
                          setCreating(true);
                        }}
                      >
                        <Plus size={16} /> Déposer ma première photo
                      </button>
                    )}
                  </div>
                )}
              </section>
              <PremiumCard
                enabled={config.premiumTransmissionTest}
                onOpen={() => {
                  setTransmissionProof(undefined);
                  setTab('billing');
                }}
              />
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
              <TransmissionWorkspace
                enabled={config.premiumTransmissionTest}
                proofs={proofs}
                initialProofId={transmissionProof}
              />
            </section>
          ) : tab === 'verify' ? (
            <PhotoVerification
              references={proofs.map((p) => ({
                title: p.manifest.title,
                sha256: p.manifest.file.sha256,
              }))}
            />
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
          initialDraft={initialDraft}
          initialCase={initialCase}
          close={() => {
            setCreating(false);
            setInitialDraft(undefined);
            setInitialCase(undefined);
            caseCapture.current = null;
          }}
          onCreated={async (proof, target) => {
            setCreating(false);
            if (caseCapture.current) {
              const attach = caseCapture.current;
              caseCapture.current = null;
              try {
                await attach(proof);
              } catch (e) {
                setError(
                  `Le fichier est conservé dans vos preuves, mais son ajout au dossier a échoué : ${(e as Error).message}`,
                );
              }
            } else {
              if (target) {
                try {
                  const current = await api<import('../shared/cases').CaseDetail>(
                    `/api/cases/${target.id}`,
                  );
                  if (!current.manifest.files.some((file) => file.proofId === proof.id)) {
                    await api(`/api/cases/${target.id}/files`, {
                      method: 'POST',
                      body: JSON.stringify({
                        expectedVersion: target.expectedVersion,
                        proofId: proof.id,
                        ...(target.replaceFileId ? { replaceFileId: target.replaceFileId } : {}),
                      }),
                    });
                  }
                } catch (e) {
                  setError(
                    `Preuve conservée. Le dossier « ${target.title} » n’a pas pu être mis à jour : ${(e as Error).message} Ajoutez la preuve depuis ce dossier après vérification de sa version.`,
                  );
                }
              }
              setSelected(proof);
            }
            setInitialDraft(undefined);
            setInitialCase(undefined);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function ProofDetail({
  onTransmission,
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
  onTransmission: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareDays, setShareDays] = useState(7);
  const [shareLocation, setShareLocation] = useState(false);
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
    <article className="dossier-page">
      <button className="text-link" onClick={close}>
        ← Mes dossiers
      </button>
      <h1>{proof.manifest.title}</h1>
      <nav className="dossier-navigation" aria-label="Sections du dossier">
        <a href="#resume">Résumé</a>
        <a href="#documents">Documents</a>
        <a href="#controle">Vérification</a>
        <a href="#export">Export</a>
        <a href="#transmission">Transmission Premium</a>
      </nav>
      <h2 id="resume">Résumé</h2>
      <div className="detail-meta">
        <span>{shortId(proof.id)}</span>
        <Status proof={proof} />
      </div>
      <ProofSummary key={proof.id} proof={proof} />
      <h2 id="documents">Documents</h2>
      <div className="detail-layout">
        <div className="detail-image">
          {proof.manifest.file.mime === 'application/pdf' ? (
            <a href={`/api/proofs/${proof.id}/original`}>Télécharger le document PDF original</a>
          ) : proof.manifest.file.mime.startsWith('video/') ? (
            <video
              src={`/api/proofs/${proof.id}/original`}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={`/api/proofs/${proof.id}/original`} alt={proof.manifest.title} decoding="async" />
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
              {proof.manifest.mobileEvidence &&
              proof.manifest.mobileEvidence.origin !== 'system_file_picker'
                ? 'Caméra Android (déclaratif)'
                : proof.manifest.source === 'camera'
                  ? 'Caméra du navigateur'
                  : 'Fichier importé'}
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
      <h2 id="controle">Vérification</h2>
      <CaptureLocation
        capture={proof.manifest.capture}
        mobileEvidence={proof.manifest.mobileEvidence}
      />
      <SignatureControl attestation={proof.attestation} />
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
      <details>
        <summary>Contrôles techniques, provenance et horodatage</summary>
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
      </details>
      <details>
        <summary>Protection des copies</summary>
        <ProtectionPanel
          proof={proof}
          onChange={async () => onChange(await api<Proof>(`/api/proofs/${proof.id}`))}
        />
      </details>
      <details>
        <summary>Lien de vérification des empreintes</summary>
        <section className="detail-section">
          <h3>
            <Link2 size={17} /> Partage de vérification
          </h3>
          <p>
            Le lien révèle les empreintes et le statut d’horodatage, sans exposer la photo ni sa
            description. Toute personne ayant ce lien peut le consulter.
          </p>
          <p>
            La localisation reste masquée par défaut. Le PDF téléchargé après activation contient un
            QR code vers ce lien. Le lien ne donne pas accès aux originaux. La révocation ne
            supprime pas les copies déjà téléchargées.
          </p>
          {!proof.shareToken && (
            <div className="workspace-filters">
              <label>
                Expiration du lien
                <select value={shareDays} onChange={(e) => setShareDays(Number(e.target.value))}>
                  <option value={7}>7 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={90}>90 jours</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={shareLocation}
                  onChange={(e) => setShareLocation(e.target.checked)}
                />
                Afficher la localisation déclarée (coordonnées, précision et heure du relevé)
              </label>
            </div>
          )}
          {proof.verificationLink && (
            <p>
              Expire le {date(proof.verificationLink.expiresAt)} · localisation{' '}
              {proof.verificationLink.includeLocation ? 'visible' : 'masquée'}. Révoquez ce lien
              pour changer les informations partagées.
            </p>
          )}
          {proof.shareToken && !proof.verificationLink && (
            <p>
              Ancien lien sans expiration. Révoquez-le puis créez un nouveau lien limité dans le
              temps.
            </p>
          )}
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
                      body: JSON.stringify({
                        enabled: true,
                        days: shareDays,
                        includeLocation: shareLocation,
                      }),
                    }),
                  ),
                )
              }
            >
              <Link2 size={15} /> Activer un lien de vérification
            </button>
          )}
        </section>
      </details>
      <details className="event-list">
        <summary>Historique du dossier</summary>
        {proof.events.map((event, index) => (
          <div key={index}>
            <span>{date(event.at)}</span>
            <span>
              {(
                {
                  verification_link_created: 'Lien de vérification créé',
                  verification_link_revoked: 'Lien de vérification révoqué',
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
      <h2 id="export">Export</h2>
      <p>
        Le dossier complet contient l’original et ses métadonnées. Pour limiter les informations
        accessibles, utilisez la préparation Premium ci-dessous.
      </p>
      <ProofDownloads key={proof.id} proofId={proof.id} />
      <p>
        <a href="/annuaire">Consulter l’annuaire dans une page séparée</a>
      </p>
      {deleting ? (
        <div className="delete-panel">
          <h3>Supprimer définitivement ce dossier ?</h3>
          <p>
            L’original, les métadonnées, le jeton, les liens et les préparations contenant cette
            pièce seront supprimés de cette installation. Les exports et sauvegardes externes ne
            sont pas rappelés.
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
      <section id="transmission">
        <PremiumCard enabled={config.premiumTransmissionTest} onOpen={onTransmission} />
        <RecipientLinks proof={proof} onChange={onChange} />
      </section>
    </article>
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
      <PageAppearance />
      <main className="verification-card">
        <span className="eyebrow">VÉRIFICATION PARTAGÉE</span>
        <h1>Vérifier, en toute clarté.</h1>
        <p>Un contrôle technique. Des conclusions précises.</p>
        {error && <Notice danger>{error}</Notice>}
        {!proof && !error && <Spinner />}
        {proof && (
          <>
            {proof.expiresAt && <p>Accessible jusqu’au {date(proof.expiresAt)}.</p>}
            <p>
              Signature technique :{' '}
              {proof.signatureVerified ? 'vérifiée par le serveur' : 'non disponible'}.
            </p>
            {proof.location && (
              <section>
                <h2>Localisation partagée par le propriétaire</h2>
                <p>{locationDescription(proof.location)}</p>
                <p>
                  Coordonnées déclarées par l’appareil ; le lieu réel de la scène n’est pas
                  authentifié.
                </p>
              </section>
            )}
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
      <footer>
        PREUVIX · Open source · Seules les informations autorisées par le propriétaire sont
        affichées.
      </footer>
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
        <h2>Les limites du prototype privé</h2>
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
          <a href="/comprendre#premium">Comprendre la préparation Premium</a>
          <a href="/annuaire">Consulter l’annuaire séparément</a>
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
