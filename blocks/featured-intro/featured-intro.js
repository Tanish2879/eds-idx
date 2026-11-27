import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { findLinkedArticle } from '../../scripts/articles.js';
import { tagArticleLink } from '../../scripts/article-card.js';

const LOCATION = 'newsroom-hero';

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const range = (v, a, b) => clamp01((v - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);

// the screen 2 → 3 step, and the wheel quiet time that starts a new gesture
const STEP_MS = 1600;
const GESTURE_GAP_MS = 200;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// the title is up and out of the way before the story arrives: it finishes
// rising at TITLE_END of the step (sooner on mobile), the story starts sliding
// in at STORY_START
const TITLE_END = 0.45;
const TITLE_END_MOBILE = 0.2;
const STORY_START = 0.3;
const MOBILE = window.matchMedia('(width < 900px)');
// the title's rise out of its mask (featured-intro.css), and the beat after it
// before the featured story arrives by itself
const TITLE_RISE_MS = 1200;
const AUTO_ADVANCE_PAUSE_MS = 200;

const el = (tag, className, ...children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(Boolean));
  return node;
};

/**
 * Moves a field cell's content into a new element, keeping its Universal
 * Editor instrumentation.
 * @param {Element} row authored field row
 * @param {string} tag element to create
 * @param {string} className class for the element
 * @returns {Element|null}
 */
function fromField(row, tag, className) {
  if (!row || !row.textContent.trim()) return null;
  const cell = row.firstElementChild || row;
  const node = el(tag, className);
  moveInstrumentation(cell, node);
  node.textContent = cell.textContent.trim();
  return node;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Reads the authored date: the date picker stores it as an ISO date
 * (2026-10-28, possibly with a time after it). Dates typed as text before the
 * picker ("28 Oct 2026") are kept as written.
 * @param {string} value
 * @returns {{day: string, year: string, iso: string}|null}
 */
function parseDate(value) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && MONTHS[Number(iso[2]) - 1]) {
    const [, y, m, d] = iso;
    return { day: `${Number(d)} ${MONTHS[Number(m) - 1]}`, year: y, iso: `${y}-${m}-${d}` };
  }
  const text = value.match(/^(.*)\s(\d{4})$/);
  return text ? { day: text[1], year: text[2], iso: '' } : null;
}

/**
 * Shows the date as "28 Oct", an accent square and the year.
 * @param {Element|null} dateEl date element built by fromField
 */
function decorateDate(dateEl) {
  if (!dateEl) return;
  const value = dateEl.textContent;
  const date = parseDate(value);
  dateEl.textContent = '';
  if (!date) {
    dateEl.append(value);
    return;
  }
  if (date.iso) dateEl.dateTime = date.iso;
  const mark = el('span', 'mark');
  mark.setAttribute('aria-hidden', 'true');
  dateEl.append(el('span', 'day', date.day), mark, el('span', 'year', date.year));
}

/**
 * Runs the callback once the section is visible. The first section stays hidden
 * until its image has loaded, and a transition started before that never shows.
 * @param {Element|null} section
 * @param {Function} callback
 */
function whenShown(section, callback) {
  const run = () => requestAnimationFrame(() => requestAnimationFrame(callback));
  if (!section || section.dataset.sectionStatus === 'loaded') {
    run();
    return;
  }
  const observer = new MutationObserver(() => {
    if (section.dataset.sectionStatus !== 'loaded') return;
    observer.disconnect();
    run();
  });
  observer.observe(section, { attributes: true, attributeFilter: ['data-section-status'] });
}

/**
 * Keeps the title on its one line: a title wider than its mask (very wide
 * letters, or a long title authored before the character limit) scales down
 * to fit instead of being cut off. Re-checked on resize and once fonts load.
 * @param {Element} block
 */
function fitTitle(block) {
  const mask = block.querySelector('.mask');
  const title = block.querySelector('.title');
  if (!mask || !title) return;
  const fit = () => {
    block.style.removeProperty('--title-fit');
    const ratio = mask.clientWidth / title.scrollWidth;
    if (ratio < 1) block.style.setProperty('--title-fit', `${Math.floor(ratio * 1000) / 1000}`);
  };
  new ResizeObserver(fit).observe(block);
  document.fonts?.ready.then(fit);
}

