import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/utils/common.js';

// background media that is a video rather than an image; only MP4 is played,
// any other video format is ignored (and not shown)
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
const MP4_RE = /\.mp4(\?|#|$)/i;

// "Value — Label" separator: an em/en dash, or a hyphen only when spaced, so
// values like "1.1-2 GW" aren't split
const STAT_SEP = /\s*[—–]\s*|\s+-\s+/;

// more stats than this switch the readout card to a compact type scale
const COMPACT_AFTER = 2;

// share of the block that must be visible before the panel opens on its own
const AUTO_EXPAND_AT = 0.5;

// stacked over a cards carousel: length of the slide-up reveal (matches the
// .is-stats-revealed transition in the CSS) and the wheel quiet time that
// starts a new gesture
const REVEAL_MS = 1200;
const GESTURE_GAP_MS = 200;
// re-snap for drift picked up while the step played
const SETTLE_MS = 250;
// entrance after the layer is up: title first, then the panel
const TITLE_DELAY_MS = 100;
const PANEL_DELAY_MS = 450;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// UI strings, overridable per locale via placeholders.json keys
const LABELS = {
  knowMore: { key: 'stats-production-know-more', text: 'Know More' },
  hide: { key: 'stats-production-hide-details', text: 'Dismiss production details' },
};

/**
 * Builds a muted, looping background video that plays only while the section is
 * in view (autoplay on scroll). Mirrors the countdown block's backdrop video.
 * @param {string} src
 * @returns {HTMLVideoElement}
 */
function buildBackdropVideo(src) {
  const video = document.createElement('video');
  video.className = 'stats-production-bg stats-production-bg-video';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  // fetch only metadata up front; the file streams once it scrolls into view
  video.preload = 'metadata';
  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');

  const source = document.createElement('source');
  source.src = src;
  source.type = 'video/mp4';
  video.append(source);

  // Autoplay on scroll: play when the section enters the viewport, pause when
  // it leaves. prefers-reduced-motion keeps it paused (poster frame only).
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tryPlay = () => { const p = video.play(); if (p) p.catch(() => {}); };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !reduce) tryPlay();
      else video.pause();
    });
  }, { threshold: 0.25 });
  // observe once connected
  requestAnimationFrame(() => io.observe(video));

  return video;
}

/**
 * Builds the inner-snap controller for a section holding a cards carousel and
 * this block: the first gesture down slides the block up over the carousel
 * (scaling in to full size), the next one moves on to the next section; up
 * reverses it. One gesture plays at most one step.
 * @param {Element} section the shared section
 * @param {Element} layer the stats-production wrapper laid over the section
 * @param {Element} under the carousel wrapper it covers
 * @param {Element} block the stats-production block (for its entrance)
 * @param {function} autoOpen opens the panel the first time it's revealed
 * @returns {object} controller for section-snap's registerBlockScroll
 */
