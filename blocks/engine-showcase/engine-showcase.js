import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { cubicBezier } from '../../scripts/scroll-stops.js';

/*
 * Engine Showcase: white section with a persistent headline, a counter + engine type +
 * description that follow the selection, three thumbnails (bottom left) and a large engine image
 * with '+' hotspots (right). Thumbnails switch the engine with a crossfade: the current image fades
 * out while the next one fades in, in exactly the same place, and the text panel crossfades.
 * Entry: the section slides up over the pinned hero (sticky hero, see CSS), scaling from 0.945 to
 * 1 as it rises; once it has settled at the top, its content fades / rises in. The section top is
 * a scroll stop (scripts/scroll-stops.js) with the walkthrough's 1.5s ease-out glide.
 * Hand-off (desktop): when a parallax-collage section follows, the showcase stays pinned while the
 * collage, starting at the same scroll position underneath, holds still; over the collage's first
 * hold phase the showcase text fades, then the whole card shrinks into the collage's engine slot,
 * darkening to black, and the collage's engine takes over.
 * Timings follow the reference walkthrough (drafts/new-energy/jsw_walkthrough.mp4).
 * Rows:
 *   1.  headline
 *   2+. one engine per row: engine image (+ optional thumbnail image, + optional framing
 *       "zoom left% top%") | engine type | description | hotspots
 *       framing: zoom relative to showing the whole image, and where the image centre sits in the
 *       display (default "1 50% 50%"), so each engine can be cropped like the walkthrough
 *       hotspots: one paragraph each, "left% top% | TITLE | description", positioned on the
 *       engine image itself, so they stay on the same part at any size or framing
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
// hero → showcase glide, fitted to the walkthrough's card rise
const SCROLL_GLIDE = { duration: '1.5', ease: 'cubic-bezier(0.25, 0.3, 0.15, 1)' };
// hand-off to a following collage, as fractions of the collage's first hold phase (walkthrough:
// text fades 12.95–13.1s, pause, card shrinks ≈13.6–14.47s with this curve; darkening = shrink^1.8)
const HANDOFF_MEDIA = window.matchMedia('(width >= 768px) and (prefers-reduced-motion: no-preference)');
const HANDOFF = {
  fadeEnd: 0.1, shrinkStart: 0.43, darken: 1.8, glide: { duration: '1.52 1.8', ease: 'none;power2.inOut' },
};
const shrinkEase = cubicBezier(0.65, 0, 0.15, 0.9);
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

// "1.38 58% 52%" → { zoom, x, y }: zoom relative to showing the whole image, centre in the display
function parseFraming(cell) {
  const text = [...(cell?.querySelectorAll('p') || [])]
    .filter((p) => !p.querySelector('img, picture, a'))
    .map((p) => p.textContent).join(' ');
  const m = /([\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(text);
  if (!m) return { zoom: 1, x: 50, y: 50 };
  return { zoom: Number(m[1]) || 1, x: Number(m[2]), y: Number(m[3]) };
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
    const [image, thumbnail] = rowImages(row);
    if (!image) return null;
    const mediaCell = [...row.children].find((c) => c.contains(image.source));
    const cells = [...row.children].filter((c) => c !== mediaCell);
    const [title, description, hotspots] = cells;
    return {
      row,
      image,
      thumbnail: thumbnail || image,
      framing: parseFraming(mediaCell),
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
      el('p', { class: 'engine-showcase-counter' }, `${i + 1} / ${total}`),
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
    slide.framing = engine.framing;
    const picture = createOptimizedPicture(engine.image.src, engine.image.alt, false, [{ media: '(min-width: 900px)', width: '1600' }, { width: '900' }]);
    moveInstrumentation(engine.image.source, picture.querySelector('img'));
    slide.append(picture);
    if (engine.hotspots.length) {
      const layer = el('div', { class: 'engine-showcase-hotspots' });
      engine.hotspots.forEach((spot, s) => layer.append(buildHotspot(spot, `${uid}-${i}-${s}`, false)));
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
    if (engine.thumbnail !== engine.image) moveInstrumentation(engine.thumbnail.source, thumb.querySelector('img'));
    thumbs.append(thumb);
  });

  const content = el('div', { class: 'engine-showcase-content' }, headline, details, thumbs);
  block.replaceChildren(content, display);

  // frame each engine (on image load and whenever the display resizes)
  const fitAll = () => [...display.children].forEach((slide) => frameSlide(slide, slide.framing));
  display.querySelectorAll('.engine-showcase-slide img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', fitAll);
  });
  new ResizeObserver(fitAll).observe(display);

  // selection: crossfade the engine images and the text panel, mark the thumbnail
  let current = -1;
  const select = (index) => {
    if (index === current) return;
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

  // entry: scale with the rise; reveal the content once the section has settled at the top
  const section = block.closest('.section') || block;
  block.classList.add('is-armed');
  let ticking = false;
  const update = () => {
    ticking = false;
    if (!section.offsetHeight) return; // section still hidden while the page loads
    const { top } = section.getBoundingClientRect();
    const rise = Math.min(Math.max(1 - top / window.innerHeight, 0), 1);
    section.style.setProperty('--es-rise', rise.toFixed(4));
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
    const fileOf = (img) => (img?.currentSrc || img?.src || '').split('/').pop().split('?')[0];
    let switchedFrom = null;
    const reset = () => {
      section.classList.remove('is-handoff');
      collage.classList.remove('is-handoff', 'is-handed');
      [section.style, next.style, content.style, display.style].forEach((st) => {
        ['clipPath', 'marginTop', 'opacity', 'transform', 'transition', 'pointerEvents'].forEach((k) => { st[k] = ''; });
      });
      section.inert = false;
      next.inert = false;
      block.style.removeProperty('--es-dark');
      display.style.removeProperty('--es-hotspots');
    };
    const handoff = () => {
      const fits = section.offsetHeight && section.offsetHeight <= window.innerHeight + 1;
      if (!HANDOFF_MEDIA.matches || !fits) {
        reset();
        return;
      }
      section.classList.add('is-handoff');
      collage.classList.add('is-handoff');
      collage.dataset.scrollDuration = HANDOFF.glide.duration;
      collage.dataset.scrollEase = HANDOFF.glide.ease;
      next.style.marginTop = `-${section.offsetHeight}px`; // the collage starts right underneath
      const sec = section.getBoundingClientRect();
      // the collage shows only once the showcase has settled on top of it (opacity, not visibility:
      // descendants may set visibility: visible)
      const waiting = sec.top > 0.5;
      next.style.opacity = waiting ? '0' : '';
      next.inert = waiting;
      const layer = collage.querySelector('.sticky-text-layer');
      const svh = (layer?.clientHeight || window.innerHeight) / 100;
      const cs = getComputedStyle(collage);
      const enterPx = parseFloat(cs.getPropertyValue('--hold-enter')) * svh;
      const holdPx = enterPx + parseFloat(cs.getPropertyValue('--hold-fade')) * svh;
      const collageTop = collage.getBoundingClientRect().top;
      const u = enterPx ? clamp01(-collageTop / enterPx) : 0;

      // 1. the text, thumbnails and hotspots fade out
      const fade = 1 - (1 - clamp01(u / HANDOFF.fadeEnd)) ** 2;
      content.style.opacity = u > 0 ? String(1 - fade) : '';
      display.style.setProperty('--es-hotspots', String(1 - fade));

      // show the collage's engine in the card before it shrinks (restored when scrolling back)
      const heroImg = collage.querySelector('.engine img');
      const match = [...display.children]
        .findIndex((sl) => fileOf(sl.querySelector('img')) === fileOf(heroImg));
      if (u > 0 && match >= 0 && current !== match) {
        if (switchedFrom === null) switchedFrom = current;
        select(match);
      } else if (u === 0 && switchedFrom !== null) {
        select(switchedFrom);
        switchedFrom = null;
      }

      // 2. the card shrinks into the collage's engine slot and darkens
      const p = shrinkEase(clamp01((u - HANDOFF.shrinkStart) / (1 - HANDOFF.shrinkStart)));
      // the slot where the collage's engine sits now: its rendered box, corrected for the collage
      // hold offset it will apply this frame (its own scroll handler may not have run yet)
      const engine = collage.querySelector('.engine');
      const imagesLayer = collage.querySelector('.scrolling-images-layer');
      let slot = null;
      if (engine && imagesLayer) {
        const r = engine.getBoundingClientRect();
        const applied = new DOMMatrixReadOnly(getComputedStyle(imagesLayer).transform).m42;
        const dy = Math.min(holdPx, Math.max(0, -collageTop)) - applied;
        slot = {
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          top: r.top + dy,
          bottom: r.bottom + dy,
        };
      }
      if (slot && p > 0) {
        const W = sec.width;
        const H = sec.height;
        const inset = [slot.top, W - slot.right, H - slot.bottom, slot.left].map((v) => `${v * p}px`);
        section.style.clipPath = `inset(${inset.join(' ')} round 20px)`;
        block.style.setProperty('--es-dark', (p ** HANDOFF.darken).toFixed(4));
        // the engine image travels to the slot's cover position (display scaled from its top-left)
        const img = display.querySelector('.engine-showcase-slide.is-active img');
        if (img?.naturalWidth) {
          const D = { left: sec.left + display.offsetLeft, top: sec.top + display.offsetTop };
          const R = {
            left: D.left + img.offsetLeft,
            top: D.top + img.offsetTop,
            w: img.offsetWidth,
            h: img.offsetHeight,
          };
          const cover = Math.max(slot.width / img.naturalWidth, slot.height / img.naturalHeight);
          const T = {
            w: img.naturalWidth * cover, h: img.naturalHeight * cover, left: 0, top: 0,
          };
          T.left = slot.left + (slot.width - T.w) / 2;
          T.top = slot.top + (slot.height - T.h) / 2;
          const k = (R.w + (T.w - R.w) * p) / R.w;
          const left = R.left + (T.left - R.left) * p;
          const top = R.top + (T.top - R.top) * p;
          const tx = left - (D.left + (R.left - D.left) * k);
          const ty = top - (D.top + (R.top - D.top) * k);
          display.style.transition = 'none'; // follow the scroll exactly (no reveal transition)
          display.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(5)})`;
        }
      } else {
        section.style.clipPath = '';
        block.style.removeProperty('--es-dark');
        display.style.transform = '';
        display.style.transition = '';
      }

      // 3. done: the collage's own engine takes over
      const done = u >= 1;
      collage.classList.toggle('is-handed', done);
      section.style.opacity = done ? '0' : '';
      section.style.pointerEvents = done ? 'none' : '';
      section.inert = done;
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

  // the section top is a wheel stop, reached with the walkthrough's glide
  block.dataset.scrollStops = '0';
  block.dataset.scrollDuration = SCROLL_GLIDE.duration;
  block.dataset.scrollEase = SCROLL_GLIDE.ease;
  const startWheel = () => import('../../scripts/scroll-stops.js').then(({ default: init }) => init());
  if (document.readyState === 'complete') startWheel();
  else window.addEventListener('load', startWheel, { once: true });
}
