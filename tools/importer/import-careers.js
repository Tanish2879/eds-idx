/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /careers page (source: drafts/careers/source.html).
 * Builds one job-board block with xwalk field hints + page metadata (JSW nav, no footer).
 * Writes ONLY /careers — no other page is created or modified.
 *
 * Block rows (every property in its own cell):
 *   1. gallery (+ galleryAlt)   2. emptyMessage
 *   then the items, each row starting with its component id (the block allows several child
 *   types: md2jcr picks the item's model by that first cell):
 *     job-board-search | heading | headingEmphasis | placeholder | description
 *     job-board-filters | filterLabel | locationLabel | locations | departmentLabel | departments
 *     job-board-job | title | department | location | description | applyLink | applyLabel
 *   The two multifields (locations, departments) are left EMPTY: the content upload's converter
 *   (md2jcr) can't fill a multifield (it joins the entries into one word); the authors add them in
 *   the editor (Filters), and until then the dropdowns list the jobs' own locations / departments.
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep media and links root-relative so they resolve on any host serving /drafts
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

// a link property: the link (its text: the URL, the label has its own field)
function linkCell(document, field, href) {
  if (!href) return hinted(document, field);
  const a = document.createElement('a');
  a.href = rootRelative(href);
  a.textContent = rootRelative(href);
  const p = document.createElement('p');
  p.append(a);
  return hinted(document, field, p);
}

function idCell(document, id) {
  const cell = document.createElement('div');
  cell.textContent = id;
  return cell;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.job-board-source');
    const main = document.createElement('main');
    const value = (root, sel) => clean(root.querySelector(sel)?.textContent);

    const cells = [];
    cells.push([imageCell(document, 'gallery', src.querySelector(':scope > img.gallery'))]);
    cells.push([textCell(document, 'emptyMessage', value(src, ':scope > .empty'))]);

    src.querySelectorAll('.item').forEach((item) => {
      if (item.classList.contains('search')) {
        cells.push([
          idCell(document, 'job-board-search'),
          textCell(document, 'heading', value(item, '.heading')),
          textCell(document, 'headingEmphasis', value(item, '.heading-emphasis')),
          textCell(document, 'placeholder', clean(item.dataset.placeholder)),
          textCell(document, 'description', value(item, '.description')),
        ]);
      } else if (item.classList.contains('filters')) {
        cells.push([
          idCell(document, 'job-board-filters'),
          textCell(document, 'filterLabel', clean(item.dataset.label)),
          textCell(document, 'locationLabel', clean(item.dataset.locationLabel)),
          hinted(document, 'locations'),
          textCell(document, 'departmentLabel', clean(item.dataset.departmentLabel)),
          hinted(document, 'departments'),
        ]);
      } else {
        const link = item.querySelector('a[href]');
        cells.push([
          idCell(document, 'job-board-job'),
          textCell(document, 'title', value(item, 'h3')),
          textCell(document, 'department', clean(item.dataset.department)),
          textCell(document, 'location', clean(item.dataset.location)),
          textCell(document, 'description', value(item, 'p')),
          linkCell(document, 'applyLink', link?.getAttribute('href')),
          textCell(document, 'applyLabel', clean(link?.textContent)),
        ]);
      }
    });
    main.append(WebImporter.Blocks.createBlock(document, { name: 'job-board', cells }));

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/careers',
      report: { title: document.title, template: 'careers', blocks: ['job-board'] },
    }];
  },
};
