import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { downloadFile } from '../download';
import { listDrafts } from './drafts';
const LegacyDrafts = lazy(() => import('./MobileApp'));

export default function NativeShell({ children }: { children: ReactNode }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    void listDrafts()
      .then((drafts) => setLegacyCount(drafts.length))
      .catch(() => {});
  }, [legacy]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.('a');
      if (!anchor || event.defaultPrevented || event.button !== 0) return;
      const url = new URL(anchor.href, location.href);
      const internal = url.protocol === location.protocol && url.origin === location.origin;
      if (internal && url.pathname.startsWith('/api/')) {
        event.preventDefault();
        setError('');
        setPending(true);
        void downloadFile(url.pathname + url.search, anchor.download || undefined)
          .catch((failure: Error) => setError(failure.message))
          .finally(() => setPending(false));
      } else if (internal && url.pathname !== location.pathname) {
        event.preventDefault();
        history.pushState(null, '', url.pathname + url.search + url.hash);
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.scrollTo(0, 0);
      } else if (Capacitor.isNativePlatform() && url.protocol === 'blob:' && anchor.download) {
        event.preventDefault();
        void downloadFile(url.href, anchor.download).catch((failure: Error) =>
          setError(failure.message),
        );
      }
    };
    document.addEventListener('click', click);
    const back = Capacitor.isNativePlatform()
      ? NativeApp.addListener('backButton', ({ canGoBack }) => {
          if (legacy) return;
          if (!window.dispatchEvent(new Event('preuvix-back', { cancelable: true }))) return;
          if (canGoBack) history.back();
          else void NativeApp.minimizeApp();
        })
      : null;
    return () => {
      document.removeEventListener('click', click);
      void back?.then((handle) => handle.remove());
    };
  }, [legacy]);
  return (
    <>
      {legacyCount > 0 && (
        <aside className="native-drafts">
          <button className="button secondary" onClick={() => setLegacy(!legacy)}>
            {legacy ? 'Revenir à Preuvix' : `Retrouver mes anciens brouillons (${legacyCount})`}
          </button>
        </aside>
      )}
      {legacy ? (
        <Suspense fallback={<p role="status">Chargement des brouillons…</p>}>
          <LegacyDrafts />
        </Suspense>
      ) : (
        children
      )}
      {(pending || error) && (
        <aside className="native-notice" role={error ? 'alert' : 'status'}>
          {error || 'Préparation du téléchargement…'}
          {error && <button onClick={() => setError('')}>Fermer</button>}
        </aside>
      )}
    </>
  );
}
