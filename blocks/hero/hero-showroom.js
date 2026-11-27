// Showroom: Text paras before the first bold label are the eyebrow; labelled paras form the card

import { inEditor } from '../../scripts/utils/common.js';

function leadingLabel(p) {
  const first = [...p.childNodes]
    .find((n) => n.nodeType !== Node.TEXT_NODE || n.textContent.trim());
  return first?.nodeType === Node.ELEMENT_NODE && first.matches('strong, b') ? first : null;
}

// photo wipe duration (hero-showroom.css --sr-wipe-ms), plus a frame to settle
const WIPE_MS = 950;
const SETTLE_MS = 50;

/** Each further heading sentence on its own line; the space before each br lets phones hide it. */
function breakSentences(contents) {
  contents.querySelectorAll(':scope > .content > :is(h1, h2, h3, h4, h5, h6)').forEach((heading) => {
    [...heading.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const parts = node.textContent.split(/(?<=[.!?])\s+(?=\S)/);
      if (parts.length < 2) return;
      const lines = document.createDocumentFragment();
      parts.forEach((part, i) => {
        if (i) {
          const br = document.createElement('br');
          br.className = 'showroom-break';
          lines.append(' ', br);
        }
        lines.append(part);
      });
      node.replaceWith(lines);
    });
  });
}

/** Phones: shrinks headings over two lines in 4% steps until they fit; desktop keeps CSS size. */
function fitHeadings(contents) {
  const phone = window.matchMedia('(width < 900px)');
  const headings = [...contents.querySelectorAll(':scope > .content > :is(h1, h2, h3, h4, h5, h6)')];
  const fit = () => headings.forEach((heading) => {
    heading.style.removeProperty('font-size');
    if (!phone.matches) return;
    let size = parseFloat(getComputedStyle(heading).fontSize);
    const lines = () => Math.round(
      heading.offsetHeight / parseFloat(getComputedStyle(heading).lineHeight),
    );
    for (let k = 0; k < 12 && lines() > 2; k += 1) {
      size *= 0.96;
      heading.style.fontSize = `${size}px`;
    }
  });
  // refit on layout, width changes and web font load
  let width = -1;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return;
    width = entry.contentRect.width;
    fit();
  }).observe(contents);
  document.fonts?.ready.then(fit);
  document.fonts?.addEventListener('loadingdone', fit);
}

/** Thumbs (and phone swipes) pick slides; a pick during the photo wipe is queued until it ends. */
function wireSlides(block) {
  const nav = block.querySelector(':scope > .slide-nav');
  const section = block.closest('.section');
  if (!nav || !section) return;
  const thumbs = [...nav.querySelectorAll('.slide-thumb')];
  if (thumbs.length < 2) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const current = () => thumbs.findIndex((thumb) => thumb.hasAttribute('aria-current'));

  let wipingUntil = 0;
  let timer = 0;
  let queued = null;
  let instant = false;
  const wiping = () => performance.now() < wipingUntil;
  const endWipe = () => {
    clearTimeout(timer);
    wipingUntil = 0;
    block.classList.remove('is-wiping');
  };

  // runs before hero.js's own click handler on the thumbnail
  nav.addEventListener('click', (e) => {
    const thumb = e.target.closest('.slide-thumb');
    if (!thumb || thumb.hasAttribute('aria-current') || instant || reduce.matches) return;
    if (wiping()) {
      e.stopImmediatePropagation();
      queued = thumb;
      return;
    }
    block.classList.add('is-wiping');
    wipingUntil = performance.now() + WIPE_MS;
    clearTimeout(timer);
    timer = setTimeout(() => {
      endWipe();
      const next = queued;
      queued = null;
      if (next && !next.hasAttribute('aria-current')) next.click();
    }, WIPE_MS + SETTLE_MS);
  }, true);

  const go = (i, now = false) => {
    const thumb = thumbs[i];
    if (!thumb || i === current()) return;
    if (!now) {
      thumb.click();
      return;
    }
    // instant: no wipe or caption transition
    endWipe();
    queued = null;
    instant = true;
    block.classList.add('showroom-instant');
    thumb.click();
    instant = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      block.classList.remove('showroom-instant');
    }));
  };

  // phones: a sideways swipe on the copy steps to the next/previous slide
  const phone = window.matchMedia('(width < 900px)');
  const copy = block.querySelector(':scope > .slide-contents');
  let swipeX = null;
  let swipeY = 0;
  copy?.addEventListener('pointerdown', (e) => {
    if (!phone.matches || !e.isPrimary) return;
    swipeX = e.clientX;
    swipeY = e.clientY;
  });
  copy?.addEventListener('pointerup', (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    const dy = e.clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      go(Math.max(0, Math.min(thumbs.length - 1, current() + (dx < 0 ? 1 : -1))));
    }
  });
  copy?.addEventListener('pointercancel', () => { swipeX = null; });
}

export default function decorateShowroom(block, textCell) {
  if (!textCell) return;
  const paras = [...textCell.querySelectorAll(':scope > p')];
  const rows = [];
  let pending = null;
  paras.forEach((p) => {
    const label = leadingLabel(p);
    if (label) {
      const value = p.cloneNode(true);
      value.querySelector('strong, b')?.remove();
      while (value.firstChild && (value.firstChild.nodeName === 'BR' || !value.firstChild.textContent.trim())) {
        value.firstChild.remove();
      }
      const row = {
        label: label.textContent.trim(),
        value: value.childNodes.length ? value : null,
        source: [p],
      };
      rows.push(row);
      pending = row.value ? null : row;
      return;
    }
    if (pending) {
      pending.value = p.cloneNode(true);
      pending.source.push(p);
      pending = null;
      return;
    }
    if (!rows.length) p.classList.add('showroom-eyebrow');
  });
  if (!rows.length) return;

  const card = document.createElement('dl');
  card.className = 'showroom-card';
  rows.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'showroom-row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value) dd.append(...value.childNodes);
    item.append(dt, dd);
    card.append(item);
  });

  // UE: card stays in the Text field so inline editing works; on the site it replaces the paras
  if (inEditor()) {
    rows.forEach(({ source }) => source.forEach((p) => p.classList.add('showroom-source')));
    textCell.append(card);
    return;
  }
  rows.forEach(({ source }) => source.forEach((p) => p.remove()));
  const contents = block.querySelector(':scope > .slide-contents');
  (contents || textCell).after(card);
  if (contents) {
    breakSentences(contents);
    fitHeadings(contents);
  }
  wireSlides(block);
}
