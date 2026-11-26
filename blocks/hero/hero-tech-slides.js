// a stat's value: a number, then optionally its unit ("26.7 kwh", "400 KM")
const VALUE_RE = /^\d[\d.,]*(\s*\D.*)?$/;
// the stagger, entry delay and timing of the change (the prototype's, in ms)
const ROLL_AT = 100;
const ROLL_MS = 220;
const EASE_IN = 'cubic-bezier(0.55, 0.085, 0.68, 0.53)';
const EASE_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
// the section counts as reached once its top is within the top 45% of the screen
const START_MARGIN = '0px 0px -55% 0px';

const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// a Tile Position: "x, y", % of the image from its bottom-left corner
const POSITION_RE = /^\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*$/;
// default tile spots: odd slides on the battery, even ones on the drive unit
const DEFAULT_TILES = [{ x: 33, y: 61.4 }, { x: 63, y: 76.4 }];
// the design image, until a slide's own has loaded
const FRAME = { w: 1280, h: 720 };
// published Tile Position cells come after the six other Hero Slide fields
const POSITION_CELLS = 6;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** a Tile Position value, or null */
function parsePosition(cell) {
  const match = cell?.textContent.match(POSITION_RE);
  if (!match) return null;
  return { x: clamp(Number(match[1]), 0, 100), y: clamp(Number(match[2]), 0, 100) };
}

/** a slide's Tile Position (d) and mobile one (m), by field name or by place */
function readPositions(row) {
  const cells = [...row.children];
  const named = (name) => cells.find((c) => c.dataset.aueProp === name
    || c.querySelector(`[data-aue-prop="${name}"]`));
  // by field name, else by place
  const desktop = named('tilePosition') || cells[POSITION_CELLS];
  const mobile = named('tilePositionMobile') || cells[POSITION_CELLS + 1];
  return {
    d: parsePosition(desktop),
    m: parsePosition(mobile),
    // whether the markup has the fields at all
    inMarkup: !!desktop,
  };
}

/** the image a slide shows on this screen (not the hidden only-desktop / only-mobile one) */
function shownImage(slide) {
  const imgs = [...(slide?.querySelectorAll('img.bg-img') || [])];
  return imgs.find((img) => img.getClientRects().length) || imgs[0] || null;
}

/** whether a slide's image size is known (loaded, failed, or there's no image to wait for) */
function frameKnown(slide) {
  const img = shownImage(slide);
  return !img || img.complete;
}

/** how a slide's image covers the hero, to convert between % and px */
function imageFrame(block, slide) {
  const img = shownImage(slide);
  const w = img?.naturalWidth || FRAME.w;
  const h = img?.naturalHeight || FRAME.h;
  const W = block.clientWidth;
  const H = block.clientHeight;
  const scale = Math.max(W / w, H / h);
  // object-position, as fractions (50% 50% unless styled otherwise)
  const [ox, oy] = (img ? getComputedStyle(img).objectPosition : '50% 50%')
    .split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  return {
    w, h, scale, left: (W - w * scale) * (ox ?? 0.5), top: (H - h * scale) * (oy ?? 0.5), W, H,
  };
}

const tileSide = (block, mobile) => {
  const vw = window.innerWidth;
  if (!mobile) return clamp(vw * 0.052, 20, 44);
  return 20 * clamp(Math.min(vw / 375, block.clientHeight / 815), 0.85, 1.25);
};

/** a slide Text's label, heading, description, stats and button */
function classSlideText(text) {
  let heading = null;
  const after = [];
  let cta = null;
  [...text.children].forEach((el) => {
    if (el.classList.contains('cta-wrapper')) {
      el.classList.add('ts-src');
      cta = cta || el.querySelector('a');
      return;
    }
    if (/^H[1-6]$/.test(el.tagName) && !heading) {
      heading = el;
      el.classList.add('ts-heading');
      return;
    }
    if (el.tagName !== 'P') return;
    if (heading) after.push(el);
    else el.classList.add('ts-label');
  });
  // after the heading: a paragraph followed by a number is a stat, the rest description
  const stats = [];
  for (let i = 0; i < after.length; i += 1) {
    const [key, value] = [after[i], after[i + 1]];
    if (value && !VALUE_RE.test(textOf(key)) && VALUE_RE.test(textOf(value))) {
      key.classList.add('ts-src');
      value.classList.add('ts-src');
      stats.push([key, value]);
      i += 1;
    } else {
      key.classList.add('ts-desc');
    }
  }
  return { heading, stats, cta };
}

