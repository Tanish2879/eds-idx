// Social Deck "Strip" style: the cards in a flat, horizontally scrolling row
// with prev/next buttons, instead of the arc

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Builds a prev/next button.
 * @param {string} dir 'prev' | 'next'
 * @param {string} label accessible label
 * @returns {HTMLButtonElement}
 */
function navButton(dir, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `social-deck-strip-btn social-deck-strip-${dir}`;
  btn.setAttribute('aria-label', label);
  const icon = document.createElement('span');
  icon.className = 'social-deck-strip-icon';
  icon.setAttribute('aria-hidden', 'true');
  btn.append(icon);
  return btn;
}

/**
 * Decorates the Strip style. The authored (instrumented) cards go into the
 * visible row themselves, so Universal Editor selects them directly.
 * @param {Element} block the social-deck block
 * @param {object} parts what social-deck.js built
 * @param {HTMLElement} parts.stage the stage
 * @param {HTMLUListElement} parts.ring the (empty) visible card list
 * @param {HTMLUListElement} parts.source the hidden list of authored cards
 * @param {HTMLLIElement[]} parts.authored the authored cards
 * @param {number} parts.max cards shown at most
 */
export default function decorateStrip(block, {
  stage, ring, source, authored, max,
}) {
  ring.classList.add('social-deck-strip-track');
  ring.setAttribute('role', 'list');
  authored.slice(0, max).forEach((li) => {
    li.classList.add('social-deck-strip-card');
    li.removeAttribute('aria-hidden');
    ring.append(li);
  });
  source.remove();
  // the row scrolls natively: no arc drag, so the page keeps vertical swipes
  delete stage.dataset.snapHorizontal;

  const cards = [...ring.children];
  const prev = navButton('prev', 'Previous posts');
  const next = navButton('next', 'Next posts');
  const nav = document.createElement('div');
  nav.className = 'social-deck-strip-nav';
  nav.append(prev, next);
  block.append(nav);

  // No scroll snapping: swipes scroll freely (Safari's snap got a swipe back from the last
  // card stuck). The arrows and mouse drag still land on these stops: the start of every
  // card the row can scroll to, then its end.
  let stops = [0];
  const syncSnap = () => {
    const end = Math.max(0, ring.scrollWidth - ring.clientWidth);
    const first = cards[0]?.offsetLeft ?? 0;
    const minGap = Math.max(2, ((cards[1]?.offsetLeft ?? first) - first) / 2);
    const spots = [0];
    cards.forEach((li, i) => {
      const at = li.offsetLeft - first;
      if (i && at < end - minGap) spots.push(at);
    });
    if (end > 2) spots.push(end);
    stops = spots;
  };
  // the stop nearest a scroll position
  const nearest = (left) => stops.reduce(
    (best, at, i) => (Math.abs(at - left) < Math.abs(stops[best] - left) ? i : best),
    0,
  );
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // is-gliding marks an arrow/drag glide; is-drag (link clicks off) ends once it's still
  let settle = 0;
  const settled = () => {
    clearTimeout(settle);
    ring.classList.remove('is-gliding', 'is-drag');
  };
  const goTo = (left) => {
    ring.classList.add('is-gliding');
    ring.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    clearTimeout(settle);
    settle = setTimeout(settled, 400);
  };
  ring.addEventListener('scroll', () => {
    if (!ring.classList.contains('is-gliding')) return;
    clearTimeout(settle);
    settle = setTimeout(settled, 150);
  }, { passive: true });
  ring.addEventListener('wheel', settled, { passive: true });
  // moves one stop at a time
  const step = (dir) => goTo(stops[clamp(nearest(ring.scrollLeft) + dir, 0, stops.length - 1)]);
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // keyboard: the row is focusable, left/right move it a card at a time
  ring.tabIndex = 0;
  ring.setAttribute('aria-label', 'Social posts, swipe or use the arrow keys');
  ring.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  });

  // mouse drag with a little throw, then it glides to the nearest card
  let drag = null;
  ring.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button) return;
    settled();
    drag = {
      x: e.clientX, left: ring.scrollLeft, t: performance.now(), v: 0, moved: false,
    };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      ring.classList.add('is-drag');
    }
    if (!drag.moved) return;
    const now = performance.now();
    const left = drag.left - dx;
    drag.v = (left - ring.scrollLeft) / Math.max(1, now - drag.t);
    drag.t = now;
    ring.scrollLeft = left;
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const { moved, v } = drag;
    drag = null;
    if (!moved) return;
    goTo(stops[nearest(ring.scrollLeft + v * 220)]);
  });

  // per frame: the arrow states only (the edge fade is a fixed mask in CSS)
  const update = () => {
    const left = ring.scrollLeft;
    const end = ring.scrollWidth - ring.clientWidth;
    const atStart = left < 4;
    const atEnd = left > end - 4;
    if (prev.disabled !== atStart) prev.disabled = atStart;
    if (next.disabled !== atEnd) next.disabled = atEnd;
    if (nav.hidden !== end <= 0) nav.hidden = end <= 0;
  };
  let raf = 0;
  const queue = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  };
  ring.addEventListener('scroll', queue, { passive: true });
  // the row or its cards change size (the cards scale with the screen's height too)
  const relayout = () => {
    syncSnap();
    queue();
  };
  const resized = new ResizeObserver(relayout);
  resized.observe(ring);
  if (cards[0]) resized.observe(cards[0]);
  syncSnap();
  update();
}
