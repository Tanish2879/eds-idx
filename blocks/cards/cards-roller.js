// Cards "Roller" style: a drum of image cards, turned a card per gesture with the snap engine
// (without it, scrubbed by the scroll as a runway).

import { fetchPlaceholders, inEditor, onAuthor } from '../../scripts/utils/common.js';

// runway fractions: the intro up to T_IN, the cards up to T_OUT, then a hold on the last card
const T_IN = 0.16;
const T_OUT = 0.94;
// runway settle: after IDLE_MS still (no finger down), over up to SETTLE_MS, away from the ends
const SNAP_MIN = T_IN * 0.6;
const SNAP_MAX = 0.985;
const SETTLE_MS = 700;
const SETTLE_MIN_MS = 320;
const IDLE_MS = 150;
// a scroll this far (in cards) moves on to the next card, not back (a wheel notch is about 0.09)
const COMMIT = 0.05;
// the runway drum's lag behind the scroll (its ease's time constant, ms)
const FOLLOW_MS = 60;
// one turn of the drum, a card per gesture (with the snap engine)
const STEP_MS = 700;
// no new gesture early in a turn: a trackpad swipe speeds up as it starts, and turns one card
const STEP_HOLD_MS = 450;
// the price bar shows from this far into the runway
const BAR_FROM = 0.1;
// a card this close to the front shows its caption
const ACTIVE_WITHIN = 0.42;
// cards the Roller takes (the Style field's help: 3 to 6)
const CARDS_MIN = 3;
const CARDS_MAX = 6;
// label for a blank price bar button (placeholders key rollerButtonLabel overrides it)
const BUTTON_LABEL = 'Know more';
// the intro position if the CSS gives no --rl-intro-at
const INTRO_AT = -0.75;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Classes a card's heading and description.
 * @param {Element} li the card
 */
function classCard(li) {
  const body = li.querySelector('.card-body');
  if (!body) return;
  body.classList.add('rl-copy');
  let seenHeading = false;
  body.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((el) => {
    if (el.tagName !== 'P') {
      if (!seenHeading) el.classList.add('rl-title');
      seenHeading = true;
      return;
    }
    if (el.textContent.trim()) el.classList.add('rl-desc');
  });
}

// width of the downscaled patch of photo the caption colour is read from
const SAMPLE = 24;
// the card's own colour (--rl-light), seen through a photo's transparent parts
const CARD_BG = 240;
// above this luminance black text has more contrast than white (WCAG)
const LIGHT_FROM = 0.179;

const linear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * The average luminance (0 to 1) of the part of a card's photo behind its caption.
 * @param {Element} li the card
 * @returns {number|null} null if the photo isn't loaded or can't be read
 */
function captionBackdrop(li) {
  const img = li.querySelector('.card-img');
  const copy = li.querySelector('.rl-copy');
  const w = li.offsetWidth;
  const h = li.offsetHeight;
  if (!img?.naturalWidth || !copy || !w || !h) return null;
  // the photo's scale and crop under object-fit: cover
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const left = (w - img.naturalWidth * scale) / 2;
  const top = (h - img.naturalHeight * scale) / 2;
  const sx = Math.max(0, (copy.offsetLeft - left) / scale);
  const sy = Math.max(0, (copy.offsetTop - top) / scale);
  const sw = Math.min(img.naturalWidth - sx, copy.offsetWidth / scale);
  const sh = Math.min(img.naturalHeight - sy, copy.offsetHeight / scale);
  if (sw <= 0 || sh <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = Math.max(1, Math.round((SAMPLE * sh) / sw));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]].map((v) => v * a + CARD_BG * (1 - a));
      sum += 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    }
    return sum / (data.length / 4);
  } catch {
    return null; // a photo from another origin without CORS can't be read
  }
}

/**
 * Marks a card is-light (dark text) or is-dark (light text) from its photo; with neither, the
 * CSS blends the text.
 * @param {Element} li the card
 */
function pickCaptionColour(li) {
  const luminance = captionBackdrop(li);
  li.classList.toggle('is-light', luminance !== null && luminance > LIGHT_FROM);
  li.classList.toggle('is-dark', luminance !== null && luminance <= LIGHT_FROM);
}

/**
 * Keeps a card's caption inside the card: text past the room the CSS gives it (.rl-copy
 * max-height) is cut after the last whole line that fits, with an ellipsis.
 * @param {Element} li the card
 * @returns {boolean} whether any text was cut
 */
