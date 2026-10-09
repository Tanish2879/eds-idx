import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, applyArtDirection } from '../../scripts/scripts.js';

/**
 * Hero Fullbleed: edge-to-edge background image with an overlaid,
 * bottom-centred heading and CTA.
 * Authored rows (detected by content, any may be omitted):
 *   - image row (picture) - desktop image
 *   - mobile image row (picture, optional) - portrait image used below 600px
 *   - text row (heading, optional paragraph, CTA link)
 */

function optimize(img, eager) {
  const optimized = createOptimizedPicture(img.src, img.alt, eager, [
    { media: '(min-width: 1200px)', width: '2400' },
    { media: '(min-width: 600px)', width: '1600' },
    { width: '900' },
  ]);
  const optimizedImg = optimized.querySelector('img');
  moveInstrumentation(img, optimizedImg);
  // LCP image: the DM renderer defaults to lazy, so force eager here
  if (eager && optimizedImg) optimizedImg.loading = 'eager';
  return optimized;
}

/**
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const media = document.createElement('div');
  media.className = 'hero-fullbleed-media';
  const content = document.createElement('div');
  content.className = 'hero-fullbleed-content';

  // images in authored order: first = desktop, second = mobile
  const images = [];

  [...block.children].forEach((row) => {
    const cell = row.querySelector(':scope > div') || row;
    const hasText = cell.textContent.trim().length > 0;

    if (!hasText) {
      // picture-only row
      cell.querySelectorAll('picture > img').forEach((img) => images.push(img));
      return;
    }

    // legacy: a picture inside the text row is used when no image row precedes it
    const img = cell.querySelector('picture > img');
    if (img && !images.length) {
      images.push(img);
      img.closest('picture').remove();
    }

    moveInstrumentation(cell, content);
    [...cell.childNodes].forEach((node) => {
      // drop wrappers left empty after their picture was moved out
      if (node.nodeType === Node.ELEMENT_NODE && !node.textContent.trim()) return;
      content.append(node);
    });
  });

  if (images.length) {
    const picture = optimize(images[0], true);
    if (images[1]) applyArtDirection(picture, optimize(images[1], false), 600);
    media.append(picture);
  }

  content.querySelectorAll('a').forEach((a) => a.classList.add('hero-fullbleed-cta'));

  block.replaceChildren();
  if (media.children.length) block.append(media);
  else block.classList.add('no-image');
  if (content.childNodes.length) block.append(content);
}
