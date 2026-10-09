/* eslint-disable */
/* global WebImporter */

/**
 * Parser for cards-timeline. Base: cards.
 * Source: https://www.mgselect.co.in/ (.tabs.panelcontainer .timeline-swiper-container)
 * UE model (blocks/cards-timeline/_cards-timeline.json), item cards-timeline-card:
 *   cell 1: image (alt carried on <img>)
 *   cell 2: text (richtext): <p>year</p><h3>title</h3><p>description</p>
 *
 * Validated selectors (source.html + live DOM):
 *   .timeline-card (div.swiper-slide)                one per milestone (18) - block-level, safe to iterate
 *   .model-year                                      year
 *   .timeline-card__picture img                      card image
 *   .overlay (direct text nodes, after <span>+</span>) title
 *   .overlay .timeline-card-tooltip                  description
 * Ordering: swiper loop rotates DOM order at runtime; when every card carries
 * data-swiper-slide-index the authored order is restored from it.
 */
function clean(text) {
  return (text || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
}

export default function parse(element, { document }) {
  let cards = [...element.querySelectorAll('.timeline-card')];
  if (!cards.length) {
    cards = [...element.querySelectorAll('.model-year')].map((y) => y.closest('.swiper-slide') || y.parentElement);
  }

  if (cards.length && cards.every((c) => c.hasAttribute('data-swiper-slide-index'))) {
    cards = cards
      .map((c, i) => ({ c, i, k: parseInt(c.getAttribute('data-swiper-slide-index'), 10) }))
      .sort((a, b) => (a.k - b.k) || (a.i - b.i))
      .map(({ c }) => c);
  }

  const cells = [];
  cards.forEach((card) => {
    const year = clean(card.querySelector('.model-year')?.textContent || card.getAttribute('data-year'));

    const overlay = card.querySelector('.overlay');
    const tooltip = overlay?.querySelector('.timeline-card-tooltip') || card.querySelector('.timeline-card-tooltip, .tooltip');
    let title = '';
    if (overlay) {
      title = clean([...overlay.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
      // live DOM may render the "+" toggle glyph as a text node rather than a <span>
      title = title.replace(/^[+−-]\s*/, '');
    }
    const srcImg = card.querySelector('.timeline-card__picture img') || card.querySelector('picture img, img');
    if (!title && srcImg) title = clean(srcImg.getAttribute('title') || srcImg.getAttribute('alt'));
    const description = clean(tooltip?.textContent);

    let imageCell = '';
    const src = srcImg ? srcImg.getAttribute('src') : '';
    if (src) {
      const img = document.createElement('img');
      img.setAttribute('src', src);
      img.setAttribute('alt', clean(srcImg.getAttribute('alt') || srcImg.getAttribute('title')));
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createComment(' field:image '));
      frag.appendChild(img);
      imageCell = frag;
    }

    const textNodes = [];
    if (year) {
      const p = document.createElement('p');
      p.textContent = year;
      textNodes.push(p);
    }
    if (title) {
      const h = document.createElement('h3');
      h.textContent = title;
      textNodes.push(h);
    }
    if (description) {
      const p = document.createElement('p');
      p.textContent = description;
      textNodes.push(p);
    }
    let textCell = '';
    if (textNodes.length) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createComment(' field:text '));
      textNodes.forEach((n) => frag.appendChild(n));
      textCell = frag;
    }

    if (!imageCell && !textCell) return;
    cells.push([imageCell, textCell]);
  });

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-timeline', cells });
  element.replaceWith(block);
}
