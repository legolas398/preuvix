import { serviceLabels, serviceStateLabel, type CaseDetail } from '../shared/cases';
import './certification.css';
const utc = (value: string) =>
  new Date(value).toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' UTC';
export default function ServiceEvidence({ dossier }: { dossier: CaseDetail }) {
  return (
    <>
      <p className="certification-scope">
        Justificatifs de la version {dossier.manifest.version} · {dossier.manifest.files.length}{' '}
        pièce(s).
        {dossier.manifest.version < dossier.latestVersion &&
          ' Vous consultez une version historique.'}{' '}
        Chaque nouvelle version nécessite ses propres justificatifs.
      </p>
      {!dossier.manifest.files.length && <p>Ajoutez une pièce pour demander une certification.</p>}
      {(['timestamp', 'anchor', 'signature'] as const).map((kind) => {
        const op = dossier.operations.find((op) => op.kind === kind),
          result = op?.result;
        return (
          <article className="case-service" key={kind}>
            <h3>{serviceLabels[kind]}</h3>
            <strong>{serviceStateLabel(kind, op?.state, dossier.services[kind].configured)}</strong>
            {result?.provider && <p>Prestataire : {result.provider}</p>}
            {result?.otsProofBase64 && (
              <p>
                Bitcoin · preuve OpenTimestamps gratuite.
                {result.blockHeight
                  ? ` Bloc ${result.blockHeight} · ${result.confirmations} confirmations.`
                  : ' En attente de confirmation Bitcoin (plusieurs heures possibles).'}
                {result.verifiedAt && ` Dernier contrôle : ${utc(result.verifiedAt)}.`} Vérification
                de la preuve de Merkle avec deux explorateurs publics ; seuil de 6 confirmations.
              </p>
            )}
            {result?.transactionId && (
              <p>
                Réseau : {result.network}
                <br />
                Transaction : <code>{result.transactionId}</code>
                <br />
                Confirmations annoncées : {result.confirmations}
              </p>
            )}
            {result?.timestamp && (
              <p>
                Jeton RFC 3161 disponible · {utc(result.timestamp.time)}
                <br />
                Qualification :{' '}
                {result.timestamp.qualification === 'operator_reviewed'
                  ? 'examinée par l’exploitant, non validée automatiquement'
                  : 'non évaluée'}
              </p>
            )}
            {result?.reportedLevel && (
              <p>
                Niveau annoncé par le prestataire : {result.reportedLevel}. Qualification eIDAS non
                vérifiée par PREUVIX.
              </p>
            )}
            {result?.evidenceReference && <p>Justificatif : {result.evidenceReference}</p>}
            {op?.error && <p className="case-error">{op.error}</p>}
            {op && (
              <p className="case-muted">
                {op.attempts} tentative(s) · mise à jour {utc(op.updatedAt)}
              </p>
            )}
          </article>
        );
      })}
    </>
  );
}
