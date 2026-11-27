// Cards "Carousel" style in a Light section (Code T highlights)

import decorateBrochure from '../../scripts/utils/brochure.js';
import { inEditor, onAuthor } from '../../scripts/utils/common.js';

const pad = (n) => String(n).padStart(2, '0');

// strip move (ms) and its ease: speeds up over the first 40%, settles over the rest
const MOVE_MS = 1350;
const DRAG_MOVE_MS = 1050;
const moveEase = (t) => (t < 0.4 ? 0.4 * (t / 0.4) ** 3 : 1 - 0.6 * ((1 - t) / 0.6) ** 3);
// arriving photo: settles from this scale, drifted this % of its width, over SETTLE_MS
const SETTLE_MS = 1900;
const SETTLE_SCALE = 1.1;
const SETTLE_DRIFT = 3.5;
const SETTLE_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
// least cards in the ring (whole sets repeated), so wrapping happens off screen
const RING_MIN = 8;
// drag: px before a press is a drag, frames a flick carries on, share of a card to move on
const DRAG_START = 6;
const FLICK_FRAMES = 10;
const DRAG_NEXT = 0.12;
// sideways wheel px for one card, then a rest (ms) so one swipe moves one card
const WHEEL_STEP = 40;
const WHEEL_REST_MS = 650;
// share of the section on screen for the arrow keys to move the strip
const KEYS_IN_VIEW = 0.6;

// button glitch (the prototype's), in ms: each letter blinks out once within GLITCH_START, a share
// of them twice (dipping to GLITCH_DIP)
const GLITCH_START = 220;
const GLITCH_SECOND = 0.35;
const GLITCH_DIP = 0.15;
const QUAD_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

// cards authors may add; visitors get the first CARDS_MAX
const CARDS_MIN = 3;
const CARDS_MAX = 6;

// title lines, and the smallest px titles shrink to before they are cut
const TITLE_LINES = 2;
// tablets (stacked cards, 600–899px): the description takes up to 3 lines, and the image keeps
// its size
const TABLET = window.matchMedia('(width >= 600px) and (width < 900px)');
const TABLET_TEXT_LINES = 3;
const TITLE_MIN = 18;
// times (and most share of the card) a stacked card takes a line's room from its image
const GROW_TRIES = 3;
const GROW_MAX = 0.1;

/** A line's height in px */
function lineHeight(el) {
  const { lineHeight: lh, fontSize } = getComputedStyle(el);
  if (lh.endsWith('px')) return parseFloat(lh);
  // 'normal' is about 1.2 for most fonts
  return (parseFloat(lh) || 1.2) * parseFloat(fontSize);
}

/** Names the parts of a card's text, as authored in its Text field */
function classCard(li) {
  const cells = [...li.children];
  cells.forEach((cell) => {
    if (cell.classList.contains('card-body') && !cell.children.length && !cell.textContent.trim()) {
      cell.className = 'card-image';
    }
  });
  const body = cells.find((cell) => cell.classList.contains('card-body'));
  if (!body) return undefined;
  const parts = [...body.children];
  const title = parts.find((el) => el.matches('h1, h2, h3, h4, h5, h6'));
  const last = parts.at(-1);
  parts.forEach((el) => {
    if (el === title) el.classList.add('title');
    else if (title && el.nextElementSibling === title && el.matches('p')) el.classList.add('label');
    else if (el === last && el.matches('p') && el.children.length === 1
      && el.firstElementChild.matches('a[href]')
      && el.textContent.trim() === el.firstElementChild.textContent.trim()) {
      el.classList.add('cta');
    } else el.classList.add('text');
  });
  return body;
}

/** Undoes fitCard, so the card's text can be measured afresh */
function unfit(body) {
  body.closest('.card')?.style.removeProperty('--copy-more');
  body.querySelectorAll('.is-cut, .is-off, .is-more').forEach((el) => {
    el.classList.remove('is-cut', 'is-off', 'is-more');
    el.style.removeProperty('--lines');
  });
}

