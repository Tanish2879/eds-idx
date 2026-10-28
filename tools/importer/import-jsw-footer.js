/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the JSW pages' footer document /jsw-footer (source: drafts/jsw-footer/source.html).
 * One section: the jsw-footer block, then one jsw-footer-links block per link column and the
 * jsw-footer-social block (each a parent with its links as children), + page metadata (no header,
 * no footer). Writes ONLY /jsw-footer — no other page is created or modified.
 *
 * jsw-footer rows (every property in its own cell): 1. logo (+ logoAlt)   2. logoLink
 *   3. copyright   4. location   5. ctaLink (+ ctaLinkText)   6. legalLink (+ legalLinkText)
 *   7. background
 * jsw-footer-links rows: 1. title; then per link: link (+ linkText)
 * jsw-footer-social rows: 1. title; then per network: network | link
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

function rootRelative(src) {
  try {
    const base = 'https://root.invalid';
    const u = new URL(src, base);
    if (u.origin !== base) return src; // (links to other sites kept whole)
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

function imageCell(document, field, source) {
  if (!source) return hinted(document, field);
  const img = document.createElement('img');
  img.src = rootRelative(source.getAttribute('src'));
  img.alt = clean(source.getAttribute('alt'));
  return hinted(document, field, img);
}

// a link property: the link (its label, when it has one, as the link's text)
function linkCell(document, field, link, label) {
  if (!link) return hinted(document, field);
  const a = document.createElement('a');
  a.href = rootRelative(link.getAttribute('href'));
  a.textContent = label || a.href;
  const p = document.createElement('p');
  p.append(a);
  return hinted(document, field, p);
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.jsw-footer-source');
    const main = document.createElement('main');
    const value = (root, sel) => clean(root.querySelector(sel)?.textContent);

    const logoLink = src.querySelector(':scope > a.logo-link');
    const cta = src.querySelector(':scope > a.cta');
    const legal = src.querySelector(':scope > a.legal');
    main.append(WebImporter.Blocks.createBlock(document, {
      name: 'jsw-footer',
      cells: [
        [imageCell(document, 'logo', src.querySelector(':scope > img.logo'))],
        [linkCell(document, 'logoLink', logoLink, clean(logoLink?.getAttribute('href')))],
        [textCell(document, 'copyright', value(src, ':scope > .copyright'))],
        [textCell(document, 'location', value(src, ':scope > .location'))],
        [linkCell(document, 'ctaLink', cta, clean(cta?.textContent))],
        [linkCell(document, 'legalLink', legal, clean(legal?.textContent))],
        [imageCell(document, 'background', src.querySelector(':scope > img.background'))],
      ],
    }));

    src.querySelectorAll(':scope > .column').forEach((column) => {
      const social = column.classList.contains('social');
      const cells = [[textCell(document, 'title', value(column, 'h2'))]];
      column.querySelectorAll('a[href]').forEach((a) => {
        if (social) {
          cells.push([
            textCell(document, 'network', clean(a.dataset.network)),
            linkCell(document, 'link', a, clean(a.getAttribute('href'))),
          ]);
        } else cells.push([linkCell(document, 'link', a, clean(a.textContent))]);
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: social ? 'jsw-footer-social' : 'jsw-footer-links', cells }));
    });

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/jsw-footer',
      report: { title: document.title, template: 'jsw-footer', blocks: ['jsw-footer', 'jsw-footer-links', 'jsw-footer-social'] },
    }];
  },
};
