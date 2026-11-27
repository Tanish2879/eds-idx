/*
 * interactive-showcase, style Cover: the showcase image fills the screen; the items (paint or
 * trim colours) become swatches in a frosted rail on the left, the title sits at the bottom
 * left and the optional button at the bottom right. Two or more Cover showcases in sections one
 * after the other get a switch at the top between them, named by each one's View name. With
 * the View Tabs toggle on the first, they share one screen and the switch changes the view
 * in place (see absorbViews).
 * A + point opens a detail panel (its title, description and a link on to the next point) while
 * the image zooms in on it, as in the Code T prototype.
 * Built on the base block's DOM (interactive-showcase.js); interactive-showcase-cover.css lays
 * it out.
 */

import { loadBlock } from '../../scripts/aem.js';

// the prototype's phone layout (no zoom, the swatches in a row above the button)
const WIDE = '(width >= 600px)';
const CALM = '(prefers-reduced-motion: reduce)';
// how far a + point's image zooms in, and where the point then sits on the screen (share of its
// width and height), as in the prototype
const ZOOM = 1.9;
const ZOOM_AT = { x: 0.36, y: 0.5 };
// phones: max zoom of the slider; arrow keys step by STEP, Page Up / Down by PAGE
const SLIDER_ZOOM = 2;
const SLIDER_STEP = 0.1;
const SLIDER_PAGE = 0.25;
// no easing while the slider moves, then ease again
const SCRUB_MS = 200;
// the old colour stays under the new one while that fades in (interactive-showcase-cover.css)
const FADE_MS = 700;
// the views' crossfade (see .has-view-tabs in the CSS)
const VIEW_FADE_MS = 500;
// the detail panel's text swaps (going to the next point) and its closing
const SWAP_MS = 200;
const CLOSE_MS = 350;
// phones: the detail panel's titles are cut to this many characters, so the panel fits one screen
const TITLE_MAX = 30;

const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.07 11.69l-5.63 5.63a.62.62 0 0 1-.88 0l-5.63-5.63a.62.62 0 0 1 .88-.88l4.56 4.56V3.13a.62.62 0 0 1 1.25 0v12.24l4.56-4.56a.62.62 0 0 1 .89.88z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.28 18.22a.75.75 0 1 1-1.06 1.06L12 13.06l-6.22 6.22a.75.75 0 0 1-1.06-1.06L10.94 12 4.72 5.78a.75.75 0 0 1 1.06-1.06L12 10.94l6.22-6.22a.75.75 0 1 1 1.06 1.06L13.06 12z"/></svg>';

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/[\s_]+/g, '-');

/** text cut to max characters at a word, ending in an ellipsis (counted in max) */
const cut = (text, max) => {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head.slice(0, max - 1)).replace(/[\s,;:.-]+$/, '')}…`;
};

/** shows text, cut on phones; screen readers still get all of it */
const setTitle = (node, text) => {
  const short = window.matchMedia(WIDE).matches ? text : cut(text, TITLE_MAX);
  if (short === text) {
    node.textContent = text;
    return;
  }
  const shown = el('span', '', { 'aria-hidden': 'true' });
  shown.textContent = short;
  const full = el('span', 'visually-hidden');
  full.textContent = text;
  node.replaceChildren(shown, full);
};

/** the Cover showcase block directly in a section, if it has one */
const coverOf = (section) => (section?.matches?.('main > .section')
  ? section.querySelector(':scope > div > .interactive-showcase.cover')
  : null);

/** the sections, one after the other, around (and with) this one that hold a Cover showcase */
function coverRun(section) {
  const run = [section];
  for (let s = section.previousElementSibling; coverOf(s); s = s.previousElementSibling) {
    run.unshift(s);
  }
  for (let s = section.nextElementSibling; coverOf(s); s = s.nextElementSibling) run.push(s);
  return run;
}

/** a Cover block's View name once it is decorated ('' if it has none) */
function viewLabel(block) {
  const read = () => {
    if (block.dataset.viewLabel) return block.dataset.viewLabel;
    return block.dataset.blockStatus === 'loaded' ? '' : null;
  };
  return new Promise((resolve) => {
    if (read() !== null) {
      resolve(read());
      return;
    }
    const watch = new MutationObserver(() => {
      if (read() === null) return;
      watch.disconnect();
      resolve(read());
    });
    watch.observe(block, { attributes: true, attributeFilter: ['data-view-label', 'data-block-status'] });
  });
}

/**
 * moves the page to another Cover section: through the page's section snap where it runs (it
 * moves to a same-page anchor link's section, with its glide and the Wave In cut), else by
 * scrolling there
 */
function goToSection(block, target) {
  const root = document.documentElement;
  if (root.classList.contains('snap-active') && target.id) {
    const link = el('a', '', { href: `#${target.id}`, tabindex: '-1', 'aria-hidden': 'true' });
    link.hidden = true;
    block.append(link);
    link.click();
    link.remove();
    return;
  }
  target.scrollIntoView({ behavior: window.matchMedia(CALM).matches ? 'auto' : 'smooth' });
}