/** The card titles share one size */
function fitTitles(block) {
  const titles = [...block.querySelectorAll('.card-body .title')];
  if (!titles.length) return;
  const lines = (title) => Math.round(title.offsetHeight / lineHeight(title));
  const setSize = (px) => titles.forEach((title) => {
    if (px) title.style.fontSize = `${px}px`;
    else title.style.removeProperty('font-size');
  });
  setSize(TITLE_MIN);
  const fitting = titles.filter((title) => lines(title) <= TITLE_LINES);
  setSize(0);
  const start = parseFloat(getComputedStyle(titles[0]).fontSize);
  const tooLong = () => fitting.some((title) => lines(title) > TITLE_LINES);
  for (let size = start - 1; size >= TITLE_MIN && tooLong(); size -= 1) setSize(size);
}

/** Ends the text before a part left out whole with an ellipsis, so the cut shows */
function endBefore(el) {
  const prev = el.previousElementSibling;
  if (!prev?.classList.contains('text') || prev.classList.contains('is-off')) return;
  if (prev.matches('ul, ol')) {
    [...prev.children].filter((item) => !item.classList.contains('is-off')).at(-1)
      ?.classList.add('is-more');
    return;
  }
  if (!prev.matches('p, h1, h2, h3, h4, h5, h6')) return;
  const lines = Math.round(prev.offsetHeight / lineHeight(prev));
  if (lines >= 2) {
    prev.style.setProperty('--lines', lines - 1);
    prev.classList.add('is-cut');
  } else prev.classList.add('is-more');
}

/** Keeps a card's text inside its card */
function fitCard(body, more = 0, tries = 0) {
  if (!body.clientHeight) return false;
  const styles = getComputedStyle(body);
  const cta = body.querySelector(':scope > .cta');
  const ctaRoom = cta ? cta.offsetHeight + (parseFloat(styles.getPropertyValue('--cta-gap')) || 0) : 0;
  const room = body.clientHeight - parseFloat(styles.paddingBottom) - ctaRoom;
  let full = false;
  let textShown = false;
  let short = 0; // px the title's or description's first line is short of, when not one fits
  // a label or link too long for its one line ends in an ellipsis (CSS)
  let cut = [body.querySelector(':scope > .label'), cta?.firstElementChild]
    .some((el) => el && el.scrollWidth > el.clientWidth + 1);
  [...body.children].filter((el) => el !== cta).forEach((el) => {
    if (full) {
      el.classList.add('is-off');
      cut = true;
      return;
    }
    if (el.matches('ul, ol')) {
      const { top } = body.getBoundingClientRect();
      const items = [...el.children];
      const bottom = (item) => item.getBoundingClientRect().bottom - top;
      if (!textShown) {
        const [firstItem] = items;
        if (firstItem && bottom(firstItem) > room && !short) short = bottom(firstItem) - room;
      }
      items.filter((item) => bottom(item) > room).forEach((item) => item.classList.add('is-off'));
      const shown = items.filter((item) => !item.classList.contains('is-off'));
      if (shown.length) textShown = true;
      if (shown.length === items.length) return;
      full = true;
      cut = true;
      if (shown.length) shown.at(-1).classList.add('is-more');
      else {
        el.classList.add('is-off');
        endBefore(el);
      }
      return;
    }
    const lh = lineHeight(el);
    let max = Infinity;
    if (el.classList.contains('title')) max = TITLE_LINES;
    else if (el.classList.contains('text') && TABLET.matches) max = TABLET_TEXT_LINES;
    const free = Math.floor((room + 1 - el.offsetTop) / lh);
    const allowed = Math.min(max, free);
    if (Math.round(el.offsetHeight / lh) <= allowed) {
      if (el.classList.contains('text')) textShown = true;
      return;
    }
    cut = true;
    if (el.classList.contains('text') && allowed >= 1) textShown = true;
    const first = el.classList.contains('title') || (el.classList.contains('text') && !textShown);
    if (first && allowed < 1 && !short) short = el.offsetTop + lh - room;
    // lines of text are cut; anything else (a table, an embed) that doesn't fit is left out
    if (allowed >= 1 && el.matches('p, h1, h2, h3, h4, h5, h6')) {
      el.style.setProperty('--lines', allowed);
      el.classList.add('is-cut');
    } else {
      el.classList.add('is-off');
      endBefore(el);
    }
    // a title cut to its lines still leaves room below it; a cut description ends the text
    if (free < max || el.classList.contains('text')) full = true;
  });
  const card = body.closest('.card');
  const grow = card ? Math.min(more + short, card.clientHeight * GROW_MAX) : 0;
  if (short > 0 && grow > more && tries < GROW_TRIES && !TABLET.matches
    && getComputedStyle(card).gridTemplateColumns.trim().split(/\s+/).length === 1) {
    unfit(body);
    card.style.setProperty('--copy-more', `${Math.ceil(grow)}px`);
    return fitCard(body, grow, tries + 1);
  }
  return cut;
}

