/*
 * Cards "Timeline" style (About Us — "Into Steel"), loaded by cards.js only
 * when the style is picked. A flat coverflow of chapter cards (the Carousel
 * engine in cards.js) under a header that shows the centre card's title and
 * text, with a chapter pill and a chapter menu. It plays through the chapters
 * on its own, left to right: the next chapter, on the right, comes to the
 * centre, wrapping from the last back to the first.
 *
 * Each card is Image + Text. The Text field is plain rich text; its parts are
 * recognised by shape, so authors don't type any markers:
 *   - year:        a paragraph that is only a year, e.g. "1952" (not shown)
 *   - chapter:     a bold paragraph, e.g. "**The Origin of JSW**" (pill/menu)
 *   - title:       the heading, e.g. "Into Steel" (without one, the first
 *                  plain paragraph)
 *   - location:    an italic paragraph, e.g. "*15°11′46″N / 76°40′41″E
 *                  Toranagallu, Karnataka*" (shown on the image)
 *   - description: every other paragraph
 * Figma: desktop "Horizontal" 7325:4642, mobile "22" 7325:4835.
 */

const YEAR = /^\d{4}$/;
// cards the Timeline is designed for (Figma: ten chapters)
const CARDS_MAX = 10;
// how long each chapter stays at rest before autoplay moves on (the move
// itself is --carousel-move, cards-timeline.css)
const AUTOPLAY_MS = 2000;

/**
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLSpanElement}
 */
/**
 * How many of the words fit in maxHeight when set in measure (a hidden copy of
 * the heading, as wide as it): at least the first.
 * @param {Element} measure
 * @param {string[]} words
 * @param {number} maxHeight
 * @returns {number}
 */
function fittingWords(measure, words, maxHeight) {
  let n = words.length;
  measure.textContent = words.join(' ');
  while (n > 1 && measure.offsetHeight > maxHeight + 1) {
    n -= 1;
    measure.textContent = words.slice(0, n).join(' ');
  }
  return n;
}

function span(className, text = '') {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Splits an element's content at its line breaks into one span per line,
 * moving the existing nodes (nothing is re-parsed as HTML); empty lines are
 * dropped.
 * @param {Element} el
 * @returns {HTMLSpanElement[]}
 */
function splitLines(el) {
  const lines = [[]];
  [...el.childNodes].forEach((node) => {
    if (node.nodeName === 'BR') lines.push([]);
    else lines[lines.length - 1].push(node);
  });
  return lines
    .filter((nodes) => nodes.some((node) => node.textContent.trim()))
    .map((nodes) => {
      const line = span('tl-location-line');
      line.append(...nodes);
      return line;
    });
}

/**
 * @param {Element} p
 * @returns {boolean} true if the whole paragraph is wrapped in one `tag`
 */
function onlyChild(p, tag) {
  const [child] = p.children;
  return p.children.length === 1 && child.matches(tag)
    && p.textContent.trim() === child.textContent.trim();
}

/**
 * Classes the parts of one card's text and reads them.
 * @param {Element} li the card
 * @param {number} i its position
 * @returns {{year: string, chapter: string, title: string, description: string}}
 */
function readCard(li, i) {
  const body = li.querySelector('.card-body');
  const data = {
    year: '', chapter: '', title: '', description: '',
  };
  if (!body) return data;

  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.classList.add('tl-title');
    data.title = heading.textContent.trim();
  }
  const description = [];
  body.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    if (!text) return;
    if (!data.year && YEAR.test(text)) {
      p.classList.add('tl-year');
      data.year = text;
    } else if (!data.chapter && onlyChild(p, 'strong, b')) {
      p.classList.add('tl-chapter');
      data.chapter = text;
    } else if (onlyChild(p, 'em, i')) {
      p.classList.add('tl-location');
      // one span per line (coordinates, place), so CSS can stack them on
      // desktop and run them in a row on mobile; skipped in the editor so the
      // rich text is never rewritten while it is being authored
      if (!document.querySelector('[data-aue-resource]')) {
        p.replaceChildren(...splitLines(p.firstElementChild));
      }
    } else {
      p.classList.add('tl-desc');
      description.push(p);
    }
  });
  // a title authored as a plain paragraph rather than a heading: the first
  // plain paragraph is the title, so the header and the menu still name it
  if (!data.title && description.length) {
    const first = description.shift();
    first.classList.replace('tl-desc', 'tl-title');
    data.title = first.textContent.trim();
  }
  data.description = description.map((p) => p.textContent.trim()).join(' ');
  data.chapter = data.chapter || data.title || `Chapter ${i + 1}`;
  return data;
}

