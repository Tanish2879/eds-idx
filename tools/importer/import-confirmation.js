/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the confirmation pages (design sources: drafts/confirmation/source-variant-*.html).
 * Builds one confirmation block in the source's layout (its variant: the block option / Layout)
 * with xwalk field hints + page metadata (JSW nav, no footer). Each source names the page it
 * becomes (meta target-path): /confirmation (Variant A), /confirmation-all-set (Variant B).
 * Writes ONLY those pages — no other page is created or modified.
 *
 * Block rows (every property in its own cell): 1. displayWord  2. heading  3. description
 *   4. image (+ alt)  5. background  6. ctaLink (+ ctaLinkText)
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

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.confirmation-source');
    const main = document.createElement('main');
    const value = (sel) => clean(src.querySelector(sel)?.textContent);
    const variant = src.dataset.variant || 'variant-a';

    const cells = [];
    cells.push([textCell(document, 'displayWord', value('.word'))]);
    cells.push([textCell(document, 'heading', value('h1'))]);
    cells.push([textCell(document, 'description', value('.description'))]);
    cells.push([imageCell(document, 'image', src.querySelector('img.image'))]);
    cells.push([imageCell(document, 'background', src.querySelector('img.background'))]);
    const cta = src.querySelector('a.cta');
    if (cta) {
      const a = document.createElement('a');
      a.href = rootRelative(cta.getAttribute('href'));
      a.textContent = clean(cta.textContent);
      const p = document.createElement('p');
      p.append(a);
      cells.push([hinted(document, 'ctaLink', p)]);
    } else cells.push([hinted(document, 'ctaLink')]);
    main.append(WebImporter.Blocks.createBlock(document, { name: 'confirmation', variants: [variant], cells }));

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));

    const path = clean(document.querySelector('meta[name="target-path"]')?.getAttribute('content')) || '/confirmation';
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path,
      report: { title: document.title, template: 'confirmation', variant, blocks: ['confirmation'] },
    }];
  },
};
