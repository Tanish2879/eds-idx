/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the new /sustainable-future page (design source: drafts/sustainable-future/source.html).
 * Single section: parallax-collage (row 1 heading + subtitle, rows 2+ image | position modifier)
 * Writes ONLY /sustainable-future — no other page is created or modified.
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep images root-relative so they resolve on any host serving /drafts
function rootRelative(src) {
  try {
    const u = new URL(src, 'https://x');
    return u.pathname + u.search;
  } catch (e) {
    return src;
  }
}

function hinted(document, field, ...nodes) {
  const cell = document.createElement('div');
  cell.append(document.createComment(` field:${field} `), ...nodes);
  return cell;
}

function el(document, tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function collage(document, src) {
  const rows = [];
  const text = [];
  const h = src.querySelector('h1, h2');
  if (h) text.push(el(document, 'h1', clean(h.textContent)));
  src.querySelectorAll(':scope > p').forEach((p) => text.push(el(document, 'p', clean(p.textContent))));
  rows.push([hinted(document, 'text', ...text)]);
  src.querySelectorAll('.images li').forEach((li) => {
    const img = li.querySelector('img');
    const out = document.createElement('img');
    out.src = rootRelative(img.getAttribute('src'));
    out.alt = clean(img.getAttribute('alt'));
    rows.push([
      hinted(document, 'image', out),
      hinted(document, 'position', document.createTextNode(clean(li.getAttribute('data-position')))),
    ]);
  });
  return WebImporter.Blocks.createBlock(document, { name: 'parallax-collage', cells: rows });
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const main = document.createElement('main');
    main.append(collage(document, document.querySelector('.parallax-collage-source')));
    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      // JSW Motors nav document (pill header); the designs have no footer yet
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/sustainable-future',
      report: { title: document.title, template: 'sustainable-future', blocks: ['parallax-collage'] },
    }];
  },
};
