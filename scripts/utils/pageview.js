// Builds and pushes the per-load pageView event in the eager phase.

import { getMetadata } from '../aem.js';
import {
  dataLayerPush, pageName, token, resetInteractions,
} from './datalayer.js';
import { categoryTokenOf, parseDate, contentTypeFromPath } from './article-data.js';

// data-screen value → furthest journey milestone reached.
const SCREEN_TO_MILESTONE = { fields: 'form', otp: 'verification', success: 'registered' };

// The prod domains (the brand site and the dealer sites) always win; elsewhere use page
// metadata, defaulting to dev.
const PROD_HOSTS = ['www.jswmotors.com', 'jswmotors.com', 'dealers.jswmotors.com'];
function environment() {
  const host = window.location.hostname;
  if (PROD_HOSTS.includes(host)) return 'prod';
  return getMetadata('environment') || 'dev';
}

// Used when the path has no segment of its own to supply these.
const DEFAULT_SITE_SECTION = 'brand';
const DEFAULT_SUBSECTION = 'coming-soon';

// Anchored from the end, so leading wrapper segments are naturally ignored:
// last = page, before that = subsection, before that = site section. Root (no
// segments) is the Phase 1 "coming soon" teaser and always uses the defaults.
// A single-segment path (e.g. /newsroom) is a section's own landing page, not
// a path deep enough to carry its own subSection — that section has no
// further path to supply one, so it falls back to the page's own authored
// type (e.g. "landing") instead of the teaser defaults.
// @param {string} pageType - getMetadata('pagetype'), already resolved by the caller
function pageFromPath(pageType) {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const { length } = segments;

  let page;
  let subSection;
  let siteSection;
  if (length === 0) {
    page = 'home';
    subSection = DEFAULT_SUBSECTION;
    siteSection = DEFAULT_SITE_SECTION;
  } else if (length === 1) {
    page = 'home';
    subSection = pageType || DEFAULT_SUBSECTION;
    [siteSection] = segments;
  } else {
    page = segments[length - 1];
    subSection = segments[length - 2];
    siteSection = length >= 3 ? segments[length - 3] : DEFAULT_SITE_SECTION;
  }

  const parts = [siteSection, subSection, page].filter(Boolean);
  return {
    pageName: pageName(...parts),
    siteSection: token(siteSection) || 'not-set',
    subSection: token(subSection) || 'not-set',
  };
}

// Furthest journey milestone, read from the register-form's data-screen.
export function milestone() {
  const block = document.querySelector('.register-form[data-screen]');
  return (block && SCREEN_TO_MILESTONE[block.dataset.screen]) || 'awareness';
}

// Campaign from cid (<source>_<channel>_<campaign>_<adgroup>_<creative>), else utm_*.
// Returns undefined when there is no campaign.
export function campaign() {
  const params = new URLSearchParams(window.location.search);
  const cid = params.get('cid');

  if (cid) {
    // Split before tokenising: token() strips underscores.
    const raw = cid.trim().toLowerCase();
    const [source, channel, name, adGroup, creative] = raw.split('_').map((segment) => token(segment));
    return {
      cid: raw,
      source,
      channel,
      name,
      adGroup: adGroup || 'not-set',
      creative: creative || 'not-set',
    };
  }

  const utmSource = params.get('utm_source');
  const utmMedium = params.get('utm_medium');
  const utmCampaign = params.get('utm_campaign');
  if (utmSource && utmMedium) {
    return {
      cid: `utm:${token(utmSource)}_${token(utmMedium)}_${token(utmCampaign) || 'not-set'}`,
      source: token(utmSource),
      channel: token(utmMedium),
      name: token(utmCampaign) || 'not-set',
      adGroup: 'not-set',
      creative: 'not-set',
    };
  }

  return undefined;
}

// Article-detail only, read from the raw article-info block markup (present
// before decoration) with the same field order/fallbacks article-info.js
// uses — so content matches whatever the page actually displays.
// category: authored category field, else cq-tags (not the index JSON, which
// isn't available yet in the eager phase).
// publishDate: the "Published" byline date (article-info-published), not the
// separate "date" row — the two can differ and this is the one agreed as the
// source of truth.
// type/id: derived from the URL shape, same convention as findLinkedArticle()
// in articles.js (/newsroom/news/... -> news, /blogs/... -> blog); id is the
// slug, the last path segment.
function articleContent() {
  const block = document.querySelector('.article-info');
  if (!block) return undefined;

  const { pathname } = window.location;
  const type = contentTypeFromPath(pathname);
  const id = pathname.split('/').filter(Boolean).pop() || null;

  const authoredPublished = block.children[1]?.textContent.trim() || '';
  const authoredCategory = block.children[3]?.textContent.trim() || '';
  const category = categoryTokenOf({ tags: authoredCategory })
    || categoryTokenOf({ tags: getMetadata('cq-tags') }) || null;
  const publishMs = parseDate(authoredPublished) || parseDate(getMetadata('published-time'));

  return {
    type,
    category,
    id,
    publishDate: publishMs ? new Date(publishMs).toISOString().slice(0, 10) : null,
  };
}

// Call once per load, right before decorateMain(). Resets interaction state.
export function pushPageView() {
  resetInteractions();

  // pageName is always built from the path, no authoring needed. template/type
  // are "not-set" until authored.
  const pageType = getMetadata('pagetype') || 'not-set';
  const fromPath = pageFromPath(pageType);
  const page = {
    pageName: fromPath.pageName,
    siteSection: fromPath.siteSection || 'not-set',
    subSection: fromPath.subSection || 'not-set',
    template: getMetadata('template') || 'not-set',
    type: pageType,
    language: 'en-in',
    environment: environment(),
  };

  const payload = {
    event: 'pageView',
    page,
    journey: { milestone: milestone() },
  };

  const campaignData = campaign();
  if (campaignData) payload.campaign = campaignData;

  const contentData = articleContent();
  if (contentData) payload.content = contentData;

  dataLayerPush(payload);
}

// Call once per load, right after pushPageView(), only on error pages.
export function pushPageError(code) {
  dataLayerPush({
    event: 'pageError',
    error: {
      type: 'http',
      code,
      requestUrl: window.location.href,
      referrer: document.referrer || null,
    },
  });
}
