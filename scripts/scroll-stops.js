import { loadScript } from './aem.js';

/*
 * Eased wheel scrolling between "stops": each mouse-wheel / trackpad gesture glides to the next
 * stop with GSAP. Stops are the page top and bottom plus, for every element with
 * data-scroll-stops="<px>[ <px>…]", its top + each listed offset. Such an element can also set the
 * glide used for its own stops: data-scroll-duration (seconds) and data-scroll-ease (a GSAP ease
 * name or a CSS "cubic-bezier(x1, y1, x2, y2)"); otherwise steps take 1.8s with power2.inOut.
 * With several offsets, give one value per offset (durations separated by spaces, eases by ";").
 * data-scroll-skip-up="<index>[ <index>…]" lists offsets that only stop the page on the way down
 * (scrolling up glides past them); data-scroll-auto="<index>[ <index>…]" lists offsets the page
 * glides on from by itself after reaching them on the way down (so one gesture moves a whole
 * section, through its in-between stages, each with its own glide).
 * A new gesture made while a glide is running is remembered (one step) and played after a short
 * rest on the stop reached, so a quick second scroll is never lost and every stop is seen to hold;
 * the rest of a gesture (e.g. trackpad momentum) still counts as the same gesture, and a gesture
 * only counts once it has moved MIN_GESTURE px (light touches are ignored).
 * Touch, keyboard and scrollbar scrolling stay native; nothing happens with reduced motion.
 * GSAP (+ ScrollToPlugin) is loaded from the CDN only when this is first used; blocks with
 * scroll-linked animations can load ScrollTrigger with it (loadScrollTrigger).
 */

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist';
const GSAP_SRC = `${GSAP_CDN}/gsap.min.js`;
const SCROLL_TO_SRC = `${GSAP_CDN}/ScrollToPlugin.min.js`;
const SCROLL_TRIGGER_SRC = `${GSAP_CDN}/ScrollTrigger.min.js`;
const DEFAULT_GLIDE = { duration: 1.8, ease: 'power2.inOut' };
const GESTURE_GAP = 150; // ms without wheel events that separates two gestures
const TOLERANCE = 2; // px: a scroll position this close to a stop counts as "at" it
const REST = 450; // ms on a stop before a gesture made during the glide is played
const MIN_GESTURE = 24; // px of wheel movement before a gesture counts (ignores light touches)
const MERGE = 24; // px: stops closer than this count as one

let started = false;
let gsapReady;

function loadGsap() {
  if (!gsapReady) {
    gsapReady = (async () => {
      await loadScript(GSAP_SRC);
      await loadScript(SCROLL_TO_SRC);
      const { gsap, ScrollToPlugin } = window;
      if (!gsap || !ScrollToPlugin) throw new Error('GSAP unavailable');
      gsap.registerPlugin(ScrollToPlugin);
      return gsap;
    })();
  }
  return gsapReady;
}

let scrollTriggerReady;

/**
 * Loads GSAP with its ScrollTrigger plugin (same CDN version as the wheel scroller).
 * @returns {Promise<{gsap: object, ScrollTrigger: object}>}
 */
export function loadScrollTrigger() {
  if (!scrollTriggerReady) {
    scrollTriggerReady = (async () => {
      const gsap = await loadGsap();
      await loadScript(SCROLL_TRIGGER_SRC);
      const { ScrollTrigger } = window;
      if (!ScrollTrigger) throw new Error('ScrollTrigger unavailable');
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    })();
  }
  return scrollTriggerReady;
}

// a CSS cubic-bezier() as an easing function (progress → eased progress), for GSAP and blocks
export function cubicBezier(x1, y1, x2, y2) {
  const at = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < x) lo = mid; else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
}

// a CSS linear() easing ("linear(0, 0.74 91%, 1)": output values, optionally at input %) as a
// function; points without a % are spread evenly between their neighbours
export function linearEase(spec) {
  const points = spec.split(',').map((part) => {
    const [value, at] = part.trim().split(/\s+/);
    return { y: Number(value), x: at ? parseFloat(at) / 100 : null };
  });
  if (points.length < 2 || points.some((pt) => !Number.isFinite(pt.y))) return null;
  points[0].x ??= 0;
  points[points.length - 1].x ??= 1;
  for (let i = 1; i < points.length - 1; i += 1) {
    if (points[i].x == null) {
      let j = i + 1;
      while (points[j].x == null) j += 1;
      const prev = points[i - 1].x;
      points[i].x = prev + (points[j].x - prev) / (j - i + 1);
    }
  }
  return (t) => {
    if (t <= 0) return points[0].y;
    if (t >= 1) return points[points.length - 1].y;
    const k = points.findIndex((pt) => pt.x >= t);
    const a = points[k - 1];
    const b = points[k];
    return a.y + ((b.y - a.y) * (t - a.x)) / ((b.x - a.x) || 1);
  };
}

