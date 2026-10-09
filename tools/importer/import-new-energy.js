/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the new /new-energy page (design source: drafts/new-energy/source.html).
 * Builds one hero-interactive block (xwalk field hints) + page metadata.
 * Writes ONLY /new-energy — no other page is created or modified.
 *
 * Block rows:
 *   1. media   2. heading   3. description   4. cta (+ text)   5+. one slide image per row
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

function image(document, img) {
  const out = document.createElement('img');
  out.src = rootRelative(img.getAttribute('src'));
  out.alt = clean(img.getAttribute('alt'));
  return out;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.hero-interactive-source');
    const main = document.createElement('main');

    const rows = [];
    const media = src.querySelector('.media img');
    if (media) rows.push([hinted(document, 'media', image(document, media))]);
    const heading = src.querySelector('.heading');
    if (heading) rows.push([hinted(document, 'heading', document.createTextNode(clean(heading.textContent)))]);
    const desc = src.querySelector('.description');
    if (desc) {
      const p = document.createElement('p');
      p.textContent = clean(desc.textContent);
      rows.push([hinted(document, 'description', p)]);
    }
    const cta = src.querySelector('.cta');
    if (cta) {
      const a = document.createElement('a');
      a.href = cta.getAttribute('href');
      a.textContent = clean(cta.textContent);
      rows.push([hinted(document, 'cta', a)]);
    }
    src.querySelectorAll('.slides img').forEach((img) => {
      rows.push([hinted(document, 'image', image(document, img))]);
    });

    const block = WebImporter.Blocks.createBlock(document, { name: 'hero-interactive', cells: rows });
    main.append(block);

    const meta = WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
    });
    main.append(meta);

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/new-energy',
      report: { title: document.title, template: 'new-energy', blocks: ['hero-interactive'] },
    }];
  },
};