/**
 * the Exterior / Interior switch: one button per Cover section in the run (named by its View
 * name), this section's pressed; choosing another goes to its section
 */
async function buildSwitch(block, section) {
  const run = coverRun(section);
  if (run.length < 2) return null;
  const labels = await Promise.all(run.map((s) => viewLabel(coverOf(s))));
  const own = run.indexOf(section);
  const group = el('div', 'cover-switch', { role: 'group', 'aria-label': 'View' });
  const thumb = el('i', 'cover-switch-thumb', { 'aria-hidden': 'true' });
  group.append(thumb);
  const show = (index) => {
    group.style.setProperty('--cover-switch-index', index);
    [...group.querySelectorAll('button')].forEach((btn, i) => {
      btn.setAttribute('aria-pressed', i === index ? 'true' : 'false');
    });
  };
  run.forEach((target, i) => {
    const btn = el('button', '', { type: 'button' });
    const text = el('span');
    text.textContent = labels[i] || `View ${i + 1}`;
    btn.append(text);
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-pressed') === 'true') return;
      // the thumb slides across as the page moves on
      show(i);
      goToSection(block, target);
    });
    group.append(btn);
  });
  group.style.setProperty('--cover-switch-count', run.length);
  show(own);
  // back on this section (or away from it), the switch shows this section's view again
  if (window.IntersectionObserver) {
    // (off screen: a section just above or below the screen still counts as intersecting)
    new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.05) return;
      // at once (it is off screen)
      group.style.setProperty('--cover-switch-time', '0s');
      show(own);
      group.getBoundingClientRect();
      group.style.removeProperty('--cover-switch-time');
    }, { threshold: 0.05 }).observe(section);
  }
  return group;
}

/* ---- View Tabs: the Cover sections after the first share its screen ---- */

// per merged section: its views, the one on show, and who to tell on a change
const views = new WeakMap();

/**
 * View Tabs: folds the Cover sections right after this one (each holding only its showcase)
 * into it as stacked layers, so scrolling goes on past all the views. Sections holding anything
 * else stay as they are.
 * @param {Element} section the first view's section
 */
