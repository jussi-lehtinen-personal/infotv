/**
 * Jaetut CSS utility-luokat kaikille sivuille.
 *
 * Käyttö sivuilla:
 *   import { themeCSS } from '../theme';
 *   const css = `${themeCSS}
 *   .sivun-oma-luokka { ... }
 *   `;
 *
 * CSS-muuttujat on määritelty src/index.css :root -lohkossa.
 */

export const themeCSS = `

/* ── SIVUN JUURI ── */
.page-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* ── KORTTI (glass morphism surface) ── */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-surface-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 12px;
}

/* ── OTSIKOT ── */
.heading-xl {
  font-size: var(--size-heading-xl);
  font-weight: 900;
  color: var(--color-primary);
  letter-spacing: 2.5px;
  text-transform: uppercase;
  text-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  line-height: 1.1;
}

.heading-lg {
  font-size: var(--size-heading-lg);
  font-weight: 900;
  color: var(--color-primary);
  letter-spacing: 2.5px;
  text-transform: uppercase;
  text-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  line-height: 1.1;
}

.heading-md {
  font-size: var(--size-heading-md);
  font-weight: 700;
  color: var(--color-secondary);
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.heading-sm {
  font-size: var(--size-heading-sm);
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 0.4px;
  line-height: 1.2;
}

`;

/**
 * AHMA-brändiväri JS-koodissa käytettäväksi (esim. canvas-piirto).
 * Pitää synkroonissa --color-primary -muuttujan kanssa.
 */
export const COLOR_PRIMARY  = '#f59e0b';
export const COLOR_PRIMARY_DIM  = 'rgba(245, 158, 11, 0.45)';
export const COLOR_PRIMARY_GLOW = 'rgba(245, 158, 11, 0.20)';
export const COLOR_WIN  = '#22c55e';
export const COLOR_LOSS = '#ef4444';
export const COLOR_DRAW = '#e8e8e8';
