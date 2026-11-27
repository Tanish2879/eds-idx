// Section styles that come with their own CSS and/or JS, downloaded only on
// pages that use them — the same way blocks load their own code.

import { loadCSS } from '../aem.js';
import { inEditor } from './common.js';

/**
 * Section style class → what it needs:
 *   css: stylesheet in /styles/ (loaded with the first section)
 *   js: module in /scripts/ decorating one section (lazy phase; must be safe to
 *       re-run, as the editor does after each edit)
 *   freeScroll: the page scrolls natively (no section snap, no "No Snap" needed)
 *   colorOnly: no layout of its own — it only recolours the section, or adds page
 *       behaviour (Hide Header) — so the section still behaves like any other, e.g.
 *       long text scrolls inside it
 */
const SECTION_STYLES = {
  'article-hero': { css: 'article-detail', freeScroll: true },
  'article-body': { css: 'article-detail', js: 'article-detail/article-body', freeScroll: true },
  collage: { css: 'collage', js: 'collage' },
  'media-gradient': { css: 'media-gradient', js: 'media-gradient' },
  light: { css: 'section-light', colorOnly: true },
  statement: { css: 'section-statement', js: 'section-statement' },
  'hide-header': { css: 'header-hide', js: 'header-hide', colorOnly: true },
  'reserve-band': { css: 'section-reserve', js: 'section-reserve' },
};

export const FREE_SCROLL_CLASS = 'free-scroll';

/**
 * @param {Element} section
 * @returns {boolean} whether the section uses a style above (its own CSS/JS layout)
 */
export function hasSectionStyle(section) {
  return Object.entries(SECTION_STYLES)
    .some(([name, { colorOnly }]) => !colorOnly && section.classList.contains(name));
}

/**
 * `parent`'s children, with Universal Editor's <div data-aue-type="richtext">
 * field wrappers flattened, so the result matches preview and live (where
 * those wrappers don't exist).
 * @param {Element} parent
 * @returns {Element[]}
 */
export function contentChildren(parent) {
  return [...parent.children].flatMap(
    (el) => (el.matches('div[data-aue-type="richtext"]') ? [...el.children] : [el]),
  );
}

/**
 * @param {Element} root
 * @returns {{ name: string, config: object, sections: Element[] }[]} the
 *   registered styles used in `root`
 */
function findUsedStyles(root) {
  if (!root) return [];
  return Object.entries(SECTION_STYLES)
    .map(([name, config]) => ({ name, config, sections: [...root.querySelectorAll(`.section.${name}`)] }))
    .filter(({ sections }) => sections.length);
}

/**
 * Marks the page free-scrolling if a style used in `root` asks for it. Run
 * right after decorateSections, and again after editor updates.
 * @param {Element} root
 */
export function normalizeSectionStyles(root) {
  if (findUsedStyles(root).some(({ config }) => config.freeScroll)) {
    document.body.classList.add(FREE_SCROLL_CLASS);
  }
}

/**
 * Loads the stylesheets of the styles used in `root` — all of them in
 * Universal Editor, so a style applied while editing renders straight away.
 * @param {Element} root
 */
export async function loadSectionStyles(root) {
  const configs = inEditor()
    ? Object.values(SECTION_STYLES)
    : findUsedStyles(root).map(({ config }) => config);
  const sheets = new Set(configs.map(({ css }) => css).filter(Boolean));
  await Promise.all([...sheets].map((css) => loadCSS(`${window.hlx.codeBasePath}/styles/${css}.css`)
    // a missing stylesheet must never block the page
    // eslint-disable-next-line no-console
    .catch((err) => console.error(`section style css "${css}" failed to load`, err))));
}

/**
 * Runs the scripts of the styles used in `root`, once per section.
 * @param {Element} root
 */
export async function decorateSectionStyles(root) {
  const used = findUsedStyles(root).filter(({ config }) => config.js);
  await Promise.all(used.map(async ({ config, sections }) => {
    try {
      const { default: decorate } = await import(`${window.hlx.codeBasePath}/scripts/${config.js}.js`);
      sections.forEach((section) => decorate(section));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`section style script "${config.js}" failed`, err);
    }
  }));
}
