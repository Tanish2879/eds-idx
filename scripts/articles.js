import { parseDate, normalizeTags, contentTypeFromPath } from './utils/article-data.js';

// Lives in article-data.js so pageview.js (eager phase) needn't load this file;
// re-exported here for existing callers.
export { contentTypeFromPath };

const cache = new Map();
const TRUTHY = new Set(['true', 'yes', '1', 'on', 'x', 'featured']);

/** Default query index for article blocks (overridable per block by authors). */
export const DEFAULT_INDEX = '/blog-index.json';
const NEWS_INDEX = '/news-index.json';

/** content.type/contentType for data-layer tracking, from the index path in use. */
export function contentTypeOf(indexPath) {
  return indexPath.includes('news') ? 'news' : 'blog';
}

/**
 * Fetches and caches a query-index JSON file.
 * @param {string} [indexPath='/blog-index.json']
 * @returns {Promise<Array<Object>>}
 */
export async function fetchIndex(indexPath = DEFAULT_INDEX) {
  const cleanPath = (indexPath || DEFAULT_INDEX).trim();
  if (cache.has(cleanPath)) {
    return cache.get(cleanPath);
  }

  const promise = (async () => {
    const resp = await fetch(cleanPath);
    if (!resp.ok) {
      throw new Error(`index fetch failed: ${resp.status}`);
    }
    const json = await resp.json();
    return Array.isArray(json.data) ? json.data : [];
  })().catch(() => {
    // Don't cache a transient failure — drop the entry so the next call retries.
    cache.delete(cleanPath);
    return [];
  });

  cache.set(cleanPath, promise);
  return promise;
}

/**
 * Normalizes a URL path to site-relative path without trailing slash or extension.
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
  if (!path) return '';
  try {
    const url = new URL(path, window.location.origin);
    return url.pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
  } catch {
    return String(path).replace(/\/+$/, '').replace(/\.html$/, '');
  }
}

/**
 * @param {string} path
 * @returns {string}
 */
export function stripAuthorPrefix(path) {
  return path.replace(/^\/content\/[^/]+(?=\/)/, '');
}

/**
 * Queries, filters, sorts (newest to oldest), and paginates index entries.
 *
 * @param {Object} [opts={}]
 * @param {string} [opts.root] - Only include paths starting with this root folder
 * @param {string|string[]} [opts.tags] - Match articles whose `tags` include these tag(s)
 * @param {boolean} [opts.isFeatured] - If true, filter by isFeaturedBlog truthy
 * @param {string|string[]} [opts.exclude] - Path(s) to exclude (e.g. the current
 *   article, and/or authored "Excluded Paths" like listing/landing pages)
 * @param {number} [opts.offset=0] - Starting index for pagination
 * @param {number} [opts.limit=15] - Maximum items to return
 * @param {string} [opts.indexPath='/blog-index.json'] - Path to index JSON
 * @returns {Promise<{ items: Array<Object>, total: number, hasMore: boolean, nextOffset: number }>}
 */
export async function queryArticles({
  root = '',
  tags = '',
  isFeatured = false,
  exclude = '',
  offset = 0,
  limit = 15,
  indexPath = DEFAULT_INDEX,
} = {}) {
  const all = await fetchIndex(indexPath);
  const normalizedRoot = root ? stripAuthorPrefix(normalizePath(root)) : '';
  const searchTags = normalizeTags(tags);
  // `exclude` accepts a single path (e.g. the current article) or an array of
  // paths (e.g. authored "Excluded Paths"). Normalise all into a lookup set.
  const excludeList = Array.isArray(exclude) ? exclude : [exclude];
  const excludeSet = new Set(
    excludeList.filter(Boolean).map((p) => stripAuthorPrefix(normalizePath(p))),
  );

  const filtered = all.filter((item) => {
    const itemPath = normalizePath(item.path);

    // Root path check — match on a trailing slash so "/blogs" does not also
    // match sibling folders like "/blogs-archive".
    if (normalizedRoot) {
      if (itemPath === normalizedRoot || !itemPath.startsWith(`${normalizedRoot}/`)) {
        return false;
      }
    }

    if (excludeSet.has(itemPath)) {
      return false;
    }

    if (isFeatured) {
      const flag = String(item.isFeaturedBlog ?? '').trim().toLowerCase();
      if (!TRUTHY.has(flag)) {
        return false;
      }
    }

    // Matches the `tags` field only; keywords/category are not used for filtering.
    if (searchTags.length > 0) {
      const itemTags = normalizeTags(item.tags);
      const hasMatch = searchTags.some((tag) => itemTags.includes(tag));
      if (!hasMatch) {
        return false;
      }
    }

    return true;
  });

  filtered.sort((a, b) => parseDate(b.publishDate) - parseDate(a.publishDate));

  const total = filtered.length;
  const start = Math.max(0, parseInt(offset, 10) || 0);
  const count = Math.max(1, parseInt(limit, 10) || 15);
  const items = filtered.slice(start, start + count);
  const nextOffset = start + items.length;
  const hasMore = nextOffset < total;

  return {
    items,
    total,
    hasMore,
    nextOffset,
  };
}

/**
 * Looks up the index entry a hand-authored link points to, for blocks that
 * link to one specific article without rendering it as a card (e.g.
 * featured-intro's "Read more"). Picks the index to check from the link's own
 * path shape (/newsroom/news/... -> news, /blogs/... -> blog) so the real
 * tags/publishDate come from the index rather than being guessed from the URL.
 * @param {string} href
 * @returns {Promise<{item: Object, type: 'blog'|'news'}|null>} null when the
 *   href isn't a blog/news article link, or no matching row is found
 */
export async function findLinkedArticle(href) {
  let path;
  try {
    path = new URL(href, window.location.origin).pathname;
  } catch {
    return null;
  }
  const type = contentTypeFromPath(path);
  if (!type) return null;
  const indexPath = type === 'news' ? NEWS_INDEX : DEFAULT_INDEX;
  const all = await fetchIndex(indexPath);
  const target = normalizePath(path);
  const item = all.find((row) => normalizePath(row.path) === target);
  return item ? { item, type } : null;
}
