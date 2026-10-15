import { useEffect, useRef, type ReactNode } from 'react';
import { LoaderCircle, Info, X } from 'lucide-react';
export const date = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));
export const size = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

export function Spinner() {
  return <LoaderCircle size={18} className="spin" aria-label="Chargement" />;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`notice ${danger ? 'danger' : ''}`} role={danger ? 'alert' : 'status'}>
      <Info size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? 'wide' : ''}`}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Fermer">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