/** Shows, updates or (with no text) removes one of the notes for authors */
function setNote(block, key, text) {
  let box = block.querySelector(':scope > .carousel-note');
  if (box?.dataset.hidden) return;
  let line = box?.querySelector(`[data-note="${key}"]`);
  if (!text) {
    line?.remove();
    if (box && !box.querySelector('[data-note]')) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement('p');
    box.className = 'carousel-note';
    box.setAttribute('role', 'alert');
    box.title = 'Click to hide';
    box.addEventListener('click', () => {
      box.replaceChildren();
      box.dataset.hidden = 'true';
    });
    const hint = document.createElement('small');
    hint.className = 'hint';
    hint.textContent = '(Click to hide.)';
    box.append(hint);
    block.prepend(box);
  }
  if (!line) {
    line = document.createElement('span');
    line.dataset.note = key;
    box.querySelector(':scope > .hint').before(line);
  }
  line.textContent = text;
}

/** Tells authors when the card count is outside CARDS_MIN to CARDS_MAX */
function noteCount(block, added) {
  const plural = (k) => `card${k === 1 ? '' : 's'}`;
  if (added > CARDS_MAX) {
    const extra = added - CARDS_MAX;
    setNote(block, 'count', `Remove ${extra} ${plural(extra)}: the highlights carousel takes at most ${CARDS_MAX} cards (now ${added}). Only the first ${CARDS_MAX} show on the published page.`);
  } else if (added < CARDS_MIN) {
    const missing = CARDS_MIN - added;
    setNote(block, 'count', `Add ${missing} more ${plural(missing)}: the highlights carousel needs at least ${CARDS_MIN} cards (now ${added}).`);
  }
}

/** The section's brochure links */
function decorateSectionBrochure(block) {
  const content = block.closest('.cards-wrapper')?.nextElementSibling;
  if (!content?.matches('.default-content-wrapper')) return;
  if (!decorateBrochure(content, 'carousel-brochure-links')) return;
  const toggle = content.querySelector('.brochure-toggle');
  const text = document.createElement('span');
  text.className = 'brochure-text';
  text.append(...toggle.childNodes);
  toggle.append(text);
}

/** The prototype's button glitch: on hover each letter blinks out at random, some twice */
function glitchHover(link) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let letters = null;
  let running = [];
  link.addEventListener('mouseenter', () => {
    if (!letters) {
      const text = link.textContent;
      link.setAttribute('aria-label', text.trim());
      link.textContent = '';
      letters = [...text].map((ch) => {
        const span = document.createElement('span');
        span.className = 'glitch-l';
        span.textContent = ch;
        link.append(span);
        return span;
      });
    }
    running.forEach((anim) => anim.cancel());
    running = letters.filter((span) => span.textContent.trim()).map((span) => {
      const start = Math.random() * GLITCH_START;
      const back = 60 + Math.random() * 100;
      const frames = [[0, 1], [40, 0], [back, 0], [back + 60, 1]];
      let end = back + 60;
      if (Math.random() < GLITCH_SECOND) {
        const again = 240 + Math.random() * 100;
        end = again + 100;
        frames.push(
          [again, 1, QUAD_OUT],
          [again + 30, GLITCH_DIP],
          [again + 50, GLITCH_DIP, QUAD_OUT],
          [end, 1],
        );
      }
      return span.animate(frames.map(([t, opacity, easing = 'linear']) => ({
        offset: t / end, opacity, easing,
      })), { duration: end, delay: start });
    });
  });
}

/** A nav arrow, as the Carousel engine's (its arrow is a CSS mask, cards.css) */
function navButton(dir, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `carousel-btn carousel-${dir}`;
  btn.setAttribute('aria-label', label);
  const icon = document.createElement('span');
  icon.className = 'carousel-icon';
  icon.setAttribute('aria-hidden', 'true');
  btn.append(icon);
  return btn;
}

