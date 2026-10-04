import { createOptimizedPicture } from '../../scripts/aem.js';

function extractCategoryFromPath(path) {
  if (!path) return '';
  const match = path.match(/\/category-([^/]+)/);
  if (match && match[1]) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return '';
}

function formatTitleFromPath(path) {
  if (!path) return 'Blog Article';
  const parts = path.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1] || '';
  return lastPart
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function decorate(block) {
  // 1. Fetch data from /blog-index.json or fallback to /query-index.json
  let response = await fetch('/blog-index.json');
  if (!response.ok) {
    response = await fetch('/query-index.json');
  }
  if (!response.ok) {
    block.innerHTML = '<p>Failed to load articles.</p>';
    return;
  }

  const json = await response.json();
  let articles = [];
  if (Array.isArray(json.data)) {
    articles = json.data;
  } else if (Array.isArray(json)) {
    articles = json;
  }

  // 2. Filter out non-article pages (e.g. root, nav, footer, index page itself)
  articles = articles.filter((item) => {
    if (!item || !item.path) return false;
    const { path } = item;
    if (path === '/' || path === '/nav' || path === '/footer' || path === '/blogs-index' || path === '/blogs-index/') {
      return false;
    }
    // Filter out category root pages if they have subpages or no article in path
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return false;
    if (parts.length === 2 && parts[1].startsWith('category-') && !item.description) {
      return false;
    }
    return true;
  });

  // Sort by lastModified descending (newest first)
  articles.sort((a, b) => (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0));

  // 3. Extract unique tags/categories for dropdown
  const allTags = new Set();
  articles.forEach((item) => {
    if (item.tags) {
      const tagsArray = item.tags.split(',').map((t) => t.trim());
      tagsArray.forEach((tag) => {
        if (tag) allTags.add(tag);
      });
    }
    const category = extractCategoryFromPath(item.path);
    if (category) {
      allTags.add(category);
    }
  });

  // 4. Build UI
  block.innerHTML = '';

  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'blog-filter-wrapper';

  const select = document.createElement('select');
  select.className = 'blog-tag-filter';
  select.innerHTML = '<option value="all">All Categories</option>';

  allTags.forEach((tag) => {
    select.innerHTML += `<option value="${tag}">${tag}</option>`;
  });

  filterWrapper.append(select);
  block.append(filterWrapper);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'blog-list-wrapper';
  block.append(listWrapper);

  // 5. Function to render article cards
  const renderArticles = (dataToRender) => {
    listWrapper.innerHTML = '';

    if (dataToRender.length === 0) {
      listWrapper.innerHTML = '<p>No articles found for this category.</p>';
      return;
    }

    dataToRender.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'blog-card';

      // Parse date
      let date = '';
      if (item.lastModified) {
        const timestamp = Number(item.lastModified);
        const parsedDate = !Number.isNaN(timestamp)
          ? new Date(timestamp > 1e11 ? timestamp : timestamp * 1000)
          : new Date(item.lastModified);
        if (!Number.isNaN(parsedDate.getTime())) {
          date = parsedDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }

      const cardLink = document.createElement('a');
      cardLink.className = 'blog-card-link';
      cardLink.href = item.path || '#';

      if (item.image) {
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'blog-card-image';
        const pic = createOptimizedPicture(item.image, item.title || '', false, [{ width: '750' }]);
        imageWrapper.append(pic);
        cardLink.append(imageWrapper);
      }

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'blog-card-content';

      if (date) {
        const dateEl = document.createElement('p');
        dateEl.className = 'blog-card-date';
        dateEl.textContent = date;
        contentWrapper.append(dateEl);
      }

      const titleEl = document.createElement('h3');
      titleEl.className = 'blog-card-title';
      let displayTitle = item.title;
      if (!displayTitle || displayTitle === 'Metadata') {
        const category = extractCategoryFromPath(item.path);
        const derived = formatTitleFromPath(item.path);
        displayTitle = category ? `${category} - ${derived}` : derived;
      }
      titleEl.textContent = displayTitle;
      contentWrapper.append(titleEl);

      if (item.description) {
        const descEl = document.createElement('p');
        descEl.className = 'blog-card-description';
        descEl.textContent = item.description;
        contentWrapper.append(descEl);
      }

      const category = extractCategoryFromPath(item.path);
      const tagDisplay = item.tags || category;
      if (tagDisplay) {
        const tagsEl = document.createElement('p');
        tagsEl.className = 'blog-card-tags';
        tagsEl.textContent = `Category: ${tagDisplay}`;
        contentWrapper.append(tagsEl);
      }

      cardLink.append(contentWrapper);
      card.append(cardLink);
      listWrapper.append(card);
    });
  };

  renderArticles(articles);

  // 6. Filter dropdown listener
  select.addEventListener('change', (event) => {
    const selectedTag = event.target.value.toLowerCase();

    if (selectedTag === 'all') {
      renderArticles(articles);
    } else {
      const filtered = articles.filter((item) => {
        const itemTags = (item.tags || '').toLowerCase();
        const itemCategory = extractCategoryFromPath(item.path).toLowerCase();
        return itemTags.includes(selectedTag) || itemCategory === selectedTag;
      });
      renderArticles(filtered);
    }
  });
}