/** the hero Text's stats, in key and value pairs */
function heroStats(textCell) {
  const paras = [...textCell.querySelectorAll(':scope > p.subtext')];
  const stats = [];
  for (let i = 0; i < paras.length; i += 2) {
    paras[i].classList.add('ts-src');
    paras[i + 1]?.classList.add('ts-src');
    stats.push([paras[i], paras[i + 1]].filter(Boolean));
  }
  return stats;
}

/**
 * A stat's text, as shown: the key, and the value split into number and unit.
 * @param {Element[]} pair the key and value paragraphs
 */
function statData([key, value]) {
  const raw = value ? textOf(value) : '';
  const parts = raw.match(/^([\d.,]+)\s*(\D.*)$/);
  return {
    key: textOf(key),
    number: parts ? parts[1] : raw,
    unit: parts ? parts[2] : '',
  };
}

/**
 * A button's link, as shown in the stats area.
 * @param {HTMLAnchorElement|null} a
 */
function ctaData(a) {
  if (!a) return null;
  return {
    href: a.getAttribute('href') || '',
    text: textOf(a.querySelector('.cta-label') || a),
    title: a.getAttribute('title') || '',
    target: a.getAttribute('target') || '',
  };
}

/** swaps an element's content with a roll, or at once */
function roll(el, update, animate) {
  el.getAnimations().forEach((a) => a.cancel());
  if (!animate || !el.animate) {
    update();
    return;
  }
  const out = el.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-10px)', opacity: 0 }],
    { duration: ROLL_MS, easing: EASE_IN, fill: 'forwards' },
  );
  out.onfinish = () => {
    update();
    out.cancel();
    el.animate(
      [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: ROLL_MS, easing: EASE_OUT },
    );
  };
}

/** the stats area: shows the current slide's stats and button */
function statsArea(info, baseCta) {
  const stats = document.createElement('div');
  stats.className = 'ts-stats';
  const ctaWrap = baseCta?.closest('.cta-wrapper') || null;
  if (ctaWrap && ctaWrap.parentElement === info) ctaWrap.before(stats);
  else if (ctaWrap) info.append(stats, ctaWrap);
  else info.append(stats);
  ctaWrap?.classList.remove('ts-src');

  const unitFor = (unit) => {
    const small = document.createElement('small');
    small.className = 'ts-stat-unit';
    small.textContent = unit;
    return small;
  };
  const fillValue = (span, { number, unit }) => {
    span.replaceChildren(number, ...(unit ? [unitFor(unit)] : []));
  };
  const tile = (data) => {
    const el = document.createElement('div');
    el.className = 'ts-stat';
    const key = document.createElement('p');
    key.className = 'ts-stat-key';
    const keyText = document.createElement('span');
    keyText.className = 'ts-roll';
    keyText.textContent = data.key;
    key.append(keyText);
    const value = document.createElement('p');
    value.className = 'ts-stat-value';
    const valueText = document.createElement('span');
    valueText.className = 'ts-roll';
    fillValue(valueText, data);
    value.append(valueText);
    el.append(key, value);
    el.dataset.key = data.key;
    el.dataset.value = `${data.number}|${data.unit}`;
    return el;
  };

  const label = baseCta?.querySelector('.cta-label');
  return (list, cta, animate) => {
    // the tiles: roll the changed text, or rebuild if the count differs
    const tiles = [...stats.children];
    if (tiles.length === list.length) {
      list.forEach((data, i) => {
        const el = tiles[i];
        const [keyText, valueText] = el.querySelectorAll('.ts-roll');
        if (el.dataset.key !== data.key) {
          el.dataset.key = data.key;
          roll(keyText, () => { keyText.textContent = data.key; }, animate);
        }
        const value = `${data.number}|${data.unit}`;
        if (el.dataset.value !== value) {
          el.dataset.value = value;
          roll(valueText, () => fillValue(valueText, data), animate);
        }
      });
    } else {
      roll(stats, () => stats.replaceChildren(...list.map(tile)), animate && tiles.length > 0);
    }
    stats.hidden = !list.length;

    // the button: its link follows the slide, its label rolls if it changes
    if (!ctaWrap) return;
    ctaWrap.hidden = !cta;
    if (!cta) return;
    baseCta.setAttribute('href', cta.href);
    if (cta.title) baseCta.setAttribute('title', cta.title);
    else baseCta.removeAttribute('title');
    if (cta.target) baseCta.setAttribute('target', cta.target);
    else baseCta.removeAttribute('target');
    if (label && textOf(label) !== cta.text) {
      baseCta.setAttribute('aria-label', cta.text);
      roll(label, () => { label.textContent = cta.text; }, animate);
    }
  };
}

