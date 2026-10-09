import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Carousel Marquee: continuously auto-scrolling strip of images.
 * Each row is one slide:
 *   1. image (+ alt)
 *   2. optional text (rendered as a caption under the image)
 * The track is duplicated once (aria-hidden, non-focusable) so the CSS
 * animation can loop seamlessly. Motion is paused on hover/focus and disabled
 * for users who prefer reduced motion.
 */

const SECONDS_PER_SLIDE = 3; // source swiper: linear, 3000ms per slide

/* clones must not carry Universal Editor instrumentation (duplicate resource ids) */
function stripInstrumentation(el) {
  [...el.attributes]
    .filter(({ name }) => name.startsWith('data-aue-') || name.startsWith('data-richtext-'))
    .forEach(({ name }) => el.removeAttribute(name));
}

function createSlide(row) {
  const slide = document.createElement('li');
  slide.className = 'carousel-marquee-slide';
  moveInstrumentation(row, slide);

  [...row.children].forEach((cell) => {
    const img = cell.querySelector('picture > img');
    const hasText = cell.textContent.trim().length > 0;
    if (img && !slide.querySelector('.carousel-marquee-slide-image')) {
      const wrap = document.createElement('div');
      wrap.className = 'carousel-marquee-slide-image';
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      wrap.append(optimized);
      slide.append(wrap);
    }
    if (hasText) {
      const caption = document.createElement('div');
      caption.className = 'carousel-marquee-slide-content';
      moveInstrumentation(cell, caption);
      [...cell.childNodes].forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.querySelector('picture')) return;
        caption.append(node);
      });
      slide.append(caption);
    }
  });
  return slide;
}

export default function decorate(block) {
  const rows = [...block.children];
  const viewport = document.createElement('div');
  viewport.className = 'carousel-marquee-viewport';
  const track = document.createElement('ul');
  track.className = 'carousel-marquee-track';

  rows.forEach((row) => {
    const slide = createSlide(row);
    if (slide.children.length) track.append(slide);
  });

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Carousel');
  block.setAttribute('aria-label', block.getAttribute('aria-label') || 'Image gallery');

  const count = track.children.length;
  // do not animate inside Universal Editor or when there is too little to scroll
  const inEditor = block.hasAttribute('data-aue-resource');
  if (count > 1 && !inEditor) {
    [...track.children].forEach((slide) => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.classList.add('carousel-marquee-clone');
      [clone, ...clone.querySelectorAll('*')].forEach(stripInstrumentation);
      clone.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
      track.append(clone);
    });
    block.classList.add('is-animated');
    block.style.setProperty('--carousel-marquee-duration', `${count * SECONDS_PER_SLIDE}s`);
  }

  viewport.append(track);
  block.replaceChildren(viewport);
}
