const SCRIPT = `(function() {
  try {
    var stored = localStorage.getItem('blackfoxx-theme');
    var theme = stored;
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.classList.toggle('light', theme === 'light');
    html.style.colorScheme = theme;
    if (localStorage.getItem('blackfoxx-accent') === 'yellow') html.setAttribute('data-accent', 'yellow');
  } catch (e) {}
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
