import { useState } from 'react';
import { locationDescription, type Attestation, type CaptureRecord } from '../shared/capture';

export function CaptureLocation({ capture }: { capture?: CaptureRecord }) {
  return (
    <section className="capture-evidence" aria-label="Localisation de la capture">
      <h3>Localisation de la prise de vue</h3>
      <p>
        <strong>{capture?.kind === 'video' ? 'Début : ' : 'Position : '}</strong>
        {locationDescription(capture?.location?.start)}
      </p>
      {capture?.kind === 'video' && (
        <p>
          <strong>Fin : </strong>
          {locationDescription(capture.location?.end)}
        </p>
      )}
      <p>
        Les relevés enregistrés font partie du manifeste signé. Ils proviennent du navigateur : ni
        le GPS ni le lieu réel de la scène ne sont authentifiés. Un relevé début/fin ne constitue
        pas un suivi du trajet.
      </p>
    </section>
  );
}

export function SignatureControl({ attestation }: { attestation?: Attestation }) {
  const [expected, setExpected] = useState('');
  const normalized = expected.replace(/\s/g, '').toLowerCase();
  if (!attestation) return null;
  return (
    <section className="capture-evidence" aria-label="Contrôle de la clé de signature">
      <h3>Contrôler la clé de signature</h3>
      <p>Empreinte SHA-256 de la clé publique ayant signé ce dossier :</p>
      <code style={{ overflowWrap: 'anywhere' }}>{attestation.keyId}</code>
      <label style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        Empreinte de clé obtenue par un canal de confiance
        <input
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          maxLength={128}
          spellCheck={false}
          autoComplete="off"
          placeholder="64 caractères hexadécimaux"
        />
      </label>
      {normalized && (
        <p role="status">
          {!/^[a-f0-9]{64}$/.test(normalized)
            ? 'Saisissez une empreinte SHA-256 complète (64 caractères).'
            : normalized === attestation.keyId
              ? 'Correspondance : la clé du dossier est celle de votre référence.'
              : 'Attention : cette empreinte ne correspond pas à la clé du dossier.'}
        </p>
      )}
      <p>
        La signature est contrôlée par le serveur à la lecture du dossier. La comparaison ci-dessus
        ne prouve l’identité du signataire que si votre référence provient d’un canal indépendant.
        Le ZIP contient la clé publique et la signature pour une vérification hors ligne.
      </p>
    </section>
  );
}
