import { createOptimizedPicture } from './aem.js';
import { parseDate, categoryOf, categoryTokenOf } from './utils/article-data.js';
import { token } from './utils/datalayer.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Builds the date meta element: DAY MON <teal square> YEAR (Roboto Mono, gray).
 * @param {Object} item
 * @param {string} prefix - block class prefix (e.g. "blog-card" or "related-blogs")
 * @returns {HTMLElement|null} null when the item has no parseable date
 */
export function buildDateMeta(item, prefix) {
  const ms = parseDate(item.publishDate);
  if (!ms) return null;
  const d = new Date(ms);
  const meta = document.createElement('div');
  meta.className = `${prefix}-date`;
  const day = document.createElement('span');
  day.textContent = `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`;
  const sep = document.createElement('span');
  sep.className = `${prefix}-date-sep`;
  sep.setAttribute('aria-hidden', 'true');
  const year = document.createElement('span');
  year.textContent = String(d.getUTCFullYear());
  meta.append(day, sep, year);
  return meta;
}

/**
 * Tags a link for ctaClick/linkedContent tracking (P2.5/P2.6): a stable
 * data-cta plus the data-content-…/data-list-… attributes cta.js's
 * linkedContentOf() reads. Shared by buildArticleCard() and any block that
 * links to one specific article from a live index item rather than rendering
 * a card (e.g. featured-blogs' "Read more", which re-tags it on every slide).
 * @param {HTMLAnchorElement} a
 * @param {Object} item - index entry ({ path, tags, publishDate, ... })
 * @param {Object} opts
 * @param {string} opts.location - cta.location
 * @param {'blog'|'news'} [opts.contentType='blog']
 * @param {number} [opts.position] - 1-based list/slide position
 * @param {string} [opts.filter] - active tab token, omitted when not applicable
 */
export function tagArticleLink(a, item, {
  location, contentType = 'blog', position = null, filter = null,
} = {}) {
  if (!location) return;
  const category = token(categoryTokenOf(item)) || 'not-set';
  a.dataset.cta = `${location}:${category}:view`;
  a.dataset.contentType = contentType;
  a.dataset.contentCategory = category;
  a.dataset.contentId = item.path.split('/').filter(Boolean).pop();
  const ms = parseDate(item.publishDate);
  if (ms) a.dataset.contentDate = new Date(ms).toISOString().slice(0, 10);
  if (position != null) {
    a.dataset.listPosition = String(position);
    // componentOf() reads this for component.position — without it every card
    // in the block falls back to the shared section index instead of its own.
    a.dataset.ctaPosition = String(position);
  }
  if (filter) a.dataset.listFilter = filter;
}

/**
 * Builds an article card as a list item wrapping a single link. The whole card
 * links to the article. Shared by blog-listing and related-blogs; callers pass
 * a class prefix and control field order + whether the description is emitted.
 *
 * @param {Object} item - index entry ({ path, title, description, image, tags })
 * @param {Object} [opts]
 * @param {string} [opts.prefix='blog-card'] - class prefix for card sub-elements
 * @param {boolean} [opts.showDescription=true] - emit the description paragraph
 * @param {'meta-first'|'meta-last'|'split'} [opts.order='meta-first'] - where the
 *   category/date meta sits. 'meta-first' (blog-listing): a meta row above the
 *   title. 'meta-last' (related-blogs): the meta row below the description.
 *   'split' (article-carousel): a body with category + title grouped at the top
 *   (`${prefix}-top`) and the date after it, for pinning to the bottom.
 * @param {boolean} [opts.decorativeImage=false] - empty alt on the image, for
 *   cards where the title already names the link (avoids reading it twice)
 * @param {string} [opts.location] - cta.location for data-layer tracking; the
 *   card is only tagged with data-cta when this is provided
 * @param {'blog'|'news'} [opts.contentType='blog'] - which index the item came from
 * @param {number} [opts.position] - 1-based position in the rendered list,
 *   counting across pagination/infinite-scroll batches
 * @param {string} [opts.filter] - active tab token, omitted when the block has no tabs
 * @returns {HTMLElement} the <li> card
 */
