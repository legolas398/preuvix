import { useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { api } from './api';
import { sha256File } from './file-hash';
import { MAX_PHOTO_BYTES } from '../shared/photo-format';
import type { verifyPhoto } from '../server/photo-verification';
import type { Attestation } from '../shared/capture';

type Result = Awaited<ReturnType<typeof verifyPhoto>>;
type Response = { result: Result; manifest: object; attestation: Attestation };
export default function PhotoVerification({
  references = [],
}: {
  references?: { title: string; sha256: string }[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [response, setResponse] = useState<Response | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  async function run() {
    setError('');
    setResponse(null);
    try {
      if (!file || !file.size || file.size > MAX_PHOTO_BYTES)
        throw new Error('Sélectionnez un JPEG, PNG ou WebP de 10 Mio maximum.');
      if (reference && !/^[a-fA-F0-9]{64}$/.test(reference.trim()))
        throw new Error('Référence SHA-256 invalide.');
      setProgress('1/2 — Empreinte SHA-256 dans le navigateur');
      const digest = await sha256File(file);
      const body = new FormData();
      body.append('file', file);
      body.append('reference', reference.trim());
      body.append('clientSha256', digest);
      setProgress('2/2 — Contrôles sur le backend local');
      setResponse(
        await api<Response>('/api/photo-verification', {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(90_000),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress('');
    }
  }
  function download() {
    if (!response) return;
    const { manifest, attestation } = response;
    const report = `${response.result.title}\n\n${JSON.stringify(manifest, null, 2)}\n\nLa signature couvre manifest.json, pas ce texte. Aucun horodatage indépendant. La clé jointe ne prouve pas l’identité PREUVIX.\n`;
    const archive = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'attestation.json': strToU8(JSON.stringify(attestation)),
      'manifest.sig': Uint8Array.from(atob(attestation.signature), (c) => c.charCodeAt(0)),
      'signer-public.pem': strToU8(attestation.publicKey),
      'rapport.txt': strToU8(report),
      'LIRE-MOI.txt': strToU8(
        'Original exclu pour confidentialité. Vérifier avec scripts/verify-photo-report.mjs : node scripts/verify-photo-report.mjs dossier-extrait original-photo [cle-publique-obtenue-independamment.pem]. Les octets de manifest.json doivent rester inchangés.',
      ),
    });
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(archive).buffer], { type: 'application/zip' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport-verification.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const r = response?.result;
  return (
    <section className="local-compare" aria-label="Vérifier une photo">
      <h1>Vérifier une photo</h1>
      <p>JPEG, PNG ou WebP non animé · 10 Mio · 40 mégapixels maximum.</p>
      <p>
        La sélection reste dans le navigateur. « Vérifier » transmet les octets originaux au backend
        local privé, en mémoire, sans service tiers et sans conservation. Aucun aperçu transformé
        n’est utilisé.
      </p>
      <label>
        Photo originale{' '}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!!progress}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResponse(null);
            setError('');
          }}
        />
      </label>
      <label>
        Référence SHA-256 existante (facultative)
        <input
          value={reference}
          disabled={!!progress}
          onChange={(e) => {
            setReference(e.target.value);
            setResponse(null);
          }}
          placeholder="64 caractères hexadécimaux"
        />
      </label>
      {references.length > 0 && (
        <label>
          Référence d’un dossier existant
          <select
            disabled={!!progress}
            value={references.some((r) => r.sha256 === reference) ? reference : ''}
            onChange={(e) => {
              setReference(e.target.value);
              setResponse(null);
            }}
          >
            <option value="">Choisir un dossier</option>
            {references.map((r, i) => (
              <option key={i} value={r.sha256}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="button primary" disabled={!file || !!progress} onClick={run}>
        {error ? 'Réessayer' : 'Vérifier'}
      </button>
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      {r && (
        <div aria-live="polite">
          <p>Contrôles terminés. Les états non vérifiés restent explicitement indiqués.</p>
          <section>
            <h2>Intégrité</h2>
            <p>{r.integrity.result}</p>
            <code style={{ overflowWrap: 'anywhere' }}>{r.file.sha256}</code>
            <p>
              Une différence indique un contenu différent, pas une fraude. La confiance dans la
              référence doit être établie séparément.
            </p>
          </section>
          <section>
            <h2>Provenance</h2>
            <p>
              Manifeste : {r.provenance.presence} · Liaison au fichier : {r.provenance.binding} ·
              Signature : {r.provenance.signature} · Confiance : {r.provenance.trust}
            </p>
            {r.provenance.error && <p role="alert">{r.provenance.error}</p>}
          </section>
          <section>
            <h2>Informations relatives à l’IA</h2>
            <p>{r.ai.conclusion}</p>
            {r.ai.declarations.map((d, i) => (
              <p key={i}>
                {d.digitalSourceType} — {d.action} — source {d.source} — {d.validation}
              </p>
            ))}
          </section>
          <section>
            <h2>Dates et contexte</h2>
            <p>
              {r.context.clock}. Métadonnées : {r.context.metadataState}.
            </p>
            <p>Logiciel déclaré : {String(r.context.software ?? 'absent')}</p>
            <p>Dates déclarées : {JSON.stringify(r.context.dates)}</p>
            <p>EXIF : {JSON.stringify(r.context.exif)}</p>
          </section>
          <details>
            <summary>Détails techniques et limites</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(r, null, 2)}
            </pre>
          </details>
          <p>
            Export signé Ed25519 : original et métadonnées déclarées exclus. La clé jointe ne suffit
            pas à reconnaître PREUVIX.
          </p>
          <button className="button secondary" onClick={download}>
            Exporter le rapport de vérification
          </button>
        </div>
      )}
    </section>
  );
}
