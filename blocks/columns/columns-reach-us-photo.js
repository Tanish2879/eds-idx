// Reach Us over a photo (or film) backdrop cell, which CSS lays across the whole section.
// Arrival (snap only): state 0 is the sharp film and a hint; the next gesture brings in state 1.

import { VIDEO_RE, createLoopVideo, playWhileVisible } from '../../scripts/utils/film.js';
import { inEditor } from '../../scripts/utils/common.js';

const ARRIVAL = 'reach-us-photo-arrival'; // state 0, on the section
const INSTANT = 'reach-us-photo-instant'; // a state change without its transitions
const SCROLLS = 'reach-us-photo-scrolls'; // its content is taller than the fold
// how long a step holds further gestures (the prototype's page glide is 0.9s; back is 1.8x)
const BUSY_IN_MS = 900;
const BUSY_OUT_MS = 500;
// a film still playing when the content comes in catches up to its lit frame this fast
const CATCH_UP_S = 0.35;

const isVideoLine = (el) => {
  const a = el.querySelector('a[href]');
  return !!a && VIDEO_RE.test(a.getAttribute('href'))
    && el.textContent.trim() === a.textContent.trim();
};

const isImageLine = (el) => !!el.querySelector('img') && !el.textContent.trim();

/** The backdrop cell: an image and at most a film link, nothing else. */
function findBackdropCell(block) {
  return [...block.querySelectorAll(':scope > div > div')].find((cell) => {
    const parts = [...cell.children];
    if (!parts.some(isImageLine)) return false;
    return parts.every((el) => isImageLine(el) || isVideoLine(el));
  }) || null;
}

