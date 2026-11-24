/*
 * Adobe Client Data Layer (ACDL) helper — the single funnel for every push to
 * window.adobeDataLayer. No block calls adobeDataLayer.push directly; everything
 * goes through dataLayerPush() here.
 *
 * Naming is a hard contract: Adobe listens for exact event/field names — a typo
 * is silence, not an error. Keep values lowercase, hyphen-separated, colon-keyed.
 */

// Host on which the dev-mode validator is silenced (production only).
const PROD_HOST = 'www.jswmotors.com';

// Per-page-load interaction state. Reset by the pageView push.
const state = { count: 0, start: Date.now() };

/** Reset on each page load. Called once by the pageView push. */
export function resetInteractions() {
  state.count = 0;
  state.start = Date.now();
}

/**
 * Build the interaction object. Pass the event name.
 * Server-confirmation events (leadSubmit, formSubmitFailure) pass increment
 * false so they report the same count as the action they answer.
 * @param {string} eventName
 * @param {boolean} [increment=true]
 * @returns {{count:number, sequence:string, sincePageView:number}}
 */
export function interaction(eventName, increment = true) {
  if (increment) state.count += 1;
  return {
    count: state.count,
    sequence: eventName,
    sincePageView: Date.now() - state.start,
  };
}

/** Machine token: lowercase, trimmed, spaces to hyphens, safe charset. */
export function token(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** Colon-joined machine key, no spaces: "kmi:email:email-invalid-format". */
export function key(...parts) {
  return parts.map((part) => token(part) || 'not-set').join(':');
}

/** Page name: same rules as every other key. "jsw:brand:coming-soon:home". */
export function pageName(...segments) {
  return key('jsw', ...segments);
}

// Data-layer component types per block. EDS already sets data-block-name;
// this adds the semantic `type` componentOf() reports. Blocks not listed fall
// back to "content" below. Consumed by scripts.js's decorateDataLayerHooks(),
// which writes it onto each block as data-block-type.
export const BLOCK_TYPES = {
  'register-form': 'form',
  hero: 'hero',
  countdown: 'countdown',
  'social-deck': 'media',
  embed: 'media',
  header: 'nav',
  footer: 'nav',
  'promo-footer': 'nav',
};

/**
 * Build the component object from the DOM rather than hardcoding. Matches a
 * real authored EDS block (.block) or, for page-level UI that isn't one (e.g.
 * article-toc, built inline by a section decorator), an opt-in marker of
 * data-component-name/data-component-type set directly on that element —
 * never the "block" class itself, which would wrongly pull it into EDS's
 * block-decoration/loading pipeline.
 * @param {Element} el an element inside the block
 * @returns {object|undefined}
 */
export function componentOf(el) {
  const block = el.closest('.block, [data-component-name]');
  if (!block) return undefined;
  // Repeated items inside one block (social tiles, footer links) set their own
  // 1-based data-cta-position; the section index alone can't tell them apart.
  const itemPosition = el.closest('[data-cta-position]')?.dataset.ctaPosition;
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  return {
    name: block.dataset.componentName || block.dataset.blockName || block.classList[0] || null,
    type: block.dataset.componentType || block.dataset.blockType || 'content',
    variant: block.dataset.variant || 'default',
    title: (heading && token(heading.textContent)) || null,
    position: Number(itemPosition || block.closest('.section')?.dataset.sectionIndex) || null,
  };
}

/**
 * Fallback CTA identities for elements with no authoring path to override
 * them — the hero/footer/promo-footer CTAs are authored as plain richtext
 * links (see blocks/hero/_hero.json), with no field for a tracking identity,
 * so these are effectively always applied, not just a last resort. Single
 * source of truth so a value only needs to change in one place.
 */
export const DEFAULT_CTA = {
  heroRegister: 'teaser-hero:brand-launch:notify-me',
  footerRegister: 'teaser-footer:brand-launch:notify-me',
};

/** teaser-footer:<platform>:follow — shared by footer.js and promo-footer.js. */
export function socialCta(platform) {
  return `teaser-footer:${token(platform) || 'not-set'}:follow`;
}

/**
 * teaser-footer:<link-text>:view — identity for any standalone legal-copy
 * link (privacy, terms, cookies, ...). Derived from the link's own text so
 * new legal links get tracked automatically, with no code change per link.
 */
export function legalCta(linkText) {
  return `teaser-footer:${token(linkText) || 'not-set'}:view`;
}

// Agreed CTA vocabularies for the dev-mode validator.
const VOCAB = {
  location: ['teaser-hero', 'teaser-nav', 'teaser-sticky', 'teaser-footer',
    'social-deck', 'register-form', 'countdown',
    'stats-production', 'newsroom-hero', 'article-carousel', 'featured-blogs',
    'media-kit', 'content-listing', 'breadcrumb', 'article-toc',
    'related-articles', 'reach-us'],
  action: ['notify-me', 'view', 'watch', 'follow', 'share', 'download',
    'submit', 'back', 'change-number', 'resend',
    'filter', 'email', 'call', 'directions'],
  type: ['navigation', 'action', 'external', 'download'],
};

/**
 * Development-mode validator. Logs console warnings for malformed values so
 * they are caught before reaching the reporting environment, where they
 * cannot be corrected retrospectively. Never throws.
 * @param {object} payload
 */
function validate(payload) {
  // eslint-disable-next-line no-console
  const warn = (message) => console.warn(`[dataLayer] ${message}`, payload);

  if (!payload.event) warn('push has no event name');

  if (payload.cta) {
    const { cta } = payload;
    ['location', 'interest', 'action'].forEach((field) => {
      const value = cta[field];
      if (!value) warn(`cta.${field} is empty`);
      else if (value !== token(value)) warn(`cta.${field} is not normalised: "${value}"`);
    });
    if (cta.location && !VOCAB.location.includes(cta.location)) {
      warn(`cta.location "${cta.location}" is not in the agreed vocabulary`);
    }
    if (cta.action && !VOCAB.action.includes(cta.action)) {
      warn(`cta.action "${cta.action}" is not in the agreed vocabulary`);
    }
    if (cta.type && !VOCAB.type.includes(cta.type)) {
      warn(`cta.type "${cta.type}" is not valid`);
    }
  }

  if (payload.page?.pageName) {
    const { pageName: name } = payload.page;
    if (/\s/.test(name)) warn(`page.pageName contains a space: "${name}"`);
    if (name !== name.toLowerCase()) warn(`page.pageName is not lowercase: "${name}"`);
    if (!/^jsw(:[a-z0-9-]+)+$/.test(name)) {
      warn(`page.pageName does not match "jsw:section:subsection:page": "${name}"`);
    }
  }

  if (payload.form?.errorDetail && /\s/.test(payload.form.errorDetail)) {
    warn(`form.errorDetail must contain no spaces: "${payload.form.errorDetail}"`);
  }

  Object.entries(payload).forEach(([objectKey, value]) => {
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([field, fieldValue]) => {
        if (typeof fieldValue === 'string' && fieldValue !== fieldValue.trim()) {
          warn(`${objectKey}.${field} has leading or trailing whitespace: "${fieldValue}"`);
        }
        if (fieldValue === 'undefined' || fieldValue === 'null') {
          warn(`${objectKey}.${field} is the string "${fieldValue}" rather than a real value`);
        }
      });
    }
  });
}

/**
 * The only push function. Validates off-production, then pushes to the ACDL.
 * Never throws — tracking must not break the page.
 * @param {object} payload
 */
export function dataLayerPush(payload) {
  try {
    if (window.location.hostname !== PROD_HOST) validate(payload);
    window.adobeDataLayer = window.adobeDataLayer || [];
    window.adobeDataLayer.push(payload);
  } catch {
    // Swallow deliberately — a tracking failure must never surface to the user.
  }
}
