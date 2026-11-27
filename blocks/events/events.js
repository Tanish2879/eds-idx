import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// event dates are authored in IST; "past" is decided against today's IST date
const AUTHOR_TZ = 'Asia/Kolkata';
// centre + 2 visible each side + 1 off-screen buffer each side, so the loop
// can recycle a card across the seam without it being seen
const MIN_SLOTS = 7;
const LOCK = 6; // px of movement before a gesture is claimed as a horizontal drag
const FLICK = 0.4; // px/ms release speed that advances one card on a short drag
// touch / mobile: one card per swipe; past a full card the row only follows
// this fraction of the extra finger travel (rubber-band), so it can't race
const TOUCH_RESIST = 0.25;
const MOBILE_MQ = window.matchMedia('(width < 900px)');
const SETTLE_MIN = 350; // ms, shortest settle (fast flicks)
const SETTLE_MAX = 800; // ms, longest settle (slow drags)
// trackpad / wheel (as the Social Deck): a scroll gesture ends once input has
// been quiet this long; a decayed trackpad tail is well under a mouse-wheel
// notch (~100); only a clearly vertical scroll is left to the page
const WHEEL_QUIET_MS = 120;
const WHEEL_NOTCH_MIN = 50;
const WHEEL_VERTICAL_BIAS = 1.8;
// a scroll this far (px) that didn't reach the next card still moves one
const WHEEL_NUDGE = 24;
// entrance: starts once the section is 30% scrolled in (the heading becomes
// visible) and completes as it lands; on load it plays over this many ms
const ENTER_FROM = 0.3;
const ENTER_ON_LOAD = 700;
// the heading waits until the section snap is 3/4 of the way in, then drops
// into its mask over the rest of the snap
const TITLE_FROM = 0.75;
const DEFAULT_TITLE = 'Upcoming events';

const isoInAuthorTz = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: AUTHOR_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

/**
 * Parses an authored event date into an ISO day and its "03 OCT" label.
 * A plain YYYY-MM-DD is used as-is; a full date-time is read in IST so a
 * UTC-serialised midnight doesn't land on the previous day.
 * @param {string} text
 * @returns {{iso: string, label: string}|null}
 */
function parseDate(text) {
  const value = (text || '').trim();
  let iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (!iso) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return null;
    iso = isoInAuthorTz(new Date(ms));
  }
  const [, month, day] = iso.split('-');
  return { iso, label: `${day} ${MONTHS[Number(month) - 1]}` };
}

/**
 * Reads one Event item row: image, alt text, city, date, description, venue.
 * ALT Text has a cell of its own so it survives when no image is added;
 * content authored before that has no ALT cell, its alt text folded into the
 * image instead.
 * @param {Element} row
 */
function readEvent(row) {
  const cells = [...row.children];
  if (cells.length < 6) cells.splice(1, 0, null);
  const [imageCell, altCell, ...rest] = cells;
  const img = imageCell && imageCell.querySelector('img');
  const alt = (altCell && altCell.textContent.trim()) || (img && img.alt) || '';
  const [city = '', dateText = '', description = '', venue = ''] = rest
    .map((c) => c.textContent.trim());
  return {
    row, img, alt, city, date: parseDate(dateText), description, venue,
  };
}

function buildCard(event, eager) {
  const li = document.createElement('li');
  li.className = 'event';

  const head = document.createElement('div');
  head.className = 'event-head';
  const city = document.createElement('h3');
  city.className = 'event-city';
  city.textContent = event.city;
  head.append(city);
  if (event.date) {
    const date = document.createElement('p');
    date.className = 'event-date';
    const time = document.createElement('time');
    time.dateTime = event.date.iso;
    time.textContent = event.date.label;
    date.append(time);
    head.append(date);
  }

  const media = document.createElement('div');
  media.className = 'event-media';
  if (event.img) {
    const picture = createOptimizedPicture(event.img.src, event.alt, eager, [
      { media: '(min-width: 600px)', width: '1000' },
      { width: '750' },
    ]);
    picture.querySelector('img').draggable = false;
    media.append(picture);
  } else if (event.alt) {
    // no image: the alt text stands in so the card still says what it shows
    const p = document.createElement('p');
    p.className = 'event-media-alt';
    p.textContent = event.alt;
    media.append(p);
  }

  li.append(head, media);

  if (event.description || event.venue) {
    const info = document.createElement('div');
    info.className = 'event-info';
    if (event.description) {
      const p = document.createElement('p');
      p.className = 'event-description';
      p.textContent = event.description;
      info.append(p);
    }
    if (event.venue) {
      const p = document.createElement('p');
      p.className = 'event-venue';
      p.textContent = event.venue;
      info.append(p);
    }
    li.append(info);
  }
  return li;
}

