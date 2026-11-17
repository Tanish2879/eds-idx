import { createOptimizedPicture, loadCSS } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const AUTOPLAY_MS = 3000;
// cards the ring holds at least: five on show plus spares on both sides
const RING_MIN = 14;
// cards authors may add to a carousel
const CARDS_MIN = 6;
const CARDS_MAX = 12;
// mid-run the next card sets off this much before the last one lands, so the
// strip never rests for a frame in between (about two frames)
const RUN_OVERLAP_MS = 32;

/**
 * Universal Editor can't limit how many items a block holds, so the carousel
 * tells the author on the canvas when the count is outside the limits.
 * @param {Element} block
 * @param {number} count authored cards
 */
function showCardLimit(block, count) {
  let message = '';
  if (count < CARDS_MIN) {
    const more = CARDS_MIN - count;
    message = `Add ${more} more card${more === 1 ? '' : 's'}`;
  } else if (count > CARDS_MAX) {
    const extra = count - CARDS_MAX;
    message = `Remove ${extra} card${extra === 1 ? '' : 's'}`;
  }
  if (!message) return;
  const note = document.createElement('p');
  note.className = 'limit';
  note.setAttribute('role', 'alert');
  note.textContent = `${message}: the carousel takes ${CARDS_MIN} to ${CARDS_MAX} cards (now ${count}).`;
  block.prepend(note);
}

/**
 * Builds a nav arrow button. The arrow is /icons/arrow-right.svg used as a CSS
 * mask, so its colour comes from CSS alone and can't fall back to the SVG's
 * black when Safari repaints the button on tap.
 * @param {string} dir 'prev' | 'next'
 * @param {string} label accessible label
 * @returns {HTMLButtonElement}
 */
