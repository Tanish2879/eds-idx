/* eslint-disable */
/* global WebImporter */

/**
 * Parser for carousel-marquee. Base: carousel.
 * Source: https://www.mgselect.co.in/ (.brandManifesto .brand-manifesto__gallery)
 * UE model (blocks/carousel-marquee/_carousel-marquee.json), item carousel-marquee-item:
 *   cell 1: media_image (+media_imageAlt collapsed)
 *   cell 2: content_text (richtext, optional caption - none in source, left empty)
 *
 * Validated selectors (source.html + live DOM):
 *   .brand-manifesto__swiper .swiper-slide picture img   gallery images (source repeats the set twice for looping)
 * Dedupe: by image URL path (query string ignored). Swiper loop rotates DOM order at runtime,
 * so unique items are re-sorted by their numeric filename prefix (1_16-9, 2_4-3, ...) when every item has one.
 */
function pathKey(src) {
  try {
    return new URL(src, 'https://x/').pathname;
  } catch (e) {
    return (src || '').split('?')[0];
  }
}

function leadingNumber(path) {
  const m = path.split('/').pop().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export default function parse(element, { document }) {
  let imgs = [...element.querySelectorAll('.swiper-slide picture img')];
  if (!imgs.length) imgs = [...element.querySelectorAll('.swiper-slide img, picture img')];

  const seen = new Set();
  let items = [];
  imgs.forEach((srcImg) => {
    const src = srcImg.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    const key = pathKey(src);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ src, alt: (srcImg.getAttribute('alt') || srcImg.getAttribute('title') || '').trim(), order: leadingNumber(key) });
  });

  if (items.length && items.every((it) => it.order !== null)) {
    items = items.sort((a, b) => a.order - b.order);
  }

  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = items.map(({ src, alt }) => {
    const img = document.createElement('img');
    img.setAttribute('src', src);
    img.setAttribute('alt', alt);
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createComment(' field:media_image '));
    frag.appendChild(img);
    // content_text: no caption in source -> empty cell (no hint)
    return [frag, ''];
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-marquee', cells });
  element.replaceWith(block);
}