/**
 * @param {string} className
 * @param {string} label accessible label
 * @returns {HTMLButtonElement}
 */
function button(className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (label) btn.setAttribute('aria-label', label);
  return btn;
}

/**
 * The Timeline slides up off the screen like a sheet while the section after it
 * stays still underneath and is uncovered (prototype "Scroll" 6370:8011). That
 * section is held at the top of the screen for as long as it would still be
 * coming up (--tl-reveal-y, cards-timeline.css). The shift doesn't change the
 * layout, so the page's snap stops stay where they are. It follows the scroll on
 * GSAP's clock once the section snap has loaded GSAP (the same frame as the
 * snap's scroll, so it never lags), else on the scroll event.
 * @param {Element} section the Timeline's section
 */
function revealNext(section) {
  const next = section?.nextElementSibling;
  if (!next?.classList.contains('section')) return;
  // plain scrolling in Universal Editor and for reduced motion
  if (document.querySelector('[data-aue-resource]')) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let shift = 0;
  const update = () => {
    // where the next section's top would be on screen without the shift
    const top = next.getBoundingClientRect().top - shift;
    const s = reduce.matches ? 0 : Math.min(0, Math.max(-section.offsetHeight, -top));
    if (s === shift) return;
    shift = s;
    next.style.setProperty('--tl-reveal-y', `${s}px`);
  };

  // GSAP's clock only runs this while the Timeline or the next section is on
  // screen
  const shown = new Set();
  let ticking = false;
  const sync = () => {
    const { gsap } = window;
    if (shown.size && gsap && !ticking) gsap.ticker.add(update);
    else if (!shown.size && ticking) gsap.ticker.remove(update);
    ticking = Boolean(shown.size && gsap);
  };
  new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? shown.add(e.target) : shown.delete(e.target)));
    sync();
    update();
  }).observe(section);
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) shown.add(next); else shown.delete(next);
    sync();
  }).observe(next);
  window.addEventListener('scroll', () => { sync(); update(); }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

/**
 * @param {Element} block the cards block (classes: timeline)
 * @param {HTMLUListElement} ul the decorated card list
 * @param {Function} decorateCarousel the carousel engine from cards.js (passed
 *   in rather than imported, so the two modules don't import each other)
 */
/**
 * Universal Editor can't cap how many items a block holds, so the Timeline
 * tells the author on the canvas how many cards it has against the 10 it
 * takes, as the Collage does for its images.
 * @param {Element} block
 * @param {number} count authored cards
 */
function showCardCount(block, count) {
  block.querySelector(':scope > .tl-notice')?.remove();
  const notice = document.createElement('p');
  notice.className = 'tl-notice';
  notice.setAttribute('role', 'status');
  const extra = count - CARDS_MAX;
  notice.textContent = extra > 0
    ? `Timeline takes up to ${CARDS_MAX} cards. ${count} added: remove ${extra}.`
    : `Timeline: ${count} of ${CARDS_MAX} cards added.`;
  notice.classList.toggle('is-invalid', extra > 0 || !count);
  block.prepend(notice);
}

export default function decorateTimeline(block, ul, decorateCarousel) {
  // the Carousel style's ring and card states (cards.css) are the base; the
  // Timeline CSS reshapes them into a flat strip
  block.classList.add('carousel');
  const chapters = [...ul.children].map(readCard);
  const number = (i) => String(i + 1).padStart(2, '0');

  // header: the centre card's title and text. On a change the old text fades
  // out while the new one fades in, in the same place, as the Pillars text
  // does, in step with the cards' move (cards-timeline.css)
  const head = document.createElement('div');
  head.className = 'tl-head';
  head.setAttribute('aria-live', 'polite');
  const text = document.createElement('div');
  text.className = 'tl-head-text';
  const title = document.createElement('h2');
  title.className = 'tl-head-title';
  const desc = document.createElement('p');
  desc.className = 'tl-head-desc';
  text.append(title, desc);
  head.append(text);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = false;
  // the text on show now leaves as a faded copy (hidden from screen readers,
  // which only hear the new chapter), and the text itself fades back in
  const crossfade = () => {
    if (!shown || reduce) {
      shown = true;
      return;
    }
    const leaving = text.cloneNode(true);
    leaving.classList.remove('is-entering');
    leaving.classList.add('is-leaving');
    leaving.setAttribute('aria-hidden', 'true');
    // a change mid-fade leaves from where the text is, not from full
    leaving.style.opacity = getComputedStyle(text).opacity;
    head.append(leaving);
    text.classList.add('is-entering');
    // eslint-disable-next-line no-unused-expressions
    text.offsetWidth; // the new text starts from transparent
    requestAnimationFrame(() => {
      leaving.style.opacity = '0';
      text.classList.remove('is-entering');
    });
    const fade = getComputedStyle(block).getPropertyValue('--tl-head-fade').trim();
    const ms = parseFloat(fade) * (fade.endsWith('ms') ? 1 : 1000) || 0;
    window.setTimeout(() => leaving.remove(), ms + 100);
  };

  const controls = document.createElement('div');
  controls.className = 'tl-controls';

  // the pill names the current chapter; it and the grid button open the menu
  const pill = button('tl-pill');
  pill.setAttribute('aria-haspopup', 'true');
  pill.setAttribute('aria-expanded', 'false');
  const pillLabel = document.createElement('span');
  pillLabel.className = 'tl-pill-label';
  const pillNumber = document.createElement('span');
  pillNumber.className = 'tl-pill-number';
  pill.append(pillLabel, pillNumber);

  const grid = button('tl-grid', 'All chapters');
  grid.setAttribute('aria-haspopup', 'true');
  grid.setAttribute('aria-expanded', 'false');

  // the chapter menu, a menu button pattern (WAI-ARIA): opening it moves focus
  // to the current chapter; the arrow keys move through the chapters, Home /
  // End to the first / last, Enter or Space picks one, Esc closes it and Tab
  // leaves it. Only the focused chapter is tabbable (roving tabindex).
  const menu = document.createElement('ol');
  menu.className = 'tl-menu';
  menu.id = `tl-menu-${document.querySelectorAll('.tl-menu').length}`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Chapters');
  pill.setAttribute('aria-controls', menu.id);
  grid.setAttribute('aria-controls', menu.id);
  const items = chapters.map((chapter, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const item = button('tl-menu-item');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    item.append(span('tl-menu-name', chapter.chapter), span('tl-menu-number', number(i)));
    li.append(item);
    menu.append(li);
    return item;
  });

  // the menu fades in and out (cards-timeline.css), so it stays in the page and
  // is hidden by the block's state class rather than the hidden attribute
  const isOpen = () => block.classList.contains('is-menu-open');
  let opener = pill; // the button that opened the menu gets focus back
  let ring = null;
  const focusItem = (i) => {
    const k = (i + items.length) % items.length;
    items.forEach((item, n) => { item.tabIndex = n === k ? 0 : -1; });
    // the menu is already on screen: focusing it must never scroll the page
    items[k].focus({ preventScroll: true });
  };
  const currentItem = () => Math.max(0, items
    .findIndex((item) => item.hasAttribute('aria-current')));
  // `focusAt`: the chapter to focus once open (the current one by default)
  const setOpen = (open, focusAt = currentItem()) => {
    block.classList.toggle('is-menu-open', open);
    [pill, grid].forEach((btn) => btn.setAttribute('aria-expanded', String(open)));
    // the chapters don't move on while the visitor is picking one
    ring?.hold(open);
    if (open) focusItem(focusAt);
  };
  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) opener.focus({ preventScroll: true });
  };
  [pill, grid].forEach((btn) => {
    btn.addEventListener('click', () => {
      opener = btn;
      if (isOpen()) close(false);
      else setOpen(true);
    });
    // ↓ / ↑ on the closed button open the menu on the current / last chapter
    btn.addEventListener('keydown', (e) => {
      if (isOpen() || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      e.stopPropagation(); // not a page step for the section snap
      opener = btn;
      setOpen(true, e.key === 'ArrowUp' ? items.length - 1 : currentItem());
    });
  });
  // picking a chapter glides the cards to it, as clicking a side card does
  items.forEach((item, i) => item.addEventListener('click', () => {
    close(true);
    ring?.goTo(i, { glide: true });
  }));
  menu.addEventListener('keydown', (e) => {
    const at = items.indexOf(document.activeElement);
    const moves = {
      ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: -1,
    };
    if (e.key in moves) {
      e.preventDefault();
      e.stopPropagation(); // keep the section snap from paging the page
      focusItem(moves[e.key]);
    } else if (e.key === 'Tab') {
      close(false); // focus moves on as usual
    }
  });
  controls.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    close(true);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !controls.contains(e.target)) close(false);
  });
  // scrolled away from the timeline: the menu closes, so it is not still open
  // when the page comes back to it
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && isOpen()) close(false);
  }).observe(block);

  controls.append(menu, pill, grid);

  // the index (menu and pill) names a chapter whose name is its title only as
  // far as the heading shows that title (2 lines on mobile, 1 on desktop,
  // cards-timeline.css), so both read the same; measured in a hidden copy of
  // the heading, again when its width changes or a font arrives
  const names = chapters.map((chapter) => chapter.chapter || '');
  let current = 0;
  const same = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase()
    === b.replace(/\s+/g, ' ').trim().toLowerCase();
  const measure = document.createElement('h2');
  measure.className = 'tl-head-title';
  measure.setAttribute('aria-hidden', 'true');
  Object.assign(measure.style, {
    position: 'absolute', top: '0', left: '0', maxHeight: 'none', visibility: 'hidden', pointerEvents: 'none',
  });
  head.append(measure);
  const matchHeading = () => {
    const width = title.clientWidth;
    const maxHeight = parseFloat(getComputedStyle(title).maxHeight);
    if (!width || !maxHeight) return;
    measure.style.width = `${width}px`;
    chapters.forEach((chapter, k) => {
      if (!chapter.chapter || !same(chapter.chapter, chapter.title)) return;
      const words = chapter.chapter.split(/\s+/).filter(Boolean);
      names[k] = words.slice(0, fittingWords(measure, words, maxHeight)).join(' ');
      items[k].querySelector('.tl-menu-name').textContent = names[k];
    });
    measure.textContent = '';
    pillLabel.textContent = names[current];
  };
  let headingWidth = 0;
  new ResizeObserver(([entry]) => {
    const next = Math.round(entry.contentRect.width);
    if (!next || next === headingWidth) return;
    headingWidth = next;
    matchHeading();
  }).observe(title);
  document.fonts?.addEventListener('loadingdone', () => { if (headingWidth) matchHeading(); });

  const show = (i, { auto = false } = {}) => {
    const chapter = chapters[i] || {};
    current = i;
    // screen readers hear the chapters the visitor moves to, not every
    // autoplay move (WAI-ARIA carousel pattern)
    head.setAttribute('aria-live', auto ? 'off' : 'polite');
    crossfade();
    title.textContent = chapter.title || '';
    desc.textContent = chapter.description || '';
    pillLabel.textContent = names[i] || '';
    // the pill has a fixed width, so a long name may be cut: show it in full
    // on hover
    pill.title = chapter.chapter || '';
    pillNumber.textContent = number(i);
    items.forEach((item, k) => {
      if (k === i) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  };

  // In Universal Editor the cards stay a still, fully editable row (the
  // carousel engine bows out); the header then shows the first chapter.
  // Autoplay moves on from the first chapter the moment the page snap lands
  // on the section (not while it is still scrolling in); without the snap,
  // after the usual wait
  ring = decorateCarousel(block, ul, {
    interval: AUTOPLAY_MS,
    moveOnArrival: false,
    nav: false,
    limit: false,
    start: 0,
    onChange: show,
  });
  if (!ring) show(0);
  const section = block.closest('.section');
  document.addEventListener('snap:end', (e) => {
    if (e.detail?.to === section) ring?.playNow();
  });
  if (document.querySelector('[data-aue-resource]')) showCardCount(block, chapters.length);

  // an image that doesn't load (e.g. not yet published) leaves its card as a
  // plain light card (cards-timeline.css), not a broken-image icon; checked
  // after the carousel has copied the cards round its ring
  block.querySelectorAll('.card-img').forEach((img) => {
    const missing = () => img.closest('.card-image')?.classList.add('is-missing');
    if (img.complete && img.currentSrc && !img.naturalWidth) missing();
    else img.addEventListener('error', missing, { once: true });
  });
  block.prepend(head);
  block.append(controls);
  revealNext(block.closest('.section'));
}
