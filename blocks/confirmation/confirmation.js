import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Confirmation: the page shown after a reservation, in one of two layouts (the author's Layout
 * choice, delivered as the block's variant class):
 *   variant-a  "Reserved": a spotlight background, a large word (e.g. RESERVED) with the car cut
 *              out in front of it, the heading and description centred below
 *   variant-b  "All set": the photo on the left (greyscale, fading into the black), the heading
 *              and description beside it
 * Rows (each property in its own cell, read by position; the Layout is the block's class):
 *   1. background word   2. status heading   3. description   4. image (+ alt)
 *   5. background image   6. button link (+ its text)
 * The heading and description may hold the reservation's values: {firstName}, {email}, … (from
 * the page address, e.g. ?firstName=Sanjay, or the reservation form's data in this tab);
 * {key|fallback} shows the fallback without a value, otherwise the token (and the comma before it)
 * is left out. While authoring, the text is shown as written.
 */

const VARIANTS = ['variant-a', 'variant-b'];
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const TOKEN = /(,?\s*)\{(\w+)(?:\|([^}]*))?\}/g;
const STORED = 'jsw-reservation'; // the reservation form's last sent data (sessionStorage)

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

/*
 * The image of a row: an <img>, or a link to an image file. AEM delivers an image reference it
 * can't resolve (an asset that isn't in AEM Assets yet) as a plain link; placeholder images under
 * a /drafts/ folder are then loaded from the copy in this repository.
 */
function rowImage(row) {
  const img = row?.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...(row?.querySelectorAll('a[href]') || [])]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return { src: drafts > 0 ? pathname.slice(drafts) : link.href, alt: '', source: link };
}

// the reservation's values: the page address first, then the form's data in this tab
function reservationValues() {
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(STORED) || '{}') || {};
  } catch (e) { /* no storage (private mode) or not JSON */ }
  const values = { ...stored };
  new URLSearchParams(window.location.search).forEach((value, key) => { values[key] = value; });
  return values;
}

// the text with its tokens filled: text nodes, values as their own (highlighted) spans
function fill(value, values) {
  const nodes = [];
  let last = 0;
  value.replace(TOKEN, (match, before, key, fallback, offset) => {
    nodes.push(value.slice(last, offset));
    const found = values[key]?.trim();
    if (found) nodes.push(before, el('span', { class: 'confirmation-value' }, found));
    else if (fallback !== undefined) nodes.push(before, fallback);
    last = offset + match.length;
    return match;
  });
  nodes.push(value.slice(last));
  return nodes.filter((n) => n !== '');
}

// variant A sets each sentence on its own line (the design's two-line description)
function bySentence(nodes) {
  return nodes.flatMap((node) => {
    if (typeof node !== 'string') return [node];
    return node.split(/(?<=[.!?])\s+(?=\S)/).flatMap((part, i) => (i ? [el('br'), part] : [part]));
  });
}

// authoring: an editable field of the block (resource inherited from the block)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

function picture(image, eager, breakpoints, className) {
  if (!image) return null;
  const pic = createOptimizedPicture(image.src, image.alt, eager, breakpoints);
  pic.className = className;
  const img = pic.querySelector('img');
  moveInstrumentation(image.source, img);
  if (eager) img.setAttribute('fetchpriority', 'high');
  return pic;
}

export default function decorate(block) {
  const authoring = isAuthoring();
  // the Layout (default: Variant A)
  const variant = VARIANTS.find((v) => block.classList.contains(v)) || VARIANTS[0];
  block.classList.add(variant);
  const [
    wordRow, headingRow, descriptionRow, imageRow, backgroundRow, ctaRow,
  ] = [...block.children];
  const values = authoring ? {} : reservationValues();
  const content = (value) => (authoring ? [value] : fill(value, values));

  // the text: heading, description, optional button
  const copy = el('div', { class: 'confirmation-content' });
  if (text(headingRow)) {
    const heading = el('h1', { class: 'confirmation-heading' }, ...content(text(headingRow)));
    if (authoring) editable(heading, 'heading', 'text', 'Status heading');
    copy.append(heading);
  }
  if (text(descriptionRow)) {
    const parts = content(text(descriptionRow));
    const p = el('p', { class: 'confirmation-description' }, ...(variant === 'variant-a' && !authoring ? bySentence(parts) : parts));
    if (authoring) editable(p, 'description', 'text', 'Description');
    copy.append(p);
  }
  const link = ctaRow?.querySelector('a[href]');
  if (link) {
    const cta = el('a', { class: 'confirmation-cta', href: link.getAttribute('href') }, text(link) || link.getAttribute('href'));
    moveInstrumentation(link, cta);
    if (authoring) editable(cta, 'ctaLinkText', 'text', 'Button text');
    copy.append(cta);
  }

  const image = rowImage(imageRow);
  if (variant === 'variant-a') {
    // background (decorative, the largest element: loaded first), the word, the car in front
    const background = rowImage(backgroundRow);
    if (background) background.alt = '';
    const bg = picture(background, true, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }], 'confirmation-background');
    if (bg && authoring) editable(bg.querySelector('img'), 'background', 'media', 'Background image');
    const word = text(wordRow)
      ? el('p', { class: 'confirmation-word', 'aria-hidden': authoring ? undefined : 'true' }, text(wordRow))
      : null;
    if (authoring) editable(word, 'displayWord', 'text', 'Background word');
    const car = picture(image, true, [{ media: '(min-width: 900px)', width: '1600' }, { width: '900' }], 'confirmation-image');
    if (car && authoring) editable(car.querySelector('img'), 'image', 'media', 'Image');
    // the stage keeps the design's 1280 × 720 composition, scaled to the window
    const stage = el('div', { class: 'confirmation-stage' }, word, car, copy);
    block.replaceChildren(...[bg, stage].filter(Boolean));
  } else {
    const photo = picture(image, true, [{ media: '(min-width: 900px)', width: '1600' }, { width: '900' }], 'confirmation-image');
    if (photo && authoring) editable(photo.querySelector('img'), 'image', 'media', 'Image');
    const stage = el('div', { class: 'confirmation-stage' }, photo, copy);
    block.replaceChildren(stage);
  }
}
