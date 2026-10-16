import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, FileCheck2 } from 'lucide-react';

export default function ProofDownloads({ proofId }: { proofId: string }) {
  const [pending, setPending] = useState<'report' | 'export' | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function download(kind: 'report' | 'export') {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(kind);
    setError('');
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`/api/proofs/${proofId}/${kind}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          response.status === 401
            ? 'Reconnectez-vous avant de télécharger.'
            : body?.error || 'Export indisponible. Réessayez.',
        );
      }
      const expected = kind === 'report' ? 'application/pdf' : 'application/zip';
      if (!response.headers.get('content-type')?.includes(expected))
        throw new Error('Le serveur n’a pas retourné le document attendu. Réessayez.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `preuvix-${proofId}.${kind === 'report' ? 'pdf' : 'zip'}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Le téléchargement a été interrompu. Réessayez.'
          : (e as Error).message,
      );
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      setPending(null);
    }
  }
  return (
    <section aria-label="Téléchargements de la preuve">
      <div className="detail-downloads" aria-busy={!!pending}>
        <button
          className="button primary"
          disabled={!!pending}
          onClick={() => void download('export')}
        >
          <ArrowDownToLine size={17} /> Dossier complet (.zip)
        </button>
        <button
          className="button secondary"
          disabled={!!pending}
          onClick={() => void download('report')}
        >
          <FileCheck2 size={17} /> Rapport PDF
        </button>
      </div>
      <p className="download-status" role="status">
        {pending
          ? `Préparation ${pending === 'report' ? 'du PDF' : 'du dossier'}… Vous pouvez continuer à consulter la preuve.`
          : ''}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
