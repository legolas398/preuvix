import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Car,
  Droplets,
  Hammer,
  KeyRound,
  Lightbulb,
  Package,
  Pause,
  Play,
  Volume2,
} from 'lucide-react';
import './loading.css';

type Story = {
  icon: ReactNode;
  label: string;
  title: string;
  story: string;
  steps: [string, string, string];
  keeps: string;
};

// Everyday situations: each one shows what a dossier keeps, never a promise of outcome.
const stories: Story[] = [
  {
    icon: <Droplets size={20} />,
    label: 'Logement',
    title: 'Une fuite chez le voisin du dessus.',
    story:
      'Les taches s’étendent au plafond. Dans trois semaines, l’assureur demandera depuis quand.',
    steps: ['Photographier la tache', 'Joindre le devis', 'Transmettre le rapport'],
    keeps: 'Photo datée par le serveur, empreinte scellée, devis du plombier en pièce annexe.',
  },
  {
    icon: <Car size={20} />,
    label: 'Route',
    title: 'Un accrochage sur un parking.',
    story:
      'L’autre conducteur repart sans remplir de constat. Il ne vous reste que votre téléphone.',
    steps: ['Filmer en direct', 'Montrer le défi', 'Sceller la vidéo'],
    keeps:
      'Vidéo engagée toutes les 3 secondes pendant le tournage, original conservé octet pour octet.',
  },
  {
    icon: <KeyRound size={20} />,
    label: 'Location',
    title: 'Un dépôt de garantie retenu.',
    story:
      'Le propriétaire invoque des dégâts que vous contestez. L’état des lieux de sortie fait débat.',
    steps: ['Filmer chaque pièce', 'Joindre l’état d’entrée', 'Partager un lien'],
    keeps:
      'Vidéo du jour du départ, état des lieux d’entrée scellé, lien révocable pour un professionnel.',
  },
  {
    icon: <Hammer size={20} />,
    label: 'Travaux',
    title: 'Un chantier qui ne ressemble pas au devis.',
    story:
      'L’artisan affirme que tout était conforme à la livraison. Vos souvenirs ne suffiront pas.',
    steps: ['Photos avant / après', 'Devis et échanges', 'Rapport signé'],
    keeps: 'Un seul dossier : photos, devis et courriels scellés, chacun inscrit au journal signé.',
  },
  {
    icon: <Volume2 size={20} />,
    label: 'Voisinage',
    title: 'Des nuisances qui reviennent chaque nuit.',
    story:
      'Un épisode isolé pèse peu. Une chronologie documentée, épisode après épisode, davantage.',
    steps: ['Une vidéo par épisode', 'Contexte déclaré', 'Chronologie signée'],
    keeps: 'Chaque enregistrement daté, décrit de bonne foi et lié au précédent dans le journal.',
  },
  {
    icon: <Package size={20} />,
    label: 'Achat',
    title: 'Un colis livré abîmé.',
    story: 'Le vendeur demande la preuve que le dommage existait à l’ouverture du carton.',
    steps: ['Filmer l’ouverture', 'Bon de livraison', 'Export vérifiable'],
    keeps: 'Vidéo de l’ouverture en direct, bon de livraison en annexe, export ZIP vérifiable.',
  },
];

const facts = [
  'Changer un seul pixel change entièrement l’empreinte SHA-256 d’une photo.',
  'Votre original est conservé octet pour octet : jamais recompressé, jamais retouché.',
  'Le défi en direct montre que la photo a été prise après son émission par le serveur.',
  'Un rapport PREUVIX modifié d’un seul caractère n’est plus reconnu comme authentique.',
  'En vidéo, une empreinte partielle est engagée toutes les 3 secondes pendant le tournage.',
  'Chaque événement d’un dossier est signé et lié au précédent : rien ne s’efface en silence.',
];

const STORY_MS = 6500;
const FACT_MS = 5000;

/** Starts each visit on the next situation, so returning visitors discover a new one. */
function firstIndex(key: string, length: number) {
  try {
    const next = (Number(localStorage.getItem(key)) + 1) % length || 0;
    localStorage.setItem(key, String(next));
    return Number.isFinite(next) ? next : 0;
  } catch {
    return Math.floor(Math.random() * length);
  }
}

// Honours the welcome page's own "Animation : arrêtée" preference.
function motionOff() {
  try {
    return localStorage.getItem('preuvix-motion') === 'off';
  } catch {
    return false;
  }
}

function useRotation(length: number, delay: number, storageKey: string, paused: boolean) {
  const [index, setIndex] = useState(() => firstIndex(storageKey, length));
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % length), delay);
    return () => window.clearTimeout(timer);
  }, [index, paused, length, delay]);
  return [index, setIndex] as const;
}

export function LoadingStories() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(() => Boolean(reduced) || motionOff());
  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useRotation(
    stories.length,
    STORY_MS,
    'preuvix-loading-story',
    paused || hovered,
  );
  const story = stories[index];
  return (
    <section
      className="loading-stories"
      aria-roledescription="carrousel"
      aria-label="Situations où une preuve compte"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="story-frame" aria-live={paused ? 'polite' : 'off'}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={index}
            className="story-card"
            aria-roledescription="diapositive"
            aria-label={`${index + 1} sur ${stories.length} : ${story.label}`}
            initial={{ opacity: 0, y: 14, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -10, rotate: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="story-top">
              <span className="story-icon">{story.icon}</span>
              <span className="story-label">{story.label}</span>
              <span className="story-count">
                {String(index + 1).padStart(2, '0')} / {String(stories.length).padStart(2, '0')}
              </span>
            </div>
            <h2>{story.title}</h2>
            <p className="story-text">{story.story}</p>
            <ol className="story-steps">
              {story.steps.map((step, position) => (
                <motion.li
                  key={step}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + position * 0.12 }}
                >
                  <span>{position + 1}</span>
                  {step}
                  {position < 2 && <ArrowRight size={13} aria-hidden="true" />}
                </motion.li>
              ))}
            </ol>
            <p className="story-keeps">
              <strong>Ce que PREUVIX conserve</strong>
              {story.keeps}
            </p>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="story-controls">
        <div className="story-dots">
          {stories.map((item, position) => (
            <button
              key={item.label}
              aria-label={`Situation ${position + 1} : ${item.label}`}
              aria-current={position === index}
              onClick={() => setIndex(position)}
            >
              <span>
                {position === index && !paused && !hovered && (
                  <i style={{ animationDuration: `${STORY_MS}ms` }} key={index} />
                )}
              </span>
            </button>
          ))}
        </div>
        <button
          className="story-pause"
          aria-label={paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement'}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
    </section>
  );
}

export function ProofFacts() {
  const reduced = useReducedMotion();
  const [index] = useRotation(
    facts.length,
    FACT_MS,
    'preuvix-loading-fact',
    Boolean(reduced) || motionOff(),
  );
  return (
    <div className="proof-facts" role="note" aria-label="Le saviez-vous ?">
      <span className="proof-facts-label">
        <Lightbulb size={15} /> Le saviez-vous ?
      </span>
      <div className="proof-facts-text">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {facts[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
