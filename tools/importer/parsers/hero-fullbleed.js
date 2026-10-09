/* eslint-disable */
/* global WebImporter */

/**
 * Parser for hero-fullbleed. Base: hero.
 * Source: https://www.mgselect.co.in/ (section.hero__banner--wrapper)
 * UE model (blocks/hero-fullbleed/_hero-fullbleed.json): image (+imageAlt collapsed), text (richtext)
 *   plus optional mobileImage (art-directed portrait rendition)
 * Output: row 1 = image (desktop), row 2 = mobileImage (portrait, only when distinct),
 *   row 3 = text (h1 + CTA paragraph).
 *
 * Validated selectors (source.html + live DOM):
 *   picture > source[media="(min-width:650px)"][srcset]  desktop landscape rendition (1920w)
 *   picture > source[media="(max-width:649px)"][srcset]  mobile portrait rendition
 *   img.hero__banner__dm--img                             portrait img (mobile fallback / desktop last resort)
 *   .hero__banner--title h5                               heading (promoted to h1)
 *   .hero__banner__content--cta a.cta-section__main       EXPLORE CTA (label in span.cta-section__label)
 */
function firstSrcFromSrcset(srcset) {
  if (!srcset) return '';
  return srcset.split(',')[0].trim().split(/\s+/)[0];
}

function assetPath(url) {
  return (url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
}

export default function parse(element, { document }) {
  // ---- Image: prefer the desktop (min-width) <source>, else the widest srcset, else img src
  const picture = element.querySelector('picture');
  const srcImg = element.querySelector('img.hero__banner__dm--img') || element.querySelector('picture img, img');
  let desktopSrc = '';
  if (picture) {
    const sources = [...picture.querySelectorAll('source[srcset]')];
    const minWidth = sources.find((s) => /min-width/i.test(s.getAttribute('media') || ''));
    const chosen = minWidth || sources[sources.length - 1];
    if (chosen) desktopSrc = firstSrcFromSrcset(chosen.getAttribute('srcset'));
  }
  if (!desktopSrc && srcImg) desktopSrc = srcImg.getAttribute('src') || '';

  let image = null;
  if (desktopSrc) {
    image = document.createElement('img');
    image.setAttribute('src', desktopSrc);
    const alt = (srcImg && (srcImg.getAttribute('alt') || srcImg.getAttribute('title'))) || '';
    image.setAttribute('alt', alt);
  }

  // ---- Mobile image: <source media="(max-width:...)">, else the <img> src (portrait).
  // Emitted only when it is a distinct asset from the desktop image.
  let mobileSrc = '';
  if (picture) {
    const maxWidth = [...picture.querySelectorAll('source[srcset]')]
      .find((s) => /max-width/i.test(s.getAttribute('media') || ''));
    if (maxWidth) mobileSrc = firstSrcFromSrcset(maxWidth.getAttribute('srcset'));
  }
  if (!mobileSrc && srcImg) mobileSrc = srcImg.getAttribute('src') || '';
  if (mobileSrc && (mobileSrc.startsWith('data:') || assetPath(mobileSrc) === assetPath(desktopSrc))) mobileSrc = '';

  let mobileImage = null;
  if (mobileSrc) {
    mobileImage = document.createElement('img');
    mobileImage.setAttribute('src', mobileSrc);
    mobileImage.setAttribute('alt', (image && image.getAttribute('alt'))
      || (srcImg && (srcImg.getAttribute('alt') || srcImg.getAttribute('title'))) || '');
  }

  // ---- Heading: source h5 promoted to h1
  const headingSrc = element.querySelector('.hero__banner--title h1, .hero__banner--title h2, .hero__banner--title h3, .hero__banner--title h4, .hero__banner--title h5, .hero__banner--title h6')
    || element.querySelector('h1, h2, h3, h4, h5, h6');
  let heading = null;
  if (headingSrc && headingSrc.textContent.trim()) {
    heading = document.createElement('h1');
    heading.textContent = headingSrc.textContent.trim();
  }

  // ---- CTA(s)
  const ctaEls = [...element.querySelectorAll('.hero__banner__content--cta a[href]')];
  const ctaLinks = (ctaEls.length ? ctaEls : [...element.querySelectorAll('a.cta-section__main[href]')])
    .map((a) => {
      const label = (a.querySelector('.cta-section__label') || a).textContent.trim() || a.getAttribute('title') || '';
      if (!label) return null;
      const p = document.createElement('p');
      const link = document.createElement('a');
      link.setAttribute('href', a.getAttribute('href'));
      link.textContent = label;
      p.append(link);
      return p;
    })
    .filter(Boolean);

  if (!image && !heading && !ctaLinks.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];

  // Row: image
  if (image) {
    const imageFrag = document.createDocumentFragment();
    imageFrag.appendChild(document.createComment(' field:image '));
    imageFrag.appendChild(image);
    cells.push([imageFrag]);
  } else {
    cells.push(['']);
  }

  // Row: mobileImage (optional)
  if (mobileImage) {
    const mobileFrag = document.createDocumentFragment();
    mobileFrag.appendChild(document.createComment(' field:mobileImage '));
    mobileFrag.appendChild(mobileImage);
    cells.push([mobileFrag]);
  } else {
    cells.push(['']);
  }

  // Row: text (richtext)
  const textContent = [];
  if (heading) textContent.push(heading);
  textContent.push(...ctaLinks);
  if (textContent.length) {
    const textFrag = document.createDocumentFragment();
    textFrag.appendChild(document.createComment(' field:text '));
    textContent.forEach((n) => textFrag.appendChild(n));
    cells.push([textFrag]);
  } else {
    cells.push(['']);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'hero-fullbleed', cells });
  element.replaceWith(block);
}
