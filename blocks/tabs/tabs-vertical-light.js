// Tabs "Vertical" in a Light section

import { inEditor, onAuthor } from '../../scripts/utils/common.js';

// tabs the style takes (the Style field's help); the layout keeps room for SLOTS of them
const TABS_MIN = 3;
const SLOTS = 7;
// least room (px) kept between the section heading and the list on the rail
const HEADING_GAP = 16;

// the prototype's motion (ms): descriptions open; the new image fades in and settles from a scale
const OPEN_MS = 500;
const FADE_MS = 600;
const SETTLE_MS = 1200;
const SETTLE_SCALE = 1.06;
const UNDER_MS = 700;
// px a sideways swipe on the image needs, and how much more sideways than up or down it must be
const SWIPE_MIN = 40;
const SWIPE_BIAS = 1.5;
const power3InOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2);
const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

/** The prototype's motion: opening descriptions with one bar, image crossfade, swipe */
function wireMotion(block, list, buttons, panels) {
  block.classList.add('is-motion');
  const select = (i) => {
    if (buttons[i]?.getAttribute('aria-selected') !== 'true') buttons[i]?.click();
  };

  // each description under its name from 900px: a copy for the eye, the panel keeps the real one
  const mores = buttons.map((button, i) => {
    const more = document.createElement('div');
    more.className = 'tabs-tab-more';
    more.setAttribute('aria-hidden', 'true');
    more.style.setProperty('--tab-index', i);
    const inner = document.createElement('div');
    const content = panels[i]?.querySelector(':scope > .tabs-panel-content');
    [...(content?.children || [])].filter((el) => !el.classList.contains('tabs-media'))
      .forEach((el) => inner.append(el.cloneNode(true)));
    inner.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    more.append(inner);
    button.after(more);
    return more;
  });
  const bar = document.createElement('span');
  bar.className = 'tabs-bar';
  bar.setAttribute('aria-hidden', 'true');
  list.append(bar);

  let active = Math.max(0, buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true'));
  const open = buttons.map((_, i) => (i === active ? 1 : 0));
  const place = () => {
    mores.forEach((more, i) => {
      more.style.height = `${(more.firstElementChild.offsetHeight * open[i]).toFixed(2)}px`;
    });
    const tab = buttons[active];
    bar.style.translate = `0 ${tab.offsetTop}px`;
    bar.style.height = `${tab.offsetHeight + mores[active].offsetHeight}px`;
  };
  place();
  const resized = new ResizeObserver(place);
  resized.observe(list);
  mores.forEach((more) => resized.observe(more.firstElementChild));
  document.fonts?.ready.then(place);

  let frame = 0;
  const openTo = (index) => {
    cancelAnimationFrame(frame);
    if (!motionOk()) {
      open.forEach((_, i) => { open[i] = i === index ? 1 : 0; });
      place();
      return;
    }
    const from = open.slice();
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / OPEN_MS);
      const e = power3InOut(k);
      from.forEach((v, i) => { open[i] = v * (1 - e) + (i === index ? e : 0); });
      place();
      frame = k < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  };

  // the new image fades in over the old one, which stays under it until then
  let underTimer = 0;
  const crossfade = (from, to) => {
    clearTimeout(underTimer);
    block.querySelectorAll('.tabs-media-prev').forEach((el) => el.remove());
    const media = to?.querySelector('.tabs-media');
    const img = media?.querySelector('img');
    if (!img || !motionOk()) return;
    const prev = from?.querySelector('.tabs-media img');
    if (prev) {
      const under = document.createElement('div');
      under.className = 'tabs-media-prev';
      under.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('img');
      copy.src = prev.currentSrc || prev.src;
      copy.alt = '';
      under.append(copy);
      media.prepend(under);
      underTimer = setTimeout(() => under.remove(), UNDER_MS);
    }
    img.getAnimations().forEach((a) => a.cancel());
    img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease' });
    img.animate([{ transform: `scale(${SETTLE_SCALE})` }, { transform: 'none' }], {
      duration: SETTLE_MS, easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    });
  };

  block.addEventListener('tabs:change', ({ target, detail: { index, previous } }) => {
    if (target !== block) return;
    active = index;
    openTo(index);
    crossfade(panels[previous], panels[index]);
  });

  // phones: a sideways swipe on the image moves to the next feature (or the one before)
  let touch = null;
  block.addEventListener('touchstart', (e) => {
    touch = e.target.closest('.tabs-media') && e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  block.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) <= SWIPE_MIN || Math.abs(dx) <= Math.abs(dy) * SWIPE_BIAS) return;
    select((active + (dx < 0 ? 1 : -1) + buttons.length) % buttons.length);
  }, { passive: true });
}

