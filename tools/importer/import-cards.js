/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /jsw/cards page (design source: drafts/jsw/cards/source.html).
 * One section per source section (.cards-source): its heading (default content), then a cards
 * block in the section's style (data-style: the block's Style option, its class; empty for
 * Default), + page metadata (JSW nav and footer). Writes ONLY /jsw/cards.
 *
 * cards rows: one per card (a Card child): image (+ imageAlt) | text (rich text)
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep media root-relative so they resolve on any host serving /drafts
function rootRelative(src) {
  try {
    const u = new URL(src, 'https://x');
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return src;
  }
}

function hinted(document, field, ...nodes) {
  const cell = document.createElement('div');
  cell.append(document.createComment(` field:${field} `), ...nodes);
  return cell;
}

function imageCell(document, field, source) {
  if (!source) return hinted(document, field);
  const img = document.createElement('img');
  img.src = rootRelative(source.getAttribute('src'));
  img.alt = clean(source.getAttribute('alt'));
  const picture = document.createElement('picture');
  picture.append(img);
  const p = document.createElement('p');
  p.append(picture);
  return hinted(document, field, p);
}

// the card's rich text, as authored (its headings, paragraphs, bold and italics)
function textCell(document, field, source) {
  if (!source) return hinted(document, field);
  const nodes = [...source.children].map((child) => child.cloneNode(true));
  return hinted(document, field, ...nodes);
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const main = document.createElement('main');
    const styles = [];

    document.querySelectorAll('.cards-source').forEach((source, i) => {
      if (i) main.append(document.createElement('hr'));
      const heading = source.querySelector(':scope > h2');
      if (heading) {
        const h2 = document.createElement('h2');
        h2.textContent = clean(heading.textContent);
        main.append(h2);
      }
      const style = clean(source.dataset.style);
      styles.push(style || 'default');
      const cells = [...source.querySelectorAll(':scope > .card')].map((card) => [
        imageCell(document, 'image', card.querySelector('img')),
        textCell(document, 'text', card.querySelector('.text')),
      ]);
      main.append(WebImporter.Blocks.createBlock(document, { name: 'cards', variants: style ? [style] : [], cells }));
    });

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
      // the JSW theme (a class on the body): the design tokens the cards block reads (styles.css)
      Theme: clean(document.querySelector('meta[name="theme"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/jsw/cards',
      report: { title: document.title, template: 'cards', blocks: ['cards'], styles },
    }];
  },
};
