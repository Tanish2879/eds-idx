import { queryArticles, DEFAULT_INDEX, contentTypeOf } from '../../scripts/articles.js';
import { buildArticleCard } from '../../scripts/article-card.js';
import { parseTabRows, buildTabBar } from '../../scripts/article-tabs.js';
import { categoryTokenOf } from '../../scripts/utils/article-data.js';
import {
  dataLayerPush, interaction, token, componentOf,
} from '../../scripts/utils/datalayer.js';
import {
  cellVal, cellMultiVal, consumeSettingsRows, inEditor, onAuthor,
} from '../../scripts/utils/common.js';

const LOCATION = 'content-listing';

// most tabs the published listing renders
const MAX_TABS = 5;

/**
 * @param {Element} block
 * @returns {{ excludePaths: string[], indexPath: string }}
 */
function readSettings(block) {
  // a third row may hold the retired "Enable Animation" field (older content);
  // it is consumed so it doesn't render, and ignored — the entrance always runs
  const [excludeCell, indexCell] = consumeSettingsRows(block, 3);
  // picked pages arrive as links (author paths like /content/<site>/blogs.html
  // in the editor, which queryArticles maps to /blogs); older content typed
  // them as plain text
  const links = [...(excludeCell?.querySelectorAll('a[href]') || [])];
  const tokens = links.length
    ? links.map((a) => a.getAttribute('href').trim())
    : cellMultiVal(excludeCell);
  const pathLike = tokens.every((t) => t.startsWith('/') || t.startsWith('http'));
  return {
    excludePaths: pathLike ? tokens : [],
    indexPath: cellVal(indexCell) || DEFAULT_INDEX,
  };
}

/**
 *  @param {Element} list the .cards list
 * @param {number} [count=3] how many leading images to wait for
 * @param {number} [timeout=1200] ms
 * @returns {Promise<void>}
 */
function firstImagesReady(list, count = 3, timeout = 1200) {
  const imgs = [...list.querySelectorAll('img')].slice(0, count);
  const loaded = Promise.allSettled(imgs.map((img) => img.decode()));
  return Promise.race([loaded, new Promise((resolve) => { setTimeout(resolve, timeout); })])
    .then(() => {});
}

/**
 * @param {Element} block
 * @param {Promise<void>} ready
 */
function setupEntrance(block, ready) {
  const section = block.closest('.section');
  if (!section || inEditor() || !('IntersectionObserver' in window)
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  section.classList.add('content-listing-animate');

  // only the rising elements (title / card links), not e.g. the image hover zoom
  section.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform' && section.classList.contains('is-visible')
      && e.target.matches('.default-content-wrapper > h1, .blog-card-link')) {
      section.classList.add('is-done');
    }
  });

  // rise once the section is 10% into the viewport; reset only once it has
  // left it entirely, so it never jumps while any of it is on screen
  const enter = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) section.classList.add('is-visible');
  }, { rootMargin: '0px 0px -10% 0px' });
  const leave = new IntersectionObserver((entries) => {
    if (entries.every((e) => !e.isIntersecting)) section.classList.remove('is-visible', 'is-done');
  });

  ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    enter.observe(section);
    leave.observe(section);
  })));
}

/**
 * @param {HTMLElement} nav the tab bar
 */