function absorbViews(section) {
  if (views.has(section) || section.children.length !== 1) return;
  const layers = [section.firstElementChild];
  if (!layers[0].matches('.interactive-showcase-wrapper')) return;
  const taken = [];
  for (let s = section.nextElementSibling; coverOf(s) && s.children.length === 1;
    s = section.nextElementSibling) {
    const layer = s.firstElementChild;
    if (!layer.matches('.interactive-showcase-wrapper')) break;
    section.append(layer);
    if (s.id) layer.id = s.id;
    s.remove();
    layers.push(layer);
    taken.push(layer);
  }
  if (layers.length < 2) return;
  section.classList.add('has-view-tabs');
  const state = { layers, index: 0, onChange: new Set() };
  const apply = () => layers.forEach((layer, i) => {
    layer.classList.toggle('is-view-active', i === state.index);
    layer.inert = i !== state.index;
  });
  apply();
  // each view's id (the first is its section's)
  const idOf = (i) => (i ? layers[i].id : section.id);
  state.activate = (index, { hash = true } = {}) => {
    if (index === state.index || !layers[index]) return;
    const from = state.index;
    state.index = index;
    apply();
    layers[from].querySelector('.interactive-showcase')?.dispatchEvent(new CustomEvent('cover:leave'));
    state.onChange.forEach((fn) => fn(index, from));
    if (hash && idOf(index)) window.history.replaceState(null, '', `#${idOf(index)}`);
  };
  // a link to a view's id (#interior) picks it
  state.fromAddress = () => {
    const i = layers.findIndex((_, n) => idOf(n) && idOf(n) === window.location.hash.slice(1));
    if (i > -1) state.activate(i, { hash: false });
  };
  window.addEventListener('hashchange', state.fromAddress);
  views.set(section, state);
  // their sections are gone, so decorate the other views here
  taken.forEach((layer) => {
    const other = layer.querySelector('.interactive-showcase');
    if (other) loadBlock(other);
  });
}

/** the tabs of a merged section: one per view, this block's selected; each view has its own copy */
async function buildTabs(block, section) {
  const state = views.get(section);
  const { layers } = state;
  const own = layers.indexOf(block.closest('.interactive-showcase-wrapper'));
  const labels = await Promise.all(layers.map((layer) => viewLabel(layer.querySelector('.interactive-showcase'))));
  if (!state.named) {
    state.named = true;
    layers.forEach((layer, i) => {
      if (i && !layer.id && labels[i] && !document.getElementById(slug(labels[i]))) {
        layer.id = slug(labels[i]);
      }
    });
    state.fromAddress();
  }
  const group = el('div', 'cover-switch', { role: 'tablist', 'aria-label': 'View' });
  group.append(el('i', 'cover-switch-thumb', { 'aria-hidden': 'true' }));
  const tabs = layers.map((layer, i) => {
    const tab = el('button', '', { type: 'button', role: 'tab' });
    const text = el('span');
    text.textContent = labels[i] || `View ${i + 1}`;
    tab.append(text);
    tab.addEventListener('click', () => state.activate(i));
    tab.addEventListener('keydown', (e) => {
      const to = {
        ArrowRight: (i + 1) % layers.length,
        ArrowLeft: (i + layers.length - 1) % layers.length,
        Home: 0,
        End: layers.length - 1,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      state.activate(to);
      layers[to].querySelector('.cover-switch [aria-selected="true"]')?.focus();
    });
    group.append(tab);
    return tab;
  });
  const show = (index) => {
    group.style.setProperty('--cover-switch-index', index);
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
      tab.tabIndex = i === index ? 0 : -1;
    });
  };
  group.style.setProperty('--cover-switch-count', layers.length);
  show(own);
  // leaving this view: the thumb slides over, then goes back
  let reset = 0;
  state.onChange.add((to, from) => {
    if (from !== own) return;
    show(to);
    clearTimeout(reset);
    reset = setTimeout(() => {
      group.style.setProperty('--cover-switch-time', '0s');
      show(own);
      group.getBoundingClientRect();
      group.style.removeProperty('--cover-switch-time');
    }, VIEW_FADE_MS + 50);
  });
  return group;
}

/**
 * @param {Element} block the decorated block
 * @param {object} parts
 * @param {Element} [parts.labelRow] the View name row
 * @param {Element} [parts.buttonRow] the button row
 * @param {object[]} parts.items the base block's items ({ row, tab, figure, spots })
 * @param {Element} parts.tooltip the base block's tooltip, used as the detail panel
 * @param {boolean} parts.editing in Universal Editor
 */