function wireArrival(block, cell, video) {
  const section = block.closest('.section');
  if (!section || inEditor()) return;

  // the decorative hint shown in state 0, worded per design
  const desktop = window.matchMedia('(width >= 900px)');
  const hint = document.createElement('p');
  hint.className = 'reach-us-photo-hint';
  const wordHint = () => {
    hint.textContent = desktop.matches ? 'Keep scrolling' : 'Scroll to turn the lights on';
  };
  wordHint();
  cell.append(hint);

  // what comes in, in order: the title, then the groups
  const items = [
    ...section.querySelectorAll(':scope > .reach-us-head > *'),
    ...[...block.querySelectorAll(':scope > div > div')].filter((el) => el !== cell),
  ];
  items.forEach((el, i) => {
    el.classList.add('reach-us-photo-item');
    el.style.setProperty('--reach-us-photo-i', i);
  });

  let busyUntil = 0;
  const isArrival = () => section.classList.contains(ARRIVAL);

  // items added later (the Dealer footer, footer.js) come in after the groups, in order
  const adopt = () => {
    section.querySelectorAll('.reach-us-photo-item').forEach((el) => {
      if (items.includes(el)) return;
      el.style.setProperty('--reach-us-photo-i', items.length);
      el.inert = isArrival();
      items.push(el);
    });
  };
  new MutationObserver(adopt).observe(section, { childList: true });

  // with the footer in it the fold ends the page: a scroll down in state 1 goes nowhere
  const endsPage = () => !!section.querySelector(':scope > .reach-us-photo-footer');

  // content taller than the fold scrolls inside it in state 1; measured, as CSS can't tell
  const fit = () => section.classList.toggle(
    SCROLLS,
    section.scrollHeight > section.clientHeight + 1,
  );
  const resized = new ResizeObserver(fit);
  const watch = () => [section, ...section.children].forEach((el) => resized.observe(el));
  watch();
  new MutationObserver(watch).observe(section, { childList: true });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const enabled = () => !reduce.matches
    && document.documentElement.classList.contains('snap-active');

  const setState = (arrival, instant = false) => {
    if (instant) section.classList.add(INSTANT);
    section.classList.toggle(ARRIVAL, arrival);
    if (arrival) section.scrollTop = 0;
    // inert for assistive tech (visibility already hides it visually)
    items.forEach((el) => { el.inert = arrival; });
    if (instant) {
      busyUntil = 0;
      // forced style flush so the new state applies before the transitions return
      section.getBoundingClientRect();
      section.classList.remove(INSTANT);
    } else {
      busyUntil = performance.now() + (arrival ? BUSY_OUT_MS : BUSY_IN_MS);
    }
  };

  // state 1 with the film still running: it hurries to its lit last frame
  const catchUp = () => {
    if (!video?.src || video.paused || video.ended || !video.duration) return;
    const left = video.duration - video.currentTime;
    video.playbackRate = Math.min(16, Math.max(1, left / CATCH_UP_S));
  };
  video?.addEventListener('ended', () => { video.playbackRate = 1; });

  // a step down into the section replays the film from its first frame, as the prototype does
  const replay = () => {
    if (!video?.src) return;
    video.playbackRate = 1;
    video.currentTime = 0;
    video.play().catch(() => {});
  };

  document.addEventListener('snap:start', ({ detail }) => {
    const { from, to } = detail || {};
    if (to !== section || !from || from === section) return;
    section.scrollTop = 0;
    // only a step down from the section just above plays the arrival; other entries get state 1
    const stepIn = from === section.previousElementSibling;
    if (stepIn) replay();
    if (!stepIn || !enabled() || section.contains(document.activeElement)) {
      setState(false, true);
      return;
    }
    setState(true, true);
  });

  // after a No Snap section there's no snap:start, so set the arrival as this comes up from below
  let lastY = window.scrollY;
  new IntersectionObserver(([entry]) => {
    const down = window.scrollY > lastY;
    lastY = window.scrollY;
    if (!entry.isIntersecting || !down || entry.boundingClientRect.top <= 0) return;
    if (!section.previousElementSibling?.classList.contains('no-snap')) return;
    if (!enabled() || isArrival() || section.contains(document.activeElement)) return;
    replay();
    setState(true, true);
  }).observe(section);
  window.addEventListener('scroll', () => {
    if (section.getBoundingClientRect().top > window.innerHeight) lastY = window.scrollY;
  }, { passive: true });

  // off screen it rests in state 1, so its content stays in the tab order between visits
  document.addEventListener('snap:end', ({ detail }) => {
    if (detail?.from === section && detail.to !== section && isArrival()) setState(false, true);
  });

  // never left half-way: reduced motion or crossing the desktop width lands on state 1
  const settle = () => { if (!enabled() && isArrival()) setState(false, true); };
  desktop.addEventListener('change', () => {
    wordHint();
    if (isArrival()) setState(false, true);
  });
  reduce.addEventListener('change', settle);

  import('../../scripts/section-snap.js').then((mod) => mod.registerBlockScroll(section, {
    canScrollDown: () => isArrival() || endsPage(),
    canScrollUp: () => !isArrival() && enabled(),
    scrollDown: () => {
      if (!isArrival()) return; // the page's end (endsPage)
      setState(false);
      catchUp();
    },
    scrollUp: () => setState(true),
    isBusy: () => performance.now() < busyUntil,
  })).catch(() => {});
}

export default function decorate(block) {
  const cell = findBackdropCell(block);
  if (!cell || cell.classList.contains('reach-us-backdrop')) return;
  cell.classList.add('reach-us-backdrop');
  cell.setAttribute('aria-hidden', 'true');
  // out of the grid now: the next cell keeps its own column (desktop CSS)
  const next = cell.nextElementSibling;
  if (next) {
    next.classList.add('reach-us-after-backdrop');
    next.style.setProperty('--reach-us-backdrop-col', [...cell.parentElement.children].indexOf(cell) + 2);
  }

  // decorative: no alt text read out
  const img = cell.querySelector('img');
  img.alt = '';
  img.classList.add('reach-us-backdrop-img');

  let video = null;
  const videoLine = [...cell.children].find(isVideoLine);
  if (videoLine) {
    videoLine.classList.add('reach-us-backdrop-link');
    video = createLoopVideo(videoLine.querySelector('a').href, img.currentSrc || img.src);
    video.className = 'reach-us-backdrop-video';
    // plays once and rests on its lit last frame; re-entering view mustn't restart it
    video.loop = false;
    const play = video.play.bind(video);
    video.play = () => (video.ended ? Promise.resolve() : play());
    cell.append(video);
    playWhileVisible(video, block.closest('.section') || block);
  }

  wireArrival(block, cell, video);
}