/** splits a heading into its laid-out lines (.ts-ln) */
function splitLines(heading) {
  if (!heading.dataset.tsText) {
    const plain = [...heading.childNodes].every((n) => n.nodeType === Node.TEXT_NODE || n.nodeName === 'BR');
    if (!plain) {
      const line = document.createElement('span');
      line.className = 'ts-ln';
      line.append(...heading.childNodes);
      heading.append(line);
      heading.dataset.tsText = '-';
      return [line];
    }
    // the authored lines, one per <br>
    const parts = [];
    let part = '';
    heading.childNodes.forEach((n) => {
      if (n.nodeName === 'BR') {
        parts.push(part);
        part = '';
      } else part += n.textContent;
    });
    parts.push(part);
    heading.dataset.tsText = JSON.stringify(parts.map((p) => p.trim()).filter(Boolean));
  }
  if (heading.dataset.tsText === '-') return [...heading.querySelectorAll('.ts-ln')];

  const authored = JSON.parse(heading.dataset.tsText);
  // lay every word out, then group them by the line they land on
  const words = authored.map((text) => text.split(/\s+/).map((word) => {
    const span = document.createElement('span');
    span.textContent = word;
    return span;
  }));
  heading.replaceChildren(...words.flatMap((list, i) => [
    ...list.flatMap((span, k) => (k ? [' ', span] : [span])),
    ...(i < words.length - 1 ? [document.createElement('br')] : []),
  ]));
  const lines = [];
  words.forEach((list) => {
    let top = null;
    list.forEach((span) => {
      if (span.offsetTop !== top) {
        top = span.offsetTop;
        lines.push([]);
      }
      lines[lines.length - 1].push(span.textContent);
    });
  });
  const spans = lines.map((list) => {
    const line = document.createElement('span');
    line.className = 'ts-ln';
    line.textContent = list.join(' ');
    return line;
  });
  heading.replaceChildren(...spans);
  return spans;
}

/** numbers a slide's copy lines for the stagger (--ts-i) */
function staggerLines(text) {
  [...text.querySelectorAll('.ts-label, .ts-ln, .ts-desc')]
    .forEach((el, i) => el.style.setProperty('--ts-i', i));
}

// the parts of the hero that keep their own pointer use (reading, dots, CTA)
const NO_SWIPE = 'a, button, .ts-text, .ts-dots, .ts-info, .hero-controls';
const SWIPE_MIN = 40; // px of sideways travel that counts as a swipe
const WHEEL_MIN = 60; // accumulated sideways trackpad delta that steps once
const WHEEL_LOCK_MS = 900;

/** the "Swipe" pill that follows the mouse */
function swipePill() {
  const pill = document.createElement('div');
  pill.className = 'ts-cursor';
  pill.setAttribute('aria-hidden', 'true');
  pill.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M5 4.5 1.5 8 5 11.5M11 4.5 14.5 8 11 11.5M2 8h12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const label = document.createElement('span');
  label.textContent = 'Swipe';
  pill.append(label);
  return pill;
}

