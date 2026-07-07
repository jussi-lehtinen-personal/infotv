/**
 * Shared style helpers for the pages still on the hand-rolled styling approach.
 *
 * `themeCSS` used to carry a set of utility classes (.page-root, .card,
 * .heading-*), but every consumer moved to MUI or the `ui-*` classes in
 * index.css, so the utility body is gone. The export is kept as an (empty)
 * prefix for the remaining `const css = \`${themeCSS}\n...\`` pages
 * (gamezone, Navbar, this_week, ads, game_ads) until they migrate too.
 *
 * CSS variables live in src/index.css :root.
 */
export const themeCSS = ``;

/**
 * AHMA brand colour for JS usage (e.g. canvas drawing). Keep in sync with the
 * --color-primary variable.
 */
export const COLOR_PRIMARY  = '#f97316';
export const COLOR_PRIMARY_DIM  = 'rgba(249, 115, 22, 0.45)';
