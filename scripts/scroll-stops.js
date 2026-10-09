import { loadScript } from './aem.js';

/*
 * Eased wheel scrolling between "stops": each mouse-wheel / trackpad gesture glides to the next
 * stop with GSAP (power2.inOut, 1.8s). Stops are the page top and bottom plus, for every element
 * with data-scroll-stops="<px>[ <px>…]", its top + each listed offset.
 * Touch, keyboard and scrollbar scrolling stay native; nothing happens with reduced motion.
 * GSAP (+ ScrollToPlugin) is loaded from the CDN only when this is first used.
 */

const GSAP_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
const SCROLL_TO_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollToPlugin.min.js';
const DURATION = 1.8; // seconds per step
const GESTURE_GAP = 150; // ms without wheel events that separates two gestures
const TOLERANCE = 2; // px: a scroll position this close to a stop counts as "at" it

let started = false;

function collectStops() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const stops = [0, max];
  document.querySelectorAll('[data-scroll-stops]').forEach((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    el.dataset.scrollStops.split(/[\s,]+/).map(Number).filter(Number.isFinite)
      .forEach((offset) => stops.push(top + offset));
  });
  const clamped = stops.map((s) => Math.round(Math.min(Math.max(s, 0), max)));
  return [...new Set(clamped)].sort((a, b) => a - b);
}

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

export default async function initScrollStops() {
  if (started || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  started = true;
  try {
    await loadScript(GSAP_SRC);
    await loadScript(SCROLL_TO_SRC);
  } catch (e) {
    return; // CDN unavailable: wheel scrolling stays native
  }
  const { gsap, ScrollToPlugin } = window;
  if (!gsap || !ScrollToPlugin) return;
  gsap.registerPlugin(ScrollToPlugin);

  let tweening = false;
  let lastWheel = -Infinity;
  const done = () => { tweening = false; };

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch / ctrl+wheel zoom
    if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal
    if (innerCanScroll(e.target, e.deltaY)) return;
    e.preventDefault();

    // one gesture = one step: ignore the rest of the gesture and wheels during a tween
    const gap = e.timeStamp - lastWheel;
    lastWheel = e.timeStamp;
    if (tweening || gap < GESTURE_GAP) return;

    const y = window.scrollY;
    const stops = collectStops();
    const destY = e.deltaY > 0
      ? stops.find((s) => s > y + TOLERANCE)
      : stops.reverse().find((s) => s < y - TOLERANCE);
    if (destY === undefined) return;

    tweening = true;
    gsap.to(window, {
      duration: DURATION,
      scrollTo: { y: destY, autoKill: true, onAutoKill: done },
      ease: 'power2.inOut',
      overwrite: 'auto',
      onComplete: done,
      onInterrupt: done,
    });
  }, { passive: false });
}