/** swipe, drag, click, trackpad and arrow keys move through the slides */
function wireSwipe(block, dots, authoring) {
  const step = (by) => {
    const current = Math.max(0, dots.findIndex((dot) => dot.hasAttribute('aria-current')));
    const dot = dots[(current + by + dots.length) % dots.length];
    // keep the direction across the loop seam
    dot.dataset.direction = by > 0 ? 'forward' : 'back';
    dot.click();
  };
  // in the editor the tile is dragged into place (tile-editor.js), not swiped
  const noSwipe = authoring ? `${NO_SWIPE}, .ts-tile` : NO_SWIPE;
  const inSwipeArea = (target) => !target.closest(noSwipe);
  const lean = (dx) => block.style.setProperty('--ts-drag', `${Math.round(dx)}px`);

  // drag / swipe / click on the picture
  let start = null;
  block.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0 || !inSwipeArea(e.target)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    block.classList.add('is-dragging');
  });
  block.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    // capture once the gesture is clearly sideways, so vertical page scrolls pass
    if (!start.captured && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      start.captured = true;
      try { block.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
    if (start.captured) lean(dx);
  });
  const end = (e) => {
    if (!start) return;
    const { x, y } = start;
    start = null;
    block.classList.remove('is-dragging');
    lean(0);
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      // a click or tap: the right half goes forward, the left half back
      const r = block.getBoundingClientRect();
      step(e.clientX - r.left > r.width / 2 ? 1 : -1);
    }
  };
  block.addEventListener('pointerup', end);
  block.addEventListener('pointercancel', end);
  // a mouse drag moves the slides, not a copy of the image
  block.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('img, picture')) e.preventDefault();
  });

  // two-finger sideways swipe on a trackpad (vertical wheel still scrolls the page)
  let acc = 0;
  let lockUntil = 0;
  let accTimer;
  block.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;
    e.preventDefault(); // keep the browser from going back a page
    const now = performance.now();
    if (now < lockUntil) return;
    acc += e.deltaX;
    if (Math.abs(acc) > WHEEL_MIN) {
      step(acc > 0 ? 1 : -1);
      acc = 0;
      lockUntil = now + WHEEL_LOCK_MS;
    }
    clearTimeout(accTimer);
    accTimer = setTimeout(() => { acc = 0; }, 180);
  }, { passive: false });

  // arrow keys while focus is in the hero (e.g. on a dot)
  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  // the trailing pill: mouse (fine pointer with hover) only
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
  const pill = swipePill();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pos = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let frame = 0;
  const place = () => pill.style.setProperty('--ts-cursor-pos', `${pos.x}px ${pos.y}px`);
  const follow = () => {
    // ease towards the pointer, like the source's 0.45s power3 trail
    const k = reduce.matches ? 1 : 0.2;
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    place();
    frame = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.5
      ? requestAnimationFrame(follow) : 0;
  };
  const show = (on) => block.classList.toggle('has-cursor', on);
  block.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const over = start?.captured || inSwipeArea(e.target);
    const r = block.getBoundingClientRect();
    target.x = e.clientX - r.left;
    target.y = e.clientY - r.top;
    if (over && !block.classList.contains('has-cursor')) {
      // appear right at the pointer, then trail it
      pos.x = target.x;
      pos.y = target.y;
      place();
    }
    show(over);
    if (over && !frame) frame = requestAnimationFrame(follow);
  });
  block.addEventListener('pointerleave', () => show(false));
  return pill;
}

