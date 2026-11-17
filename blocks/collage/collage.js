import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Collage: up to five images around a tall centre tile, then a heading and its text.
 * Rows (each property in its own cell, read by position):
 *   1. heading   2. description
 *   then one row per image (Collage Image): image (+ alt) | caption. The first image is the centre
 *   tile, the next four the top left, bottom left, top right and bottom right tiles (further
 *   images are left out; in the editor they stay, dimmed, for the authors to remove).
 * On the site the collage plays in, tied to the scroll while its stage is pinned for one screen
 * (as the design's walkthrough, drafts/jsw/interactive-showcase/animation.mp4): the centre tile
 * starts as a full-screen light card (as the interactive showcase's before it) and shrinks into
 * its slot, darkening to black, its image settling to the slot's middle; the side tiles slide in
 * from the screen's edges; the collage then tightens to its size. The stage then scrolls away
 * and the heading and text come up into the screen. A tile opens large in an overlay (its
 * caption under it), growing out of the tile; Escape, the close button or a click beside it
 * closes it back into the tile. In the editor, or with reduced motion, the collage is in place.
 * Images: JPG, PNG, WebP or AVIF (another file is not shown; a warning is logged). An image
 * without alt text is described by its caption or its file name.
 */

const MAX_IMAGES = 5;
const SLOTS = ['centre', 'top-left', 'bottom-left', 'top-right', 'bottom-right'];
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const MAX = {
  heading: 60, description: 280, caption: 40, alt: 125,
};
// the play-in's parts, in its progress (0 → 1): the centre card shrinks into its slot, the side
// tiles slide in, the collage tightens from TIGHTEN_FROM times its size to its size
const SHRINK = [0, 0.75];
const SLIDE = [0.15, 0.75];
const TIGHTEN = [0.6, 1];
const TIGHTEN_FROM = 1.15;
// the full-screen card the centre tile starts as: inset and corner radius (rem), as the
// interactive showcase's card; its image's height and width at most (shares of the screen's)
// and its middle (share of the screen's width, height)
const CARD_INSET = 0.5;
const CARD_RADIUS = 1.5;
const CARD_IMAGE = {
  height: 0.8, width: { landscape: 0.6, portrait: 0.9 }, x: 0.68, y: 0.52,
};

const text = (cell) => (cell?.textContent || '').trim();
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const part = (p, [from, to]) => clamp((p - from) / (to - from), 0, 1);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

// a text within its limit: a longer one cut with "…" on the site (with a warning); the editor
// keeps it whole (edited in place: a cut text would be saved cut)
function fit(value, limit, field, authoring) {
  if (!value || value.length <= limit) return value;
  // eslint-disable-next-line no-console
  console.warn(`collage: the ${field} has ${value.length} characters, more than its ${limit}${authoring ? '' : ': cut with "…"'}`);
  return authoring ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

// authoring: an editable field of the node's resource (the block's, or the image's)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

/*
 * The image of a cell: an <img>, or a link (AEM delivers an image it can't resolve, an asset not
 * in AEM Assets, as a plain link: a placeholder under a /drafts/ folder then comes from this
 * repository, on the code host). Only in a web format (IMAGE_FORMATS).
 */
function cellImage(cell) {
  const img = cell?.querySelector('img');
  const link = img ? null : cell?.querySelector('a[href]');
  if (!img && !link) return null;
  const { pathname } = new URL(img ? img.src : link.href, window.location);
  const extension = pathname.includes('.') ? pathname.split('.').pop().toLowerCase() : '';
  if (extension && !IMAGE_FORMATS.includes(extension)) {
    // eslint-disable-next-line no-console
    console.warn(`collage: the image "${pathname}" is not shown: .${extension} isn't a web image format (${IMAGE_FORMATS.map((x) => `.${x}`).join(', ')})`);
    return null;
  }
  if (img) return { src: img.src, alt: img.getAttribute('alt') || '', source: img };
  const drafts = pathname.indexOf('/drafts/');
  const label = text(link);
  return {
    src: drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts)}` : link.href,
    alt: label && !label.includes('/') ? label : '',
    source: link,
  };
}

// an image's description without authored alt text: its caption, or its file name made words
function fallbackAlt(caption, src, n) {
  if (caption) return caption;
  let name = '';
  try {
    name = decodeURIComponent(new URL(src, window.location).pathname.split('/').pop())
      .replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  } catch (e) { /* not an address */ }
  if (!name || /^media [0-9a-f]+$/i.test(name)) return `Collage image ${n}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function picture(src, alt, eager) {
  const pic = createOptimizedPicture(src, alt, eager, [{ media: '(min-width: 900px)', width: '1200' }, { width: '750' }]);
  pic.querySelector('img').className = 'image';
  return pic;
}

/*
 * The expanded view: the tile's image large in an overlay (a dialog), its caption under it. It
 * grows out of the tile and shrinks back into it (its box measured at each end, the difference
 * played as a transform the CSS eases out); the page behind doesn't scroll meanwhile.
 */
function expandedView(block) {
  const close = el('button', { type: 'button', class: 'close', 'aria-label': 'Close' });
  const view = el('figure', {
    class: 'expanded-view', role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
  });
  const overlay = el('div', { class: 'overlay', hidden: true }, view);
  block.append(overlay);
  let opener = null;
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the view's transform that puts it on the tile (its box over the tile's)
  const onTile = (tile) => {
    const from = tile.getBoundingClientRect();
    const to = view.getBoundingClientRect();
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  };
  const hide = () => {
    overlay.hidden = true;
    overlay.classList.remove('is-closing');
    view.style.transform = '';
  };
  const shut = () => {
    if (overlay.hidden || overlay.classList.contains('is-closing')) return;
    overlay.classList.remove('is-open');
    if (reduce()) hide();
    else {
      overlay.classList.add('is-closing');
      view.style.transform = onTile(opener);
      view.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 700); // (in case no transition runs)
    }
    opener?.focus({ preventScroll: true });
  };
  close.addEventListener('click', shut);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) shut(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') shut();
    // (the close button the dialog's one control: focus stays on it)
    if (e.key === 'Tab') {
      e.preventDefault();
      close.focus();
    }
  });
  return (tile, { src, alt, caption }) => {
    opener = tile;
    hide();
    view.replaceChildren(picture(src, alt, true), caption ? el('figcaption', { class: 'caption' }, caption) : '', close);
    view.setAttribute('aria-label', caption || alt);
    overlay.hidden = false;
    if (!reduce()) {
      view.style.transition = 'none';
      view.style.transform = onTile(tile);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        view.style.transition = '';
        view.style.transform = '';
        overlay.classList.add('is-open');
      }));
    } else overlay.classList.add('is-open');
    close.focus({ preventScroll: true });
  };
}

