import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Clock3, HardDrive, ShieldCheck } from 'lucide-react';
import type { Proof } from '../shared/types';
import { CountUp } from './motion';

const WEEKS = 12;
const DAY = 86_400_000;
const ease = [0.22, 1, 0.36, 1] as const;
const weekLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function startOfWeek(time: number) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Deposits per week, status split and storage use for the private workspace. */
export default function ProofInsights({
  proofs,
  usedBytes,
  limitMb,
}: {
  proofs: Proof[];
  usedBytes: number;
  limitMb: number;
}) {
  const weeks = useMemo(() => {
    const current = startOfWeek(Date.now());
    const buckets = Array.from({ length: WEEKS }, (_, i) => ({
      start: current - (WEEKS - 1 - i) * 7 * DAY,
      count: 0,
    }));
    for (const proof of proofs) {
      const index =
        (startOfWeek(Date.parse(proof.manifest.receivedAt)) - buckets[0].start) / (7 * DAY);
      const bucket = buckets[Math.round(index)];
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [proofs]);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const recent = weeks.reduce((sum, w) => sum + w.count, 0);
  const [hover, setHover] = useState<number | null>(null);

  const done = proofs.filter((p) => p.status === 'timestamped').length;
  const waiting = proofs.length - done;
  const donePct = proofs.length ? (done / proofs.length) * 100 : 0;

  const limitBytes = limitMb * 1024 * 1024;
  const usedPct = limitBytes ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;

  return (
    <section className="insights" aria-label="Aperçu de votre activité">
      <article className="insight-card insight-chart">
        <header>
          <span className="insight-icon">
            <CalendarDays size={17} />
          </span>
          <div>
            <h3>Dépôts par semaine</h3>
            <small>{WEEKS} dernières semaines</small>
          </div>
          <strong className="insight-total">
            <CountUp value={recent} />
          </strong>
        </header>
        <div className="bar-chart" onMouseLeave={() => setHover(null)}>
          <div className="bar-grid" aria-hidden="true">
            <span data-value={max} />
            <span data-value="" />
            <span data-value="0" />
          </div>
          <div className="bars" role="img" aria-label={`${recent} dépôts sur ${WEEKS} semaines`}>
            {weeks.map((week, i) => (
              <button
                type="button"
                key={week.start}
                className={`bar-slot ${hover === i ? 'active' : ''}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`Semaine du ${weekLabel.format(week.start)} : ${week.count} dépôt${week.count > 1 ? 's' : ''}`}
              >
                <motion.span
                  className={`bar ${week.count ? '' : 'empty'}`}
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease, delay: i * 0.035 }}
                  style={{ height: week.count ? `${(week.count / max) * 100}%` : '2px' }}
                />
                {hover === i && (
                  <motion.span
                    className="bar-tooltip"
                    role="tooltip"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <small>Sem. du {weekLabel.format(week.start)}</small>
                    <strong>
                      {week.count} dépôt{week.count > 1 ? 's' : ''}
                    </strong>
                  </motion.span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="bar-axis" aria-hidden="true">
          <span>{weekLabel.format(weeks[0].start)}</span>
          <span>Cette semaine</span>
        </div>
        <table className="sr-only">
          <caption>Dépôts par semaine</caption>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <th scope="row">{weekLabel.format(w.start)}</th>
                <td>{w.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="insight-card">
        <header>
          <span className="insight-icon sage">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h3>Horodatage</h3>
            <small>Répartition des dossiers</small>
          </div>
          <strong className="insight-total">
            <CountUp value={Math.round(donePct)} />
            <span className="unit"> %</span>
          </strong>
        </header>
        <div
          className="split-bar"
          role="img"
          aria-label={`${done} horodaté${done > 1 ? 's' : ''}, ${waiting} en attente`}
        >
          {proofs.length === 0 ? (
            <span className="split-empty" />
          ) : (
            <>
              {done > 0 && (
                <motion.span
                  className="split done"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${donePct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease }}
                />
              )}
              {waiting > 0 && (
                <motion.span
                  className="split wait"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${100 - donePct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease, delay: 0.15 }}
                />
              )}
            </>
          )}
        </div>
        <ul className="split-legend">
          <li>
            <span className="swatch done" />
            <ShieldCheck size={13} /> Horodatés <strong>{done}</strong>
          </li>
          <li>
            <span className="swatch wait" />
            <Clock3 size={13} /> En attente <strong>{waiting}</strong>
          </li>
        </ul>
      </article>

      <article className="insight-card">
        <header>
          <span className="insight-icon sand">
            <HardDrive size={17} />
          </span>
          <div>
            <h3>Stockage privé</h3>
            <small>
              {(usedBytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo
              sur {limitMb} Mo
            </small>
          </div>
          <strong className="insight-total">
            <CountUp value={usedPct} decimals={usedPct < 10 && usedPct > 0 ? 1 : 0} />
            <span className="unit"> %</span>
          </strong>
        </header>
        <div
          className="storage-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usedPct)}
          aria-label="Stockage utilisé"
        >
          <motion.span
            initial={{ width: 0 }}
            whileInView={{ width: `${Math.max(usedPct, usedBytes ? 1 : 0)}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease }}
          />
        </div>
        <p className="insight-note">
          {usedPct > 85
            ? 'Bientôt plein : exportez ou supprimez d’anciens dossiers.'
            : 'Vos originaux restent sur cette installation.'}
        </p>
      </article>
    </section>
  );
}
