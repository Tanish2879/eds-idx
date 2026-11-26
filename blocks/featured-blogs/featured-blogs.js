import { createOptimizedPicture } from '../../scripts/aem.js';
import { queryArticles, DEFAULT_INDEX, contentTypeOf } from '../../scripts/articles.js';
import { categoryOf } from '../../scripts/utils/article-data.js';
import { tagArticleLink } from '../../scripts/article-card.js';
import { token } from '../../scripts/utils/datalayer.js';
import {
  cellLink, cellVal, cellMultiVal, inEditor, onAuthor,
} from '../../scripts/utils/common.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const LOCATION = 'featured-blogs';

// upper limit for the authored "Maximum Blogs"; also the fallback when it is missing
const MAX_BLOGS = 6;
const PANE_SLIDE_MS = 650;
// read-more label when the author leaves the field empty (and on blocks
// authored before the field existed)
const DEFAULT_READ_MORE = 'Read more';
// "Dissolve" style arrow switch: the image slide, used when the CSS doesn't
// say (--fbd-slide: 0.65s on mobile, 1.1s on desktop)
const PANE_DISSOLVE_MS = 1100;

/**
 * How long the Dissolve image slide runs, read from the CSS (--fbd-slide), so
 * the switch tidies up exactly when the slide ends on each screen size.
 * @param {Element} block
 * @returns {number} milliseconds
 */
function dissolveSlideMs(block) {
  const value = getComputedStyle(block).getPropertyValue('--fbd-slide').trim();
  const ms = value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : PANE_DISSOLVE_MS;
}
// swipe / drag: horizontal travel needed to switch blogs
const SWIPE_MIN_PX = 40;
// entrance safety net: a block at least this much on screen that stays short
// of fully in (the scroll stopped a little early) settles after this long
const NEARLY_IN = 0.95;
const SETTLE_FALLBACK_MS = 800;
// trackpad / horizontal wheel: travel needed to switch, and the quiet time
// that ends a gesture (so one flick switches once, not once per event)
const WHEEL_MIN_PX = 30;
const WHEEL_GAP_MS = 250;
// once the block fills the screen it stays white this long, then fades to the
// blurred image (0.2s, featured-blogs.css); white again when scrolled away
const GLOW_DELAY_MS = 100;

/**
 * "Dissolve" entrance, scroll-linked in both directions: the card rises from the
 * block's top edge into its place as the block scrolls up (never into the
 * previous section, so nothing of it shows there); once the block fills the
 * screen the white cover fades out (is-glowing).
 * @param {Element} block
 * @param {Element} card
 */
function trackRise(block, card) {
  let frame = 0;
  let glowTimer = 0;
  const update = () => {
    frame = 0;
    const viewH = window.innerHeight;
    const { top } = block.getBoundingClientRect();
    // 0 while the block is still below the screen, 1 once its top reaches the screen top
    const t = Math.min(1, Math.max(0, 1 - top / viewH));
    if (t < 0.995) {
      clearTimeout(glowTimer);
      glowTimer = 0;
      block.classList.remove('is-glowing');
    } else if (!glowTimer && !block.classList.contains('is-glowing')) {
      glowTimer = setTimeout(() => block.classList.add('is-glowing'), GLOW_DELAY_MS);
    }
    const lift = t < 1 ? (1 - t) * card.offsetTop : 0;
    card.style.transform = lift ? `translate3d(0, ${-lift.toFixed(1)}px, 0)` : '';
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(block);
  update();
}

/**
 *  @param {Element} block
 * @param {Function} onNext
 * @param {Function} onPrev
 */
function wireSwipe(block, onNext, onPrev) {
  const go = (dx) => (dx < 0 ? onNext() : onPrev());

  let start = null;
  let dragged = false;
  block.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    start = { x: e.clientX, y: e.clientY };
    dragged = false;
  });
  block.addEventListener('pointermove', (e) => {
    if (start && Math.abs(e.clientX - start.x) > SWIPE_MIN_PX / 2) dragged = true;
  });
  block.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) go(dx);
  });
  block.addEventListener('pointercancel', () => { start = null; });
  block.addEventListener('click', (e) => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  block.addEventListener('dragstart', (e) => e.preventDefault());

  let wheelTravel = 0;
  let lastWheel = -Infinity;
  let switched = false;
  block.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    // horizontal: ours, so the page, the section snap and the browser's back
    // gesture all stay put
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastWheel > WHEEL_GAP_MS) {
      wheelTravel = 0;
      switched = false;
    }
    lastWheel = now;
    if (switched) return;
    wheelTravel += e.deltaX;
    if (Math.abs(wheelTravel) > WHEEL_MIN_PX) {
      switched = true;
      // deltaX > 0 is a swipe to the left, same as dragging leftwards
      go(-wheelTravel);
    }
  }, { passive: false });

  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') onNext();
    else if (e.key === 'ArrowLeft') onPrev();
  });
}

