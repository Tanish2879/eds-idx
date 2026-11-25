// Hero "Dealer" style (a dealer's storefront page), loaded by hero.js only when the style is
// used. It builds on the Default hero (hero.js has already decorated the Text: heading,
// subtext and buttons).
// Fields:
//   Background Image or Video (Desktop / Mobile) → the full-screen showroom photo
//   Video Thumbnail (Desktop)                    → the image of the product card, bottom right
//   Text, in this order:
//     a paragraph before the title  → the status line (e.g. "Closed today · Opens Monday,
//                                     10am"); a " · " in it becomes a dot
//     the title (Heading 1)         → the dealer's name
//     paragraphs before the buttons → the address
//     the links                     → the buttons (the first is the main one)
//     paragraphs after the buttons  → the product card: the first is its title ("[ New ]
//                                     Combat", the bracketed part a tag), the rest its text
//                                     (e.g. "Starting from ₹XX", a line of copy)
// The entrance is CSS (hero-dealer.css); here the title is split into the lines it renders on,
// so each rises out of its own mask, and put back once they have.

import { inEditor } from '../../scripts/utils/common.js';

const SEPARATOR = /\s+·\s+/;
const TAG = /^(\s*\[[^\]]*\])\s*/;

// the entrance's length (its last move ends by 2.83s, hero-dealer.css), and how many frames
// the title is waited for to be laid out (the section shows after its blocks load)
const ENTRANCE_MS = 3000;
const LAYOUT_FRAMES = 300;

/**
 * Wraps the status line's " · " separators in a decorative dot, the words read out as they are.
 * @param {Element} line the status paragraph
 */
function markSeparators(line) {
  if (line.children.length || !SEPARATOR.test(line.textContent)) return;
  const parts = line.textContent.split(SEPARATOR);
  const nodes = parts.flatMap((part, i) => {
    if (!i) return [part];
    const dot = document.createElement('span');
    dot.className = 'dealer-dot';
    dot.setAttribute('aria-hidden', 'true');
    return [' ', dot, part];
  });
  line.replaceChildren(...nodes);
}

/**
 * Wraps a leading "[ New ]" of the card title in a tag span.
 * @param {Element} title the card's first paragraph
 */
function markTag(title) {
  const first = title.firstChild;
  if (first?.nodeType !== Node.TEXT_NODE) return;
  const match = first.textContent.match(TAG);
  if (!match) return;
  const tag = document.createElement('span');
  tag.className = 'dealer-card-tag';
  tag.textContent = match[1].trim();
  first.textContent = first.textContent.slice(match[0].length);
  title.insertBefore(tag, first);
  title.insertBefore(document.createTextNode(' '), first);
}

/**
 * Splits a plain-text title into the lines it renders on (span.dealer-line, each holding a
 * span.dealer-line-inner), the line breaks frozen. Null when it can't (inline markup).
 * @param {Element} el the title
 * @returns {{ lines: HTMLSpanElement[], restore: Function }|null}
 */
function splitLines(el) {
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
    line.className = 'dealer-line';
    line.style.setProperty('--i', i);
    const inner = document.createElement('span');
    inner.className = 'dealer-line-inner';
    inner.textContent = lineWords.join(' ');
    // the space keeps the words apart in the text read out
    line.append(inner, ' ');
    return line;
  });
  el.replaceChildren(...lineEls);
  return { lines: lineEls, restore: () => el.replaceChildren(...original) };
}

/**
 * Once the hero is laid out: splits the title for its line-by-line rise (the delays less the
 * time this took, --dealer-elapsed), puts it back when the entrance is over and marks the
 * hero .dealer-entered, so a later layout change doesn't replay it. Not under reduced motion
 * or in Universal Editor.
 * @param {Element} block the hero
 * @param {Element|null} heading the title
 */
