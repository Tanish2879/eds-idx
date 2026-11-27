// Hero "Product" style (product launch page), loaded by hero.js only when the style is used.
// Fields:
//   Background Image or Video (Desktop / Mobile) → the full-screen backdrop
//   Video Thumbnail (Desktop)                    → the image of the "Watch the film" card
//   Background Image (Desktop)                   → the whole scene, e.g. the car in its landscape
//   Logo (Product only)                          → moved into the Text by hero.js, before the title
//   Text, in this order:
//     (the Logo, placed here by hero.js) → the logo (lockup) above it
//     the title (Heading 1)       → the big centred title
//     a link to an MP4 file       → the film card: the link text is its eyebrow ("Watch the
//                                   film") and the paragraph right after it is its text
//     other paragraphs            → the price line (bold for the amount)
//     other links                 → the buttons (the first is the main one)

import {
  createLoopVideo, createPlayBadge, findVideoLink, openFilm, playWhileVisible,
} from '../../scripts/utils/film.js';
import { loadCSS } from '../../scripts/aem.js';
import decorateReserve from '../../scripts/section-reserve.js';
import { inEditor } from '../../scripts/utils/common.js';

const isPictureLine = (el) => el?.tagName === 'P' && !!el.querySelector('img')
  && !el.textContent.trim();

/**
 * Takes the film's link paragraph and the paragraph after it out of the Text, before the Text
 * is decorated (it would make the link a button).
 * @param {Element} textCell
 * @returns {{ src: string, eyebrow: string, copy: Element|null, marker: Comment }|null}
 */
function takeFilm(textCell) {
  const link = findVideoLink(textCell);
  if (!link) return null;
  const line = link.closest('p, li') && textCell.contains(link.closest('p, li'))
    ? link.closest('p, li') : link;
  const next = line.nextElementSibling;
  const copy = next?.tagName === 'P' && !next.querySelector('a, img') ? next : null;
  const marker = document.createComment('film');
  line.before(marker);
  line.remove();
  copy?.remove();
  return {
    src: link.href,
    eyebrow: link.textContent.trim() === link.getAttribute('href') ? '' : link.textContent.trim(),
    copy,
    marker,
  };
}

/**
 * The "Watch the film" card: a looping thumbnail and its copy, opened by one button.
 * @param {object} film from takeFilm
 * @param {HTMLImageElement|null} thumb the Video Thumbnail field's image
 * @param {string} title the hero title, the player's heading
 * @param {string} name the product's name (the logo's alt text), the player's eyebrow, as on the
 *   launch page (else the card's eyebrow)
 * @param {object} helpers
 * @returns {HTMLDivElement}
 */
function buildFilmCard(film, thumb, title, name, { moveInstrumentation, optimizedPicture }) {
  const card = document.createElement('div');
  card.className = 'product-film';

  const media = document.createElement('span');
  media.className = 'product-film-media';
  let poster = '';
  if (thumb) {
    const pic = optimizedPicture(thumb.src, '', false, [{ width: '480' }]);
    const img = pic.querySelector('img');
    img.classList.add('product-film-img');
    moveInstrumentation(thumb, img);
    poster = img.currentSrc || img.src;
    media.append(pic);
  }
  const video = createLoopVideo(film.src, poster);
  video.className = 'product-film-video';
  media.append(video, createPlayBadge());

  const copy = document.createElement('div');
  copy.className = 'product-film-copy';
  if (film.eyebrow) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'product-film-eyebrow';
    eyebrow.textContent = film.eyebrow;
    copy.append(eyebrow);
  }
  if (film.copy) {
    film.copy.classList.add('product-film-text');
    copy.append(film.copy);
  }

  // one button over the whole card (its ::after, product CSS) plays the film
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'product-film-open';
  button.setAttribute('aria-haspopup', 'dialog');
  const label = film.eyebrow || 'Watch the film';
  button.setAttribute('aria-label', title ? `${label}: ${title}` : label);
  button.addEventListener('click', () => openFilm({
    src: film.src,
    poster,
    eyebrow: name || film.eyebrow,
    title,
    body: film.copy ? [film.copy] : [],
    from: media,
  }, button));

  card.append(media, copy, button);
  const playback = playWhileVisible(video, card);
  card.classList.toggle('is-still', !playback.active);
  return card;
}

/**
 * Sets the footnote mark after the price amount ("₹XX,XXX*") as a superscript, as on the
 * launch page. Not in Universal Editor, where the Text is edited as authored.
 * @param {Element} amount the price line's bold amount
 */
