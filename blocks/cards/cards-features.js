// Cards "Features" style (product page: Performance, Technology, Safety).

import { createOptimizedPicture } from '../../scripts/aem.js';

// html class read by section-snap.js and styles.css to hold the page still (as blocks/modal)
const OPEN_CLASS = 'is-modal-open';
let uid = 0;

// the most characters the texts may have (published page; Universal Editor keeps the whole
// text): the section's figure and unit (e.g. "359" "PS"), a stat tile's value (e.g. "1.5L Turbo
// GDI"), and a stat tile's description in its pop-up (250: at most six lines on phones, as the
// Figma's compact panel, never a scroll). Longer ones end in "…"; the other texts are cut by
// line (cards-features.css)
const MAX_CHARS = {
  figure: 4, unit: 4, value: 16, detail: 250,
};
const clipText = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * Cuts a run of elements (rich text: paragraphs, lists) to `max` characters in all, at a word
 * where it can, ending in "…"; elements past the limit, and those left empty, are dropped
 * @param {Element[]} els
 * @param {number} max
 * @returns {Element[]} the elements that remain
 */
function clipElements(els, max) {
  const total = els.reduce((n, el) => n + el.textContent.replace(/\s+/g, ' ').trim().length, 0);
  if (total <= max) return els;
  let left = max;
  els.forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach((text) => {
      const value = text.textContent.replace(/\s+/g, ' ');
      if (left <= 0) {
        text.remove();
      } else if (value.trim().length <= left) {
        left -= value.trim().length;
      } else {
        const cut = value.slice(0, Math.max(0, left - 1));
        const atWord = cut.replace(/\s+\S*$/, '');
        text.textContent = `${(atWord.length >= left / 2 ? atWord : cut).replace(/[\s.,;:–-]+$/, '')}…`;
        left = 0;
      }
    });
    [...el.querySelectorAll('*')].reverse().forEach((child) => {
      if (!child.textContent.trim() && !child.querySelector('img, picture, br')) child.remove();
    });
  });
  return els.filter((el) => el.textContent.trim());
}

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
  if (!detail.length && !img) return null;

  const name = (detailTitle || title || line)?.textContent.trim() || '';
  const value = stat && !authoring && title.querySelector('strong, b');
  if (value && !value.children.length) {
    value.textContent = clipText(value.textContent.trim(), MAX_CHARS.value);
  }
  const copy = detail.filter((el) => el !== detailTitle);
  return {
    li,
    img,
    name,
    eyebrow: eyebrow?.textContent.trim() || '',
    // a stat tile's description, as its pop-up shows it: a copy cut to MAX_CHARS.detail
    body: stat && !authoring
      ? clipElements(copy.map((el) => el.cloneNode(true)), MAX_CHARS.detail)
      : copy,
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
 * Performance: a video authored in the section's picture place (a Video block, or a video in
 * its text) plays as its background, as the picture: muted, looping, inline, without
 * controls (cards-features.css sets it over the section). A video the Video block adds later
 * is caught as it comes. With reduced motion it stays on its first frame
 * @param {Element} block
 */