/**
 * Reads the authored "Maximum Blogs" (the field limits it to 3–6), capped at
 * MAX_BLOGS. Missing or invalid values (e.g. blocks authored before the field
 * existed) fall back to MAX_BLOGS.
 * @param {Element} row
 * @returns {number}
 */
function readMaxBlogs(row) {
  const value = parseInt(cellVal(row), 10);
  if (Number.isNaN(value)) return MAX_BLOGS;
  return Math.min(value, MAX_BLOGS);
}

/**
 * Reads the "Excluded Paths" field (as content-listing does): picked pages
 * arrive as links (author paths like /content/<site>/blogs/technology.html
 * in the editor, which queryArticles maps to /blogs/technology); paths typed
 * as plain text are accepted too.
 * @param {Element} row
 * @returns {string[]}
 */
function readExcludePaths(row) {
  const links = [...(row?.querySelectorAll('a[href]') || [])];
  const tokens = links.length
    ? links.map((a) => a.getAttribute('href').trim())
    : cellMultiVal(row);
  return tokens.filter((t) => t.startsWith('/') || t.startsWith('http'));
}

// a query-index path, e.g. /blog-index.json
const isIndexPath = (row) => /\.json(\?|#|$)/i.test(cellVal(row));

/**
 * True for an empty cell or one holding only page paths / links (the
 * Excluded Paths field), never for authored text such as a heading.
 * @param {Element} row
 * @returns {boolean}
 */
function isPathsCell(row) {
  if (!row) return false;
  const links = [...row.querySelectorAll('a[href]')];
  if (links.length) return links.every((a) => /^(\/|https?:)/.test(a.getAttribute('href').trim()));
  return cellMultiVal(row).every((t) => /^(\/|https?:)/.test(t));
}

/**
 * Names the block's rows. The current model puts Excluded Paths second, right
 * under the root path; pages published before that keep their old order until
 * republished, so those layouts are lined up too:
 *  - Excluded Paths last (after the read-more label);
 *  - no Excluded Paths at all;
 *  - an (unused) eyebrow row after the heading — recognisable by the
 *    query-index path landing in the 6th row instead of a number — dropped;
 *  - a "maximum latest blogs" number or a "glow effect" true / false where the
 *    read-more label now sits — dropped too.
 * The current order is told apart by its query-index path in the 6th row with
 * only paths (or nothing) in the 2nd; the older ones have it in the 5th.
 * @param {Element} block
 * @returns {Object<string, Element|undefined>}
 */
function readRows(block) {
  const rows = [...block.children];
  if (isIndexPath(rows[5]) && !isIndexPath(rows[4]) && isPathsCell(rows[1])) {
    const [
      rootRow, excludeRow, headingRow, viewAllRow, viewAllLabelRow, indexRow, maxRow, readMoreRow,
    ] = rows;
    return {
      rootRow, excludeRow, headingRow, viewAllRow, viewAllLabelRow, indexRow, maxRow, readMoreRow,
    };
  }
  const sixth = cellVal(rows[5]);
  if (rows.length >= 7 && sixth && Number.isNaN(Number(sixth))) rows.splice(2, 1);
  while (/^(\d+|true|false)$/i.test(cellVal(rows[6]))) rows.splice(6, 1);
  const [
    rootRow, headingRow, viewAllRow, viewAllLabelRow, indexRow, maxRow, readMoreRow, excludeRow,
  ] = rows;
  return {
    rootRow, excludeRow, headingRow, viewAllRow, viewAllLabelRow, indexRow, maxRow, readMoreRow,
  };
}

/**
 * Reads the "view all" field: a real link (href), or a bare path typed as
 * plain text.
 * @param {Element} row
 * @param {string} label Authored "View All Label"
 * @returns {{ href: string, text: string }|null}
 */
function readViewAll(row, label) {
  if (!label) return null;
  const { href, text } = cellLink(row);
  if (href) return { href, text: label };
  if (text.startsWith('/') || text.startsWith('http')) return { href: text, text: label };
  return null;
}

/**
 * Reads the authored "Read More" label (a text field; empty: Read more). The
 * button is always the site's primary v2 button and opens the blog shown; a
 * link saved while the field was rich text still sends every blog to that page.
 * @param {Element} row
 * @returns {{ text: string, variant: string, href: string }}
 */
function readReadMore(row) {
  const { text, href } = cellLink(row);
  return { text: text || DEFAULT_READ_MORE, variant: 'primary-v2', href };
}

/**
 * Featured Blogs — the active blog's image fills the section background; its
 * details sit in an overlaid glass card. Prev/next (and the dots) switch the
 * active blog, updating both the background and the card together.
 *
 * Authored rows (fixed order, matching the block model): root path, excluded
 * paths (pages left out, e.g. category pages in the root folder), heading,
 * "view all" link, "view all" label, query-index path, maximum blogs and
 * read-more label. The Dissolve style always arrives with the glow.
 * Pages published from older models keep their own row order until they are
 * republished, so those are read too (see readRows).
 * @param {Element} block
 */
export default async function decorate(block) {
  const {
    rootRow, excludeRow, headingRow, viewAllRow, viewAllLabelRow, indexRow, maxRow, readMoreRow,
  } = readRows(block);
  const excludePaths = readExcludePaths(excludeRow);
  // an author path (/content/<site>/...) is fine: queryArticles drops the prefix
  const root = cellVal(rootRow) || '';
  // authored only (no built-in text); its cell carries the UE instrumentation
  const headingText = cellVal(headingRow);
  const headingCell = headingRow?.querySelector('[data-aue-prop]') || headingRow?.firstElementChild;
  const viewAllLabelText = cellVal(viewAllLabelRow) || '';
  const readMoreField = readReadMore(readMoreRow);
  const viewAll = readViewAll(viewAllRow, viewAllLabelText);
  const indexPath = cellVal(indexRow) || DEFAULT_INDEX;
  const contentType = contentTypeOf(indexPath);
  // "Dissolve" style: the latest blogs (not only featured ones, newest first by
  // publishDate) in one centred card — heading + arrows in the card header (laid
  // out by the CSS: heading on top, arrows beside READ MORE), no View All or
  // indicators; swipe too, and the panes crossfade
  const isDissolve = block.classList.contains('dissolve');
  const maxBlogs = readMaxBlogs(maxRow);

  block.textContent = '';
  // the background slides are absolute + overflow:hidden, which section-snap would read as a
  // floating overlay and swallow the wheel; tell it this is normal page content (a Collage
  // section already does this for the whole section)
  block.dataset.snapPassthrough = '';
  let featured = [];
  try {
    const result = await queryArticles({
      root,
      isFeatured: !isDissolve,
      exclude: excludePaths,
      limit: maxBlogs,
      indexPath,
    });
    featured = result.items;
  } catch {
    // index is non-critical — fall through to the empty state
  }

  if (!featured.length) {
    if (onAuthor()) {
      const note = document.createElement('p');
      note.className = 'featured-blogs-empty-note';
      note.textContent = isDissolve
        ? 'No blogs found — check the Root Path and Query Index Path.'
        : 'No featured blogs found — check the Root Path and Query Index Path, and that at least one article has "Is Featured Blog" set.';
      block.append(note);
    } else {
      // nothing flagged as featured — hide the block rather than show an empty shell
      block.classList.add('featured-blogs-empty');
    }
    return;
  }

  // --- background layer: one image per featured blog, only the active shown ---
  const bg = document.createElement('div');
  bg.className = 'featured-blogs-bg';
  const bgSlides = featured.map((row, i) => {
    const slide = document.createElement('div');
    slide.className = 'featured-blogs-bg-slide';
    if (row.image) {
      const pic = createOptimizedPicture(row.image, row.title || '', i === 0, [
        { media: '(min-width: 600px)', width: '2000' },
        { width: '750' },
      ]);
      slide.append(pic);
    }
    bg.append(slide);
    return slide;
  });
  block.append(bg);

  const skipEntrance = inEditor()
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || !('IntersectionObserver' in window);

  // "Dissolve" glow: the block arrives on plain white (with the card on it);
  if (isDissolve && !skipEntrance) {
    const glow = document.createElement('div');
    glow.className = 'featured-blogs-glow';
    block.append(glow);
  }

  // kept (empty) in the editor so authors can still click it to edit in place
  let heading = null;
  if (headingText || inEditor()) {
    heading = document.createElement('h2');
    heading.className = 'featured-blogs-heading';
    heading.textContent = headingText;
    if (headingCell) moveInstrumentation(headingCell, heading);
  }

  // --- intro: heading + view all (over the image, left) ---
  if (!isDissolve) {
    const intro = document.createElement('div');
    intro.className = 'featured-blogs-intro';
    if (heading) intro.append(heading);
    if (viewAll) {
      const link = document.createElement('a');
      link.className = 'featured-blogs-viewall button secondary';
      link.href = viewAll.href;
      link.textContent = viewAll.text;
      // interest derived from the destination, e.g. "/blogs" -> "blogs"
      if (!link.dataset.cta) {
        const dest = token(viewAll.href.split('/').filter(Boolean).pop()) || 'not-set';
        link.dataset.cta = `${LOCATION}:${dest}:view`;
      }
      intro.append(link);
    }
    block.append(intro);
  }

  // --- overlay card (content of the active blog) ---
  const card = document.createElement('article');
  card.className = 'featured-blogs-card';

  const viewport = document.createElement('div');
  viewport.className = 'featured-blogs-card-viewport';
  viewport.setAttribute('aria-live', 'polite');

  // one pane per blog: eyebrow (the blog's tag, as on the blog cards), title,
  // description — so the eyebrow changes and slides with the active blog
  const createPane = (row) => {
    const pane = document.createElement('div');
    pane.className = 'featured-blogs-card-pane';
    // only the tag's own value is shown: ns:news/in-the-media → IN THE MEDIA
    const tag = categoryOf(row).replace(/-/g, ' ');
    if (tag) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'featured-blogs-card-eyebrow';
      eyebrow.textContent = tag;
      pane.append(eyebrow);
    }
    const title = document.createElement('h3');
    title.className = 'featured-blogs-card-title';
    title.textContent = row.title || '';
    const desc = document.createElement('p');
    desc.className = 'featured-blogs-card-desc';
    desc.textContent = row.description || '';
    pane.append(title, desc);
    return pane;
  };

  let currentPane = createPane(featured[0]);
  viewport.append(currentPane);

  const controls = document.createElement('div');
  controls.className = 'featured-blogs-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'featured-blogs-nav featured-blogs-prev';
  prev.setAttribute('aria-label', 'Previous blog');
  const readMore = document.createElement('a');
  // the site's primary v2 button (glitch hover included)
  readMore.className = `featured-blogs-cta button ${readMoreField.variant}`;
  readMore.textContent = readMoreField.text;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'featured-blogs-nav featured-blogs-next';
  next.setAttribute('aria-label', 'Next blog');
  if (isDissolve) {
    // header row: the heading only
    const header = document.createElement('div');
    header.className = 'featured-blogs-card-header';
    header.append(heading || document.createElement('span'));
    controls.append(prev, readMore, next);
    card.append(header, viewport, controls);
  } else {
    controls.append(prev, readMore, next);
    card.append(viewport, controls);
  }
  block.append(card);

  // --- dot indicators (bottom-left, over the image): one per visible blog,
  // none at all when there is only one blog (nothing to navigate). "Dissolve"
  // has none: it switches with the arrows and swipe ---
  const hasCarousel = featured.length > 1;
  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'featured-blogs-dots';
  const dots = hasCarousel && !isDissolve ? featured.map((row, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'featured-blogs-dot';
    dot.setAttribute('aria-label', `Show blog ${i + 1}`);
    dotsWrap.append(dot);
    return dot;
  }) : [];
  if (dots.length) block.append(dotsWrap);

  // --- state + render ---
  let active = 0;
  let isTransitioning = false;

  const render = (targetIndex, direction = null, swiped = false) => {
    if (isTransitioning) return;
    const nextActive = (targetIndex + featured.length) % featured.length;
    if (direction && nextActive === active) return;

    const from = active;
    active = nextActive;
    const row = featured[active];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slideBg = isDissolve && direction && !reducedMotion;

    if (!slideBg) bgSlides.forEach((s, idx) => s.classList.toggle('is-active', idx === active));
    dots.forEach((d, idx) => {
      const on = idx === active;
      d.classList.toggle('is-active', on);
      if (on) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });

    // an authored link wins; otherwise the button opens the blog shown
    const readMoreHref = readMoreField.href || row.path;
    if (readMoreHref) {
      readMore.href = readMoreHref;
      readMore.hidden = false;
      // Only tag as this slide's article when the button actually opens it —
      // an authored override link isn't about any particular blog, so it
      // isn't re-tagged per slide.
      if (!readMoreField.href) {
        tagArticleLink(readMore, row, { location: LOCATION, contentType, position: active + 1 });
      } else {
        delete readMore.dataset.cta;
      }
    } else {
      readMore.hidden = true;
    }

    if (!direction) {
      return;
    }

    isTransitioning = true;
    const newPane = createPane(row);
    if (reducedMotion) {
      viewport.append(newPane);
      currentPane.remove();
      currentPane = newPane;
      isTransitioning = false;
      return;
    }

    if (isDissolve) {
      // the image: next (right arrow) comes in from the left, moving right;
      // previous the reverse. A swipe moves it with the finger instead (next
      // is a swipe to the left, so it comes in from the right). The card text
      // stays put and crossfades
      const fromLeft = (direction === 'next') !== swiped;
      const side = fromLeft ? 'from-left' : 'from-right';
      const incoming = bgSlides[active];
      const departingPane = currentPane;
      incoming.classList.add('is-incoming', side);
      newPane.classList.add('is-incoming');
      departingPane.classList.add('is-leaving');
      viewport.append(newPane);
      currentPane = newPane;
      // start positions are painted first, then everything moves together
      requestAnimationFrame(() => requestAnimationFrame(() => {
        [incoming, newPane, departingPane].forEach((node) => node.classList.add('is-moving'));
      }));
      setTimeout(() => {
        bgSlides[from].classList.remove('is-active');
        incoming.classList.remove('is-incoming', side, 'is-moving');
        incoming.classList.add('is-active');
        newPane.classList.remove('is-incoming', 'is-moving');
        departingPane.remove();
        isTransitioning = false;
      }, dissolveSlideMs(block));
      return;
    }

    const enterClass = direction === 'next' ? 'pane-enter-right' : 'pane-enter-left';
    const exitClass = direction === 'next' ? 'pane-exit-left' : 'pane-exit-right';

    newPane.classList.add(enterClass);
    viewport.append(newPane);

    // Force reflow so initial enter position is registered before transition starts
    // eslint-disable-next-line no-unused-expressions
    newPane.offsetWidth;

    newPane.classList.remove(enterClass);
    currentPane.classList.add(exitClass);

    const departingPane = currentPane;
    currentPane = newPane;

    setTimeout(() => {
      departingPane.remove();
      isTransitioning = false;
    }, PANE_SLIDE_MS);
  };

  prev.addEventListener('click', () => render(active - 1, 'prev'));
  next.addEventListener('click', () => render(active + 1, 'next'));
  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    if (i === active) return;
    render(i, i > active ? 'next' : 'prev');
  }));

  if (hasCarousel) wireSwipe(block, () => render(active + 1, 'next', true), () => render(active - 1, 'prev', true));

  const setOffset = (value) => block.style.setProperty('--featured-blogs-offset', value);
  if (skipEntrance) {
    setOffset(0);
  } else if (isDissolve) {
    trackRise(block, card);
  } else {
    // fully in place once the whole block is on screen, so the slide spans
    // the entire entry and reads as slightly slower
    const COMPLETE_AT = 1;
    let settled = false;
    let frame = 0;
    let fallback = 0;
    let onScroll;
    const listen = (on) => {
      const method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('scroll', onScroll, { passive: true });
      window[method]('resize', onScroll, { passive: true });
    };
    const stopFallback = () => {
      clearTimeout(fallback);
      fallback = 0;
    };
    // in place: freeze here, start the glow fade and stop listening until the
    // block leaves
    const settle = () => {
      settled = true;
      stopFallback();
      listen(false);
      setOffset(0);
      block.classList.add('is-glowing');
    };
    const update = () => {
      if (settled) return;
      const { top, bottom, height } = block.getBoundingClientRect();
      const viewH = window.innerHeight;
      const visible = Math.min(bottom, viewH) - Math.max(top, 0);
      const target = Math.min(height, viewH) * COMPLETE_AT;
      // within 2px counts as fully in: the scroll often stops a fraction of a
      // pixel short (Firefox, Android), and an exact match would never come,
      // leaving the glow's white screen up until the page moved again
      const progress = visible >= target - 2 ? 1 : Math.max(visible / target, 0);
      const eased = 1 - (1 - progress) ** 2; // gentle ease-out
      setOffset((1 - eased).toFixed(4));
      if (progress === 1) {
        settle();
      } else if (progress >= NEARLY_IN) {
        // safety net: nearly in and the page has stopped short of it (no
        // further scroll to re-check) — settle anyway after a moment
        if (!fallback) fallback = setTimeout(settle, SETTLE_FALLBACK_MS);
      } else {
        stopFallback();
      }
    };
    // one update per frame while scrolling, only while the block is entering
    onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      }
    };
    const observer = new IntersectionObserver((entries) => {
      const onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) {
        if (!settled) {
          listen(true);
          update();
        }
      } else {
        // fully off screen: re-arm, so the next approach animates it in again
        listen(false);
        stopFallback();
        settled = false;
        setOffset(1);
        block.classList.remove('is-glowing');
      }
    }, {
      // shrink the viewport by 1px so a block parked exactly at the screen edge
      // (where the section snap leaves it) counts as off screen, not touching
      rootMargin: '-1px 0px',
    });
    observer.observe(block);
    update();
  }

  // single blog → no prev/next (the dots were never created)
  if (!hasCarousel) {
    card.classList.add('featured-blogs-controls-single');
  }

  render(0);
}