function raiseFootnoteMark(amount) {
  const text = amount.lastChild;
  if (text?.nodeType !== Node.TEXT_NODE) return;
  const match = text.textContent.match(/\s*(\*+)\s*$/);
  if (!match || match.index === 0) return;
  const [, mark] = match;
  text.textContent = text.textContent.slice(0, match.index);
  const sup = document.createElement('sup');
  sup.textContent = mark;
  amount.append(sup);
}

/**
 * The page's end bar: its last section, when that is default content only, takes the Reserve
 * Band section style (styles/section-reserve.css) without the author choosing it. Left alone
 * when a section already has the style.
 * @param {Element} block the hero
 */
function decorateEndBar(block) {
  const main = block.closest('main');
  if (!main || main.querySelector(':scope > .section.reserve-band')) return;
  // a section holding only the Floater doesn't count: the Floater takes it off the page, but
  // it is still there while the hero loads
  const end = [...main.querySelectorAll(':scope > .section')]
    .reverse()
    .find((section) => section.querySelector(':scope > :not(.floater-wrapper)'));
  if (!end || end.querySelector('[data-block-name]')) return;
  end.classList.add('reserve-band');
  loadCSS(`${window.hlx.codeBasePath}/styles/section-reserve.css`);
  decorateReserve(end);
}

// --- the load intro (hero-product.css .product-intro, then .is-intro-playing) ---
// How long it runs once it plays (the title's last line lands at 2.75s), and how long it waits
// for the photo, the logo and the fonts before it plays anyway (the prototype's 2.6s)
const INTRO_MS = 2800;
const INTRO_WAIT_MS = 2600;

const loaded = (img) => new Promise((resolve) => {
  if (!img || img.complete) {
    resolve();
    return;
  }
  img.addEventListener('load', resolve, { once: true });
  img.addEventListener('error', resolve, { once: true });
});

/**
 * Splits a plain-text title into the lines it renders on (span.product-line, each holding a
 * span.product-line-inner), the line breaks frozen, for the line-by-line rise. Null when it
 * can't (inline markup, or not laid out).
 * @param {Element} el the title
 * @returns {{ lines: HTMLSpanElement[], original: Node[] }|null} the lines and the title's own
 *   text nodes, to put back
 */
function splitLines(el) {
  if (!el?.getClientRects().length) return null;
  if ([...el.childNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)) return null;
  const words = el.textContent.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const original = [...el.childNodes];
  const spans = words.map((word) => {
    const span = document.createElement('span');
    span.textContent = word;
    return span;
  });
  el.replaceChildren(...spans.flatMap((span, i) => (i ? [' ', span] : [span])));
  const lines = [];
  let top = null;
  spans.forEach((span) => {
    const y = span.getBoundingClientRect().top;
    if (top === null || Math.abs(y - top) > 2) {
      lines.push([]);
      top = y;
    }
    lines[lines.length - 1].push(span.textContent);
  });
  const lineEls = lines.map((lineWords, i) => {
    const line = document.createElement('span');
    line.className = 'product-line';
    line.style.setProperty('--i', i);
    const inner = document.createElement('span');
    inner.className = 'product-line-inner';
    inner.textContent = lineWords.join(' ');
    // the space keeps the words apart in the text read out
    line.append(inner, ' ');
    return line;
  });
  el.replaceChildren(...lineEls);
  return { lines: lineEls, original };
}

/**
 * The prototype's load intro: over the light page, the hero opens from a card (inset 36% 31%,
 * radius 24px) to full screen, 1.7s expo.inOut from 0.15s, as its scene settles from 1.32x
 * (2s); a white veil fades off it first (0.5s). From 1.45s the logo and the title's lines rise
 * out of their masks (1.1s power4.out, 0.1s apart), then the button (1.8s) and the price
 * (1.88s) fade up 18px (0.7s) and the film card rises 24px out of an 8px blur (1.85s, 0.8s).
 * Everything is painted from the start (clipped, veiled, translated). Not under reduced motion,
 * in Universal Editor, below the first section, or when the page opens scrolled or
 * deep-linked away from the hero; a scroll or a snap move ends it at once.
 * @param {Element} block the hero
 */
