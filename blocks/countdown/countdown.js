import { createOptimizedPicture } from '../../scripts/aem.js';

const VIDEO_RE = /\.(mp4|webm|ogv|mov)(\?.*)?$/i;

/* Max characters for the label. The authoring dialog can't hard-cap length
   (no xwalk property for it), so an over-long label is truncated on render —
   otherwise it wraps and pushes the timer down, breaking the layout. The field
   description asks authors to keep it under this limit. */
const LABEL_MAX = 50;

/* Authored launch times without a timezone are treated as IST (UTC+5:30)
   so the countdown resolves to one global instant for every visitor. */
const AUTHOR_TZ_OFFSET = '+05:30';
// matches a naive datetime (no trailing Z or ±HH:MM offset)
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

/**
 * Parses an authored launch date/time into an absolute Date.
 * A value with an explicit zone (Z or ±HH:MM) is used as-is; a naive
 * value is interpreted in the author timezone (IST) so the target is the
 * same instant worldwide.
 * @param {string} text
 * @returns {Date|null} valid Date, or null if unparseable
 */
function parseTarget(text) {
  if (!text) return null;
  const normalized = NAIVE_DATETIME_RE.test(text)
    ? `${text.replace(' ', 'T')}${AUTHOR_TZ_OFFSET}`
    : text;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Builds a muted, looping, autoplaying background video from a source URL.
 * @param {string} src
 * @returns {HTMLElement}
 */
function buildBackdropVideo(src) {
  const video = document.createElement('video');
  video.className = 'countdown-backdrop countdown-backdrop-video';
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');

  // some browsers need an explicit play() once data is ready
  const tryPlay = () => { const p = video.play(); if (p) p.catch(() => {}); };

  // the source (and with it the download) is only added once the countdown comes on screen, so
  // the video doesn't compete with the first screen on mobile
  const addSource = () => {
    const source = document.createElement('source');
    source.src = src;
    const ext = src.split('.').pop().split('?')[0].toLowerCase();
    source.type = ext === 'webm' ? 'video/webm' : 'video/mp4';
    video.addEventListener('loadeddata', tryPlay, { once: true });
    video.append(source);
    // WebKit needs an explicit load for a late-added source
    video.load();
  };
  if (!('IntersectionObserver' in window)) {
    addSource();
  } else {
    // the backdrop bleeds past its section (blur), so a sliver of it is already on the first
    // screen: it counts as on screen once it's past the bottom 15% of the viewport
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      addSource();
    }, { rootMargin: '0px 0px -15% 0px' });
    observer.observe(video);
  }

  return video;
}

/**
 * Live countdown timer ("BLURRED OUT Motion" — JSW Motors).
 * Expected authored structure (rows, order-independent):
 *   - a row with an image → blurred motion backdrop (optional)
 *   - a row linking a video (.mp4/.webm) → looping video backdrop (optional;
 *     always takes priority over an image, whatever the authored row order)
 *   - a row that parses as a date → target date/time
 *   - any other text row → label (e.g. "Soon has a date now")
 * Falls back to ~22 days out if no valid target date is authored.
 *
 * Interactions / animation:
 *   - label + timer fade/scale in on first paint
 *   - each digit pulses when its value changes
 *   - backdrop (image or video) drifts slowly behind the digits
 *   - all motion is disabled under prefers-reduced-motion
 * @param {Element} block
 */
export default function decorate(block) {
  // Stable anchor id for in-page links (e.g. #countdown); only set once per page.
  if (!document.getElementById('countdown')) block.id = 'countdown';

  const rows = [...block.children];
  let label = 'Soon has a date now';
  let targetText = '';
  let imageBackdrop = null;
  let videoSrc = '';

  rows.forEach((row) => {
    const img = row.querySelector('img');
    if (img) {
      // Guard: a video wrongly uploaded into the image field can arrive as an
      // <img> with a video src — route it to the video backdrop rather than
      // handing createOptimizedPicture a URL it can't render.
      if (VIDEO_RE.test(img.src)) {
        videoSrc = img.src;
        return;
      }
      const pic = createOptimizedPicture(img.src, img.alt || '', false, [
        { media: '(min-width: 600px)', width: '1600' },
        { width: '750' },
      ]);
      pic.classList.add('countdown-backdrop');
      imageBackdrop = pic;
      return;
    }
    // a linked (or bare-text) video URL becomes a looping video backdrop
    const link = row.querySelector('a[href]');
    const href = link ? link.getAttribute('href') : row.textContent.trim();
    if (href && VIDEO_RE.test(href)) {
      videoSrc = href;
      return;
    }
    const text = row.textContent.trim();
    if (!text) return;
    // A row that parses as a date is the target; otherwise it's the label.
    if (parseTarget(text)) targetText = text;
    else label = text;
  });

  // A background video always wins over a background image, regardless of the
  // order the rows were authored in.
  const backdrop = videoSrc ? buildBackdropVideo(videoSrc) : imageBackdrop;

  const target = parseTarget(targetText)
    || new Date(Date.now() + 22 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000);

  const units = ['days', 'hours', 'minutes', 'seconds'];
  // short visible captions per the design; the full unit name stays for screen readers
  const unitLabels = {
    days: 'Day', hours: 'hrs', minutes: 'min', seconds: 'sec',
  };
  const timer = document.createElement('div');
  timer.className = 'countdown-timer';
  const valueEls = {};

  units.forEach((unit, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'countdown-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = ':';
      timer.append(sep);
    }
    const wrap = document.createElement('div');
    wrap.className = 'countdown-unit';
    const value = document.createElement('b');
    value.textContent = '00';
    const name = document.createElement('span');
    name.className = 'countdown-unit-name';
    name.textContent = unit;
    const caption = document.createElement('span');
    caption.className = 'countdown-unit-label';
    caption.setAttribute('aria-hidden', 'true');
    caption.textContent = unitLabels[unit];
    wrap.append(caption, value, name);
    timer.append(wrap);
    valueEls[unit] = value;
  });

  const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Update a digit only when it changes, and pulse it when it does.
  const setValue = (el, next) => {
    if (el.textContent === next) return;
    el.textContent = next;
    if (reduceMotion) return;
    el.classList.remove('is-ticking');
    // force reflow so the animation can retrigger
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add('is-ticking');
  };

  const tick = () => {
    const diff = target.getTime() - Date.now();
    const s = Math.max(0, Math.floor(diff / 1000));
    setValue(valueEls.days, pad(Math.floor(s / 86400)));
    setValue(valueEls.hours, pad(Math.floor((s % 86400) / 3600)));
    setValue(valueEls.minutes, pad(Math.floor((s % 3600) / 60)));
    setValue(valueEls.seconds, pad(s % 60));
    return s;
  };

  const labelEl = document.createElement('p');
  labelEl.className = 'countdown-label';
  // Cap length so an over-long label can't wrap and shove the timer off-screen.
  labelEl.textContent = label.length > LABEL_MAX
    ? `${label.slice(0, LABEL_MAX).trimEnd()}…`
    : label;

  const content = [];
  if (backdrop) content.push(backdrop);
  content.push(labelEl, timer);
  block.replaceChildren(...content);

  // Entrance animation once the block scrolls into view.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        block.classList.add('is-visible');
        obs.disconnect();
      });
    }, { threshold: 0.25 });
    io.observe(block);
  } else {
    block.classList.add('is-visible');
  }

  tick();
  const interval = setInterval(() => {
    if (tick() <= 0) clearInterval(interval);
  }, 1000);
  // Stop ticking if the block is removed from the DOM.
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
}
