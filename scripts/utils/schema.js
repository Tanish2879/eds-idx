// Page structured data (JSON-LD), built from the rendered page. Template and scope follow the
// "Schema Opportunity Analysis" workbook; the schema types the workbook marks as not built yet
// (WebSite/SearchAction, Car/Offer, AutomotiveBusiness, Service, FAQPage, CollectionPage, HowTo,
// OfferCatalog) are deliberately not produced.

import { getMetadata } from '../aem.js';
import { fetchPlaceholders, inEditor } from './common.js';
import { parseDate } from './article-data.js';
import { contentTypeFromPath } from '../articles.js';

const SCRIPT_ID = 'schema-jsonld';
const BRAND_NAME = 'JSW Motors';
const LISTING_PATHS = ['/blogs', '/newsroom', '/newsroom/news'];
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com'];
const WAIT_MS = 5000;

const { origin } = window.location;
const orgId = `${origin}/#organization`;
const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() || '';
const absolute = (url) => {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return '';
  }
};
const iso = (ms) => (ms ? new Date(ms).toISOString() : undefined);

/** @returns {string} the page path without a trailing slash ("/" stays "/") */
function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

const pageUrl = () => `${origin}${currentPath() === '/' ? '/' : currentPath()}`;

/**
 * Resolves with the first element matching the selector, or null after a timeout. The header
 * and footer load on their own schedule, so the schema waits for what it reads from them.
 * @param {string} selector
 * @returns {Promise<Element|null>}
 */
function whenPresent(selector) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, WAIT_MS);
  });
}

/**
 * Social profile links in the footer. A link to a platform's bare home page (the footer's
 * placeholder content) is not a profile, so it is left out.
 * @returns {string[]}
 */
function socialProfiles() {
  const urls = [...document.querySelectorAll('footer a[href]')]
    .map((a) => {
      try {
        return new URL(a.href);
      } catch {
        return null;
      }
    })
    .filter((url) => url && SOCIAL_HOSTS.some((host) => url.hostname === host
            || url.hostname.endsWith(`.${host}`)) && url.pathname.replace(/\//g, ''))
    .map((url) => url.href);
  return [...new Set(urls)];
}

async function organization({ withContact = false } = {}) {
  const placeholders = await fetchPlaceholders();
  const logo = document.querySelector('header img.logo-img, header .logo img');
  const sameAs = socialProfiles();
  const phone = placeholders.customerCarePhone;
  const email = placeholders.supportEmail;
  const node = {
    '@type': 'Organization',
    '@id': orgId,
    name: BRAND_NAME,
    url: `${origin}/`,
  };
    // the logoUrl placeholder wins; otherwise the header logo
  if (placeholders.logoUrl) node.logo = absolute(placeholders.logoUrl);
  else if (logo?.getAttribute('src')) node.logo = absolute(logo.currentSrc || logo.src);
  if (sameAs.length) node.sameAs = sameAs;
  if (phone || (withContact && email)) {
    node.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      ...(phone && { telephone: phone }),
      ...(withContact && email && { email }),
    };
  }
  return { node, logo: node.logo };
}

function breadcrumbList() {
  const items = [...document.querySelectorAll('main .breadcrumb ol > li')];
  const list = items.map((li, i) => {
    const name = text(li);
    const link = li.querySelector('a[href]');
    const last = i === items.length - 1;
    const item = link ? absolute(link.href) : (last && pageUrl());
    return name && item ? { name, item } : null;
  }).filter(Boolean);
  if (!list.length) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: list.map(({ name, item }, i) => ({
      '@type': 'ListItem', position: i + 1, name, item,
    })),
  };
}

function itemList() {
  const items = [...document.querySelectorAll('main .content-listing .cards > li')]
    .map((li) => {
      const link = li.querySelector('a[href]');
      const name = text(li.querySelector('h2, h3, h4')) || text(link);
      return link && name ? { name, url: absolute(link.href) } : null;
    })
    .filter(Boolean);
  if (!items.length) return null;
  return {
    '@type': 'ItemList',
    itemListElement: items.map(({ name, url }, i) => ({
      '@type': 'ListItem', position: i + 1, name, url,
    })),
  };
}

function headline() {
  return text(document.querySelector('main h1')) || getMetadata('og:title') || document.title;
}

// the shared fields of the AboutPage and ContactPage nodes
function webPage(type) {
  const description = getMetadata('description');
  return {
    '@type': type,
    '@id': `${pageUrl()}#webpage`,
    name: headline(),
    url: pageUrl(),
    ...(description && { description }),
  };
}

/**
 * The Article Info block's published and updated dates (its authored dates, else the page's),
 * read from the exact dates it keeps, else from the dates it shows.
 * @returns {{published?: number, modified?: number}}
 */
function articleInfoDates() {
  const block = document.querySelector('main .article-info');
  if (!block) return {};
  const read = (key, selector) => parseDate(block.dataset[key] || '')
        || parseDate(block.querySelector(`${selector} time`)?.dateTime || '');
  return {
    published: read('published', '.article-info-published'),
    modified: read('updated', '.article-info-updated'),
  };
}

