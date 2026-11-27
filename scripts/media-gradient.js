/*
 * Section style "Image Gradient" (models/_section.json, styles/media-gradient.css).
 * Run by scripts/utils/section-styles.js on each section with the style, in the
 * lazy phase once its blocks are decorated, and again after every Universal
 * Editor edit, so it must be safe to re-run.
 *
 * Every block lays its media out its own way, so rather than each block saying
 * where its image sits, this finds, for each image and video, the box that
 * holds just that media (same size, no text in it) and marks it
 * .media-gradient-frame; the CSS draws the shade on it. It keeps up as the
 * page changes: media added later (lazy blocks, carousel slides, editor
 * edits) and boxes that resize (a breakpoint can add or remove a block's own
 * shade). Videos keep the shade whether they play or are paused.
 */

// media smaller than this both ways (thumbnails, avatars), or thinner than
// MIN_SIDE (a strip, a divider), is not a photo to shade; a wide but short
// banner still is
const MIN_SIZE = 120;
const MIN_SIDE = 48;

// blocks that shade their images their own way (Figma), so they keep exactly
// their look; and an opt-out for any single element
const SKIP = [
  '.icon',
  '.cards.pillars',
  '.cards.timeline',
  '.hero.intro',
  '.social-deck',
  '.stats-production',
  '[data-no-gradient]',
].join(', ');

const FRAME = 'media-gradient-frame';

// a box holding any of these is more than an image's frame: the shade would
// sit over a control, a player or an icon
const NOT_MEDIA = 'button, iframe, svg, canvas, input, select, textarea, label, object, embed';

const sections = new WeakMap(); // section -> its observers
const frameOf = new WeakMap(); // media -> the box it is shaded in

const isSvg = (img) => /\.svg($|\?)/i.test(img.currentSrc || img.getAttribute('src') || '');

// sizes are layout sizes, not on-screen ones, so a box scaled by a
// transform (a carousel's side cards) still counts at its real size, and
// stays shaded as it moves to the centre
const sizeOf = (el) => ({ width: el.offsetWidth, height: el.offsetHeight });

// a box the same size as the media (within 2px)
function fits(el, box) {
  const r = sizeOf(el);
  return Math.abs(r.width - box.width) <= 2 && Math.abs(r.height - box.height) <= 2;
}

// true when the element or one of its boxes up to the block already paints a
// gradient over the media (e.g. the hero's desktop bottom shade)
function hasOwnShade(media) {
  const block = media.closest('.block');
  for (let el = media.parentElement; el; el = el.parentElement) {
    const shaded = ['::before', '::after'].some((pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      return cs.content !== 'none' && cs.backgroundImage.includes('gradient')
        && !el.classList.contains(FRAME);
    });
    if (shaded) return true;
    if (el === block || el.matches('.section')) break;
  }
  return false;
}

/**
 * The box to shade for one image or video, or null when it should not be
 * shaded (skipped, too small, not laid out, already shaded by its block).
 * @param {HTMLImageElement|HTMLVideoElement} media
 * @param {Element} section
 * @returns {{ el: Element, inline: boolean }|null}
 */
function findFrame(media, section) {
  if (media.closest(SKIP) || (media.tagName === 'IMG' && isSvg(media))) return null;
  const box = sizeOf(media);
  const small = box.width < MIN_SIZE && box.height < MIN_SIZE;
  if (small || Math.min(box.width, box.height) < MIN_SIDE) return null;
  if (hasOwnShade(media)) return null;

  let frame = null;
  for (let el = media.parentElement; el && el !== section; el = el.parentElement) {
    // stop at anything holding text or a control (e.g. an embed's play
    // button), or more than one photo once a box is found
    if (el.textContent.trim() || el.querySelector(NOT_MEDIA)) break;
    if (frame && el.querySelectorAll('img, video').length > 1) break;
    if (fits(el, box)) frame = el;
    else if (frame) break; // the boxes grow past the media from here
    if (el.classList.contains('block')) break;
  }
  if (frame) return { el: frame, inline: false };

  // an image straight in the section: its (inline) picture becomes the box
  const picture = media.parentElement;
  if (picture?.tagName === 'PICTURE' && getComputedStyle(picture).display === 'inline') {
    return { el: picture, inline: true };
  }
  return null;
}