function playSectionVideos(block) {
  const section = block.closest('.section');
  if (!section) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const asBackground = (video) => {
    if (video.closest('.cards') || video.dataset.ftBackground) return;
    video.dataset.ftBackground = 'true';
    video.controls = false;
    video.removeAttribute('controls');
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.disablePictureInPicture = true;
    if (still) {
      video.autoplay = false;
      video.pause();
      return;
    }
    video.autoplay = true;
    video.play()?.catch(() => {});
  };
  section.querySelectorAll('video').forEach(asBackground);
  new MutationObserver(() => section.querySelectorAll('video').forEach(asBackground))
    .observe(section, { childList: true, subtree: true });
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
 * Stat tiles, more than four: a light arrow at each end of the row, shown only while there is
 * more that way (and only while the row scrolls at all). A click moves on a view: the four
 * tiles across on desktop, a page of four on phones (the row's width and one gap)
 * @param {Element} block
 * @param {HTMLUListElement} ul
 */
function wireRailArrows(block, ul) {
  const arrow = (dir, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ft-rail-arrow ft-rail-${dir}`;
    button.setAttribute('aria-label', label);
    button.hidden = true;
    block.append(button);
    return button;
  };
  const prev = arrow('prev', 'Previous');
  const next = arrow('next', 'Next');
  let frame = 0;
  const update = () => {
    frame = 0;
    const room = ul.scrollWidth - ul.clientWidth;
    const at = Math.abs(ul.scrollLeft);
    prev.hidden = room <= 1 || at <= 1;
    next.hidden = room <= 1 || at >= room - 1;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const move = (dir) => {
    const gap = parseFloat(getComputedStyle(ul).columnGap) || 0;
    const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    ul.scrollBy({ left: dir * (block.clientWidth + gap), behavior: smooth ? 'smooth' : 'auto' });
  };
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  ul.addEventListener('scroll', schedule, { passive: true });
  new ResizeObserver(schedule).observe(ul);
  update();
}

/**
 * A row that scrolls sideways follows a mouse drag (touch and trackpads scroll it natively).
 * While dragged it does not snap; let go, it eases to the nearest stop, or the next one in the
 * drag's direction after a short flick. A drag does not open the tile it ends on
 * @param {HTMLUListElement} ul
 */
function wireDragScroll(ul) {
  let drag = null;
  let timer = 0;
  // snapping comes back once the row has reached its stop (it is one: no jump)
  const settle = () => {
    clearTimeout(timer);
    ul.removeEventListener('scrollend', settle);
    ul.classList.remove('is-dragging');
  };
  ul.addEventListener('dragstart', (e) => { if (drag) e.preventDefault(); });
  ul.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (ul.scrollWidth <= ul.clientWidth + 1) return;
    drag = {
      id: e.pointerId, x: e.clientX, left: ul.scrollLeft, moved: false,
    };
  });
  ul.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      // a drag that starts while the row still eases to a stop takes over from there
      clearTimeout(timer);
      ul.removeEventListener('scrollend', settle);
      drag.left = ul.scrollLeft;
      ul.setPointerCapture(e.pointerId);
      ul.classList.add('is-dragging', 'is-grabbing');
      window.getSelection()?.removeAllRanges();
    }
    ul.scrollLeft = drag.left - dx;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, left } = drag;
    const dx = e.clientX - drag.x;
    drag = null;
    if (!moved) return;
    ul.classList.remove('is-grabbing');
    // the click that ends the drag opens nothing
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    ul.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => ul.removeEventListener('click', swallow, { capture: true }), 0);
    // the stops: the tiles that snap, where the row puts them (its scroll padding)
    const pad = parseFloat(getComputedStyle(ul).scrollPaddingInlineStart) || 0;
    const rowLeft = ul.getBoundingClientRect().left;
    const room = ul.scrollWidth - ul.clientWidth;
    const stops = [...ul.children]
      .filter((li) => getComputedStyle(li).scrollSnapAlign !== 'none')
      .map((li) => {
        const at = ul.scrollLeft + li.getBoundingClientRect().left - rowLeft - pad;
        return Math.min(room, Math.max(0, at));
      });
    if (!stops.length) {
      settle();
      return;
    }
    const nearest = (at) => stops
      .reduce((best, s) => (Math.abs(s - at) < Math.abs(best - at) ? s : best));
    let target = nearest(ul.scrollLeft);
    // a short flick still moves on one stop, in its direction
    if (target === nearest(left) && Math.abs(dx) > 40) {
      const ahead = dx < 0
        ? stops.find((s) => s > left + 1)
        : [...stops].reverse().find((s) => s < left - 1);
      if (ahead !== undefined) target = ahead;
    }
    const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    ul.addEventListener('scrollend', settle);
    timer = setTimeout(settle, 700);
    ul.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
  };
  ul.addEventListener('pointerup', end);
  ul.addEventListener('pointercancel', end);
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
  if (!authoring && block.classList.contains('is-stats')) {
    splitSectionFigure(block);
    playSectionVideos(block);
    wireDragScroll(ul);
    if (items.length > 4) wireRailArrows(block, ul);
  }
  if (!authoring && !block.classList.contains('is-stats')) decorateProgress(block, ul);
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
    // each card's copy from its start (it scrolls in the stat panel)
    parts.body.scrollTop = 0;
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
    // Safari may scroll the dialog to the close button while the sheet is still below the
    // screen (the CSS clips it, so it cannot; older Safari: put it back)
    dialog.scrollTop = 0;
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
