import { queryArticles, DEFAULT_INDEX, contentTypeOf } from '../../scripts/articles.js';
import { buildArticleCard } from '../../scripts/article-card.js';
import { parseTabRows, buildTabBar } from '../../scripts/article-tabs.js';
import { categoryTokenOf } from '../../scripts/utils/article-data.js';
import {
  dataLayerPush, interaction, token, componentOf,
} from '../../scripts/utils/datalayer.js';
import {
  cellVal, consumeSettingsRows, readViewAll, onAuthor,
} from '../../scripts/utils/common.js';
import snapRow from '../../scripts/utils/snap-row.js';

const LOCATION = 'article-carousel';

const DEFAULT_LIMIT = 12;
// "Max Articles per Tab" range, matching the field's validation in _article-carousel.json
const MIN_LIMIT = 1;
const MAX_LIMIT = 12;
const PREFIX = 'article-listing-card';
// the entrance plays once the section has risen this share of the screen
// above where it rests while peeking
const ENTRANCE_LEAD = 0.1;

/**
 * Reads the block's own settings (model order: View All Link, View All Label,
 * Max Articles per Tab, Query Index Path).
 * @param {Element} block
 * @returns {{ viewAll: {href: string, text: string}|null, limit: number, indexPath: string }}
 */
function readSettings(block) {
  const [viewAllCell, labelCell, limitCell, indexCell] = consumeSettingsRows(block, 4);
  const index = cellVal(indexCell);
  // the dialog enforces the range, but content saved before it (or a value
  // typed around it) may not: no number, zero or a negative falls back to the
  // default, anything above the cap is capped
  const limit = parseInt(cellVal(limitCell), 10);
  return {
    viewAll: readViewAll(viewAllCell, cellVal(labelCell) || 'View all'),
    limit: limit >= MIN_LIMIT ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
    indexPath: index.endsWith('.json') ? index : DEFAULT_INDEX,
  };
}

/**
 * Card per the Figma layout: image on top, then a body with category + title
 * at the top and the date pinned to the bottom. The title already names the
 * link, so the image is decorative.
 * @param {Object} item index entry
 * @param {number} position 1-based position in the current tab's list
 * @param {Object} opts
 * @param {'blog'|'news'} opts.contentType
 * @param {string} opts.filter active tab token
 * @returns {HTMLElement} the <li> card
 */
const buildCard = (item, position, { contentType, filter }) => buildArticleCard(item, {
  prefix: PREFIX,
  showDescription: false,
  order: 'split',
  decorativeImage: true,
  location: LOCATION,
  contentType,
  position,
  filter,
});

/**
 * Entrance per the newsroom prototype (Opt 65 → 66, Opt 16): while the section
 * only peeks in at the bottom of the screen (under the featured story) the
 * block stays parked, lifted so the top of the cards shows just below the
 * section's top edge with the tabs hidden. Once the section starts rising from
 * there the block settles: the tabs fade in and rise, the cards drift onto the
 * edge and the progress bars slide out from under them. Going back down to the
 * peek parks it again, so it plays back in reverse. Not under reduced motion
 * or in Universal Editor, where the block shows statically.
 * @param {Element} block
 * @param {Element} track the cards list
 */
