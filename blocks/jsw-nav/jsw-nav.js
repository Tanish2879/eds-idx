import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * JSW Nav: the JSW pages' navigation bar (in the nav document, e.g. /jsw-nav, that pages pick
 * with their "nav" metadata; the header shows it). A floating grey bar: the logo (the JSW mark
 * and the brand name as text) at the left, up to LINKS links and the button at the right;
 * phones: the logo and a short button in the bar, the menu button beside it opening the links and
 * the button in a dropdown.
 * Rows (every property in its own cell, read by position):
 *   1. logo: the mark (+ alt)   2. brand name (text, beside the mark)   3. logo link
 *   4.–7. links 1–4 (each its target and its text, one cell)   8. button (its target and its text)
 * Every link is optional: one is shown only with both its text and its target (the others left
 * out, the links sharing the row: see the CSS); a text longer than MAX_TEXT (MAX_CTA for the
 * button) is cut with "…" on the site, a warning logged. In the editor (its own document) the
 * texts are edited in place; as a page's header it is only shown. The logo, the links and the
 * button carry analytics names (data-cta, from their texts: no fields to author).
 */

// (a placeholder's address from before the JSW pages moved under /jsw, /drafts/<page>/...: its
// file is now in /drafts/jsw/<page>/)
const LEGACY_DRAFTS = /^\/drafts\/(?!jsw\/)/;

const LINKS = 4;
const MAX_TEXT = 12;
const MAX_CTA = 30;
const MAX_BRAND = 24;
const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'webp'];
const DESKTOP = window.matchMedia('(width >= 768px)');

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// a link cell: its target and its text (the text: the link's own, unless that is only the URL)
function cellLink(cell) {
  const a = cell?.querySelector('a[href]');
  if (!a) return null;
  const href = a.getAttribute('href');
  const label = text(a);
  return { href, label: label && label !== href ? label : '', source: a };
}

/*
 * The logo's image: an <img>, or a link to an image file (AEM delivers a reference it can't
 * resolve, an asset not in AEM Assets at that path, as a plain link); a path with a drafts folder
 * in it (the content's placeholders, under the site's DAM folder) is then loaded from the copy in
 * this repository, on the code host. Nothing without one (no placeholder, no broken image).
 */
function cellImage(cell) {
  const img = cell?.querySelector('img');
  const link = img ? null : cell?.querySelector('a[href]');
  const raw = img?.getAttribute('src') || link?.getAttribute('href');
  if (!raw) return null;
  const url = new URL(raw, window.location);
  const extension = url.pathname.split('.').pop().toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    // eslint-disable-next-line no-console
    console.warn(`jsw-nav: the logo "${raw}" is not shown: .${extension} isn't an image format (${IMAGE_EXTENSIONS.map((x) => `.${x}`).join(', ')})`);
    return null;
  }
  const drafts = url.pathname.indexOf('/drafts/');
  const src = link && drafts >= 0 ? `${window.hlx?.codeBasePath || ''}${url.pathname.slice(drafts).replace(LEGACY_DRAFTS, '/drafts/jsw/')}` : raw;
  const label = link ? text(link) : '';
  let alt = img ? img.getAttribute('alt') || '' : '';
  if (link && label && !label.includes('/')) alt = label;
  return { src, alt, source: img || link };
}

// a text within its limit: a longer one cut with "…" on the site (with a warning); the editor
// keeps it whole (edited in place: a cut text would be saved cut)
function fit(value, limit, field, authoring) {
  if (!value || value.length <= limit) return value;
  // eslint-disable-next-line no-console
  console.warn(`jsw-nav: the ${field} has ${value.length} characters, more than its ${limit}${authoring ? '' : ': cut with "…"'}`);
  return authoring ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

// authoring: an editable field of the block (its resource: the block's)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

// analytics: a link's data-cta name (jsw-nav:<its text, lower case, hyphenated>:<action>), set
// for the site's tag manager to read
function track(node, name, action = 'view') {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  node.dataset.cta = `jsw-nav:${slug || 'not-set'}:${action}`;
}

/*
 * The phones' menu (from 768px always shown, the menu button hidden). Its open state is the
 * bar's is-open class (the menu button's aria-expanded for assistive technology). While it is
 * open the page behind stands still: the CSS locks the page's scrolling, and wheel and touch
 * scrolling (which iOS doesn't stop with that) are cancelled unless they scroll the open menu
 * itself. Closed by the menu button, Escape (focus back on the button), a click outside, focus
 * leaving the bar (tabbing out of it), and the window widening to the desktop layout.
 */
function controlMenu(bar, button, menu) {
  const isOpen = () => bar.classList.contains('is-open');
  const holdPage = (e) => {
    if (menu.contains(e.target) && menu.scrollHeight > menu.clientHeight) return;
    if (e.cancelable) e.preventDefault();
  };
  const hold = { capture: true, passive: false };
  const setOpen = (open) => {
    if (open === isOpen()) return;
    bar.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', open);
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    ['wheel', 'touchmove'].forEach((type) => {
      if (open) window.addEventListener(type, holdPage, hold);
      else window.removeEventListener(type, holdPage, hold);
    });
  };

  button.addEventListener('click', () => setOpen(!isOpen()));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    button.focus();
  });
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) setOpen(false);
  });
  // (focus moving to an element outside the bar; a click on the bar's own background moves focus
  // nowhere, and leaves the menu open)
  bar.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !bar.contains(e.relatedTarget)) setOpen(false);
  });
  DESKTOP.addEventListener('change', () => setOpen(false));
}

