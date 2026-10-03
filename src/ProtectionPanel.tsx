import { useState } from 'react';
import { ArrowDownToLine, LoaderCircle, ScanSearch, ShieldCheck, Upload } from 'lucide-react';
import type { Proof } from '../shared/types';
import { shortId } from '../shared/format';
import { api } from './api';
import './protection.css';

type CheckResult =
  | { found: false }
  | {
      found: true;
      proof: { id: string; title: string; receivedAt: string };
      similarity: { overall: number; worstZone: number };
      verdict: 'no_visible_change' | 'modified';
    };

export default function ProtectionPanel({
  proof,
  onChange,
}: {
  proof: Proof;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'copy' | 'check' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const photo = proof.manifest.file.mime.startsWith('image/');

  async function download() {
    setBusy('copy');
    setError('');
    try {
      const response = await fetch(`/api/proofs/${proof.id}/protected-copy`);
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `preuvix-copie-protegee-${shortId(proof.id)}.jpg`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      await onChange();
    } catch (e) {
      setError((e as Error).message || 'Copie protégée indisponible.');
    } finally {
      setBusy(null);
    }
  }
  async function check(file: File | undefined) {
    if (!file) return;
    setBusy('check');
    setError('');
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      setResult(await api<CheckResult>('/api/watermark/check', { method: 'POST', body }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="detail-section protection-panel" aria-label="Protection contre l’IA">
      <h3>
        <ShieldCheck size={17} /> Protection contre les détournements par l’IA
      </h3>
      <p>
        Partagez une <strong>copie protégée</strong> plutôt que l’original. Elle porte un filigrane
        invisible (TrustMark, open source) qui résiste à la recompression, au redimensionnement et
        au recadrage, et renvoie à ce dossier. Si une version retouchée ou générée à partir de votre
        photo circule, vous pourrez prouver son origine et repérer les zones modifiées.
      </p>
      {photo ? (
        <>
          <button className="button secondary small" disabled={!!busy} onClick={download}>
            {busy === 'copy' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ArrowDownToLine size={15} />
            )}{' '}
            {busy === 'copy' ? 'Filigrane en cours…' : 'Télécharger la copie protégée'}
          </button>
          <p className="muted">
            {proof.watermarked
              ? 'Une copie protégée a déjà été émise pour ce dossier ; chaque téléchargement porte le même filigrane.'
              : 'Au premier usage, le module télécharge ses modèles (65 Mo) : cela peut prendre une minute.'}{' '}
            La copie est réencodée sans métadonnées (GPS, appareil) ; l’original reste la preuve
            intacte.
          </p>
        </>
      ) : (
        <p className="muted">Le filigrane est disponible pour les photos ; pas pour les vidéos.</p>
      )}
      <div className="copy-check">
        <strong>
          <ScanSearch size={16} /> Vérifier une copie en circulation
        </strong>
        <p>Retrouvez le dossier d’origine d’une image et détectez les retouches.</p>
        <label className="button secondary small file-button">
          {busy === 'check' ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{' '}
          Choisir une image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!!busy}
            aria-label="Image à vérifier"
            onChange={(e) => {
              void check(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {result && (
          <div
            className={`copy-result ${result.found && result.verdict === 'no_visible_change' ? 'ok' : 'warn'}`}
            role="status"
          >
            {result.found ? (
              <>
                <strong>
                  Filigrane Preuvix trouvé : {shortId(result.proof.id)} · {result.proof.title}
                </strong>
                <span>
                  {result.verdict === 'no_visible_change'
                    ? 'Aucune retouche visible détectée par rapport à l’original.'
                    : 'Image modifiée par rapport à l’original (retouche, recadrage ou changement de couleurs).'}{' '}
                  Similarité globale {result.similarity.overall} % · zone la plus modifiée{' '}
                  {result.similarity.worstZone} %.
                </span>
                <small>
                  Comparaison indicative à faible résolution : une retouche très fine peut passer
                  inaperçue. L’original du dossier fait foi.
                </small>
              </>
            ) : (
              <>
                <strong>Aucun filigrane Preuvix reconnu</strong>
                <span>
                  L’image ne provient pas d’une copie protégée de cette installation, ou elle a été
                  trop fortement transformée.
                </span>
              </>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="protection-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
