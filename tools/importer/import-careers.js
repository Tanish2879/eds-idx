/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /careers page (source: drafts/careers/source.html).
 * Builds three sections: the careers-hero block, the job-board block, the careers-perks block,
 * with xwalk field hints + page metadata (JSW nav, no footer).
 * Writes ONLY /careers — no other page is created or modified.
 *
 * careers-hero rows (every property in its own cell): 1. image (+ imageAlt)   2. heading
 *   3. description   4. ctaLabel   5. ctaLink (plain text, e.g. #open-roles)
 * careers-perks rows: 1. heading   2. intro (one line); then the perks:
 *   careers-perk | icon (a name) | iconImage | title | description
 * job-board rows (every property in its own cell):
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

    // section 1: the careers hero
    const hero = document.querySelector('.careers-hero-source');
    if (hero) {
      const cta = hero.querySelector('a.cta');
      main.append(WebImporter.Blocks.createBlock(document, {
        name: 'careers-hero',
        cells: [
          [imageCell(document, 'image', hero.querySelector('img.image'))],
          [textCell(document, 'heading', value(hero, 'h1'))],
          [textCell(document, 'description', value(hero, '.description'))],
          [textCell(document, 'ctaLabel', clean(cta?.textContent))],
          [textCell(document, 'ctaLink', clean(cta?.getAttribute('href')))],
        ],
      }));
      main.append(document.createElement('hr'));
    }

    // section 2: the job board
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

    // section 3: the careers perks (the intro as one line: the content upload drops a <br> and the
    // space around it; the authors add the line break in the editor, which the block keeps)
    const perks = document.querySelector('.careers-perks-source');
    if (perks) {
      main.append(document.createElement('hr'));
      const intro = perks.querySelector('.intro');
      const introP = document.createElement('p');
      introP.textContent = clean([...(intro?.childNodes || [])].map((n) => (n.nodeName === 'BR' ? ' ' : n.textContent)).join(' '));
      const perkCells = [
        [textCell(document, 'heading', value(perks, 'h2'))],
        [introP.textContent ? hinted(document, 'intro', introP) : hinted(document, 'intro')],
      ];
      perks.querySelectorAll('.perk').forEach((perk) => {
        perkCells.push([
          idCell(document, 'careers-perk'),
          textCell(document, 'icon', clean(perk.dataset.icon)),
          hinted(document, 'iconImage'),
          textCell(document, 'title', value(perk, 'h3')),
          textCell(document, 'description', value(perk, 'p')),
        ]);
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: 'careers-perks', cells: perkCells }));
    }

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
      report: { title: document.title, template: 'careers', blocks: ['careers-hero', 'job-board', 'careers-perks'] },
    }];
  },
};
