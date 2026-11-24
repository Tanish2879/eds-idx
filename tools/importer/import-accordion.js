/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /jsw/accordion page (design source: drafts/jsw/accordion/source.html).
 * One section: its heading (default content), then an accordion block, + page metadata (JSW nav
 * and footer, the JSW theme). Writes ONLY /jsw/accordion.
 *
 * accordion rows: one per item (an Accordion Item): summary (its title) | text (rich text)
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep links root-relative so they resolve on any host
function rootRelative(href) {
  try {
    const u = new URL(href, 'https://x');
    return u.origin === 'https://x' ? u.pathname + u.search + u.hash : href;
  } catch (e) {
    return href;
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

// the item's content, as authored (its paragraphs and links)
function richCell(document, field, source) {
  if (!source) return hinted(document, field);
  const nodes = [...source.children].map((child) => {
    const copy = child.cloneNode(true);
    copy.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', rootRelative(a.getAttribute('href'))));
    return copy;
  });
  return hinted(document, field, ...nodes);
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.accordion-source');
    const main = document.createElement('main');
    const heading = src.querySelector(':scope > h2');
    if (heading) {
      const h2 = document.createElement('h2');
      h2.textContent = clean(heading.textContent);
      main.append(h2);
    }
    const cells = [...src.querySelectorAll(':scope > .item')].map((item) => [
      textCell(document, 'summary', clean(item.querySelector('.title')?.textContent)),
      richCell(document, 'text', item.querySelector('.content')),
    ]);
    main.append(WebImporter.Blocks.createBlock(document, { name: 'accordion', cells }));

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
      Theme: clean(document.querySelector('meta[name="theme"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/jsw/accordion',
      report: { title: document.title, template: 'accordion', blocks: ['accordion'] },
    }];
  },
};
