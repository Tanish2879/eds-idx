// Columns "Split" style (product page, PHEV), loaded by columns.js only when the style is used.
// Row 1, two columns = two panes side by side (stacked on phones), each authored as:
//   a link to an MP4 file      → the pane's background video (an Image, if any, is its poster)
//   the first heading          → the pane's big label (e.g. "On the open road")
//   paragraphs starting bold   → the stats of its frosted card ("**1100+ KM** range")
//   the next heading           → the card's heading; other paragraphs → the card's text
// Row 2 (optional) = the film card: column 1 an Image (its thumbnail), column 2 a Text: an
// eyebrow paragraph, a short line, the link to the MP4 film, then an optional heading and text
// shown with the film.
// The panes overlap: from 900px the first is clipped at a seam that moves to the half the mouse
// is over (or a tapped half) and shows that pane's card; on phones the first wipes away to the
// second on a scroll gesture. Under reduced motion phones stack them instead.

import {
  createLoopVideo, createPlayBadge, findVideoLink, isAuthoring, openFilm, playWhileVisible,
} from '../../scripts/utils/film.js';

const isHeading = (el) => /^H[1-6]$/.test(el.tagName);
// a paragraph that opens with bold text: a stat (value in bold, then its label)
const isStat = (el) => el.tagName === 'P' && el.firstElementChild?.matches('strong, b')
  && el.textContent.trim().startsWith(el.firstElementChild.textContent.trim());

// the line (paragraph or button container) that holds an element
const lineOf = (el, cell) => {
  let line = el;
  while (line.parentElement && line.parentElement !== cell
    && !line.parentElement.matches('[data-aue-type="component"], [data-aue-type="richtext"]')) {
    line = line.parentElement;
  }
  return line;
};

/**
 * Lays out one pane: background media, label and frosted card.
 * @param {Element} cell the column (kept, with its Universal Editor instrumentation)
 * @param {boolean} authoring
 * @returns {{ playback: object|null }}
 */