function createNavButton(dir, label) {
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

/**
 * Carousel variant: a flat strip of equal square cards with the active card
 * centred. Prev/next, arrow keys, swipe and clicking a side card move the
 * strip one card at a time, wrapping around; it also auto-advances, pausing
 * on interaction, when off-screen, or under prefers-reduced-motion.
 * Other styles reuse the engine (e.g. the Timeline style, cards-timeline.js)
 * with their own controls, through `options`.
 * @param {Element} block
 * @param {HTMLUListElement} ul the decorated card list
 * @param {object} [options]
 * @param {boolean} [options.autoplay=true] advance on its own
 * @param {number} [options.interval] ms each centre card stays at rest before
 *   autoplay moves on (default AUTOPLAY_MS)
 * @param {boolean} [options.moveOnArrival=true] autoplay's first move plays as
 *   soon as the carousel comes on screen, rather than after the usual wait
 * @param {boolean} [options.nav=true] add the prev/next buttons
 * @param {boolean} [options.limit=true] in Universal Editor, tell the author
 *   when the card count is outside the carousel's limits (a style with its
 *   own limits shows its own notice)
 * @param {number} [options.start] authored index of the first centre card
 *   (default: the middle one)
 * @param {function(number): void} [options.onChange] called with the authored
 *   index of the centre card whenever a new one takes the centre (and once at
 *   the start); in a move of several cards, only the last one does, as it
 *   glides in, not every card passing the centre on the way. The second
 *   argument, `{ auto }`, tells an autoplay move from the visitor's own
 * @returns {{ goTo: function(number, {glide?: boolean}=): void,
 *   go: function(number): void, hold: function(boolean): void,
 *   playNow: function(): void }|null}
 *   controls for the ring (`hold` pauses autoplay until released, `playNow`
 *   plays its next move without the wait), or null when it isn't running
 *   (editor, < 2 cards)
 */
function decorateCarousel(block, ul, options = {}) {
  const {
    autoplay = true, interval = AUTOPLAY_MS, moveOnArrival = true, nav: withNav = true,
    limit = true, onChange, start,
  } = options;
  // the section title is a Title component (default content) in the same
  // section; class it so the carousel CSS can style it without an h2 selector
  block.closest('.section')
    ?.querySelectorAll('.default-content-wrapper > :is(h1, h2, h3, h4, h5, h6)')
    .forEach((heading) => heading.classList.add('carousel-title'));

  // In Universal Editor show a still row instead, so every card and its
  // fields stay reachable while authoring
  if (block.closest('[data-aue-resource]') || document.querySelector('[data-aue-resource]')) {
    block.classList.add('is-static');
    if (limit) showCardLimit(block, ul.children.length);
    return null;
  }

  // cards past the limit stay out of the live carousel
  [...ul.children].slice(CARDS_MAX).forEach((li) => li.remove());
  const authored = [...ul.children];
  if (authored.length < 2) return null;

  ul.classList.add('carousel-track');

  // A move needs a spare card on each side of the five on show: one glides in
  // as another glides out. A short list would have to jump a card across the
  // ring instead, so it is repeated, whole sets in order, until the ring is as
  // full as a long one
  while (ul.children.length < RING_MIN) {
    authored.forEach((li) => ul.append(li.cloneNode(true)));
  }
  const cards = [...ul.children];

  const stage = document.createElement('div');
  stage.className = 'carousel-stage';
  stage.append(ul);

  const nav = document.createElement('div');
  nav.className = 'carousel-nav';
  const prev = createNavButton('prev', 'Previous');
  const next = createNavButton('next', 'Next');
  nav.append(prev, next);

  // a swipe must move the strip, not pick up a card image (native image drag
  // on desktop, drag and drop on iPad), which cancels the swipe
  ul.querySelectorAll('img').forEach((img) => { img.draggable = false; });
  stage.addEventListener('dragstart', (e) => e.preventDefault());

  block.replaceChildren(stage);
  if (withNav) block.append(nav);

  let active = start ?? Math.floor(authored.length / 2);
  let pending = 0; // cards still to move by, signed (see step)
  let reported = -1;
  let auto = false; // the move under way is autoplay's, not the visitor's
  const offsets = new Map();

  // clones repeat the authored set in order, so the authored index is the
  // ring index modulo the set size. Cards only passing the centre in a move of
  // several cards (more to come) aren't reported
  const report = () => {
    if (pending) return;
    const index = active % authored.length;
    if (onChange && index !== reported) onChange(index, { auto });
    reported = index;
  };

  // instant: every card switches to its new place without animating (a jump
  // to a picked card, see goTo)
  const paint = (instant = false) => {
    const n = cards.length;
    cards.forEach((li, i) => {
      // shortest signed distance around the ring, so the strip wraps both ways
      let offset = i - active;
      if (offset > n / 2) offset -= n;
      if (offset < -n / 2) offset += n;
      // a card wrapping from one end to the other jumps without animating
      const jumped = instant
        || (offsets.has(li) && Math.abs(offset - offsets.get(li)) > 1);
      offsets.set(li, offset);
      const abs = Math.abs(offset);
      li.classList.toggle('is-jumping', jumped);
      li.classList.toggle('is-active', abs === 0);
      li.classList.toggle('is-near', abs === 1);
      li.classList.toggle('is-far', abs === 2);
      li.classList.toggle('is-hidden', abs > 2);
      li.style.setProperty('--offset', offset);
      li.style.setProperty('--dir', Math.sign(offset));
      li.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
    });
    // flush layout so jumps apply instantly, then restore transitions
    ul.getBoundingClientRect();
    cards.forEach((li) => li.classList.remove('is-jumping'));
    report();
  };

  // Moves play one card at a time, so the ring keeps its shape however fast
  // the controls are used: a move asked for mid-glide is queued (opposite
  // directions cancel out), and queued moves play faster (`is-rushing`).
  // A move of several cards is marked as one run, so a style can time it as
  // a single glide: `is-run-start` on its first card, `is-rushing` until its
  // last, `is-run-end` on its last (the Carousel style leaves these be).
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // only a real mouse can rest on a card; touch screens have no hover
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let moving = false;
  let running = false; // mid-way through a run, more cards to come
  const endRun = () => {
    running = false;
    block.classList.remove('is-rushing', 'is-run-start', 'is-run-end');
  };

  // Autoplay advances on its own while the carousel is on screen. The next
  // automatic move always comes `interval` after the strip has come to rest,
  // so any interaction (tap, click, swipe, arrows, keys) is a brief pause that
  // resumes by itself. It also waits while a finger or mouse button is down,
  // while the mouse rests on the centre card, or while the stage has keyboard
  // focus, or while a style holds it (see `hold`).
  let timer = 0;
  let inView = false;
  let pressing = false;
  let focused = false;
  let held = false;
  let hovered = null; // the centre card the mouse rests on

  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
  };
  const schedule = (delay = interval) => {
    stop();
    if (!autoplay || reduce || !inView || pressing || focused || held || hovered || moving
      || pending || document.hidden) return;
    // eslint-disable-next-line no-use-before-define
    timer = window.setTimeout(() => go(1, true), delay);
  };

  const moveMs = () => {
    const value = getComputedStyle(block).getPropertyValue('--carousel-move').trim();
    return reduce ? 0 : parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
  };
  const step = () => {
    if (moving) return;
    if (!pending) {
      schedule();
      return;
    }
    stop();
    const dir = Math.sign(pending);
    pending -= dir;
    const first = !running;
    running = pending !== 0;
    block.classList.toggle('is-rushing', running);
    block.classList.toggle('is-run-start', first && running);
    block.classList.toggle('is-run-end', !first && !running);
    active = (active + dir + cards.length) % cards.length;
    moving = true;
    paint();
    // a hovered card that just left the centre no longer holds autoplay
    if (hovered && !hovered.classList.contains('is-active')) hovered = null;
    window.setTimeout(() => {
      moving = false;
      if (!pending) {
        endRun();
        // a run cut short (the opposite way asked for mid-move) ends here
        report();
      }
      step();
    }, Math.max(0, moveMs() - (running ? RUN_OVERLAP_MS : 0)));
  };
  const go = (dir, byAutoplay = false) => {
    auto = byAutoplay;
    pending = Math.max(-cards.length, Math.min(cards.length, pending + dir));
    step();
  };

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  let swiped = false; // the press that ended was a swipe, not a tap

  // signed distance (in cards) from where the ring is heading to card i
  const distanceTo = (i) => {
    const n = cards.length;
    let offset = (i - active - pending + n * 2) % n;
    if (offset > n / 2) offset -= n;
    return offset;
  };

  cards.forEach((li, i) => {
    li.addEventListener('click', () => {
      if (swiped) return;
      // a side card comes to the centre one card at a time, like the arrows;
      // tapping the centre card just restarts the countdown
      const offset = distanceTo(i);
      if (offset) go(offset);
      else schedule();
    });
    li.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !finePointer.matches
        || !li.classList.contains('is-active')) return;
      hovered = li;
      stop();
    });
    li.addEventListener('pointerleave', () => {
      if (hovered !== li) return;
      hovered = null;
      schedule();
    });
  });

  stage.tabIndex = 0;
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  stage.addEventListener('focusin', () => {
    focused = stage.matches(':focus-visible');
    schedule();
  });
  stage.addEventListener('focusout', () => {
    focused = false;
    schedule();
  });

  let startX = null;
  stage.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    swiped = false;
    pressing = true;
    stop();
  });
  stage.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    swiped = Math.abs(dx) > 40;
    if (swiped) go(dx < 0 ? 1 : -1);
  });
  // the press can end anywhere (or be taken over by a page scroll)
  const release = () => {
    if (!pressing) return;
    pressing = false;
    startX = null;
    schedule();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  document.addEventListener('visibilitychange', schedule);

  // The first move plays as soon as the carousel is mostly on screen, so it's
  // already turning when the visitor arrives; the regular rhythm follows.
  // Leaving the screen re-arms it for the next visit. Without moveOnArrival
  // the centre card first stays for the usual wait.
  let arrived = false;
  const io = new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio >= 0.2;
    if (!inView) arrived = false;
    if (moveOnArrival && inView && !arrived && entry.intersectionRatio >= 0.6) {
      arrived = true;
      schedule(0);
      return;
    }
    schedule();
  }, { threshold: [0, 0.2, 0.6] });
  io.observe(stage);

  paint();

  return {
    go,
    // pauses autoplay while on (e.g. a style's menu is open) and resumes it,
    // after the usual wait, once off
    hold: (on) => {
      held = on;
      schedule();
    },
    // the next autoplay move plays now rather than after the wait (unless
    // autoplay is paused, e.g. the mouse on the centre card)
    playNow: () => schedule(0),
    // brings the nearest copy of authored card `index` to the centre: by
    // default a jump (no card-by-card glide, the strip simply shows it
    // centred); with `glide`, card by card the shorter way round, exactly as a
    // click on a side card does
    goTo: (index, { glide = false } = {}) => {
      const target = cards
        .map((li, i) => i)
        .filter((i) => i % authored.length === index)
        .reduce((a, b) => (Math.abs(distanceTo(b)) < Math.abs(distanceTo(a)) ? b : a));
      if (glide) {
        const offset = distanceTo(target);
        if (offset) go(offset);
        else schedule();
        return;
      }
      pending = 0;
      auto = false;
      endRun();
      if (target === active) {
        schedule();
        return;
      }
      active = target;
      paint(true);
      schedule();
    },
  };
}

