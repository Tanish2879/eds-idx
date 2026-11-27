/*
 * interactive-showcase: white card, copy + thumbnail tray on the left, showcase image with
 * hotspots on the right.
 * Rows: a heading row, then one row per showcase item with
 *   media    — thumbnail picture, then showcase picture
 *   title    — the item's title
 *   description — the item's description
 *   hotspots — list items "x, y | TITLE | description" (position over the showcase image,
 *              from its bottom-left corner; at most MAX_HOTSPOTS, see parseHotspots)
 * Thumbnails are tabs: selecting one swaps the showcase image, counter and copy.
 * A hotspot opens a frosted tooltip; clicking outside or Escape closes it.
 * Entrance ("white curtain"): the previous section holds still while this white card slides
 * up over it; once the card fills the screen its content fades in.
 * The selected showcase image is marked data-zoom-source: a following parallax collage flies
 * it from here into its centre card on scroll.
 */

import { loadCSS } from '../../scripts/aem.js';
import snapRow from '../../scripts/utils/snap-row.js';

// at most this many + points per item: further bullets are ignored
const MAX_HOTSPOTS = 8;
// at most this many items (thumbnails, e.g. one per paint colour): further items are not shown
const MAX_ITEMS = 8;
// a module beside its + is the design's 272px wide where it fits; where it does not (a + in
// the middle of a phone's card) it narrows to the room there is, down to this
const MIN_TOOLTIP_WIDTH = 180;
// the most characters each text may have, so it fits its place in the card on every screen
// (_interactive-showcase.json limits the fields to the same); longer text, saved before the
// limits or in the hotspots' bullets, is shortened on the page
const MAX_CHARS = {
  title: 40,
  itemTitle: 40,
  description: 160,
  hotspotTitle: 40,
  hotspotText: 200,
};
let instance = 0;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

/**
 * an authored coordinate as a number from 0 to 100: "40" and "40%" both give 40 (the % is
 * added back where it is used); missing or not a number gives 0
 */