/*
 * The play-in, tied to the scroll (its progress p: how far the pinned stage's screen of scroll
 * has gone): the hero (the centre tile's image on a full-screen card, above the collage) is
 * clipped from the card to the centre slot, its colour mixing to black and its image moving and
 * shrinking from the card's right into the slot; the side tiles slide in from their screen
 * edge; the gallery tightens. The layout is measured when the stage's size changes; the scroll
 * is read and painted at most once a frame. Once landed, the centre tile itself shows.
 */
function playIn(block, track, stage, gallery, tiles) {
  const centre = tiles.find((t) => t.dataset.slot === 'centre');
  if (!centre) return;
  const heroImage = picture(centre.querySelector('.image').currentSrc || centre.querySelector('.image').src, '', true);
  heroImage.querySelector('img').setAttribute('alt', '');
  const hero = el('div', { class: 'hero', 'aria-hidden': 'true' }, heroImage);
  stage.append(hero);
  const heroImg = hero.querySelector('img');
  block.classList.add('is-animated');

  let geo = null;
  const measure = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const box = (n) => ({
      left: gallery.offsetLeft + n.offsetLeft,
      top: gallery.offsetTop + n.offsetTop,
      width: n.offsetWidth,
      height: n.offsetHeight,
    });
    geo = {
      w: stage.clientWidth,
      h: stage.clientHeight,
      run: track.offsetHeight - stage.clientHeight,
      rem,
      radius: parseFloat(getComputedStyle(centre).borderTopLeftRadius) || 0,
      slot: box(centre),
      sides: tiles.filter((t) => t !== centre).map((t) => ({ tile: t, ...box(t) })),
    };
    // the hero's image box: the slot's (at the collage's size), moved and scaled each frame
    Object.assign(heroImg.style, {
      left: `${geo.slot.left}px`, top: `${geo.slot.top}px`, width: `${geo.slot.width}px`, height: `${geo.slot.height}px`,
    });
    // the stops for the eased wheel scroller: the play-in's start and end, then the text
    block.dataset.scrollStops = [0, geo.run, geo.run + geo.h].map(Math.round).join(' ');
  };

  let frame = 0;
  const paint = () => {
    frame = 0;
    if (!geo || !geo.run) return;
    const p = clamp(-track.getBoundingClientRect().top / geo.run, 0, 1);
    const s = mix(TIGHTEN_FROM, 1, ease(part(p, TIGHTEN)));
    const e = ease(part(p, SHRINK));
    const slide = ease(part(p, SLIDE));
    const cx = geo.w / 2;
    const cy = geo.h / 2;
    gallery.style.transform = `scale(${s})`;
    // the side tiles: from beyond their screen edge (left ones from the left, right ones from the
    // right) to their place (in the gallery's own, scaled, pixels)
    geo.sides.forEach(({
      tile, left, width,
    }) => {
      // (its screen edge, at the gallery's present size: past it, the tile is off the screen)
      const away = tile.dataset.slot.endsWith('left')
        ? -(cx + (left + width - cx) * s + geo.rem)
        : geo.w - (cx + (left - cx) * s) + geo.rem;
      tile.style.transform = `translateX(${((1 - slide) * away) / s}px)`;
    });
    // the centre slot at the gallery's present size, and the card shrinking into it
    const slot = {
      left: cx + (geo.slot.left - cx) * s,
      top: cy + (geo.slot.top - cy) * s,
      width: geo.slot.width * s,
      height: geo.slot.height * s,
    };
    const inset = CARD_INSET * geo.rem;
    const top = mix(inset, slot.top, e);
    const left = mix(inset, slot.left, e);
    const right = mix(inset, geo.w - slot.left - slot.width, e);
    const bottom = mix(inset, geo.h - slot.top - slot.height, e);
    const radius = mix(CARD_RADIUS * geo.rem, geo.radius * s, e);
    hero.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
    hero.style.setProperty('--mix', `${(e * 100).toFixed(1)}%`);
    // its image: from the card's right (CARD_IMAGE; a portrait screen's middle, the image no wider
    // than CARD_IMAGE.width of it) to the slot's middle
    const portrait = geo.h > geo.w;
    const widest = portrait ? CARD_IMAGE.width.portrait : CARD_IMAGE.width.landscape;
    const start = Math.min(
      (CARD_IMAGE.height * geo.h) / geo.slot.height,
      (widest * geo.w) / geo.slot.width,
    );
    const k = mix(start, s, e);
    const middle = { x: geo.slot.left + geo.slot.width / 2, y: geo.slot.top + geo.slot.height / 2 };
    const from = (portrait ? 0.5 : CARD_IMAGE.x) * geo.w;
    const x = mix(from, slot.left + slot.width / 2, e) - middle.x;
    const y = mix(CARD_IMAGE.y * geo.h, slot.top + slot.height / 2, e) - middle.y;
    heroImg.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    block.classList.toggle('is-landed', p >= 0.999);
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  new ResizeObserver(() => {
    if (!stage.clientHeight) return;
    measure();
    paint();
  }).observe(stage);
  import('../../scripts/scroll-stops.js').then(({ default: init }) => init());
}

