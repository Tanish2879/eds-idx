// Cards "Features" style (product page: Performance, Technology, Safety).

import { createOptimizedPicture } from '../../scripts/aem.js';
import snapRow from '../../scripts/utils/snap-row.js';

// html class read by section-snap.js and styles.css to hold the page still (as blocks/modal)
const OPEN_CLASS = 'is-modal-open';
let uid = 0;

// the most characters the one-word texts may have (published page; Universal Editor keeps the
// whole text): the section's figure and unit (e.g. "359" "PS"), a stat tile's value (e.g.
// "1.5L Turbo GDI"). Longer ones end in "…"; the other texts are cut by line (cards-features.css)
const MAX_CHARS = { figure: 4, unit: 4, value: 16 };
const clipText = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const isHeading = (el) => /^H[1-6]$/.test(el?.tagName || '');
const isAuthoring = (block) => !!block.closest('[data-aue-resource]')
  || !!document.querySelector('[data-aue-resource]');

// a paragraph that is bold all through: a stat value
function isBoldLine(el) {
  if (el?.tagName !== 'P') return false;
  const bold = el.querySelector('strong, b');
  return !!bold && bold.textContent.trim() === el.textContent.trim();
}

/**
 * A larger copy of the card's picture for the detail, for this site's own raster images
 * (createOptimizedPicture keeps only the path); null for others, which the detail shows as
 * the card does. Loaded at once, so it can be ready by the time the card is opened.
 * @param {HTMLImageElement} img
 * @returns {HTMLPictureElement|null}
 */
function detailPicture(img) {
  const url = new URL(img.currentSrc || img.src, window.location.href);
  if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return null;
  const picture = createOptimizedPicture(img.src, img.alt, true, [{ media: '(min-width: 600px)', width: '1200' }, { width: '750' }]);
  picture.querySelector('img').loading = 'eager';
  return picture;
}

/**
 * Classes a card's parts and reads what its detail shows.
 * @param {HTMLLIElement} li
 * @param {boolean} authoring
 * @returns {object|null} the card, or null when it has no detail to open
 */
function readCard(li, authoring) {
  const body = li.querySelector('.card-body');
  const img = li.querySelector('.card-image img');
  const els = body
    ? [...body.children].filter((el) => el.textContent.trim() || el.querySelector('img'))
    : [];
  // an optional eyebrow: a plain paragraph just before the title heading (e.g. "Technology")
  const eyebrow = els[0]?.tagName === 'P' && !isBoldLine(els[0]) && isHeading(els[1])
    ? els.shift() : null;
  const first = els[0];
  const stat = isBoldLine(first);
  const title = isHeading(first) || stat ? els.shift() : null;
  const line = els.shift() || null;
  const detail = els;
  const detailTitle = isHeading(detail[0]) ? detail[0] : null;

  li.classList.add('ft-card');
  li.classList.toggle('is-stat', stat);
  // shown in the detail only; Universal Editor keeps it visible so it stays editable
  eyebrow?.classList.add('ft-card-eyebrow');
  if (eyebrow && !authoring) eyebrow.hidden = true;
  title?.classList.add('ft-title');
  line?.classList.add('ft-line');

  if (detail.length) {
    // the detail stays in the card, hidden; Universal Editor shows it so it stays editable
    const more = document.createElement('div');
    more.className = 'ft-more';
    if (!authoring) more.hidden = true;
    detail[0].before(more);
    more.append(...detail);
  }
  const value = stat && !authoring && title.querySelector('strong, b');
  if (value && !value.children.length) {
    value.textContent = clipText(value.textContent.trim(), MAX_CHARS.value);
  }
  // no popup content: no "+" and nothing opens
  if (!detail.length) {
    li.classList.add('no-detail');
    return null;
  }

  const name = (detailTitle || title || line)?.textContent.trim() || '';
  return {
    li,
    img,
    name,
    eyebrow: eyebrow?.textContent.trim() || '',
    body: detail.filter((el) => el !== detailTitle),
  };
}

