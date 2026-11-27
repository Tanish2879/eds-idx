// first: support for browsers without CSS nesting (no-op elsewhere)
import './utils/legacy.js';
import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  getMetadata,
  toClassName,
} from './aem.js';
import { pushPageView, pushPageError } from './utils/pageview.js';
import { initGlitch } from './utils/glitch.js';
import { BLOCK_TYPES } from './utils/datalayer.js';
import { fetchPlaceholders } from './utils/common.js';
import {
  loadSectionStyles, decorateSectionStyles, normalizeSectionStyles, FREE_SCROLL_CLASS,
} from './utils/section-styles.js';
import { wasReferred } from './utils/referral.js';
import { captureAttribution } from './utils/attribution.js';

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

// Adobe Fonts (Typekit) kit for New Science; its CSS @imports a second
// stylesheet, so as a <link> in head.html it blocked first paint (~1.8s on mobile)
const ADOBE_FONTS_KIT = 'https://use.typekit.net/qil0qom.css';
// page themes (page property "Theme") that load styles/theme-{name}.css
const PAGE_THEMES = ['combat'];

/**
 * load fonts.css and the Adobe Fonts kit, and set a session storage flag
 */
async function loadFonts() {
  await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`),
    // a blocked or failed kit must not stop the rest of the page
    loadCSS(ADOBE_FONTS_KIT).catch(() => { }),
  ]);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks() {
  try {
    // TODO: add auto block, if needed
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * The authoring link picker stores a link to the home page as `/index/` (e.g. `/#social` becomes
 * `/index/#social`), which is not a page the site serves, so the visitor never lands on the
 * home page's anchor. Point those links back at `/`, keeping the hash.
 * @param {Element} container The element to scan for links
 */
