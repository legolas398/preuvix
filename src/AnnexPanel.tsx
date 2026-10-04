import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownToLine,
  CircleCheck,
  CircleX,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
} from 'lucide-react';
import type { Proof } from '../shared/types';
import { api } from './api';
import { sha256File } from './file-hash';
import './chain.css';

export const ANNEX_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,text/plain,.eml,.csv,.txt';
const kb = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
    : `${Math.ceil(bytes / 1024)} Ko`;

/** Seals one supporting document: hashed here, re-hashed and signed by the server. */
export async function sealAnnex(proofId: string, file: File, note: string, sha256?: string) {
  const body = new FormData();
  body.append('clientSha256', sha256 ?? (await sha256File(file)));
  body.append('note', note);
  body.append('requestKey', crypto.randomUUID());
  body.append('file', file);
  return api<Proof>(`/api/proofs/${proofId}/annexes`, { method: 'POST', body });
}

export default function AnnexPanel({
  proof,
  downloadBase,
  onChange,
}: {
  proof: Proof;
  downloadBase: string;
  onChange?: (proof: Proof) => void | Promise<void>;
}) {
  const annexes = proof.annexes ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [sha, setSha] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const choose = async (selected?: File) => {
    if (!selected) return;
    setError('');
    setSha('');
    if (selected.size > 10 * 1024 * 1024) {
      setError('Une pièce annexe ne peut pas dépasser 10 Mo.');
      return;
    }
    setFile(selected);
    try {
      setSha(await sha256File(selected));
    } catch {
      setError('Empreinte indisponible : utilisez un navigateur récent en HTTPS.');
    }
  };
  const submit = async () => {
    if (!file || !sha) return;
    setBusy(true);
    setError('');
    try {
      await onChange?.(await sealAnnex(proof.id, file, note, sha));
      setFile(null);
      setSha('');
      setNote('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="annexes" aria-label="Pièces annexes">
      <h3>
        <Paperclip size={17} /> Pièces annexes <span className="annex-count">{annexes.length}</span>
      </h3>
      <p>
        Factures, contrats, courriers, échanges… Chaque pièce est scellée : empreinte recalculée par
        le serveur, déclaration signée liée à ce dossier, ajout définitif et inscrit au journal. Une
        pièce ne peut être ni remplacée ni retirée.
      </p>
      {annexes.length > 0 && (
        <ol className="annex-list">
          {annexes.map((annex) => {
            const ok = annex.signatureValid && annex.contentMatches;
            return (
              <motion.li
                key={annex.annexId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="annex-seq">A{annex.seq}</span>
                <div>
                  <strong>{annex.name}</strong>
                  <small>
                    {annex.mime} · {kb(annex.size)} · scellée le{' '}
                    {new Date(annex.addedAt).toLocaleString('fr-FR')}
                  </small>
                  {annex.note && <small className="annex-note">{annex.note}</small>}
                  <code>{annex.sha256}</code>
                </div>
                <span className={`annex-state ${ok ? 'ok' : 'bad'}`}>
                  {ok ? <CircleCheck size={15} /> : <CircleX size={15} />}
                  {ok ? 'Intègre' : 'Altérée'}
                </span>
                <a
                  className="icon-button"
                  href={`${downloadBase}/${annex.annexId}`}
                  aria-label={`Télécharger ${annex.name}`}
                >
                  <ArrowDownToLine size={16} />
                </a>
              </motion.li>
            );
          })}
        </ol>
      )}
      {onChange && (
        <div className="annex-add">
          {!file ? (
            <button
              type="button"
              className="button secondary small"
              onClick={() => input.current?.click()}
            >
              <Plus size={15} /> Ajouter une pièce
            </button>
          ) : (
            <div className="annex-draft">
              <FileText size={18} />
              <div>
                <strong>{file.name}</strong>
                <small>
                  {kb(file.size)} ·{' '}
                  {sha ? (
                    <>
                      SHA-256 <code>{sha.slice(0, 16)}…</code>
                    </>
                  ) : (
                    'calcul de l’empreinte…'
                  )}
                </small>
              </div>
              <label htmlFor="annex-note" className="sr-only">
                Note sur la pièce
              </label>
              <input
                id="annex-note"
                maxLength={500}
                value={note}
                placeholder="Note facultative (ex. facture du plombier)"
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    setSha('');
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="button primary small"
                  disabled={!sha || busy}
                  onClick={submit}
                >
                  {busy ? <LoaderCircle className="spin" size={15} /> : <Paperclip size={15} />}{' '}
                  Sceller la pièce
                </button>
              </div>
            </div>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept={ANNEX_ACCEPT}
            aria-label="Choisir une pièce annexe"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <small>PDF, JPEG, PNG, WebP ou texte (TXT, EML, CSV) · 10 Mo · 30 pièces maximum.</small>
        </div>
      )}
      {error && (
        <p className="annex-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