/**
 * The detail dialog, shared by all the block's cards. It covers the screen: a shade over the
 * page, and the panel on it. An image card's picture sits apart from the panel, over an empty
 * slot in it, so it can grow out of the card (as the source's .pop); a stat tile's picture is
 * inside its panel, which also has a "next" control.
 * @param {boolean} stats whether the block holds stat tiles
 * @returns {object} the dialog and its parts
 */
function buildDialog(stats) {
  uid += 1;
  const titleId = `ft-detail-title-${uid}`;
  const dialog = document.createElement('dialog');
  dialog.className = 'ft-detail';
  dialog.setAttribute('aria-labelledby', titleId);
  const close = '<button type="button" class="ft-close" aria-label="Close" autofocus><span class="ft-close-icon" aria-hidden="true"></span></button>';
  const media = '<div class="ft-media"><div class="ft-media-pic"></div></div>';
  const body = `<div class="ft-body"${stats ? ' aria-live="polite"' : ''}>
        <p class="ft-eyebrow" hidden></p>
        <h2 class="ft-detail-title" id="${titleId}"></h2>
        <div class="ft-detail-text"></div>
      </div>`;
  const next = `<button type="button" class="ft-next">
        <span class="ft-next-thumb" aria-hidden="true"></span>
        <span class="ft-next-label"></span>
        <span class="ft-next-arrow" aria-hidden="true"></span>
      </button>`;
  dialog.innerHTML = stats
    ? `<div class="ft-back"></div><div class="ft-panel">${close}${media}${body}${next}</div>`
    : `<div class="ft-back"></div><div class="ft-panel"><div class="ft-slot"></div>${body}${close}</div>${media}`;
  const $ = (selector) => dialog.querySelector(selector);
  return {
    dialog,
    back: $('.ft-back'),
    panel: $('.ft-panel'),
    close: $('.ft-close'),
    media: $('.ft-media'),
    pic: $('.ft-media-pic'),
    body: $('.ft-body'),
    eyebrow: $('.ft-eyebrow'),
    title: $('.ft-detail-title'),
    text: $('.ft-detail-text'),
    next: $('.ft-next'),
    nextThumb: $('.ft-next-thumb'),
    nextLabel: $('.ft-next-label'),
  };
}

/* --- motion: the source's GSAP timelines (.pop for image cards, #perfPop for stat tiles),
   played with the Web Animations API; durations in ms, its eases as cubic-bezier curves --- */
const EASE = {
  out2: 'cubic-bezier(0.33, 1, 0.68, 1)', // power2.out
  in2: 'cubic-bezier(0.32, 0, 0.67, 0)', // power2.in
  out3: 'cubic-bezier(0.25, 1, 0.5, 1)', // power3.out
  inOut3: 'cubic-bezier(0.76, 0, 0.24, 1)', // power3.inOut
};

const rectOf = (el) => el.getBoundingClientRect();
const inView = (r) => r.width > 0 && r.right > 0 && r.left < window.innerWidth
  && r.bottom > 0 && r.top < window.innerHeight;
/** a rect (viewport = dialog coordinates) as keyframe geometry */
const box = (r, radius) => ({
  left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius,
});
/** a clip-path showing only the part of the panel that lies over the card */
function clipTo(panel, card, radius) {
  const px = (n) => `${Math.max(0, n).toFixed(1)}px`;
  return `inset(${px(card.top - panel.top)} ${px(panel.right - card.right)} ${px(panel.bottom - card.bottom)} ${px(card.left - panel.left)} round ${radius})`;
}

/**
 * Performance: the section's big figure (a bold paragraph in its default content, e.g.
 * "359 PS"; Universal Editor publishes it as a bare <strong>, the importer inside a <p>) is
 * split into its number and its unit, so the unit can sit small beside the number
 * (cards-features.css). Anything else is left as authored.
 * @param {Element} block the cards block (stat tiles)
 */
