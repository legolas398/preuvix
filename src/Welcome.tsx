import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { fadeUp } from './motion';
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
import { LoadingStories, ProofFacts } from './LoadingStories';
import Terms from './Terms';
import PartnerDirectory from './PartnerDirectory';
import CommunitySpaces from './CommunitySpaces';
import BillingPanel from './BillingPanel';
import './welcome.css';

const themes = ['Orange', 'Aurore', 'Minuit'] as const;
type Theme = (typeof themes)[number];
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('preuvix-theme');
      return themes.find((t) => t === saved) || 'Orange';
    } catch {
      return 'Orange';
    }
  });
  function select(value: Theme) {
    setTheme(value);
    try {
      localStorage.setItem('preuvix-theme', value);
    } catch {
      /* Theme remains usable without storage. */
    }
  }
  return { theme, select };
}
function ThemePicker({ theme, select }: ReturnType<typeof useTheme>) {
  return (
    <div className="theme-picker" role="group" aria-label="Thème visuel">
      {themes.map((value, index) => (
        <button key={value} aria-pressed={theme === value} onClick={() => select(value)}>
          <span className={`theme-dot theme-dot-${index}`} />
          {value}
        </button>
      ))}
    </div>
  );
}
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

const reveal = {
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, margin: '0px 0px -10% 0px' },
  variants: fadeUp,
} as const;
const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}
/** Hero illustration that tilts toward the pointer and drifts on scroll. */
function useTilt() {
  const reduced = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), {
    stiffness: 120,
    damping: 14,
  });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), {
    stiffness: 120,
    damping: 14,
  });
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 60]);
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const box = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - box.left) / box.width - 0.5);
    py.set((e.clientY - box.top) / box.height - 0.5);
  };
  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };
  return {
    style: reduced ? {} : { rotateX, rotateY, y, transformPerspective: 900 },
    onPointerMove,
    onPointerLeave,
  };
}
function RightsExplorer() {
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
      <div className="right-content-frame" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={right.code}
            className="right-content"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Scale size={30} strokeWidth={1.3} />
            <span className="welcome-kicker">{right.source}</span>
            <h3>{right.title}</h3>
            <p>{right.text}</p>
            <a href={right.link} target="_blank" rel="noreferrer">
              Consulter la source officielle <ArrowUpRight size={16} />
            </a>
          </motion.article>
        </AnimatePresence>
      </div>
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
  const tilt = useTilt();
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
    <WelcomeBackdrop theme={appearance.theme}>
      <ScrollProgress />
      <header className="welcome-header">
        <Wordmark />
        <nav aria-label="Navigation d’accueil">
          <a href="#comprendre">Comment ça marche</a>
          <a href="#droits">Vos droits</a>
          <a href="#offres">Nos offres</a>
          <a href="#communaute">Communauté</a>
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
          <motion.div className="hero-copy" initial="hidden" animate="show" variants={heroStagger}>
            <motion.span className="welcome-kicker" variants={fadeUp}>
              <span className="live-dot" /> LA PREUVE, À LA PORTÉE DE CHACUN
            </motion.span>
            <motion.h1 variants={fadeUp}>
              Vos droits méritent
              <br />
              des <em>preuves.</em>
            </motion.h1>
            <motion.p variants={fadeUp}>
              Un désaccord, un imprévu, un moment qui compte.
              <br className="desktop-break" /> Conservez les faits aujourd’hui pour faire entendre
              <br className="desktop-break" /> votre voix demain.
            </motion.p>
            <motion.div className="hero-actions" variants={fadeUp}>
              <a className="welcome-button solid" href="#connexion">
                Commencer gratuitement <ArrowRight size={18} />
              </a>
              <a className="welcome-button subtle" href="#comprendre">
                Explorer la démo <ArrowDown size={17} />
              </a>
            </motion.div>
            <motion.div className="hero-assurance" variants={fadeUp}>
              <LockKeyhole size={14} /> Originaux privés <span>·</span> Application open source{' '}
              <span>·</span> Vos données, votre maîtrise
            </motion.div>
          </motion.div>
          <motion.div
            className="justice-art"
            aria-label="Illustration : un dossier de preuve au service de vos droits"
            role="img"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            style={tilt.style}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
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
          </motion.div>
        </section>
        <div className="welcome-toolbar">
          <span>Un espace à votre image.</span>
          <ThemePicker {...appearance} />
          <a href="#droits">
            La technologie au service de vos droits <ArrowDown size={14} />
          </a>
        </div>
        <section className="welcome-section" id="comprendre">
          <motion.div className="section-heading" {...reveal}>
            <div>
              <span className="welcome-kicker">01 / DE LA PHOTO AU DOSSIER</span>
              <h2>
                La confiance se construit.
                <br />
                <em>Étape par étape.</em>
              </h2>
            </div>
            <p>
              Découvrez comment une photo devient un dossier dont l’intégrité peut être vérifiée.
            </p>
          </motion.div>
          <motion.div {...reveal}>
            <ProofDemo />
          </motion.div>
        </section>
        <section className="welcome-section rights-section" id="droits">
          <motion.div className="section-heading" {...reveal}>
            <div>
              <span className="welcome-kicker">02 / CONNAÎTRE SES DROITS</span>
              <h2>
                La justice commence
                <br />
                <em>par une voix entendue.</em>
              </h2>
            </div>
            <p>Six repères pour comprendre le lien entre vos droits, les faits et la preuve.</p>
          </motion.div>
          <motion.div {...reveal}>
            <RightsExplorer />
          </motion.div>
          <p className="rights-footnote">
            Repères généraux, sans garantie d’admissibilité d’un dossier. L’appréciation de la
            preuve appartient au juge ; Preuvix ne remplace pas un conseil juridique.
          </p>
        </section>
        <section className="welcome-section" id="offres">
          <motion.div className="section-heading" {...reveal}>
            <div>
              <span className="welcome-kicker">03 / UN ACCÈS POUR CHACUN</span>
              <h2>
                L’essentiel, accessible.
                <br />
                <em>La suite, à votre rythme.</em>
              </h2>
            </div>
            <p>
              Commencez avec l’application gratuite. Découvrez Premium à 10,99 € par mois, avec
              paiement via Stripe.
            </p>
          </motion.div>
          <motion.div
            className="plans-grid"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            variants={heroStagger}
          >
            <motion.article className="plan-card" variants={fadeUp}>
              <span className="plan-label">
                <Globe2 size={20} /> FREE / GRATUIT
              </span>
              <h3>
                Les premiers pas,
                <br />
                en toute confiance.
              </h3>
              <div className="plan-price">
                0 €<span>pour l’application</span>
              </div>
              <p>
                Sur votre propre installation. Les frais d’hébergement et de services externes
                restent à votre charge.
              </p>
              <ul>
                {[
                  'Conservation de vos photos originales',
                  'Empreinte SHA-256 et comparaison locale',
                  'Export et partage d’un dossier vérifiable',
                  'Accès à toutes les ambiances visuelles',
                ].map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {item}
                  </li>
                ))}
              </ul>
              <a className="welcome-button solid" href="#connexion">
                Accéder à mon espace gratuit <ArrowRight size={17} />
              </a>
            </motion.article>
            <motion.div className="plan-motion" variants={fadeUp}>
              <BillingPanel />
            </motion.div>
          </motion.div>
          <motion.section
            className="constat-section"
            id="constat"
            aria-labelledby="constat-title"
            {...reveal}
          >
            <div className="constat-intro">
              <span className="welcome-kicker">
                <Scale size={18} /> PARCOURS PREMIUM · CONSTAT PROFESSIONNEL
              </span>
              <h3 id="constat-title">
                Vos preuves, entre les mains
                <br />
                <em>d’un commissaire de justice.</em>
              </h3>
              <p>
                Besoin de faire constater une situation ? Préparez votre dossier Preuvix, puis
                contactez un commissaire de justice pour demander un constat et un devis.
              </p>
              <a
                className="welcome-button solid"
                href="https://annuaire.commissaire-justice.fr/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Trouver un commissaire de justice <ArrowUpRight size={18} />
              </a>
              <span className="constat-directory-note">
                Annuaire officiel de la profession · Nouvel onglet
              </span>
            </div>
            <div className="constat-process">
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Rassemblez les éléments</strong>
                    <p>
                      Conservez les originaux, le contexte et la chronologie. Exportez votre dossier
                      depuis votre espace.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Échangez avec le professionnel</strong>
                    <p>
                      Décrivez les faits à constater. Le commissaire détermine les modalités de son
                      intervention et vous indique ses honoraires.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Obtenez un procès-verbal de constat</strong>
                    <p>
                      Si la mission est acceptée et réalisée, le professionnel établit le constat
                      des faits qu’il a personnellement observés.
                    </p>
                  </div>
                </li>
              </ol>
              <details className="constat-checklist">
                <summary>Préparer ma demande de constat</summary>
                <ul>
                  <li>Les faits précis à constater et leur localisation.</li>
                  <li>Les dates utiles, l’urgence éventuelle et les conditions d’accès.</li>
                  <li>Vos fichiers originaux et le dossier Preuvix exporté.</li>
                  <li>Vos coordonnées et une demande de devis avant intervention.</li>
                </ul>
                <a href="#connexion">
                  Ouvrir mon espace pour préparer le dossier <ArrowRight size={15} />
                </a>
              </details>
            </div>
            <PartnerDirectory />
            <div className="constat-boundary">
              <ShieldCheck size={21} />
              <p>
                <strong>Un constat professionnel, pas une certification automatique.</strong>{' '}
                Preuvix documente l’intégrité de vos fichiers ; un dépôt ne constitue pas un constat
                et ne certifie pas la réalité d’une scène passée. Le commissaire reste responsable
                de ses constatations. Ses honoraires sont distincts de l’offre Premium. Ce lien vers
                l’annuaire est accessible dès maintenant, sans abonnement. Seules les études dont le
                partenariat est confirmé sont affichées dans le réseau Preuvix. Aucune réservation
                ni transmission automatique de dossier n’est effectuée.
              </p>
            </div>
            <a
              className="constat-source"
              href="https://commissaire-justice.fr/constat-commissaire-de-justice/qui-peut-demander-un-constat/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Comprendre le constat · Chambre nationale des commissaires de justice{' '}
              <ArrowUpRight size={14} />
            </a>
          </motion.section>
        </section>
        <motion.div {...reveal}>
          <CommunitySpaces />
        </motion.div>
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
        <Terms />
      </main>
      <footer className="welcome-footer">
        <Wordmark />
        <span>La preuve au service de vos droits.</span>
        <a href="#droits">
          Sources & repères juridiques <ArrowUpRight size={14} />
        </a>
        <small>PREUVIX · Version pilote</small>
        <a href="#cgu">CGU · Conditions d’utilisation</a>
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
    <WelcomeBackdrop theme={appearance.theme} loading>
      <header className="welcome-header">
        <Wordmark />
        <ThemePicker {...appearance} />
      </header>
      <main className="startup-main">
        <section className="startup-card" aria-label="Ouverture de Preuvix">
          <LoadingStories />
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
        <ProofFacts />
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
