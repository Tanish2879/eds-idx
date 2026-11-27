// Sound for a section's videos: silent while the section is scrolled to or from, then rising
// from silence once it has settled on screen.

// the wait after the section settles, then the fade from silence
const SETTLE_MS = 400;
const FADE_MS = 1500;

const frames = new WeakMap();

/**
 * Turns a video's sound on (rising from silence) or off at once.
 * @param {HTMLVideoElement} video
 * @param {boolean} audible
 */
export function setAudible(video, audible) {
  cancelAnimationFrame(frames.get(video));
  video.muted = !audible;
  if (!audible) {
    video.setAttribute('muted', '');
    video.volume = 0;
    return;
  }
  video.removeAttribute('muted');
  video.volume = 0;
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / FADE_MS);
    video.volume = k * k;
    if (k < 1) frames.set(video, requestAnimationFrame(step));
  };
  frames.set(video, requestAnimationFrame(step));
}

/**
 * Reports when the block is settled: mostly on screen with no page snap moving, for a moment.
 * @param {Element} block
 * @param {Function} onChange called with true or false whenever that changes
 */
export function trackSettled(block, onChange) {
  let inView = false;
  let moving = false;
  let settled = false;
  let timer;
  const set = (value) => {
    if (value === settled) return;
    settled = value;
    onChange(value);
  };
  const check = () => {
    clearTimeout(timer);
    if (inView && !moving) timer = setTimeout(() => set(true), SETTLE_MS);
    else set(false);
  };
  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio >= 0.6;
    check();
  }, { threshold: [0, 0.6] }).observe(block);
  document.addEventListener('snap:start', () => { moving = true; check(); });
  document.addEventListener('snap:end', () => { moving = false; check(); });
}