function splitSectionFigure(block) {
  const content = block.closest('.section')?.querySelector(':scope > .default-content-wrapper');
  const holder = content && [...content.children]
    .find((el) => isBoldLine(el) || /^(STRONG|B)$/.test(el.tagName));
  const figure = holder?.matches('strong, b') ? holder : holder?.querySelector('strong, b');
  if (!figure || figure.children.length) return;
  const match = figure.textContent.trim().match(/^([\d.,]+)\s+(\S.*)$/);
  if (!match) {
    figure.textContent = clipText(figure.textContent.trim(), MAX_CHARS.figure + MAX_CHARS.unit + 1);
    return;
  }
  const [, value, unitText] = match;
  const number = document.createElement('span');
  number.className = 'ft-figure-number';
  number.textContent = clipText(value, MAX_CHARS.figure);
  // a long figure is set smaller on phones (cards-features.css)
  if (number.textContent.length > 3) number.classList.add('is-long');
  const unit = document.createElement('span');
  unit.className = 'ft-figure-unit';
  unit.textContent = clipText(unitText, MAX_CHARS.unit);
  figure.replaceChildren(number, ' ', unit);
}

/**
 * Image cards: a row of dashes under the rail, one per card, the one for the rail's
 * position marked (as the source's .tech-progress). Decorative: the cards stay reachable
 * by scroll, swipe and Tab.
 * @param {Element} block
 * @param {HTMLUListElement} ul
 */