/**
 * Sets the screen 2 → 3 progress: the title shrinks to the top while the
 * featured story slides in.
 * @param {Element} block
 * @param {number} t progress 0..1
 */
function render(block, t) {
  const titleEnd = MOBILE.matches ? TITLE_END_MOBILE : TITLE_END;
  block.style.setProperty('--shrink', `${range(t, 0, titleEnd)}`);
  block.style.setProperty('--slide', `${range(t, STORY_START, 1)}`);
}

/**
 * Builds the gesture stepper for the snap engine: one gesture plays exactly one
 * step. Step 0 is screen 2, step 1 screen 3 — the page also scrolls by the peek
 * distance so the next block rises into view under the pinned story. Scrolling
 * up plays it back.
 * @param {Element} block
 * @param {Element} section
 * @returns {object} controller for section-snap's registerBlockScroll
 */
function createStepper(block, section) {
  let step = 0;
  let t = 0;
  let frame = 0;
  // a gesture that already played the step can't play another, however long
  // or fast it keeps scrolling
  let consumed = false;
  let lastWheel = -Infinity;
  let lastMag = 0;

  const fresh = () => { consumed = false; };
  const onWheel = (e) => {
    const now = performance.now();
    const mag = Math.abs(e.deltaY);
    if (now - lastWheel > GESTURE_GAP_MS || (mag >= 10 && mag > lastMag * 1.5)) fresh();
    lastWheel = now;
    lastMag = mag;
  };
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('touchstart', fresh, { capture: true, passive: true });
  window.addEventListener('keydown', fresh, { capture: true });

  const pin = block.querySelector('.pin');
  const peek = () => Math.max(0, block.offsetHeight - pin.offsetHeight);

  const playTo = (next) => {
    const from = t;
    const startY = window.scrollY;
    const endY = section.offsetTop + peek() * next;
    step = next;
    consumed = true;
    cancelAnimationFrame(frame);
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / STEP_MS);
      const e = easeInOut(k);
      t = from + (next - from) * e;
      render(block, t);
      window.scrollTo(0, startY + (endY - startY) * e);
      frame = k < 1 ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  };

  return {
    canScrollDown: () => step < 1,
    canScrollUp: () => step > 0,
    scrollDown: () => playTo(1),
    scrollUp: () => playTo(0),
    isBusy: () => frame !== 0 || consumed,
    stopOffset: () => (step === 1 ? peek() : 0),
    autoPlay: () => {
      if (step === 0 && !frame) playTo(1);
    },
    destroy: () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('touchstart', fresh, { capture: true });
      window.removeEventListener('keydown', fresh, { capture: true });
    },
  };
}

/**
 * @param {Element} section
 * @param {Promise<number>} revealed resolves with the time the title started rising
 * @returns {Function} arm(play): play starts the step (stepper.autoPlay, or a scroll)
 */
function autoAdvance(section, revealed) {
  let cancelled = !!window.location.hash;
  const cancel = () => { cancelled = true; };
  const events = ['wheel', 'touchstart', 'keydown'];
  const listen = (on) => events.forEach((type) => (on
    ? window.addEventListener(type, cancel, { capture: true, passive: true })
    : window.removeEventListener(type, cancel, { capture: true })));
  listen(true);

  return (play) => revealed.then((risingAt) => {
    const wait = risingAt + TITLE_RISE_MS + AUTO_ADVANCE_PAUSE_MS - performance.now();
    setTimeout(() => {
      listen(false);
      if (cancelled || Math.abs(window.scrollY - section.offsetTop) > 10) return;
      play();
    }, Math.max(0, wait));
  });
}

/**
 * Fallback when the snap engine isn't running: the section becomes a scroll
 * runway and screen 2 → 3 scrubs with the page's scroll position.
 * @param {Element} block
 */
