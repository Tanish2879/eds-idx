export default async function decorate(block) {
  // 1. Fetch the data using the exact URL provided
  const response = await fetch('/blog-index.json');
  if (!response.ok) {
    block.innerHTML = '<p>Failed to load articles.</p>';
    return;
  }

  const json = await response.json();
  let articles = json.data;

  // 2. Clean and Sort the data
  // Filter out category root pages (pages with no description)
  articles = articles.filter((item) => item.description && item.description.trim() !== '');

  // Sort by lastModified descending (newest first)
  articles.sort((a, b) => b.lastModified - a.lastModified);

  // 3. Extract unique tags for the dropdown
  const allTags = new Set();
  articles.forEach((item) => {
    if (item.tags) {
      // Handle comma-separated tags if multiple are authored
      const tagsArray = item.tags.split(',').map((tag) => tag.trim());
      tagsArray.forEach((tag) => {
        if (tag) allTags.add(tag);
      });
    }
  });

  // 4. Build the UI
  block.innerHTML = ''; // Clear any authored placeholder content

  // Create Filter Dropdown
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

  // Create Container for Article Cards
  const listWrapper = document.createElement('div');
  listWrapper.className = 'blog-list-wrapper';
  block.append(listWrapper);

  // 5. Function to render articles
  const renderArticles = (dataToRender) => {
    listWrapper.innerHTML = ''; // Clear current articles

    if (dataToRender.length === 0) {
      listWrapper.innerHTML = '<p>No articles found for this category.</p>';
      return;
    }

    dataToRender.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'blog-card';

      // Convert Unix timestamp to readable date
      const date = new Date(item.lastModified * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      card.innerHTML = `
        <a href="${item.path}" class="blog-card-link">
          <div class="blog-card-image">
            <img src="${item.image}" alt="${item.title}" loading="lazy" />
          </div>
          <div class="blog-card-content">
            <p class="blog-card-date">${date}</p>
            <h3 class="blog-card-title">${item.title === 'Metadata' ? 'Blog Article' : item.title}</h3>
            <p class="blog-card-description">${item.description}</p>
            ${item.tags ? `<p class="blog-card-tags">Tags: ${item.tags}</p>` : ''}
          </div>
        </a>
      `;
      listWrapper.append(card);
    });
  };

  // Initial render of all articles
  renderArticles(articles);

  // 6. Add Event Listener for the Dropdown Filter
  select.addEventListener('change', (event) => {
    const selectedTag = event.target.value;

    if (selectedTag === 'all') {
      renderArticles(articles);
    } else {
      const filtered = articles.filter((item) => item.tags && item.tags.includes(selectedTag));
      renderArticles(filtered);
    }
  });
}
