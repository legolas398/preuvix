// Shared motion primitives. MotionConfig reducedMotion="user" (set in main.tsx)
// turns transforms off for visitors who ask the system for less motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

/** Fades and lifts its content the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      variants={fadeUp}
      transition={{ delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Container whose StaggerItem children reveal one after another. */
export function Stagger({
  children,
  gap = 0.07,
  inView = true,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; gap?: number; inView?: boolean }) {
  const variants: Variants = { hidden: {}, show: { transition: { staggerChildren: gap } } };
  return (
    <motion.div
      initial="hidden"
      {...(inView
        ? { whileInView: 'show', viewport: { once: true, margin: '0px 0px -10% 0px' } }
        : { animate: 'show' })}
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return (
    <motion.div variants={fadeUp} {...props}>
      {children}
    </motion.div>
  );
}

/** Counts up to `value` once visible. Renders the final value for reduced motion. */
export function CountUp({
  value,
  pad = 0,
  decimals = 0,
  duration = 1.1,
}: {
  value: number;
  pad?: number;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease,
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, reduced, duration]);
  const text = shown.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref} aria-label={value.toLocaleString('fr-FR')}>
      {pad ? text.padStart(pad, '0') : text}
    </span>
  );
}

const HEX = '0123456789abcdef';
/** Shows a hash "settling" from random hex into its real value, left to right. */
export function HashReveal({ value }: { value: string }) {
  const reduced = useReducedMotion();
  const [text, setText] = useState(reduced ? value : '');
  useEffect(() => {
    if (reduced) {
      setText(value);
      return;
    }
    let frame = 0;
    const total = 28;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor((frame / total) * value.length);
      setText(
        value
          .split('')
          .map((c, i) => (i < settled ? c : HEX[Math.floor(Math.random() * 16)]))
          .join(''),
      );
      if (frame >= total) {
        window.clearInterval(id);
        setText(value);
      }
    }, 28);
    return () => window.clearInterval(id);
  }, [value, reduced]);
  return (
    <code aria-label={value}>
      <span aria-hidden="true">{text}</span>
    </code>
  );
}

/** Animated verdict card for byte comparisons (match / mismatch). */
export function Verdict({
  match,
  icon,
  children,
}: {
  match: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`comparison ${match ? 'match' : 'mismatch'}`}
      role="status"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={
        match
          ? { opacity: 1, scale: 1, y: 0 }
          : { opacity: 1, scale: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }
      }
      transition={{ duration: 0.5, ease }}
    >
      <motion.span
        className="verdict-icon"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.12 }}
      >
        {icon}
      </motion.span>
      <div>{children}</div>
    </motion.div>
  );
}

export type TimelineStep = { label: string; detail?: string; state: 'done' | 'wait' | 'alert' };
/** Vertical chronology whose rail draws itself as it scrolls into view. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Stagger className="proof-timeline" gap={0.12}>
      <motion.span
        className="timeline-rail"
        aria-hidden="true"
        variants={{
          hidden: { scaleY: 0 },
          show: { scaleY: 1, transition: { duration: 0.9, ease } },
        }}
      />
      <ol>
        {steps.map((step) => (
          <motion.li key={step.label} className={step.state} variants={fadeUp}>
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <strong>{step.label}</strong>
              {step.detail && <small>{step.detail}</small>}
            </div>
          </motion.li>
        ))}
      </ol>
    </Stagger>
  );
}
