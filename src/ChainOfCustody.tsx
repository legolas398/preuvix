import { motion } from 'motion/react';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Link as LinkIcon,
} from 'lucide-react';
import type { ChainLink, CustodySummary } from '../shared/chain';
import { custodyLabels } from '../shared/chain';
import './chain.css';

const when = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));

const stateLabel: Record<ChainLink['state'], string> = {
  verified: 'Vérifié',
  pending: 'En attente',
  warning: 'À examiner',
  failed: 'Rompu',
  absent: 'Non établi',
};
const StateIcon = ({ state }: { state: ChainLink['state'] }) =>
  state === 'verified' ? (
    <CircleCheck size={18} />
  ) : state === 'failed' ? (
    <CircleX size={18} />
  ) : state === 'warning' ? (
    <CircleAlert size={18} />
  ) : state === 'pending' ? (
    <CircleDashed size={18} />
  ) : (
    <CircleMinus size={18} />
  );

/** The chain from capture to issued documents, each link re-verified by the server. */
export default function ChainOfCustody({
  chain,
  custody,
  showJournal = true,
}: {
  chain: ChainLink[];
  custody?: CustodySummary;
  showJournal?: boolean;
}) {
  const verified = chain.filter((link) => link.state === 'verified').length;
  const broken = chain.some((link) => link.state === 'failed');
  return (
    <section className="chain" aria-label="Chaîne de preuve">
      <header className="chain-header">
        <span className={`chain-badge ${broken ? 'broken' : ''}`}>
          <LinkIcon size={16} />
        </span>
        <div>
          <h3>Chaîne de preuve</h3>
          <p>
            De la prise de vue aux documents émis. Chaque maillon est recontrôlé à l’ouverture du
            dossier.
          </p>
        </div>
        <strong className={broken ? 'broken' : ''}>
          {broken ? 'Chaîne rompue' : `${verified} / ${chain.length} vérifiés`}
        </strong>
      </header>
      <motion.ol
        className="chain-links"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        {chain.map((link) => (
          <motion.li
            key={link.id}
            className={`chain-link ${link.state}`}
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
          >
            <span className="chain-icon" aria-hidden="true">
              <StateIcon state={link.state} />
            </span>
            <div>
              <div className="chain-title">
                <strong>{link.label}</strong>
                <span className="chain-state">{stateLabel[link.state]}</span>
              </div>
              <p>{link.detail}</p>
              {link.at && <time dateTime={link.at}>{when(link.at)}</time>}
            </div>
          </motion.li>
        ))}
      </motion.ol>
      {showJournal && custody && custody.length > 0 && (
        <details className="custody-journal">
          <summary>
            Journal de conservation signé · {custody.length} événement
            {custody.length > 1 ? 's' : ''} {custody.intact ? '· intact' : '· altéré'}
          </summary>
          <p>
            Chaque événement est signé (Ed25519) et contient l’empreinte du précédent : supprimer,
            modifier ou réordonner une ligne rompt la chaîne. Tête actuelle :{' '}
            <code>{custody.head.slice(0, 24)}…</code>
          </p>
          {custody.problem && <p className="custody-problem">{custody.problem}</p>}
          <ol>
            {custody.entries
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.seq}>
                  <span className="custody-seq">n° {entry.seq}</span>
                  <span>{when(entry.at)}</span>
                  <span>{custodyLabels[entry.kind] ?? entry.kind}</span>
                  <code title={`Lien vers l’entrée précédente : ${entry.prev}`}>
                    {entry.prev.slice(0, 8)}
                  </code>
                </li>
              ))}
          </ol>
        </details>
      )}
    </section>
  );
}