/** holds the rotation until reached, over the copy or stats, or with keyboard focus */
function wireHolds(block, areas) {
  const reasons = new Set(['start']);
  const send = () => block.dispatchEvent(new CustomEvent('hero:hold', { detail: reasons.size > 0 }));
  const set = (reason, on) => {
    const had = reasons.has(reason);
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    if (had !== on) send();
  };
  areas.filter(Boolean).forEach((area, i) => {
    area.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') set(`pointer-${i}`, true);
    });
    area.addEventListener('pointerleave', () => set(`pointer-${i}`, false));
  });
  block.addEventListener('focusin', (e) => set('focus', !!e.target.matches?.(':focus-visible')));
  block.addEventListener('focusout', (e) => {
    if (!block.contains(e.relatedTarget)) set('focus', false);
  });
  block.addEventListener('hero:running', (e) => block.classList.toggle('is-paused', !e.detail));
  send();
  return (reason) => set(reason, false);
}

/** decorates the Tech Slides style */
export default function decorateTechSlides(block, {
  bg, textCell, slideRows, firstScreen, helpers,
}) {
  const {
    maxSlides, readMediaFields, videoSources, createPoster, slideText, decorateContent,
    wireCarousel, keepUnusedSlides, moveInstrumentation, createOptimizedPicture,
    mobileMedia,
  } = helpers;
  const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onMobile = window.matchMedia(mobileMedia).matches;

  // the stats area: the hero's own Text (its stats and button are every slide's fallback)
  const info = textCell || document.createElement('div');
  info.classList.add('ts-info');
  const fallbackStats = textCell ? heroStats(textCell).map(statData) : [];
  const heroCta = textCell?.querySelector(':scope > .cta-wrapper a') || null;

  const items = [];
  slideRows.forEach((row) => {
    const media = readMediaFields([...row.children]);
    if (!(media.desktop || media.mobile || authoring) || items.length >= maxSlides) return;
    const sources = videoSources(media);
    items.push({
      media,
      sources,
      video: onMobile ? sources.mobile : sources.desktop,
      controls: [...row.children].some((cell) => cell.textContent.trim() === 'true'),
      text: slideText(row),
      // an image slide doesn't use its Thumbnail as a poster: it's the close-up tile
      tile: media.desktop?.img ? media.thumb : null,
      position: readPositions(row),
      resource: row.dataset.aueResource,
      row,
    });
  });

  const poster = (i) => createPoster(items[i].media, !i && firstScreen);

  // background slides, stacked
  const slides = items.map((item, i) => {
    const slide = document.createElement('div');
    slide.className = i === 0 ? 'slide is-active' : 'slide';
    if (i) slide.setAttribute('aria-hidden', 'true');
    moveInstrumentation(item.row, slide);
    return slide;
  });
  if (slides.length) {
    bg.classList.add('slides');
    bg.dataset.snapPassthrough = '';
    bg.replaceChildren(...slides);
  }
  const filled = new Set();
  const fill = (i) => {
    if (filled.has(i)) return;
    filled.add(i);
    slides[i].prepend(...poster(i));
  };
  if (slides.length) fill(0);

  // each slide's copy (its Text) and its stats and button
  const copy = document.createElement('div');
  copy.className = 'ts-copy';
  const tileLayer = document.createElement('div');
  tileLayer.className = 'ts-tiles';
  const headings = [];
  let slideCta = null;
  const panels = items.map((item, i) => {
    const panel = document.createElement('div');
    panel.className = i === 0 ? 'ts-slide is-active' : 'ts-slide';
    if (item.tile) {
      const tile = document.createElement('div');
      tile.className = i === 0 ? 'ts-tile is-active' : 'ts-tile';
      // optimise same-origin raster images only; keep any other as authored
      const url = new URL(item.tile.src, window.location.href);
      const optimize = url.origin === window.location.origin && !/\.svg$/i.test(url.pathname);
      const pic = optimize
        ? createOptimizedPicture(item.tile.src, item.tile.alt || '', false, [{ width: '480' }])
        : item.tile.closest('picture') || item.tile;
      const img = pic.querySelector?.('img') || pic;
      img.classList.add('ts-tile-img');
      if (optimize) moveInstrumentation(item.tile, img);
      tile.append(pic);
      (authoring ? slides[i] : tileLayer).append(tile);
      item.tileEl = tile;
    }
    item.stats = null;
    item.cta = null;
    if (item.text) {
      decorateContent(block, item.text, { inlineLinks: true });
      item.text.classList.add('ts-text');
      const parts = classSlideText(item.text);
      if (parts.stats.length) item.stats = parts.stats.map(statData);
      if (parts.cta) {
        item.cta = ctaData(parts.cta);
        slideCta = slideCta || parts.cta;
      }
      // heading lines blur in (not in the editor)
      if (parts.heading && !authoring && !reduce) headings.push(parts.heading);
      panel.append(item.text);
    }
    return panel;
  });
  if (authoring) panels.forEach((panel, i) => slides[i]?.append(panel));
  else copy.append(...panels);

  // the button shown: the hero's, else (cloned) the first slide's
  let baseCta = heroCta;
  if (!baseCta && slideCta) {
    const wrap = slideCta.closest('.cta-wrapper').cloneNode(true);
    wrap.classList.remove('ts-src');
    info.append(wrap);
    baseCta = wrap.querySelector('a');
  }
  const setInfo = statsArea(info, baseCta);
  const heroCtaData = ctaData(heroCta);
  const showInfo = (i, animate) => {
    const item = items[i];
    setInfo(item?.stats || fallbackStats, item?.cta || heroCtaData, animate);
  };

  // heading lines, laid out again when the copy changes width or the fonts arrive
  const split = () => headings.forEach((heading) => {
    splitLines(heading);
    staggerLines(heading.closest('.ts-text'));
  });
  if (headings.length) {
    let width = 0;
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w === width) return;
      width = w;
      split();
    }).observe(copy);
    // Adobe Fonts can arrive after fonts.ready: re-split when a font loads
    document.fonts?.ready.then(split);
    document.fonts?.addEventListener?.('loadingdone', split);
  }
  panels.forEach((panel) => {
    const text = panel.querySelector('.ts-text');
    if (text) staggerLines(text);
  });

  let current = 0;
  let started = false;
  const show = (to) => {
    panels.forEach((panel, i) => {
      const on = i === to;
      panel.classList.toggle('is-active', on);
      panel.inert = !on;
      if (on) panel.removeAttribute('aria-hidden');
      else panel.setAttribute('aria-hidden', 'true');
      const tile = items[i].tileEl;
      if (!tile) return;
      tile.classList.toggle('is-active', on);
      tile.inert = !on;
      if (on) tile.removeAttribute('aria-hidden');
      else tile.setAttribute('aria-hidden', 'true');
    });
    block.style.setProperty('--ts-index', to);
    if (to === current) return;
    current = to;
    // after the first slide, the new copy waits for the old to blur out
    block.classList.add('has-changed');
    const animate = started && !reduce;
    // the stats roll over a moment into the change
    setTimeout(() => {
      if (current === to) showInfo(to, animate);
    }, animate ? ROLL_AT : 0);
  };
  show(0);
  showInfo(0, false);

  // progress dots, one per slide
  const nav = document.createElement('div');
  nav.className = 'ts-dots';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Slides');
  const dots = items.map((item, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'ts-dot';
    dot.setAttribute('aria-label', `Show slide ${i + 1} of ${items.length}`);
    if (!i) dot.setAttribute('aria-current', 'true');
    const bar = document.createElement('span');
    bar.className = 'ts-dot-fill';
    bar.setAttribute('aria-hidden', 'true');
    dot.append(bar);
    return dot;
  });
  nav.append(...dots);

  let controls = null;
  let pill = null;
  const start = () => {
    started = true;
    block.classList.add('is-started');
  };
  if (slides.length > 1) {
    // the change itself is the prototype's 0.85 s, then the dot fills for 6 s
    controls = wireCarousel(block, items, slides, dots, nav, fill, show, {
      webgl: false, slideMs: 6850, resume: true, navHold: false,
    });
    pill = wireSwipe(block, dots, authoring);
  }

  const layers = tileLayer.children.length ? [tileLayer] : [];
  // the dots sit beside the copy, not in it, so moving the copy (Wave In) can't shift them
  const navLayer = slides.length > 1 ? [nav] : [];
  block.replaceChildren(bg, ...layers, copy, ...navLayer, info, ...keepUnusedSlides(slideRows));
  if (controls) block.append(controls);
  if (pill) block.append(pill);

  // the close-up tiles, each centred on its Tile Position on its slide's image
  const mobileQuery = window.matchMedia(mobileMedia);
  const geometry = {
    // a slide's position as authored: mobile's, else desktop's, else the default
    position: (i) => {
      const { d, m } = items[i].position;
      return (mobileQuery.matches && m) || d || DEFAULT_TILES[i % 2];
    },
    toPx: (i, { x, y }) => {
      const f = imageFrame(block, slides[i]);
      return { x: f.left + (x / 100) * f.w * f.scale, y: f.top + (1 - y / 100) * f.h * f.scale };
    },
    toPct: (i, { x, y }) => {
      const f = imageFrame(block, slides[i]);
      return {
        x: ((x - f.left) / (f.w * f.scale)) * 100,
        y: (1 - (y - f.top) / (f.h * f.scale)) * 100,
      };
    },
    // a centre point kept so the whole tile is on screen, inside the side margins
    fit: (i, { x, y }) => {
      const half = (items[i].tileEl?.offsetWidth || 0) / 2;
      const side = tileSide(block, mobileQuery.matches);
      const { clientWidth: W, clientHeight: H } = block;
      return {
        x: clamp(x, side + half, Math.max(side + half, W - side - half)),
        y: clamp(y, side + half, Math.max(side + half, H - side - half)),
      };
    },
  };
  const placeTile = (i) => {
    const tile = items[i].tileEl;
    if (!tile || !block.clientWidth) return;
    const { x, y } = geometry.fit(i, geometry.toPx(i, geometry.position(i)));
    tile.style.setProperty('--ts-tile-x', `${x.toFixed(1)}px`);
    tile.style.setProperty('--ts-tile-y', `${y.toFixed(1)}px`);
    // only shown once its spot comes from the slide's real image, not the 1280x720 guess
    if (frameKnown(slides[i])) tile.classList.add('is-placed');
  };
  const placeTiles = () => items.forEach((item, i) => placeTile(i));
  if (items.some((item) => item.tileEl)) {
    new ResizeObserver(placeTiles).observe(block);
    mobileQuery.addEventListener('change', placeTiles);
    // a slide's image loading (or failing) gives its real size
    bg.addEventListener('load', placeTiles, true);
    bg.addEventListener('error', placeTiles, true);
    placeTiles();
  }

  // Universal Editor: the tiles can be dragged into place
  if (authoring && items.some((item) => item.tileEl && item.resource)) {
    import('./tile-editor.js')
      .then(({ default: editTiles }) => editTiles({
        block,
        tiles: items.map((item, index) => ({ el: item.tileEl, resource: item.resource, index }))
          .filter((tile) => tile.el && tile.resource),
        mobileQuery,
        geometry,
        // a new position (shown fitted): the mobile one while the editor is at a mobile size
        move: (i, mobile, pct) => {
          items[i].position[mobile ? 'm' : 'd'] = pct;
          items[i].position.moved = true;
          placeTile(i);
        },
        // where the tile's spot comes from, for the badge on hover or focus
        source: (i) => {
          const {
            d, m, inMarkup, moved,
          } = items[i].position;
          if (mobileQuery.matches && m) return 'from Tile Position (Mobile)';
          if (d) return moved ? 'moved, not yet in the page' : 'from Tile Position';
          if (inMarkup) return 'default spot: Tile Position is empty';
          return 'default spot: this page has no Tile Position field yet';
        },
      }))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('tile editor failed to load', err));
  }

  // the first slide plays in once the section is reached; held until then
  if (authoring || reduce || slides.length < 2) {
    start();
    return;
  }
  const release = wireHolds(block, [copy, nav, info]);
  block.classList.add('is-paused');
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    start();
    release('start');
  }, { rootMargin: START_MARGIN });
  io.observe(block);
}
