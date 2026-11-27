// Dealer hero Text order: status line, H1 name, address, buttons, then product-card paragraphs

import { inEditor } from '../../scripts/utils/common.js';

const SEPARATOR = /\s+·\s+/;
const TAG = /^(\s*\[[^\]]*\])\s*/;

// entrance ends by 2.83s (hero-dealer.css); max frames to await layout (section shows late)
const ENTRANCE_MS = 3000;
const LAYOUT_FRAMES = 300;

/** Wraps " · " separators in an aria-hidden dot so the text reads out as authored. */
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

/** Wraps a leading "[ New ]" of the card title in a tag span. */
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

/** Splits a plain-text title into its rendered lines for the rise; null if it has inline markup. */
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
    // the space keeps words apart in the accessible text
    line.append(inner, ' ');
    return line;
  });
  el.replaceChildren(...lineEls);
  return { lines: lineEls, restore: () => el.replaceChildren(...original) };
}

/** Splits the title for the line rise once laid out, then restores it; off in UE/reduced motion. */
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
    // re-split when web fonts load (line breaks can change), continuing the rise where it is
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

  if (titleAt > 0) {
    children.slice(0, titleAt).filter((el) => el.matches('p')).forEach((p) => {
      p.classList.add('dealer-status');
      markSeparators(p);
    });
  }

  // address: paragraphs between title and buttons (all after the title when no buttons)
  const addressEnd = ctaAt >= 0 ? ctaAt : children.length;
  children.slice(titleAt + 1, addressEnd)
    .filter((el) => el.matches('p'))
    .forEach((p) => p.classList.add('dealer-address'));

  const main = document.createElement('div');
  main.className = 'dealer-main';
  const mainEls = children.slice(0, ctaAt >= 0 ? ctaAt + 1 : children.length);
  if (mainEls.length) {
    mainEls[0].before(main);
    main.append(...mainEls);
  }

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

  // the outlined button also gets the hover glitch (scripts/utils/glitch.js)
  cta?.querySelectorAll('a.cta-secondary').forEach((a) => { a.dataset.glitch = ''; });

  block.replaceChildren(bg, textCell, ...rest);
  stageEntrance(block, title?.matches('.heading') ? title : title?.querySelector('.heading'));
}
