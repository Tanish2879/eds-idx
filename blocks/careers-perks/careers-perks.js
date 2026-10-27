import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Careers Perks: the heading and an intro centred, then the perks in a grid (three columns from
 * 900px, two from 600px), a line between the rows; each perk an icon, its title and description.
 * Rows (every property in its own cell, read by position):
 *   1. heading   2. intro (its line breaks kept)
 *   then the perks (as imported, each row starts with its component id; AEM renders them without
 *   it): icon (a name: icons/perk-<name>.svg) | custom icon image | title | description
 * Only the first MAX_PERKS perks are shown; the editor shows the others dimmed, with a note.
 */

// the most perks the block shows (the first ones in the content tree; the editor marks the others)
export const MAX_PERKS = 6;

const BLOCK_ROWS = 2;
const ITEM = 'careers-perk';
const ICON = /^[a-z][a-z0-9-]*$/;
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// a multi-line plain-text value: its lines (paragraphs, line breaks or newlines)
function lines(cell) {
  if (!cell) return [];
  const copy = cell.cloneNode(true);
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  const blocks = [...copy.querySelectorAll('p')];
  const raw = (blocks.length ? blocks.map((p) => p.textContent) : [copy.textContent]).join('\n');
  return raw.split('\n').map((l) => l.trim()).filter(Boolean);
}

/*
 * The image of a cell: an <img>, or a link to an image file (AEM delivers an image it can't
 * resolve as a link; placeholders under /drafts/ then come from this repository).
 */
function cellImage(cell) {
  const img = cell?.querySelector('img');
  if (img) return { src: img.src, source: img };
  const link = [...(cell?.querySelectorAll('a[href]') || [])]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return { src: drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts)}` : link.href, source: link };
}

// authoring: an editable field of the block or of the perk it sits in (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

// a perk's icon: the custom image, else the chosen line icon (decorative: the title says it all)
function buildIcon(iconCell, imageCell, authoring) {
  const image = cellImage(imageCell);
  if (image) {
    const svg = /\.svg$/i.test(new URL(image.src, window.location).pathname);
    const img = svg
      ? el('img', {
        src: image.src, alt: '', width: 28, height: 28, loading: 'lazy',
      })
      : createOptimizedPicture(image.src, '', false, [{ width: '96' }]).querySelector('img');
    moveInstrumentation(image.source, img);
    if (authoring) editable(img, 'iconImage', 'media', 'Custom icon image');
    return el('span', { class: 'careers-perk-icon is-custom' }, img.closest('picture') || img);
  }
  const name = text(iconCell).toLowerCase();
  if (!ICON.test(name)) return null;
  return el('span', { class: 'careers-perk-icon' }, el('img', {
    src: `${window.hlx?.codeBasePath || ''}/icons/perk-${name}.svg`, alt: '', width: 28, height: 28, loading: 'lazy',
  }));
}

function buildPerk(row, authoring) {
  if (text(row.firstElementChild) === ITEM) row.firstElementChild.remove();
  const [iconCell, imageCell, titleCell, descriptionCell] = [...row.children];
  const item = el('li', { class: 'careers-perk' });
  moveInstrumentation(row, item);
  const title = text(titleCell);
  if (authoring && item.dataset.aueResource) item.dataset.aueLabel = `Perk: ${title || 'Untitled'}`;
  const heading = title ? el('h3', { class: 'careers-perk-title' }, title) : null;
  if (authoring) editable(heading, 'title', 'text', 'Title');
  const description = lines(descriptionCell).join(' ');
  const body = description ? el('p', { class: 'careers-perk-description' }, description) : null;
  if (authoring) editable(body, 'description', 'text', 'Description');
  item.append(buildIcon(iconCell, imageCell, authoring) || '', heading || '', body || '');
  return item;
}

export default function decorate(block) {
  const authoring = isAuthoring();
  const rows = [...block.children];
  // (content imported with the perks' component ids: the perks start at the first such row)
  const first = rows.findIndex((row) => text(row.firstElementChild) === ITEM);
  const start = first >= 0 && first < BLOCK_ROWS ? first : BLOCK_ROWS;
  const [headingRow, introRow] = rows.slice(0, start);

  // the header: the heading, the intro (its lines as authored)
  const header = el('div', { class: 'careers-perks-header' });
  if (text(headingRow)) {
    const heading = el('h2', { class: 'careers-perks-heading' }, text(headingRow));
    if (authoring) editable(heading, 'heading', 'text', 'Heading');
    header.append(heading);
  }
  const intro = lines(introRow);
  if (intro.length) {
    const p = el('p', { class: 'careers-perks-intro' }, intro.join('\n'));
    if (authoring) editable(p, 'intro', 'text', 'Intro');
    header.append(p);
  }

  // the perks: the first MAX_PERKS; the editor shows the others too, dimmed, with a note (they
  // aren't on the published page)
  const perkRows = rows.slice(start);
  const perks = perkRows.slice(0, MAX_PERKS).map((row) => buildPerk(row, authoring));
  const extra = authoring ? perkRows.slice(MAX_PERKS).map((row) => {
    const item = buildPerk(row, authoring);
    item.classList.add('is-over-limit');
    if (item.dataset.aueResource) item.dataset.aueLabel = `${item.dataset.aueLabel} (over the ${MAX_PERKS}-perk limit: not shown)`;
    return item;
  }) : [];
  const list = el('ul', { class: 'careers-perks-list' }, ...perks, ...extra);
  const note = extra.length ? el('p', { class: 'careers-perks-limit-note', role: 'note' }, `This block shows up to ${MAX_PERKS} perks: the last ${extra.length === 1 ? 'one (dimmed) isn’t' : `${extra.length} (dimmed) aren’t`} shown on the published page.`) : null;
  block.replaceChildren(...[header.children.length ? header : null, note, list].filter(Boolean));
}
