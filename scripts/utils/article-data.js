// Date and tag helpers shared by the article listing blocks and Article Info.
// Kept free of imports so Article Info (in the first section) loads only this.

// URL path shape for each article type — the one place to change if either
// section ever moves.
const NEWS_PATH_PREFIX = '/newsroom/news/';
const BLOG_PATH_PREFIX = '/blogs/';

/**
 * content.type/contentType from an article URL's path shape, or null when the
 * path isn't a blog/news article link.
 * @param {string} pathname
 * @returns {'blog'|'news'|null}
 */
export function contentTypeFromPath(pathname) {
  if (pathname.startsWith(NEWS_PATH_PREFIX)) return 'news';
  if (pathname.startsWith(BLOG_PATH_PREFIX)) return 'blog';
  return null;
}

/**
 * Converts a bare numeric timestamp into epoch milliseconds. Handles Excel
 * serial dates (~1900-2065 → the 30000-60000 range), epoch seconds, and epoch
 * milliseconds. Values too small to be any of those (e.g. a bare year like
 * 2026) are rejected as unparseable.
 * @param {number} num
 * @returns {number} epoch ms, or 0 if not a plausible timestamp
 */
function numericToMs(num) {
  // Excel serial date (days since 1899-12-30): roughly 1982-2064.
  if (num > 30000 && num < 60000) {
    return (num - 25569) * 86400 * 1000;
  }
  // Epoch seconds: ~2001-2286. Below this a value is more likely a bare year
  // or an id than a real timestamp, so treat it as unparseable.
  if (num >= 1000000000 && num < 10000000000) {
    return num * 1000;
  }
  // Epoch milliseconds.
  if (num >= 10000000000) {
    return num;
  }
  return 0;
}

/**
 * Parses a date value into epoch milliseconds.
 * @param {string|number} val
 * @returns {number}
 */
export function parseDate(val) {
  if (!val) return 0;
  if (typeof val === 'number') {
    return numericToMs(val);
  }
  const str = String(val).trim();
  if (!str) return 0;
  if (/^\d+$/.test(str)) {
    return numericToMs(Number(str));
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes tags from strings or arrays into a clean array of lowercase strings.
 * @param {string|string[]} val
 * @returns {string[]}
 */
export function normalizeTags(val) {
  if (!val) return [];
  let list = [];
  if (Array.isArray(val)) {
    list = val;
  } else {
    const str = String(val).trim();
    if (!str) return [];
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) list = parsed;
        else list = str.split(/[,|;]/);
      } catch {
        list = str.split(/[,|;]/);
      }
    } else {
      list = str.split(/[,|;]/);
    }
  }

  const tags = new Set();
  list.forEach((t) => {
    let clean = String(t).trim().toLowerCase();
    clean = clean.replace(/&quot;/g, '"').replace(/^["'[\]\s]+|["'[\]\s]+$/g, '').trim();
    if (clean) {
      tags.add(clean);
      if (clean.includes(':')) {
        tags.add(clean.split(':').pop().trim());
      }
    }
  });
  return [...tags];
}

/**
 * Category label for a card — the article's first tag, uppercased, reduced to
 * the tag's own value: the namespace ("jsw-motors-eds:") and any parent tags
 * ("news/") are dropped, so "jsw-motors-eds:news/in-the-media" -> "IN-THE-MEDIA".
 * Empty when the article has no tags.
 * @param {Object} item
 * @returns {string}
 */
export function categoryOf(item) {
  const [first] = normalizeTags(item.tags);
  if (!first) return '';
  const leaf = first
    .split(':')
    .pop()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return (leaf || '').toUpperCase();
}

/**
 * Lowercase category token for tracking (e.g. "press-release"), as opposed to
 * categoryOf()'s uppercase display label. Works on any object with a `tags`
 * field, including a tab definition from article-tabs.js, not just an index item.
 * @param {Object} item
 * @returns {string}
 */
export function categoryTokenOf(item) {
  const [first] = normalizeTags(item.tags);
  if (!first) return '';
  return first.includes(':') ? first.split(':').pop().trim() : first;
}