export function buildArticleCard(item, {
  prefix = 'blog-card',
  showDescription = true,
  order = 'meta-first',
  decorativeImage = false,
  location = null,
  contentType = 'blog',
  position = null,
  filter = null,
} = {}) {
  const li = document.createElement('li');
  li.className = prefix;

  const a = document.createElement('a');
  a.className = `${prefix}-link`;
  a.href = item.path;

  if (location) {
    tagArticleLink(a, item, {
      location, contentType, position, filter,
    });
  }

  if (item.image) {
    const media = document.createElement('div');
    media.className = `${prefix}-media`;
    const alt = decorativeImage ? '' : item.title || '';
    // phones show cards ~300-360 CSS px wide, so 600px covers a 2x screen; wider keeps 750px
    const picture = createOptimizedPicture(item.image, alt, false, [
      { media: '(min-width: 900px)', width: '750' },
      { width: '600' },
    ]);
    // Give the img explicit intrinsic dimensions matching the 16:11 media box so
    // the browser reserves the correct height before the image loads — the media
    // wrapper's aspect-ratio then simply confirms it. Prevents layout shift (CLS)
    // as images stream in, including lazily-appended batches.
    const img = picture.querySelector('img');
    if (img) {
      img.setAttribute('width', '750');
      img.setAttribute('height', '516');
      img.setAttribute('loading', 'lazy');
    }
    // an image from another site (e.g. a dealer site listing the brand site's news): any
    // rendition left as a bare path gets that site's origin back
    const { origin } = new URL(item.image, window.location.href);
    if (origin !== window.location.origin) {
      const withOrigin = (value) => (value?.startsWith('/') ? `${origin}${value}` : value);
      picture.querySelectorAll('source[srcset]').forEach((source) => {
        source.srcset = withOrigin(source.getAttribute('srcset'));
      });
      if (img) img.src = withOrigin(img.getAttribute('src'));
    }
    media.append(picture);
    a.append(media);
  }

  if (order === 'split') {
    const body = document.createElement('div');
    body.className = `${prefix}-body`;
    const top = document.createElement('div');
    top.className = `${prefix}-top`;
    const category = categoryOf(item).replace(/-/g, ' ');
    if (category) {
      const cat = document.createElement('span');
      cat.className = `${prefix}-category`;
      cat.textContent = category;
      top.append(cat);
    }
    const title = document.createElement('h2');
    title.className = `${prefix}-title`;
    title.textContent = item.title || item.path;
    top.append(title);
    if (showDescription && item.description) {
      const desc = document.createElement('p');
      desc.className = `${prefix}-desc`;
      desc.textContent = item.description;
      top.append(desc);
    }
    body.append(top);
    const dateMeta = buildDateMeta(item, prefix);
    if (dateMeta) body.append(dateMeta);
    a.append(body);
    li.append(a);
    return li;
  }

  const meta = document.createElement('div');
  meta.className = `${prefix}-meta`;
  const category = categoryOf(item).replace(/-/g, ' ');
  if (category) {
    const cat = document.createElement('span');
    cat.className = `${prefix}-category`;
    cat.textContent = category;
    meta.append(cat);
  }
  const dateMeta = buildDateMeta(item, prefix);
  if (dateMeta) meta.append(dateMeta);
  const hasMeta = meta.children.length > 0;

  if (order === 'meta-first' && hasMeta) a.append(meta);

  const title = document.createElement('h2');
  title.className = `${prefix}-title`;
  title.textContent = item.title || item.path;
  a.append(title);

  if (showDescription && item.description) {
    const desc = document.createElement('p');
    desc.className = `${prefix}-desc`;
    desc.textContent = item.description;
    a.append(desc);
  }

  if (order === 'meta-last' && hasMeta) a.append(meta);

  li.append(a);
  return li;
}
