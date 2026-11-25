// Tabs "Locations": image tiles; the open tab's image fills the section.

import { inEditor } from '../../scripts/utils/common.js';

const AUTO_ADVANCE_MS = 6000;
// the wipe and settle animations in tabs-locations.css
const TRANSITION_MS = 1700;

/**
 * The first image of a panel's Content, or null.
 * @param {HTMLElement} panel
 * @returns {HTMLImageElement|null}
 */
function panelImage(panel) {
  return panel.querySelector('.tabs-panel-content picture img, .tabs-panel-content img');
}

/**
 * Decorates the Locations style on the markup tabs.js built.
 * @param {HTMLElement} block the tabs block
 */
export default function decorateLocations(block) {
  const list = block.querySelector(':scope > .tabs-list');
  if (!list) return;
  const buttons = [...list.querySelectorAll(':scope > .tabs-tab')];
  const panels = [...block.querySelectorAll(':scope > .tabs-panel')];
  // a single location is a plain banner: no tiles (tabs.js hides the bar) and no auto-advance
  const single = list.classList.contains('tabs-list-single');

  buttons.forEach((button, i) => {
    const panel = panels[i];
    if (!panel) return;
    panel.classList.add('loc-panel');
    const img = panelImage(panel);
    if (!img) return;
    img.closest('picture')?.classList.add('loc-bg');
    img.classList.add('loc-bg-img');
    if (single) return;
    const label = document.createElement('span');
    label.className = 'loc-label';
    label.textContent = button.textContent;
    const thumb = document.createElement('img');
    thumb.className = 'loc-thumb';
    thumb.src = img.currentSrc || img.src;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.setAttribute('aria-hidden', 'true');
    button.replaceChildren(thumb, label);
    button.classList.add('has-thumb');
  });

  const section = block.closest('.section');
  section?.classList.add('has-locations');
  // the absolutely positioned panels would otherwise swallow the section snap
  block.dataset.snapPassthrough = '';

  if (inEditor() || buttons.length < 2) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let current = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
  let leaving = null;
  let settleTimer;
  const settle = () => {
    clearTimeout(settleTimer);
    panels.forEach((panel) => panel.classList.remove('loc-entering'));
    if (!leaving) return;
    leaving.classList.remove('loc-leaving');
    leaving.inert = false;
    leaving.removeAttribute('aria-hidden');
    if (leaving !== panels[current]) leaving.hidden = true;
    leaving = null;
  };

  // a click or tap restarts the timer; only keyboard focus pauses it (WCAG 2.2.2)
  let autoTimer;
  let inView = false;
  let paused = false;
  const advance = () => buttons[(current + 1) % buttons.length].click();
  const run = () => {
    clearTimeout(autoTimer);
    if (inView && !paused && !reduce.matches) autoTimer = setTimeout(advance, AUTO_ADVANCE_MS);
  };

  block.addEventListener('tabs:change', ({ detail: { index, previous } }) => {
    current = index;
    settle();
    run();
    const from = panels[previous];
    const to = panels[index];
    if (reduce.matches || !from || !to) return;
    leaving = from;
    from.hidden = false;
    from.inert = true;
    from.setAttribute('aria-hidden', 'true');
    from.classList.add('loc-leaving');
    to.classList.add('loc-entering');
    settleTimer = setTimeout(settle, TRANSITION_MS);
  });

  list.addEventListener('focusin', () => {
    paused = !!list.querySelector(':focus-visible');
    run();
  });
  list.addEventListener('focusout', (e) => {
    if (list.contains(e.relatedTarget)) return;
    paused = false;
    run();
  });

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    run();
  }, { rootMargin: '-30% 0px -40% 0px' }).observe(section || block);
}
