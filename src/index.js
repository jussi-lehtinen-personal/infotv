import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/material-symbols-rounded/full.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Remove the branded loading screen (public/index.html #app-splash) once the app
// has painted. It lives OUTSIDE #root, so React doesn't clear it — we fade it out
// here. A short minimum keeps it visible even on an instant, fully-cached launch
// (otherwise it would flash for a few ms and read as "the splash didn't work").
(function hideSplash() {
  const el = document.getElementById('app-splash');
  if (!el) return;
  const MIN_MS = 700;
  const elapsed = Date.now() - (window.__splashStart || Date.now());
  const wait = Math.max(0, MIN_MS - elapsed);
  // Wait until after the first paint (rAF), then honour the minimum before fading.
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.classList.add('sp-out');
      setTimeout(() => el.remove(), 450); // after the 0.4s opacity transition
    }, wait);
  });
})();

// Register service worker for PWA (offline support + caching). When a new
// version is installed and waiting, stash the registration and notify the app
// so it can show an "Update" bar (see UpdatePrompt).
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    window.__ahmaSwReg = registration;
    window.dispatchEvent(new CustomEvent('ahma:sw-update'));
  },
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
