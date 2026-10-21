import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  moveInstrumentation, holdPicture, isAuthoring, takeRichtext, applyRichtext,
} from '../../scripts/scripts.js';

/*
 * Parallax Collage: heading + paragraph pinned in the centre of the screen while two "screens"
 * of image cards scroll over it.
 *   Screen 1: a large hero card (the engine) on top of the text + 4 cards near the edges.
 *   Hold phase: the 4 cards stay still while
 *     1. enter (--hold-enter svh of scroll): the hero starts scaled up on the right and slides /
 *        shrinks into its centre slot (--enter 0 → 1);
 *     2. fade (--hold-fade svh): the hero fades out, revealing the text (--fade 0 → 1);
 *     3. optional swap (--hold-shift svh, default 0): the card layer moves up by --shift-by svh
 *        (e.g. screen 1's cards out, screen 2's in), still pinned (--shift 0 → 1);
 *     4. optional rest (--hold-rest svh, default 0): everything holds.
 *   Then the image layer scrolls 1:1 with the page; after a gap, screen 2 (4 cards) scrolls in
 *   and settles around the text, where the page ends.
 * Rows:
 *   1.  heading + paragraph
 *   2+. image | optional modifier: "large" marks the hero image (default: the first image).
 *       The next 4 images fill screen 1, the following 4 screen 2 (extra images are ignored).
 * Both phase ends are published as data-scroll-stops for the eased wheel scroller
 * (scripts/scroll-stops.js): one gesture lands the hero in its slot, the next fades it out.
 */

// the window size for the per-frame scroll code, kept from resize events (reading innerWidth /
// innerHeight there would force a layout after the frame's style writes)
const view = { w: window.innerWidth, h: window.innerHeight };
window.addEventListener('resize', () => {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
}, { passive: true });

const CARDS_PER_SCREEN = 4;
const CARD_CLASSES = ['card-a', 'card-b', 'card-c', 'card-d'];
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

/*
 * The image of a row: an <img>, or a link to an image file. AEM delivers an image reference it
 * can't resolve (an asset that isn't in AEM Assets yet) as a plain link; placeholder images under
 * a /drafts/ folder are then loaded from the copy in this repository.
 */
