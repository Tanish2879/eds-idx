// One step per scroll gesture, for blocks that play a sequence before the page
// moves on (the About Us intro hero, the Pillars cards). The section-snap engine
// asks the block before it pages (canScrollDown/Up) and hands it the gesture
// (scrollDown/Up); see registerBlockScroll in scripts/section-snap.js.

// wheel events further apart than this start a new gesture
const GESTURE_GAP_MS = 200;
// after a step was hurried, a scroll moves the page on only once this long has
// passed (the hurried step plays out, plus a little): the rest of the same
// wheel flick (several notches) would otherwise page on as soon as it ends
const HURRY_SETTLE_MS = 1200;

/**
 * Builds the controller. A gesture that already played a step can't play
 * another, however long its momentum keeps scrolling; a new wheel burst, touch
 * or key press starts a fresh gesture.
 * @param {object} options
 * @param {number} options.count number of steps (0 … count - 1)
 * @param {function(): number} options.current the step showing now
 * @param {function(number): void} options.play plays the sequence to a step
 * @param {function(): boolean} [options.busy] true while a step still animates
 * @param {function(): boolean} [options.hurry] asked by a fresh downward
 *   gesture while a step still animates: plays the rest of the step faster
 *   and returns true if it did (the page stays; the next gesture moves on)
 * @returns {object} controller for registerBlockScroll
 */
export function createGestureStepper({
  count, current, play, busy = () => false, hurry = () => false,
}) {
  let consumed = false;
  let lastWheel = -Infinity;
  let lastMag = 0;
  // after a hurried step, the gesture that hurried it is used up for
  // HURRY_SETTLE_MS; after that, the next scroll the snap engine takes as a
  // gesture moves the page on (it already ignores trackpad momentum)
  let settling = false;
  let settleUntil = 0;

  const fresh = () => { consumed = false; };
  window.addEventListener('wheel', (e) => {
    const now = performance.now();
    const mag = Math.abs(e.deltaY);
    if (now - lastWheel > GESTURE_GAP_MS || (mag >= 10 && mag > lastMag * 1.5)) fresh();
    lastWheel = now;
    lastMag = mag;
  }, { capture: true, passive: true });
  window.addEventListener('touchstart', fresh, { capture: true, passive: true });
  window.addEventListener('keydown', fresh, { capture: true });

  const go = (to) => {
    consumed = true;
    play(to);
  };

  return {
    canScrollDown: () => current() < count - 1,
    canScrollUp: () => current() > 0,
    scrollDown: () => go(current() + 1),
    scrollUp: () => go(current() - 1),
    isBusy: () => {
      if (settling && !busy() && performance.now() >= settleUntil) {
        settling = false;
        consumed = false;
      }
      return settling || consumed || busy();
    },
    // only a new gesture, never the one (or the momentum) that started the step;
    // after it, the next scroll moves the page on once HURRY_SETTLE_MS is up
    hurryDown: () => {
      if (consumed || !hurry()) return;
      consumed = true;
      settling = true;
      settleUntil = performance.now() + HURRY_SETTLE_MS;
    },
  };
}

/**
 * Registers the stepper with the snap engine for `section`, and keeps it only
 * if the engine actually starts: `snap-settled` is set on every path once the engine has started
 * or bowed out (scripts.js; not the fallback timer's `snap-ready`),
 * `snap-active` only once the engine is live (it bows out under reduced motion
 * and in Universal Editor).
 * @param {Element} section the block's section
 * @param {object} controller from createGestureStepper
 * @param {function(): void} onInactive called if the engine doesn't start
 */
export function attachToSnap(section, controller, onInactive) {
  // the steps are driven by the snap engine, so the section must snap even if
  // it's authored with the "No Snap" style
  section.classList.remove('no-snap');
  const snap = import('../section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, controller);
    return mod;
  });
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (!root.classList.contains('snap-active')) {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      onInactive();
    }
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}
