import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Fingerprint,
  Globe2,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ProofDemo from './ProofDemo';
import WelcomeBackdrop from './WelcomeBackdrop';
import './welcome.css';

import { useTheme, ThemePicker, type Theme } from './Theme';

const rights = [
  {
    code: 'ART. 9',
    source: 'Code de procédure civile · Les preuves',
    title: 'Soutenir ses demandes par des faits.',
    text: 'Chaque partie doit prouver, conformément à la loi, les faits nécessaires au succès de sa demande.',
    link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006410102',
    label: 'Prouver les faits',
  },
  {
    code: 'ART. 1358',
    source: 'Code civil · Les modes de preuve',
    title: 'Plusieurs moyens de faire la preuve.',
    text: 'La preuve peut être apportée par tout moyen, sauf lorsque la loi impose une règle différente. Cela ne dispense pas de vérifier les règles applicables à votre situation.',
    link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042316',
    label: 'Modes de preuve',
  },
  {
    code: 'ART. 47',
    source: 'Charte des droits fondamentaux de l’Union européenne',
    title: 'Un recours effectif, un tribunal impartial.',
    text: 'Cet article protège le recours devant un tribunal lorsque des droits garantis par le droit de l’Union sont violés. La Charte s’applique dans le champ du droit de l’Union.',
    link: 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:12016P047',
    label: 'Recours effectif',
  },
  {
    code: 'ART. 6',
    source: 'Convention européenne des droits de l’homme',
    title: 'Pouvoir faire entendre sa cause.',
    text: 'Le droit à un procès équitable protège notamment l’accès à un tribunal dans les litiges relevant de cet article.',
    link: 'https://www.coe.int/fr/web/echr-toolkit/droit-a-un-proces-equitable',
    label: 'Accès à la justice',
  },
  {
    code: 'ART. 1353',
    source: 'Code civil · La charge de la preuve',
    title: 'Des faits pour soutenir vos droits.',
    text: 'La personne qui demande l’exécution d’une obligation doit la prouver. Celle qui s’en dit libérée doit justifier le paiement ou le fait qui l’a éteinte.',
    link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042341',
    label: 'Charge de la preuve',
  },
  {
    code: 'ART. 1366',
    source: 'Code civil · L’écrit électronique',
    title: 'Le numérique a sa place.',
    text: 'L’écrit électronique peut avoir la même force probante que le papier si son auteur est dûment identifiable et si son intégrité est garantie lors de son établissement et de sa conservation.',
    link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461',
    label: 'Preuve électronique',
  },
];
export function RightsExplorer() {
  const [selected, setSelected] = useState(0);
  const right = rights[selected];
  return (
    <div className="rights-explorer">
      <div className="rights-tabs" role="group" aria-label="Explorer vos droits">
        {rights.map((item, index) => (
          <button
            key={item.code}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            {item.code}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <article className="right-content" aria-live="polite" aria-atomic="true">
        <Scale size={30} strokeWidth={1.3} />
        <span className="welcome-kicker">{right.source}</span>
        <h3>{right.title}</h3>
        <p>{right.text}</p>
        <a href={right.link} target="_blank" rel="noreferrer">
          Consulter la source officielle <ArrowUpRight size={16} />
        </a>
      </article>
    </div>
  );
}
function Wordmark() {
  return (
    <a className="welcome-brand" href="#">
      <Fingerprint size={29} strokeWidth={1.5} />
      preuvix<span>.</span>
    </a>
  );
}

export default function Welcome({ children }: { children: ReactNode }) {
  const appearance = useTheme();
  const [loadingPreview, setLoadingPreview] = useState(false);
  if (loadingPreview)
    return (
      <JusticeLoading
        onContinue={(theme) => {
          appearance.select(theme);
          setLoadingPreview(false);
        }}
      />
    );
  return (
    <WelcomeBackdrop theme={appearance.resolvedTheme}>
      <header className="welcome-header">
        <Wordmark />
        <nav aria-label="Navigation d’accueil">
          <a href="#comprendre">Comment ça marche</a>
          <a href="/comprendre">Comprendre PREUVIX</a>
          <a href="#offres">Nos offres</a>
          <a href="#faq">Questions fréquentes</a>
        </nav>
        <a className="welcome-login" href="#connexion">
          Mon espace <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <button className="loading-preview-link" onClick={() => setLoadingPreview(true)}>
          Revoir l’écran de chargement <ArrowUpRight size={14} />
        </button>
        <section className="welcome-hero">
          <div className="hero-copy">
            <span className="welcome-kicker">
              <span className="live-dot" /> LA PREUVE, À LA PORTÉE DE CHACUN
            </span>
            <h1>
              Vos photos, vos références,
              <br />
              un <em>dossier clair.</em>
            </h1>
            <p>
              Conservez une photo, comparez son empreinte et exportez son dossier depuis votre
              espace privé.
            </p>
            <div className="hero-actions">
              <a className="welcome-button solid" href="#connexion">
                Ouvrir mon espace <ArrowRight size={18} />
              </a>
              <a className="welcome-button subtle" href="#comprendre">
                Explorer la démo <ArrowDown size={17} />
              </a>
            </div>
            <div className="hero-assurance">
              <LockKeyhole size={14} /> Originaux privés <span>·</span> Application open source{' '}
              <span>·</span> Vos données, votre maîtrise
            </div>
          </div>
          <div
            className="justice-art"
            aria-label="Illustration : un dossier de preuve au service de vos droits"
            role="img"
          >
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-star star-one">✦</div>
            <div className="art-star star-two">✧</div>
            <div className="evidence-sheet">
              <div className="sheet-top">
                <Fingerprint size={21} />
                <span>DOSSIER DE PREUVE</span>
                <span>01</span>
              </div>
              <div className="justice-emblem">
                <Scale size={76} strokeWidth={1} />
              </div>
              <span className="sheet-overline">CONSERVER. DOCUMENTer. TRANSMETTRE.</span>
              <h2>
                Les faits restent.
                <br />
                Votre voix compte.
              </h2>
              <div className="sheet-lines">
                <i />
                <i />
                <i />
              </div>
              <div className="sheet-bottom">
                <ShieldCheck size={22} />
                <span>
                  Intégrité documentée<small>Empreinte · Contexte · Original</small>
                </span>
              </div>
            </div>
            <div className="floating-note note-top">
              <LockKeyhole size={17} />
              <span>
                Votre original<small>reste privé.</small>
              </span>
            </div>
            <div className="floating-note note-bottom">
              <Fingerprint size={22} />
              <span>
                Une empreinte unique<small>SHA-256 · 8f2a91c4…</small>
              </span>
              <Check size={16} />
            </div>
            <span className="art-caption">UNE TRACE AUJOURD’HUI. UN APPUI DEMAIN.</span>
          </div>
        </section>
        <div className="welcome-toolbar">
          <span>Un espace à votre image.</span>
          <ThemePicker />
          <a href="/comprendre">
            Comprendre PREUVIX <ArrowDown size={14} />
          </a>
        </div>
        <section className="welcome-section compact-section" id="comprendre">
          <span className="welcome-kicker">DE LA PHOTO À L’EXPORT</span>
          <h2>Trois étapes, un dossier à retrouver.</h2>
          <ol className="welcome-steps">
            <li>
              <strong>1. Choisir une photo</strong>
              <p>Créez un dossier et conservez votre original.</p>
            </li>
            <li>
              <strong>2. Vérifier sa référence</strong>
              <p>Comparez l’empreinte de votre fichier à celle du dossier.</p>
            </li>
            <li>
              <strong>3. Exporter le dossier</strong>
              <p>Retrouvez l’original, le rapport et les éléments de vérification.</p>
            </li>
          </ol>
          <p>
            Une empreinte permet de comparer des fichiers ; elle ne certifie pas la réalité de la
            scène.
          </p>
          <details>
            <summary>Voir la démonstration courte</summary>
            <ProofDemo />
          </details>
        </section>
        <section className="welcome-section compact-section" id="offres">
          <h2>L’essentiel, puis la préparation Premium.</h2>
          <div className="plans-grid">
            <article className="plan-card">
              <span className="plan-label">FONCTIONS PRINCIPALES</span>
              <h3>Conserver, vérifier, exporter.</h3>
              <p>Dossiers privés, comparaison d’empreintes et export des éléments disponibles.</p>
            </article>
            <article className="plan-card premium-card">
              <span className="plan-label">PREMIUM · OFFRE EN PRÉPARATION</span>
              <h3>Préparer une transmission à un commissaire de justice</h3>
              <p>
                Sélection de pièces, résumé, contrôle de complétude et accès de consultation
                révocable.
              </p>
              <a className="welcome-button subtle" href="/comprendre#premium">
                Découvrir l’option Premium <ArrowRight size={17} />
              </a>
            </article>
          </div>
        </section>
        <section className="welcome-section compact-section simple-faq" id="faq">
          <h2>Les questions essentielles.</h2>
          <details>
            <summary>Qui peut consulter mes documents ?</summary>
            <p>
              Votre espace est privé. Un lien de consultation n’expose que la sélection confirmée ;
              toute personne possédant ce lien peut l’ouvrir.
            </p>
          </details>
          <details>
            <summary>Le fichier original est-il inclus dans un export ?</summary>
            <p>
              Le dossier complet inclut l’original. Le rapport de vérification photo et le mode
              empreintes seules l’excluent : vous conservez et joignez alors les fichiers
              séparément.
            </p>
          </details>
          <details>
            <summary>PREUVIX envoie-t-il le dossier à un commissaire ?</summary>
            <p>
              Non. Ce prototype prépare un accès sans envoi réel. L’option PREUVIX et les éventuels
              honoraires du professionnel sont distincts.
            </p>
          </details>
          <a href="/comprendre">Comprendre les contrôles et leurs limites</a>
        </section>
        <section className="welcome-section connection-section" id="connexion">
          <div>
            <span className="welcome-kicker">À VOUS D’ÉCRIRE LA SUITE</span>
            <h2>
              Un petit geste aujourd’hui.
              <br />
              <em>Une trace pour demain.</em>
            </h2>
            <p>
              Retrouvez votre espace privé et rassemblez
              <br />
              les faits qui comptent pour vous.
            </p>
            <div className="connection-seal">
              <ShieldCheck size={23} />
              <span>
                Vous gardez la maîtrise.<small>Votre original n’est pas publié par défaut.</small>
              </span>
            </div>
          </div>
          {children}
        </section>
      </main>
      <footer className="welcome-footer">
        <Wordmark />
        <span>La preuve au service de vos droits.</span>
        <a href="/comprendre#reperes">
          Sources & repères juridiques <ArrowUpRight size={14} />
        </a>
        <small>PREUVIX · Version pilote</small>
        <a href="/comprendre#cgu">CGU · Conditions d’utilisation</a>
      </footer>
    </WelcomeBackdrop>
  );
}

export function JusticeLoading({ onContinue }: { onContinue?: (theme: Theme) => void } = {}) {
  const appearance = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (onContinue) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [onContinue]);
  return (
    <WelcomeBackdrop theme={appearance.resolvedTheme} loading>
      <header className="welcome-header">
        <Wordmark />
        <ThemePicker />
      </header>
      <main className="startup-main">
        <section className="startup-card" aria-label="Ouverture de Preuvix">
          <div className="startup-visual" aria-hidden="true">
            <div className="startup-ring" />
            <div className="startup-ring ring-outer" />
            <div className="startup-file">
              <div className="startup-file-top">
                <Fingerprint size={22} />
                <span>PREUVIX / ORIGINAL</span>
              </div>
              <Scale size={64} strokeWidth={1.1} />
              <div className="startup-file-lines">
                <i />
                <i />
                <i />
              </div>
              <div className="startup-file-seal">
                <ShieldCheck size={18} /> CONSERVER LES FAITS
              </div>
              <div className="startup-scan" />
            </div>
            <span className="startup-spark">✦</span>
          </div>
          <div className="startup-copy">
            <span className="welcome-kicker">VOS DROITS. VOTRE VOIX. VOS PREUVES.</span>
            <h1>
              Chaque preuve
              <br />
              <em>compte.</em>
            </h1>
            <p>
              Les faits méritent une trace.
              <br />
              Votre voix mérite d’être entendue.
            </p>
            <div className="startup-status" role="status">
              <span className="startup-status-dot" />
              <span>
                {onContinue
                  ? 'Aperçu de l’écran de chargement'
                  : slow
                    ? 'La connexion prend un peu plus de temps…'
                    : 'Connexion à votre espace de preuves…'}
              </span>
            </div>
            <div className="justice-progress" aria-hidden="true">
              <span />
            </div>
            {onContinue ? (
              <button className="welcome-button solid" onClick={() => onContinue(appearance.theme)}>
                Continuer vers Preuvix <ArrowRight size={17} />
              </button>
            ) : slow ? (
              <div className="startup-retry">
                <p>Vous pouvez continuer à consulter les repères juridiques pendant l’attente.</p>
                <button className="welcome-button subtle" onClick={() => window.location.reload()}>
                  Réessayer la connexion <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <span className="startup-caption">
                Votre espace s’ouvrira dès que la connexion sera prête.
              </span>
            )}
          </div>
        </section>
        <div className="startup-rights-heading">
          <span className="welcome-kicker">EN ATTENDANT, EXPLOREZ VOS DROITS</span>
          <span>6 repères · Sources officielles</span>
        </div>
        <RightsExplorer />
        <div className="startup-principles">
          <span>
            <LockKeyhole size={15} /> Originaux privés
          </span>
          <span>
            <Fingerprint size={15} /> Intégrité vérifiable
          </span>
          <span>
            <Scale size={15} /> Vos droits au centre
          </span>
        </div>
      </main>
      <footer>Conserver les faits, c’est se donner les moyens de les faire entendre.</footer>
    </WelcomeBackdrop>
  );
}
