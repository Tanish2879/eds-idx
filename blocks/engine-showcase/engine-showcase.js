import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  moveInstrumentation, holdPicture, loadHeldPicture, isAuthoring, takeRichtext, applyRichtext,
} from '../../scripts/scripts.js';
import { cubicBezier } from '../../scripts/scroll-stops.js';

/*
 * Engine Showcase: white section with a persistent headline, a counter + engine type +
 * description that follow the selection, three thumbnails (bottom left) and a large engine image
 * with '+' hotspots (right). Thumbnails switch the engine with a vertical slide in the direction of
 * the selection (to the right: the new image rises in from below; to the left: it drops in from
 * above), the current one leaving through the opposite edge; the text panel crossfades.
 * Entry: the section slides up over the pinned hero (sticky hero, see CSS), scaling from 0.945 to
 * 1 as it rises; once it has settled at the top, its content fades / rises in. The section top is
 * a scroll stop (scripts/scroll-stops.js) with the walkthrough's 1.5s ease-out glide.
 * Hand-off (desktop): when a parallax-collage section follows, the showcase stays pinned while the
 * collage, starting at the same scroll position underneath, holds still. Over the collage's first
 * hold phase: 1. the text, thumbnails and hotspots fade out, leaving only the engine; 2. the engine
 * alone travels to the collage's central card slot, shrinking as it goes (its crop opens up so it
 * lands whole); 3. it locks in as that card (the collage card is given the same image) and the
 * showcase fades away, revealing the rest of the collage around it. Whichever engine is active is
 * the one that travels.
 * Timings follow the reference walkthrough (drafts/new-energy/jsw_walkthrough.mp4).
 * Rows:
 *   1.  headline
 *   2+. one engine per row: engine image (+ optional thumbnail image, + optional framing
 *       "zoom left% top% [flip]") | engine type | description | hotspots
 *       the engine image's alt text is made from the engine type ("<type> engine"), so it is
 *       never entered separately
 *       framing: zoom relative to showing the whole image, and where the image centre sits in the
 *       display (default "1 50% 50%"), so each engine can be cropped like the walkthrough
 *       hotspots: up to 4, one paragraph each, "x y | TITLE | description": the '+' centre as
 *       % of the engine image from its bottom-left corner ("40" and "40%" both work), so they
 *       stay on the same part at any size or framing
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
// hero → showcase glide, fitted to the walkthrough's card rise
const SCROLL_GLIDE = { duration: '1.5', ease: 'cubic-bezier(0.25, 0.3, 0.15, 1)' };
// hand-off to a following collage, as fractions of the collage's first hold phase (100svh): the
// text fades, the engine travels, the collage fades in around it (then Section 3's own steps
// follow, see HANDOFF.glide and the CSS)
const HANDOFF_MEDIA = window.matchMedia('(prefers-reduced-motion: no-preference)');
const MOTION = window.matchMedia('(prefers-reduced-motion: no-preference)');
// a glide whose motion (power2.inOut) covers motionShare of the distance in timeShare of the time,
// the rest being a still hold crossed quickly: after the motion (down) or before it (up), as a CSS
// linear() easing for scripts/scroll-stops.js
const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);
function holdGlide(motionShare, timeShare, up = false) {
  const points = [];
  for (let i = 0; i <= 10; i += 1) {
    const k = i / 10;
    points.push(up
      ? [1 - timeShare + timeShare * k, 1 - motionShare + motionShare * inOut(k)]
      : [timeShare * k, motionShare * inOut(k)]);
  }
  if (up) points.unshift([0, 0]);
  else points.push([1, 1]);
  return `linear(${points.map(([x, y]) => `${y.toFixed(4)} ${(x * 100).toFixed(2)}%`).join(', ')})`;
}
const HANDOFF = {
  fadeEnd: 0.1,
  shrinkStart: 0.36,
  lockAt: 0.88,
  // wheel glides to the collage's stops (135, 235, 345svh, see CSS): the hand-off (linear, 1.55s)
  // then the 35svh hold; the fly-up (1.1s) then the part 1 hold; the card swap (1.2s, as in the
  // walkthrough 16.55–17.75s) then the part 2 hold — each hold crossed in ~0.12s
  glide: {
    duration: '1.7 1.22 1.32',
    ease: ['linear(0, 0.7407 91%, 1)', holdGlide(0.6, 0.9), holdGlide(0.6364, 0.909)].join(';'),
  },
  // leaving each stop upwards: across its hold first, then its motion played back
  glideUp: {
    duration: '1.7 1.22 1.32',
    ease: ['linear(0, 0.2593 9%, 1)', holdGlide(0.6, 0.9, true), holdGlide(0.6364, 0.909, true)].join(';'),
  },
};
const shrinkEase = cubicBezier(0.65, 0, 0.15, 0.9);
const revealEase = (t) => 1 - (1 - t) ** 2;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
let showcaseId = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false) node.setAttribute(k, v);
  });
  node.append(...children.filter(Boolean));
  return node;
}

/*
 * The images of a row in authored order (engine image, then the optional thumbnail): <img>s, or
 * links to image files. AEM delivers an image reference it can't resolve (an asset that isn't in
 * AEM Assets yet) as a plain link; placeholder images under a /drafts/ folder are then loaded from
 * the copy in this repository.
 */