/** The strip and its motion, as the prototype's */
function decorateStrip(block, ul, onChange) {
  const authored = [...ul.children];
  const total = authored.length;
  while (ul.children.length < RING_MIN) {
    authored.forEach((li) => ul.append(li.cloneNode(true)));
  }
  const cards = [...ul.children];
  const n = cards.length;
  ul.classList.add('carousel-track');
  ul.querySelectorAll('img').forEach((img) => { img.draggable = false; });

  const stage = document.createElement('div');
  stage.className = 'carousel-stage';
  // named by the section's heading; not a Tab stop (the arrow keys work while it is on screen,
  // and its links and arrow buttons take focus)
  const section = block.closest('.section');
  const heading = section?.querySelector('h1, h2, h3');
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-roledescription', 'carousel');
  stage.setAttribute('aria-label', heading?.textContent.trim() || 'Highlights');
  stage.append(ul);
  const nav = document.createElement('div');
  nav.className = 'carousel-nav';
  const prev = navButton('prev', 'Previous');
  const next = navButton('next', 'Next');
  nav.append(prev, next);
  block.replaceChildren(stage, nav);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrap = (v) => ((v % n) + n) % n;
  // signed distance, in cards around the ring, from position `from` to card i
  const distance = (i, from) => wrap(i - from + n / 2) - n / 2;
  // one card's width plus the gap, in px
  const step = () => cards[0].offsetWidth
    + (parseFloat(getComputedStyle(block).getPropertyValue('--card-gap')) || 0);

  let pos = 0; // where the strip is, in cards (unbounded; the ring wraps it)
  let target = 0; // the card it is heading to (unbounded)
  let frame = 0;

  const paint = () => {
    cards.forEach((li, i) => {
      const d = distance(i, pos);
      li.style.setProperty('--offset', d.toFixed(4));
      li.style.setProperty('--a', Math.max(0, 1 - Math.abs(d)).toFixed(3));
    });
  };

  // the centre card: named for screen readers and the CSS; the others' links out of the tab order
  const setActive = () => {
    const active = wrap(target);
    cards.forEach((li, i) => {
      const on = i === active;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-hidden', String(!on));
      li.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').forEach((el) => {
        if (!on) {
          if (!('tabHold' in el.dataset)) el.dataset.tabHold = el.getAttribute('tabindex') ?? '';
          el.tabIndex = -1;
        } else if ('tabHold' in el.dataset) {
          if (el.dataset.tabHold) el.setAttribute('tabindex', el.dataset.tabHold);
          else el.removeAttribute('tabindex');
          delete el.dataset.tabHold;
        }
      });
    });
    onChange(active % total);
  };

  const settlePhoto = (dir) => {
    const img = cards[wrap(target)].querySelector('.card-img');
    if (reduce || !img?.animate) return;
    img.animate([
      { transform: `translateX(${dir * SETTLE_DRIFT}%) scale(${SETTLE_SCALE})` },
      { transform: 'none' },
    ], { duration: SETTLE_MS, easing: SETTLE_EASE });
  };

  const glide = (ms) => {
    cancelAnimationFrame(frame);
    const from = pos;
    const way = target - from;
    if (reduce || !way) {
      pos = target;
      paint();
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      pos = from + way * moveEase(t);
      paint();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  const goTo = (to, ms = MOVE_MS) => {
    const from = target;
    target = to;
    if (to !== from) {
      setActive();
      settlePhoto(Math.sign(to - from));
    }
    glide(ms);
  };

  prev.addEventListener('click', () => goTo(target - 1));
  next.addEventListener('click', () => goTo(target + 1));

  let press = null;
  let dragging = false;
  let dragged = false; // the press that just ended was a drag, not a click
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = {
      id: e.pointerId, x: e.clientX, lastX: e.clientX, lastT: performance.now(), speed: 0,
    };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!dragging) {
      if (Math.abs(e.clientX - press.x) <= DRAG_START) return;
      // caught mid-glide: the strip stops where it is and follows from there
      cancelAnimationFrame(frame);
      dragging = true;
      press.x = e.clientX;
      press.pos = pos;
      press.width = step();
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(e.pointerId);
    }
    const now = performance.now();
    press.speed = ((e.clientX - press.lastX) / Math.max(1, now - press.lastT)) * 16;
    press.lastX = e.clientX;
    press.lastT = now;
    pos = press.pos - (e.clientX - press.x) / press.width;
    paint();
  });
  const release = () => {
    if (!press) return;
    const { speed, width } = press;
    press = null;
    if (!dragging) return;
    dragging = false;
    dragged = true;
    stage.classList.remove('is-dragging');
    let to = Math.round(pos - (speed * FLICK_FRAMES) / width);
    if (to === target && Math.abs(pos - target) > DRAG_NEXT) to = target + (pos > target ? 1 : -1);
    goTo(to, DRAG_MOVE_MS);
    // the click that ends a drag neither moves to a card nor follows a link
    setTimeout(() => { dragged = false; });
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  stage.addEventListener('click', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  stage.addEventListener('dragstart', (e) => e.preventDefault());

  // a side card comes to the centre
  cards.forEach((li, i) => {
    li.addEventListener('click', () => {
      const d = distance(i, target);
      if (d) goTo(target + d);
    });
  });

  // a sideways swipe on a trackpad moves one card, then rests
  let wheel = 0;
  let wheelRest = 0;
  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelRest) return;
    wheel += e.deltaX;
    if (Math.abs(wheel) <= WHEEL_STEP) return;
    goTo(target + Math.sign(wheel));
    wheel = 0;
    wheelRest = now + WHEEL_REST_MS;
  }, { passive: false });

  // the arrow keys, while the section is on screen (not while typing)
  let inView = false;
  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio >= KEYS_IN_VIEW;
  }, { threshold: [0, KEYS_IN_VIEW] }).observe(section || block);
  document.addEventListener('keydown', (e) => {
    if (!inView || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    goTo(target + (e.key === 'ArrowRight' ? 1 : -1));
  });

  setActive();
  paint();
  return nav;
}

