import { getMetadata, loadCSS } from '../../scripts/aem.js';
import { queryArticles, DEFAULT_INDEX, contentTypeOf } from '../../scripts/articles.js';
import { buildArticleCard } from '../../scripts/article-card.js';
import { cellVal, onAuthor } from '../../scripts/utils/common.js';
import snapRow from '../../scripts/utils/snap-row.js';

const LIMIT = 3;

/** Left style: folds category and date into one meta line before the description (read once). */
function foldNewsMeta(list) {
  list.querySelectorAll('.related-blogs-card-body').forEach((body) => {
    const cat = body.querySelector('.related-blogs-card-category');
    const date = body.querySelector('.related-blogs-card-date');
    const parts = [];
    if (cat) {
      const label = cat.textContent.trim().toLowerCase();
      if (label) parts.push(document.createTextNode(label[0].toUpperCase() + label.slice(1)));
    }
    if (date) {
      // "28 OCT" + "2026" → "28 Oct 2026"
      const [dayMon = '', , year = ''] = [...date.children].map((s) => s.textContent.trim());
      const [day, mon = ''] = dayMon.split(' ');
      const time = document.createElement('time');
      const iso = body.closest('a')?.dataset.contentDate;
      if (iso) time.dateTime = iso;
      time.textContent = [day, mon && mon[0] + mon.slice(1).toLowerCase(), year]
        .filter(Boolean).join(' ');
      parts.push(time);
    }
    cat?.remove();
    date?.remove();
    if (!parts.length) return;

    const meta = document.createElement('span');
    meta.className = 'related-blogs-card-meta';
    parts.forEach((part, i) => meta.append(i ? ' · ' : '', part));
    meta.append('.');
    let desc = body.querySelector('.related-blogs-card-desc');
    if (desc) {
      desc.prepend(meta, ' ');
    } else {
      desc = document.createElement('p');
      desc.className = 'related-blogs-card-desc';
      desc.append(meta);
      body.querySelector('.related-blogs-card-top')?.append(desc);
    }
  });
}

/** Left style: View all moves (in the DOM) under the cards on phones so focus order matches. */
function placeViewAll(block, list) {
  const head = block.querySelector('.related-blogs-head');
  const link = head?.querySelector('.related-blogs-view-all');
  if (!link) return;
  const phone = window.matchMedia('(width < 900px)');
  const place = () => {
    if (phone.matches) list.after(link);
    else head.append(link);
  };
  place();
  phone.addEventListener('change', place);
}

/** Rows: heading, root, index, show (tags|latest), view-all link, label; 4-6 are optional. */
export default async function decorate(block) {
  const [headingRow, rootRow, indexRow, showRow, viewAllRow, viewAllLabelRow] = [...block.children];
  const headingText = cellVal(headingRow) || 'More Articles';
  const root = cellVal(rootRow) || '';
  const indexPath = cellVal(indexRow) || DEFAULT_INDEX;
  const latest = cellVal(showRow) === 'latest';
  const viewAll = cellVal(viewAllRow);
  const viewAllLabel = cellVal(viewAllLabelRow);

  const left = block.classList.contains('left');
  if (left) {
    await loadCSS(`${window.hlx.codeBasePath}/blocks/related-blogs/related-blogs-left.css`);
  }

  const tags = getMetadata('cq-tags');
  const current = window.location.pathname.replace(/\.html$/, '');
  const editing = onAuthor();

  const buildHead = () => {
    const heading = document.createElement('h2');
    heading.className = 'related-blogs-heading';
    heading.textContent = headingText;
    if (!viewAll || !viewAllLabel) return heading;
    const head = document.createElement('div');
    head.className = 'related-blogs-head';
    const link = document.createElement('a');
    link.className = 'related-blogs-view-all button';
    link.href = viewAll;
    link.textContent = viewAllLabel;
    // hover letter glitch (scripts/utils/glitch.js)
    link.dataset.glitch = '';
    head.append(heading, link);
    return head;
  };

  const hideBlock = () => {
    const wrapper = block.closest('.related-blogs-wrapper');
    const container = block.closest('.related-blogs-container');
    if (wrapper) wrapper.remove();
    else block.remove();
    if (container && !container.children.length) {
      container.remove();
    }
  };

  const renderHeadingOnly = () => {
    block.textContent = '';
    block.append(buildHead());
  };

  // Without tags there is nothing to relate on (Latest doesn't need them).
  if (!tags && !latest) {
    if (editing) {
      renderHeadingOnly();
      const note = document.createElement('p');
      note.className = 'related-blogs-empty';
      note.textContent = 'Add tags to this page to show related articles.';
      block.append(note);
    } else {
      hideBlock();
    }
    return;
  }

  // queryArticles never throws (fetch failures resolve to an empty list).
  const { items: found } = await queryArticles({
    root,
    tags: latest ? '' : tags,
    exclude: current,
    limit: LIMIT,
    indexPath,
  });

  // cross-site index (e.g. dealer site reading jswmotors.com/news-index.json): absolutize URLs
  let indexOrigin = '';
  try {
    indexOrigin = new URL(indexPath, window.location.href).origin;
  } catch {
    // malformed path: treat as this site's
  }
  // copy items: the fetched index is cached and shared
  const items = indexOrigin && indexOrigin !== window.location.origin
    ? found.map((item) => ({
      ...item,
      path: new URL(item.path, indexOrigin).href,
      image: item.image ? new URL(item.image, indexOrigin).href : item.image,
    }))
    : found;

  if (!items.length) {
    if (editing) {
      renderHeadingOnly();
      const note = document.createElement('p');
      note.className = 'related-blogs-empty';
      note.textContent = latest
        ? 'No articles in this folder yet.'
        : 'No related articles match this page’s tags yet.';
      block.append(note);
    } else {
      hideBlock();
    }
    return;
  }

  block.textContent = '';
  block.append(buildHead());

  const list = document.createElement('ul');
  list.className = 'related-blogs-cards';
  // 'split': category + title + desc grouped, date after; CSS reorders per breakpoint
  const contentType = contentTypeOf(indexPath);
  items.forEach((item, i) => list.append(buildArticleCard(item, {
    prefix: 'related-blogs-card',
    showDescription: true,
    order: 'split',
    // the title already names the link; an alt would read it twice
    decorativeImage: true,
    location: 'related-articles',
    contentType,
    position: i + 1,
  })));
  if (left) foldNewsMeta(list);
  block.append(list);
  snapRow(list);
  if (left) placeViewAll(block, list);
}
