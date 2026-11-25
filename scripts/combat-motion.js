/*
 * Combat motion: the page-level motion of the Combat model page (body.combat), loaded by
 * scripts.js only once the section snap is live (html.snap-active), so never under
 * prefers-reduced-motion, in Universal Editor, or without JavaScript. Without it every
 * section stays in its final, fully visible state.
 *
 * Shared contract (other Combat motion builds on these; CSS must hide or offset content only
 * under body.combat-motion):
 *   body.combat-motion      set once this runs, after the first section is marked current
 *   section.is-current      the main > .section in view: set on load (also when deep-linked to a
 *                           hash) and on every snap:end; removed from the one before. At the
 *                           footer stop the last section stays current.
 *   section.is-arriving     the section a snap move is heading to, from snap:start to snap:end
 *                           (a step takes 1.2s, power2.inOut; a Wave In cut plays meanwhile)
 *   section.is-leaving      the section a snap move leaves, from snap:start to snap:end
 *   section[data-arrive]    "down" or "up": the direction of the move into it (set at snap:start);
 *                           "none" when it became current without a move (load, focus jump,
 *                           native scroll)
 *   body.header-hidden      the site header is tucked away (styles/theme-combat.css)
 * Events, on document:
 *   combat:move   {from, to, direction}  at snap:start; from/to are sections or the footer
 *   combat:arrive {section, direction}   when a section becomes current (also the first one, on
 *                                        load, with direction "none")
 */

import { inEditor } from './utils/common.js';

const ACTIVE = 'combat-motion';
const CURRENT = 'is-current';
const ARRIVING = 'is-arriving';
const LEAVING = 'is-leaving';
const HEADER_HIDDEN = 'header-hidden';
// the page rests this long without scrolling before the section in view is re-read
const IDLE_MS = 200;

/**
 * @param {Element} from
 * @param {Element} to
 * @returns {'down'|'up'|'none'}
 */
function directionOf(from, to) {
  if (!from || !to || from === to) return 'none';
  // eslint-disable-next-line no-bitwise
  return from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING ? 'down' : 'up';
}

/**
 * Header hide/show: tucked away when a move goes down, back when it goes up or reaches the
 * first section; never while focus is in it or one of its menus is open.
 * @param {Element[]} sections
 */
function initHeader(sections) {
  const header = document.querySelector('header');
  if (!header) return;
  const { body } = document;
  const menuOpen = () => document.documentElement.classList.contains('is-nav-open')
    || !!header.querySelector('.drop[aria-expanded="true"]');
  const show = () => body.classList.remove(HEADER_HIDDEN);

  document.addEventListener('snap:start', ({ detail: { from, to } }) => {
    const direction = directionOf(from, to);
    if (direction === 'up' || to === sections[0]) show();
    else if (direction === 'down' && !menuOpen() && !header.contains(document.activeElement)) {
      body.classList.add(HEADER_HIDDEN);
    }
  });
  header.addEventListener('focusin', show);
  // a menu opened from the keyboard or by a click keeps it in view
  header.addEventListener('click', show);
}

/**
 * Starts the Combat page motion.
 * @param {Element} main
 */
export default function initCombatMotion(main) {
  const { body } = document;
  const root = document.documentElement;
  if (!body.classList.contains('combat') || body.classList.contains(ACTIVE)) return;
  if (inEditor() || !root.classList.contains('snap-active')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = [...main.querySelectorAll(':scope > .section')];
  if (!sections.length) return;

  let current = null;
  let moving = false;

  const setCurrent = (section, direction) => {
    if (!sections.includes(section) || section === current) return;
    current?.classList.remove(CURRENT);
    section.dataset.arrive = direction;
    section.classList.add(CURRENT);
    current = section;
    document.dispatchEvent(new CustomEvent('combat:arrive', { detail: { section, direction } }));
  };

  document.addEventListener('snap:start', ({ detail: { from, to } }) => {
    moving = true;
    const direction = directionOf(from, to);
    if (sections.includes(from) && from !== to) from.classList.add(LEAVING);
    if (sections.includes(to) && to !== current) {
      to.dataset.arrive = direction;
      to.classList.add(ARRIVING);
    }
    document.dispatchEvent(new CustomEvent('combat:move', { detail: { from, to, direction } }));
  });

  document.addEventListener('snap:end', ({ detail: { from, to } }) => {
    moving = false;
    sections.forEach((s) => s.classList.remove(LEAVING, ARRIVING));
    // the footer stop leaves the last section current (it can still be partly in view)
    setCurrent(to, directionOf(from, to));
  });

  // the page can also come to rest on another section without a snap move (focus moving into
  // it, find in page, a No Snap section scrolled natively): re-read it once scrolling stops
  let idle = 0;
  window.addEventListener('scroll', () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (moving) return;
      const section = window.snap?.current;
      if (sections.includes(section)) setCurrent(section, 'none');
    }, IDLE_MS);
  }, { passive: true });

  // the section the engine rests on (or, when deep-linked, is already moving to)
  const initial = sections.includes(window.snap?.current) ? window.snap.current : sections[0];
  setCurrent(initial, 'none');
  initHeader(sections);
  body.classList.add(ACTIVE);
}
