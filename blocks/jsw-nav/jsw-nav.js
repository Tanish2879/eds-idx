import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * JSW Nav: the JSW pages' navigation bar (in the nav document, e.g. /jsw-nav, that pages pick
 * with their "nav" metadata; the header shows it). A floating grey bar: the logo at the left, up
 * to LINKS links and the button at the right; phones: the logo and a short button in the bar,
 * the menu button beside it opening the links and the button in a dropdown.
 * Rows (every property in its own cell, read by position):
 *   1. logo (+ alt)   2. logo link   3.–6. links 1–4 (each its target and its text, one cell)
 *   7. button (its target and its text)
 * Every link is optional: one is shown only with both its text and its target (the others left
 * out, the links sharing the row: see the CSS); a text longer than MAX_TEXT (MAX_CTA for the
 * button) is cut with "…" on the site, a warning logged. In the editor (its own document) the
 * texts are edited in place; as a page's header it is only shown.
 */

const LINKS = 4;
const MAX_TEXT = 12;
const MAX_CTA = 30;
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

function toggleMenu(bar, button, force) {
  const open = force !== undefined ? force : bar.getAttribute('aria-expanded') !== 'true';
  bar.setAttribute('aria-expanded', open);
  button.setAttribute('aria-expanded', open);
  button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

let navId = 0;

export default function decorate(block) {
  navId += 1;
  const inHeader = !!block.closest('header');
  const authoring = isAuthoring() && !inHeader;
  const [logoRow, logoLinkRow, ...rest] = [...block.children];
  const linkRows = rest.slice(0, LINKS);
  const ctaRow = rest[LINKS];

  // the logo (a link home)
  const home = cellLink(logoLinkRow);
  const logo = el('a', { href: home?.href || '/', class: 'logo' });
  const img = logoRow?.querySelector('img');
  if (img) {
    const shown = el('img', { src: img.getAttribute('src'), alt: img.getAttribute('alt') || 'JSW Motors', loading: 'eager' });
    moveInstrumentation(img, shown);
    if (authoring) editable(shown, 'logo', 'media', 'Logo');
    logo.append(shown);
  } else {
    logo.textContent = text(logoRow) || 'JSW Motors';
  }

  // the links: only those with both their text and their target
  const list = el('ul', { class: 'nav-list' });
  linkRows.forEach((row, i) => {
    const link = cellLink(row);
    if (!(link?.label && link.href)) return;
    const n = i + 1;
    const a = el('a', { href: link.href, class: 'link' }, fit(link.label, MAX_TEXT, `link ${n} text`, authoring));
    if (authoring) editable(a, `link${n}Text`, 'text', `Link ${n} text`);
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
  const start = el('div', { class: 'bar-start' }, logo);
  if (cta) {
    start.append(el('a', { href: cta.getAttribute('href'), class: 'quick', 'aria-label': cta.textContent }, cta.textContent.split(/\s+/)[0]));
  }
  const menu = el('div', { class: 'menu', id: `${uid}-menu` });
  if (list.children.length) menu.append(list);
  if (actions.children.length) menu.append(actions);
  const bar = el('nav', { class: 'bar', 'aria-expanded': 'false', 'aria-label': 'Main' }, start, button, menu);
  block.replaceChildren(bar);

  button.addEventListener('click', () => toggleMenu(bar, button));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.getAttribute('aria-expanded') === 'true') {
      toggleMenu(bar, button, false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) toggleMenu(bar, button, false);
  });
  DESKTOP.addEventListener('change', () => toggleMenu(bar, button, false));

  // the page's top (the CSS drops the grey bar there over a dark hero; it shows once the page
  // scrolls)
  const atTop = () => block.classList.toggle('is-at-top', window.scrollY <= 1);
  window.addEventListener('scroll', atTop, { passive: true });
  atTop();
}
