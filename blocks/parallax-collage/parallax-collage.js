import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Parallax Collage: heading + paragraph pinned in the centre of the screen while two "screens"
 * of image cards scroll over it.
 *   Screen 1: a large hero card (the engine) on top of the text + 4 cards near the edges.
 *   Hold phase (--hold svh of scroll): the 4 cards stay still while the hero shrinks into a
 *   small card at the top centre (--progress 0 → 1), revealing the text.
 *   Then the image layer scrolls 1:1 with the page; after a gap, screen 2 (4 cards) scrolls in
 *   and settles around the text, where the page ends.
 * Rows:
 *   1.  heading + paragraph
 *   2+. image | optional modifier: "large" marks the hero image (default: the first image).
 *       The next 4 images fill screen 1, the following 4 screen 2 (extra images are ignored).
 * The hold distance is published as data-scroll-stops for the eased wheel scroller
 * (scripts/scroll-stops.js), so a wheel gesture stops exactly when the hero has shrunk.
 */

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
    src: drafts > 0 ? pathname.slice(drafts) : link.href,
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
    content.append(...cell.childNodes);
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
  if (hero) screens[0].append(buildItem(hero.row, hero.image, 'engine'));
  images.slice(0, CARDS_PER_SCREEN * 2).forEach(({ row, image }, i) => {
    const screen = screens[Math.floor(i / CARDS_PER_SCREEN)];
    screen.append(buildItem(row, image, CARD_CLASSES[i % CARDS_PER_SCREEN]));
  });

  const imagesLayer = document.createElement('div');
  imagesLayer.className = 'scrolling-images-layer';
  imagesLayer.append(...screens);
  block.replaceChildren(textLayer, imagesLayer);

  // hold phase: cancel the scroll on the image layer while the hero shrinks
  let ticking = false;
  const update = () => {
    ticking = false;
    const holdVh = parseFloat(getComputedStyle(block).getPropertyValue('--hold'));
    const hold = (holdVh / 100) * textLayer.clientHeight;
    if (!hold) return; // not laid out yet (CSS still loading): stay at the start
    const held = Math.min(hold, Math.max(0, -block.getBoundingClientRect().top));
    imagesLayer.style.transform = `translate3d(0, ${held.toFixed(1)}px, 0)`;
    block.style.setProperty('--progress', (held / hold).toFixed(4));
    block.dataset.scrollStops = String(Math.round(hold));
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