/** Shows, updates or (with no text) removes one of the notes for authors; a click hides them */
function setNote(block, key, text) {
  let box = block.querySelector(':scope > .tabs-note');
  if (box?.dataset.hidden) return;
  let line = box?.querySelector(`[data-note="${key}"]`);
  if (!text) {
    line?.remove();
    if (box && !box.querySelector('[data-note]')) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement('p');
    box.className = 'tabs-note';
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

const listOf = (numbers) => (numbers.length > 1
  ? `tabs ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}` : `tab ${numbers[0]}`);
// cut: at least half a line hidden (a line's descenders alone overflow by a pixel or two)
const isCut = (el) => {
  if (!el) return false;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  return el.scrollHeight - el.clientHeight > lh / 2;
};

/** Desktop: keeps the list below the heading and in the frame, tightening the text if needed */
function fitter(block, section, list, mores) {
  const heading = section?.querySelector(':scope > .default-content-wrapper > :is(h1, h2, h3)');
  const desktop = window.matchMedia('(width >= 900px)');
  const fits = () => {
    const b = block.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    // the longest description, when its tab opens, adds this much above the list
    const inner = (m) => m.firstElementChild?.offsetHeight || 0;
    const open = mores.find((m) => m.offsetHeight > 1);
    const longest = mores.length ? Math.max(0, ...mores.map(inner)) : 0;
    const extra = longest - (open ? open.offsetHeight : 0);
    const h = heading?.getBoundingClientRect();
    const over = h && h.bottom > b.top && h.left < l.right && h.top < b.bottom;
    const top = over ? h.bottom + HEADING_GAP : b.top;
    return l.height + extra <= b.bottom - top + 1;
  };
  const levels = ['is-tv-tight', 'is-tv-tighter', 'is-tv-tightest'];
  return () => {
    section?.classList.remove(...levels);
    if (!desktop.matches) return;
    levels.find((level) => {
      if (fits()) return true;
      section?.classList.add(level);
      return false;
    });
  };
}

/** Marks each panel's image and builds the thumbnail strip from them */
export default function decorateVerticalLight(block) {
  const list = block.querySelector(':scope > .tabs-list');
  if (!list) return;
  const editing = inEditor();
  const buttons = [...list.querySelectorAll(':scope > .tabs-tab')];
  const panels = [...block.querySelectorAll(':scope > .tabs-panel')];
  // the name in a span of its own, so a long one can end in an ellipsis
  buttons.forEach((button) => {
    const label = document.createElement('span');
    label.className = 'tabs-tab-label';
    label.append(...button.childNodes);
    button.append(label);
  });
  const slots = Math.max(buttons.length, SLOTS);
  block.style.setProperty('--tabs-count', slots);
  // the section sizes the layout for its heading too (tabs-vertical-light.css): it needs the count
  const section = block.closest('main > .section');
  if (section?.querySelector(':scope > .tabs-wrapper > .tabs.vertical') === block) {
    section.style.setProperty('--tabs-count', slots);
  }
  // the big images are clipped, positioned layers that never scroll
  block.dataset.snapPassthrough = '';

  const strip = document.createElement('div');
  strip.className = 'tabs-thumbs';
  strip.setAttribute('aria-hidden', 'true');

  buttons.forEach((button, i) => {
    const content = panels[i]?.querySelector(':scope > .tabs-panel-content');
    const field = panels[i]?.querySelector(':scope > .tabs-panel-image');
    const fieldPic = field?.querySelector('picture') || field?.querySelector('img');
    if (content && fieldPic && !editing) {
      const line = document.createElement('p');
      line.append(fieldPic);
      content.prepend(line);
      field.remove();
    } else if (field && editing) {
      // the editor keeps the Image field where it is, so it stays editable: it is the big image
      field.classList.replace('tabs-panel-image', 'tabs-media');
    }
    const img = content?.querySelector('img') || panels[i]?.querySelector(':scope > .tabs-media img');
    // the image's own paragraph (or the bare picture) is the big image
    const media = img?.closest('.tabs-panel-content > *');
    media?.classList.add('tabs-media');

    const thumb = document.createElement('div');
    thumb.className = 'tabs-thumb';
    thumb.dataset.index = i;
    if (img) {
      const small = document.createElement('img');
      small.src = img.currentSrc || img.src;
      small.alt = '';
      small.loading = 'lazy';
      small.decoding = 'async';
      thumb.append(small);
    }
    strip.append(thumb);
  });

  const mark = (index) => {
    [...strip.children].forEach((thumb, i) => thumb.classList.toggle('is-active', i === index));
  };
  mark(buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true'));

  strip.addEventListener('click', (e) => {
    const thumb = e.target.closest('.tabs-thumb');
    if (thumb) buttons[Number(thumb.dataset.index)]?.click();
  });
  // tabs nested in a panel bubble their own changes; only this block's count
  block.addEventListener('tabs:change', ({ target, detail: { index } }) => {
    if (target === block) mark(index);
  });

  block.append(strip);
  if (!editing) wireMotion(block, list, buttons, panels);

  // text kept inside the layout, and authors told what is cut or missing
  const mores = [...list.querySelectorAll(':scope > .tabs-tab-more')];
  const fit = fitter(block, section, list, mores);
  const author = onAuthor();
  const authored = Number(block.dataset.tabsAuthored) || buttons.length;
  const max = Number(block.dataset.tabsMax) || SLOTS;
  const check = () => {
    fit();
    if (!author) return;
    const plural = (k) => `tab${k === 1 ? '' : 's'}`;
    if (authored > max) {
      setNote(block, 'count', `Remove ${authored - max} ${plural(authored - max)}: this layout takes at most ${max} tabs (now ${authored}). Only the first ${max} show on the published page.`);
    } else if (authored < TABS_MIN) {
      setNote(block, 'count', `Add ${TABS_MIN - authored} more ${plural(TABS_MIN - authored)}: this layout needs at least ${TABS_MIN} tabs (now ${authored}).`);
    }
    const n = (arr) => arr.map((ok, i) => (ok ? i + 1 : 0)).filter(Boolean);
    const names = n(buttons.map((b) => isCut(b.querySelector('.tabs-tab-label'))));
    const lines = n(panels.map((p, i) => {
      const shown = mores[i]?.querySelector('p') || p.querySelector('.tabs-panel-content > :not(.tabs-media)');
      return isCut(shown);
    }));
    const texts = (p) => p.querySelectorAll('.tabs-panel-content > :not(.tabs-media)');
    const extra = n(panels.map((p) => texts(p).length > 1));
    const noImage = n(panels.map((p) => !p.querySelector('.tabs-media img')));
    const noName = n(buttons.map((b) => 'untitled' in b.dataset));
    const heading = section?.querySelector(':scope > .default-content-wrapper > :is(h1, h2, h3)');
    setNote(block, 'names', names.length ? `Shorten the name of ${listOf(names)}: it doesn't fit, so the end is cut off.` : '');
    setNote(block, 'lines', lines.length ? `Shorten the description of ${listOf(lines)}: it doesn't fit, so the end is cut off.` : '');
    setNote(block, 'extra', extra.length ? `Use one paragraph for the description of ${listOf(extra)}: only the first one shows.` : '');
    setNote(block, 'image', noImage.length ? `Add an image to ${listOf(noImage)}.` : '');
    setNote(block, 'name', noName.length ? `Add a Tab Title to ${listOf(noName)}.` : '');
    setNote(block, 'heading', isCut(heading) ? 'Shorten the section title: it doesn\'t fit, so the end is cut off.' : '');
  };
  let frame = 0;
  const checkSoon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(check);
  };
  window.addEventListener('resize', checkSoon, { passive: true });
  document.fonts?.addEventListener('loadingdone', checkSoon);
  document.fonts?.ready.then(checkSoon);
  if (section) new ResizeObserver(checkSoon).observe(section);
  checkSoon();
}
