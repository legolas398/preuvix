// Runs before the app and styles to avoid a light flash for returning dark-theme users.
(() => {
  let theme = 'Orange';
  try {
    const saved = localStorage.getItem('preuvix-theme');
    if (['Orange', 'Aurore', 'Minuit', 'Système'].includes(saved)) theme = saved;
  } catch {
    /* Storage is optional. */
  }
  if (theme === 'Système')
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'Minuit' : 'Orange';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'Minuit' ? 'dark' : 'light';
})();
