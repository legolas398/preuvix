import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

export const themes = ['Orange', 'Aurore', 'Minuit', 'Système'] as const;
export type Theme = (typeof themes)[number];
type Appearance = {
  theme: Theme;
  resolvedTheme: Exclude<Theme, 'Système'>;
  select: (theme: Theme) => void;
};
const ThemeContext = createContext<Appearance | null>(null);

function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem('preuvix-theme');
    return themes.find((theme) => theme === saved) ?? 'Orange';
  } catch {
    return 'Orange';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = theme === 'Système' ? (dark ? 'Minuit' : 'Orange') : theme;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setDark(media.matches);
    const sync = (event: StorageEvent) => {
      if (event.key === 'preuvix-theme' || event.key === null) setTheme(savedTheme());
    };
    media.addEventListener('change', change);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', change);
      window.removeEventListener('storage', sync);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === 'Minuit' ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        resolvedTheme === 'Minuit' ? '#101e26' : resolvedTheme === 'Aurore' ? '#faf2ff' : '#fff5eb',
      );
  }, [resolvedTheme]);
  function select(value: Theme) {
    setTheme(value);
    try {
      localStorage.setItem('preuvix-theme', value);
    } catch {
      /* Session-only preference. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, select }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const appearance = useContext(ThemeContext);
  if (!appearance) throw new Error('ThemeProvider is required');
  return appearance;
}

export function ThemePicker() {
  const { theme, select } = useTheme();
  return (
    <div className="theme-picker" role="group" aria-label="Thème visuel">
      {themes.map((value, index) => (
        <button
          type="button"
          key={value}
          aria-pressed={theme === value}
          onClick={() => select(value)}
          title={
            value === 'Système'
              ? 'Suit le thème clair ou sombre de votre appareil'
              : `Thème ${value}`
          }
        >
          <span className={`theme-dot theme-dot-${index}`} aria-hidden="true" />
          {value}
        </button>
      ))}
    </div>
  );
}

export function PageAppearance() {
  return (
    <div className="page-appearance">
      <span>Votre ambiance</span>
      <ThemePicker />
    </div>
  );
}