export default async function decorate(block) {
  const ul = document.createElement('ul');
  ul.className = 'card-list';
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'card';
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'card-image';
      } else {
        div.className = 'card-body';
        div.querySelectorAll('p').forEach((p) => p.classList.add('card-text'));
      }
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    const optimizedImg = optimizedPic.querySelector('img');
    optimizedImg.classList.add('card-img');
    moveInstrumentation(img, optimizedImg);
    img.closest('picture').replaceWith(optimizedPic);
  });
  block.replaceChildren(ul);

  // Timeline style (About Us): its CSS/JS are fetched only when the style is
  // used, so other cards blocks don't pay for them. Awaited, so the section
  // is shown already styled.
  if (block.classList.contains('timeline')) {
    const [, { default: decorateTimeline }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards-timeline.css`),
      import('./cards-timeline.js'),
    ]);
    decorateTimeline(block, ul, decorateCarousel);
    return;
  }

  // Pillars style (About Us): likewise fetched only when used
  if (block.classList.contains('pillars')) {
    const [, { default: decoratePillars }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards-pillars.css`),
      import('./cards-pillars.js'),
    ]);
    decoratePillars(block, ul);
    return;
  }

  // Roller style (homepage highlights): likewise fetched only when used
  if (block.classList.contains('roller')) {
    const [, { default: decorateRoller }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards-roller.css`),
      import('./cards-roller.js'),
    ]);
    decorateRoller(block, ul);
    return;
  }

  if (block.classList.contains('carousel')) decorateCarousel(block, ul);
}
