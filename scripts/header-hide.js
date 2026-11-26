// Section style "Hide Header" (styles/header-hide.css): moving down to a section with it slides
// the site header away; any move up brings it back. With the section snap, the move is the snap's
// (snap:start); without it (reduced motion, free-scrolling pages) the scroll direction, with the
// section at the top of the screen. The header stays while its menu is open or it has focus, and
// in Universal Editor. Once per page, whichever section runs it first.

import { inEditor } from './utils/common.js';

const HIDDEN = 'header-tucked';
// near the top of the page the header always shows
const TOP_ZONE = 120;
let started = false;

const isHiding = (el) => !!el?.matches?.('main > .section.hide-header');

/**
 * @param {Element} section a `.section.hide-header`
 */
export default function decorate(section) {
  if (started || inEditor() || !section) return;
  started = true;
  const { body, documentElement: root } = document;
  const header = document.querySelector('header');

  // the mobile menu, or a dropdown of the desktop bar (its <nav> itself is always "expanded" on
  // desktop, so it doesn't count)
  const menuOpen = () => root.matches('.is-nav-open')
    || !!header?.querySelector('li[aria-expanded="true"], .drop[aria-expanded="true"]');
  const show = () => body.classList.remove(HIDDEN);
  const hide = () => {
    if (menuOpen() || header?.contains(document.activeElement)) return;
    body.classList.add(HIDDEN);
  };

  document.addEventListener('snap:start', ({ detail }) => {
    const { from, to } = detail || {};
    if (!from || !to || from === to) return;
    // eslint-disable-next-line no-bitwise
    const down = !!(from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!down) show();
    // on to the footer: as it was
    else if (to.matches('main > .section')) {
      if (isHiding(to)) hide();
      else show();
    }
  });

  // no snap: by the scroll's direction
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (root.classList.contains('snap-active')) return;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    if (Math.abs(dy) < 2) return;
    if (dy < 0 || y < TOP_ZONE) {
      show();
      return;
    }
    const atTop = document.elementFromPoint(window.innerWidth / 2, 1)?.closest('main > .section');
    if (isHiding(atTop)) hide();
    else show();
  }, { passive: true });

  // keyboard users reaching the header, or anyone opening its menu, get it back
  header?.addEventListener('focusin', show);
  header?.addEventListener('pointerdown', show);
}