/** Decorates the style */
export default function decorateCarouselLight(block, ul, decorateCarousel) {
  block.classList.add('carousel-light');
  const added = ul.children.length;
  const total = Math.min(added, CARDS_MAX);
  const author = onAuthor();
  // before the ring is filled with copies, so every copy is named too
  [...ul.children].forEach(classCard);

  const count = document.createElement('p');
  count.className = 'carousel-count';
  count.setAttribute('aria-live', 'polite');
  const current = document.createElement('b');
  const of = document.createElement('span');
  of.textContent = `/ ${pad(total)}`;
  count.append(current, of);

  if (inEditor() || total < 2) {
    decorateCarousel(block, ul, { autoplay: false, start: 0, limit: false });
    if (author) noteCount(block, added);
    return;
  }
  // the section title, as the engine classes it for the carousel CSS
  block.closest('.section')
    ?.querySelectorAll('.default-content-wrapper > :is(h1, h2, h3, h4, h5, h6)')
    .forEach((heading) => heading.classList.add('carousel-title'));
  [...ul.children].slice(CARDS_MAX).forEach((li) => li.remove());
  const nav = decorateStrip(block, ul, (index) => { current.textContent = pad(index + 1); });
  ul.querySelectorAll('.cta > a').forEach(glitchHover);
  nav.prepend(count);
  decorateSectionBrochure(block);
  if (author) noteCount(block, added);

  // every card in the ring, clones included; a clone's authored number is its place modulo total
  const bodies = [...ul.children].map((li) => li.querySelector('.card-body'));
  const fit = () => {
    bodies.forEach((body) => body && unfit(body));
    fitTitles(block);
    const cut = new Set();
    bodies.forEach((body, i) => {
      if (body && fitCard(body)) cut.add((i % total) + 1);
    });
    if (!author) return;
    const which = [...cut].sort((a, b) => a - b);
    const cards = which.length > 1 ? `cards ${which.slice(0, -1).join(', ')} and ${which.at(-1)}` : `card ${which[0]}`;
    setNote(block, 'text', which.length ? `Shorten the text of ${cards}: it doesn't fit on the card, so the end is cut off.` : '');
  };

  // when the section shows (it is hidden while it loads), on resize and once the fonts are in
  let frame = 0;
  const refit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  new ResizeObserver(refit).observe(block);
  document.fonts?.ready.then(refit);
  // ready can resolve before the display face is in; a face swapped in later rewraps the text
  document.fonts?.addEventListener?.('loadingdone', refit);
}