let navId = 0;

export default function decorate(block) {
  navId += 1;
  const inHeader = !!block.closest('header');
  const authoring = isAuthoring() && !inHeader;
  const [logoRow, brandRow, logoLinkRow, ...rest] = [...block.children];
  const linkRows = rest.slice(0, LINKS);
  const ctaRow = rest[LINKS];

  // the logo (a link home): the mark, and the brand name as text beside it (the mark then
  // decorative: the name says it)
  const home = cellLink(logoLinkRow);
  const logo = el('a', { href: home?.href || '/', class: 'logo' });
  track(logo, 'home');
  const name = fit(text(brandRow), MAX_BRAND, 'brand name', authoring);
  const mark = cellImage(logoRow);
  if (mark) {
    // (at the top of every page: fetched at once, ahead of the page's other images)
    const shown = el('img', {
      src: mark.src, alt: name ? '' : mark.alt, loading: 'eager', fetchpriority: 'high',
    });
    moveInstrumentation(mark.source, shown);
    if (authoring) editable(shown, 'logo', 'media', 'Logo');
    logo.append(shown);
  }
  if (name) {
    const brand = el('span', { class: 'brand-name' }, name);
    if (authoring) editable(brand, 'brandName', 'text', 'Brand name');
    logo.append(brand);
  }
  // (a mark alone, without alt text: the link still named)
  if (mark && !name && !mark.alt) logo.setAttribute('aria-label', 'Home');

  // the links: only those with both their text and their target
  const list = el('ul', { class: 'nav-list' });
  linkRows.forEach((row, i) => {
    const link = cellLink(row);
    if (!(link?.label && link.href)) return;
    const n = i + 1;
    const a = el('a', { href: link.href, class: 'link' }, fit(link.label, MAX_TEXT, `link ${n} text`, authoring));
    if (authoring) editable(a, `link${n}Text`, 'text', `Link ${n} text`);
    track(a, link.label);
    list.append(el('li', { class: 'nav-item' }, a));
  });
  list.dataset.links = list.children.length;

  // the button (only with both its text and its target)
  const action = cellLink(ctaRow);
  const actions = el('div', { class: 'actions' });
  let cta = null;
  if (action?.label && action.href) {
    cta = el('a', { href: action.href, class: 'cta' }, fit(action.label, MAX_CTA, 'button text', authoring));
    if (authoring) editable(cta, 'ctaText', 'text', 'Button text');
    track(cta, action.label, 'click');
    actions.append(cta);
  }

  // phones: the logo and the button's first word in the bar, the menu button beside it, the links
  // and the button in the dropdown; from 768px one bar (the menu shown, the toggle hidden)
  const uid = `jsw-nav-${navId}`;
  const button = el(
    'button',
    {
      type: 'button', class: 'toggle', 'aria-controls': `${uid}-menu`, 'aria-expanded': 'false', 'aria-label': 'Open navigation',
    },
    el('span', { class: 'toggle-line is-top' }),
    el('span', { class: 'toggle-line is-bottom' }),
  );
  // (no mark and no name: no logo at all)
  const start = el('div', { class: 'bar-start' }, logo.children.length ? logo : '');
  if (cta) {
    const quick = el('a', { href: cta.getAttribute('href'), class: 'quick', 'aria-label': cta.textContent }, cta.textContent.split(/\s+/)[0]);
    quick.dataset.cta = cta.dataset.cta;
    start.append(quick);
  }
  const menu = el('div', { class: 'menu', id: `${uid}-menu` });
  if (list.children.length) menu.append(list);
  if (actions.children.length) menu.append(actions);
  const bar = el('nav', { class: 'bar', 'aria-label': 'Main' }, start, button, menu);
  block.replaceChildren(bar);
  controlMenu(bar, button, menu);

  // the page's top (the CSS drops the grey bar there over a dark hero; it shows once the page
  // scrolls)
  const atTop = () => block.classList.toggle('is-at-top', window.scrollY <= 1);
  window.addEventListener('scroll', atTop, { passive: true });
  atTop();
}
