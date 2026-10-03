import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline/instant-open is a nice-to-have; a failed registration
      // should never block the app itself.
    });
  });
}
