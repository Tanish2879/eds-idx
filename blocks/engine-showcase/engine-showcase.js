import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Engine Showcase: white section with a persistent headline, a counter + engine type +
 * description that follow the selection, three thumbnails (bottom left) and a large engine image
 * with '+' hotspots (right). Thumbnails switch the engine: the images crossfade in place and the
 * text panel updates. The section slides over the hero above it (sticky hero, see CSS) and its
 * content fades / rises in when it enters the viewport.
 * Rows:
 *   1.  headline
 *   2+. one engine per row: image | engine type | description | hotspots
 *       hotspots: one paragraph each, "left% top% | TITLE | description"
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
// the first hotspot of each engine starts open on two-column layouts (as in the design); on
// phones its card would cover the image, so all start closed
const TWO_COLUMNS = window.matchMedia('(width >= 768px)');
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
 * The image of a row: an <img>, or a link to an image file. AEM delivers an image reference it
 * can't resolve (an asset that isn't in AEM Assets yet) as a plain link; placeholder images under
 * a /drafts/ folder are then loaded from the copy in this repository.
 */
function rowImage(row) {
  const img = row.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...row.querySelectorAll('a[href]')]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return {
    src: drafts > 0 ? pathname.slice(drafts) : link.href,
    alt: link.textContent.trim(),
    source: link,
  };
}

// "18% 24% | TITLE | description" → { x, y, title, text }
function parseHotspots(cell) {
  if (!cell) return [];
  const lines = [...cell.querySelectorAll('p, li')].map((n) => n.textContent);
  if (!lines.length && cell.textContent.trim()) lines.push(...cell.textContent.split('\n'));
  return lines.map((line) => {
    const [pos = '', title = '', ...rest] = line.split('|').map((s) => s.trim());
    const [x, y] = pos.split(/[\s,]+/).map((v) => parseFloat(v));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !title) return null;
    return {
      x, y, title, text: rest.join(' | '),
    };
  }).filter(Boolean);
}

function buildHotspot(spot, id, open) {
  const cardId = `${id}-card`;
  const hotspot = el('div', {
    class: `engine-showcase-hotspot${spot.x >= 50 ? ' opens-left' : ''}${spot.y >= 60 ? ' opens-up' : ''}`,
    style: `--x: ${spot.x}%; --y: ${spot.y}%`,
  });
  const toggle = el('button', {
    type: 'button', class: 'engine-showcase-hotspot-toggle', 'aria-expanded': 'false', 'aria-controls': cardId, 'aria-label': `Show: ${spot.title}`,
  });
  const close = el('button', { type: 'button', class: 'engine-showcase-hotspot-close', 'aria-label': `Hide: ${spot.title}` });
  const card = el(
    'div',
    { class: 'engine-showcase-hotspot-card', id: cardId },
    el('div', { class: 'engine-showcase-hotspot-head' }, el('p', { class: 'engine-showcase-hotspot-title' }, spot.title), close),
    spot.text ? el('p', { class: 'engine-showcase-hotspot-text' }, spot.text) : null,
  );
  hotspot.append(toggle, card);
  const setOpen = (value) => {
    hotspot.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', value);
    card.inert = !value;
  };
  setOpen(open);
  toggle.addEventListener('click', () => {
    // one open card per engine image
    hotspot.parentElement.querySelectorAll('.engine-showcase-hotspot.is-open')
      .forEach((h) => h.dispatchEvent(new Event('hotspot:close')));
    setOpen(true);
    close.focus();
  });
  close.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });
  hotspot.addEventListener('hotspot:close', () => setOpen(false));
  hotspot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hotspot.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  return hotspot;
}

export default function decorate(block) {
  showcaseId += 1;
  const uid = `engine-showcase-${showcaseId}`;
  const [headlineRow, ...rows] = [...block.children];

  // persistent headline (authored as a heading, or as plain text)
  let headline = headlineRow?.querySelector('h1, h2, h3, h4, h5, h6');
  if (!headline && headlineRow?.textContent.trim()) headline = el('h2', {}, headlineRow.textContent.trim());
  if (headline) {
    headline.classList.add('engine-showcase-headline');
    moveInstrumentation(headlineRow, headline);
  }

  const engines = rows.map((row) => {
    const image = rowImage(row);
    if (!image) return null;
    const cells = [...row.children].filter((c) => !c.contains(image.source));
    const [title, description, hotspots] = cells;
    return {
      row,
      image,
      title: title?.textContent.trim() || image.alt,
      description,
      hotspots: parseHotspots(hotspots),
    };
  }).filter(Boolean);
  const total = engines.length;

  const details = el('div', { class: 'engine-showcase-details', 'aria-live': 'polite' });
  const thumbs = el('div', { class: 'engine-showcase-thumbs', role: 'group', 'aria-label': 'Engine types' });
  const display = el('div', { class: 'engine-showcase-display' });

  engines.forEach((engine, i) => {
    const panelId = `${uid}-panel-${i}`;
    // text panel (all panels share one grid cell, so switching never shifts the layout)
    const panel = el(
      'div',
      { class: 'engine-showcase-detail', id: panelId },
      el('p', { class: 'engine-showcase-counter' }, `${i + 1}/${total}`),
      el('h3', { class: 'engine-showcase-title' }, engine.title),
    );
    if (engine.description?.textContent.trim()) {
      const desc = el('div', { class: 'engine-showcase-description' });
      desc.append(...engine.description.childNodes);
      panel.append(desc);
    }
    moveInstrumentation(engine.row, panel);
    details.append(panel);

    // large image + hotspots, stacked in the same place for the crossfade
    const slide = el('div', { class: 'engine-showcase-slide' });
    const picture = createOptimizedPicture(engine.image.src, engine.image.alt, false, [{ media: '(min-width: 900px)', width: '1600' }, { width: '900' }]);
    moveInstrumentation(engine.image.source, picture.querySelector('img'));
    slide.append(picture);
    if (engine.hotspots.length) {
      const layer = el('div', { class: 'engine-showcase-hotspots' });
      engine.hotspots.forEach((spot, s) => {
        layer.append(buildHotspot(spot, `${uid}-${i}-${s}`, s === 0 && TWO_COLUMNS.matches));
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
      createOptimizedPicture(engine.image.src, '', false, [{ width: '400' }]),
    );
    thumbs.append(thumb);
  });

  const content = el('div', { class: 'engine-showcase-content' }, headline, details, thumbs);
  block.replaceChildren(content, display);

  // selection: crossfade the images, swap the text panel, mark the thumbnail
  const select = (index) => {
    [details.children, display.children, thumbs.children].forEach((list) => {
      [...list].forEach((node, i) => {
        node.classList.toggle('is-active', i === index);
        if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', i === index);
        else node.inert = i !== index;
      });
    });
  };
  [...thumbs.children].forEach((thumb, i) => thumb.addEventListener('click', () => select(i)));
  if (total) select(0);

  // entry: reveal the content as the section slides in
  block.classList.add('is-armed');
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      block.classList.add('is-revealed');
      observer.disconnect();
    }
  }, { threshold: 0.2 });
  observer.observe(block);
}
