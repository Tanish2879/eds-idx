/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the JSW pages' footer document /jsw-footer (source: drafts/jsw-footer/source.html).
 * One block, jsw-footer, holding everything: its properties, then its children (columns and their
 * links, social links), + page metadata (no header, no footer). Writes ONLY /jsw-footer — no
 * other page is created or modified.
 *
 * jsw-footer rows (every property in its own cell): 1. logo (+ logoAlt)   2. logoLink
 *   3. copyright   4. location   5. ctaLabel   6. ctaLink   7. legalLink (+ legalLinkText)
 *   8. backgroundMedia (image / video)   9. background (image)   10. backgroundVideo
 * then the children, the columns, each row starting with its component id:
 *   jsw-footer-column | title | links (a list of links, label as the text) | social (a list of
 *   links, the network as the text)
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

// a multifield of links: a list, each entry one link (its text: the label / the network)
function listCell(document, field, entries) {
  if (!entries.length) return hinted(document, field);
  const ul = document.createElement('ul');
  entries.forEach(({ href, label }) => {
    const a = document.createElement('a');
    a.href = rootRelative(href);
    a.textContent = label;
    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
  });
  return hinted(document, field, ul);
}

// the component id cell that starts a child row
function idCell(document, id) {
  const cell = document.createElement('div');
  cell.textContent = id;
  return cell;
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
    const background = src.querySelector(':scope > img.background');
    const cells = [
      [imageCell(document, 'logo', src.querySelector(':scope > img.logo'))],
      [linkCell(document, 'logoLink', logoLink, clean(logoLink?.getAttribute('href')))],
      [textCell(document, 'copyright', value(src, ':scope > .copyright'))],
      [textCell(document, 'location', value(src, ':scope > .location'))],
      // the button: its label and its link, two properties
      [textCell(document, 'ctaLabel', clean(cta?.textContent))],
      [linkCell(document, 'ctaLink', cta, clean(cta?.getAttribute('href')))],
      [linkCell(document, 'legalLink', legal, clean(legal?.textContent))],
      // the background media: the image (the video field left for the authors)
      [textCell(document, 'backgroundMedia', clean(background?.dataset.type) || 'image')],
      [imageCell(document, 'background', background)],
      [hinted(document, 'backgroundVideo')],
    ];
    // the children: each column (its title, its links / its social icons)
    src.querySelectorAll(':scope > .column').forEach((column) => {
      const social = column.classList.contains('social');
      const entries = [...column.querySelectorAll('a[href]')].map((a) => ({
        href: a.getAttribute('href'),
        label: clean(social ? a.dataset.network : a.textContent),
      }));
      cells.push([
        idCell(document, 'jsw-footer-column'),
        textCell(document, 'title', value(column, 'h2')),
        listCell(document, 'links', social ? [] : entries),
        listCell(document, 'social', social ? entries : []),
      ]);
    });
    main.append(WebImporter.Blocks.createBlock(document, { name: 'jsw-footer', cells }));

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
      report: { title: document.title, template: 'jsw-footer', blocks: ['jsw-footer'] },
    }];
  },
};