function stageEntrance(block, heading) {
  if (inEditor() || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  let frames = 0;
  const start = () => {
    if (!block.getClientRects().length) {
      frames += 1;
      if (frames < LAYOUT_FRAMES) requestAnimationFrame(start);
      else block.classList.add('dealer-entered');
      return;
    }
    let split = null;
    let t0 = performance.now();
    // the lines as the title renders now; split again when the web fonts come in (they can
    // change where it breaks), the rise carried on where it is
    const resplit = () => {
      if (!split) return;
      split.restore();
      heading.style.setProperty('--dealer-elapsed', `${Math.round(performance.now() - t0)}ms`);
      split = splitLines(heading);
    };
    if (heading?.getClientRects().length) {
      const fade = heading.getAnimations?.().find((anim) => anim.animationName === 'hero-dealer-fade');
      const elapsed = Math.round(Number(fade?.currentTime) || 0);
      t0 -= elapsed;
      heading.style.setProperty('--dealer-elapsed', `${elapsed}ms`);
      split = splitLines(heading);
      if (split) document.fonts?.addEventListener('loadingdone', resplit);
    }
    setTimeout(() => {
      if (split) {
        document.fonts?.removeEventListener('loadingdone', resplit);
        split.restore();
        heading.classList.add('dealer-risen');
        heading.style.removeProperty('--dealer-elapsed');
      }
      block.classList.add('dealer-entered');
    }, ENTRANCE_MS);
  };
  requestAnimationFrame(start);
}

/**
 * @param {Element} block the hero
 * @param {object} parts built by hero.js
 */
export default function decorateDealer(block, {
  bg, textCell, thumb, rest, helpers,
}) {
  const { moveInstrumentation, optimizedPicture } = helpers;
  if (!textCell) {
    block.replaceChildren(bg, ...rest);
    stageEntrance(block, null);
    return;
  }

  const children = [...textCell.children];
  const title = textCell.querySelector(':scope > .heading-group, :scope > .heading');
  const cta = textCell.querySelector(':scope > .cta-wrapper');
  const titleAt = title ? children.indexOf(title) : -1;
  const ctaAt = cta ? children.indexOf(cta) : -1;

  // the status line: the paragraphs before the title
  if (titleAt > 0) {
    children.slice(0, titleAt).filter((el) => el.matches('p')).forEach((p) => {
      p.classList.add('dealer-status');
      markSeparators(p);
    });
  }

  // the address: the paragraphs between the title and the buttons (or all after the title
  // when there are no buttons)
  const addressEnd = ctaAt >= 0 ? ctaAt : children.length;
  children.slice(titleAt + 1, addressEnd)
    .filter((el) => el.matches('p'))
    .forEach((p) => p.classList.add('dealer-address'));

  // the main column: everything up to the buttons
  const main = document.createElement('div');
  main.className = 'dealer-main';
  const mainEls = children.slice(0, ctaAt >= 0 ? ctaAt + 1 : children.length);
  if (mainEls.length) {
    mainEls[0].before(main);
    main.append(...mainEls);
  }

  // the product card: the paragraphs after the buttons, and the Video Thumbnail
  const cardLines = ctaAt >= 0
    ? children.slice(ctaAt + 1).filter((el) => el.matches('p') && el.textContent.trim())
    : [];
  if (cardLines.length || thumb) {
    const card = document.createElement('div');
    card.className = 'dealer-card';
    const copy = document.createElement('div');
    copy.className = 'dealer-card-copy';
    cardLines.forEach((p, i) => {
      p.classList.remove('subtext');
      p.classList.add(i ? 'dealer-card-text' : 'dealer-card-title');
      if (!i) markTag(p);
      copy.append(p);
    });
    card.append(copy);
    if (thumb) {
      const pic = optimizedPicture(thumb.src, thumb.alt || '', false, [{ width: '480' }]);
      pic.classList.add('dealer-card-media');
      const img = pic.querySelector('img');
      img.classList.add('dealer-card-img');
      moveInstrumentation(thumb, img);
      card.append(pic);
    }
    textCell.append(card);
  }

  // the outlined button glitches on hover too (scripts/utils/glitch.js), as the main one
  cta?.querySelectorAll('a.cta-secondary').forEach((a) => { a.dataset.glitch = ''; });

  block.replaceChildren(bg, textCell, ...rest);
  stageEntrance(block, title?.matches('.heading') ? title : title?.querySelector('.heading'));
}