function wireScrub(block) {
  block.classList.remove('is-stepped');
  block.closest('.section')?.classList.add('no-snap', 'scroll-runway', 'runway-hold');

  let ticking = false;
  const update = () => {
    ticking = false;
    const total = block.offsetHeight - window.innerHeight;
    const scrolled = Math.min(Math.max(-block.getBoundingClientRect().top, 0), total);
    const p = total > 0 ? scrolled / total : 0;
    render(block, smooth(range(p, 0.1, 0.9)));
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/**
 * Screen 1 → 2 plays on load (the title rises out of its mask); screen 2 → 3
 * then plays by itself right after (see autoAdvance), and as one step per
 * scroll gesture (the title moves to the top while the featured story slides
 * in), or scrubs with scroll when the snap engine isn't running. Not under
 * reduced motion or in Universal Editor, where the finished screen 3 shows
 * statically.
 * @param {Element} block
 */
function wireScroll(block) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const authoring = !!document.querySelector('[data-aue-resource]');
  if (reduce || authoring) {
    block.classList.add('is-static');
    return;
  }
  block.classList.add('is-animated', 'is-stepped', 'is-intro');
  const section = block.closest('.section');
  const revealed = new Promise((resolve) => {
    whenShown(section, () => {
      block.classList.add('is-revealed');
      resolve(performance.now());
    });
  });
  render(block, 0);
  if (!section) {
    wireScrub(block);
    return;
  }
  const arm = autoAdvance(section, revealed);

  // The snap engine loads after the first screen. Register the stepper with it
  // straight away, then keep it only if the engine actually starts:
  // `snap-settled` is set on every path once the engine started or bowed out,
  // `snap-active` only once the engine is
  // live. Without the engine the block falls back to the scroll runway.
  const stepper = createStepper(block, section);
  const snap = import('../../scripts/section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, stepper);
    return mod;
  });
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (root.classList.contains('snap-active')) {
      arm(stepper.autoPlay);
    } else {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      wireScrub(block);
      // the runway finishes screen 3 at 90% of its length (wireScrub)
      arm(() => {
        const total = block.offsetHeight - window.innerHeight;
        window.scrollTo({ top: section.offsetTop + total * 0.9, behavior: 'smooth' });
      });
    }
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}

/**
 * Featured intro: a large page title (e.g. Newsroom, Blogs, Articles) that shrinks to
 * the top as the featured story (label, headline, date, read-more link, image) slides in.
 * Fields (model order): title, label, headline, date, link + link text, image + alt.
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const imageRow = rows.find((row) => row.querySelector('picture'));
  const linkRow = rows.find((row) => row.querySelector('a[href]'));
  const [titleRow, labelRow, headlineRow, dateRow] = rows
    .filter((row) => row !== imageRow && row !== linkRow);

  const title = fromField(titleRow, 'h1', 'title');
  const label = fromField(labelRow, 'p', 'label');
  const headline = fromField(headlineRow, 'p', 'headline');
  const date = fromField(dateRow, 'time', 'date');
  decorateDate(date);

  const link = linkRow?.querySelector('a[href]');
  if (link) {
    link.className = 'read-more';
    link.textContent = link.textContent.replace(/\s*→\s*$/, '').trim() || 'Read more';
    // single editorial link, not an index-rendered list — look up its real
    // category/publishDate from whichever index it points into
    findLinkedArticle(link.href).then((result) => {
      if (result) {
        tagArticleLink(link, result.item, {
          location: LOCATION, contentType: result.type, position: 1,
        });
      }
    });
  }

  const media = el('div', 'media');
  const img = imageRow?.querySelector('img');
  if (img) {
    // The story slides in from off-screen, so it must not compete with the page's real LCP element
    // (the header logo): normal priority. Phones get a smaller rendition than the desktop layout.
    const picture = createOptimizedPicture(img.src, img.alt || '', false, [
      { media: '(min-width: 900px)', width: '1200' },
      { width: '750' },
    ]);
    picture.classList.add('picture');
    const optimized = picture.querySelector('img');
    optimized.classList.add('image');
    moveInstrumentation(img, optimized);
    media.append(picture);
  }

  const copy = el(
    'div',
    'copy',
    el('div', 'top', label, headline),
    el('div', 'bottom', date, link),
  );

  block.replaceChildren(el(
    'div',
    'pin',
    el('div', 'mask', title),
    el('div', 'story', copy, media),
  ));

  fitTitle(block);
  wireScroll(block);
}