function toEase(ease) {
  const text = String(ease).trim();
  const lin = /^linear\(([^)]+)\)$/.exec(text);
  if (lin) return linearEase(lin[1]) || DEFAULT_GLIDE.ease;
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(text);
  if (!m) return ease;
  const v = m[1].split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : DEFAULT_GLIDE.ease;
}

// the glide for an element's i-th stop (a single value applies to all of its stops)
// (data-scroll-duration-up / data-scroll-ease-up: the glide for leaving the stop upwards, when it
// should differ from playing its own glide back)
const glideOf = (el, i) => {
  const list = (name, sep) => (el.dataset[name] || '').split(sep)
    .map((e) => e.trim()).filter(Boolean);
  const pick = (values) => values[Math.min(i, values.length - 1)];
  const duration = Number(pick(list('scrollDuration', /\s+/))) || DEFAULT_GLIDE.duration;
  const ease = pick(list('scrollEase', ';')) || DEFAULT_GLIDE.ease;
  const upDuration = Number(pick(list('scrollDurationUp', /\s+/)));
  const upEase = pick(list('scrollEaseUp', ';'));
  const up = upDuration || upEase
    ? { duration: upDuration || duration, ease: upEase || ease }
    : null;
  return { duration, ease, up };
};

// an element under the pointer that can still scroll in the wheel's direction keeps the wheel
function innerCanScroll(target, deltaY) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el);
    if (/auto|scroll|overlay/.test(overflowY) && el.scrollHeight > el.clientHeight) {
      const canScroll = deltaY > 0
        ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
        : el.scrollTop > 0;
      if (canScroll) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/*
 * The element's top in the document as laid out, ignoring position: sticky (a pinned element, or
 * one inside a pinned section, reports where it is stuck, not where it sits in the page) and
 * transforms: any sticky element in its ancestry is unpinned for the measurement and restored at
 * once (same frame), and the top is summed from layout offsets.
 */
function naturalTop(el) {
  const stuck = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === 'sticky') {
      stuck.push([n, n.style.getPropertyValue('position'), n.style.getPropertyPriority('position')]);
      n.style.setProperty('position', 'static', 'important'); // static: its top inset doesn't count
    }
  }
  // layout offsets (not the on-screen box): transforms such as a section's rise scale don't count
  let top = 0;
  for (let n = el; n; n = n.offsetParent) top += n.offsetTop;
  stuck.forEach(([n, value, priority]) => {
    if (value) n.style.setProperty('position', value, priority);
    else n.style.removeProperty('position');
  });
  return top;
}

// [{ y, glide, downOnly, auto }] sorted by y; element stops carry their element's glide
function collectStops() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const stops = [{ y: 0, glide: null }, { y: max, glide: null }];
  document.querySelectorAll('[data-scroll-stops]').forEach((el) => {
    const top = naturalTop(el);
    const list = (name) => (el.dataset[name] || '').split(/[\s,]+/).filter(Boolean).map(Number);
    const skipUp = list('scrollSkipUp');
    const auto = list('scrollAuto');
    el.dataset.scrollStops.split(/[\s,]+/).map(Number).filter(Number.isFinite)
      .forEach((offset, i) => stops.push({
        y: top + offset,
        glide: glideOf(el, i),
        downOnly: skipUp.includes(i),
        auto: auto.includes(i),
      }));
  });
  const byY = new Map();
  stops.forEach(({
    y, glide, downOnly, auto,
  }) => {
    const key = Math.round(Math.min(Math.max(y, 0), max));
    const prev = byY.get(key);
    byY.set(key, {
      glide: glide || prev?.glide || null,
      downOnly: prev ? prev.downOnly && !!downOnly : !!downOnly,
      auto: !!auto || !!prev?.auto,
    });
  });
  // stops closer than MERGE px are one stop (e.g. a section top measured a few px apart from where
  // the previous section's stop puts it): the later one is kept, with whichever glide is set
  const sorted = [...byY].map(([y, v]) => ({ y, ...v })).sort((a, b) => a.y - b.y);
  return sorted.reduce((list, stop) => {
    const prev = list[list.length - 1];
    if (prev && stop.y - prev.y < MERGE) {
      list[list.length - 1] = {
        ...stop,
        glide: stop.glide || prev.glide,
        downOnly: stop.downOnly && prev.downOnly,
        auto: stop.auto || prev.auto,
      };
    } else list.push(stop);
    return list;
  }, []);
}