function decoratePane(cell, authoring) {
  cell.classList.add('split-pane');
  const link = findVideoLink(cell);
  const img = cell.querySelector('img');
  if (img) lineOf(img.closest('picture') || img, cell).classList.add('split-poster');
  // the link stays (hidden) so Universal Editor can still edit it
  if (link) lineOf(link, cell).classList.add('split-video-link');

  // the content elements (inside the rich-text wrappers Universal Editor adds)
  const els = [...cell.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol')]
    .filter((el) => !el.parentElement.closest('p, ul, ol, h1, h2, h3, h4, h5, h6')
      && !el.matches('.split-video-link, .split-poster') && el.textContent.trim());
  const label = els.find(isHeading) || null;
  label?.classList.add('split-label');
  const statEls = els.filter((el) => el !== label && isStat(el));
  const textEls = els.filter((el) => el !== label && !statEls.includes(el));
  statEls.forEach((el) => {
    el.classList.add('split-stat');
    el.firstElementChild.classList.add('split-stat-value');
    // (the value's element is always the paragraph's only one, so CSS can't tell it has no label)
    if (el.textContent.trim() === el.firstElementChild.textContent.trim()) {
      el.classList.add('split-stat-solo');
    }
  });
  textEls.filter(isHeading).forEach((el) => el.classList.add('split-card-title'));

  // in Universal Editor nothing moves, so every component stays selectable and editable
  if (authoring) return { playback: null };

  const media = document.createElement('div');
  media.className = 'split-media';
  let playback = null;
  if (img) media.append(img.closest('picture') || img);
  if (link) {
    const video = createLoopVideo(link.href, img?.currentSrc || img?.src || '');
    video.className = 'split-video';
    media.append(video);
    playback = playWhileVisible(video, cell);
  }

  const card = document.createElement('div');
  card.className = 'split-card';
  if (statEls.length) {
    const stats = document.createElement('div');
    stats.className = 'split-stats';
    stats.append(...statEls);
    card.append(stats);
  }
  if (textEls.length) {
    const text = document.createElement('div');
    text.className = 'split-card-text';
    text.append(...textEls);
    card.append(text);
  }

  cell.prepend(media);
  if (label) media.after(label);
  if (card.children.length) cell.append(card);
  return { playback };
}

/**
 * Lays out the film card row: thumbnail, eyebrow and line, one button that plays the film.
 * @param {Element} row
 */
function decorateFilm(row, authoring) {
  const link = findVideoLink(row);
  // no film link: the card isn't authored, so the page leaves it out (the editor keeps it)
  if (!link) {
    if (authoring) row.classList.add('split-film', 'split-film-empty');
    else row.remove();
    return;
  }
  row.classList.add('split-film');
  const cells = [...row.children];
  const thumbCell = cells.find((c) => c.querySelector('img') && !c.contains(link));
  const textCell = cells.find((c) => c.contains(link)) || cells[cells.length - 1];
  thumbCell?.classList.add('split-film-media');
  textCell.classList.add('split-film-copy');
  thumbCell?.querySelector('picture, img')?.after(createPlayBadge());
  lineOf(link, textCell).classList.add('split-video-link');

  // before the link: eyebrow and line; after it: what the film's dialog shows
  const els = [...textCell.querySelectorAll('h1, h2, h3, h4, h5, h6, p')]
    .filter((el) => !el.matches('.split-video-link') && el.textContent.trim());
  const linkLine = textCell.querySelector('.split-video-link');
  const before = [];
  const after = [];
  els.forEach((el) => {
    // eslint-disable-next-line no-bitwise
    const isAfter = linkLine.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    (isAfter ? after : before).push(el);
  });
  const [eyebrow] = before;
  eyebrow?.classList.add('split-film-eyebrow');
  before.slice(1).forEach((el) => el.classList.add('split-film-text'));
  after.forEach((el) => el.classList.add('split-film-detail'));
  const detailTitle = after.find(isHeading);

  // Universal Editor: no button over the card, so its components stay selectable
  if (authoring) return;
  const thumb = thumbCell?.querySelector('img');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'split-film-open';
  button.setAttribute('aria-haspopup', 'dialog');
  const name = eyebrow?.textContent.trim() || 'Watch the film';
  button.setAttribute('aria-label', `Watch: ${detailTitle?.textContent.trim() || name}`);
  button.addEventListener('click', () => openFilm({
    src: link.href,
    poster: thumb?.currentSrc || thumb?.src || '',
    eyebrow: name,
    title: detailTitle?.textContent.trim() || name,
    body: after.filter((el) => el !== detailTitle),
    className: 'is-split', // its text limits (film.css)
  }, button));
  row.append(button);
}

// how long the panes take to move (columns-split.css: the seam and the phone wipe)
const MOVE_MS = 1100;
const desktop = () => window.matchMedia('(width >= 900px)').matches;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Which pane leads. From 900px: hovering a half widens it and shows its card (`left`/`right`),
 * `none` leaves the seam in the middle; without hover, a tap does the same and a second tap
 * goes back. On phones the panes are stacked one over the other: `left` shows the first, and
 * the page's section snap (or a tap) wipes it away to the second.
 * @param {Element} block
 * @param {Element} frame the pane row
 */
function wireSides(block, frame) {
  let side = '';
  let movedAt = 0;
  const set = (next) => {
    if (next === side) return;
    side = next;
    movedAt = performance.now();
    frame.dataset.side = next;
  };
  const rest = () => (desktop() ? 'none' : 'left');
  set(rest());

  const ignore = (e) => e.target.closest('.split-film');
  const half = (e) => {
    const { left, width } = frame.getBoundingClientRect();
    return e.clientX - left < width / 2 ? 'left' : 'right';
  };
  frame.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !desktop() || ignore(e)) return;
    set(half(e));
  });
  frame.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && desktop()) set('none');
  });
  block.addEventListener('click', (e) => {
    if (ignore(e)) return;
    if (desktop()) {
      if (window.matchMedia('(hover: hover)').matches) return;
      set(side === 'none' ? half(e) : 'none');
    } else if (!reduceMotion()) {
      set(side === 'left' ? 'right' : 'left');
    }
  });
  window.matchMedia('(width >= 900px)').addEventListener('change', () => set(rest()));
  // off screen: back to the start, or (phones, left below) to the second pane
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) return;
    set(!desktop() && entry.boundingClientRect.top < 0 ? 'right' : rest());
  }).observe(block);

  // phones: a scroll gesture wipes to the second pane before the page moves on
  const section = block.closest('.section');
  if (!section) return;
  const stepping = () => !desktop() && !reduceMotion();
  import('../../scripts/section-snap.js').then((mod) => mod.registerBlockScroll(section, {
    canScrollDown: () => stepping() && side === 'left',
    canScrollUp: () => stepping() && side === 'right',
    scrollDown: () => set('right'),
    scrollUp: () => set('left'),
    isBusy: () => stepping() && performance.now() - movedAt < MOVE_MS,
  })).catch(() => {});
}

/**
 * @param {Element} block the columns block
 */
export default function decorateSplit(block) {
  const authoring = isAuthoring(block);
  block.classList.toggle('is-authoring', authoring);
  const [paneRow, ...rows] = [...block.children];
  if (!paneRow) return;
  paneRow.classList.add('split-frame');
  // the panes are clipped, positioned layers that never scroll themselves: without this the
  // page's section snap takes them for an overlay and leaves the wheel to them, so it can't move on
  block.dataset.snapPassthrough = '';
  const panes = [...paneRow.children];
  panes[0]?.classList.add('split-left');
  panes[1]?.classList.add('split-right');
  panes.forEach((cell) => decoratePane(cell, authoring));

  const seam = document.createElement('span');
  seam.className = 'split-seam';
  seam.setAttribute('aria-hidden', 'true');
  paneRow.append(seam);

  rows.forEach((row) => decorateFilm(row, authoring));
  if (!authoring && panes.length > 1) wireSides(block, paneRow);
}
