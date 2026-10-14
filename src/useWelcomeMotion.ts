import { useEffect, type RefObject } from 'react';

export function useWelcomeMotion(
  root: RefObject<HTMLDivElement | null>,
  landing: boolean,
  animated: boolean,
  visible: boolean,
) {
  useEffect(() => {
    const page = root.current;
    if (!page || !landing) return;
    const sections = Array.from(page.querySelectorAll<HTMLElement>('main > section'));
    if (!animated || !('IntersectionObserver' in window)) return;
    const reveal = (section: HTMLElement) => {
      if (section.dataset.reveal === 'pending') {
        section.dataset.reveal = 'visible';
        observer.unobserve(section);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement);
      },
      { threshold: 0, rootMargin: '0px 0px -24px 0px' },
    );
    for (const section of sections) {
      // Above-the-fold content, restored scroll positions and deep links stay visible.
      if (
        section.getBoundingClientRect().top < window.innerHeight ||
        section.contains(document.activeElement)
      )
        continue;
      section.dataset.reveal = 'pending';
      observer.observe(section);
    }
    const revealFocused = (event: FocusEvent) => {
      const section = (event.target as HTMLElement).closest<HTMLElement>('main > section');
      if (section) reveal(section);
    };
    page.addEventListener('focusin', revealFocused);
    return () => {
      observer.disconnect();
      page.removeEventListener('focusin', revealFocused);
      for (const section of sections) delete section.dataset.reveal;
    };
  }, [root, landing, animated]);

  useEffect(() => {
    const page = root.current;
    if (!page || !landing || !visible) return;
    const links = Array.from(
      page.querySelectorAll<HTMLAnchorElement>('.welcome-header nav a[href^="#"]'),
    );
    const targets = links.map((link) => document.getElementById(link.hash.slice(1)));
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const header = page.querySelector('header');
      const threshold = (header?.getBoundingClientRect().height ?? 90) + 80;
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      page.style.setProperty(
        '--reading-progress',
        String(Math.min(1, Math.max(0, window.scrollY / total))),
      );
      page.dataset.scrolled = String(window.scrollY > 24);
      let current = -1;
      targets.forEach((target, index) => {
        if (target && target.getBoundingClientRect().top <= threshold) current = index;
      });
      links.forEach((link, index) => {
        if (index === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(page);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resize?.disconnect();
      links.forEach((link) => link.removeAttribute('aria-current'));
    };
  }, [root, landing, visible]);
}