function fitCaption(li) {
  const copy = li.querySelector('.rl-copy');
  if (!copy) return false;
  const parts = [...copy.children];
  parts.forEach((el) => {
    el.hidden = false;
    el.classList.remove('rl-cut');
    el.style.removeProperty('--rl-lines');
  });
  const room = copy.clientHeight;
  if (!room) return false;
  let cut = false;
  parts.forEach((el) => {
    if (cut) {
      el.hidden = true;
      return;
    }
    const { marginBottom, lineHeight, fontSize } = getComputedStyle(el);
    const trim = parseFloat(marginBottom) || 0;
    if (el.offsetTop + el.offsetHeight + trim <= room + 1) return;
    cut = true;
    const line = lineHeight.endsWith('px') ? parseFloat(lineHeight) : parseFloat(lineHeight) * parseFloat(fontSize);
    const lines = Math.floor((room + 1 - el.offsetTop - trim) / line);
    if (lines >= 1) {
      el.style.setProperty('--rl-lines', lines);
      el.classList.add('rl-cut');
    } else el.hidden = true;
  });
  return cut;
}

/**
 * Shows, updates or (with no text) removes one of the alerts for authors on the canvas.
 * @param {Element} block the cards block
 * @param {string} key which alert
 * @param {string} [text]
 */
function setNote(block, key, text) {
  let box = block.querySelector(':scope > .rl-note');
  let line = box?.querySelector(`[data-note="${key}"]`);
  if (!text) {
    line?.remove();
    if (box && !box.children.length) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement('p');
    box.className = 'rl-note';
    box.setAttribute('role', 'alert');
    block.prepend(box);
  }
  if (!line) {
    line = document.createElement('span');
    line.dataset.note = key;
    box.append(line);
  }
  line.textContent = text;
}

/**
 * Decorates the Roller style.
 * @param {Element} block the cards block
 * @param {HTMLUListElement} ul the card list
 */
