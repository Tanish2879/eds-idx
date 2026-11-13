/* eslint-disable */
/* global WebImporter */

/**
 * Nav document importer for JSW Motors (design source: drafts/jsw/jsw-nav/source.html).
 * Produces /jsw/jsw-nav as one jsw-nav block (+ page metadata: the document itself without a header
 * or footer). Pages opt in with the "nav" page metadata (/jsw/jsw-nav). Writes ONLY /jsw/jsw-nav.
 *
 * jsw-nav rows (every property in its own cell):
 *   1. logo (the mark, + logoAlt)   2. brandName (the text beside it)   3. logoLink
 *   4.–7. link1 … link4 (each a link, its text the Link N text; the source's links in order, the
 *   others left empty)   8. cta (+ ctaText)
 */

const LINKS = 4;

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep URLs root-relative so they resolve on any host serving /drafts
function rootRelative(src) {
  try {
    const base = 'https://root.invalid';
    const u = new URL(src, base);
    if (u.origin !== base) return src;
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

function textCell(document, field, value) {
  if (!value) return hinted(document, field);
  const p = document.createElement('p');
  p.textContent = value;
  return hinted(document, field, p);
}

// a link property: the link, its text (when it has one) as the link's text
function linkCell(document, field, a, label) {
  if (!a) return hinted(document, field);
  const out = document.createElement('a');
  out.href = rootRelative(a.getAttribute('href'));
  out.textContent = label || out.href;
  const p = document.createElement('p');
  p.append(out);
  return hinted(document, field, p);
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const main = document.createElement('main');
    const brand = document.querySelector('.brand');
    const logoLink = brand?.querySelector('a[href]');
    const logo = brand?.querySelector('img');
    const img = logo ? document.createElement('img') : null;
    if (img) {
      img.src = rootRelative(logo.getAttribute('src'));
      img.alt = clean(logo.getAttribute('alt'));
    }
    const links = [...document.querySelectorAll('.sections li a[href]')].slice(0, LINKS);
    const cta = document.querySelector('.tools a[href]');
    const cells = [
      [hinted(document, 'logo', ...(img ? [img] : []))],
      [textCell(document, 'brandName', clean(brand?.querySelector('.brand-name')?.textContent))],
      [linkCell(document, 'logoLink', logoLink, clean(logoLink?.getAttribute('href')))],
      ...[0, 1, 2, 3].map((i) => [linkCell(document, `link${i + 1}`, links[i], clean(links[i]?.textContent))]),
      [linkCell(document, 'cta', cta, clean(cta?.textContent))],
    ];
    main.append(WebImporter.Blocks.createBlock(document, { name: 'jsw-nav', cells }));
    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      nav: 'off',
      footer: 'off',
    }));
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/jsw/jsw-nav',
      report: { title: document.title, template: 'jsw-nav', blocks: ['jsw-nav'] },
    }];
  },
};
