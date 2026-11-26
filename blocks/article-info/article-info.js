import { getMetadata } from '../../scripts/aem.js';
import { categoryOf, parseDate } from '../../scripts/utils/article-data.js';
import { onAuthor } from '../../scripts/utils/common.js';

// one row per field, in the order of the model (_article-info.json)
const FIELDS = ['author', 'published', 'updated', 'category', 'date'];

// Dates are shown as the date in India, so every reader sees the same one (a
// timestamp just after midnight IST is still the previous day in UTC).
const DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const MONTH_NUMBER = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * @param {number} ms
 * @param {'short'|'long'} style "3 Oct 26" (byline) or "03 Oct ■ 2026" (date row)
 * @returns {HTMLTimeElement}
 */
function buildTime(ms, style) {
  const date = new Date(ms);
  const { day, month, year } = Object.fromEntries(DATE_PARTS.formatToParts(date)
    .map(({ type, value }) => [type, value]));
  const time = document.createElement('time');
  time.dateTime = `${year}-${MONTH_NUMBER.format(date)}-${day}`;
  if (style === 'short') {
    time.textContent = `${Number(day)} ${month} ${year.slice(-2)}`;
  } else {
    const sep = document.createElement('span');
    sep.className = 'article-info-date-sep';
    sep.setAttribute('aria-hidden', 'true');
    time.append(`${day} ${month}`, sep, year);
  }
  return time;
}

function span(className, ...content) {
  const el = document.createElement('span');
  el.className = className;
  el.append(...content);
  return el;
}

/**
 * Article Info — the article hero's byline ("By {author}" / "Published {published}
 * · Updated {updated}") and date row ("{category}  {date}"). Empty fields fall
 * back to the page's metadata; anything with neither is left out, label and all.
 * The category is the first tag, shown like on article cards ("blogs:design" →
 * DESIGN).
 * @param {Element} block
 */
export default function decorate(block) {
  const authored = Object.fromEntries(FIELDS.map((name, i) => [
    name, block.children[i]?.textContent.trim() || '',
  ]));
  const metaDate = (name) => parseDate(getMetadata(name));

  const author = authored.author || getMetadata('author').trim();
  const published = parseDate(authored.published) || metaDate('published-time');
  const updated = parseDate(authored.updated) || metaDate('modified-time');
  const category = (
    categoryOf({ tags: authored.category })
    || categoryOf({ tags: getMetadata('cq-tags') })
  ).replace(/-/g, ' ');
  const date = parseDate(authored.date) || metaDate('published-time');
  // the exact dates, for the page's structured data (schema.js)
  if (published) block.dataset.published = new Date(published).toISOString();
  if (updated) block.dataset.updated = new Date(updated).toISOString();
  const content = [];

  const dates = [
    published && span('article-info-published', 'Published ', buildTime(published, 'short')),
    updated && span('article-info-updated', 'Updated ', buildTime(updated, 'short')),
  ].filter(Boolean);
  if (author || dates.length) {
    const byline = document.createElement('p');
    byline.className = 'article-info-byline';
    if (author) byline.append(span('article-info-author', `By ${author}`));
    if (dates.length) {
      byline.append(span('article-info-dates', ...dates.flatMap((el, i) => (i ? [' · ', el] : [el]))));
    }
    content.push(byline);
  }

  if (category || date) {
    const row = document.createElement('p');
    row.className = 'article-info-meta';
    if (category) row.append(span('article-info-category', category));
    if (date) row.append(span('article-info-date', buildTime(date, 'long')));
    content.push(row);
  }

  if (!content.length) {
    if (!onAuthor()) {
      (block.closest('.article-info-wrapper') || block).remove();
      return;
    }
    // keep the block selectable in Universal Editor
    const note = document.createElement('p');
    note.className = 'article-info-empty';
    note.textContent = 'Article Info: fill in the fields, or the page properties they fall back to.';
    content.push(note);
  }

  block.replaceChildren(...content);
}