function decorateProgress(block, ul) {
  const count = ul.children.length;
  if (count < 2) return;
  const progress = document.createElement('div');
  progress.className = 'ft-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.append(...[...ul.children].map(() => document.createElement('i')));
  ul.after(progress);
  const dashes = [...progress.children];
  let frame = 0;
  const update = () => {
    frame = 0;
    const room = ul.scrollWidth - ul.clientWidth;
    const at = room > 0 ? Math.min(1, Math.max(0, Math.abs(ul.scrollLeft) / room)) : 0;
    const active = Math.round(at * (count - 1));
    dashes.forEach((dash, i) => dash.classList.toggle('is-active', i === active));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  ul.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}

/**
 * @param {Element} block the cards block
 * @param {HTMLUListElement} ul the decorated card list (cards.js)
 */
export default function decorateFeatures(block, ul) {
  const authoring = isAuthoring(block);
  block.classList.toggle('is-authoring', authoring);
  const items = [...ul.children];
  const cards = items.map((li) => readCard(li, authoring)).filter(Boolean);
  // all stat tiles (Performance): a row of figures rather than image cards
  block.classList.toggle('is-stats', items.length > 0 && items.every((li) => li.classList.contains('is-stat')));
  if (!authoring && block.classList.contains('is-stats')) splitSectionFigure(block);
  if (!authoring && !block.classList.contains('is-stats')) decorateProgress(block, ul);
  snapRow(ul);
  // in Universal Editor every card stays selectable: no dialog to cover the canvas
  if (authoring || !cards.length) return;

  const stats = block.classList.contains('is-stats');
  const parts = buildDialog(stats);
  const { dialog } = parts;
  block.append(dialog);
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const wide = window.matchMedia('(width >= 600px)');
  const pictures = new Map();
  const buttons = [];
  let current = 0;
  let opener = 0;
  let closing = false;
  let swapping = false;
  let running = [];

  const play = (el, keyframes, options) => {
    const animation = el.animate(keyframes, { fill: 'both', ...options });
    running.push(animation);
    return animation;
  };
  const stop = () => {
    running.forEach((animation) => animation.cancel());
    running = [];
  };
  const finished = () => Promise.all(running.map((animation) => animation.finished));

  // the larger picture, once it has loaded; until then the card's own (already loaded) one
  const pictureFor = (card) => {
    if (!pictures.has(card)) pictures.set(card, detailPicture(card.img));
    const big = pictures.get(card);
    const img = big?.querySelector('img');
    if (img?.complete && img.naturalWidth) return big;
    img?.addEventListener('load', () => {
      if (cards[current] === card && dialog.open) parts.pic.replaceChildren(big);
    }, { once: true });
    return card.img.closest('picture').cloneNode(true);
  };

  const show = (i) => {
    current = i;
    const card = cards[i];
    parts.pic.replaceChildren(...(card.img ? [pictureFor(card)] : []));
    parts.media.hidden = !card.img;
    dialog.classList.toggle('is-text-only', !card.img);
    // the card's own eyebrow above the title (authored before the title), none if not authored
    parts.eyebrow.textContent = card.eyebrow;
    parts.eyebrow.hidden = !card.eyebrow;
    parts.title.textContent = card.name;
    parts.text.replaceChildren(...card.body.map((el) => el.cloneNode(true)));
    if (!stats) return;

    const after = cards[(i + 1) % cards.length];
    parts.next.hidden = cards.length < 2;
    parts.nextLabel.textContent = after.name;
    parts.next.setAttribute('aria-label', `Next: ${after.name}`);
    const thumb = after.img?.closest('picture')?.cloneNode(true);
    thumb?.querySelector('img')?.setAttribute('alt', '');
    parts.nextThumb.replaceChildren(...(thumb ? [thumb] : []));
  };

  // what fades in after the panel: the copy, then the close button
  const copy = () => [...parts.body.children].filter((el) => !el.hidden).concat(parts.close);

  // image cards: the picture grows from the card into the panel's slot while the panel opens
  // out from the card's outline; the copy rises in, one part after another
  const openFromCard = (card) => {
    const from = rectOf(card.li);
    const radius = getComputedStyle(card.li).borderRadius;
    const panel = rectOf(parts.panel);
    play(parts.back, { opacity: [0, 1] }, { duration: 500, easing: EASE.out2 });
    const clip = getComputedStyle(parts.panel).clipPath;
    play(parts.panel, { clipPath: [clipTo(panel, from, radius), clip] }, {
      duration: 800, easing: EASE.inOut3,
    });
    if (!parts.media.hidden) {
      const to = box(rectOf(parts.media), getComputedStyle(parts.media).borderRadius);
      play(parts.media, [box(from, radius), to], { duration: 800, easing: EASE.inOut3 });
      play(parts.pic, { scale: [1.06, 1] }, { duration: 1100, easing: EASE.out3 });
    }
    copy().forEach((el, n) => play(el, {
      opacity: [0, 1], translate: ['0 14px', '0 0'], filter: ['blur(6px)', 'blur(0)'],
    }, { duration: 500, delay: 300 + n * 50, easing: EASE.out3 }));
  };

  // and back: the copy fades, the picture and the panel shrink into the card, the shade goes
  const closeToCard = (card) => {
    const to = rectOf(card.li);
    const radius = getComputedStyle(card.li).borderRadius;
    // from where things are now, should the opening still be playing
    const panel = rectOf(parts.panel);
    const clip = getComputedStyle(parts.panel).clipPath;
    const media = box(rectOf(parts.media), getComputedStyle(parts.media).borderRadius);
    const shade = getComputedStyle(parts.back).opacity;
    const fade = copy().map((el) => [el, getComputedStyle(el).opacity]);
    stop();
    if (!inView(to)) {
      // the card has gone from view: the whole detail fades
      [parts.back, parts.panel, parts.media].forEach((el) => play(el, {
        opacity: [getComputedStyle(el).opacity, 0],
      }, { duration: 400, delay: 100, easing: EASE.in2 }));
      return;
    }
    const shrink = { duration: 700, delay: 50, easing: EASE.inOut3 };
    fade.forEach(([el, opacity]) => play(el, { opacity: [opacity, 0] }, {
      duration: 200, easing: EASE.in2,
    }));
    play(parts.panel, { clipPath: [clip, clipTo(panel, to, radius)] }, shrink);
    if (!parts.media.hidden) play(parts.media, [media, box(to, radius)], shrink);
    play(parts.back, { opacity: [shade, 0] }, { duration: 500, delay: 300, easing: EASE.in2 });
  };

  // stat tiles: a sheet up from the foot of the screen on phones, else the panel rises in
  const openSheet = () => {
    play(parts.back, { opacity: [0, 1] }, { duration: 500, easing: EASE.out2 });
    play(parts.panel, wide.matches
      ? { opacity: [0, 1], translate: ['0 36px', '0 0'], scale: [0.98, 1] }
      : { translate: ['0 100%', '0 0'] }, { duration: wide.matches ? 700 : 550, delay: 100, easing: EASE.out3 });
  };

  const closeSheet = () => {
    const shade = getComputedStyle(parts.back).opacity;
    const { opacity, translate, scale } = getComputedStyle(parts.panel);
    stop();
    play(parts.panel, wide.matches
      ? { opacity: [opacity, 0], translate: [translate, '0 24px'], scale: [scale, scale] }
      : { translate: [translate, '0 100%'] }, { duration: 350, easing: EASE.in2 });
    play(parts.back, { opacity: [shade, 0] }, { duration: 450, delay: 100 });
  };

  const open = (i) => {
    if (dialog.open) return;
    opener = i;
    show(i);
    document.documentElement.classList.add(OPEN_CLASS);
    // native modal: focus moves in (to the close button), the page behind is inert
    dialog.showModal();
    if (!motion.matches) return;
    if (stats) openSheet();
    else openFromCard(cards[i]);
  };

  const requestClose = () => {
    if (!dialog.open || closing) return;
    if (!motion.matches) {
      dialog.close();
      return;
    }
    closing = true;
    if (stats) closeSheet();
    else closeToCard(cards[current]);
    finished().then(() => dialog.close(), () => {});
  };

  // stat tiles: the copy, picture and next control fade out, change, and rise back in
  const showNext = () => {
    const i = (current + 1) % cards.length;
    if (!motion.matches) {
      show(i);
      return;
    }
    if (swapping) return;
    swapping = true;
    const parts$ = () => [parts.media, parts.title, parts.text, parts.next]
      .filter((el) => !el.hidden);
    const out = parts$().map((el, n) => play(el, { opacity: [1, 0], translate: ['0 0', '0 10px'] }, { duration: 200, delay: n * 30 }));
    Promise.all(out.map((animation) => animation.finished)).then(() => {
      show(i);
      parts$().forEach((el, n) => play(el, { opacity: [0, 1], translate: ['0 10px', '0 0'] }, { duration: 350, delay: n * 50, easing: EASE.out3 }));
      out.forEach((animation) => animation.cancel());
      running = running.filter((animation) => !out.includes(animation));
    }, () => {}).finally(() => { swapping = false; });
  };

  // Escape: closed the same way as the close button (Chrome may close at once on a second
  // Escape; the close handler below tidies up either way)
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose();
  });
  dialog.addEventListener('close', () => {
    stop();
    closing = false;
    swapping = false;
    document.documentElement.classList.remove(OPEN_CLASS);
    // back to the card that was opened
    buttons[opener].focus({ preventScroll: true });
  });
  parts.close.addEventListener('click', requestClose);
  parts.back.addEventListener('click', requestClose);
  parts.next?.addEventListener('click', showNext);

  cards.forEach((card, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ft-open';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `More about ${card.name}`);
    button.innerHTML = '<span class="ft-open-icon" aria-hidden="true"></span>';
    buttons[i] = button;
    // a stat tile's "+" follows its value; an image card's sits in its corner
    const statTitle = card.li.classList.contains('is-stat') && card.li.querySelector('.ft-title');
    (statTitle || card.li).append(button);
    // the whole card opens it; a key press on the button reaches here as a click too
    card.li.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      open(i);
    });
    // the larger picture starts loading as the pointer or focus reaches the card
    const warm = () => {
      if (card.img && !pictures.has(card)) pictures.set(card, detailPicture(card.img));
    };
    card.li.addEventListener('pointerenter', warm, { once: true });
    card.li.addEventListener('focusin', warm, { once: true });
  });
}
