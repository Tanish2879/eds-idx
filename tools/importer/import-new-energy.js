/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /new-energy page (design source: drafts/new-energy/source.html).
 * Builds one hero-video block (xwalk field hints) + page metadata (JSW nav, no footer).
 * Writes ONLY /new-energy — no other page is created or modified.
 *
 * Block rows:
 *   1. media (video link + poster image, grouped)   2. text (heading + paragraph)
 *   3. link (button)   4. scrollLabel
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

function link(document, a) {
  const out = document.createElement('a');
  const href = a.getAttribute('href');
  out.href = href.startsWith('#') ? href : rootRelative(href); // keep in-page anchors as-is
  out.textContent = clean(a.textContent);
  return out;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.hero-video-source');
    const main = document.createElement('main');

    const rows = [];
    // media group: video link + poster image share one cell (field hints per element)
    const media = document.createElement('div');
    const video = src.querySelector('a.video');
    if (video) {
      const p = document.createElement('p');
      p.append(link(document, video));
      media.append(document.createComment(' field:media_video '), p);
    }
    const poster = src.querySelector('img.poster');
    if (poster) {
      const img = document.createElement('img');
      img.src = rootRelative(poster.getAttribute('src'));
      img.alt = clean(poster.getAttribute('alt'));
      media.append(document.createComment(' field:media_poster '), img);
    }
    if (media.childNodes.length) rows.push([media]);
    const heading = src.querySelector('h1');
    const desc = src.querySelector('.description');
    if (heading || desc) {
      const nodes = [];
      if (heading) {
        const h1 = document.createElement('h1');
        h1.textContent = clean(heading.textContent);
        nodes.push(h1);
      }
      if (desc) {
        const p = document.createElement('p');
        p.textContent = clean(desc.textContent);
        nodes.push(p);
      }
      rows.push([hinted(document, 'text', ...nodes)]);
    }
    const cta = src.querySelector('a.cta');
    if (cta) rows.push([hinted(document, 'link', link(document, cta))]);
    const scroll = src.querySelector('.scroll');
    if (scroll) rows.push([hinted(document, 'scrollLabel', document.createTextNode(clean(scroll.textContent)))]);

    main.append(WebImporter.Blocks.createBlock(document, { name: 'hero-video', cells: rows }));
    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      // JSW Motors nav document (pill header); the design has no footer
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/new-energy',
      report: { title: document.title, template: 'new-energy', blocks: ['hero-video'] },
    }];
  },
};