export default function decorateRoller(block, ul) {
  const authoring = !!document.querySelector('[data-aue-resource]');
  // the editor keeps every card (each stays selectable); visitors get the first CARDS_MAX
  const added = ul.children.length;
  if (added > CARDS_MAX) {
    const extra = added - CARDS_MAX;
    if (onAuthor()) {
      setNote(block, 'count', `Remove ${extra} card${extra === 1 ? '' : 's'}: Roller takes at most ${CARDS_MAX} cards (now ${added}). Only the first ${CARDS_MAX} show on the published page.`);
    }
    if (!authoring) [...ul.children].slice(CARDS_MAX).forEach((li) => li.remove());
  } else if (added < CARDS_MIN && onAuthor()) {
    const missing = CARDS_MIN - added;
    setNote(block, 'count', `Add ${missing} more card${missing === 1 ? '' : 's'}: Roller needs at least ${CARDS_MIN} cards (now ${added}).`);
  }
  const cards = [...ul.children];
  cards.forEach(classCard);
  // refit and recolour on any size change or font load; recolour once each photo loads
  const cutCards = new Set();
  const refit = (li) => {
    if (fitCaption(li)) cutCards.add(li);
    else cutCards.delete(li);
    pickCaptionColour(li);
    if (!onAuthor()) return;
    const cut = cards.filter((c) => cutCards.has(c)).map((c) => cards.indexOf(c) + 1);
    const which = cut.length > 1 ? `cards ${cut.slice(0, -1).join(', ')} and ${cut.at(-1)}` : `card ${cut[0]}`;
    setNote(block, 'text', cut.length ? `Shorten the text of ${which}: it doesn't fit on the card, so the end is cut off.` : '');
  };
  const sized = new ResizeObserver((entries) => entries.forEach((e) => refit(e.target)));
  cards.forEach((li) => {
    sized.observe(li);
    const img = li.querySelector('.card-img');
    if (!img) return;
    if (img.complete) pickCaptionColour(li);
    img.addEventListener('load', () => pickCaptionColour(li));
  });
  document.fonts?.addEventListener('loadingdone', () => cards.forEach(refit));
  // the price bar's button: a paragraph that is only a link (the same test as scripts.js)
  const bar = block.closest('.section')?.querySelector('.cards-wrapper ~ .default-content-wrapper');
  const buttons = [];
  [...(bar?.children || [])].forEach((el) => {
    const links = el.querySelectorAll('a[href]');
    if (links.length !== 1 || el.textContent.trim() !== links[0].textContent.trim()) return;
    el.classList.add('rl-bar-cta');
    links[0].dataset.glitch = '';
    buttons.push(links[0]);
  });
  // a blank label (empty, its URL or "Button") gets the fallback; the editor keeps the stored text
  const unlabelled = buttons.filter((a) => {
    const text = a.textContent.trim();
    if (!text || /^button$/i.test(text)) return true;
    try {
      return new URL(text, window.location).href === new URL(a.href).href;
    } catch {
      return false;
    }
  });
  const labelButtons = (label) => {
    unlabelled.forEach((a) => {
      if (inEditor()) {
        a.dataset.rlPlaceholder = label;
        return;
      }
      const old = a.textContent.trim();
      a.textContent = label;
      if (!a.title || a.title === old) a.title = label;
    });
    if (onAuthor()) setNote(block, 'cta', `Add a label to the price bar button: visitors see "${label}" until you do.`);
  };
  if (unlabelled.length) {
    labelButtons(BUTTON_LABEL);
    fetchPlaceholders().then(({ rollerButtonLabel: label }) => {
      if (label && label !== BUTTON_LABEL) labelButtons(label);
    });
  }
  // the CSS shows one name and price line; authors are told when there's more
  const line = bar?.firstElementChild;
  if (line && onAuthor()) {
    const checkBar = () => {
      const names = [...line.querySelectorAll('strong')];
      const more = [...bar.children].slice(1).some((el) => !el.classList.contains('rl-bar-cta'))
        || names.length > 1 || !!line.querySelector('br')
        || line.scrollHeight > line.clientHeight + 1 || line.scrollWidth > line.clientWidth + 1
        || names.some((s) => s.scrollWidth > s.clientWidth + 1);
      setNote(block, 'bar', more ? 'Shorten the price bar: it shows one model name and one price line next to the button, so the rest is hidden or cut off.' : '');
    };
    new ResizeObserver(checkBar).observe(line);
    document.fonts?.addEventListener('loadingdone', checkBar);
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Universal Editor, reduced motion or a single card: a plain stack
  if (authoring || reduce || cards.length < 2) {
    block.classList.add('is-static');
    return;
  }

  const section = block.closest('.section');
  if (!section) {
    block.classList.add('is-static');
    return;
  }
  const count = cards.length;
  const titleBox = section.querySelector(':scope > .default-content-wrapper:first-child') || section;
  ul.classList.add('rl-drum');

  // screen-reader-only marks, out of the Tab order: their way to the hidden back cards
  const rail = document.createElement('div');
  rail.className = 'rl-rail';
  const marks = cards.map((li, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'rl-mark';
    mark.tabIndex = -1;
    const label = li.querySelector('.rl-title')?.textContent.trim() || `Card ${i + 1}`;
    mark.setAttribute('aria-label', label);
    rail.append(mark);
    return mark;
  });

  let introAt = INTRO_AT;
  const readIntroAt = () => {
    const value = parseFloat(getComputedStyle(block).getPropertyValue('--rl-intro-at'));
    introAt = Number.isFinite(value) ? value : INTRO_AT;
  };

  // runway progress (0 to 1) ↔ drum position (introAt … count - 1)
  const toDrum = (p) => (p < T_IN
    ? introAt + (0 - introAt) * (p / T_IN)
    : Math.min(count - 1, ((p - T_IN) / (T_OUT - T_IN)) * (count - 1)));
  const toProgress = (k) => T_IN + (count > 1 ? k / (count - 1) : 0) * (T_OUT - T_IN);
  const runway = () => {
    const rect = section.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    return { rect, total, p: total > 0 ? clamp(-rect.top / total, 0, 1) : 0 };
  };

  // phones: white washes over the cards above and below
  const washes = ['top', 'bottom'].map((side) => {
    const wash = document.createElement('div');
    wash.className = `rl-wash rl-wash-${side}`;
    wash.setAttribute('aria-hidden', 'true');
    return wash;
  });

  // only what changed is written each frame
  let lastNearest = null;
  let lastMarked = null;
  let lastIntroT = null;
  const activeNow = cards.map(() => null);
  const render = (s) => {
    cards.forEach((li, i) => {
      const d = i - s;
      li.style.setProperty('--rl-offset', d.toFixed(4));
      const on = Math.abs(d) < ACTIVE_WITHIN;
      if (activeNow[i] === on) return;
      activeNow[i] = on;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-hidden', String(!on));
      // back cards take no focus or clicks
      li.inert = !on;
    });
    washes[0].style.opacity = clamp(s, 0, 1).toFixed(3);
    washes[1].style.opacity = (clamp(s + 0.4, 0, 1) * clamp(count - 1 - s, 0, 1)).toFixed(3);
    // 1 on the intro, 0 once the first card is in front
    const introT = clamp(s / introAt, 0, 1).toFixed(2);
    if (introT !== lastIntroT) {
      lastIntroT = introT;
      block.style.setProperty('--rl-intro-t', introT);
    }
    const nearest = clamp(Math.round(s), 0, count - 1);
    if (nearest !== lastNearest) {
      lastNearest = nearest;
      block.style.setProperty('--active', nearest);
    }
    const marked = s > introAt / 2 ? nearest : -1;
    if (marked !== lastMarked) {
      lastMarked = marked;
      marks.forEach((mark, i) => {
        if (i === marked) mark.setAttribute('aria-current', 'step');
        else mark.removeAttribute('aria-current');
      });
    }
  };

  // with the snap engine each gesture or key turns the drum one card on a timed ease-out; past the
  // last card (or back past the intro) the page moves on
  let step = -1; // -1 the intro, 0 … count - 1 the card in front
  let shown = introAt;
  let tween = 0;
  let turnedAt = -Infinity;
  // a finger put down (or a key pressed) since the last turn is a new gesture: it turns the drum
  // at once, even mid-turn; the hold below is only for a trackpad swipe's burst of wheel events
  let fresh = false;
  window.addEventListener('touchstart', () => { fresh = true; }, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => { if (!e.repeat) fresh = true; }, { capture: true });
  const placeOf = (k) => (k < 0 ? introAt : k);
  const paint = (s) => {
    render(s);
    // set on the title only, so nothing else restyles
    titleBox.style.setProperty('--rl-q', clamp((s - introAt) / -introAt, 0, 1).toFixed(3));
  };
  const playTo = (k) => {
    step = clamp(k, -1, count - 1);
    block.classList.toggle('is-intro', step < 0);
    cancelAnimationFrame(tween);
    fresh = false;
    const from = shown;
    const to = placeOf(step);
    // a jump of several cards (a mark) takes a little longer, not one card's time each
    const ms = STEP_MS * Math.min(1.6, Math.sqrt(Math.max(1, Math.abs(to - from))));
    const start = performance.now();
    turnedAt = start;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      shown = from + (to - from) * easeOut(t);
      paint(shown);
      tween = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    tween = requestAnimationFrame(tick);
  };
  const jumpTo = (k) => {
    cancelAnimationFrame(tween);
    tween = 0;
    step = k;
    shown = placeOf(k);
    block.classList.toggle('is-intro', k < 0);
    paint(shown);
  };
  // the snap engine asks before it pages on; a later gesture turns on from where the drum is
  const stepper = {
    canScrollDown: () => step < count - 1,
    canScrollUp: () => step > -1,
    scrollDown: () => playTo(step + 1),
    scrollUp: () => playTo(step - 1),
    isBusy: () => tween !== 0 && !fresh && performance.now() - turnedAt < STEP_HOLD_MS,
    destroy: () => cancelAnimationFrame(tween),
  };
  let goToCard = (i) => playTo(i);
  let stepping = true;
  // arriving from above starts on the intro, from below on the last card
  document.addEventListener('snap:start', ({ detail: { from, to } }) => {
    if (!stepping || to !== section || !from || from === section) return;
    // eslint-disable-next-line no-bitwise
    const fromBelow = !!(section.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING);
    jumpTo(fromBelow ? count - 1 : -1);
  });
  window.addEventListener('resize', () => {
    if (!stepping) return;
    readIntroAt();
    jumpTo(step);
  });

  // fallback without the snap engine: the section is a scroll runway the drum scrubs with
  const wireRunway = () => {
    // the drum eases after the scroll, by elapsed time (the same feel at any frame rate)
    let target = introAt;
    let trailing = introAt;
    let frame = 0;
    let lastAt = 0;
    const tick = (now) => {
      const dt = lastAt ? Math.min(now - lastAt, 100) : 1000 / 60;
      lastAt = now;
      trailing += (target - trailing) * (1 - Math.exp(-dt / FOLLOW_MS));
      if (Math.abs(target - trailing) < 0.0005) trailing = target;
      render(trailing);
      frame = trailing === target ? 0 : requestAnimationFrame(tick);
      if (!frame) lastAt = 0;
    };
    const update = () => {
      const { p } = runway();
      target = toDrum(p);
      // set on the title only, so nothing else restyles
      titleBox.style.setProperty('--rl-q', clamp(p / T_IN, 0, 1).toFixed(3));
      block.classList.toggle('is-intro', p <= BAR_FROM);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // once the scroll stops, glide onto a card: onward if it moved COMMIT or more, else the nearest
    let settling = 0;
    let idle = 0;
    let touching = false;
    // the drum position where the current scroll started (null between scrolls)
    let startedAt = null;
    const stopSettle = () => {
      cancelAnimationFrame(settling);
      settling = 0;
    };
    const glideTo = (y) => {
      stopSettle();
      const from = window.scrollY;
      const { total } = runway();
      // a short way takes less time than a whole card
      const perCard = count > 1 ? (total * (T_OUT - T_IN)) / (count - 1) : total;
      const share = perCard > 0 ? Math.min(1, Math.abs(y - from) / perCard) : 1;
      const duration = SETTLE_MIN_MS + (SETTLE_MS - SETTLE_MIN_MS) * Math.sqrt(share);
      const start = performance.now();
      const glideStep = (now) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + (y - from) * (1 - (1 - t) ** 3));
        settling = t < 1 ? requestAnimationFrame(glideStep) : 0;
      };
      settling = requestAnimationFrame(glideStep);
    };
    const cardY = (k, rect, total) => window.scrollY + rect.top + toProgress(k) * total;
    const settle = () => {
      const begun = startedAt;
      startedAt = null;
      if (settling || touching) return;
      const { rect, total, p } = runway();
      // only while the runway fills the screen
      if (rect.top > 1 || rect.bottom < window.innerHeight - 1) return;
      if (p <= SNAP_MIN || p >= SNAP_MAX) return;
      const at = toDrum(p);
      const moved = begun === null ? 0 : at - begun;
      let card = Math.round(at);
      if (moved > COMMIT) card = Math.ceil(at - COMMIT);
      else if (moved < -COMMIT) card = Math.floor(at + COMMIT);
      const y = cardY(clamp(card, 0, count - 1), rect, total);
      if (Math.abs(y - window.scrollY) >= 3) glideTo(y);
    };
    const armSettle = () => {
      window.clearTimeout(idle);
      if (!settling && !touching) idle = window.setTimeout(settle, IDLE_MS);
    };
    window.addEventListener('scroll', () => {
      if (!settling && startedAt === null) startedAt = target;
      update();
      armSettle();
    }, { passive: true });
    // any new input takes over from a glide; a finger on the screen holds the settle off
    ['wheel', 'touchstart', 'keydown'].forEach((type) => {
      window.addEventListener(type, stopSettle, { capture: true, passive: true });
    });
    window.addEventListener('touchstart', () => {
      touching = true;
      window.clearTimeout(idle);
      if (startedAt === null) startedAt = target;
    }, { capture: true, passive: true });
    ['touchend', 'touchcancel'].forEach((type) => {
      window.addEventListener(type, (e) => {
        if (e.touches?.length) return;
        touching = false;
        armSettle();
      }, { capture: true, passive: true });
    });
    window.addEventListener('resize', () => {
      readIntroAt();
      update();
    });
    goToCard = (i) => {
      const { rect, total } = runway();
      glideTo(cardY(i, rect, total));
    };
    section.classList.add('scroll-runway');
    update();
  };

  marks.forEach((mark, i) => mark.addEventListener('click', () => goToCard(i)));

  block.classList.add('is-stepped');
  // to or from the section above, the title travels with it (set before Wave In reads it)
  const above = section.previousElementSibling;
  document.addEventListener('snap:start', ({ detail: { from, to } }) => {
    const crossing = (from === above && to === section) || (from === section && to === above);
    section.classList.toggle('is-crossing', crossing);
  });
  document.addEventListener('snap:end', () => section.classList.remove('is-crossing'));
  section.style.setProperty('--rl-count', count);
  // the snap engine treats the block as one screen, not an inner scroller
  block.dataset.snapPassthrough = '';
  block.append(rail, ...washes);
  readIntroAt();
  jumpTo(-1);

  // the stepper is registered with the snap engine at once and kept only if the engine starts
  // (`snap-active`, before `snap-settled`); without it the section becomes the scroll runway
  const snap = import('../../scripts/section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, stepper);
    return mod;
  });
  const root = document.documentElement;
  const decide = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (!root.classList.contains('snap-active')) {
      stepping = false;
      stepper.destroy();
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      wireRunway();
    }
    return true;
  };
  if (!decide()) {
    const watch = new MutationObserver(() => { if (decide()) watch.disconnect(); });
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}
