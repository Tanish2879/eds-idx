/* eslint-disable */
/* global WebImporter */

/**
 * Parser for carousel-dealer. Base: carousel.
 * Source: https://www.mgselect.co.in/ (.carousel.panelcontainer .mg-carousel)
 * UE model (blocks/carousel-dealer/_carousel-dealer.json), item carousel-dealer-item:
 *   cell 1: media_image (+media_imageAlt collapsed)  desktop 1920x1080
 *           media_mobileImage (optional)            portrait 1080-X-1920 (only when distinct)
 *   cell 2: link (+linkText collapsed into anchor text)
 *
 * Validated selectors (source.html + live DOM):
 *   .mg-swiper-slide (div.swiper-slide, role=tabpanel)                 one per dealer (14) - block-level, safe to iterate
 *   .hero__banner__dm__img--container a[href]                          slide link (/dealer/...)
 *   ... a picture source[media*="min-width"][srcset]                   desktop 1920x1080 rendition
 *   ... a picture source[media*="max-width"][srcset]                   mobile portrait 1080-X-1920 rendition
 *   img.hero__banner__dm--img                                          portrait mobile img (alt; mobile src fallback)
 * Ignored: the absolutely-positioned dealer-carousel-bg picture (shared decorative background).
 */
function firstSrcFromSrcset(srcset) {
  if (!srcset) return '';
  return srcset.trim().split(',')[0].trim().split(/\s+/)[0];
}

function assetPath(url) {
  return (url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
}

function titleCase(str) {
  return (str || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function cityFromHref(href) {
  // /dealer/delhi-shiva-motorcorp -> Delhi
  const slug = (href || '').split('?')[0].split('/').filter(Boolean).pop() || '';
  return titleCase(slug.split('-')[0] || '');
}

export default function parse(element, { document }) {
  let slides = [...element.querySelectorAll('.mg-swiper-slide')];
  if (!slides.length) slides = [...element.querySelectorAll('.swiper-slide, [role="tabpanel"]')];

  const cells = [];
  slides.forEach((slide) => {
    const container = slide.querySelector('.hero__banner__dm__img--container') || slide;
    const anchor = container.querySelector('a[href]');
    const srcImg = container.querySelector('img.hero__banner__dm--img') || container.querySelector('picture img');
    const picture = (anchor && anchor.querySelector('picture')) || container.querySelector('picture');

    // Desktop image (1920x1080)
    let src = '';
    if (picture) {
      const sources = [...picture.querySelectorAll('source[srcset]')];
      const desktop = sources.find((s) => /min-width/i.test(s.getAttribute('media') || '')) || sources[sources.length - 1];
      if (desktop) src = firstSrcFromSrcset(desktop.getAttribute('srcset'));
    }
    if (!src && srcImg) {
      // Fallback when <source> srcsets are unavailable: the site names renditions
      // <city>-city-launch-1080-X-1920 (portrait) / -1920-x-1080 (landscape).
      src = (srcImg.getAttribute('src') || '').replace(/1080-X-1920/i, '1920-x-1080');
    }

    // Mobile image (portrait 1080-X-1920): max-width <source>, else the slide <img> src.
    // Never the shared dealer-carousel-bg background picture.
    let mobileSrc = '';
    if (picture) {
      const mobile = [...picture.querySelectorAll('source[srcset]')]
        .find((s) => /max-width/i.test(s.getAttribute('media') || ''));
      if (mobile) mobileSrc = firstSrcFromSrcset(mobile.getAttribute('srcset'));
    }
    if (!mobileSrc && srcImg) mobileSrc = srcImg.getAttribute('src') || '';
    if (mobileSrc && (mobileSrc.startsWith('data:') || /dealer-carousel-bg/i.test(mobileSrc)
      || assetPath(mobileSrc) === assetPath(src))) mobileSrc = '';

    const href = anchor ? anchor.getAttribute('href') : '';
    const rawAlt = ((srcImg && (srcImg.getAttribute('alt') || srcImg.getAttribute('title')))
      || (anchor && anchor.getAttribute('aria-label')) || '').trim();
    const city = rawAlt ? titleCase(rawAlt) : cityFromHref(href);

    if (!src && !href) return;

    let imageCell = '';
    if (src) {
      const img = document.createElement('img');
      img.setAttribute('src', src);
      img.setAttribute('alt', city ? `${city} Experience Centre` : '');
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createComment(' field:media_image '));
      frag.appendChild(img);
      if (mobileSrc) {
        const mobileImg = document.createElement('img');
        mobileImg.setAttribute('src', mobileSrc);
        mobileImg.setAttribute('alt', img.getAttribute('alt'));
        frag.appendChild(document.createComment(' field:media_mobileImage '));
        frag.appendChild(mobileImg);
      }
      imageCell = frag;
    }

    let linkCell = '';
    if (href) {
      const link = document.createElement('a');
      link.setAttribute('href', href);
      link.textContent = city ? `${city} Experience Centre - Know more` : 'Know more';
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createComment(' field:link '));
      frag.appendChild(link);
      linkCell = frag;
    }

    cells.push([imageCell, linkCell]);
  });

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-dealer', cells });
  element.replaceWith(block);
}
