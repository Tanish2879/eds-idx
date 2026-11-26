import { inEditor } from '../../scripts/utils/common.js';
import decorateBrochure from '../../scripts/utils/brochure.js';

const SHOWN = 'is-shown';

/**
 * A links line followed by a plain label line becomes a brochure popup (scripts/utils/brochure.js).
 * @param {Element} cell the Links field
 * @returns {HTMLElement|null}
 */
function buildBrochure(cell) {
  const label = [...cell.children].find((el) => el.matches('p:not(:has(a))')
    && el.previousElementSibling?.matches('p:has(a)'));
  if (!label) return null;
  const brochure = document.createElement('div');
  brochure.className = 'floater-brochure';
  label.previousElementSibling.before(brochure);
  brochure.append(label.previousElementSibling, label);
  if (!decorateBrochure(brochure, 'floater-brochure-links')) return null;
  const toggle = brochure.querySelector('.brochure-toggle');
  toggle.classList.add('floater-link');
  toggle.dataset.glitch = '';
  return brochure;
}

/**
 * The bar's links and brochure, in authored order. With no button, the last link is primary.
 * @param {Element} cell the Links field
 * @returns {HTMLElement[]}
 */
function buildItems(cell) {
  if (!cell) return [];
  const brochure = buildBrochure(cell);
  const items = [...cell.children].flatMap((el) => {
    if (el === brochure) return [el];
    return el.matches('a[href]') ? [el] : [...el.querySelectorAll('a[href]')];
  });
  const anchors = items.filter((el) => el.matches('a'));
  if (anchors.length && !anchors.some((a) => a.classList.contains('button'))) {
    anchors.at(-1).classList.add('button', 'primary');
  }
  anchors.forEach((a) => {
    if (!a.classList.contains('button')) {
      a.classList.add('floater-link');
      a.dataset.glitch = '';
    }
    if (/\.pdf$/i.test(new URL(a.href).pathname)) a.setAttribute('download', '');
  });
  return items;
}

/**
 * Shows the bar while a "Show Floater" section is on screen.
 * @param {HTMLElement} bar
 */
function watchSections(bar) {
  const sections = [...document.querySelectorAll('main > .section.show-floater')];
  if (!sections.length) return;
  const inView = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) inView.add(target);
      else inView.delete(target);
    });
    const shown = inView.size > 0;
    bar.classList.toggle(SHOWN, shown);
    if (!shown) bar.querySelector('.brochure-toggle[aria-expanded="true"]')?.click();
    bar.inert = !shown;
  }, { rootMargin: '-49% 0px -50% 0px' });
  sections.forEach((section) => observer.observe(section));
}

/**
 * Sets --floater-space on the page: the bar's height plus its bottom offset.
 * @param {HTMLElement} bar
 */
function publishRoom(bar) {
  const set = () => {
    const bottom = parseFloat(getComputedStyle(bar).bottom) || 0;
    document.documentElement.style.setProperty('--floater-space', `${Math.ceil(bar.offsetHeight + bottom)}px`);
  };
  set();
  new ResizeObserver(set).observe(bar);
  window.addEventListener('resize', set, { passive: true });
}

/**
 * Floater: a bar fixed at the foot of the screen, shown on "Show Floater" sections.
 * @param {Element} block
 */
export default function decorate(block) {
  const [nameRow, textRow, linksRow] = [...block.children];
  const name = nameRow?.textContent.trim() || '';
  const text = textRow?.textContent.trim() || '';
  if (inEditor()) {
    block.classList.add('is-editing');
    return;
  }

  const items = buildItems(linksRow?.firstElementChild || linksRow);
  const plain = items.some((el) => el.matches('.floater-link, .floater-brochure'));
  const parts = [];
  if (name || text) {
    const intro = document.createElement('p');
    intro.className = 'floater-intro';
    [[name, 'floater-name'], [text, 'floater-text']].forEach(([value, className]) => {
      if (!value) return;
      const span = document.createElement('span');
      span.className = className;
      span.textContent = value;
      intro.append(span);
    });
    parts.push(intro);
  }
  if (parts.length && plain) {
    const rule = document.createElement('span');
    rule.className = 'floater-rule';
    rule.setAttribute('aria-hidden', 'true');
    parts.push(rule);
  }
  block.replaceChildren(...parts, ...items);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', name ? `${name} quick links` : 'Quick links');
  block.inert = true;

  // moved to the page level; an emptied section is removed
  const wrapper = block.parentElement;
  const section = wrapper?.closest('.section');
  document.body.append(block);
  wrapper?.remove();
  if (section && !section.querySelector(':scope > :not(.section-metadata)')) section.remove();
  publishRoom(block);
  watchSections(block);
}
