const STORAGE_KEY = 'reminder_theme';
const html = document.documentElement;
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const LIGHT_COLOR = '#1f6b5c';
const DARK_COLOR = '#100E0C';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, persist = true) {
  html.dataset.theme = theme;
  if (persist) localStorage.setItem(STORAGE_KEY, theme);
  if (themeColorMeta) themeColorMeta.content = theme === 'dark' ? DARK_COLOR : LIGHT_COLOR;
}

function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  let theme;

  if (stored === 'light' || stored === 'dark') {
    theme = stored;
  } else {
    theme = getSystemTheme();
  }

  applyTheme(theme, stored === 'light' || stored === 'dark');

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(event.matches ? 'dark' : 'light', false);
    }
  };
  media.addEventListener('change', handler);

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }
}

export { applyTheme, initTheme };

initTheme();
