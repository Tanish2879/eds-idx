/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /jsw/interactive-showcase page (design source:
 * drafts/jsw/interactive-showcase/source.html). One interactive-showcase block + page metadata
 * (JSW nav and footer, the JSW theme), and in a new section the collage block. Writes ONLY
 * /jsw/interactive-showcase.
 *
 * interactive-showcase rows (every property in its own cell):
 *   1. title
 *   then one row per item (Showcase Item, at most 3):
 *     media (media_thumbnail + its alt, media_image + its alt: one cell, the two pictures)
 *     | title | description | hotspots (a list: "x, y | TITLE | description")
 */

const MAX_ITEMS = 3;

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

function picture(document, source) {
  const img = document.createElement('img');
  img.src = rootRelative(source.getAttribute('src'));
  img.alt = clean(source.getAttribute('alt'));
  const pic = document.createElement('picture');
  pic.append(img);
  const p = document.createElement('p');
  p.append(pic);
  return p;
}

// the media group: the thumbnail, then the showcase image (each with its alt text)
function mediaCell(document, thumb, image) {
  const cell = document.createElement('div');
  cell.append(document.createComment(' field:media_thumbnail '));
  if (thumb) cell.append(picture(document, thumb));
  cell.append(document.createComment(' field:media_image '));
  if (image) cell.append(picture(document, image));
  return cell;
}

function listCell(document, field, list) {
  if (!list) return hinted(document, field);
  const ul = document.createElement('ul');
  list.querySelectorAll(':scope > li').forEach((li) => {
    const item = document.createElement('li');
    item.textContent = clean(li.textContent);
    ul.append(item);
  });
  return hinted(document, field, ul);
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.interactive-showcase-source');
    const main = document.createElement('main');
    const cells = [[textCell(document, 'title', clean(src.querySelector(':scope > h2')?.textContent))]];
    [...src.querySelectorAll(':scope > article')].slice(0, MAX_ITEMS).forEach((item) => {
      cells.push([
        mediaCell(document, item.querySelector('img.thumb'), item.querySelector('img.image')),
        textCell(document, 'title', clean(item.querySelector('h3')?.textContent)),
        textCell(document, 'description', clean(item.querySelector('.description')?.textContent)),
        listCell(document, 'hotspots', item.querySelector('ul.hotspots')),
      ]);
    });
    main.append(WebImporter.Blocks.createBlock(document, { name: 'interactive-showcase', cells }));

    // a new section: the collage (heading, description, then one row per image: image + alt |
    // caption; at most 5)
    const collage = document.querySelector('.collage-source');
    if (collage) {
      main.append(document.createElement('hr'));
      const collageCells = [
        [textCell(document, 'heading', clean(collage.querySelector(':scope > h2')?.textContent))],
        [textCell(document, 'description', clean(collage.querySelector(':scope > .description')?.textContent))],
      ];
      [...collage.querySelectorAll(':scope > figure')].slice(0, 5).forEach((figure) => {
        const img = figure.querySelector('img');
        collageCells.push([
          img ? hinted(document, 'image', picture(document, img)) : hinted(document, 'image'),
          textCell(document, 'caption', clean(figure.querySelector('figcaption')?.textContent)),
        ]);
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: 'collage', cells: collageCells }));
    }

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
      path: '/jsw/interactive-showcase',
      report: { title: document.title, template: 'interactive-showcase', blocks: ['interactive-showcase', 'collage'] },
    }];
  },
};