/**
 * Glides the window to a scroll position (GSAP; falls back to native smooth scrolling).
 * @param {number} y target scroll position
 * @param {{duration?: number, ease?: string}} [glide]
 * @returns {Promise<void>} resolves when the glide ends (or is interrupted)
 */
export async function glideTo(y, glide = DEFAULT_GLIDE) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, y);
    return;
  }
  let gsap;
  try {
    gsap = await loadGsap();
  } catch (e) {
    window.scrollTo({ top: y, behavior: 'smooth' });
    return;
  }
  await new Promise((resolve) => {
    gsap.to(window, {
      duration: glide.duration ?? DEFAULT_GLIDE.duration,
      scrollTo: { y, autoKill: true, onAutoKill: resolve },
      ease: toEase(glide.ease ?? DEFAULT_GLIDE.ease),
      overwrite: 'auto',
      onComplete: resolve,
      onInterrupt: resolve,
    });
  });
}

export default function initScrollStops() {
  if (started || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  started = true;
  // GSAP is fetched when the browser is idle where a mouse / trackpad is available, and otherwise
  // only at the first wheel event: touch-only phones scroll natively and never load it for this.
  // If the CDN is unavailable, wheel scrolling stays native
  let native = false;
  const ready = () => loadGsap().catch(() => { native = true; });
  if (window.matchMedia('(any-pointer: fine)').matches) {
    if (window.requestIdleCallback) window.requestIdleCallback(ready, { timeout: 2000 });
    else setTimeout(ready, 500);
  }

  let tweening = false;
  let lastWheel = -Infinity;
  let travel = 0; // wheel movement in the current gesture, before it counts
  let counted = false; // the current gesture has already made its step (or been queued)
  let queued = 0; // direction of a gesture made during a glide (one step), 0 = none

  const step = (direction) => {
    const y = window.scrollY;
    const stops = collectStops();
    const dest = direction > 0
      ? stops.find((s) => s.y > y + TOLERANCE)
      : stops.reverse().find((s) => s.y < y - TOLERANCE && !s.downOnly);
    if (!dest) return;
    // down: the glide of the stop we go to; up: the glide of the stop we leave (the step being
    // undone, played back), falling back to the other
    const from = stops.find((s) => Math.abs(s.y - y) <= TOLERANCE);
    const glide = (direction > 0
      ? dest.glide || from?.glide
      : from?.glide?.up || from?.glide || dest.glide) || DEFAULT_GLIDE;

    tweening = true;
    glideTo(dest.y, glide).then(() => {
      // an in-between stage on the way down: carry on to the next stop by itself
      if (!queued && direction > 0 && dest.auto && Math.abs(window.scrollY - dest.y) <= TOLERANCE) {
        tweening = false;
        step(1);
        return;
      }
      // a gesture made during the glide plays after a short rest on this stop (so every stop
      // is seen to hold); more gestures meanwhile just keep the latest direction
      if (queued) {
        setTimeout(() => {
          tweening = false;
          const next = queued;
          queued = 0;
          if (next) step(next);
        }, REST);
        return;
      }
      tweening = false;
    });
  };

  window.addEventListener('wheel', (e) => {
    if (native || e.ctrlKey) return; // (ctrl: pinch / ctrl+wheel zoom)
    ready();
    if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal
    if (innerCanScroll(e.target, e.deltaY)) return;
    e.preventDefault();

    // one gesture = one step, once it has moved far enough to be deliberate (a mouse-wheel notch
    // counts at once; a light trackpad touch does not); the rest of the gesture is ignored. A
    // gesture during a glide is queued for after it (see step)
    const gap = e.timeStamp - lastWheel;
    lastWheel = e.timeStamp;
    if (gap >= GESTURE_GAP) {
      travel = 0;
      counted = false;
    }
    if (counted) return;
    const unit = [1, 16, window.innerHeight][e.deltaMode] || 1; // pixels / lines / pages
    travel += e.deltaY * unit;
    if (Math.abs(travel) < MIN_GESTURE) return;
    counted = true;
    const direction = Math.sign(travel);
    if (tweening) {
      queued = direction;
      return;
    }
    step(direction);
  }, { passive: false });
}
