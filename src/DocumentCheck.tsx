import { useState } from 'react';
import { motion } from 'motion/react';
import { FileSearch, LoaderCircle, ShieldCheck, ShieldX, Upload } from 'lucide-react';
import { api } from './api';
import { sha256File } from './file-hash';
import { HashReveal, Verdict } from './motion';
import './chain.css';

type DocumentResult =
  | { found: false }
  | {
      found: true;
      documentId: string;
      kind: 'report' | 'export';
      issuedAt: string;
      dossier: string;
      manifestHash: string;
      custodyLength: number;
      signatureValid: boolean;
      dossierIntact: boolean;
      status: string | null;
      timestamped: boolean;
    };
type Match = { kind: string; proofId: string; label: string; at: string };
const kindLabel: Record<string, string> = {
  report: 'Rapport de certification PDF',
  export: 'Export vérifiable ZIP',
  original: 'Original d’un dossier',
  annex: 'Pièce annexe scellée',
};

/** Is this PDF or ZIP exactly a document issued by this installation? Nothing is uploaded. */
export default function DocumentCheck({ owner = false }: { owner?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [sha, setSha] = useState('');
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const check = async (selected?: File) => {
    if (!selected) return;
    setFile(selected);
    setBusy(true);
    setError('');
    setResult(null);
    setMatches([]);
    setSha('');
    try {
      const digest = await sha256File(selected);
      setSha(digest);
      const [document, lookup] = await Promise.all([
        api<DocumentResult>(`/api/documents/${digest}`),
        owner
          ? api<{ matches: Match[] }>(`/api/lookup/${digest}`).catch(() => ({ matches: [] }))
          : Promise.resolve({ matches: [] }),
      ]);
      setResult(document);
      setMatches(lookup.matches.filter((match) => !['report', 'export'].includes(match.kind)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const genuine = result?.found && result.signatureValid;
  return (
    <section className="local-compare document-check" aria-label="Vérifier un document PREUVIX">
      <FileSearch size={28} />
      <h2>Vérifier un document PREUVIX</h2>
      <p>
        Rapport PDF ou export ZIP : chaque document émis est enregistré et signé à son émission. Son
        empreinte est calculée dans votre navigateur ; le fichier n’est pas envoyé.
      </p>
      <label
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void check(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="drop-icon">
          {busy ? <LoaderCircle className="spin" size={22} /> : <Upload size={22} />}
        </span>
        <strong>{dragging ? 'Déposez le document ici' : 'Choisir un rapport ou un export'}</strong>
        <small>PDF ou ZIP émis par PREUVIX{owner ? ', original ou pièce annexe' : ''}</small>
        <input
          type="file"
          aria-label="Document PREUVIX à vérifier"
          onChange={(e) => {
            void check(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {file && <p className="local-filename">{file.name}</p>}
      {sha && (
        <div className="hash-box">
          <span>EMPREINTE DU DOCUMENT</span>
          <HashReveal value={sha} />
        </div>
      )}
      {error && (
        <p className="local-error" role="alert">
          {error}
        </p>
      )}
      {result && !busy && (
        <>
          {result.found ? (
            <Verdict
              match={Boolean(genuine)}
              icon={genuine ? <ShieldCheck size={21} /> : <ShieldX size={21} />}
            >
              <strong>
                {genuine
                  ? `${kindLabel[result.kind]} authentique et non modifié`
                  : 'Enregistrement trouvé, signature invalide'}
              </strong>
              <p>
                Document <strong>{result.documentId}</strong> émis le{' '}
                {new Date(result.issuedAt).toLocaleString('fr-FR')} pour le dossier {result.dossier}
                , au {result.custodyLength}
                <sup>e</sup> événement de son journal.{' '}
                {result.dossierIntact
                  ? 'Le dossier source est toujours conservé et intègre.'
                  : 'Le dossier source n’est plus disponible ou a échoué au contrôle d’intégrité.'}
              </p>
              {result.status && <p>État de certification : {result.status}.</p>}
            </Verdict>
          ) : matches.length ? null : (
            <Verdict match={false} icon={<ShieldX size={21} />}>
              <strong>Document inconnu de cette installation</strong>
              <p>
                Aucun document émis ne porte exactement cette empreinte. Un rapport retouché,
                réenregistré ou imprimé puis numérisé n’est plus reconnu : demandez l’original émis
                ou l’export ZIP.
              </p>
            </Verdict>
          )}
          {matches.length > 0 && (
            <motion.ul className="lookup-matches" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {matches.map((match) => (
                <li key={`${match.kind}-${match.proofId}-${match.label}`}>
                  <ShieldCheck size={16} />
                  <span>
                    <strong>{kindLabel[match.kind] ?? match.kind}</strong> · {match.label} ·{' '}
                    {new Date(match.at).toLocaleString('fr-FR')}
                  </span>
                </li>
              ))}
            </motion.ul>
          )}
        </>
      )}
      <p className="local-limit">
        Cette vérification établit que le fichier est identique à un document émis et signé par
        cette installation. Elle ne remplace pas la vérification de la clé de l’exploitant ni celle
        du jeton d’horodatage.
      </p>
    </section>
  );
}
