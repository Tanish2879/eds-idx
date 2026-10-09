import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Hero Interactive: full-viewport hero with corner-pinned content.
 * Rows (2-column key/value tables are tolerated: the last cell is the value):
 *   1. background media — image, or a link/reference to a video file
 *   2. heading
 *   3. description
 *   4. CTA link (a trailing "+" in the label becomes the icon)
 *   5+. slide images feeding the "current / total" counter
 */

const VIDEO_RE = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const LABELS = {
  prev: 'Previous slide',
  next: 'Next slide',
  scroll: 'Scroll',
  slides: 'Slides',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  children.flat().forEach((c) => { if (c) node.append(c); });
  return node;
}

const valueCell = (row) => (row ? row.lastElementChild || row : null);

function optimize(img, eager, widths) {
  const picture = createOptimizedPicture(img.src, img.alt, eager, widths);
  moveInstrumentation(img, picture.querySelector('img'));
  return picture;
}

function buildMedia(cell) {
  if (!cell) return null;
  const link = [...cell.querySelectorAll('a[href]')].find((a) => VIDEO_RE.test(a.href));
  const source = cell.querySelector('video source[src], video[src]');
  const videoSrc = (link && link.href) || (source && source.getAttribute('src'));
  if (videoSrc) {
    const video = el('video', {
      class: 'hero-interactive-video', muted: '', loop: '', playsinline: '', preload: 'metadata', 'aria-hidden': 'true',
    });
    video.muted = true;
    video.src = videoSrc;
    if (!REDUCED_MOTION.matches) {
      video.autoplay = true;
      video.play().catch(() => { /* autoplay can be blocked; the first frame still shows */ });
    }
    return video;
  }
  const img = cell.querySelector('img');
  return img ? optimize(img, true, [{ media: '(min-width: 768px)', width: '2000' }, { width: '900' }]) : null;
}

function buildHeading(cell) {
  if (!cell) return null;
  const existing = cell.querySelector('h1, h2, h3, h4, h5, h6');
  const heading = existing || el('h1', {}, cell.textContent.trim());
  heading.classList.add('hero-interactive-heading', 'hero-interactive-reveal');
  moveInstrumentation(cell, heading);
  return heading.textContent.trim() ? heading : null;
}

function buildDescription(cell) {
  if (!cell || !cell.textContent.trim()) return null;
  const desc = el('div', { class: 'hero-interactive-description hero-interactive-reveal' });
  moveInstrumentation(cell, desc);
  desc.append(...cell.childNodes);
  if (!desc.querySelector('p')) {
    const p = el('p');
    p.append(...desc.childNodes);
    desc.append(p);
  }
  return desc;
}

function buildCta(cell) {
  const a = cell && cell.querySelector('a[href]');
  if (!a) return null;
  const label = a.textContent.trim().replace(/\s*\+\s*$/, '');
  const cta = el('a', { href: a.getAttribute('href'), class: 'hero-interactive-cta hero-interactive-reveal' });
  if (a.title) cta.title = a.title;
  moveInstrumentation(a, cta);
  cta.append(el('span', { class: 'hero-interactive-cta-label' }, label), el('span', { class: 'hero-interactive-cta-icon', 'aria-hidden': 'true' }));
  return cta;
}

function buildScroll(block) {
  const btn = el(
    'button',
    { type: 'button', class: 'hero-interactive-scroll' },
    el('span', { class: 'hero-interactive-scroll-icon', 'aria-hidden': 'true' }),
    el('span', {}, LABELS.scroll),
  );
  btn.addEventListener('click', () => {
    const section = block.closest('.section');
    const next = section && section.nextElementSibling;
    const top = next ? next.getBoundingClientRect().top + window.scrollY : block.offsetHeight;
    window.scrollTo({ top, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
  });
  return btn;
}

/* slider scaffolding: slides cross-fade over the background media */
function setupSlider(block, slides) {
  const total = slides.length;
  const current = el('span', { class: 'hero-interactive-counter-current' }, '1');
  const prev = el('button', { type: 'button', class: 'hero-interactive-arrow hero-interactive-prev', 'aria-label': LABELS.prev });
  const next = el('button', { type: 'button', class: 'hero-interactive-arrow hero-interactive-next', 'aria-label': LABELS.next });
  const counter = el(
    'div',
    { class: 'hero-interactive-counter hero-interactive-reveal', role: 'group', 'aria-label': LABELS.slides },
    prev,
    el('p', { class: 'hero-interactive-counter-text', 'aria-live': 'polite' }, current, el('span', { 'aria-hidden': 'true' }, ' / '), el('span', { class: 'hero-interactive-counter-total' }, String(total))),
    next,
  );
  let index = 0;

  const goTo = (target) => {
    if (!total) return;
    index = ((target % total) + total) % total;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', !active);
      // lazy slides load as they become active
      if (active) slide.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    });
    current.textContent = String(index + 1);
    block.dataset.activeSlide = index;
    block.dispatchEvent(new CustomEvent('hero-interactive:slide', { bubbles: true, detail: { index, total } }));
  };

  prev.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => goTo(index + 1));
  counter.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
  });

  // horizontal swipe on touch screens
  let startX = null;
  block.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') startX = e.clientX; });
  block.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) goTo(index + (dx < 0 ? 1 : -1));
  });

  goTo(0);
  // public API for future transitions (autoplay, deep links, analytics)
  block.heroInteractive = {
    goTo,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    get index() { return index; },
    total,
  };
  return counter;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  const [mediaRow, headingRow, descRow, ctaRow, ...slideRows] = rows;

  const mediaLayer = el('div', { class: 'hero-interactive-media' });
  const media = buildMedia(valueCell(mediaRow));
  if (media) mediaLayer.append(media);
  else block.classList.add('no-media');
  if (mediaRow) moveInstrumentation(mediaRow, mediaLayer);

  const slidesLayer = el('div', { class: 'hero-interactive-slides' });
  const slides = [];
  slideRows.forEach((row) => {
    row.querySelectorAll('img').forEach((img) => {
      const slide = el('div', { class: 'hero-interactive-slide' }, optimize(img, false, [{ media: '(min-width: 768px)', width: '2000' }, { width: '900' }]));
      moveInstrumentation(row, slide);
      slides.push(slide);
      slidesLayer.append(slide);
    });
  });
  mediaLayer.append(slidesLayer, el('div', { class: 'hero-interactive-glow', 'aria-hidden': 'true' }));

  const content = el('div', { class: 'hero-interactive-content' });
  const heading = buildHeading(valueCell(headingRow));
  const bottom = el('div', { class: 'hero-interactive-bottom' });
  const description = buildDescription(valueCell(descRow));
  const cta = buildCta(valueCell(ctaRow));
  if (heading) content.append(heading);
  if (description) bottom.append(description);
  if (slides.length) bottom.append(setupSlider(block, slides));
  if (cta) bottom.append(cta);
  content.append(bottom);

  block.replaceChildren(mediaLayer, content, buildScroll(block));

  // staggered fade-up on load (CSS handles timing; reduced motion shows instantly)
  requestAnimationFrame(() => requestAnimationFrame(() => block.classList.add('is-ready')));
}