function rowImage(row) {
  const img = row.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...row.querySelectorAll('a[href]')]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return {
    src: drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts)}` : link.href,
    alt: link.textContent.trim(),
    source: link,
  };
}

function buildItem(row, image, className) {
  const item = document.createElement('figure');
  item.className = `item ${className}`;
  moveInstrumentation(row, item);
  const picture = createOptimizedPicture(image.src, image.alt, false, [{ width: '750' }]);
  moveInstrumentation(image.source, picture.querySelector('img'));
  // below the fold: decoded off the main thread; the hero card is decoded ahead once loaded
  // instead (it slides in / is handed over mid-animation, where a blank frame would show)
  const img = picture.querySelector('img');
  if (className === 'engine') img.addEventListener('load', () => img.decode().catch(() => {}), { once: true });
  else img.decoding = 'async';
  item.append(picture);
  return item;
}

export default function decorate(block) {
  const [textRow, ...imageRows] = [...block.children];

  // pinned text
  const content = document.createElement('div');
  content.className = 'content';
  if (textRow) {
    const cell = textRow.lastElementChild || textRow;
    moveInstrumentation(textRow, content);
    // (authoring: the column itself is the editable rich text, no editor wrapper inside its flex
    // layout)
    const richtext = takeRichtext(cell);
    content.append(...cell.childNodes);
    applyRichtext(content, richtext);
    content.querySelector('h1, h2, h3, h4, h5, h6')?.classList.add('parallax-collage-heading');
    content.querySelectorAll('p').forEach((p) => p.classList.add('parallax-collage-subtitle'));
  }
  const textLayer = document.createElement('div');
  textLayer.className = 'sticky-text-layer';
  textLayer.append(content);

  // image cards in authored order; "large" picks the hero
  const images = imageRows.map((row) => {
    const image = rowImage(row);
    if (!image) return null;
    const modifier = [...row.children].find((c) => !c.contains(image.source))?.textContent || '';
    return { row, image, large: /\blarge\b/i.test(modifier) };
  }).filter(Boolean);
  const hero = images.splice(Math.max(images.findIndex((i) => i.large), 0), 1)[0];

  const screens = [1, 2].map((n) => {
    const screen = document.createElement('div');
    screen.className = `screen-${n}`;
    return screen;
  });
  if (hero) {
    const item = buildItem(hero.row, hero.image, 'engine');
    // a preceding engine showcase hands its own engine image over to this card (data-hero-carried):
    // the authored image is then not fetched unless the showcase restores it
    if (block.dataset.heroCarried !== undefined && !isAuthoring()) holdPicture(item.querySelector('picture'));
    screens[0].append(item);
  }
  images.slice(0, CARDS_PER_SCREEN * 2).forEach(({ row, image }, i) => {
    const screen = screens[Math.floor(i / CARDS_PER_SCREEN)];
    screen.append(buildItem(row, image, CARD_CLASSES[i % CARDS_PER_SCREEN]));
  });

  const imagesLayer = document.createElement('div');
  imagesLayer.className = 'scrolling-images-layer';
  imagesLayer.append(...screens);
  block.replaceChildren(textLayer, imagesLayer);

  // authoring (Universal Editor, see isAuthoring): static, text and both screens of cards one after
  // the other (see CSS); no hold phases, no scroll stops
  if (isAuthoring()) return;

  // the phase lengths in px (CSS custom properties) and the wheel stops: read again only when the
  // block's classes or the window size change, as reading them on every frame forces a restyle
  let phases = { key: '' };
  const measure = () => {
    const key = `${block.className}|${view.w}x${view.h}`;
    if (phases.key === key) return phases;
    const style = getComputedStyle(block);
    const svh = textLayer.clientHeight / 100;
    const len = (name) => (parseFloat(style.getPropertyValue(name)) || 0) * svh;
    const enter = len('--hold-enter');
    const fade = len('--hold-fade');
    const shift = len('--hold-shift');
    const hold = enter + fade + shift + len('--hold-rest');
    // wheel stops: the end of each phase, or where --pc-stops puts them (svh from the block top)
    const custom = style.getPropertyValue('--pc-stops').trim().split(/\s+/).filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    const stops = (custom.length ? custom.map((v) => v * svh) : [enter, hold])
      .map(Math.round).join(' ');
    const measured = {
      key, enter, fade, shift, shiftBy: len('--shift-by'), hold, stops,
    };
    if (enter + fade > 0) phases = measured; // (not kept while the CSS is still loading)
    return measured;
  };

  // hold phase: cancel the scroll on the image layer while the hero enters, then fades (frames
  // that change nothing, before and after the hold, write nothing)
  let ticking = false;
  let applied = '';
  const update = () => {
    ticking = false;
    const {
      key, enter, fade, shift, shiftBy, hold, stops,
    } = measure();
    if (enter + fade <= 0) return; // not laid out yet (CSS still loading): stay at the start
    const held = Math.min(hold, Math.max(0, -block.getBoundingClientRect().top));
    const state = `${key}|${held.toFixed(1)}`;
    if (state === applied) return;
    applied = state;
    const part = (from, length) => (length ? Math.min(Math.max(held - from, 0) / length, 1) : 1);
    const shifted = shift ? part(enter + fade, shift) : 0;
    // the layer is held against the scroll, less the swap's movement
    imagesLayer.style.transform = `translate3d(0, ${(held - shiftBy * shifted).toFixed(1)}px, 0)`;
    // the progress goes on the hero card, its only user (on the block it would restyle it all)
    const heroCard = imagesLayer.querySelector('.engine') || block;
    heroCard.style.setProperty('--enter', part(0, enter).toFixed(4));
    heroCard.style.setProperty('--fade', part(enter, fade).toFixed(4));
    heroCard.style.setProperty('--shift', shifted.toFixed(4));
    if (block.dataset.scrollStops !== stops) block.dataset.scrollStops = stops;
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // re-measure once the block's CSS has loaded and whenever its size changes
  new ResizeObserver(onScroll).observe(block);
  update();

  // eased wheel scrolling between the stops, once the page has loaded
  const startWheel = () => import('../../scripts/scroll-stops.js').then(({ default: init }) => init());
  if (document.readyState === 'complete') startWheel();
  else window.addEventListener('load', startWheel, { once: true });
}
