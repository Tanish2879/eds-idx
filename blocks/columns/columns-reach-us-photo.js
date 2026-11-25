/*
 * Columns "Reach Us (Photo)" style (Style value "reach-us photo"), loaded by columns.js only
 * when the block has both classes, after the Reach Us layout (columns-reach-us.js). The
 * section keeps Reach Us's layout (Title + divider, the 3 × 2 grid, the Text below) and gets a
 * dark photo backdrop instead of the teal gradient:
 *   the backdrop is the one cell holding only an Image (e.g. the empty first cell of the
 *   second row), optionally with a link to an MP4 file in its own paragraph: a muted film
 *   over the image, which stays its poster (no film under reduced motion, Save-Data or in
 *   Universal Editor). The film (the garage lights switching on) plays once and holds its
 *   last frame.
 * The cell stays where it is authored (so Universal Editor still edits it); CSS lays it
 * across the whole section (columns-reach-us-photo.css).
 *
 * Arrival, as the dealer prototype's "Visit" panel (#garage, desktop and mobile designs; with
 * the section snap only): coming down into the section, the film plays sharp from its first
 * frame with the content hidden and a hint at the bottom ("Keep scrolling"; on phones "Scroll
 * to turn the lights on") (state 0). The next scroll or swipe down doesn't move the page: it
 * blurs and shades the photo, draws the rule and brings the title and groups in (state 1).
 * Scrolling up reverses it; a further scroll moves on. Coming back up from below, or jumping in
 * from further away (a menu link), shows state 1. Reduced motion, Universal Editor and pages
 * without the snap always show state 1; the CSS only hides anything in state 0 without
 * reduced motion.
 *
 * The Dealer footer in the fold (footer.js, when the page ends on this section): its block sits
 * in the section's .reach-us-photo-footer, and its parts marked .reach-us-photo-item come in
 * after the groups. The fold then ends the page (a scroll down in state 1 goes nowhere), and with
 * the snap it stays one screen: content taller than that (phones) scrolls inside it in state 1
 * (.reach-us-photo-scrolls, columns-reach-us-photo.css), the snap leaving those gestures to it.
 */

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

// a paragraph holding only a link to an MP4 file
const isVideoLine = (el) => {
  const a = el.querySelector('a[href]');
  return !!a && VIDEO_RE.test(a.getAttribute('href'))
    && el.textContent.trim() === a.textContent.trim();
};

// an image alone (a picture, or a paragraph or wrapper holding only one)
const isImageLine = (el) => !!el.querySelector('img') && !el.textContent.trim();

/**
 * The backdrop cell: an image and at most a film link, nothing else.
 * @param {Element} block
 * @returns {Element|null}
 */
function findBackdropCell(block) {
  return [...block.querySelectorAll(':scope > div > div')].find((cell) => {
    const parts = [...cell.children];
    if (!parts.some(isImageLine)) return false;
    return parts.every((el) => isImageLine(el) || isVideoLine(el));
  }) || null;
}

/**
 * The two-step arrival (see the top of this file).
 * @param {Element} block
 * @param {Element} cell the backdrop cell
 * @param {HTMLVideoElement|null} video the backdrop film
 */
function wireArrival(block, cell, video) {
  const section = block.closest('.section');
  if (!section || inEditor()) return;

  // the decorative hint shown in state 0, worded as each design has it
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

  // parts added to the section later and marked .reach-us-photo-item (the Dealer footer,
  // footer.js) come in after the groups, in their order, and are hidden as they are
  const adopt = () => {
    section.querySelectorAll('.reach-us-photo-item').forEach((el) => {
      if (items.includes(el)) return;
      el.style.setProperty('--reach-us-photo-i', items.length);
      el.inert = isArrival();
      items.push(el);
    });
  };
  new MutationObserver(adopt).observe(section, { childList: true });

  // the page's footer in the fold (footer.js): the fold ends the page, so a scroll down in
  // state 1 has nowhere to go (not to an empty section after it)
  const endsPage = () => !!section.querySelector(':scope > .reach-us-photo-footer');

  // content taller than the fold (the footer in it, on phones) scrolls inside it in state 1,
  // over the backdrop held in place (columns-reach-us-photo.css); measured, as CSS can't tell
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
    // state 0 shows the fold from its top
    if (arrival) section.scrollTop = 0;
    // hidden content can't be reached while hidden (visibility does it too, this is for AT)
    items.forEach((el) => { el.inert = arrival; });
    if (instant) {
      busyUntil = 0;
      // the new state's styles are applied (a forced style flush) before the transitions return
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

  // the film from its first frame (if it isn't loaded yet, playWhileVisible starts it there);
  // a step down into the section replays it, as the prototype does
  const replay = () => {
    if (!video?.src) return;
    video.playbackRate = 1;
    video.currentTime = 0;
    video.play().catch(() => {});
  };

  document.addEventListener('snap:start', ({ detail }) => {
    const { from, to } = detail || {};
    if (to !== section || !from || from === section) return;
    section.scrollTop = 0; // coming in, the fold shows from its top
    // only a step down from the section just above plays the arrival; coming back up from
    // below, a jump from further away (a menu link) or keyboard focus moving in land on state 1
    const stepIn = from === section.previousElementSibling;
    if (stepIn) replay();
    if (!stepIn || !enabled() || section.contains(document.activeElement)) {
      setState(false, true);
      return;
    }
    setState(true, true);
  });

  // the section above scrolls natively (No Snap): the snap lands here without a snap:start,
  // so the arrival is set as the section starts to come up from below, scrolling down
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

  // once off screen it rests in state 1, so its content stays in the tab order between visits
  document.addEventListener('snap:end', ({ detail }) => {
    if (detail?.from === section && detail.to !== section && isArrival()) setState(false, true);
  });

  // never left half-way: with reduced motion it's always state 1; crossing the desktop width
  // (a rotated tablet) rewords the hint and lands on state 1, as the layout changes under it
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

/**
 * @param {Element} block the .columns.reach-us.photo block
 */
export default function decorate(block) {
  const cell = findBackdropCell(block);
  if (!cell || cell.classList.contains('reach-us-backdrop')) return;
  cell.classList.add('reach-us-backdrop');
  cell.setAttribute('aria-hidden', 'true');
  // out of the grid now: the next cell keeps its own column (the empty slot stays, desktop CSS)
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
    // plays through once and rests on its last frame (lights on): coming back on screen
    // doesn't restart it (playWhileVisible would), only a replay from the start does
    video.loop = false;
    const play = video.play.bind(video);
    video.play = () => (video.ended ? Promise.resolve() : play());
    cell.append(video);
    playWhileVisible(video, block.closest('.section') || block);
  }

  wireArrival(block, cell, video);
}
