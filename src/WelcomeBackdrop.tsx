import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';

export default function WelcomeBackdrop({
  theme,
  loading = false,
  children,
}: {
  theme: string;
  loading?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointer = useRef({ x: 65, y: 35 });
  const [visible, setVisible] = useState(() => !document.hidden);
  const [motion, setMotion] = useState(() => {
    try {
      return localStorage.getItem('preuvix-motion') !== 'off';
    } catch {
      return true;
    }
  });
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  const animated = motion && !reduced;
  return (
    <div
      ref={root}
      className={`welcome ambient-welcome ${loading ? 'justice-loading' : ''}`}
      data-theme={theme}
      data-motion={animated ? 'on' : 'off'}
      data-visible={visible}
      onPointerMove={(event) => {
        if (!animated || !visible || event.pointerType !== 'mouse') return;
        pointer.current = {
          x: Math.round((event.clientX / window.innerWidth) * 100),
          y: Math.round((event.clientY / window.innerHeight) * 100),
        };
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          root.current?.style.setProperty('--pointer-x', `${pointer.current.x}%`);
          root.current?.style.setProperty('--pointer-y', `${pointer.current.y}%`);
          frame.current = null;
        });
      }}
    >
      <div className="ambient-canvas" aria-hidden="true">
        <div className="ambient-glow glow-one" />
        <div className="ambient-glow glow-two" />
        <div className="ambient-pointer" />
        <div className="ambient-grid" />
      </div>
      {children}
      <button
        className="motion-control"
        aria-pressed={animated}
        disabled={reduced}
        onClick={() => {
          setMotion(!motion);
          try {
            localStorage.setItem('preuvix-motion', motion ? 'off' : 'on');
          } catch {
            /* In-memory preference still works. */
          }
        }}
      >
        {animated ? <Pause size={13} /> : <Play size={13} />}
        {reduced ? 'Mouvement réduit' : animated ? 'Animation : activée' : 'Animation : arrêtée'}
      </button>
    </div>
  );
}