function wireEntrance(block, track) {
  if (onAuthor() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const section = block.closest('.section') || block;
  block.classList.add('is-animated', 'is-parked');

  // where the cards sit in the section when settled; the parked lift is
  // worked out from it in CSS. The wrapper isn't transformed and the track
  // moves with the block, so this reads the same mid-transition
  const measure = () => {
    const top = block.parentElement.getBoundingClientRect().top
      + track.getBoundingClientRect().top - block.getBoundingClientRect().top
      - section.getBoundingClientRect().top;
    block.style.setProperty('--al-cards-top', `${Math.round(top)}px`);
  };

  // Where the section's top rests before it comes in: the bottom of the
  // screen, or higher when the section above overlaps it with a negative
  // margin (featured-intro's peek, which grows on tall screens). The entrance
  // plays once the section has risen a little past that, so the tabs stay
  // hidden while it only peeks, whatever the screen size. Reads the section,
  // not the block, so the block's own lift can't flip it back and forth.
  const prev = section.previousElementSibling;
  const restTop = () => window.innerHeight
    + Math.min(0, prev ? parseFloat(getComputedStyle(prev).marginBottom) || 0 : 0);
  let ticking = false;
  const update = () => {
    ticking = false;
    const { top, height } = section.getBoundingClientRect();
    if (!height) return; // section not shown yet: stay parked
    block.classList.toggle('is-parked', top > restTop() - window.innerHeight * ENTRANCE_LEAD);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // re-measure (and re-check) once the section is shown and as cards load
  new ResizeObserver(() => { measure(); onScroll(); }).observe(block);
}

/**
 * Article Carousel — category tabs, a View All link and a horizontally
 * scrolling carousel of article cards from the query index, with progress
 * bars that track (and jump) the scroll position.
 * @param {Element} block
 */
export default async function decorate(block) {
  // the CSS still targets the block's original name (article-listing); alias
  // it here rather than renaming every selector
  block.classList.add('article-listing');

  const { viewAll, limit, indexPath } = readSettings(block);
  const tabs = parseTabRows(block);

  const blockIndex = [...document.querySelectorAll('.article-listing')].indexOf(block);
  const trackId = `article-listing-track-${blockIndex}`;

  // ---- head: tabs + view all ----
  const head = document.createElement('div');
  head.className = 'article-listing-head';

  const contentType = contentTypeOf(indexPath);

  let activeIndex = 0;
  const { element: tabList, buttons: tabButtons } = buildTabBar(tabs, {
    listClass: 'article-listing-tabs',
    singleClass: 'is-single',
    buttonClass: 'article-listing-tab',
    controls: trackId,
    onSelect: (index) => {
      // buildTabBar only calls onSelect on a genuine change, never a repeat
      // click of the already-selected tab, so no extra dedup is needed here.
      const tab = tabs[index];
      dataLayerPush({
        event: 'ctaClick',
        cta: {
          location: LOCATION,
          interest: token(categoryTokenOf(tab)) || 'all',
          action: 'filter',
          type: 'action',
          text: (tab.label || '').trim().slice(0, 100),
          referrer: document.referrer || null,
          currentPage: window.location.href,
          nextPage: null,
        },
        linkedContent: null,
        component: componentOf(tabButtons[index]),
        interaction: interaction('ctaClick'),
      });
      activeIndex = index;
      loadTab(); // eslint-disable-line no-use-before-define
    },
  });
  head.append(tabList);

  if (viewAll) {
    const a = document.createElement('a');
    a.className = 'article-listing-viewall';
    a.href = viewAll.href;
    a.textContent = viewAll.text;
    // interest derived from the destination, e.g. "/newsroom/news" -> "news"
    if (!a.dataset.cta) {
      const dest = token(viewAll.href.split('/').filter(Boolean).pop()) || 'not-set';
      a.dataset.cta = `${LOCATION}:${dest}:view`;
    }
    head.append(a);
  }

  // ---- carousel ----
  const track = document.createElement('ul');
  track.className = 'article-listing-track';
  track.id = trackId;
  // no tabpanel role here: it replaces the list role, leaving the <li> cards without a list parent
  track.setAttribute('aria-live', 'polite');

  const progress = document.createElement('div');
  progress.className = 'article-listing-progress';

  // one bar per "page" of cards; the active bar follows the scroll position
  let pages = 0;
  const pageOf = () => {
    const max = track.scrollWidth - track.clientWidth;
    return max > 0 ? Math.round((track.scrollLeft / max) * (pages - 1)) : 0;
  };
  const markActive = () => {
    const current = pageOf();
    [...progress.children].forEach((bar, i) => {
      bar.classList.toggle('is-active', i === current);
      bar.setAttribute('aria-current', String(i === current));
    });
  };
  const buildProgress = () => {
    const count = track.clientWidth ? Math.ceil(track.scrollWidth / track.clientWidth - 0.01) : 0;
    if (count === pages) { markActive(); return; }
    pages = count;
    progress.hidden = pages < 2;
    progress.replaceChildren(...Array.from({ length: pages }, (_, i) => {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'article-listing-bar';
      bar.setAttribute('aria-label', `Show articles, page ${i + 1} of ${count}`);
      bar.addEventListener('click', () => {
        const max = track.scrollWidth - track.clientWidth;
        track.scrollTo({ left: count > 1 ? (max * i) / (count - 1) : 0, behavior: 'smooth' });
      });
      return bar;
    }));
    markActive();
  };

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { markActive(); ticking = false; });
  }, { passive: true });
  new ResizeObserver(buildProgress).observe(track);
  snapRow(track);

  let emptyNote = null;
  let loadToken = 0;

  const loadTab = async () => {
    loadToken += 1;
    const requestToken = loadToken;
    const tab = tabs[activeIndex];
    const { items } = await queryArticles({
      root: tab.root, tags: tab.tags, limit, indexPath,
    });
    if (requestToken !== loadToken) return; // a newer tab switch won

    const filterToken = categoryTokenOf(tab) || 'all';
    track.replaceChildren(...items.map((item, i) => buildCard(item, i + 1, {
      contentType, filter: filterToken,
    })));
    track.scrollLeft = 0;
    buildProgress();

    emptyNote?.remove();
    emptyNote = null;
    if (onAuthor() && !items.length) {
      emptyNote = document.createElement('p');
      emptyNote.className = 'article-listing-empty';
      emptyNote.textContent = 'No articles found for this tab — check its Root Path and Tags, and the block’s Query Index Path.';
      track.after(emptyNote);
    }
  };

  block.replaceChildren(head, track, progress);
  wireEntrance(block, track);
  await loadTab();
}
