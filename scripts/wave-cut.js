const STYLE = 'wave-in';
// the edge's reveal window (of the move's time) and its travel (of the screen height)
const EDGE_START = 0;
const EDGE_END = 0.92;
const EDGE_FROM = 1.06;
const EDGE_TO = -0.24;
const HERO_ZOOM = 0.025;
// longest a move can take before the cut gives up (the snap tween is 1.2s)
const MAX_MS = 3000;
// px each section paints past its edges while held, so a subpixel gap (Firefox) shows no line
const SEAM_PX = 4;

// full-bleed media
const PHOTO = [
  '.hero > .bg',
  '.tabs.locations > .tabs-panel:not([hidden]) .loc-bg',
  '.block > .backdrop',
].join(', ');
// full-bleed media layers a tuned cut sinks (the upper section)
const MEDIA = [
  PHOTO,
  '.hero > .bg',
  '.split-media',
  '.stats-production-bg',
].join(', ');
// block parts that are media layers or overlays, never faded as content
const NOT_CONTENT = '.bg, .backdrop, .tabs-panel, .ts-cursor, .slide-controls, .events-status';
const SINK_ZOOM = 0.03;
// the outgoing copy is gone in the first part of the move
const FADE_OUT_END = 0.3;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const span = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const powerIn = (t) => t * t;
const sineInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * A unitless number from a CSS custom property on `el`.
 * @param {Element} el
 * @param {string} name
 * @returns {number|null} null when unset or not a number
 */
function tuning(el, name) {
  const value = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(value) ? value : null;
}

