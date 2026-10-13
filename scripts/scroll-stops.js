import { loadScript } from './aem.js';

/*
 * Eased wheel scrolling between "stops": each mouse-wheel / trackpad gesture glides to the next
 * stop with GSAP. Stops are the page top and bottom plus, for every element with
 * data-scroll-stops="<px>[ <px>…]", its top + each listed offset. Such an element can also set the
 * glide used for its own stops: data-scroll-duration (seconds) and data-scroll-ease (a GSAP ease
 * name or a CSS "cubic-bezier(x1, y1, x2, y2)"); otherwise steps take 1.8s with power2.inOut.
 * With several offsets, give one value per offset (durations separated by spaces, eases by ";").
 * data-scroll-skip-up="<index>[ <index>…]" lists offsets that only stop the page on the way down
 * (scrolling up glides past them).
 * A new gesture made while a glide is running is remembered (one step) and played as soon as the
 * glide ends, so a quick second scroll is never lost; the rest of a gesture (e.g. trackpad
 * momentum) still counts as the same gesture.
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

function toEase(ease) {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(String(ease).trim());
  if (!m) return ease;
  const v = m[1].split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : DEFAULT_GLIDE.ease;
}

// the glide for an element's i-th stop (a single value applies to all of its stops)
const glideOf = (el, i) => {
  const durations = (el.dataset.scrollDuration || '').trim().split(/\s+/).filter(Boolean);
  const eases = (el.dataset.scrollEase || '').split(';').map((e) => e.trim()).filter(Boolean);
  const pick = (list) => list[Math.min(i, list.length - 1)];
  return {
    duration: Number(pick(durations)) || DEFAULT_GLIDE.duration,
    ease: pick(eases) || DEFAULT_GLIDE.ease,
  };
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

// [{ y, glide, downOnly }] sorted by y; element stops carry their element's glide
function collectStops() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const stops = [{ y: 0, glide: null }, { y: max, glide: null }];
  document.querySelectorAll('[data-scroll-stops]').forEach((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    const skipUp = (el.dataset.scrollSkipUp || '').split(/[\s,]+/).filter(Boolean).map(Number);
    el.dataset.scrollStops.split(/[\s,]+/).map(Number).filter(Number.isFinite)
      .forEach((offset, i) => stops.push({
        y: top + offset, glide: glideOf(el, i), downOnly: skipUp.includes(i),
      }));
  });
  const byY = new Map();
  stops.forEach(({ y, glide, downOnly }) => {
    const key = Math.round(Math.min(Math.max(y, 0), max));
    const prev = byY.get(key);
    byY.set(key, {
      glide: glide || prev?.glide || null,
      downOnly: prev ? prev.downOnly && !!downOnly : !!downOnly,
    });
  });
  return [...byY].map(([y, v]) => ({ y, ...v })).sort((a, b) => a.y - b.y);
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

export default async function initScrollStops() {
  if (started || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  started = true;
  try {
    await loadGsap();
  } catch (e) {
    return; // CDN unavailable: wheel scrolling stays native
  }

  let tweening = false;
  let lastWheel = -Infinity;
  let queued = 0; // direction of a gesture made during a glide (one step), 0 = none

  const step = (direction) => {
    const y = window.scrollY;
    const stops = collectStops();
    const dest = direction > 0
      ? stops.find((s) => s.y > y + TOLERANCE)
      : stops.reverse().find((s) => s.y < y - TOLERANCE && !s.downOnly);
    if (!dest) return;
    // the glide of the stop we go to, or of the stop we leave (e.g. back up to the top)
    const from = stops.find((s) => Math.abs(s.y - y) <= TOLERANCE);
    const glide = dest.glide || from?.glide || DEFAULT_GLIDE;

    tweening = true;
    glideTo(dest.y, glide).then(() => {
      tweening = false;
      const next = queued;
      queued = 0;
      if (next) step(next);
    });
  };

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch / ctrl+wheel zoom
    if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal
    if (innerCanScroll(e.target, e.deltaY)) return;
    e.preventDefault();

    // one gesture = one step: the rest of the gesture is ignored; a new gesture during a glide is
    // queued for when it ends
    const gap = e.timeStamp - lastWheel;
    lastWheel = e.timeStamp;
    if (gap < GESTURE_GAP) return;
    const direction = Math.sign(e.deltaY);
    if (tweening) {
      queued = direction;
      return;
    }
    step(direction);
  }, { passive: false });
}
