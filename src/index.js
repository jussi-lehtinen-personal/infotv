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