function createRevealStepper(section, layer, under, block, autoOpen) {
  let revealed = false;
  let busyUntil = 0;
  // a gesture that already played the reveal can't also advance the page,
  // however long its momentum keeps scrolling
  let consumed = false;
  let lastWheel = -Infinity;
  let lastMag = 0;

  const fresh = () => { consumed = false; };
  window.addEventListener('wheel', (e) => {
    const now = performance.now();
    const mag = Math.abs(e.deltaY);
    // a pause starts a new gesture; so does a surge in speed, but only once
    // the step has finished: a swipe still ramps up just after it triggers
    const quiet = now - lastWheel > GESTURE_GAP_MS;
    const surge = now >= busyUntil && mag >= 10 && mag > lastMag * 1.5;
    if (quiet || surge) fresh();
    lastWheel = now;
    lastMag = mag;

    // The step doesn't move the page, so nothing re-snaps it, and wheel input
    // section-snap reads as sideways (trackpad swipes drift) scrolls natively a
    // pixel or two at a time. Nothing in this section scrolls on its own, so
    // stop native wheel scrolling while it's the active section.
    const onSection = Math.abs(window.scrollY - section.offsetTop) < window.innerHeight / 2;
    if (onSection && e.cancelable && !e.ctrlKey && section.contains(e.target)) e.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener('touchstart', fresh, { capture: true, passive: true });
  window.addEventListener('keydown', fresh, { capture: true });

  // Safety net for any drift that still got in: ease the page back onto the
  // section's stop as the layer rises (and settle once it's up). Not on the
  // way back down, where the carousel is in view and would visibly move.
  let frame = 0;
  const align = (duration) => {
    cancelAnimationFrame(frame);
    const startY = window.scrollY;
    const endY = section.offsetTop;
    if (Math.abs(endY - startY) < 0.5) return;
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      window.scrollTo(0, startY + (endY - startY) * easeInOut(k));
      frame = k < 1 ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  };
  // Entrance once the layer is full screen: the title slides up into place,
  // then the panel (or the Know More pill) rises from the bottom. Both park
  // off screen again once the layer is back down, so every reveal replays it.
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const park = () => block.classList.add('is-intro-title', 'is-intro-panel');
  park();

  const setRevealed = (on) => {
    revealed = on;
    consumed = true;
    busyUntil = performance.now() + REVEAL_MS;
    section.classList.toggle('is-stats-revealed', on);
    // only the visible layer is reachable by keyboard / assistive tech
    layer.inert = !on;
    under.inert = on;
    timers.splice(0).forEach(clearTimeout);
    if (on) {
      // first reveal: open the panel now, straight into its parked spot below
      // the edge, so the entrance below slides it up
      autoOpen();
      align(REVEAL_MS);
      later(REVEAL_MS, () => align(SETTLE_MS));
      later(REVEAL_MS + TITLE_DELAY_MS, () => block.classList.remove('is-intro-title'));
      later(REVEAL_MS + PANEL_DELAY_MS, () => block.classList.remove('is-intro-panel'));
    } else {
      cancelAnimationFrame(frame);
      later(REVEAL_MS, park);
    }
  };

  return {
    canScrollDown: () => !revealed,
    canScrollUp: () => revealed,
    scrollDown: () => setRevealed(true),
    scrollUp: () => setRevealed(false),
    isBusy: () => consumed || performance.now() < busyUntil,
  };
}

/**
 * When the block shares its section with a cards carousel, lay it over the
 * carousel and reveal it with an inner snap step (see createRevealStepper).
 * Without the snap engine the section free-scrolls with the two blocks
 * stacked; reduced motion and Universal Editor stack them too (their section
 * styles already size sections to content).
 * @param {Element} block
 * @param {function} autoOpen opens the panel (once) when the layer is up
 * @param {function} startAutoOpen the standalone auto-open, used if the
 *   reveal falls back to stacked blocks
 * @returns {boolean} true when the block is laid over the carousel
 */
function wireCarouselReveal(block, autoOpen, startAutoOpen) {
  const section = block.closest('.section');
  const layer = block.closest('.stats-production-wrapper');
  const carousel = section?.querySelector('.cards.carousel');
  if (!section || !layer || !carousel) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (document.querySelector('[data-aue-resource]')) return false;

  const under = carousel.closest('.cards-wrapper') || carousel;
  section.classList.add('has-stats-reveal');
  section.classList.remove('no-snap');
  layer.inert = true;
  // the layer is absolute + clipped, which section-snap reads as a floating
  // overlay (and stops paging over it); it's page content, so opt it out
  layer.dataset.snapPassthrough = '';

  // Register straight away (a gesture made while the engine loads already
  // steps), then keep it only if the engine starts: `snap-ready` is set on
  // every path, `snap-active` only once it's live (as in the editorial hero).
  const snap = import('../../scripts/section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, createRevealStepper(section, layer, under, block, autoOpen));
    return mod;
  });
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-ready')) return false;
    if (!root.classList.contains('snap-active')) {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      section.classList.remove('has-stats-reveal', 'is-stats-revealed');
      section.classList.add('no-snap');
      block.classList.remove('is-intro-title', 'is-intro-panel');
      layer.inert = false;
      under.inert = false;
      delete layer.dataset.snapPassthrough;
      startAutoOpen();
    }
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  return true;
}

/**
 * Stats / production block — "Engineered for what's ahead".
 *
 * A full-bleed factory backdrop (image OR autoplay-on-scroll video) with a
 * heading and a frosted-glass panel holding a live-production readout, a plant
 * photo with a location caption, and a "First build" badge. The panel starts
 * collapsed behind a "Know more" pill; clicking it expands the panel, and the
 * close (✕) button collapses it again. The heading stays visible throughout.
 *
 * Expected authored structure (rows), matching the stats-production model
 * (image, content, stats, plantImage):
 *   row 1: background image OR video link              -> section backdrop
 *   row 2: heading + eyebrow <p> + badge <p> + optional location <p> (richtext)
 *   row 3: stats richtext, one <p> per stat "Value — Label"
 *   row 4: plant image
 * (A legacy two-column [value][label] stat row is still accepted.)
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];

  let bg = null;
  let bgVideoSrc = '';
  let backdropTaken = false;
  let heading = null;
  let eyebrow = null;
  let plant = null;
  let location = null;
  let badge = null;
  const stats = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    const img = row.querySelector('img');
    const link = row.querySelector('a[href]');
    const h = row.querySelector('h1, h2, h3, h4, h5, h6');
    const text = row.textContent.trim();

    // a linked (or bare-text) video URL in the first row is the backdrop video
    const videoHref = (link && VIDEO_RE.test(link.getAttribute('href')) && link.getAttribute('href'))
      || (!img && !h && VIDEO_RE.test(text) && text);

    // A non-MP4 video still takes the backdrop slot (left empty), so the plant
    // photo in a later row isn't promoted to the backdrop instead.
    if (!backdropTaken && videoHref) {
      backdropTaken = true;
      if (MP4_RE.test(videoHref)) bgVideoSrc = videoHref;
    } else if (img && VIDEO_RE.test(img.src) && !backdropTaken) {
      // a video uploaded into the image field arrives as an <img> with a video src
      backdropTaken = true;
      if (MP4_RE.test(img.src)) bgVideoSrc = img.src;
    } else if (img && cells.length === 1 && !text) {
      // image-only row: the first is the backdrop, a later one is the plant photo
      const isBackdrop = !backdropTaken;
      const pic = createOptimizedPicture(img.src, img.alt || '', isBackdrop, isBackdrop
        ? [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]
        : [{ width: '600' }]);
      moveInstrumentation(img, pic.querySelector('img'));
      if (isBackdrop) {
        bg = pic;
        backdropTaken = true;
      } else {
        plant = pic;
      }
    } else if (img) {
      // image + caption (plant photo with location string)
      const pic = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '600' }]);
      moveInstrumentation(img, pic.querySelector('img'));
      plant = pic;
      const cap = cells.find((c) => !c.querySelector('img') && c.textContent.trim());
      if (cap) location = cap.textContent.trim();
    } else if (h) {
      // combined content cell: <h2> heading + eyebrow <p> + badge <p>
      if (h.textContent.trim()) {
        heading = document.createElement('h2');
        heading.append(...h.childNodes);
        heading.className = 'stats-production-heading';
      }
      const paras = [...row.querySelectorAll('p')].filter((p) => p.textContent.trim());
      if (paras[0]) eyebrow = paras[0].textContent.trim();
      if (paras[1]) badge = paras[1].textContent.trim();
      // optional 3rd paragraph: plant location caption (e.g. "Sambhajinagar, MH ...")
      if (paras[2] && !location) location = paras[2].textContent.trim();
    } else if (cells.length >= 2 && cells[0].textContent.trim() && cells[1].textContent.trim()) {
      // legacy two-column stat row: [value] [label]
      stats.push({ value: cells[0].textContent.trim(), label: cells[1].textContent.trim() });
    } else if (!stats.length && [...row.querySelectorAll('p')].some((p) => STAT_SEP.test(p.textContent))) {
      // stats cell: one paragraph per stat, "Value — Label"
      [...row.querySelectorAll('p')].forEach((p) => {
        const raw = p.textContent.trim();
        if (!raw) return;
        const [value, ...rest] = raw.split(STAT_SEP);
        stats.push({ value: value.trim(), label: rest.join(' - ').trim() });
      });
    } else if (text && !videoHref) {
      // fallback single-text rows: first is the eyebrow, the next the badge
      if (!eyebrow) eyebrow = text;
      else if (!badge) badge = text;
    }
  });

  // ---- build DOM ----
  const children = [];

  if (bgVideoSrc) {
    children.push(buildBackdropVideo(bgVideoSrc));
  } else if (bg) {
    bg.classList.add('stats-production-bg');
    children.push(bg);
  }

  const inner = document.createElement('div');
  inner.className = 'stats-production-inner';

  if (heading) inner.append(heading);
  children.push(inner);

  // Only what's authored is rendered: an empty card, the badge, or the whole
  // panel (with its Know More / close toggle) are left out entirely, so they
  // take no space. No placeholder copy stands in for missing content.
  const cards = [];
  const readout = document.createElement('div');
  readout.className = 'stats-production-readout';

  if (eyebrow) {
    const eye = document.createElement('p');
    eye.className = 'stats-production-eyebrow';
    const dot = document.createElement('span');
    dot.className = 'stats-production-dot';
    dot.setAttribute('aria-hidden', 'true');
    eye.append(dot, document.createTextNode(eyebrow));
    readout.append(eye);
  }

  if (stats.length) {
    const list = document.createElement('dl');
    list.className = 'stats-production-stats';
    stats.forEach((s) => {
      if (s.value) {
        const dt = document.createElement('dt');
        dt.textContent = s.value;
        list.append(dt);
      }
      if (s.label) {
        const dd = document.createElement('dd');
        dd.textContent = s.label;
        list.append(dd);
      }
    });
    if (list.children.length) {
      readout.append(list);
      readout.classList.toggle('is-compact', stats.length > COMPACT_AFTER);
    }
  }

  if (readout.children.length) cards.push(readout);

  if (plant) {
    const media = document.createElement('div');
    media.className = 'stats-production-media';
    media.append(plant);
    if (location) {
      const cap = document.createElement('p');
      cap.className = 'stats-production-location';
      const dot = document.createElement('span');
      dot.className = 'stats-production-dot';
      dot.setAttribute('aria-hidden', 'true');
      cap.append(dot, document.createTextNode(location));
      media.append(cap);
    }
    cards.push(media);
  }

  // nothing authored for the panel: heading (and backdrop) only, no toggle
  if (!cards.length && !badge) {
    block.replaceChildren(...children);
    wireCarouselReveal(block, () => {}, () => {});
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'stats-production-panel';
  // how many cards it holds: the CSS drops the two-card height for fewer
  panel.dataset.cards = String(cards.length);

  // panel body: readout + media sit side by side; the footer row is separate
  if (cards.length) {
    const bodyRow = document.createElement('div');
    bodyRow.className = 'stats-production-body';
    bodyRow.append(...cards);
    panel.append(bodyRow);
  }

  // ---- footer row: badge (left) + close button (right), full panel width ----
  const foot = document.createElement('div');
  foot.className = 'stats-production-footer';

  if (badge) {
    const pill = document.createElement('span');
    pill.className = 'stats-production-badge';
    pill.textContent = badge;
    foot.append(pill);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'stats-production-close';
  close.setAttribute('aria-label', LABELS.hide.text);
  foot.append(close);

  panel.append(foot);
  inner.append(panel);

  // ---- know-more / close toggle ----
  // Collapsed by default: the heading and a "Know more" pill over the clean
  // backdrop. The pill expands the stats panel; the close button collapses it.
  const panelId = `stats-production-panel-${[...document.querySelectorAll('.stats-production')].indexOf(block)}`;
  panel.id = panelId;

  const knowMore = document.createElement('button');
  knowMore.type = 'button';
  knowMore.className = 'stats-production-knowmore';
  const kmLabel = document.createElement('span');
  kmLabel.className = 'stats-production-knowmore-label';
  kmLabel.textContent = LABELS.knowMore.text;
  const kmIcon = document.createElement('span');
  kmIcon.className = 'stats-production-knowmore-icon';
  kmIcon.setAttribute('aria-hidden', 'true');
  knowMore.append(kmLabel, kmIcon);
  // no aria-label: the accessible name is the visible "Know More" text, so
  // speech users can say what they see (WCAG 2.5.3); aria-expanded and
  // aria-controls already tell screen readers it opens the details panel
  knowMore.setAttribute('aria-controls', panelId);
  // Know More only expands (Dismiss is the separate close button), so a plain
  // data-cta is enough — no need to suppress it on the auto-open below, since
  // that calls setExpanded() directly and never dispatches a click here.
  knowMore.dataset.cta = 'stats-production:production-details:view';
  children.push(knowMore);

  // swap in localised strings once the (optional) placeholders sheet loads;
  // the English defaults above render immediately so layout never waits
  fetchPlaceholders().then((ph) => {
    if (ph[LABELS.knowMore.key]) kmLabel.textContent = ph[LABELS.knowMore.key];
    if (ph[LABELS.hide.key]) close.setAttribute('aria-label', ph[LABELS.hide.key]);
  });

  const setExpanded = (expanded) => {
    block.classList.toggle('is-expanded', expanded);
    knowMore.setAttribute('aria-expanded', String(expanded));
    // keep the hidden panel out of the tab order and accessibility tree
    panel.inert = !expanded;
  };
  setExpanded(false);

  // Auto-expand once as the component comes in (half in view, or revealed
  // over a carousel); after that, or once the user has toggled it, it stays
  // under user control. This is the only open that slides: it jumps (no
  // transition) into the parked spot below the edge that .is-intro-panel
  // gives it, and the entrance then slides it up. User toggles fade in place.
  let autoOpened = false;
  const autoOpen = () => {
    if (autoOpened) return;
    autoOpened = true;
    // keep keyboard users on a visible control when Know More hides
    const hadFocus = document.activeElement === knowMore;
    block.classList.add('is-snap');
    setExpanded(true);
    panel.getBoundingClientRect(); // commit the parked state before re-enabling transitions
    block.classList.remove('is-snap');
    if (hadFocus) close.focus({ preventScroll: true });
  };
  const startAutoOpen = () => {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      if (autoOpened) return;
      block.classList.add('is-intro-panel');
      autoOpen();
      requestAnimationFrame(() => block.classList.remove('is-intro-panel'));
    }, { threshold: AUTO_EXPAND_AT });
    io.observe(block);
  };

  close.addEventListener('click', () => {
    autoOpened = true;
    setExpanded(false);
    knowMore.focus({ preventScroll: true });
  });
  knowMore.addEventListener('click', () => {
    autoOpened = true;
    setExpanded(true);
    close.focus({ preventScroll: true });
  });

  block.replaceChildren(...children);
  if (!wireCarouselReveal(block, autoOpen, startAutoOpen)) startAutoOpen();
}