function normalizeHomeLinks(container) {
  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    const match = href.match(/^(?:https?:\/\/[^/]+)?\/index(?:\.html)?\/?(?=$|[?#])(.*)$/i);
    if (!match) return;
    if (/^https?:/i.test(href) && new URL(href).origin !== window.location.origin) return;
    a.setAttribute('href', `/${match[1]}`);
  });
}

/**
 * Opens external (different-origin) links in a new tab; same-site and hash links are untouched.
 * @param {Element} container The element to scan for links
 */
export function decorateExternalLinks(container) {
  container.querySelectorAll('a[href]').forEach((a) => {
    let url;
    try {
      url = new URL(a.getAttribute('href'), window.location.href);
    } catch {
      return;
    }
    if (url.origin === window.location.origin) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    a.target = '_blank';
    a.rel = a.rel ? `${a.rel} noopener noreferrer` : 'noopener noreferrer';
  });
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
export function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // primary v2 call-to-action
      a.classList.add('primary-v2');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Adds data-layer hooks the componentOf() helper reads: a 1-based
 * data-section-index on each section (for component.position) and a
 * data-block-type on known blocks (for component.type). data-block-name is
 * already set by aem.js.
 * @param {Element} main
 */
function decorateDataLayerHooks(main) {
  main.querySelectorAll(':scope > .section').forEach((section, index) => {
    section.dataset.sectionIndex = index + 1;
  });
  Object.entries(BLOCK_TYPES).forEach(([name, type]) => {
    main.querySelectorAll(`.${name}.block, .${name}`).forEach((block) => {
      if (block.dataset.blockName === name || block.classList.contains(name)) {
        block.dataset.blockType = type;
      }
    });
  });
}

// Section padding choices offered in the Section model (models/_section.json).
const PADDING_VALUES = ['16px', '24px', '32px', '48px', '64px', '80px'];

/**
 * Applies author-chosen section padding (Section model fields padding-top and
 * padding-bottom, delivered by decorateSections as data-padding-* attributes).
 * Anything outside the offered values is ignored, keeping the default spacing.
 * @param {Element} main The main element
 */
function decorateSectionPadding(main) {
  main.querySelectorAll(':scope > .section').forEach((section) => {
    [['top', section.dataset.paddingTop], ['bottom', section.dataset.paddingBottom]]
      .forEach(([side, value]) => {
        const padding = value?.trim();
        if (PADDING_VALUES.includes(padding)) section.style.setProperty(`padding-${side}`, padding);
      });
  });
}

// Text alignment choices offered in the Section model (models/_section.json).
const TEXT_ALIGN_VALUES = ['left', 'center', 'right'];

/**
 * Gives a section the author-chosen anchor (Section model field anchor, delivered by
 * decorateSections as data-anchor) as its id, so links like #safety scroll to it.
 * The value is reduced to lowercase letters, digits and dashes; an id already used
 * on the page is left alone.
 * @param {Element} main The main element
 */
function decorateSectionAnchors(main) {
  main.querySelectorAll(':scope > .section[data-anchor]').forEach((section) => {
    const id = toClassName(section.dataset.anchor);
    if (id && !document.getElementById(id)) section.id = id;
  });
}

/**
 * Applies the author-chosen text alignment (Section model field text-align,
 * delivered by decorateSections as data-text-align) as a text-align-{value}
 * class on the section. Anything outside the offered values is ignored.
 * @param {Element} main The main element
 */
function decorateSectionTextAlign(main) {
  main.querySelectorAll(':scope > .section').forEach((section) => {
    const align = section.dataset.textAlign?.trim().toLowerCase();
    TEXT_ALIGN_VALUES.forEach((value) => section.classList.toggle(`text-align-${value}`, value === align));
  });
}

/**
 * Links to /modals/ pages open in a popup (blocks/modal) instead of navigating.
 * @param {Document} doc
 */
function autolinkModals(doc) {
  doc.addEventListener('click', async (e) => {
    const origin = e.target.closest('a');
    // modified clicks (new tab/window) stay with the browser
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (origin && origin.href && origin.href.includes('/modals/')) {
      e.preventDefault();
      const { openModal } = await import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`);
      openModal(origin.href, origin);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  normalizeHomeLinks(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionAnchors(main);
  decorateSectionPadding(main);
  decorateSectionTextAlign(main);
  normalizeSectionStyles(main);
  decorateBlocks(main);
  decorateButtons(main);
  decorateDataLayerHooks(main);
}

/** True when viewing a standalone fragment (footer/nav/header/fragments/*, modals/*),
 *  which should opt out of the full-viewport section snap. */
function isFragmentDocument() {
  return /^\/(footer|nav|header|fragments\/)/.test(window.location.pathname)
    || window.location.pathname.includes('/modals/');
}

/** Same-origin check for the fallback redirect — mirrors register-form.js's
 *  isSafeRedirect, so authored metadata can't become an open-redirect sink. */
function isSafeRedirect(url) {
  if (!url || url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * A page authored with <meta name="require-referral" content="true"> only
 * renders for a visitor who arrived via a real markReferral() call for it
 * (register-form.js does this before its post-submit redirect). Anyone else
 * is sent to require-referral-redirect (default `/`) before anything paints.
 * @returns {boolean} true if this navigation was redirected away
 */
function guardReferredPage() {
  if (document.querySelector('[data-aue-resource]')) return false;

  const required = (getMetadata('gated-page') || '').trim().toLowerCase();
  if (required !== 'true' && required !== 'yes') return false;
  if (wasReferred(window.location.pathname)) return false;

  const fallback = (getMetadata('gated-fallback-path') || '').trim() || '/';
  window.location.replace(isSafeRedirect(fallback) ? fallback : '/');
  return true;
}

/**
 * Loads the error page content from a fragment, splicing its sections in as
 * direct children of `main` (rather than nesting them inside a `fragment`
 * block) so block CSS scoped to `main > .section...` still applies.
 * @param {HTMLElement} main The main element
 */
async function loadErrorPage(main) {
  if (window.errorCode === '404') {
    const placeholders = await fetchPlaceholders();
    const fragmentPath = placeholders.errorPageFragmentPath || '/fragment/error';
    // eslint-disable-next-line import/no-cycle
    const { loadFragment } = await import('../blocks/fragment/fragment.js');
    const fragment = await loadFragment(fragmentPath);
    const section = main.querySelector('.section');
    if (fragment && section) {
      [...fragment.children].forEach((el) => el.classList.add('no-snap'));
      section.replaceWith(...fragment.children);
    } else if (section) {
      section.classList.add('no-snap');
    }
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  // Must run before anything else decorates or paints — a gated page should
  // never render even momentarily for a visitor who did not earn it.
  if (guardReferredPage()) return;

  // Unconditional, on every page — this is what lets attribution survive a
  // visitor clicking through from a campaign page to one with no UTM params.
  captureAttribution();

  document.documentElement.lang = 'en';
  if (isFragmentDocument()) document.body.classList.add('fragment-preview');
  // a /modals/ page opened on its own (Universal Editor, preview) shows as the popup panel
  if (window.location.pathname.includes('/modals/')) {
    document.body.classList.add('modal-preview');
    loadCSS(`${window.hlx.codeBasePath}/blocks/modal/modal.css`);
  }
  decorateTemplateAndTheme();
  // page themes with their own page-level styles (section looks, default content);
  // block styles for a theme live in each block's CSS under body.{theme}
  const theme = getMetadata('theme').trim().toLowerCase();
  if (PAGE_THEMES.includes(theme)) loadCSS(`${window.hlx.codeBasePath}/styles/theme-${theme}.css`);

  // Adobe Client Data Layer must exist before any block decorates and before
  // the pageView push, so it is the first thing set up in the eager phase.
  // Pushing before Adobe Tags loads is safe — Tags processes whatever is
  // already in the array when it initialises.
  window.adobeDataLayer = window.adobeDataLayer || [];

  // pageView must be the first push and land before blocks decorate, so any
  // block event that follows already has page context.
  pushPageView();

  if (window.isErrorPage) pushPageError(window.errorCode);

  // The header logo is the LCP element, so its chain (header.js -> nav fragment -> logo) starts
  // alongside the first section instead of after it.
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  if (main) {
    if (window.isErrorPage) await loadErrorPage(main);
    decorateMain(main);
    // section-style CSS downloads alongside the first section, which stays
    // hidden until it's in, so it never shows unstyled
    const sectionCss = loadSectionStyles(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), (section) => Promise.all([
      sectionCss,
      waitForFirstImage(section),
    ]));
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Initializes AEM Sidekick custom plugin event listener for Sanity.
 */
function initSanity() {
  const sidekick = document.querySelector('aem-sidekick');
  if (!sidekick) {
    document.addEventListener('sidekick-ready', initSanity, { once: true });
    return;
  }
  sidekick.addEventListener('custom:sanity', async (event) => {
    const { mount } = await import('../tools/eds_sanity/index.js');
    mount(event.detail);
  });
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');

  // OneTrust first thing after LCP: on mobile its banner text is the page's largest paint, so
  // every second it waits behind the remaining sections adds to LCP. Loaded on demand so the
  // helper stays out of the eager module graph; a failure must never block the page.
  import('./utils/onetrust.js')
    .then(({ default: loadConsentManager }) => loadConsentManager())
    .catch(() => {});

  // styles.css locks native scroll until .snap-ready is set. The snap engine (and GSAP) download
  // alongside the remaining sections rather than after them, and the fallback timer starts now,
  // so on a slow phone the lock lasts seconds less.
  const releaseScroll = () => document.documentElement.classList.add('snap-ready');
  // .snap-settled: the snap engine has started (.snap-active) or won't. Unlike .snap-ready (also
  // set by the fallback timer below while the engine may still be loading), blocks that step
  // with the snap wait for it before falling back to their plain layout.
  const settleSnap = () => document.documentElement.classList.add('snap-settled');
  // Pages using a free-scroll section style (the blog layouts) read top to
  // bottom natively instead of paging section by section.
  const snaps = main && !isFragmentDocument()
    && !document.body.classList.contains(FREE_SCROLL_CLASS);
  let sectionSnap;
  if (snaps) {
    setTimeout(releaseScroll, 4000);
    sectionSnap = import('./section-snap.js');
    sectionSnap.then(({ preloadSectionSnap, initBarTint }) => {
      preloadSectionSnap();
      initBarTint(main);
    }).catch(() => {});
  }

  await loadSections(main);
  decorateSectionStyles(main);

  // side navigation, only on pages with sections labelled for it (Section model navLabel)
  if (main?.querySelector(':scope > .section[data-navlabel]')) {
    import('./section-nav.js')
      .then(({ default: initSectionNav }) => initSectionNav(main))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('section nav init failed', err));
  }

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // GSAP section snap-scroll — started after LCP (above). Runs after loadSections so section
  // geometry is settled and after loadFooter is kicked off so the footer becomes a snap stop.
  // Every path below releases the scroll lock; the timeout above keeps a slow or failed load
  // from leaving the page unscrollable.
  if (snaps) {
    sectionSnap
      .then(({ default: initSectionSnap }) => initSectionSnap(main))
      .finally(settleSnap)
      .then(() => Promise.all([
        // "Wave In" sections: the snap's moves into them play the wave cut
        main.querySelector('.section.wave-in')
          && import('./wave-cut.js').then(({ default: initWaveCut }) => initWaveCut(main)),
        // Combat page motion, only once the snap is live (not reduced motion, not the editor)
        document.body.classList.contains('combat')
          && document.documentElement.classList.contains('snap-active')
          && import('./combat-motion.js').then(({ default: initCombatMotion }) => initCombatMotion(main)),
      ]))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('section snap init failed', err))
      .finally(releaseScroll);
  } else {
    releaseScroll();
    settleSnap();
  }

  // Delegated CTA click tracking, registered once here; delegation on
  // document covers blocks decorated later. Loaded on demand to keep it out
  // of the eager module graph.
  import('./utils/cta.js')
    .then(({ default: initCtaTracking }) => initCtaTracking())
    // eslint-disable-next-line no-console
    .catch((err) => console.error('CTA tracking failed to load', err));

  // Glitch hover on every primary CTA (same delegation approach).
  initGlitch();

  // Links to /modals/<name> pages open in a popup.
  autolinkModals(doc);

  // OneTrust loads at the start of this phase (above). Adobe Launch waits for the delayed
  // phase (delayed.js); it processes everything already pushed to window.adobeDataLayer, so
  // the pageView and early CTA clicks still reach it.
  initSanity();

  // page structured data (JSON-LD); not for standalone fragments
  if (!isFragmentDocument()) {
    import('./utils/schema.js')
      .then(({ default: initSchema }) => initSchema())
      // eslint-disable-next-line no-console
      .catch((err) => console.error('schema init failed', err));
  }
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
