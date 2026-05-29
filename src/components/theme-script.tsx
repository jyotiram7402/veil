// Inlined in <head> so it runs before paint and the page never flashes
// the wrong colors. Reads localStorage (and system preference) and stamps
// the right class on <html>.
const SCRIPT = `(function() {
  try {
    var stored = localStorage.getItem('veil-theme');
    var theme = stored;
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.classList.toggle('light', theme === 'light');
    html.style.colorScheme = theme;
  } catch (e) {}
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
