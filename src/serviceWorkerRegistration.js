// This is the standard CRA service worker registration helper.
// Based on create-react-app PWA template.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/
  )
);

let swRegistration = null;

export function register(config) {
  if ('serviceWorker' in navigator) {

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });

    // When the app returns to the foreground (resume), check for a new version and, if
    // one is waiting, activate it right away (→ controllerchange → reload). Without this
    // a resumed PWA keeps serving the stale cached shell (old layout / NaN) until it is
    // fully closed. A real page load still shows the "Päivitä" bar for mid-session updates.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !swRegistration) return;
      swRegistration.update()
        .then(() => { if (swRegistration.waiting) swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); })
        .catch(() => {});
    });

    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('PWA is being served cache-first by a service worker.');
        });
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      swRegistration = registration; // for the resume-time update check
      // An update may already be installed + waiting when the app loads
      // (e.g. detected on a previous session). Prompt for it immediately.
      if (registration.waiting && navigator.serviceWorker.controller) {
        if (config && config.onUpdate) config.onUpdate(registration);
      }

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // A new version is installed and waiting. Don't auto-activate —
              // let the app show an "Update" bar so the reload isn't a surprise
              // (and so it works reliably, incl. iOS). The bar posts SKIP_WAITING
              // on tap, which triggers the controllerchange reload above.
              console.log('New content available; prompting to update.');
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              console.log('Content is cached for offline use.');
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };

      // Poll for updates every 60s so installed PWAs pick up new deploys
      // without waiting for a manual reload. The browser otherwise only
      // checks on navigation/reload, which doesn't happen for users who
      // keep the standalone PWA open.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 1000);

      // Also check whenever the tab becomes visible — covers the common
      // "I opened the app and want the latest" case for installed PWAs.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('No internet connection. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