// three layered sine waves under a gaussian blur, one tile per screen width
const WAVE_SVG = (() => {
  const pts = [];
  for (let x = -300; x <= 1300; x += 10) {
    const k = (x / 1000) * Math.PI * 2;
    const y = 1000 + 30 * (0.6 * Math.sin(k + 0.4) + 0.3 * Math.sin(2 * k + 1.3)
      + 0.1 * Math.sin(3 * k + 2.1));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 3000" preserveAspectRatio="none">'
    + '<filter id="b" x="-.3" y="-.1" width="1.6" height="1.2"><feGaussianBlur stdDeviation="16 34"/></filter>'
    + `<path filter="url(#b)" fill="#000" d="M-300,3400 L${pts.join(' L')} L1300,3400 Z"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
})();
// A blurred SVG mask is re-rendered on every frame it moves (a few fps), so it is
// swapped for a bitmap blurred once, as soon as that is ready.
let wave = `url("${WAVE_SVG}")`;
const BITMAP_W = 500;
const BITMAP_H = 1500;

// The browser loads a mask image when an element first uses it, and an element whose mask
// isn't loaded yet isn't drawn at all. The cut only puts the mask on a section while it
// plays, so moving up (where the section starts fully shown) it vanished for a frame: a
// flash of the section behind. A hidden element keeps the mask in use the whole time, so
// it is always loaded when a cut starts. Not position: fixed: iOS 26 Safari colours its bars
// from a fixed element's background, and this must not take part in that.
let holder = null;
function holdWave() {
  if (!holder) {
    holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;'
      + 'visibility:hidden;pointer-events:none;';
    document.body.append(holder);
  }
  holder.style.maskImage = wave;
  holder.style.webkitMaskImage = wave;
}

async function rasteriseWave() {
  try {
    const img = new Image();
    img.src = WAVE_SVG;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = BITMAP_W;
    canvas.height = BITMAP_H;
    canvas.getContext('2d').drawImage(img, 0, 0, BITMAP_W, BITMAP_H);
    const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // decoded now, so the first cut doesn't stall on it
    const bitmap = new Image();
    bitmap.src = url;
    await bitmap.decode();
    wave = `url("${url}")`;
    holdWave();
  } catch {
    // keep the SVG mask
  }
}

function applyMask(el) {
  const size = `${el.clientWidth}px ${3 * window.innerHeight}px`;
  el.style.maskImage = wave;
  el.style.webkitMaskImage = wave;
  el.style.maskRepeat = 'repeat-x';
  el.style.webkitMaskRepeat = 'repeat-x';
  el.style.maskSize = size;
  el.style.webkitMaskSize = size;
  // the mask reaches past the box too, so the seam fill (box-shadow) isn't cut off
  el.style.maskClip = 'no-clip';
  el.style.webkitMaskClip = 'no-clip';
}

// edge: px from the top of the screen; roll: the wave's sideways drift
function moveMask(el, edge, roll, width, height) {
  const pos = `${(-roll * width).toFixed(1)}px ${(edge - height).toFixed(1)}px`;
  el.style.maskPosition = pos;
  el.style.webkitMaskPosition = pos;
}

function clearMask(el) {
  ['maskImage', 'webkitMaskImage', 'maskRepeat', 'webkitMaskRepeat', 'maskSize', 'webkitMaskSize',
    'maskPosition', 'webkitMaskPosition', 'maskClip', 'webkitMaskClip'].forEach((k) => { el.style[k] = ''; });
}

/**
 * A section's content in reading order: default content and each block's parts. Anything
 * already using `translate` for its own animation is left alone.
 * @param {Element} section
 * @returns {HTMLElement[]}
 */
function contentOf(section) {
  const items = [];
  [...section.children].forEach((wrapper) => {
    if (wrapper.classList.contains('default-content-wrapper')) {
      items.push(...wrapper.children);
      return;
    }
    const block = wrapper.querySelector(':scope > .block');
    if (block) items.push(...[...block.children].filter((el) => !el.matches(NOT_CONTENT)));
  });
  return items.filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.translate === 'none' || cs.translate === '0px') && el.getBoundingClientRect().height > 0;
  });
}

// Firefox's scroll anchoring follows translated boxes: when a cut is cleared, an anchor it picked
// in a section the cut had moved (e.g. a Cards Roller runway, still partly on screen) pulled the
// page back by that distance. Both sections stay out of anchoring while a cut runs and for two
// frames after; the count keeps a quick next cut from being released by the last one.
const unanchored = new Map();

function holdAnchoring(els) {
  els.forEach((el) => {
    unanchored.set(el, (unanchored.get(el) || 0) + 1);
    el.style.overflowAnchor = 'none';
  });
}

function releaseAnchoring(els) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    els.forEach((el) => {
      const holds = (unanchored.get(el) || 1) - 1;
      if (holds > 0) {
        unanchored.set(el, holds);
        return;
      }
      unanchored.delete(el);
      el.style.overflowAnchor = '';
    });
  }));
}

// a section's own fill, else the page's
function fillOf(el) {
  const colour = getComputedStyle(el).backgroundColor;
  const clear = !colour || colour === 'transparent' || /rgba\(.*,\s*0\)$/.test(colour);
  return clear ? getComputedStyle(document.documentElement).backgroundColor : colour;
}

/**
 * Prepares one cut between neighbouring sections.
 * @param {Element} upper
 * @param {Element} lower
 * @param {number} upperRest the scroll position the upper section rests at (its top, or the end
 *   of its runway)
 * @returns {{render: function(number): void, clear: function(): void}}
 */
function createCut(upper, lower, upperRest) {
  const sinkBy = tuning(upper, '--wave-sink');
  const zoom = sinkBy === null ? 0 : (tuning(upper, '--wave-sink-zoom') ?? SINK_ZOOM);
  const fadeBy = tuning(upper, '--wave-fade-out');
  // the covered section's full-bleed media sinks, or its content when it has none
  let sinking = [];
  if (sinkBy !== null) {
    sinking = [...upper.querySelectorAll(MEDIA)].filter((el) => !el.parentElement.closest(MEDIA));
    if (!sinking.length) sinking = [...upper.children];
  }
  // its copy (not what holds the media) fades out
  const leaving = fadeBy === null ? [] : contentOf(upper)
    .filter((el) => !sinking.some((media) => el === media || el.contains(media)));
  // the first section's hero drifts in a touch as it is covered (unless it sinks instead)
  const firstBg = upper.matches(':first-child') ? upper.querySelector('.hero > .bg') : null;
  const heroBg = sinking.includes(firstBg) ? null : firstBg;
  // the lower section paints over the upper one while both are held
  const positioned = [upper, lower].filter((el) => getComputedStyle(el).position === 'static');
  positioned.forEach((el) => { el.style.position = 'relative'; });
  holdAnchoring([upper, lower]);
  lower.style.zIndex = '2';
  upper.style.zIndex = '1';
  // both edges sit on the screen's edges at subpixel offsets: each section's fill covers the seam
  const seams = [upper, lower].map((el) => [el, el.style.boxShadow]);
  [upper, lower].forEach((el) => { el.style.boxShadow = `0 0 0 ${SEAM_PX}px ${fillOf(el)}`; });
  const distance = lower.offsetTop - upperRest;
  // measured once: reading layout after the per-frame writes would force a reflow
  const width = lower.clientWidth;
  const height = window.innerHeight;
  // what the tuned parts had inline before, put back afterwards (a block may drive them too)
  const restore = new Map();
  const keep = (el, props) => {
    restore.set(el, Object.fromEntries(props.map((k) => [k, el.style[k]])));
  };
  sinking.forEach((el) => keep(el, ['translate', 'scale', 'transformOrigin']));
  leaving.forEach((el) => keep(el, ['translate', 'opacity']));
  // the upper section rests on screen now: each sinking layer zooms about the screen's centre
  const upperShift = upperRest - window.scrollY;
  sinking.forEach((el) => {
    const r = el.getBoundingClientRect();
    const x = width / 2 - r.left;
    const y = height / 2 - r.top + upperShift;
    el.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  });
  // Own layers up front, and no CSS transitions while the cut drives these parts, or each
  // frame's value would be eased in and they would trail the page
  const layered = [upper, lower, heroBg, ...sinking, ...leaving].filter(Boolean);
  layered.forEach((el) => {
    el.style.willChange = 'translate, opacity';
    el.style.transition = 'none';
  });
  applyMask(lower);

  // p: scroll progress, which holds both sections in place; v: progress through the move's
  // time, which drives what is seen, so the cut starts with the gesture and glides through
  const render = (p, v = p) => {
    const h = height;
    const s = p * distance;
    const e = sineInOut(span(v, EDGE_START, EDGE_END));
    upper.style.translate = `0 ${s.toFixed(2)}px`;
    lower.style.translate = `0 ${(-(distance - s)).toFixed(2)}px`;
    const edge = h * (EDGE_FROM + (EDGE_TO - EDGE_FROM) * e);
    moveMask(lower, edge, (2.4 / (2 * Math.PI)) * e, width, h);
    if (heroBg) heroBg.style.scale = (1 + HERO_ZOOM * e).toFixed(4);
    if (sinking.length) {
      // sinks with the edge, so it's furthest down just as it is covered
      const k = sineInOut(span(v, EDGE_START, EDGE_END));
      const y = `0 ${(k * sinkBy * h).toFixed(2)}px`;
      const scale = (1 + zoom * k).toFixed(4);
      sinking.forEach((el) => {
        el.style.translate = y;
        el.style.scale = scale;
      });
    }
    if (leaving.length) {
      const k = powerIn(span(v, 0, FADE_OUT_END));
      const y = `0 ${(k * fadeBy).toFixed(2)}px`;
      const opacity = k > 0 ? (1 - k).toFixed(3) : '';
      leaving.forEach((el) => {
        el.style.translate = y;
        el.style.opacity = opacity;
      });
    }
  };

  const clear = () => {
    [upper, lower].forEach((el) => {
      el.style.translate = '';
      el.style.zIndex = '';
    });
    positioned.forEach((el) => { el.style.position = ''; });
    seams.forEach(([el, shadow]) => { el.style.boxShadow = shadow; });
    clearMask(lower);
    if (heroBg) heroBg.style.scale = '';
    restore.forEach((props, el) => Object.assign(el.style, props));
    layered.forEach((el) => {
      el.style.willChange = '';
      el.style.transition = '';
    });
    releaseAnchoring([upper, lower]);
  };

  return { render, clear };
}

/**
 * Plays "Wave In" cuts on the section snap's moves.
 * @param {Element} main
 */
export default function initWaveCut(main) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = [...main.querySelectorAll(':scope > .section')];
  if (!sections.some((s) => s.classList.contains(STYLE))) return;
  holdWave();
  rasteriseWave();

  // drawn on GSAP's ticker, right after the snap tween moves the page in the same frame
  const { gsap } = window;
  let running = null;
  const stop = () => {
    if (!running) return;
    if (running.tick) gsap.ticker.remove(running.tick);
    else cancelAnimationFrame(running.frame);
    running.cut.clear();
    running = null;
  };

  document.addEventListener('snap:start', ({ detail: { from, to, view } }) => {
    stop();
    const a = sections.indexOf(from);
    const b = sections.indexOf(to);
    if (a < 0 || b < 0 || Math.abs(a - b) !== 1) return;
    const upper = sections[Math.min(a, b)];
    const lower = sections[Math.max(a, b)];
    if (!lower.classList.contains(STYLE)) return;
    if ([upper, lower].some((s) => s.classList.contains('no-snap'))) return;

    // a scroll-runway section (e.g. the Cards Roller) is left from the end of its runway, as the
    // snap measures it: innerHeight grows when a phone's toolbars hide, and the section jumped
    const upperRest = upper.classList.contains('scroll-runway')
      ? upper.offsetTop + upper.offsetHeight - view
      : upper.offsetTop;
    const top = upperRest;
    const distance = lower.offsetTop - top;
    const down = b > a;
    // a move that starts where it ends (already there) would replay the cut: a flash back
    const at = (window.scrollY - top) / distance;
    if (distance <= 0 || (down ? at >= 0.99 : at <= 0.01)) return;
    const cut = createCut(upper, lower, upperRest);
    const started = performance.now();
    // the snap tween's time progress drives the cut (reversed when moving up); it is created
    // just after snap:start, so it's looked up per frame until found
    let tween = null;
    const draw = () => {
      tween = tween || gsap?.getTweensOf?.(window)?.[0] || null;
      const p = clamp((window.scrollY - top) / distance, 0, 1);
      let v = p;
      if (tween) v = down ? tween.progress() : 1 - tween.progress();
      cut.render(p, v);
      if (performance.now() - started > MAX_MS) stop();
    };
    running = {
      cut, frame: 0, tick: null, lower, width: window.innerWidth, height: lower.offsetHeight,
    };
    draw();
    if (gsap?.ticker) {
      running.tick = draw;
      gsap.ticker.add(draw);
    } else {
      const loop = () => {
        draw();
        if (running) running.frame = requestAnimationFrame(loop);
      };
      running.frame = requestAnimationFrame(loop);
    }
  });
  document.addEventListener('snap:end', stop);
  // only a real layout change ends a cut: iOS Safari resizes as its bars change, sections (100svh)
  // keep their size
  window.addEventListener('resize', () => {
    if (running && (window.innerWidth !== running.width
      || running.lower.offsetHeight !== running.height)) stop();
  });
}
