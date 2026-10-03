import { useEffect, useId, useState } from 'react';
import { CheckCheck, Fingerprint, LoaderCircle, Upload, X } from 'lucide-react';
import { sha256File } from './file-hash';

export default function LocalFileCheck({ expectedHash }: { expectedHash?: string }) {
  const id = useId();
  const [expected, setExpected] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [calculated, setCalculated] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = (expectedHash ?? expected).trim().toLowerCase();
  const validTarget = /^[a-f0-9]{64}$/.test(target);
  useEffect(() => {
    let cancelled = false;
    setCalculated('');
    setError('');
    if (!file) {
      setBusy(false);
      return;
    }
    setBusy(true);
    sha256File(file)
      .then((value) => {
        if (!cancelled) setCalculated(value);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  const matches = validTarget && calculated === target;
  return (
    <section className="local-compare" aria-label="Comparaison SHA-256 locale">
      <Fingerprint size={28} />
      <h2>Vérifier une copie, en privé</h2>
      <p>
        Le calcul reste dans votre navigateur. Aucun fichier n’est envoyé et aucun lien de partage
        n’est nécessaire.
      </p>
      {!expectedHash && (
        <div className="hash-input">
          <label htmlFor={id}>
            Empreinte SHA-256 attendue <small>facultatif</small>
          </label>
          <input
            id={id}
            value={expected}
            maxLength={80}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setExpected(e.target.value)}
            placeholder="Les 64 caractères du rapport ou de manifest.json"
          />
          {target && !validTarget && (
            <p role="alert">
              Une empreinte SHA-256 contient exactement 64 caractères hexadécimaux (0–9, a–f).
            </p>
          )}
        </div>
      )}
      <label className="button secondary file-button">
        {busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />} Choisir une
        copie à vérifier
        <input
          type="file"
          aria-label="Copie à vérifier en privé"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setCalculated('');
              setFile(e.target.files[0]);
            }
            e.target.value = '';
          }}
        />
      </label>
      {file && <p className="local-filename">{file.name}</p>}
      {error && (
        <p className="local-error" role="alert">
          {error}
        </p>
      )}
      {calculated && !busy && (
        <>
          <div className="hash-box">
            <span>EMPREINTE CALCULÉE SUR VOTRE COPIE</span>
            <code>{calculated}</code>
          </div>
          {validTarget ? (
            <div className={`comparison ${matches ? 'match' : 'mismatch'}`} role="status">
              {matches ? <CheckCheck size={21} /> : <X size={21} />}
              <div>
                <strong>
                  {matches ? 'Correspondance exacte des octets' : 'Le fichier est différent'}
                </strong>
                <p>
                  {matches
                    ? 'Cette copie correspond à l’empreinte attendue. Cela ne prouve ni la date de capture ni la réalité de la scène.'
                    : 'Une modification, une compression ou un autre fichier peuvent expliquer cette différence.'}
                </p>
              </div>
            </div>
          ) : (
            <p>
              Empreinte calculée. Ajoutez une empreinte de référence pour comparer les fichiers.
            </p>
          )}
        </>
      )}
      <p className="local-limit">
        Cette comparaison ne vérifie pas le jeton d’horodatage. Utilisez une référence de confiance
        : un fichier et une empreinte remplacés ensemble peuvent toujours correspondre.
      </p>
    </section>
  );
}