function playIntro(block) {
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches || inEditor()) return;
  const section = block.closest('.section');
  if (!section || section.previousElementSibling) return;
  let id = window.location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // a malformed hash: looked up as it is
  }
  const target = id ? document.getElementById(id) : null;
  if (window.scrollY > 1 || (id && !section.contains(target))) return;

  const heading = block.querySelector('.content h1, .content .heading');
  let original = null;
  let t0 = 0;
  // the title's lines, as it renders now; split again when the web fonts come in (they load
  // after the first screen, so its lines may change), the rise carried on where it is
  // (--intro-elapsed, hero-product.css)
  const split = () => {
    if (original) heading.replaceChildren(...original);
    const lines = splitLines(heading);
    original = lines?.original || null;
    // how far in the intro is: its opening's time, else the clock's
    const opening = block.getAnimations?.().find((anim) => anim.animationName === 'product-intro-open');
    const elapsed = Number(opening?.currentTime ?? performance.now() - t0) || 0;
    heading?.style.setProperty('--intro-elapsed', `${Math.round(elapsed)}ms`);
  };
  const restore = () => {
    document.fonts?.removeEventListener('loadingdone', split);
    if (original) heading.replaceChildren(...original);
    original = null;
    heading?.style.removeProperty('--intro-elapsed');
  };
  let started = false;
  let done = false;
  let onScroll;
  const finish = () => {
    if (done) return;
    done = true;
    block.classList.remove('product-intro', 'is-intro-playing');
    restore();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('snap:start', finish);
  };
  onScroll = () => { if (window.scrollY > 1) finish(); };

  // the title's lines are read once it is laid out (the section shows after its blocks load)
  let frames = 0;
  const start = () => {
    if (started || done) return;
    if (!block.getClientRects().length && frames < 30) {
      frames += 1;
      requestAnimationFrame(start);
      return;
    }
    started = true;
    t0 = performance.now();
    split();
    document.fonts?.addEventListener('loadingdone', split);
    block.classList.add('is-intro-playing');
    window.setTimeout(finish, INTRO_MS);
  };
  // the safety nets first, so nothing stays veiled if anything below fails
  window.setTimeout(start, INTRO_WAIT_MS);
  window.setTimeout(finish, INTRO_WAIT_MS + INTRO_MS);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('snap:start', finish);
  block.classList.add('product-intro');

  Promise.all([
    loaded(block.querySelector(':scope > .bg img.bg-img')),
    loaded(block.querySelector('.product-logo img')),
    document.fonts?.ready,
  ]).then(() => requestAnimationFrame(() => requestAnimationFrame(start)));
}

/**
 * @param {Element} block the hero
 * @param {object} parts built by hero.js
 */
export default function decorateProduct(block, {
  bg, textCell, firstScreen, thumb, scrollIndicator, rest, helpers,
}) {
  const { decorateContent, optimizedPicture } = helpers;
  decorateEndBar(block);
  if (!textCell) {
    block.replaceChildren(bg, ...rest);
    return;
  }

  const film = takeFilm(textCell);
  decorateContent(block, textCell);

  const title = textCell.querySelector(':scope > .heading-group, :scope > .heading');

  // the logo, above the title (placed in the Text by hero.js); on the first screen, so eager
  [...textCell.children].filter(isPictureLine).forEach((line) => {
    const img = line.querySelector('img');
    const pic = optimizedPicture(img.src, img.alt || '', firstScreen, [{ width: '750' }]);
    const picImg = pic.querySelector('img');
    helpers.moveInstrumentation(img, picImg);
    (img.closest('picture') || img).replaceWith(pic);
    line.classList.add('product-logo');
  });

  // the price line(s) and the buttons go together, bottom right
  const buy = document.createElement('div');
  buy.className = 'product-buy';
  const priceLines = [...textCell.querySelectorAll(':scope > p.subtext')];
  priceLines.forEach((p) => {
    p.classList.add('product-price');
    if (!inEditor()) p.querySelectorAll('strong, b').forEach(raiseFootnoteMark);
  });
  const cta = textCell.querySelector(':scope > .cta-wrapper');
  const buyParts = [...priceLines, cta].filter(Boolean);
  if (buyParts.length) {
    buyParts[0].before(buy);
    buy.append(...buyParts);
  }

  if (film) {
    const name = textCell.querySelector('.product-logo img')?.alt.trim() || '';
    const card = buildFilmCard(film, thumb, title?.textContent.trim() || '', name, helpers);
    // where the film was in the Text, so Universal Editor keeps its order
    film.marker.replaceWith(card);
  }

  block.replaceChildren(bg, textCell, ...(scrollIndicator ? [scrollIndicator] : []), ...rest);
  if (firstScreen) playIntro(block);
}