function normalizeCoordinate(value) {
  const n = parseFloat(String(value ?? '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/**
 * the + points, one bullet each: "x, y | TITLE | description". x and y are percentages of the
 * showcase image from its bottom-left corner, like the first quadrant of a graph (x to the
 * right, y upwards); the + button is centred on that point. A missing x or y is 0;
 * only the first MAX_HOTSPOTS bullets are used (none is fine). Returned y is from the top, as
 * the stylesheet places it.
 */
function parseHotspots(cell) {
  if (!cell) return [];
  return [...cell.querySelectorAll('li')].slice(0, MAX_HOTSPOTS).map((li) => {
    const parts = li.textContent.split('|').map((part) => part.trim());
    // the coordinates come first; a bullet without any "|" is either just them or just a title
    const coords = parts.length > 1 || /^[\d\s.,%]*$/.test(parts[0]) ? parts.shift() : '';
    const [x, y] = coords.split(',');
    const [title = '', ...text] = parts;
    return {
      x: normalizeCoordinate(x),
      y: 100 - normalizeCoordinate(y),
      title,
      text: text.join(' | '),
      // the point's photo: a link in its bullet (its title linked to the image); the Cover
      // style shows it in the detail panel
      image: li.querySelector('a[href]')?.getAttribute('href') || '',
    };
  });
}

/**
 * the text cut to at most `max` characters, at the last whole word, with an ellipsis; as it is
 * if it fits
 */
function clip(text, max) {
  const full = text.trim();
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${(atWord.length >= max / 2 ? atWord : cut).replace(/[\s.,;:–-]+$/, '')}…`;
}

/**
 * a field's element with its text cut to `max` characters (clip); its paragraph or heading
 * (a description may be a heading, e.g. a caption), where it has one, is kept. Returns the
 * text's length if it was cut, else 0
 */
function clipField(node, max) {
  const { length } = node.textContent.trim();
  if (length <= max) return 0;
  const holder = node.querySelector('p, h1, h2, h3, h4, h5, h6') || node;
  holder.textContent = clip(node.textContent, max);
  [...node.children].forEach((child) => {
    if (child !== holder && !child.contains(holder)) child.remove();
  });
  return length;
}

// the glide between the section before and the card (curtainGlide): the time and curve one
// panel glides to the next with on the JSW NEV page (1.8s, ease in and out)
const GLIDE_TIME = 1800;
const glideEase = (t) => (t < 0.5 ? 2 * t * t : 1 - ((2 - 2 * t) ** 2) / 2);

/**
 * between the section before and the card, one wheel gesture glides the whole way, as one panel
 * to the next on the JSW NEV page: down, the card rises over the held section into place; up,
 * the page goes back to the section before (its top, or for a tall one its last screen). Only
 * there: anywhere else the wheel scrolls as usual, and so do touch, keys and the scrollbar.
 * The rest of the gesture (a trackpad's inertia) is swallowed, so it is one glide per gesture
 */
function curtainGlide(section, prev) {
  const root = document.documentElement;
  let gliding = 0;
  let lastWheel = 0;
  let swallowing = false;
  const ends = () => {
    const card = Math.round(section.getBoundingClientRect().top + window.scrollY);
    const r = prev.getBoundingClientRect();
    const above = r.height > window.innerHeight * 1.25
      ? card - window.innerHeight
      : Math.round(r.top + window.scrollY);
    return { above: Math.max(0, above), card };
  };
  const glide = (to) => {
    const from = window.scrollY;
    const start = performance.now();
    let expected = from;
    const step = (now) => {
      // the page was moved some other way (scrollbar, keys, a link): that wins
      if (Math.abs(window.scrollY - expected) > 3) {
        gliding = 0;
        return;
      }
      const k = Math.min(1, (now - start) / GLIDE_TIME);
      expected = Math.round(from + (to - from) * glideEase(k));
      window.scrollTo({ top: expected, behavior: 'instant' });
      gliding = k < 1 ? requestAnimationFrame(step) : 0;
    };
    gliding = requestAnimationFrame(step);
  };
  window.addEventListener('wheel', (e) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (e.defaultPrevented || e.ctrlKey || !e.deltaY || sideways) return;
    // a page that glides its panels itself (as the JSW NEV page does) is left to it
    if (root.classList.contains('snap-active')) return;
    const now = performance.now();
    const burst = now - lastWheel < 150;
    lastWheel = now;
    if (gliding || (swallowing && burst)) {
      e.preventDefault();
      return;
    }
    swallowing = false;
    const y = window.scrollY;
    const { above, card } = ends();
    let to = null;
    // down: the card is coming (at most a screen and a quarter below the top of the screen);
    // up: the card is at the top, or on its way there
    if (e.deltaY > 0 && y < card - 2 && card - y <= window.innerHeight * 1.25) to = card;
    else if (e.deltaY < 0 && y > above + 2 && y <= card + 2) to = above;
    if (to === null) return;
    e.preventDefault();
    swallowing = true;
    glide(to);
  }, { passive: false });
}

/**
 * "white curtain" entrance: while this section slides up, the previous section's content is
 * moved down by the distance scrolled, so it stays put and the white card covers it (only the
 * content moves: section boxes, which the navigation theme and the wheel stops read, do not);
 * the card's content is veiled until the card has filled the screen, then fades in
 */
function curtain(section, block) {
  let prev = section.previousElementSibling;
  while (prev && !prev.classList.contains('section')) prev = prev.previousElementSibling;
  const held = prev?.firstElementChild;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (held) {
      const r = prev.getBoundingClientRect();
      const shift = Math.min(r.height, Math.max(0, -r.top));
      held.style.transform = shift ? `translate3d(0, ${shift.toFixed(1)}px, 0)` : '';
    }
    // not laid out yet (section still loading): decide once it is
    if (!section.offsetHeight) return;
    const { top } = section.getBoundingClientRect();
    // revealed once the card is in place; veiled again when it slides back down
    if (top <= 2) block.classList.add('revealed');
    else if (top > window.innerHeight * 0.5) block.classList.remove('revealed');
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  block.classList.add('curtain');
  if (prev) curtainGlide(section, prev);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(section);
  update();
}

/** the figure takes the image's own ratio so hotspot percentages stay on the artwork */
function trackRatio(figure, img) {
  const apply = () => {
    if (img.naturalWidth && img.naturalHeight) {
      figure.style.setProperty('--interactive-showcase-ratio', (img.naturalWidth / img.naturalHeight).toFixed(4));
    }
  };
  if (img.complete) apply();
  img.addEventListener('load', apply);
}

/**
 * the site's header where it stays over the page (fixed or sticky, as the boilerplate's
 * navigation bar is): how far down the screen it reaches, from its layout (so a header that
 * slides away on scroll still counts), and again whenever it changes; 0 where it scrolls away
 * with the page. An open menu (taller than a bar) is left out: the last bar's value is kept
 */
function watchHeader(onChange) {
  let last = -1;
  const measure = () => {
    const header = document.querySelector('header');
    const bar = header && [header, ...header.querySelectorAll('*')]
      .find((node) => ['fixed', 'sticky'].includes(getComputedStyle(node).position));
    let bottom = 0;
    if (bar) {
      const height = bar.offsetHeight;
      if (height > window.innerHeight * 0.4) return;
      const { position, top } = getComputedStyle(bar);
      bottom = position === 'sticky' ? (parseFloat(top) || 0) + height : bar.offsetTop + height;
    }
    bottom = Math.max(0, Math.round(bottom));
    if (bottom !== last) {
      last = bottom;
      onChange(bottom);
    }
  };
  measure();
  window.addEventListener('resize', measure);
  const header = document.querySelector('header');
  // the header block is decorated after this one may be
  if (header && window.MutationObserver) {
    new MutationObserver(measure).observe(header, {
      childList: true, subtree: true, attributes: true,
    });
  }
}

/**
 * a + whose point is near the edge of the part of the image the card shows (the image's own
 * edge, or the card's where the image runs off it) would be cut off there: it is drawn moved
 * in, just enough to be whole (4px clear of the edge), on every screen and as sizes change, and
 * out from under the site's header where it covers the card's top (header.cover, px from the
 * card's top). Its x, y stays as authored; its tooltip opens from where it is drawn. In the
 * editor hotspot-editor.js draws (and marks) such points itself. Returns its fitting, to run
 * again when the header changes.
 */
function keepSpotsInView(block, stage, items, header) {
  const AIR = 4;
  const between = (n, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, n)));
  // an element's place in the page from offsets (the slide's and entrance's transforms left out)
  const pageTop = (node) => {
    let top = 0;
    for (let n = node; n; n = n.offsetParent) top += n.offsetTop;
    return top;
  };
  const fit = () => {
    // the header's reach over the stage
    const covered = header.cover - (pageTop(stage) - pageTop(block));
    items.forEach(({ figure, spots }) => {
      const w = figure.offsetWidth;
      const h = figure.offsetHeight;
      if (!w || !h || !spots.length) return;
      // the figure's place in the stage, from offsets (the slide's transforms left out)
      let left = 0;
      let top = 0;
      for (let n = figure; n && n !== stage; n = n.offsetParent) {
        left += n.offsetLeft;
        top += n.offsetTop;
      }
      spots.forEach(({ btn, spot }) => {
        const half = btn.offsetWidth / 2 + AIR;
        // in % of the figure: `half` in from the stage's near edge to `half` in from its far one
        const pct = (px, size) => (px / size) * 100;
        const x = between(spot.x, pct(half - left, w), pct(stage.clientWidth - half - left, w));
        const lo = Math.max(half, covered + half);
        const y = between(spot.y, pct(lo - top, h), pct(stage.clientHeight - half - top, h));
        btn.style.setProperty('--interactive-showcase-x', `${x}%`);
        btn.style.setProperty('--interactive-showcase-y', `${y}%`);
      });
    });
  };
  fit();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    items.forEach(({ figure }) => ro.observe(figure));
  } else window.addEventListener('resize', fit);
  return fit;
}

/**
 * browsers without CSS container units (cqw / cqh): the stage's own width and height as
 * --interactive-showcase-cq-w / --interactive-showcase-cq-h, which the CSS uses in their place
 * (@supports not container-type)
 */
function containerUnits(container) {
  if (window.CSS?.supports?.('container-type', 'size')) return;
  const measure = () => {
    container.style.setProperty('--interactive-showcase-cq-w', `${container.clientWidth}px`);
    container.style.setProperty('--interactive-showcase-cq-h', `${container.clientHeight}px`);
  };
  if (window.ResizeObserver) new ResizeObserver(measure).observe(container);
  else window.addEventListener('resize', measure);
}

// the card side by side with its copy (as in interactive-showcase.css): not on touch screens
// held upright (phones and tablets), which have the mobile design
const SIDE_BY_SIDE = '((width >= 900px) or ((orientation: landscape) and (width >= 600px))) and (not ((hover: none) and (pointer: coarse) and (orientation: portrait)))';

/**
 * Universal Editor sizes its frame to the page's height, so in the editor the card cannot take
 * the screen's height (interactive-showcase.css). It is laid out for a screen of the Figma
 * frame's shape at the editor's width instead: the card 1280 x 720 side by side, the screen
 * 375 x 815 for the phone layout. From the width only, so it cannot feed back into the height
 */
function editorScreen(block) {
  const sideBySide = window.matchMedia(SIDE_BY_SIDE);
  const measure = () => {
    const width = block.offsetWidth;
    if (!width) return;
    // the card is 8px in from the screen's edges (interactive-showcase-wrapper)
    const screen = sideBySide.matches ? width * (720 / 1280) + 16 : (width + 16) * (815 / 375);
    ['--interactive-showcase-vh', '--interactive-showcase-svh'].forEach((prop) => {
      block.style.setProperty(prop, `${screen / 100}px`);
    });
  };
  measure();
  if (window.ResizeObserver) new ResizeObserver(measure).observe(block);
  sideBySide.addEventListener('change', measure);
}

// Universal Editor model of one showcase item (block/item). Published rows carry no model, so
// identify items by their image/hotspot content and leave the separate title/description
// heading row out.
const ITEM_MODEL = 'interactive-showcase-item';

/**
 * Universal Editor builds its content tree from what contains what on the page. An item's
 * fields shown outside its row (title and description in the copy column, thumbnail in the
 * tray) therefore stay in the row, hidden, so the tree lists them under their item; what is
 * shown is this copy, without the editor's markers (it is edited in the item's properties)
 */
function displayCopy(node) {
  const copy = node.cloneNode(true);
  [copy, ...copy.querySelectorAll('*')].forEach((n) => {
    [...n.attributes].forEach(({ name }) => {
      if (name.startsWith('data-aue-') || name.startsWith('data-richtext-')) n.removeAttribute(name);
    });
  });
  return copy;
}

/* ---------- Combat motion ----------
 * The Combat page (body.combat) plays the design prototype's exterior / interior motion:
 *   view switch   the new image comes in from a blur (18px, 104%) as the old one blurs away
 *                 (to 102%), 0.85s power2.inOut, instead of the vertical slide (slideImages)
 *   caption       the old caption blurs (8px) and drops 10px away in 0.3s, then the new one
 *                 comes back the same way in 0.5s
 *   hotspots      appear from a blur (10px, 40%) one after another (0.55s, 60ms apart) once
 *                 the section has nearly arrived (combat:move, scripts/combat-motion.js) and
 *                 after a view switch; they shrink away (0.3s, 30ms apart) as the page moves
 *                 on, or the view switches
 * Only with motion allowed (checked at each change); otherwise the views swap at once.
 */
const COMBAT_EASE = {
  power2In: 'cubic-bezier(0.32, 0, 0.67, 0)',
  power2InOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  power3Out: 'cubic-bezier(0.25, 1, 0.5, 1)',
};
// the hotspots come in when this much of the section's 1.2s arrival has played (the prototype's
// 78% of its move)
const COMBAT_SPOTS_AFTER = 940;

/**
 * @param {object} opts
 * @param {Element} opts.block
 * @param {Element} opts.section
 * @param {Element} opts.stage
 * @param {object[]} opts.items {row, textCell, figure, spots}
 * @param {function(): number} opts.currentIndex
 * @param {function(): void} opts.closeTooltip
 * @returns {{change: function(number, number): void}}
 */
function combatViewMotion({
  block, section, stage, items, currentIndex, closeTooltip,
}) {
  const { body } = document;
  const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  block.classList.add('combat-view');

  // hotspots: .spots-off hides those of an image (interactive-showcase.css)
  const spotAnims = new Map();
  const stopSpots = (item) => {
    (spotAnims.get(item) || []).forEach((a) => a.cancel());
    spotAnims.delete(item);
  };
  const spotsIn = (item) => {
    stopSpots(item);
    item.figure.classList.remove('spots-off');
    if (!motionOk()) return;
    spotAnims.set(item, item.spots.map(({ btn }, i) => btn.animate([
      { opacity: 0, scale: '0.4', filter: 'blur(10px)' },
      { opacity: 1, scale: '1', filter: 'blur(0px)' },
    ], {
      duration: 550, delay: i * 60, easing: COMBAT_EASE.power3Out, fill: 'backwards',
    })));
  };
  const spotsOut = (item, {
    to = 0.4, blur = 6, duration = 300, each = 30,
  } = {}) => {
    stopSpots(item);
    if (item.figure.classList.contains('spots-off')) return;
    if (!motionOk() || !item.spots.length) {
      item.figure.classList.add('spots-off');
      return;
    }
    const anims = item.spots.map(({ btn }, i) => btn.animate([
      { opacity: 0, scale: String(to), filter: `blur(${blur}px)` },
    ], { duration, delay: i * each, fill: 'forwards' }));
    spotAnims.set(item, anims);
    Promise.all(anims.map((a) => a.finished)).then(() => {
      item.figure.classList.add('spots-off');
      stopSpots(item);
    }).catch(() => {
      // interrupted: what interrupted it takes over
    });
  };
  const hideSpots = (item) => {
    stopSpots(item);
    item.figure.classList.add('spots-off');
  };
  // a hidden + reached with the keyboard shows them all
  stage.addEventListener('focusin', (e) => {
    const item = items.find(({ figure }) => figure.contains(e.target));
    if (item?.figure.classList.contains('spots-off') && e.target.matches('.hotspot')) spotsIn(item);
  });

  // arrival: the hotspots come in late in the move here, and go as the page moves on
  let arrival = 0;
  const current = () => items[currentIndex()];
  document.addEventListener('combat:move', ({ detail: { from, to } }) => {
    if (from === to) return;
    if (from === section) {
      clearTimeout(arrival);
      closeTooltip();
      spotsOut(current());
    } else if (to === section) {
      hideSpots(current());
      clearTimeout(arrival);
      arrival = setTimeout(() => spotsIn(current()), COMBAT_SPOTS_AFTER);
    }
  });
  document.addEventListener('combat:arrive', ({ detail }) => {
    const item = current();
    if (detail.section === section) {
      clearTimeout(arrival);
      if (item.figure.classList.contains('spots-off')) spotsIn(item);
    } else if (!spotAnims.has(item)) hideSpots(item);
  });
  const here = () => !body.classList.contains('combat-motion') || section?.classList.contains('is-current');

  // view switch
  let viewAnims = [];
  let viewDone = null;
  const crossfade = (from, to) => {
    viewAnims.forEach((a) => a.cancel());
    viewAnims = [];
    items.forEach(({ row }) => row.classList.remove('is-outgoing'));
    from.row.classList.add('is-outgoing');
    const timing = { duration: 850, easing: COMBAT_EASE.power2InOut };
    const incoming = to.figure.animate([
      { opacity: 0, filter: 'blur(18px)', scale: '1.04' },
      { opacity: 1, filter: 'blur(0px)', scale: '1' },
    ], timing);
    const outgoing = from.figure.animate([
      { opacity: 1, filter: 'blur(0px)', scale: '1' },
      { opacity: 0, filter: 'blur(18px)', scale: '1.02' },
    ], { ...timing, fill: 'forwards' });
    viewAnims = [incoming, outgoing];
    const done = incoming.finished;
    viewDone = done;
    done.then(() => {
      if (viewDone !== done) return;
      from.row.classList.remove('is-outgoing');
      outgoing.cancel();
      viewAnims = [];
      if (here()) spotsIn(to);
    }).catch(() => {
      // interrupted by the next switch
    });
  };

  // caption: the one on screen goes, then the new one comes
  let shown = null;
  let captionTimer = 0;
  let captionAnims = [];
  const frameOf = (node) => {
    const cs = getComputedStyle(node);
    return {
      opacity: cs.opacity,
      filter: cs.filter === 'none' ? 'blur(0px)' : cs.filter,
      translate: cs.translate === 'none' ? '0 0' : cs.translate,
    };
  };
  const swapCaption = (coming) => {
    clearTimeout(captionTimer);
    const leaving = shown;
    // (select() has hidden it already; its styles still read where it is in its fade)
    const leavingFrom = leaving ? frameOf(leaving) : null;
    captionAnims.forEach((a) => a.cancel());
    captionAnims = [];
    shown = coming;
    if (!coming || !leaving || leaving === coming || !motionOk()) return;
    // select() has shown the new caption: the old one stays until it has gone
    coming.hidden = true;
    leaving.hidden = false;
    captionAnims.push(leaving.animate([leavingFrom, {
      opacity: 0, filter: 'blur(8px)', translate: '0 10px',
    }], { duration: 300, easing: COMBAT_EASE.power2In, fill: 'forwards' }));
    captionTimer = setTimeout(() => {
      captionAnims.forEach((a) => a.cancel());
      leaving.hidden = true;
      coming.hidden = false;
      captionAnims = [coming.animate([
        { opacity: 0, filter: 'blur(8px)', translate: '0 10px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
      ], { duration: 500, easing: COMBAT_EASE.power3Out, fill: 'backwards' })];
    }, 350);
  };

  return {
    change(fromIndex, toIndex) {
      const from = items[fromIndex];
      const to = items[toIndex];
      if (!to) return;
      if (!from || from === to) {
        shown = to.textCell || null;
        return;
      }
      swapCaption(to.textCell || null);
      if (!motionOk()) {
        stopSpots(from);
        if (here()) spotsIn(to);
        return;
      }
      spotsOut(from, {
        to: 0.5, duration: 250, each: 20,
      });
      hideSpots(to);
      crossfade(from, to);
    },
  };
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  instance += 1;
  const id = `interactive-showcase-${instance}`;
  const section = block.closest('.section');
  // Cover style: full-bleed, built on in interactive-showcase-cover.js (see the end)
  const cover = block.classList.contains('cover');
  if (section) {
    section.dataset.interactiveShowcaseTheme = 'light';
    // (a Cover section is named after its view instead, interactive-showcase-cover.js)
    if (!cover && !section.id && !document.getElementById('nev-tech')) section.id = 'nev-tech';
  }

  const rows = [...block.children];
  // In Universal Editor the model identifies rows. In published HTML, identify item rows by
  // their image/hotspot content; the heading row contains only the main title field.
  const parentRow = rows.find((r) => r.dataset.aueModel === 'interactive-showcase');
  const itemRows = rows.filter((r) => r.dataset.aueModel === ITEM_MODEL
    || (!r.dataset.aueModel && (r.querySelector('picture, li') || r.children.length > 2)));
  const headRow = parentRow || rows.find((r) => !itemRows.includes(r));
  const editing = Boolean(block.closest('[data-aue-resource]'));
  // Cover style: its View name and button rows (both Cover only, after the title row), handed
  // to interactive-showcase-cover.js; the stylesheet is fetched while the block is built
  const coverStyles = cover ? loadCSS(`${window.hlx.codeBasePath}/blocks/interactive-showcase/interactive-showcase-cover.css`) : null;
  const fieldRows = rows.filter((r) => r !== headRow && !itemRows.includes(r));
  const buttonRow = fieldRows.find((r) => r.querySelector('[data-aue-prop="link"], a'));
  const labelRow = fieldRows.find((r) => r.querySelector('[data-aue-prop="label"]'))
    || fieldRows.find((r) => r !== buttonRow);
  const coverParts = { labelRow, buttonRow };
  // items after the MAX_ITEMS-th are left out; in the editor they stay in the block (hidden) so
  // they can still be found and removed in the content tree
  const extraRows = itemRows.splice(MAX_ITEMS);
  // Universal Editor filters cannot limit how many items a block takes, only which: once the
  // block has MAX_ITEMS items it gets a filter that allows none (_interactive-showcase.json), so
  // the editor offers no "Add"; below that it gets its own filter back
  if (editing && block.dataset.aueFilter) {
    const full = itemRows.length + extraRows.length >= MAX_ITEMS;
    block.dataset.aueFilter = full ? 'interactive-showcase-full' : 'interactive-showcase';
  }

  // Item field cells are separate in the model: title is text and description is a textarea.
  // The parent model has only a title. Keep a fallback for published markup without UE field
  // attributes.
  const fieldCell = (row, name) => [...(row?.children || [])].find((cell) => (
    cell.matches(`[data-aue-prop="${name}"]`) || cell.querySelector(`[data-aue-prop="${name}"]`)
  )) || null;
  const copy = el('div', 'copy');
  // texts over their limit (MAX_CHARS), listed for the author in the editor
  const tooLong = [];
  if (headRow) {
    headRow.className = 'heading';
    const mainTitle = fieldCell(headRow, 'title');
    // published, the plain-text title is the row's only cell (no heading element, no field name)
    const titleNode = mainTitle || headRow.querySelector('h1, h2, h3') || headRow.firstElementChild;
    titleNode?.classList.add('title');
    // in the editor the title is the field itself, edited in place: it is left whole (the
    // stylesheet keeps it to its lines) and the author is told it is too long
    const titleLength = titleNode?.textContent.trim().length || 0;
    if (titleNode && titleLength > MAX_CHARS.title) {
      if (editing) tooLong.push(`the title (${titleLength} of ${MAX_CHARS.title} characters)`);
      else clipField(titleNode, MAX_CHARS.title);
    }
    copy.append(headRow);
  }
  const detail = el('div', 'detail');
  const counter = el('p', 'counter');
  const texts = el('div', 'texts', { 'aria-live': 'polite' });
  const thumbs = el('div', 'thumbs', { role: 'tablist', 'aria-label': 'Showcase items' });
  detail.append(counter, texts, thumbs);
  snapRow(thumbs, '.thumb');
  if (editing && extraRows.length) {
    const extra = el('div', 'extra-items');
    extra.hidden = true;
    extra.append(...extraRows);
    const note = el('p', 'limit-note');
    note.textContent = `Only the first ${MAX_ITEMS} items are shown. `
      + `${extraRows.length} more ${extraRows.length === 1 ? 'is' : 'are'} hidden: `
      + 'remove or reorder them in the content tree.';
    detail.append(note, extra);
  }
  copy.append(detail);

  // the site's header, where it stays over the page: how far down the screen it reaches
  // (header.bottom) and over the card once the card fills the screen, 8px down from the top
  // (header.cover). The heading starts clear of it (--interactive-showcase-header-cover, the
  // stylesheet); tooltips and + points keep out from under it
  const header = { bottom: 0, cover: 0 };
  let refitSpots = null;
  const stage = el('div', 'stage');
  containerUnits(stage);
  const tooltip = el('div', 'tooltip', { id: `${id}-tooltip`, role: 'dialog', 'aria-modal': 'false' });
  tooltip.hidden = true;
  const tipTitle = el('p', 'tooltip-title', { id: `${id}-tooltip-title` });
  const tipText = el('p', 'tooltip-text');
  const tipClose = el('button', 'tooltip-close', { type: 'button', 'aria-label': 'Close details' });
  tooltip.setAttribute('aria-labelledby', tipTitle.id);
  tooltip.append(tipTitle, tipText, tipClose);

  let openSpot = null;
  /**
   * where a tooltip may go: the part of the card on screen, 8px in from its edges, and - where
   * the copy column sits beside the image (desktop) - clear of its heading, text and thumbnails
   */
  const freeArea = (spot) => {
    const gap = 8;
    const card = stage.getBoundingClientRect();
    const area = {
      left: Math.max(card.left, 0) + gap,
      right: Math.min(card.right, document.documentElement.clientWidth) - gap,
      // clear of the site's header where it stays over the page
      top: Math.max(card.top, 0, header.bottom) + gap,
      bottom: Math.min(card.bottom, window.innerHeight) - gap,
    };
    copy.querySelectorAll('.title, .counter, .text:not([hidden]), .thumbs, .limit-note')
      .forEach((part) => {
        const r = part.getBoundingClientRect();
        const beside = r.width && r.bottom > area.top && r.top < area.bottom;
        if (beside && r.right <= spot.left) area.left = Math.max(area.left, r.right + gap);
      });
    return area;
  };

  /**
   * the tooltip opens away from the edges: from a hotspot in the right half of the free area it
   * opens to the left, from one in the left half to the right, and downwards wherever it fits
   * (the hotspot in its top corner, its title beside the minus, as in the design), upwards only
   * where it does not. Where that side does not fit it takes the other one; where neither does
   * (a phone's card) it narrows to fit on the side with more room; only where even that is too
   * narrow does it open just below or above the hotspot, centred on it and nudged in, the
   * hotspot keeping its own box. Up or down: the one that fits, else the one with more room.
   */
  /**
   * opening upwards beside its + (desktop), the description's last line stops short of the
   * minus in the bottom corner (interactive-showcase.css). It is three lines in the design; a
   * longer one (up to MAX_CHARS.hotspotText) takes as many as it needs, up to its line limit:
   * that count is --interactive-showcase-tip-lines, measured at the tooltip's current width
   * (left unset at three lines or fewer, so those stay as designed)
   */
  const fitTipLines = () => {
    tipText.style.removeProperty('--interactive-showcase-tip-lines');
    const style = getComputedStyle(tipText);
    const line = parseFloat(style.lineHeight);
    const most = parseInt(style.getPropertyValue('--interactive-showcase-lines'), 10) || 3;
    if (!line || tooltip.dataset.align !== 'bottom') return;
    const lines = Math.min(most, Math.round(tipText.scrollHeight / line));
    if (lines > 3) tipText.style.setProperty('--interactive-showcase-tip-lines', lines);
  };

  const placeTooltip = () => {
    if (!openSpot) return;
    const spot = openSpot.getBoundingClientRect();
    const area = freeArea(spot);
    // a hotspot at the very edge of the card reaches past the free area: its tooltip may go as
    // far as the hotspot itself does, so it stays on the hotspot's corner (one box with it)
    // rather than being nudged off it
    area.left = Math.min(area.left, spot.left - 0.5);
    area.right = Math.max(area.right, spot.right + 0.5);
    area.top = Math.min(area.top, spot.top - 0.5);
    area.bottom = Math.max(area.bottom, spot.bottom + 0.5);
    const set = (side, align) => {
      tooltip.dataset.side = side;
      tooltip.dataset.align = align;
      fitTipLines();
      return tooltip.getBoundingClientRect();
    };
    const fitsAcross = (b) => b.left >= area.left && b.right <= area.right;
    const overflowY = (b) => Math.max(0, area.top - b.top) + Math.max(0, b.bottom - area.bottom);
    const spotX = (spot.left + spot.right) / 2;
    const spotY = (spot.top + spot.bottom) / 2;
    tooltip.style.removeProperty('--interactive-showcase-sx');
    tooltip.style.removeProperty('--interactive-showcase-sy');
    tooltip.style.removeProperty('width');

    const sides = spotX > (area.left + area.right) / 2 ? ['left', 'right'] : ['right', 'left'];
    let side = sides.find((s) => fitsAcross(set(s, 'top')));
    if (!side) {
      // too wide for either side: narrower, on the side with more room, still growing out of the
      // + 's corner as everywhere else (only below MIN_TOOLTIP_WIDTH does it go below / above)
      const room = { left: spot.right - area.left, right: area.right - spot.left };
      const wider = room.left >= room.right ? 'left' : 'right';
      if (room[wider] >= MIN_TOOLTIP_WIDTH) {
        tooltip.style.width = `${Math.floor(room[wider])}px`;
        side = wider;
      }
    }
    side = side || 'center';
    const apart = side === 'center';
    // beside its +, the module opens downwards wherever it fits (its title and the minus then
    // share its top row, as in the design), upwards only where it does not; below / above its +
    // (narrow screens), whichever side of the free area the + is not in
    const aligns = apart ? ['below', 'above'] : ['top', 'bottom'];
    if (apart && spotY > (area.top + area.bottom) / 2) aligns.reverse();
    const [align] = aligns
      .map((a) => [a, overflowY(set(side, a))])
      .sort((a, b) => a[1] - b[1]);
    const box = set(side, align[0]);

    // nudged in where it still does not fit (across, and up or down); taller than the free
    // area (the shortest phones) it keeps to its top. It may then cover some of the image, never
    // the copy or the edges; its hotspot stays above it, so it can still be closed
    let sx = 0;
    if (box.right > area.right) sx = area.right - box.right;
    else if (box.left < area.left) sx = area.left - box.left;
    if (sx) tooltip.style.setProperty('--interactive-showcase-sx', `${sx}px`);
    const sy = box.top < area.top || box.height > area.bottom - area.top
      ? area.top - box.top
      : Math.min(0, area.bottom - box.bottom);
    if (sy) tooltip.style.setProperty('--interactive-showcase-sy', `${sy}px`);
    // a tooltip moved off its hotspot's corner leaves the hotspot its own box
    const offCorner = apart || Boolean(sy);
    openSpot.classList.toggle('hotspot-apart', offCorner);
    // the minus where the open module has it: centred 24.5px in from the module's side and 26px
    // down from its top (up from its bottom, opening up), moved there from the + 's centre
    // (interactive-showcase.css); a module apart from its + leaves it in the middle
    const half = openSpot.offsetWidth / 2;
    // (24.5 / 26 in the desktop module; the stylesheet's --interactive-showcase-minus-x / -y)
    const tipStyle = getComputedStyle(tooltip);
    const minusX = parseFloat(tipStyle.getPropertyValue('--interactive-showcase-minus-x')) || 24.5;
    const minusY = parseFloat(tipStyle.getPropertyValue('--interactive-showcase-minus-y')) || 26;
    const iconX = { left: half - minusX, right: minusX - half }[side];
    const iconY = { top: minusY - half, bottom: half - minusY }[align[0]];
    if (offCorner || iconX === undefined || iconY === undefined) {
      ['x', 'y'].forEach((k) => openSpot.style.removeProperty(`--interactive-showcase-icon-${k}`));
    } else {
      openSpot.style.setProperty('--interactive-showcase-icon-x', `${iconX + sx}px`);
      openSpot.style.setProperty('--interactive-showcase-icon-y', `${iconY}px`);
    }
  };

  // the hotspot whose tooltip is shrinking back into it (closeTooltip with animate)
  let closingSpot = null;
  const finishClosing = () => {
    if (!closingSpot) return;
    const spot = closingSpot;
    closingSpot = null;
    // the hotspot takes over the box the tooltip has shrunk into, in the colour it ended in
    // (its own, unless hovered: then it eases on to the hover colour)
    const { backgroundColor } = getComputedStyle(spot.classList.contains('hotspot-apart') ? spot : tooltip);
    spot.style.transition = 'none';
    spot.style.backgroundColor = backgroundColor;
    spot.classList.remove('is-closing', 'hotspot-apart');
    tooltip.classList.remove('is-closing');
    tooltip.hidden = true;
    spot.getBoundingClientRect();
    spot.style.removeProperty('transition');
    spot.style.removeProperty('background-color');
  };
  tooltip.addEventListener('animationend', (e) => {
    if (e.target === tooltip && tooltip.classList.contains('is-closing')) finishClosing();
  });

  /**
   * closes the open tooltip: at once, or (animate: closed by the user) shrinking back into its
   * hotspot, the reverse of its opening (interactive-showcase.css)
   */
  const closeTooltip = ({ refocus = false, animate = false } = {}) => {
    if (!openSpot) return;
    const spot = openSpot;
    openSpot = null;
    spot.setAttribute('aria-expanded', 'false');
    // the minus goes back to the + 's centre (as the module shrinks, closing animated)
    ['x', 'y'].forEach((k) => spot.style.removeProperty(`--interactive-showcase-icon-${k}`));
    if (refocus) spot.focus();
    tooltip.classList.remove('is-opening');
    if (!animate) {
      spot.classList.remove('hotspot-apart');
      tooltip.hidden = true;
      return;
    }
    closingSpot = spot;
    spot.classList.add('is-closing');
    tooltip.classList.add('is-closing');
    // no animation (reduced motion): nothing to wait for
    if (getComputedStyle(tooltip).animationName === 'none') finishClosing();
  };
  const openTooltip = (spot, data) => {
    finishClosing();
    closeTooltip();
    openSpot = spot;
    spot.setAttribute('aria-expanded', 'true');
    tipTitle.textContent = clip(data.title, MAX_CHARS.hotspotTitle);
    tipText.textContent = clip(data.text, MAX_CHARS.hotspotText);
    spot.closest('.figure').append(tooltip);
    // where the hotspot is drawn (in the editor, one in the cut-off part of the image is drawn
    // at the nearest visible point, not at its own x, y)
    ['--interactive-showcase-x', '--interactive-showcase-y'].forEach((prop) => {
      tooltip.style.setProperty(prop, spot.style.getPropertyValue(prop));
    });
    // placed at its full size, then grown out of its hotspot (restarted each time, also when
    // going straight from one hotspot to another)
    tooltip.classList.remove('is-opening');
    tooltip.hidden = false;
    placeTooltip();
    tooltip.getBoundingClientRect();
    tooltip.classList.add('is-opening');
  };

  const items = itemRows.map((row, i) => {
    const cells = [...row.children];
    const mediaCell = cells.find((c) => c.querySelector('picture')) || cells[0];
    const hotCell = cells.find((c) => c !== mediaCell && c.querySelector('li'))
      || (cells.length >= 3 ? cells[cells.length - 1] : null);
    let titleCell = fieldCell(row, 'title');
    let descriptionCell = fieldCell(row, 'description');
    // Published markup may not carry data-aue-prop. The cells then come in the model's order:
    // title, then description (which may be a heading, e.g. a caption, so a heading does not
    // mark the title).
    const contentCells = cells.filter((c) => c !== mediaCell && c !== hotCell);
    if (!titleCell) titleCell = contentCells[0] || null;
    if (!descriptionCell) descriptionCell = contentCells.find((c) => c !== titleCell) || null;
    if (descriptionCell === titleCell) descriptionCell = null;
    const pictures = [...(mediaCell?.querySelectorAll('picture') || [])];
    // in the editor each image names its field; published, the thumbnail comes first
    const fieldPicture = (name) => mediaCell?.querySelector(`[data-aue-prop="${name}"]`)?.closest('picture');
    const thumbPicture = fieldPicture('media_thumbnail') || pictures[0];
    const imagePicture = fieldPicture('media_image')
      || pictures.find((p) => p !== thumbPicture) || thumbPicture?.cloneNode(true);
    const title = clip(titleCell?.textContent || '', MAX_CHARS.itemTitle) || `Showcase item ${i + 1}`;

    // the item row becomes its panel (keeps the editor's item instrumentation)
    row.className = 'panel';
    row.id = `${id}-panel-${i}`;
    row.setAttribute('role', 'tabpanel');
    row.setAttribute('aria-labelledby', `${id}-tab-${i}`);
    const figure = el('div', 'figure');
    if (imagePicture) figure.append(imagePicture);
    const img = imagePicture?.querySelector('img');
    if (img) trackRatio(figure, img);
    // each spot keeps its whole title and text (the editor writes them back when a + is moved);
    // they are shortened where they are shown
    const spots = parseHotspots(hotCell).map((spot, n) => {
      [['title', MAX_CHARS.hotspotTitle], ['text', MAX_CHARS.hotspotText]].forEach(([key, max]) => {
        if (spot[key].length > max) {
          tooLong.push(`item ${i + 1}, + point ${n + 1}: its ${key === 'title' ? 'title' : 'description'} (${spot[key].length} of ${max} characters)`);
        }
      });
      const btn = el('button', 'hotspot', {
        type: 'button',
        'aria-label': spot.title ? `Show details: ${clip(spot.title, MAX_CHARS.hotspotTitle)}` : 'Show details',
        'aria-expanded': 'false',
        'aria-controls': tooltip.id,
      });
      btn.style.setProperty('--interactive-showcase-x', `${spot.x}%`);
      btn.style.setProperty('--interactive-showcase-y', `${spot.y}%`);
      // Cover hook: its + points open the Cover's detail panel instead of this tooltip
      // (interactive-showcase-cover.js binds them)
      if (!cover) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (openSpot === btn) closeTooltip({ animate: true });
          else openTooltip(btn, spot);
        });
      }
      figure.append(btn);
      return { btn, spot };
    });
    if (hotCell) hotCell.classList.add('hotspot-source');
    mediaCell?.remove();
    row.prepend(figure);
    stage.append(row);

    // published, the fields move to where they are shown; in the editor a copy is shown there
    // and the field itself stays in the row, hidden (see displayCopy)
    const show = (field) => {
      if (!editing) return field;
      const shown = displayCopy(field);
      field.hidden = true;
      return shown;
    };
    const textCell = el('div', 'text');
    if (titleCell) {
      const shownTitle = show(titleCell);
      shownTitle.classList.add('item-title');
      const length = clipField(shownTitle, MAX_CHARS.itemTitle);
      if (length) tooLong.push(`item ${i + 1}: its title (${length} of ${MAX_CHARS.itemTitle} characters)`);
      textCell.append(shownTitle);
    }
    if (descriptionCell) {
      const shownDescription = show(descriptionCell);
      shownDescription.classList.add('description');
      const length = clipField(shownDescription, MAX_CHARS.description);
      if (length) tooLong.push(`item ${i + 1}: its description (${length} of ${MAX_CHARS.description} characters)`);
      textCell.append(shownDescription);
    }
    if (textCell.children.length) texts.append(textCell);

    const tab = el('button', 'thumb', {
      type: 'button', role: 'tab', id: `${id}-tab-${i}`, 'aria-controls': row.id, 'aria-label': title,
    });
    if (thumbPicture) {
      if (editing) {
        // first in the row, as the thumbnail is first in the item's model
        const thumbField = el('div');
        thumbField.hidden = true;
        row.prepend(thumbField);
        thumbField.append(thumbPicture);
      }
      const shownThumb = show(thumbPicture);
      shownThumb.querySelector('img')?.setAttribute('alt', '');
      tab.append(shownThumb);
    }
    thumbs.append(tab);
    return {
      row, textCell, tab, figure, hotCell, spots,
    };
  });

  if (editing && tooLong.length) {
    const note = el('p', 'limit-note');
    note.textContent = `Too long for the card, so shortened on the page: ${tooLong.join('; ')}. `
      + 'Shorten them in the properties.';
    detail.prepend(note);
  }

  let current = 0;
  /**
   * phones: the counter shares its row with the item's title ("1/3  Plug-in ..."). Its width
   * follows its digits ("2/3" is wider than "1/3"), and with it the room the titles wrap in, so
   * the copy kept the height of the longest item's could still change: the titles get the room
   * left beside the widest counter (--interactive-showcase-counter-slack, interactive-showcase.css)
   */
  const counterSlack = () => {
    if (!items.length) return;
    const range = document.createRange();
    const width = (label) => {
      counter.textContent = label;
      range.selectNodeContents(counter);
      return range.getBoundingClientRect().width;
    };
    const shown = `${current + 1}/${items.length}`;
    const widest = Math.max(...items.map((_, i) => width(`${i + 1}/${items.length}`)));
    const slack = widest - width(shown);
    block.style.setProperty('--interactive-showcase-counter-slack', `${slack.toFixed(2)}px`);
  };

  /**
   * the images move like a vertical carousel (interactive-showcase.css): picking a thumbnail to
   * the right pushes the current image up and out while the new one rises from the bottom;
   * one to the left pushes it down while the new one comes in from the top
   */
  const slideImages = (from, to) => {
    if (from === to) return;
    const dir = to > from ? 1 : -1;
    const incoming = items[to].row;
    incoming.style.transition = 'none';
    incoming.style.transform = `translateY(${dir * 100}%)`;
    incoming.getBoundingClientRect();
    ['transition', 'transform'].forEach((p) => incoming.style.removeProperty(p));
    items[from].row.style.transform = `translateY(${-dir * 100}%)`;
  };

  // Combat motion: the views cross-fade instead of sliding (not for Cover)
  const combatView = document.body.classList.contains('combat') && !cover && !editing && items.length
    ? combatViewMotion({
      block, section, stage, items, currentIndex: () => current, closeTooltip,
    })
    : null;

  /**
   * more thumbnails than the tray's row holds (up to MAX_ITEMS, e.g. one per paint colour): the
   * tray scrolls sideways (interactive-showcase.css). Its edges with thumbnails past them are
   * marked (.more-before / .more-after, faded there), and the selected thumbnail is kept in view,
   * clear of the fade. A tray that holds them all (three, as designed) is left as it is
   */
  const FADE = 24;
  const trayEdges = () => {
    const end = thumbs.scrollWidth - thumbs.clientWidth;
    thumbs.classList.toggle('more-before', end > 1 && thumbs.scrollLeft > 1);
    thumbs.classList.toggle('more-after', end > 1 && thumbs.scrollLeft < end - 1);
  };
  const revealThumb = (tab, smooth) => {
    if (thumbs.scrollWidth - thumbs.clientWidth <= 1) return;
    const t = tab.getBoundingClientRect();
    const r = thumbs.getBoundingClientRect();
    let dx = 0;
    if (t.left < r.left + FADE) dx = t.left - r.left - FADE;
    else if (t.right > r.right - FADE) dx = t.right - r.right + FADE;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dx) thumbs.scrollBy({ left: dx, behavior: smooth && !calm ? 'smooth' : 'instant' });
  };
  thumbs.addEventListener('scroll', trayEdges, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(trayEdges).observe(thumbs);

  const select = (index, focus = false) => {
    const from = current;
    current = (index + items.length) % items.length;
    closeTooltip();
    // Cover hook: its images crossfade instead of sliding (interactive-showcase-cover.css); the
    // Combat theme cross-fades them too (combatViewMotion)
    if (!cover && !combatView && items[from] && items[current]) slideImages(from, current);
    items.forEach(({ row, textCell, tab }, i) => {
      const active = i === current;
      row.classList.toggle('is-active', active);
      // the selected image flies on into the next section's card (parallax-collage)
      row.querySelector('.figure')?.toggleAttribute('data-zoom-source', active);
      row.inert = !active;
      if (textCell) textCell.hidden = !active;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    combatView?.change(from, current);
    counter.textContent = `${current + 1}/${items.length}`;
    counterSlack();
    if (focus) items[current].tab.focus();
    revealThumb(items[current].tab, from !== current);
    // Cover hook: tells interactive-showcase-cover.js which item is shown now
    if (cover) {
      block.dispatchEvent(new CustomEvent('interactive-showcase:select', { detail: { from, to: current } }));
    }
  };
  // again once the fonts are in, and as the counter's size changes with the screen
  document.fonts?.ready.then(counterSlack);
  window.addEventListener('resize', counterSlack);

  items.forEach(({ tab }, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const step = {
        ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
      }[e.key];
      if (step) {
        e.preventDefault();
        select(current + step, true);
      }
    });
  });

  tipClose.addEventListener('click', () => closeTooltip({ refocus: true, animate: true }));
  window.addEventListener('resize', () => {
    if (openSpot) placeTooltip();
  });
  document.addEventListener('click', (e) => {
    if (openSpot && !tooltip.contains(e.target)) closeTooltip({ animate: true });
  });
  block.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSpot) closeTooltip({ refocus: true, animate: true });
  });

  block.replaceChildren(copy, stage);
  if (editing) {
    block.classList.add('editing');
    editorScreen(block);
  } else if (!cover && section && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    // the white card's entrance (Cover is full-bleed and enters with its section style)
    curtain(section, block);
  }
  if (items.length) select(0);
  if (!editing) refitSpots = keepSpotsInView(block, stage, items, header);
  watchHeader((bottom) => {
    header.bottom = bottom;
    header.cover = Math.max(0, bottom - 8);
    block.style.setProperty('--interactive-showcase-header-cover', `${header.cover}px`);
    refitSpots?.();
    if (openSpot) placeTooltip();
  });

  // Cover: the full-bleed layout, swatches, view switch and button (interactive-showcase-cover.js)
  if (cover) {
    const [{ default: decorateCover }] = await Promise.all([
      import('./interactive-showcase-cover.js'),
      coverStyles,
    ]);
    decorateCover(block, {
      ...coverParts, items, select, editing, tooltip,
    });
  }

  // Universal Editor only: drag / nudge the + points and save their x, y (hotspot-editor.js)
  if (block.classList.contains('editing') && items.length) {
    import('./hotspot-editor.js')
      .then(({ default: editHotspots }) => editHotspots(items, closeTooltip))
      // optional: the block works the same without it
      .catch(() => {});
  }

  // Universal Editor: selecting an item, or one of its fields, in the content tree or on the
  // page shows that item. Listened to while capturing, so it is heard wherever it is dispatched
  if (editing && items.length) {
    document.addEventListener('aue:ui-select', (e) => {
      if (!block.isConnected || !e.detail?.selected) return;
      const { resource } = e.detail;
      const index = items.findIndex(({ row }) => (resource && row.dataset.aueResource === resource)
        || (e.target instanceof Node && row.contains(e.target)));
      if (index >= 0 && index !== current) select(index);
    }, true);
  }
}