const easeOut = (x) => 1 - (1 - x) ** 3;

/**
 * Entrance (Figma prototype Opt 66 → Opt 67): the heading drops into its mask
 * and the cards rise and fade in. It is driven by the section's scroll
 * position, not a timer, so heading and cards move together and land on the
 * exact frame the section-snap scroll lands (and reverse when scrolling back).
 * Writes --enter (0 → 1) for the cards and --enter-title for the heading,
 * which starts later in the scroll-in but lands on the same frame.
 * @param {Element} block
 * @param {boolean} immediate skip the animation (editor, reduced motion)
 */
function reveal(block, immediate) {
  const set = (cards, title = cards) => {
    block.style.setProperty('--enter', cards.toFixed(3));
    block.style.setProperty('--enter-title', title.toFixed(3));
  };
  if (immediate) {
    set(1);
    return;
  }
  const section = block.closest('.section') || block;
  // how far the section has scrolled into view: 0 = its top at the bottom of
  // the screen, 1 = its top at the top of the screen (snap landed)
  const progress = () => {
    const p = 1 - section.getBoundingClientRect().top / window.innerHeight;
    return Math.min(1, Math.max(0, p));
  };
  // the entrance plays over the last part of the scroll-in until the section
  // lands: the cards from when they come into view, the heading from 3/4 in
  const phase = (p, from) => easeOut(Math.max(0, (p - from) / (1 - from)));
  const fromScroll = () => {
    const p = progress();
    set(phase(p, ENTER_FROM), phase(p, TITLE_FROM));
  };

  let raf = 0;
  let tweening = false;
  const update = () => {
    raf = 0;
    if (!tweening) fromScroll();
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  const start = () => {
    // already on screen when it first shows (no scroll to drive it): play the
    // same entrance once over a fixed time
    if (progress() >= 1) {
      tweening = true;
      const t0 = performance.now();
      const tick = (now) => {
        const x = Math.min(1, (now - t0) / ENTER_ON_LOAD);
        set(easeOut(x));
        if (x < 1) requestAnimationFrame(tick);
        else tweening = false;
      };
      requestAnimationFrame(tick);
    } else {
      fromScroll();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  };

  set(0);
  // EDS keeps a section hidden (no size) until its blocks have loaded, so
  // wait until it is actually laid out before judging where it is
  if (section.getBoundingClientRect().height > 0 || !('ResizeObserver' in window)) {
    start();
    return;
  }
  const ro = new ResizeObserver(() => {
    if (section.getBoundingClientRect().height === 0) return;
    ro.disconnect();
    start();
  });
  ro.observe(section);
}

/**
 * Fetches the on-screen cards' images a screen before the block scrolls in,
 * so they are ready when the entrance plays instead of popping in late.
 * @param {Element} block
 * @param {Element[]} cards the cards visible around the centre
 */
function warmImages(block, cards) {
  const load = () => cards.forEach((card) => {
    const img = card.querySelector('img');
    if (img) img.loading = 'eager';
  });
  if (!('IntersectionObserver' in window)) {
    load();
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    load();
    obs.disconnect();
  }, { rootMargin: '0px 0px 100% 0px' });
  io.observe(block);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const inEditor = !!document.querySelector('[data-aue-resource]');
  const rows = [...block.children];

  // The block's own field (Heading) serialises as a leading single-cell row
  // before the Event item rows; any other leading rows (e.g. the retired No
  // Events Message on older content) are skipped.
  const isItem = (row) => row.children.length > 1 || row.querySelector('img');
  const config = [];
  while (rows.length && !isItem(rows[0])) config.push(rows.shift());
  const titleText = config[0] ? config[0].textContent.trim() : '';

  let events = rows.map(readEvent);
  let start = 0;
  const today = isoInAuthorTz(new Date());
  if (!inEditor) {
    // Date order (undated last), starting on the next upcoming event, or the
    // most recent one when every date has passed. Authors in the editor still
    // see every item in its authored order.
    events = events.sort((a, b) => (a.date ? a.date.iso : '9999')
      .localeCompare(b.date ? b.date.iso : '9999'));
    const next = events.findIndex((e) => e.date && e.date.iso >= today);
    start = next === -1 ? events.length - 1 : next;
  }

  const title = document.createElement('h2');
  title.className = 'events-title';
  // inner span is what slides; the h2 is its mask
  const titleSpan = document.createElement('span');
  titleSpan.className = 'events-title-text';
  titleSpan.textContent = titleText || DEFAULT_TITLE;
  title.append(titleSpan);
  if (config[0]) moveInstrumentation(config[0], title);

  const noMotion = inEditor || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!events.length) {
    block.replaceChildren(title);
    reveal(block, noMotion);
    return;
  }

  // Repeat the events until there are enough cards to fill the loop.
  const slots = [];
  const first = block.closest('.section') === document.querySelector('main .section');
  while (slots.length < (events.length > 1 ? MIN_SLOTS : 1)) {
    events.forEach((event, i) => {
      const card = buildCard(event, first && slots.length === 0 && i === start);
      card.dataset.event = i;
      // past events are grayscale, today's and upcoming ones in colour
      if (event.date && event.date.iso < today) card.classList.add('is-past');
      // keep Universal Editor selection on the first copy of each item
      if (slots.length < events.length) moveInstrumentation(event.row, card);
      slots.push(card);
    });
  }

  const stage = document.createElement('div');
  stage.className = 'events-stage';
  stage.setAttribute('role', 'region');
  stage.setAttribute('aria-roledescription', 'carousel');
  stage.setAttribute('aria-label', title.textContent);
  const track = document.createElement('ul');
  track.className = 'events-track';
  track.append(...slots);
  const status = document.createElement('p');
  status.className = 'events-status';
  status.setAttribute('aria-live', 'polite');
  stage.append(track, status);
  block.replaceChildren(title, stage);
  reveal(block, noMotion);

  let active = start;
  const count = slots.length;
  // the arrow keys step the carousel, so the centred card is its tab stop
  const keyboard = events.length > 1;
  // signed distance of a slot from the centre, wrapped into the loop
  const offsetOf = (i) => {
    const o = (((i - active) % count) + count) % count;
    return o > count / 2 ? o - count : o;
  };

  const layout = () => {
    // focus inside the carousel follows the card that becomes centred
    const hadFocus = track.contains(document.activeElement);
    slots.forEach((card, i) => {
      const offset = offsetOf(i);
      const prev = card.dataset.offset === undefined ? offset : Number(card.dataset.offset);
      // a card crossing the loop seam jumps between the off-screen buffers
      // instead of sliding across the whole stage
      card.classList.toggle('no-anim', Math.abs(offset - prev) > count / 2);
      card.dataset.offset = offset;
      card.style.setProperty('--offset', offset);
      card.style.setProperty('--t', offset === 0 ? 1 : 0);
      card.classList.toggle('is-active', offset === 0);
      card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
      if (keyboard) card.tabIndex = offset === 0 ? 0 : -1;
    });
    // preventScroll: the stage clips its overflow, focusing must not scroll it
    if (hadFocus) slots[active].focus({ preventScroll: true });
    const event = events[Number(slots[active].dataset.event)];
    status.textContent = `${event.city}${event.date ? `, ${event.date.label}` : ''}`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      slots.forEach((card) => card.classList.remove('no-anim'));
    }));
  };
  const go = (index) => {
    active = ((index % count) + count) % count;
    layout();
  };
  layout();
  status.textContent = '';
  warmImages(block, slots.filter((card) => Math.abs(Number(card.dataset.offset)) <= 2));

  if (!keyboard) return;

  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    block.style.removeProperty('--ev-duration'); // default timing for key steps
    go(active + (e.key === 'ArrowRight' ? 1 : -1));
  });

  // previous / next arrows under the cards; the loop never ends, so they are
  // never disabled. Outside the stage, so its drag and side-card click leave them be.
  const nav = document.createElement('div');
  nav.className = 'events-nav';
  [['prev', 'Previous event', -1, 'M13 8H3M7.5 3.5 3 8l4.5 4.5'], ['next', 'Next event', 1, 'M3 8h10M8.5 3.5 13 8l-4.5 4.5']]
    .forEach(([name, label, by, path]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `events-${name}`;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      button.addEventListener('click', () => {
        block.style.removeProperty('--ev-duration'); // default timing, like the arrow keys
        go(active + by);
      });
      nav.append(button);
    });
  block.append(nav);

  const step = () => slots[active].offsetWidth + parseFloat(getComputedStyle(track).columnGap);

  // Live morph while a gesture moves the row by dx px: each card's --t (1 =
  // centred/big, 0 = side/small) follows its distance from the centre, so the
  // outgoing card shrinks and drops while the incoming one grows and rises.
  const morph = (dx) => {
    const s = step();
    track.style.setProperty('--drag', `${dx}px`);
    slots.forEach((card) => {
      const position = Number(card.dataset.offset) + dx / s;
      card.style.setProperty('--t', Math.max(0, 1 - Math.abs(position)).toFixed(3));
    });
  };

  // Release: ease into the nearest card, or the next one in the direction of
  // travel for a quick flick (`velocity`, px/ms). The ease-out is timed so it
  // starts at about the gesture's own speed, with no lurch at hand-over.
  const settle = (dx, velocity, maxCards = 2) => {
    const s = step();
    let delta = -Math.round(dx / s);
    if (!delta && Math.abs(velocity) > FLICK) delta = velocity < 0 ? 1 : -1;
    delta = Math.max(-maxCards, Math.min(maxCards, delta));
    const distance = Math.abs(dx + delta * s);
    // an ease-out cubic starts at 3× its average speed: pick the duration so
    // that start matches how fast the row was already moving
    const speed = Math.max(Math.abs(velocity), 0.05);
    const ms = Math.min(SETTLE_MAX, Math.max(SETTLE_MIN, (3 * distance) / speed));
    block.style.setProperty('--ev-duration', `${Math.round(ms)}ms`);
    block.classList.remove('is-dragging');
    track.style.setProperty('--drag', '0px');
    go(active + delta);
  };

  // Where the row actually is on screen right now (mid-settle included), as a
  // drag offset from the centred card's resting spot.
  const shownOffset = () => new DOMMatrixReadOnly(getComputedStyle(slots[active]).transform).m41;

  // While a gesture is moving the row, hand the centre over one card at a time
  // each time the row passes half a card, so a long drag travels any number
  // of cards with no ceiling. Returns the leftover offset
  // (always within ±half a card) that the row is still displaced by.
  const glide = (dx) => {
    const s = step();
    let rest = dx;
    while (rest <= -s / 2) {
      active = (active + 1) % count;
      rest += s;
      layout();
    }
    while (rest >= s / 2) {
      active = (active - 1 + count) % count;
      rest -= s;
      layout();
    }
    morph(rest);
    return rest;
  };

  // pointer drag / touch swipe: horizontal gestures move the carousel,
  // vertical ones are left to the page (section snap)
  let dragging = false;
  let locked = false;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let single = false; // one card per swipe (touch / mobile)
  let dragged = false; // the last press turned into a drag, so it isn't a click

  // finger travel → row offset for one-card swipes: 1:1 up to a full card,
  // then rubber-band resistance
  const resist = (dx) => {
    const s = step();
    const over = Math.abs(dx) - s;
    return over > 0 ? Math.sign(dx) * (s + over * TOUCH_RESIST) : dx;
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    single = e.pointerType === 'touch' || MOBILE_MQ.matches;
    dragging = true;
    locked = false;
    dragged = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastT = e.timeStamp;
    velocity = 0;
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dy) > Math.abs(dx)) { // vertical intent -> let the page scroll
        dragging = false;
        return;
      }
      locked = true;
      stage.setPointerCapture(pointerId);
      // catching the row mid-settle: carry on from where it is on screen
      startX -= shownOffset();
      block.classList.add('is-dragging');
    }
    // keep section snap's window-level observer from reading the drag's
    // vertical drift as a swipe to the next section
    if (e.pointerType !== 'mouse') e.stopPropagation();
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * velocity;
    lastX = e.clientX;
    lastT = e.timeStamp;
    if (single) {
      morph(resist(e.clientX - startX));
    } else {
      // re-base the drag on each card handed over so it never runs out of cards
      startX = e.clientX - glide(e.clientX - startX);
    }
  });

  stage.addEventListener('touchmove', (e) => {
    if (locked) e.stopPropagation();
  }, { passive: true });

  const endDrag = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    if (!locked) return;
    locked = false;
    dragged = true;
    if (single) settle(resist(e.clientX - startX), velocity, 1);
    else settle(e.clientX - startX, velocity);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // clicking a side card (either side) slides it into the centre
  stage.addEventListener('click', (e) => {
    if (dragged) return;
    const card = e.target.closest('.event');
    const offset = card ? Number(card.dataset.offset) : 0;
    if (!offset) return;
    block.style.removeProperty('--ev-duration'); // default timing, like key steps
    go(active + offset);
  });

  // Trackpad / wheel sideways scroll moves the row too, as on the Social Deck.
  // Desktop: the row follows the scroll across any number of cards and, once
  // the scroll goes quiet, eases into the nearest card (a short scroll that
  // didn't reach the next card still moves one). Mobile / tablet: exactly one
  // card per scroll gesture; wheel momentum keeps firing after the step, so it
  // stays locked until input has been quiet, unless a clearly new notch
  // arrives once the step has settled. A clearly vertical scroll is left to
  // section snap; sideways ones are swallowed so the browser doesn't read them
  // as back / forward.
  let wheelDx = 0; // desktop: the row's offset while a scroll moves it
  let wheelFrom = -1; // desktop: the centred card when the scroll began
  let wheelLocked = false; // mobile: this gesture already moved a card
  let wheelStepAt = 0;
  let wheelTimer = 0;

  const endWheel = () => {
    wheelTimer = 0;
    if (MOBILE_MQ.matches || wheelFrom < 0) {
      wheelLocked = false;
      return;
    }
    // no card handed over: nudge one card on in the scroll's direction
    const nudge = active === wheelFrom && Math.abs(wheelDx) >= WHEEL_NUDGE;
    settle(wheelDx, nudge ? Math.sign(wheelDx) * FLICK * 1.5 : 0);
    wheelFrom = -1;
  };

  stage.addEventListener('wheel', (e) => {
    if (!e.deltaX || Math.abs(e.deltaY) > Math.abs(e.deltaX) * WHEEL_VERTICAL_BIAS) return;
    e.preventDefault();
    e.stopPropagation();
    if (locked) return; // a drag is moving the row
    const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX; // lines → px
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(endWheel, WHEEL_QUIET_MS);

    if (MOBILE_MQ.matches) {
      const settled = performance.now() - wheelStepAt > SETTLE_MAX;
      if (wheelLocked && settled && Math.abs(px) >= WHEEL_NOTCH_MIN) wheelLocked = false;
      if (wheelLocked) return;
      wheelLocked = true;
      wheelStepAt = performance.now();
      block.style.removeProperty('--ev-duration'); // default timing, like key steps
      go(active + (px > 0 ? 1 : -1));
      return;
    }

    if (wheelFrom < 0) {
      // catching the row mid-settle: carry on from where it is on screen
      wheelFrom = active;
      wheelDx = shownOffset();
      block.classList.add('is-dragging');
    }
    wheelDx = glide(wheelDx - px);
  }, { passive: false });
}
