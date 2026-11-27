import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { findLinkedArticle } from '../../scripts/articles.js';
import { tagArticleLink } from '../../scripts/article-card.js';

const LOCATION = 'newsroom-hero';

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const range = (v, a, b) => clamp01((v - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);

// screen 2 → 3 step duration; the wheel quiet time that starts a new gesture
const STEP_MS = 1600;
const GESTURE_GAP_MS = 200;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// the title is out of the way (TITLE_END, sooner on mobile) before the story slides in
const TITLE_END = 0.45;
const TITLE_END_MOBILE = 0.2;
const STORY_START = 0.3;
const MOBILE = window.matchMedia('(width < 900px)');
// the title's rise out of its mask (featured-intro.css), then a beat before auto-advance
const TITLE_RISE_MS = 1200;
const AUTO_ADVANCE_PAUSE_MS = 200;

const el = (tag, className, ...children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(Boolean));
  return node;
};

/** Moves a field cell's text into a new element, keeping its Universal Editor instrumentation. */
function fromField(row, tag, className) {
  if (!row || !row.textContent.trim()) return null;
  const cell = row.firstElementChild || row;
  const node = el(tag, className);
  moveInstrumentation(cell, node);
  node.textContent = cell.textContent.trim();
  return node;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Date picker values are ISO (maybe with a time); older text dates ("28 Oct 2026") stay as is. */
function parseDate(value) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && MONTHS[Number(iso[2]) - 1]) {
    const [, y, m, d] = iso;
    return { day: `${Number(d)} ${MONTHS[Number(m) - 1]}`, year: y, iso: `${y}-${m}-${d}` };
  }
  const text = value.match(/^(.*)\s(\d{4})$/);
  return text ? { day: text[1], year: text[2], iso: '' } : null;
}

/** Shows the date as "28 Oct", an accent square and the year. */
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

/** Runs callback once the section is shown: a transition started while hidden never plays. */
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

/** Scales a title wider than its one-line mask down to fit; rechecked on resize and font load. */
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

/** Screen 2 → 3 progress t (0..1): the title shrinks to the top as the story slides in. */
function render(block, t) {
  const titleEnd = MOBILE.matches ? TITLE_END_MOBILE : TITLE_END;
  block.style.setProperty('--shrink', `${range(t, 0, titleEnd)}`);
  block.style.setProperty('--slide', `${range(t, STORY_START, 1)}`);
}

/** Snap stepper, one step per gesture; step 1 also scrolls by the peek so the next block shows. */
function createStepper(block, section) {
  let step = 0;
  let t = 0;
  let frame = 0;
  // a gesture that already played the step can't play another, however long it keeps scrolling
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

/** Returns arm(play): plays the step after the title rise, unless the user acts first. */
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

/** Fallback without the snap engine: screen 2 → 3 scrubs with scroll over a runway. */
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

/** Screen 1 → 2 on load, then 2 → 3; static screen 3 under reduced motion or in UE. */
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

  // register now, keep only if the engine starts: snap-settled = decided, snap-active = live
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

/** Fields (model order): title, label, headline, date, link + link text, image + alt. */
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
    // a single editorial link: look up its category/publishDate from the index it points into
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
    // slides in from off-screen, so normal priority (not the LCP); phones get a smaller rendition
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