export default function decorate(block) {
  const authoring = isAuthoring();
  const [headingRow, descriptionRow, ...itemRows] = [...block.children];
  const shown = itemRows.slice(0, MAX_IMAGES);
  const extra = itemRows.slice(MAX_IMAGES);

  // the tiles: one per image, in the slots' order (an image in another format left out)
  const tiles = [];
  const images = new Map();
  shown.forEach((row) => {
    const [imageCell, captionCell] = row.children;
    const image = cellImage(imageCell);
    if (!image && !authoring) return;
    const slot = SLOTS[tiles.length];
    const caption = fit(text(captionCell), MAX.caption, 'caption', authoring);
    const tile = el(authoring ? 'div' : 'button', {
      class: 'gallery-item', 'data-slot': slot, type: authoring ? undefined : 'button',
    });
    moveInstrumentation(row, tile);
    if (image) {
      const alt = fit(image.alt, MAX.alt, 'alt text', authoring) || fallbackAlt(caption, image.src, tiles.length + 1);
      const pic = picture(image.src, alt, slot === 'centre');
      moveInstrumentation(image.source, pic.querySelector('img'));
      if (authoring) editable(pic.querySelector('img'), 'image', 'media', 'Image');
      tile.append(pic);
      tile.setAttribute('aria-label', `${caption || alt}: open larger`);
      images.set(tile, { src: image.src, alt, caption });
    } else {
      tile.append(el('p', { class: 'note' }, 'This file is not shown: use a JPG, PNG, WebP or AVIF image.'));
    }
    if (authoring) {
      const label = el('span', { class: 'caption' }, caption);
      editable(label, 'caption', 'text', 'Caption');
      tile.append(label);
    }
    tiles.push(tile);
  });
  const gallery = el('div', { class: 'gallery', 'data-count': tiles.length }, ...tiles);
  if (authoring && extra.length) {
    extra.forEach((row) => {
      const spare = el('div', { class: 'extra' }, `Not shown: only the first ${MAX_IMAGES} images are used`);
      moveInstrumentation(row, spare);
      gallery.append(spare);
    });
  }

  // the text below the collage
  const heading = fit(text(headingRow), MAX.heading, 'heading', authoring);
  const description = fit(text(descriptionRow), MAX.description, 'description', authoring);
  const copy = el('div', { class: 'copy' });
  if (heading || authoring) {
    const h = el('h2', { class: 'heading' }, heading);
    if (authoring) editable(h, 'heading', 'text', 'Heading');
    copy.append(h);
  }
  if (description || authoring) {
    const p = el('p', { class: 'description' }, description);
    if (authoring) editable(p, 'description', 'text', 'Description');
    copy.append(p);
  }

  const stage = el('div', { class: 'stage' }, gallery);
  const track = el('div', { class: 'track' }, stage);
  block.replaceChildren(track, copy);
  if (authoring) {
    block.classList.add('is-static');
    return;
  }

  const open = expandedView(block);
  tiles.forEach((tile) => {
    if (images.has(tile)) tile.addEventListener('click', () => open(tile, images.get(tile)));
  });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) block.classList.add('is-static');
  else playIn(block, track, stage, gallery, tiles);
}