/**
 * Marks a box: picks the free pseudo-element (or adds an overlay when both
 * are in use), positions it if needed and matches a rounded image.
 * @param {{ el: Element, inline: boolean }} frame
 * @param {Element} media
 */
function markFrame({ el, inline }, media) {
  if (el.classList.contains(FRAME)) return;
  const after = getComputedStyle(el, '::after').content;
  const before = getComputedStyle(el, '::before').content;
  if (inline) el.classList.add('media-gradient-inline');
  else if (getComputedStyle(el).position === 'static') el.classList.add('media-gradient-pos');
  if (after !== 'none' && before === 'none') el.classList.add('is-before');
  else if (after !== 'none') {
    el.classList.add('has-overlay');
    const overlay = document.createElement('span');
    overlay.className = 'media-gradient-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    el.append(overlay);
  }
  // the shade follows the box's corners; an image rounded on its own lends its
  const radius = getComputedStyle(el).borderTopLeftRadius;
  const mediaRadius = getComputedStyle(media).borderTopLeftRadius;
  if (radius === '0px' && mediaRadius !== '0px') {
    el.style.setProperty('--media-gradient-radius', mediaRadius);
  }
  el.classList.add(FRAME);
}

function unmarkFrame(el) {
  el.classList.remove(
    FRAME,
    'is-before',
    'has-overlay',
    'media-gradient-pos',
    'media-gradient-inline',
  );
  el.style.removeProperty('--media-gradient-radius');
  el.querySelector(':scope > .media-gradient-overlay')?.remove();
}

// (re)decides one image or video: marks its box, or unmarks the old one when
// it no longer applies (e.g. the block shades it itself at this width)
function evaluate(media, section) {
  const found = findFrame(media, section);
  const previous = frameOf.get(media);
  if (previous && previous !== found?.el) {
    frameOf.delete(media);
    const stillUsed = [...previous.querySelectorAll('img, video')]
      .some((m) => frameOf.get(m) === previous);
    if (!stillUsed) unmarkFrame(previous);
  }
  if (!found) return;
  markFrame(found, media);
  frameOf.set(media, found.el);
}

// starts watching the section's new images and videos, and lets go of the
// ones no longer in the page: a box whose media is gone (e.g. an embed's
// poster replaced by the playing player) loses its shade
function track(section, state) {
  state.tracked.forEach((media) => {
    if (media.isConnected) return;
    state.resize.unobserve(media);
    state.tracked.delete(media);
    const frame = frameOf.get(media);
    frameOf.delete(media);
    if (frame && ![...state.tracked].some((m) => frameOf.get(m) === frame)) unmarkFrame(frame);
  });
  section.querySelectorAll('img, video').forEach((media) => {
    if (state.tracked.has(media)) return;
    state.tracked.add(media);
    // fires once now and whenever its size changes (shown, hidden, resized)
    state.resize.observe(media);
  });
}

/**
 * @param {Element} section a section with the "media-gradient" style
 */
export default function decorate(section) {
  const known = sections.get(section);
  if (known) {
    // re-run (editor edit): pick up new media and re-check the rest
    track(section, known);
    known.tracked.forEach((media) => evaluate(media, section));
    return;
  }

  const state = {
    tracked: new Set(),
    resize: new ResizeObserver((entries) => {
      entries.forEach(({ target }) => evaluate(target, section));
    }),
  };
  sections.set(section, state);

  // media added later: lazy blocks, carousel slides, swapped video stills
  new MutationObserver(() => track(section, state))
    .observe(section, { childList: true, subtree: true });

  track(section, state);
}
