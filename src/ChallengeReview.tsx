import { useState } from 'react';
import type { Proof } from '../shared/types';
import { reviewOutcomes, type ChallengeReview as Review } from '../shared/capture';
import './capture.css';

const outcomeLabels: Record<Review['outcome'], string> = {
  confirmed: 'Défi visible et conforme',
  absent: 'Défi absent ou non conforme',
  unclear: 'Illisible ou incertain',
};

export default function ChallengeReview({
  proof,
  busy,
  submit,
}: {
  proof: Proof;
  busy: boolean;
  submit: (input: { outcome: Review['outcome']; reviewer: string; note: string }) => void;
}) {
  const [outcome, setOutcome] = useState<Review['outcome']>('confirmed');
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const capture = proof.manifest.capture;
  if (!capture?.challenge) return null;
  const { challenge } = capture;
  return (
    <section aria-label="Défi en direct">
      <h3>Défi en direct</h3>
      <p>
        Le média doit montrer le code <code>{challenge.code}</code> écrit à la main et le geste «{' '}
        {challenge.gesture.replace(/^Montrez /, '')} ». Défi émis par le serveur{' '}
        {capture.elapsedSeconds ?? '?'} s avant l’engagement de l’empreinte (limite{' '}
        {challenge.maxSeconds} s).
      </p>
      {proof.reviews && proof.reviews.length > 0 && (
        <ul>
          {proof.reviews.map(({ review, signature }) => (
            <li key={signature}>
              <strong>{outcomeLabels[review.outcome]}</strong> —{' '}
              {new Date(review.reviewedAt).toLocaleString('fr-FR')}, par {review.reviewer} (nom
              déclaré){review.note && ` · ${review.note}`}. Vérification signée.
            </li>
          ))}
        </ul>
      )}
      <form
        className="challenge-review"
        onSubmit={(event) => {
          event.preventDefault();
          submit({ outcome, reviewer, note });
        }}
      >
        <fieldset disabled={busy}>
          <legend>Enregistrer une vérification visuelle</legend>
          {reviewOutcomes.map((value) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="outcome"
                checked={outcome === value}
                onChange={() => setOutcome(value)}
              />{' '}
              {outcomeLabels[value]}
            </label>
          ))}
          <label>
            Vérificateur
            <input
              value={reviewer}
              minLength={2}
              maxLength={120}
              required
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label>
            Note (facultatif)
            <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="button secondary small" type="submit">
            Signer la vérification
          </button>
        </fieldset>
        <p className="muted">
          Chaque vérification est ajoutée au dossier, signée séparément et ne modifie pas le
          manifeste. Une vérification par un tiers indépendant a plus de poids que celle du
          déposant.
        </p>
      </form>
    </section>
  );
}
