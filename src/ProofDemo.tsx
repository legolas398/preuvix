import { useEffect, useState } from 'react';
import { ArrowRight, FileCheck2, RotateCcw, ShieldCheck } from 'lucide-react';
import './proof-demo.css';

const examples = [
  {
    name: 'État des lieux',
    file: 'observations-logement.txt',
    text: 'ÉTAT DES LIEUX — EXEMPLE FICTIF\n28 septembre 2026 · 14 h 30\nPièce : salon\nObservation : fissure visible au-dessus de la fenêtre.\nLongueur estimée : 12 cm.\nÀ joindre : photographie originale et contexte de prise de vue.',
  },
  {
    name: 'Travaux',
    file: 'observations-travaux.txt',
    text: 'SUIVI DE TRAVAUX — EXEMPLE FICTIF\n28 septembre 2026 · 09 h 15\nPièce : salle de bain\nObservation : joint manquant au pied de la douche.\nÀ joindre : devis, échanges et photographies originales.',
  },
  {
    name: 'Litige en ligne',
    file: 'observations-annonce.txt',
    text: 'ANNONCE EN LIGNE — EXEMPLE FICTIF\n28 septembre 2026 · 16 h 45\nAdresse : https://example.com/annonce\nObservation : produit annoncé neuf, reçu endommagé.\nÀ joindre : capture originale, commande et échanges.',
  },
];
const stages = ['Lecture de la preuve', 'Scan de l’empreinte', 'Lecture du rapport'];
const digest = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

export default function ProofDemo() {
  const [scenario, setScenario] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [modified, setModified] = useState(false);
  const [hashes, setHashes] = useState<{ original: string; copy: string } | null>(null);
  const [error, setError] = useState('');
  const example = examples[scenario];
  const copy =
    example.text + (modified ? '\nModification : observation complétée après dépôt.' : '');
  useEffect(() => {
    let current = true;
    setHashes(null);
    setError('');
    Promise.all([digest(example.text), digest(copy)])
      .then(([original, copy]) => {
        if (current) setHashes({ original, copy });
      })
      .catch(() => {
        if (current) setError('Calcul indisponible : ouvrez Preuvix en HTTPS ou sur localhost.');
      });
    return () => {
      current = false;
    };
  }, [example.text, copy]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step < 2) setStep(step + 1);
      else setPlaying(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [playing, step]);
  function download() {
    if (!hashes) return;
    const report = `PREUVIX — RAPPORT DE DÉMONSTRATION\nExemple fictif : ${example.file}\n\nCONTENU ORIGINAL\n${example.text}\n\nCOPIE COMPARÉE\n${copy}\n\nSHA-256 original : ${hashes.original}\nSHA-256 copie : ${hashes.copy}\nRésultat : ${hashes.original === hashes.copy ? 'Contenu identique' : 'Modification détectée'}\n\nCalcul local réel sur les textes UTF-8 ci-dessus. Aucun dépôt, horodatage ou constat de commissaire de justice. Ce rapport ne certifie pas les faits décrits.`;
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'preuvix-demo-integrite.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="proof-demo" aria-label="Démonstration de vérification">
      <div className="demo-heading">
        <span className="eyebrow">VOTRE DOSSIER, PAS À PAS</span>
        <span className="demo-badge">Calcul SHA-256 réel · local</span>
      </div>
      <div className="demo-scenarios" aria-label="Choisir un exemple">
        {examples.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={scenario === index}
            onClick={() => {
              setScenario(index);
              setStep(0);
              setModified(false);
              setPlaying(false);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="demo-layout">
        <div className={`demo-document ${playing && step === 1 ? 'is-scanning' : ''}`}>
          <div className="demo-document-top">
            <FileCheck2 size={19} />
            <span>DOSSIER FICTIF · APERÇU DU DOCUMENT</span>
          </div>
          <pre className="demo-real-document">{copy}</pre>
          <div className="demo-file">
            <strong>{example.file}</strong>
            <span>{new TextEncoder().encode(copy).length} octets · texte UTF-8</span>
          </div>
          <label className="demo-change">
            <input
              type="checkbox"
              checked={modified}
              onChange={(e) => {
                setModified(e.target.checked);
                setStep(1);
                setPlaying(false);
              }}
            />{' '}
            Modifier la copie après dépôt
          </label>
          <div className="demo-digests">
            <span>Empreinte de référence</span>
            <code>{hashes?.original || 'Calcul…'}</code>
            <span>Empreinte de la copie</span>
            <code>{hashes?.copy || 'Calcul…'}</code>
          </div>
          {error && <p role="alert">{error}</p>}
          {hashes && (
            <div className={`demo-integrity ${modified ? 'changed' : ''}`} role="status">
              {hashes.original === hashes.copy
                ? 'Contenu identique — empreintes concordantes'
                : 'Modification détectée — empreintes différentes'}
            </div>
          )}
        </div>
        <div className="demo-explanation">
          <div className="demo-steps" aria-label="Étapes de la démonstration">
            {stages.map((title, index) => (
              <button
                key={title}
                aria-label={title}
                aria-pressed={step === index}
                className={step === index ? 'active' : ''}
                onClick={() => {
                  setPlaying(false);
                  setStep(index);
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="demo-copy" aria-live="polite">
            <ShieldCheck size={26} />
            <h3>{stages[step]}</h3>
            <p>
              {step === 0
                ? 'Choisissez une situation concrète. Lisez le document et les pièces à réunir pour expliquer les faits.'
                : step === 1
                  ? 'Activez « Modifier la copie » : un seul ajout change son empreinte. Les deux SHA-256 sont calculés ici, à partir du contenu affiché.'
                  : 'Le rapport rassemble le texte et les empreintes comparées. Il distingue la vérification du fichier, l’horodatage et le constat professionnel.'}
            </p>
          </div>
          {step === 2 && (
            <div className="demo-report">
              <strong>Rapport de démonstration</strong>
              <p>
                Intégrité :{' '}
                {hashes
                  ? modified
                    ? 'différence détectée'
                    : 'contenu identique'
                  : 'calcul en cours'}
                <br />
                Horodatage : non réalisé
                <br />
                Constat professionnel : non réalisé
              </p>
              <button className="button" disabled={!hashes} onClick={download}>
                Télécharger le rapport d’exemple
              </button>
              <a href="#commissaires">Trouver un commissaire de justice ↗</a>
            </div>
          )}
          <button
            className="button primary"
            onClick={() => {
              setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? 'Arrêter la démo' : step === 2 ? 'Rejouer la démo' : 'Lancer la démo'}
            {step === 2 ? <RotateCcw size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </div>
      <p className="demo-disclaimer">
        Exemples fictifs, calcul réel dans votre navigateur, sans envoi de fichier. Aucun certificat
        réel n’est émis. L’intégrité du fichier ne garantit pas l’authenticité des faits décrits.
      </p>
    </section>
  );
}
