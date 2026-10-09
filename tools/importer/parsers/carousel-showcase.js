/* eslint-disable */
/* global WebImporter */

/**
 * Parser for carousel-showcase. Base: carousel.
 * Source: https://www.mgselect.co.in/ (section.product-showcase)
 * UE model (blocks/carousel-showcase/_carousel-showcase.json), item carousel-showcase-item:
 *   cell 1: media_image (+media_imageAlt collapsed)  day image (desktop *-full)
 *           media_mobileImage (optional)             day image (mobile *-square-mobile)
 *   cell 2: night_image (+night_imageAlt collapsed)  night image (desktop *-full)
 *           night_mobileImage (optional)             night image (mobile *-square-mobile)
 *   cell 3: content_text (richtext)                  model name, description, CTAs
 *
 * Validated selectors (source.html + live DOM):
 *   .product-showcase__swiper .swiper-slide                       one per model (image side)
 *   .product-showcase__swiper--image-light picture / img           day image
 *   .product-showcase__swiper--image-dark picture / img            night image
 *   source[media*="min-width"][srcset]                             desktop rendition (preferred)
 *   source[media*="max-width"][srcset] / img src                   mobile rendition (emitted only when distinct)
 *   .car-models-carousel__content                                  text panel, paired by index with slide
 *   .car-models-carousel__content-name / -description              h3 name / p description
 *   .car-models-carousel__content-cta a, .cta-download a           CTAs (mobile + desktop duplicates, deduped)
 * Ignored: .product-showcase__background (section day/night bg), .product-showcase__overlay (theme toggle),
 *   swiper nav/pagination.
 */
function firstSrcFromSrcset(srcset) {
  if (!srcset) return '';
  return srcset.trim().split(',')[0].trim().split(/\s+/)[0];
}

function assetPath(url) {
  return (url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
}

function buildImage(container, document) {
  if (!container) return null;
  const srcImg = container.querySelector('img');
  const picture = container.querySelector('picture');
  let src = '';
  if (picture) {
    const sources = [...picture.querySelectorAll('source[srcset]')];
    const desktop = sources.find((s) => /min-width/i.test(s.getAttribute('media') || '')) || sources[sources.length - 1];
    if (desktop) src = firstSrcFromSrcset(desktop.getAttribute('srcset'));
  }
  if (!src && srcImg) src = srcImg.getAttribute('src') || '';
  if (!src) return null;
  const img = document.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', ((srcImg && (srcImg.getAttribute('alt') || srcImg.getAttribute('title'))) || '').trim());
  return img;
}

// Mobile (art-directed) rendition: max-width <source>, else the <img> src.
// Returns null when it is not a distinct asset from the desktop image.
function buildMobileImage(container, desktopImg, document) {
  if (!container || !desktopImg) return null;
  const srcImg = container.querySelector('img');
  const picture = container.querySelector('picture');
  let src = '';
  if (picture) {
    const mobile = [...picture.querySelectorAll('source[srcset]')]
      .find((s) => /max-width/i.test(s.getAttribute('media') || ''));
    if (mobile) src = firstSrcFromSrcset(mobile.getAttribute('srcset'));
  }
  if (!src && srcImg) src = srcImg.getAttribute('src') || '';
  if (!src || src.startsWith('data:') || assetPath(src) === assetPath(desktopImg.getAttribute('src'))) return null;
  const img = document.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', desktopImg.getAttribute('alt') || '');
  return img;
}

// Grouped cell: each image preceded by its own field hint.
function groupedImages(document, entries) {
  const frag = document.createDocumentFragment();
  entries.forEach(([field, img]) => {
    if (!img) return;
    frag.appendChild(document.createComment(` field:${field} `));
    frag.appendChild(img);
  });
  return frag.childNodes.length ? frag : '';
}

function hinted(document, field, nodes) {
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createComment(` field:${field} `));
  nodes.forEach((n) => frag.appendChild(n));
  return frag;
}

export default function parse(element, { document }) {
  const slides = [...element.querySelectorAll('.product-showcase__swiper .swiper-wrapper > .swiper-slide')];
  const slideList = slides.length ? slides : [...element.querySelectorAll('.swiper-slide')];
  const contents = [...element.querySelectorAll('.car-models-carousel__content')];

  const count = Math.max(slideList.length, contents.length);
  const cells = [];

  for (let i = 0; i < count; i += 1) {
    const slide = slideList[i];
    const content = contents[i];

    // Day / night images (desktop + optional mobile)
    let dayImg = null;
    let nightImg = null;
    let dayMobileImg = null;
    let nightMobileImg = null;
    if (slide) {
      let dayEl = slide.querySelector('.product-showcase__swiper--image-light');
      let nightEl = slide.querySelector('.product-showcase__swiper--image-dark');
      dayImg = buildImage(dayEl, document);
      nightImg = buildImage(nightEl, document);
      if (!dayImg) {
        // Fallback: first picture in slide is day, second is night
        const pics = [...slide.querySelectorAll('picture')];
        dayEl = pics[0];
        dayImg = buildImage(dayEl, document);
        if (!nightImg && pics[1]) {
          nightEl = pics[1];
          nightImg = buildImage(nightEl, document);
        }
      }
      dayMobileImg = buildMobileImage(dayEl, dayImg, document);
      nightMobileImg = buildMobileImage(nightEl, nightImg, document);
    }

    // Text content
    const textNodes = [];
    if (content) {
      const nameEl = content.querySelector('.car-models-carousel__content-name') || content.querySelector('h1, h2, h3, h4, h5, h6');
      if (nameEl && nameEl.textContent.trim()) {
        const h = document.createElement('h2');
        h.textContent = nameEl.textContent.trim();
        textNodes.push(h);
      }
      const descEl = content.querySelector('.car-models-carousel__content-description') || content.querySelector('p');
      if (descEl && descEl.textContent.trim()) {
        const p = document.createElement('p');
        p.textContent = descEl.textContent.trim();
        textNodes.push(p);
      }
      // CTAs: dedupe mobile/desktop duplicates by href
      const seen = new Set();
      content.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || seen.has(href)) return;
        const label = ((a.querySelector('.cta-section__label') || a).textContent || '').trim() || a.getAttribute('title') || '';
        if (!label) return;
        seen.add(href);
        const p = document.createElement('p');
        const link = document.createElement('a');
        link.setAttribute('href', href);
        link.textContent = label;
        p.append(link);
        textNodes.push(p);
      });
    }

    if (!dayImg && !nightImg && !textNodes.length) continue;

    cells.push([
      groupedImages(document, [['media_image', dayImg], ['media_mobileImage', dayMobileImg]]),
      groupedImages(document, [['night_image', nightImg], ['night_mobileImage', nightMobileImg]]),
      textNodes.length ? hinted(document, 'content_text', textNodes) : '',
    ]);
  }

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-showcase', cells });
  element.replaceWith(block);
}