function rowImages(row) {
  return [...row.querySelectorAll('img, a[href]')].map((node) => {
    if (node.tagName === 'IMG') return { src: node.src, alt: node.alt, source: node };
    const { pathname } = new URL(node.href, window.location);
    if (!IMAGE_FILE.test(pathname)) return null;
    const drafts = pathname.indexOf('/drafts/');
    return {
      src: drafts > 0 ? pathname.slice(drafts) : node.href,
      alt: node.textContent.trim(),
      source: node,
    };
  }).filter(Boolean);
}

// "1.38 58% 52% [flip]" → { zoom, x, y, flip }: zoom relative to showing the whole image, centre
// in the display, and an optional horizontal flip (e.g. an asset delivered mirrored)
function parseFraming(cell) {
  const text = [...(cell?.querySelectorAll('p') || [])]
    .filter((p) => !p.querySelector('img, picture, a'))
    .map((p) => p.textContent).join(' ');
  const m = /([\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(text);
  const flip = /\b(flip|mirror)\b/i.test(text);
  if (!m) {
    return {
      zoom: 1, x: 50, y: 50, flip,
    };
  }
  return {
    zoom: Number(m[1]) || 1, x: Number(m[2]), y: Number(m[3]), flip,
  };
}

// places a slide's image (and its hotspot layer) by the engine's framing, relative to the
// display size, so the crop matches at every size and hotspot % refer to the image itself
function frameSlide(slide, framing) {
  const img = slide.querySelector('img');
  if (!img || !img.naturalWidth || !slide.clientWidth) return;
  const bw = slide.clientWidth;
  const bh = slide.clientHeight;
  const scale = Math.min(bw / img.naturalWidth, bh / img.naturalHeight) * framing.zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const box = {
    left: `${(bw * framing.x) / 100 - w / 2}px`,
    top: `${(bh * framing.y) / 100 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  };
  [img, slide.querySelector('.engine-showcase-hotspots')].forEach((node) => {
    if (node) Object.assign(node.style, box);
  });
  img.style.transform = framing.flip ? 'scaleX(-1)' : ''; // hotspots stay on the displayed image
}

const MAX_HOTSPOTS = 4;
const MAX_ENGINES = 3;

// an authored coordinate ("40", "40%", " 40 % ") → 40, kept within the image (0–100); else NaN
function percent(value) {
  const text = String(value ?? '').replace(/%/g, '').trim();
  const n = text ? Number(text) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : NaN;
}

// the authored hotspot entries: the non-empty paragraphs / list items of the cell, as text, and
// whether they were a list (kept as they are when a hotspot is dragged to a new place)
function readHotspotLines(cell) {
  if (!cell) return { lines: [], list: false };
  const nodes = [...cell.querySelectorAll('p, li')];
  const lines = (nodes.length ? nodes.map((n) => n.textContent) : cell.textContent.split('\n'))
    .map((line) => line.trim()).filter(Boolean);
  return { lines, list: Boolean(cell.querySelector('li')) };
}

// "18% 76% | TITLE | description" → { x, y, title, text, index }: x from the image's left edge, y
// from its bottom edge, index: its entry in the authored lines; only the first MAX_HOTSPOTS
// entries are used
function parseHotspotLines(lines) {
  return lines.slice(0, MAX_HOTSPOTS).map((line, index) => {
    const [pos = '', title = '', ...rest] = line.split('|').map((s) => s.trim());
    // "40% 60%", "40 60", "40%, 60%" and "40 % 60 %" all give [40, 60]
    const [x, y] = pos.replace(/%/g, ' ').trim().split(/[\s,]+/).map(percent);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !title) return null;
    return {
      x, y, title, text: rest.join(' | '), index,
    };
  }).filter(Boolean);
}

// an authored entry with a new position (the rest of it unchanged)
function withPosition(line, x, y) {
  const bar = line.indexOf('|');
  return `${Number(x.toFixed(1))}% ${Number(y.toFixed(1))}% ${bar >= 0 ? line.slice(bar) : `| ${line}`}`;
}

// the hotspot lines as the Hotspots (rich text) field stores them
function hotspotsValue(lines, list) {
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (list) return `<ul>${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>`;
  return lines.map((line) => `<p>${escape(line)}</p>`).join('');
}

/*
 * The description (a plain-text field): its paragraphs as delivered. A value saved while the field
 * was rich text may arrive as text with the old markup in it: that is shown as its text only.
 */
function descriptionNodes(cell) {
  if (!cell) return [];
  const raw = cell.textContent.trim();
  if (!raw) return [];
  if (/<\/?[a-z][^>]*>/i.test(raw)) {
    const text = new DOMParser().parseFromString(raw, 'text/html').body.textContent.trim();
    return text ? [el('p', {}, text)] : [];
  }
  return [...cell.childNodes];
}

// authoring: marks an element as an editable field for the Universal Editor (it inherits the
// nearest component's resource unless one is given)
function editable(node, {
  resource, prop, type, label,
}) {
  if (!node) return;
  if (resource) node.dataset.aueResource = resource;
  Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

function dropInstrumentation(node) {
  [...node.attributes].filter(({ name }) => name.startsWith('data-aue-') || name.startsWith('data-richtext-'))
    .forEach(({ name }) => node.removeAttribute(name));
}

// the window size for the per-frame scroll code, kept from resize events (reading innerWidth /
// innerHeight there would force a layout after the frame's style writes)
const view = { w: window.innerWidth, h: window.innerHeight };
window.addEventListener('resize', () => {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
}, { passive: true });

const PHONE = window.matchMedia('(width < 768px)');
const EDGE = 16; // px kept clear of the screen edges by a hotspot card
const GAP = 8; // px between a '+' and its card

/*
 * Places an open hotspot card beside its '+' (never over it: the '+' stays where it is and closes
 * the card again), within what is actually visible: the display, inside the screen. The card is
 * positioned absolutely against the '+' box, outside the button's own layout.
 * Phones (the image bleeds off the screen edges): as wide as the screen allows (up to 340px),
 * centred on its '+' as far as the screen allows, below it (or above it without room below).
 * From 768px: 272px wide, to the side of the '+' facing the image centre (or the other side when
 * that one has no room), top edges level (bottom edges for a '+' near the bottom), moved up or
 * down only as far as needed to stay in view; with no room to either side (a narrow display),
 * below or above it as on phones. Without JS layout (no room measured) the CSS places
 * it the same way, by its preferred sides.
 */
function placeCard(hotspot, toggle, card) {
  Object.assign(card.style, {
    top: '', left: '', right: '', bottom: '', width: '',
  });
  const layer = card.offsetParent || hotspot; // the card's containing block (the '+' box)
  const display = hotspot.closest('.engine-showcase-display');
  if (!layer || !display) return;
  const L = layer.getBoundingClientRect();
  const D = display.getBoundingClientRect();
  const t = toggle.getBoundingClientRect();
  // the area the card stays in
  const area = {
    left: Math.max(EDGE, D.left + GAP),
    right: Math.min(window.innerWidth - EDGE, D.right - GAP),
    top: Math.max(D.top + GAP, 0),
    bottom: Math.min(D.bottom - GAP, window.innerHeight - EDGE),
  };
  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
  // below the '+' (or above it without room below; with room for neither, the roomier side),
  // centred on it as far as the area allows
  const stack = (width, height) => {
    const below = t.bottom + GAP;
    const above = t.top - GAP - height;
    let top = below;
    if (below + height > area.bottom) {
      top = above >= area.top || t.top - area.top > area.bottom - t.bottom ? above : below;
    }
    return [clamp(t.left + t.width / 2 - width / 2, area.left, area.right - width), top];
  };
  let x;
  let y;
  if (PHONE.matches) {
    const width = Math.min(340, window.innerWidth - 2 * EDGE);
    card.style.width = `${width}px`;
    [x, y] = stack(width, card.offsetHeight);
  } else {
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const right = t.right + GAP;
    const left = t.left - GAP - width;
    const fitsRight = right + width <= area.right;
    const fitsLeft = left >= area.left;
    if (!fitsRight && !fitsLeft) {
      [x, y] = stack(width, height); // a narrow display: no room to either side
    } else {
      if (hotspot.classList.contains('opens-left')) x = fitsLeft ? left : right;
      else x = fitsRight ? right : left;
      y = hotspot.classList.contains('opens-up') ? t.bottom - height : t.top;
      y = clamp(y, area.top, area.bottom - height);
    }
  }
  Object.assign(card.style, {
    left: `${(x - L.left).toFixed(1)}px`, top: `${(y - L.top).toFixed(1)}px`, right: 'auto', bottom: 'auto',
  });
}

/*
 * Authoring: saves one property of a component straight to its content in AEM author (the page
 * in the editor is served by it, with the author's session): Sling POST with the CSRF token. The
 * editor itself has no API for the page to write a field. Rejects when that isn't possible.
 */
async function saveProperty(resource, prop, value) {
  const path = /^urn:aemconnection:(\/.+)$/.exec(resource || '')?.[1];
  if (!path) throw new Error('not an AEM resource');
  const csrf = await fetch(`${window.location.origin}/libs/granite/csrf/token.json`, { credentials: 'include' });
  if (!csrf.ok || csrf.redirected) throw new Error(`CSRF token: ${csrf.status}`);
  const { token } = await csrf.json();
  const body = new FormData();
  body.append(prop, value);
  body.append(`${prop}@TypeHint`, 'String');
  body.append('_charset_', 'utf-8');
  const res = await fetch(`${window.location.origin}${path}`, {
    method: 'POST', credentials: 'include', headers: { 'CSRF-Token': token, Accept: 'application/json' }, body,
  });
  // (a lost session answers with the login page)
  if (!res.ok || res.redirected) throw new Error(`save: ${res.status}`);
}

const DRAG_START = 4; // px a '+' has to be moved before it is dragged (less: a click)

/*
 * Authoring: a '+' can be dragged over its engine image; dropped, onDrop gets its new place
 * (x / y in % of the image from its bottom-left corner). A drag doesn't open the card.
 */
function makeDraggable(hotspot, toggle, onDrop) {
  let start = null;
  let dragged = false;
  toggle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
  });
  toggle.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_START) return;
    if (!dragged) {
      dragged = true;
      toggle.setPointerCapture(e.pointerId);
      hotspot.dispatchEvent(new Event('hotspot:close'));
      hotspot.classList.add('is-dragging');
    }
    e.preventDefault();
    const L = hotspot.parentElement.getBoundingClientRect(); // the hotspot layer: the image box
    const x = clamp01((e.clientX - L.left) / L.width) * 100;
    const y = clamp01((L.bottom - e.clientY) / L.height) * 100;
    hotspot.style.left = `${x.toFixed(1)}%`;
    hotspot.style.bottom = `${y.toFixed(1)}%`;
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    if (!dragged) return;
    hotspot.classList.remove('is-dragging');
    const x = parseFloat(hotspot.style.left);
    const y = parseFloat(hotspot.style.bottom);
    hotspot.classList.toggle('opens-left', x >= 50);
    hotspot.classList.toggle('opens-up', y <= 40);
    if (e.type === 'pointerup') onDrop(x, y);
  };
  toggle.addEventListener('pointerup', end);
  toggle.addEventListener('pointercancel', end);
  // the click that ends a drag doesn't open the card
  toggle.addEventListener('click', (e) => {
    if (!dragged) return;
    dragged = false;
    e.stopImmediatePropagation();
  }, true);
}

function buildHotspot(spot, id, open) {
  const cardId = `${id}-card`;
  const hotspot = el('div', {
    // the card opens towards the image centre (left on the right half, upwards near the bottom)
    class: `engine-showcase-hotspot${spot.x >= 50 ? ' opens-left' : ''}${spot.y <= 40 ? ' opens-up' : ''}`,
    style: `left: ${spot.x}%; bottom: ${spot.y}%`,
  });
  // the '+' toggle stays where it is in both states (it turns into a '−' when open) and is also
  // what closes the card; the card is positioned beside it, outside its box (see placeCard / CSS)
  const toggle = el('button', {
    type: 'button', class: 'engine-showcase-hotspot-toggle', 'aria-expanded': 'false', 'aria-controls': cardId, 'aria-label': `Show: ${spot.title}`,
  });
  const card = el(
    'div',
    { class: 'engine-showcase-hotspot-card', id: cardId },
    el('p', { class: 'engine-showcase-hotspot-title' }, spot.title),
    spot.text ? el('p', { class: 'engine-showcase-hotspot-text' }, spot.text) : null,
  );
  hotspot.append(toggle, card);
  const setOpen = (value) => {
    if (value) placeCard(hotspot, toggle, card);
    hotspot.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', value);
    toggle.setAttribute('aria-label', `${value ? 'Hide' : 'Show'}: ${spot.title}`);
    card.inert = !value;
  };
  // a card placed against the screen is closed when the screen changes size
  window.addEventListener('resize', () => {
    if (hotspot.classList.contains('is-open')) setOpen(false);
  }, { passive: true });
  setOpen(open);
  toggle.addEventListener('click', () => {
    if (hotspot.classList.contains('is-open')) {
      setOpen(false);
      return;
    }
    // one open card per engine image
    hotspot.parentElement.querySelectorAll('.engine-showcase-hotspot.is-open')
      .forEach((h) => h.dispatchEvent(new Event('hotspot:close')));
    setOpen(true);
  });
  hotspot.addEventListener('hotspot:close', () => setOpen(false));
  hotspot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hotspot.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });
  return hotspot;
}

export default function decorate(block) {
  showcaseId += 1;
  const uid = `engine-showcase-${showcaseId}`;
  const authoring = isAuthoring();
  const [headlineRow, ...rows] = [...block.children];

  // at most MAX_ENGINES engines: once the block has that many, the editor offers no "add" (its
  // filter is switched to one that allows nothing; the editor has no item limit setting)
  if (block.dataset.aueFilter) {
    block.dataset.aueFilter = rows.length >= MAX_ENGINES ? 'engine-showcase-full' : 'engine-showcase';
  }

  // persistent headline (authored as a heading, or as plain text); authoring: the heading itself is
  // the editable rich text (no editor wrapper inside the content grid)
  const headlineText = takeRichtext(headlineRow);
  let headline = headlineRow?.querySelector('h1, h2, h3, h4, h5, h6');
  if (!headline && headlineRow?.textContent.trim()) headline = el('h2', {}, headlineRow.textContent.trim());
  if (headline) {
    headline.classList.add('engine-showcase-headline');
    moveInstrumentation(headlineRow, headline);
    applyRichtext(headline, headlineText);
  }

  const parsed = rows.map((row) => {
    const [image, thumbnail] = rowImages(row);
    if (!image) return null;
    const mediaCell = [...row.children].find((c) => c.contains(image.source));
    const cells = [...row.children].filter((c) => c !== mediaCell);
    const [titleCell, description, hotspotsCell] = cells;
    takeRichtext(hotspotsCell); // (rebuilt as the '+' buttons: edited in the properties panel)
    const title = titleCell?.textContent.trim() || image.alt;
    const { lines, list } = readHotspotLines(hotspotsCell);
    return {
      row,
      resource: row.dataset.aueResource, // (authoring: the engine's content in AEM)
      image: { ...image, alt: title ? `${title} engine` : image.alt },
      thumbnail: thumbnail || image,
      hasThumbnail: Boolean(thumbnail),
      framing: parseFraming(mediaCell),
      title,
      description,
      hotspotLines: lines,
      hotspotList: list,
      hotspots: parseHotspotLines(lines),
    };
  }).filter(Boolean);
  const engines = parsed.slice(0, MAX_ENGINES);
  const extra = parsed.slice(MAX_ENGINES);
  const total = engines.length;

  const details = el('div', { class: 'engine-showcase-details', 'aria-live': 'polite' });
  const thumbs = el('div', { class: 'engine-showcase-thumbs', role: 'group', 'aria-label': 'Engine types' });
  const display = el('div', { class: 'engine-showcase-display' });

  // authoring: a dragged '+' saves its new place in the engine's Hotspots field (only its own
  // entry changes), then the page reloads so the editor shows the saved value. Without a way to
  // save (see saveProperty), the new entry is copied for pasting into the field instead
  const status = authoring ? el('p', { class: 'engine-showcase-authoring-status', role: 'status' }) : null;
  const say = (text) => {
    status.textContent = text;
    status.classList.add('is-shown');
  };
  const moveHotspot = async (engine, spot, x, y) => {
    const line = withPosition(engine.hotspotLines[spot.index], x, y);
    engine.hotspotLines[spot.index] = line;
    const position = `${Number(x.toFixed(1))}% ${Number(y.toFixed(1))}%`;
    say(`${spot.title}: ${position}. Saving…`);
    try {
      await saveProperty(engine.resource, 'hotspots', hotspotsValue(engine.hotspotLines, engine.hotspotList));
      say(`${spot.title}: saved at ${position}.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      let copied = false;
      try {
        await navigator.clipboard.writeText(line);
        copied = true;
      } catch (err) { /* no clipboard access in this frame */ }
      say(`Couldn't save automatically. New entry${copied ? ' (copied)' : ''}, paste it into the Hotspots field: ${line}`);
    }
  };

  engines.forEach((engine, i) => {
    const panelId = `${uid}-panel-${i}`;
    // text panel (all panels share one grid cell, so switching never shifts the layout)
    const title = el('h3', { class: 'engine-showcase-title' }, engine.title);
    const panel = el(
      'div',
      { class: 'engine-showcase-detail', id: panelId },
      el('p', { class: 'engine-showcase-counter' }, `${i + 1} / ${total}`),
      title,
    );
    const descNodes = descriptionNodes(engine.description);
    let desc = null;
    if (descNodes.length) {
      desc = el('div', { class: 'engine-showcase-description' });
      desc.append(...descNodes);
      panel.append(desc);
    }
    moveInstrumentation(engine.row, panel);
    details.append(panel);

    // large image + hotspots, stacked in the same place for the crossfade
    const slide = el('div', { class: 'engine-showcase-slide' });
    slide.framing = engine.framing;
    const picture = createOptimizedPicture(engine.image.src, engine.image.alt, false, [{ media: '(min-width: 900px)', width: '1600' }, { width: '900' }]);
    moveInstrumentation(engine.image.source, picture.querySelector('img'));
    // decoded ahead once loaded (off the main thread), so it is ready when it slides in or is
    // handed over to the collage (async decoding could leave it blank for a frame mid-animation)
    const slideImg = picture.querySelector('img');
    slideImg.addEventListener('load', () => slideImg.decode().catch(() => {}), { once: true });
    slide.append(picture);
    if (engine.hotspots.length) {
      const layer = el('div', { class: 'engine-showcase-hotspots' });
      engine.hotspots.forEach((spot, s) => {
        const hotspot = buildHotspot(spot, `${uid}-${i}-${s}`, false);
        if (authoring) {
          const toggle = hotspot.querySelector('.engine-showcase-hotspot-toggle');
          makeDraggable(hotspot, toggle, (x, y) => moveHotspot(engine, spot, x, y));
        }
        layer.append(hotspot);
      });
      slide.append(layer);
    }
    display.append(slide);

    // thumbnail
    const thumb = el(
      'button',
      {
        type: 'button', class: 'engine-showcase-thumb', 'aria-pressed': 'false', 'aria-controls': panelId, 'aria-label': `${i + 1} of ${total}: ${engine.title}`,
      },
      createOptimizedPicture(engine.thumbnail.src, '', false, [{ width: '400' }]),
    );
    if (engine.hasThumbnail) moveInstrumentation(engine.thumbnail.source, thumb.querySelector('img'));
    thumbs.append(thumb);

    // authoring: every part of the engine is its own node in the editor's content tree. The
    // engine's text panel is the component (its resource moved from the row); its fields there
    // inherit the resource, the images (in the other column) name it themselves
    if (authoring && engine.resource) {
      const name = `Engine ${i + 1}${engine.title ? `: ${engine.title}` : ''}`;
      panel.dataset.aueLabel = name;
      [panel, slide, thumb].forEach((node) => { node.dataset.engineIndex = i; });
      editable(title, { prop: 'title', type: 'text', label: 'Engine type' });
      if (desc) {
        desc.querySelectorAll('[data-aue-prop], [data-richtext-prop]').forEach(dropInstrumentation);
        editable(desc, { prop: 'description', type: 'text', label: 'Description' });
      }
      editable(picture.querySelector('img'), {
        resource: engine.resource, prop: 'media_image', type: 'media', label: `${name} · image`,
      });
      if (engine.hasThumbnail) {
        editable(thumb.querySelector('img'), {
          resource: engine.resource, prop: 'media_thumbnail', type: 'media', label: `${name} · thumbnail`,
        });
      }
    }
  });

  if (status) display.append(status); // (after the slides: they are counted by position)
  const content = el('div', { class: 'engine-showcase-content' }, headline, details, thumbs);
  block.replaceChildren(content, display);

  // frame each engine (on image load and whenever the display resizes)
  const fitAll = () => [...display.children].forEach((slide) => frameSlide(slide, slide.framing));
  display.querySelectorAll('.engine-showcase-slide img').forEach((img) => {
    img.addEventListener('load', fitAll); // (also for the engines held back below)
  });
  new ResizeObserver(fitAll).observe(display);

  // only the first engine's large image loads with the page; the others (several hundred KB each)
  // are held back until the page has loaded and the showcase comes into view, or until their
  // thumbnail is reached for (hover, focus, touch), whichever comes first (all at once while
  // authoring)
  const wake = (index) => loadHeldPicture(display.children[index]?.querySelector('picture'));
  if (!authoring) {
    [...display.children].slice(1).forEach((slide) => holdPicture(slide.querySelector('picture')));
    [...thumbs.children].forEach((thumb, i) => {
      ['pointerenter', 'focus', 'touchstart'].forEach((type) => thumb.addEventListener(type, () => wake(i), { once: true, passive: true }));
    });
    const wakeAll = () => [...display.children].forEach((_, i) => wake(i));
    const inView = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      inView.disconnect();
      if (window.requestIdleCallback) window.requestIdleCallback(wakeAll, { timeout: 1000 });
      else setTimeout(wakeAll, 200);
    });
    const watch = () => inView.observe(display);
    if (document.readyState === 'complete') watch();
    else window.addEventListener('load', watch, { once: true });
  }

  // selection: the engine images slide in the selection's direction (a thumbnail to the right of
  // the current one: the new engine rises in from below and the current one leaves upwards; to the
  // left: it drops in from above and the current one leaves downwards); the text panel crossfades
  let current = -1;
  const slideEngines = (from, to) => {
    const incoming = display.children[to];
    const outgoing = display.children[from];
    if (!incoming || !outgoing || !MOTION.matches) return;
    const dir = to > from ? 1 : -1;
    // the incoming engine jumps (untransitioned) to its start just outside one edge…
    incoming.classList.remove('is-leaving');
    incoming.style.transition = 'none';
    incoming.style.transform = `translateY(${dir * 100}%)`;
    incoming.getBoundingClientRect(); // commit the start position
    incoming.style.transition = '';
    incoming.style.transform = '';
    // …while the current one travels out of the opposite edge
    outgoing.style.setProperty('--es-slide-to', `${-dir * 100}%`);
    outgoing.classList.add('is-leaving');
    const done = (e) => {
      if (e.target !== outgoing || e.propertyName !== 'transform') return;
      outgoing.removeEventListener('transitionend', done);
      if (!outgoing.classList.contains('is-active')) outgoing.classList.remove('is-leaving');
    };
    outgoing.addEventListener('transitionend', done);
  };
  const select = (index) => {
    if (index === current) return;
    wake(index);
    if (current >= 0) slideEngines(current, index);
    [details.children, display.children, thumbs.children].forEach((list) => {
      [...list].forEach((node, i) => {
        node.classList.toggle('is-active', i === index);
        if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', i === index);
        else node.inert = i !== index;
      });
    });
    current = index;
  };
  [...thumbs.children].forEach((thumb, i) => thumb.addEventListener('click', () => select(i)));
  if (total) select(0);

  // authoring (Universal Editor, see isAuthoring): static, everything shown at once; no rise, no
  // hand-off to the collage and no scroll stops
  if (authoring) {
    block.classList.add('is-revealed');
    // selecting an engine's node in the content tree (or on the page) shows that engine
    block.addEventListener('aue:ui-select', (e) => {
      if (e.detail?.selected === false) return;
      const index = Number(e.target.closest?.('[data-engine-index]')?.dataset.engineIndex);
      if (Number.isInteger(index)) select(index);
    });
    // engines beyond MAX_ENGINES (e.g. added before the limit) aren't shown on the site: listed
    // here, still selectable, so they can be removed
    if (extra.length) {
      const note = el('div', { class: 'engine-showcase-overflow', role: 'note' }, el('p', {}, `Only ${MAX_ENGINES} engines are shown on the site. Not shown:`));
      extra.forEach((engine, k) => {
        const item = el('p', { class: 'engine-showcase-overflow-item' }, `Engine ${MAX_ENGINES + k + 1}${engine.title ? `: ${engine.title}` : ''}`);
        moveInstrumentation(engine.row, item);
        note.append(item);
      });
      block.append(note);
    }
    return;
  }

  // entry: scale with the rise; reveal the content once the section has settled at the top
  const section = block.closest('.section') || block;
  block.classList.add('is-armed');
  let ticking = false;
  let lastRise = '';
  const update = () => {
    ticking = false;
    if (!section.offsetHeight) return; // section still hidden while the page loads
    const { top } = section.getBoundingClientRect();
    const rise = Math.min(Math.max(1 - top / view.h, 0), 1).toFixed(4);
    // (once risen it stays at 1: no style change, so no restyle, on the frames after)
    if (rise !== lastRise) section.style.setProperty('--es-rise', rise);
    lastRise = rise;
    if (top <= 2 && !block.classList.contains('is-revealed')) block.classList.add('is-revealed');
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  new ResizeObserver(onScroll).observe(section);
  update();

  // hand-off to a following parallax collage
  const next = section.nextElementSibling;
  const collage = next?.querySelector('.parallax-collage');
  if (collage) {
    // the collage card shows the active engine: its picture is carried over (the authored hero is
    // restored when the hand-off is off, e.g. with reduced motion). The authored hero image is
    // held back by the collage (it is replaced before it would show), and loads only if restored
    collage.dataset.heroCarried = '';
    let authoredPicture = null;
    let carried = -1;
    const carry = (index) => {
      const card = collage.querySelector('.engine');
      const slide = display.children[index];
      const picture = slide?.querySelector('picture');
      if (!card || !picture || carried === index) return;
      if (carried < 0) authoredPicture = card.querySelector('picture');
      const clone = picture.cloneNode(true);
      [clone, ...clone.querySelectorAll('*')].forEach((node) => {
        [...node.attributes].filter((a) => a.name.startsWith('data-aue')).forEach((a) => node.removeAttribute(a.name));
      });
      const img = clone.querySelector('img');
      img.removeAttribute('style'); // drop the showcase framing; the card fits the whole image
      img.loading = 'eager';
      if (slide.framing?.flip) img.style.transform = 'scaleX(-1)';
      card.querySelector('picture')?.replaceWith(clone);
      carried = index;
    };
    const restoreCard = () => {
      if (carried < 0 || !authoredPicture) return;
      collage.querySelector('.engine picture')?.replaceWith(authoredPicture);
      carried = -1;
    };
    const reset = () => {
      restoreCard();
      loadHeldPicture(collage.querySelector('.engine picture'));
      section.classList.remove('is-handoff');
      collage.classList.remove('is-handoff', 'is-handed');
      delete collage.dataset.scrollAuto;
      delete collage.dataset.scrollSkipUp;
      delete collage.dataset.scrollDurationUp;
      delete collage.dataset.scrollEaseUp;
      [section, next, content, display, ...content.children].forEach(({ style }) => {
        ['top', 'marginTop', 'opacity', 'overflow', 'transform', 'transition', 'pointerEvents'].forEach((k) => { style[k] = ''; });
      });
      display.querySelectorAll('.engine-showcase-slide img').forEach((img) => { img.style.clipPath = ''; });
      section.inert = false;
      next.inert = false;
      display.style.removeProperty('--es-hotspots');
    };
    // the engine leaves its crop: the image is clipped to the display box at p = 0 and whole at 1,
    // while its box R travels to T, the whole image fitted in the card slot (contain, centred).
    // Measured first; the returned function applies it (so no layout is read after a style write)
    const measureTravel = (p, slot) => {
      const slide = display.querySelector('.engine-showcase-slide.is-active');
      const img = slide?.querySelector('img');
      const others = () => display.querySelectorAll('.engine-showcase-slide img').forEach((other) => {
        if (other !== img && other.style.clipPath) other.style.clipPath = '';
      });
      if (!img?.naturalWidth || !slot || p <= 0) {
        return () => {
          others();
          display.style.transform = '';
          display.style.transition = '';
          display.style.overflow = '';
          if (img) img.style.clipPath = '';
        };
      }
      const w = img.offsetWidth;
      const h = img.offsetHeight;
      const crop = [
        Math.max(0, -img.offsetTop),
        Math.max(0, img.offsetLeft + w - display.clientWidth),
        Math.max(0, img.offsetTop + h - display.clientHeight),
        Math.max(0, -img.offsetLeft),
      ];
      if (slide.framing?.flip) [crop[1], crop[3]] = [crop[3], crop[1]]; // clip-path is pre-flip
      // the display is scaled from its top-left; it is positioned within the block
      const B = block.getBoundingClientRect();
      const D = { left: B.left + display.offsetLeft, top: B.top + display.offsetTop };
      const R = { left: D.left + img.offsetLeft, top: D.top + img.offsetTop, w };
      const fit = Math.min(slot.width / img.naturalWidth, slot.height / img.naturalHeight);
      const T = { w: img.naturalWidth * fit, h: img.naturalHeight * fit };
      T.left = slot.left + (slot.width - T.w) / 2;
      T.top = slot.top + (slot.height - T.h) / 2;
      const k = (R.w + (T.w - R.w) * p) / R.w;
      const left = R.left + (T.left - R.left) * p;
      const top = R.top + (T.top - R.top) * p;
      const tx = left - (D.left + (R.left - D.left) * k);
      const ty = top - (D.top + (R.top - D.top) * k);
      return () => {
        others();
        img.style.clipPath = `inset(${crop.map((v) => `${(v * (1 - p)).toFixed(2)}px`).join(' ')})`;
        display.style.overflow = 'visible';
        display.style.transition = 'none'; // follow the scroll exactly (no reveal transition)
        display.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(5)})`;
      };
    };
    // the collage's hold lengths in px (its CSS custom properties): read again only when its
    // classes or the window size change, as reading them on every frame forces a full restyle
    let phases = { key: '' };
    const collagePhases = () => {
      const key = `${collage.className}|${view.w}x${view.h}`;
      if (phases.key === key) return phases;
      const layer = collage.querySelector('.sticky-text-layer');
      const svh = (layer?.clientHeight || view.h) / 100;
      const cs = getComputedStyle(collage);
      const enter = parseFloat(cs.getPropertyValue('--hold-enter')) * svh;
      const measured = { key, enter, hold: enter + parseFloat(cs.getPropertyValue('--hold-fade')) * svh };
      if (enter > 0) phases = measured; // (not kept while the collage CSS is still loading)
      return measured;
    };
    // the state last applied: frames that would change nothing (before the hand-off starts, or
    // once it is over) are skipped
    let applied = '';
    let pinned = '';
    const handoff = () => {
      if (!HANDOFF_MEDIA.matches || !section.offsetHeight) {
        // (reset again once the collage has been built, to let its own engine image load)
        const off = `off|${Boolean(collage.querySelector('.engine'))}`;
        if (applied !== off) reset();
        applied = off;
        pinned = '';
        return;
      }
      if (!collage.classList.contains('is-handoff')) {
        section.classList.add('is-handoff');
        collage.classList.add('is-handoff');
        collage.dataset.scrollDuration = HANDOFF.glide.duration;
        collage.dataset.scrollEase = HANDOFF.glide.ease;
        collage.dataset.scrollDurationUp = HANDOFF.glideUp.duration;
        collage.dataset.scrollEaseUp = HANDOFF.glideUp.ease;
      }
      // Section 3 is two scroll steps: the first lands the engine in its card (part 1) and holds
      // there; the second flies it up to reveal the text (part 2) — both ways
      // the showcase pins at the top, or, when taller than the window (phones), by its bottom
      // edge so its lower part (thumbnails, engine) stays in view; the collage starts right under
      // the window (set again only when the sizes change)
      const height = section.offsetHeight;
      const pinTop = Math.min(0, view.h - height);
      if (pinned !== `${pinTop}|${height}`) {
        section.style.top = `${pinTop}px`;
        next.style.marginTop = `-${height + pinTop}px`;
        pinned = `${pinTop}|${height}`;
      }

      // measure
      const { enter: enterPx, hold: holdPx } = collagePhases();
      const secTop = section.getBoundingClientRect().top;
      const collageTop = collage.getBoundingClientRect().top;
      const u = enterPx ? clamp01(-collageTop / enterPx) : 0;
      // the collage shows only once the showcase has settled on top of it
      const waiting = secTop > pinTop + 0.5;
      let phase = u;
      if (u <= 0) phase = 'before';
      else if (u >= 1) phase = 'after';
      const state = [phase, waiting, current, view.w, view.h, height].join('|');
      if (state === applied) return;
      applied = state;

      // 2. (measured now, applied below) the engine travels to the collage's central card slot,
      // shrinking. The slot is where the collage's engine sits: its rendered box, corrected for the
      // hold offset the collage applies this frame (its own scroll handler may not have run yet;
      // its current offset is read from the inline style, which doesn't force a restyle)
      const { shrinkStart, lockAt } = HANDOFF;
      const p = shrinkEase(clamp01((u - shrinkStart) / (lockAt - shrinkStart)));
      const engine = collage.querySelector('.engine');
      const imagesLayer = collage.querySelector('.scrolling-images-layer');
      let slot = null;
      if (engine && imagesLayer && p > 0) {
        const r = engine.getBoundingClientRect();
        const shown = parseFloat(/translate3d\(0px?, (-?[\d.]+)px/.exec(imagesLayer.style.transform)?.[1]) || 0;
        const dy = Math.min(holdPx, Math.max(0, -collageTop)) - shown;
        slot = {
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          top: r.top + dy,
          bottom: r.bottom + dy,
        };
      }
      const moveEngine = measureTravel(p, slot);

      // apply (opacity, not visibility, for the waiting collage: descendants may set visibility)
      next.style.opacity = waiting ? '0' : '';
      next.inert = waiting;

      // 1. the text, thumbnails and hotspots fade out: only the engine is left
      const fade = revealEase(clamp01(u / HANDOFF.fadeEnd));
      // (its parts, as on phones the column itself has no box)
      [...content.children].forEach(({ style }) => {
        style.opacity = u > 0 ? String(1 - fade) : '';
        style.transition = u > 0 ? 'none' : ''; // follow the scroll (not the reveal transition)
      });
      display.style.setProperty('--es-hotspots', String(1 - fade));

      // the active engine (whichever thumbnail is selected) becomes the collage card's image
      carry(current);
      moveEngine();

      // 3. landed: the collage's card (same image, same place) takes over underneath and the
      // showcase fades away, revealing the rest of the collage around the engine
      const locked = u >= HANDOFF.lockAt;
      const reveal = revealEase(clamp01((u - HANDOFF.lockAt) / (1 - HANDOFF.lockAt)));
      collage.classList.toggle('is-handed', locked);
      section.style.opacity = locked ? (1 - reveal).toFixed(4) : '';
      section.style.pointerEvents = locked ? 'none' : '';
      section.inert = locked;
    };
    let handoffTick = false;
    const onHandoff = () => {
      if (handoffTick) return;
      handoffTick = true;
      requestAnimationFrame(() => { handoffTick = false; handoff(); });
    };
    window.addEventListener('scroll', onHandoff, { passive: true });
    window.addEventListener('resize', onHandoff, { passive: true });
    HANDOFF_MEDIA.addEventListener('change', onHandoff);
    new ResizeObserver(onHandoff).observe(next);
    handoff();
  }

  // a scroll stop, reached with the walkthrough's glide (wheel / trackpad, and touch swipes: on
  // phones one swipe moves one stop too): the section top, or, when the section is taller than the
  // window (phones), where its bottom meets the window bottom (as the hand-off pins it), so the
  // engine with all its hotspots and the thumbnails are in view
  const setStop = () => {
    const below = section.offsetHeight - block.offsetTop - window.innerHeight;
    block.dataset.scrollStops = String(Math.max(0, Math.round(below)));
  };
  setStop();
  window.addEventListener('resize', setStop, { passive: true });
  new ResizeObserver(setStop).observe(section);
  block.dataset.scrollDuration = SCROLL_GLIDE.duration;
  block.dataset.scrollEase = SCROLL_GLIDE.ease;
  const startWheel = () => import('../../scripts/scroll-stops.js').then(({ default: init }) => init({ touch: true }));
  if (document.readyState === 'complete') startWheel();
  else window.addEventListener('load', startWheel, { once: true });
}