function setupStickyTabs(nav) {
  const marker = document.createElement('div');
  marker.className = 'tab-list-marker';
  marker.setAttribute('aria-hidden', 'true');
  nav.before(marker);

  let queued = false;
  const update = () => {
    queued = false;
    const { position, top } = getComputedStyle(nav);
    nav.classList.toggle('is-stuck', position === 'sticky'
      && marker.getBoundingClientRect().top < parseFloat(top));
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  queue();
}

/**
 * Decorates the content listing block with tabs and infinite scroll.
 * @param {Element} block
 */
export default async function decorate(block) {
  const { excludePaths, indexPath } = readSettings(block);
  let tabs = parseTabRows(block);

  // Universal Editor can't cap how many tabs an author adds, so extras are
  // ignored on the published page; the editor keeps them (so each stays
  // selectable and removable) and flags the overflow
  const overLimit = tabs.length > MAX_TABS;
  if (overLimit && !inEditor()) tabs = tabs.slice(0, MAX_TABS);

  block.textContent = '';

  // drop tabs with no articles so visitors never land on an empty one; the
  // index is fetched once and cached, so this adds only an in-memory filter per
  // tab. The editor keeps every tab (a just-added tab starts empty and must stay
  // selectable). If no tab has results, visitors get a message instead of a bar.
  if (!inEditor()) {
    const counts = await Promise.all(tabs.map((tab) => queryArticles({
      root: tab.root,
      tags: tab.tags,
      exclude: excludePaths,
      limit: 1,
      indexPath,
    }).then((result) => result.total, () => 1)));
    tabs = tabs.filter((tab, i) => counts[i] > 0);
    if (!tabs.length) {
      const note = document.createElement('p');
      note.className = 'content-listing-empty';
      note.textContent = 'No articles are available right now.';
      block.append(note);
      return;
    }
  }

  let activeIndex = 0;
  let currentOffset = 0;
  let isLoading = false;
  let allLoaded = false;
  let observer = null;
  let emptyNote = null;

  // single-tab bars are hidden via CSS (.tab-list-single)
  const { element: nav, buttons: tabButtons } = buildTabBar(tabs, {
    listClass: 'tab-list',
    singleClass: 'tab-list-single',
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
      switchTab(index); // eslint-disable-line no-use-before-define
    },
  });
  block.append(nav);
  if (overLimit && inEditor()) {
    const limitNote = document.createElement('p');
    limitNote.className = 'content-listing-empty content-listing-limit';
    limitNote.textContent = `Only the first ${MAX_TABS} tabs are shown on the published page — remove the extra tabs.`;
    // above the tab bar, which is sticky and would paint over a note below it
    nav.before(limitNote);
  }
  if (tabs.length > 1) setupStickyTabs(nav);

  const list = document.createElement('ul');
  list.className = 'cards';
  block.append(list);

  const loader = document.createElement('div');
  loader.className = 'content-listing-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.hidden = true;
  const spinner = document.createElement('span');
  spinner.className = 'content-listing-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const loaderText = document.createElement('span');
  loaderText.className = 'content-listing-loader-text';
  loaderText.textContent = 'Loading more articles…';
  loader.append(spinner, loaderText);
  block.append(loader);

  const sentinel = document.createElement('div');
  sentinel.className = 'content-listing-sentinel';
  block.append(sentinel);

  /**
   * Loads the next batch of 15 articles for the active tab.
   * @param {boolean} [initial=false] First load of a tab — skips the loading
   *   indicator (nothing on screen yet to load "more" onto).
   */
  async function loadNextBatch(initial = false) {
    if (isLoading || allLoaded) return;
    isLoading = true;

    const activeTab = tabs[activeIndex];
    if (!initial) loader.hidden = false;
    const shownAt = initial ? 0 : Date.now();
    const MIN_VISIBLE_MS = 400;

    try {
      const result = await queryArticles({
        root: activeTab.root,
        tags: activeTab.tags,
        exclude: excludePaths,
        offset: currentOffset,
        limit: 15,
        indexPath,
      });

      if (!initial) {
        const elapsed = Date.now() - shownAt;
        if (elapsed < MIN_VISIBLE_MS) {
          await new Promise((resolve) => { setTimeout(resolve, MIN_VISIBLE_MS - elapsed); });
        }
      }

      const contentType = contentTypeOf(indexPath);
      const filterToken = categoryTokenOf(activeTab) || 'all';
      const batchStart = currentOffset;
      result.items.forEach((item, i) => list.append(buildArticleCard(item, {
        prefix: 'blog-card',
        order: 'meta-first',
        location: LOCATION,
        contentType,
        position: batchStart + i + 1,
        filter: filterToken,
      })));

      currentOffset = result.nextOffset;
      allLoaded = !result.hasMore;

      if (allLoaded && observer) {
        observer.unobserve(sentinel);
      }
    } finally {
      loader.hidden = true;
      isLoading = false;
    }
  }

  async function loadActiveTab() {
    currentOffset = 0;
    allLoaded = false;
    list.textContent = '';

    if (emptyNote) {
      emptyNote.remove();
      emptyNote = null;
    }

    if (observer) {
      observer.unobserve(sentinel);
    }

    await loadNextBatch(true);

    if (onAuthor() && !list.children.length) {
      emptyNote = document.createElement('p');
      emptyNote.className = 'content-listing-empty';
      emptyNote.textContent = 'No articles found for this tab — check its Root Path and Tags, and the block’s Query Index Path.';
      list.insertAdjacentElement('afterend', emptyNote);
    }

    if (!allLoaded && observer) {
      observer.observe(sentinel);
    }
  }

  /**
   * Switches to a new tab and loads its first 15 items (the tab bar has
   * already updated the selected state).
   * @param {number} targetIndex
   */
  async function switchTab(targetIndex) {
    activeIndex = targetIndex;

    // switching from a stuck bar: jump back so the new results start at the
    // top of the list, right under the bar
    if (nav.classList.contains('is-stuck')) {
      const gap = parseFloat(getComputedStyle(nav).marginBottom);
      const offset = list.getBoundingClientRect().top - nav.getBoundingClientRect().bottom - gap;
      window.scrollTo({ top: window.scrollY + offset, behavior: 'instant' });
    }

    await loadActiveTab();
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoading && !allLoaded) {
          loadNextBatch();
        }
      });
    }, { rootMargin: '200px 0px' });
  }

  const firstLoad = loadActiveTab();
  setupEntrance(block, firstLoad.then(() => firstImagesReady(list)).catch(() => {}));
  await firstLoad;
}