export default function decorateCover(block, {
  labelRow, buttonRow, items, tooltip, editing,
}) {
  const section = block.closest('.section');
  const label = labelRow?.textContent.trim() || '';
  if (section && !editing && block.classList.contains('view-tabs')) absorbViews(section);
  // the section is named after its view (#exterior, #interior), so the switch and links can go
  // there; set before the View name, which tells the switch next door this block is ready
  if (section && !section.id && label && !document.getElementById(slug(label))) {
    section.id = slug(label);
  }
  if (label) block.dataset.viewLabel = label;

  // the image layers: clipped, positioned and never scrolling themselves, so the section snap
  // must not take them for an overlay that keeps the wheel (it would stop the page here)
  block.dataset.snapPassthrough = '';
  const stage = block.querySelector('.stage');
  const copy = block.querySelector('.copy');
  const rail = block.querySelector('.thumbs');
  // full-bleed media to the Wave In cut, not content (wave-cut.js)
  stage.classList.add('backdrop');
  rail?.setAttribute('aria-label', label ? `${label} colours` : 'Colours');

  // phones: a blurred copy of each image fills the screen around it, as in the prototype
  items.forEach(({ row, figure }) => {
    const img = figure.querySelector('img');
    if (!img) return;
    const fill = el('div', 'fill', { 'aria-hidden': 'true' });
    const copyImg = el('img', '', { src: img.currentSrc || img.src, alt: '', loading: 'lazy' });
    fill.append(copyImg);
    row.prepend(fill);
  });
  stage.append(
    el('i', 'cover-tint', { 'aria-hidden': 'true' }),
    el('i', 'cover-scrim', { 'aria-hidden': 'true' }),
    el('i', 'cover-scrim cover-scrim-right', { 'aria-hidden': 'true' }),
  );

  const link = buttonRow?.querySelector('a');
  let cta = null;
  block.classList.toggle('no-cta', !link);
  if (link) {
    link.className = 'cover-button';
    cta = el('div', 'cover-cta');
    cta.append(link);
    block.append(cta);
  }

  let current = Math.max(0, items.findIndex(({ tab }) => tab.getAttribute('aria-selected') === 'true'));

  /* ---- swatches: crossfade, hover preview and name label ---- */
  const swatchLabel = el('span', 'swatch-label', { 'aria-hidden': 'true' });
  block.append(swatchLabel);
  const hideLabel = () => swatchLabel.classList.remove('is-shown');
  const showLabel = (tab) => {
    swatchLabel.textContent = tab.getAttribute('aria-label') || '';
    const box = block.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const r = rail.getBoundingClientRect();
    const wide = window.matchMedia(WIDE).matches;
    const top = wide
      ? t.top - box.top + t.height / 2 - swatchLabel.offsetHeight / 2
      : t.top - box.top - swatchLabel.offsetHeight - 10;
    const left = wide
      ? r.right - box.left + 10
      : t.left - box.left + t.width / 2 - swatchLabel.offsetWidth / 2;
    // placed at once when hidden, glides from swatch to swatch when shown
    if (!swatchLabel.classList.contains('is-shown')) {
      swatchLabel.classList.add('is-placing');
      swatchLabel.style.top = `${top}px`;
      swatchLabel.style.left = `${left}px`;
      swatchLabel.getBoundingClientRect();
      swatchLabel.classList.remove('is-placing');
    } else {
      swatchLabel.style.top = `${top}px`;
      swatchLabel.style.left = `${left}px`;
    }
    swatchLabel.classList.add('is-shown');
  };
  const preview = (index) => {
    items.forEach(({ row }, i) => row.classList.toggle('is-preview', i === index && i !== current));
  };
  items.forEach(({ tab }, i) => {
    tab.addEventListener('pointerenter', (e) => {
      showLabel(tab);
      if (e.pointerType === 'mouse') preview(i);
    });
    tab.addEventListener('focus', () => showLabel(tab));
  });
  rail?.addEventListener('pointerleave', () => {
    preview(-1);
    if (!rail.contains(document.activeElement)) hideLabel();
  });
  rail?.addEventListener('focusout', (e) => {
    if (!rail.contains(e.relatedTarget)) hideLabel();
  });

  /* ---- the detail panel (the base tooltip) and the zoom ---- */
  const tipTitle = tooltip.querySelector('.tooltip-title');
  const tipText = tooltip.querySelector('.tooltip-text');
  const tipClose = tooltip.querySelector('.tooltip-close');
  const body = el('div', 'tooltip-body');
  body.append(tipTitle, tipText);
  tipClose.innerHTML = CLOSE;
  // the point's photo above its text (decorative: the title follows it)
  const media = el('div', 'tooltip-media');
  const mediaImg = el('img', 'tooltip-media-img', { alt: '', decoding: 'async' });
  media.append(mediaImg);
  const next = el('button', 'tooltip-next', { type: 'button' });
  const nextThumb = el('img', 'tooltip-next-thumb', { alt: '', decoding: 'async' });
  const nextLabel = el('span', 'tooltip-next-label');
  next.append(nextThumb, el('span', 'visually-hidden'), nextLabel);
  nextThumb.nextSibling.textContent = 'Next: ';
  next.insertAdjacentHTML('beforeend', ARROW);
  tooltip.prepend(tipClose);
  tooltip.append(media, body, next);
  tooltip.tabIndex = -1;
  tooltip.hidden = true;
  // the open panel keeps the wheel and swipes instead of the section snap
  tooltip.dataset.snapHold = '';
  block.append(tooltip);

  // what the open panel hides: inert as well as faded, so focus and screen readers skip it
  const chrome = () => [copy, stage, cta, block.querySelector('.cover-switch'),
    block.querySelector('.cover-zoom')].filter(Boolean);
  let open = null; // { item, n }
  let closeTimer = 0;
  let swapTimer = 0;

  /* ---- phones: the zoom slider (1 = no zoom) ---- */
  let sliderZoom = 1;
  // zoom around the middle of the + points, else of the image
  const zoomCentre = () => {
    const { figure, spots } = items[current];
    const fx = figure.offsetLeft;
    const fy = figure.offsetTop;
    if (!spots.length) return { x: fx + figure.offsetWidth / 2, y: fy + figure.offsetHeight / 2 };
    const xs = spots.map(({ btn }) => fx + btn.offsetLeft);
    const ys = spots.map(({ btn }) => fy + btn.offsetTop);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  };
  const sliderZoomIn = () => {
    if (sliderZoom <= 1 || !items[current] || window.matchMedia(WIDE).matches) {
      stage.style.removeProperty('--cover-zoom');
      stage.style.removeProperty('--cover-scale');
      return;
    }
    const { x, y } = zoomCentre();
    const z = sliderZoom;
    stage.style.setProperty('--cover-zoom', `translate(${(x * (1 - z)).toFixed(1)}px, ${(y * (1 - z)).toFixed(1)}px) scale(${z.toFixed(3)})`);
    // the CSS keeps the + chips at their size
    stage.style.setProperty('--cover-scale', z.toFixed(3));
  };

  const zoomTo = (btn) => {
    const calm = window.matchMedia(CALM).matches;
    if (!btn || calm || editing || !window.matchMedia(WIDE).matches) {
      // phones: the slider's zoom; desktop: none
      sliderZoomIn();
      return;
    }
    stage.style.removeProperty('--cover-scale');
    const { figure } = items[current];
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // from offsets, so the zoom already applied is left out
    const fx = figure.offsetLeft;
    const fy = figure.offsetTop;
    const px = fx + btn.offsetLeft;
    const py = fy + btn.offsetTop;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    // the point brought to ZOOM_AT, the image still covering the whole screen
    const x = clamp(w * ZOOM_AT.x - ZOOM * px, w - ZOOM * (fx + figure.offsetWidth), -ZOOM * fx);
    const y = clamp(h * ZOOM_AT.y - ZOOM * py, h - ZOOM * (fy + figure.offsetHeight), -ZOOM * fy);
    stage.style.setProperty('--cover-zoom', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${ZOOM})`);
  };

  // a point's photo: its own, else the same point's on another colour (the points are the same
  // for every colour, so authors may link the photos on one colour only)
  const imageOf = (item, n) => items[item].spots[n]?.spot.image
    || items.map(({ spots }) => spots[n]?.spot.image).find(Boolean) || '';
  const setImage = (img, src) => {
    if (src && img.getAttribute('src') !== src) img.src = src;
    img.hidden = !src;
  };

  const fill = (item, n) => {
    const { spots } = items[item];
    const { spot } = spots[n];
    setTitle(tipTitle, spot.title);
    tipText.textContent = spot.text;
    tipText.hidden = !spot.text;
    const image = imageOf(item, n);
    setImage(mediaImg, image);
    media.hidden = !image;
    tooltip.classList.toggle('has-media', Boolean(image));
    next.hidden = spots.length < 2;
    const after = (n + 1) % spots.length;
    setTitle(nextLabel, spots[after]?.spot.title || '');
    setImage(nextThumb, imageOf(item, after));
  };

  const openDetail = (item, n) => {
    const { btn } = items[item].spots[n];
    items[item].spots.forEach((s) => s.btn.setAttribute('aria-expanded', String(s.btn === btn)));
    clearTimeout(closeTimer);
    hideLabel();
    if (open) {
      // on to another point: the text fades out, swaps and fades back in
      open = { item, n };
      tooltip.classList.add('is-swapping');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => {
        fill(item, n);
        tooltip.classList.remove('is-swapping');
      }, window.matchMedia(CALM).matches ? 0 : SWAP_MS);
    } else {
      open = { item, n };
      fill(item, n);
      tooltip.hidden = false;
      tooltip.getBoundingClientRect();
      block.classList.add('is-detail-open');
      chrome().forEach((node) => { node.inert = true; });
      tooltip.focus({ preventScroll: true });
    }
    zoomTo(btn);
  };

  const closeDetail = ({ refocus = false } = {}) => {
    if (!open) return;
    const { btn } = items[open.item].spots[open.n];
    open = null;
    btn.setAttribute('aria-expanded', 'false');
    block.classList.remove('is-detail-open');
    chrome().forEach((node) => { node.inert = false; });
    zoomTo(null);
    if (refocus) btn.focus({ preventScroll: true });
    closeTimer = setTimeout(() => {
      if (!open) tooltip.hidden = true;
    }, window.matchMedia(CALM).matches ? 0 : CLOSE_MS);
  };

  items.forEach(({ spots }, item) => {
    spots.forEach(({ btn }, n) => {
      btn.style.setProperty('--cover-spot-index', n);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(item, n);
      });
    });
  });
  next.addEventListener('click', () => {
    if (!open) return;
    const { item, n } = open;
    openDetail(item, (n + 1) % items[item].spots.length);
  });
  tipClose.addEventListener('click', () => closeDetail({ refocus: true }));
  block.addEventListener('click', (e) => {
    if (open && !tooltip.contains(e.target) && !e.target.closest('.hotspot')) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) closeDetail({ refocus: true });
  });
  window.addEventListener('resize', () => {
    if (!open) return;
    // the titles are cut on phones only (turning a tablet, say)
    fill(open.item, open.n);
    zoomTo(items[open.item].spots[open.n].btn);
  });

  /* ---- a colour picked: crossfade (the base block has switched the panels) ---- */
  const fading = new Map();
  block.addEventListener('interactive-showcase:select', ({ detail: { from, to } }) => {
    current = to;
    closeDetail();
    // phones: keep the slider's zoom
    sliderZoomIn();
    preview(-1);
    if (from === to || !items[from]) return;
    const { row } = items[from];
    if (window.matchMedia(CALM).matches) return;
    row.classList.add('is-prev');
    clearTimeout(fading.get(row));
    fading.set(row, setTimeout(() => row.classList.remove('is-prev'), FADE_MS));
  });

  /* ---- phones: the zoom slider (hidden from 600px) ---- */
  if (!editing) {
    const slider = el('div', 'cover-zoom', {
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Zoom',
      'aria-orientation': 'vertical',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
    });
    // keeps its drags and wheel instead of the section snap
    slider.dataset.snapHold = '';
    const track = el('span', 'cover-zoom-track', { 'aria-hidden': 'true' });
    track.append(el('span', 'cover-zoom-fill'), el('span', 'cover-zoom-knob'));
    slider.append(track);
    block.append(slider);

    let scrubTimer = 0;
    const setValue = (value) => {
      const v = Math.min(1, Math.max(0, value));
      sliderZoom = 1 + v * (SLIDER_ZOOM - 1);
      slider.style.setProperty('--cover-zoom-value', v.toFixed(4));
      slider.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      slider.setAttribute('aria-valuetext', v ? `${sliderZoom.toFixed(1)} times` : 'Not zoomed');
      // no easing while dragging
      block.classList.add('is-zooming');
      clearTimeout(scrubTimer);
      scrubTimer = setTimeout(() => block.classList.remove('is-zooming'), SCRUB_MS);
      sliderZoomIn();
    };
    const valueOf = () => Number(slider.style.getPropertyValue('--cover-zoom-value')) || 0;
    const valueAt = (clientY) => {
      const r = track.getBoundingClientRect();
      return r.height ? (clientY - r.top) / r.height : 0;
    };
    setValue(0);

    slider.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      slider.setPointerCapture(e.pointerId);
      setValue(valueAt(e.clientY));
    });
    slider.addEventListener('pointermove', (e) => {
      if (slider.hasPointerCapture(e.pointerId)) setValue(valueAt(e.clientY));
    });
    slider.addEventListener('keydown', (e) => {
      const v = valueOf();
      const to = {
        ArrowDown: v + SLIDER_STEP,
        ArrowRight: v + SLIDER_STEP,
        ArrowUp: v - SLIDER_STEP,
        ArrowLeft: v - SLIDER_STEP,
        PageDown: v + SLIDER_PAGE,
        PageUp: v - SLIDER_PAGE,
        Home: 0,
        End: 1,
      }[e.key];
      if (to === undefined) return;
      // these keys belong to the slider, not the section snap
      e.preventDefault();
      e.stopPropagation();
      setValue(to);
    });
    // a wider screen has no slider
    window.matchMedia(WIDE).addEventListener('change', (e) => {
      if (e.matches) setValue(0);
    });
    window.addEventListener('resize', () => {
      if (!open) sliderZoomIn();
    });
  }

  /* ---- the + points come in as the section arrives; the panel closes as it leaves ---- */
  if (window.IntersectionObserver && !editing && !window.matchMedia(CALM).matches) {
    new IntersectionObserver(([entry]) => {
      const inView = entry.intersectionRatio >= 0.6;
      block.classList.toggle('is-in', inView);
      if (!entry.isIntersecting || !inView) {
        closeDetail();
        hideLabel();
      }
    }, { threshold: [0, 0.6] }).observe(block);
  } else {
    block.classList.add('is-in');
  }

  // the Exterior / Interior switch, once the Cover sections next door are decorated (not
  // waited for: the page decorates its sections one after another, so the next one waits on
  // this one)
  block.addEventListener('cover:leave', () => {
    closeDetail();
    hideLabel();
  });
  if (section) {
    (views.has(section) ? buildTabs(block, section) : buildSwitch(block, section)).then((group) => {
      if (!group) return;
      block.append(group);
      if (open) group.inert = true;
    });
  }
}