function article(type, logo) {
  const info = articleInfoDates();
  const published = info.published
        || ['published-time', 'article-date', 'publication-date', 'publishdate', 'date']
          .map((name) => parseDate(getMetadata(name))).find(Boolean);
  const modified = info.modified || parseDate(getMetadata('modified-time')) || published;
  const author = text(document.querySelector('.article-info-author')).replace(/^By\s+/i, '')
        || getMetadata('author');
  const image = getMetadata('og:image');
  const description = getMetadata('description');
  return {
    '@type': type,
    headline: headline(),
    ...(image && { image: absolute(image) }),
    ...(description && { description }),
    ...(author && { author: { '@type': 'Person', name: author } }),
    publisher: {
      '@type': 'Organization',
      '@id': orgId,
      name: BRAND_NAME,
      ...(logo && { logo: { '@type': 'ImageObject', url: logo } }),
    },
    ...(published && { datePublished: iso(published) }),
    ...(modified && { dateModified: iso(modified) }),
    mainEntityOfPage: pageUrl(),
  };
}

/**
 * Describes the YouTube/Vimeo address an Embed block was authored with (the block records it
 * in data-embed-url, since it replaces its authored content with the player).
 * @param {URL} url
 * @returns {{embedUrl: string, contentUrl: string, thumbnail?: string}|null}
 */
function videoSource(url) {
  const host = url.hostname;
  const parts = url.pathname.split('/').filter(Boolean);
  if (/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) {
    let id = url.searchParams.get('v');
    if (host.endsWith('youtu.be')) [id] = parts;
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) [, id] = parts;
    if (!id) return null;
    return {
      embedUrl: `https://www.youtube.com/embed/${id}`,
      contentUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  if (/(^|\.)vimeo\.com$/.test(host)) {
    const id = parts.find((part) => /^\d+$/.test(part));
    if (!id) return null;
    return {
      embedUrl: `https://player.vimeo.com/video/${id}`,
      contentUrl: `https://vimeo.com/${id}`,
    };
  }
  return null;
}

function videoObjects() {
  return [...document.querySelectorAll('main .embed[data-embed-url]')].map((block) => {
    let url;
    try {
      url = new URL(block.dataset.embedUrl);
    } catch {
      return null;
    }
    const source = videoSource(url);
    const thumbnailUrl = block.dataset.embedThumb || source?.thumbnail;
    const uploadDate = iso(parseDate(getMetadata('modified-time'))
            || parseDate(getMetadata('published-time')) || parseDate(document.lastModified));
    // name, thumbnail and upload date are required for a video rich result: no guessing
    if (!source || !thumbnailUrl || !uploadDate) return null;
    const name = block.dataset.embedTitle || text(block.querySelector('iframe')) || headline();
    return {
      '@type': 'VideoObject',
      name,
      description: getMetadata('description') || name,
      thumbnailUrl,
      uploadDate,
      contentUrl: source.contentUrl,
      embedUrl: source.embedUrl,
    };
  }).filter(Boolean);
}

/**
 * Builds the page's schema nodes.
 * @returns {Promise<object[]>}
 */
async function buildGraph() {
  const path = currentPath();
  const graph = [];
  const add = (...nodes) => nodes.flat().filter(Boolean).forEach((node) => graph.push(node));

  const { node: org, logo } = await organization({ withContact: path === '/contact-us' });
  const articleType = contentTypeFromPath(`${path}/`) && !LISTING_PATHS.includes(path)
    ? { blog: 'BlogPosting', news: 'NewsArticle' }[contentTypeFromPath(`${path}/`)]
    : null;

  if (path === '/') {
    add(org);
  } else if (path === '/about-us') {
    add(org, {
      '@type': 'AboutPage',
      name: `About ${BRAND_NAME}`,
      url: pageUrl(),
      mainEntity: { '@type': 'Organization', '@id': orgId },
    });
  } else if (path === '/contact-us') {
    add(org, {
      ...webPage('ContactPage'),
      name: `Contact ${BRAND_NAME}`,
      mainEntity: {
        '@type': 'Organization',
        '@id': orgId,
        ...(org.contactPoint && { contactPoint: org.contactPoint }),
      },
    });
  } else if (articleType) {
    add(article(articleType, logo));
  }
  if (LISTING_PATHS.includes(path)) add(itemList());
  if (path !== '/') add(breadcrumbList());
  add(videoObjects());
  return graph;
}

async function render() {
  const graph = await buildGraph();
  document.getElementById(SCRIPT_ID)?.remove();
  if (!graph.length) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = SCRIPT_ID;
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  document.head.append(script);
}

/**
 * Adds the page's JSON-LD to the head. Waits (briefly) for the header and footer it reads
 * from. On listing pages, the list is refreshed as more cards load in.
 */
export default async function initSchema() {
  if (inEditor() || window.isErrorPage) return;
  await Promise.all([whenPresent('header img'), whenPresent('footer a[href]')]);
  await render();

  if (!LISTING_PATHS.includes(currentPath())) return;
  const cards = document.querySelector('main .content-listing .cards');
  if (!cards) return;
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(render, 500);
  }).observe(cards, { childList: true });
}
