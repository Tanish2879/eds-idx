/*
 * CTA tracking. One delegated click listener on the whole document —
 * delegation means it also covers blocks decorated after this runs. Identity
 * comes from the authored data-cta ("location:interest:action"), never from
 * the href. type / nextPage / referrer / currentPage are derived.
 *
 * Guard: the form's Get OTP / Resend / Submit controls are NOT CTAs — they
 * carry data-action, not data-cta, so closest('[data-cta]') never matches them.
 */

import {
  dataLayerPush, interaction, token, componentOf,
} from './datalayer.js';

let registered = false;

/**
 * Readable text for cta.text. el.textContent alone runs sibling elements
 * together with no separator (e.g. a card's category/title/date render as
 * "LATEST UPDATEThe real story...15 OCT2026") since there's no whitespace
 * text node between them in the markup — this joins each text node with a
 * space instead.
 * @param {Element} el
 * @returns {string}
 */
function textOf(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent.trim();
    if (text) parts.push(text);
    node = walker.nextNode();
  }
  return parts.join(' ');
}

/**
 * Describes the article a clicked card/link points to, read from the
 * data-content-… and data-list-… attributes buildArticleCard() sets. Returns null
 * for a non-card element — the caller must still push that null explicitly
 * (never omit the key), or a stale value from a previous card click lingers
 * in Adobe's merged data-layer state and gets attributed to the wrong click.
 * @param {Element} el
 * @returns {object|null}
 */
function linkedContentOf(el) {
  if (!el.dataset.contentId) return null;
  const linkedContent = {
    type: el.dataset.contentType,
    category: el.dataset.contentCategory,
    id: el.dataset.contentId,
    listPosition: Number(el.dataset.listPosition),
  };
  if (el.dataset.contentDate) linkedContent.publishDate = el.dataset.contentDate;
  if (el.dataset.listFilter) linkedContent.listFilter = el.dataset.listFilter;
  return linkedContent;
}

/** Register the single delegated ctaClick listener. Idempotent. */
export default function initCtaTracking() {
  if (registered) return;
  registered = true;

  document.addEventListener('click', (clickEvent) => {
    const el = clickEvent.target.closest('[data-cta]');
    if (!el) return;

    // Do NOT name a variable `location` — it shadows window.location.
    const [rawLocation, rawInterest, rawAction] = el.dataset.cta.split(':');
    const ctaLocation = token(rawLocation);
    const ctaInterest = token(rawInterest) || 'not-set';
    const ctaAction = token(rawAction) || 'not-set';
    if (!ctaLocation) return; // malformed: suppress

    const href = el.getAttribute('href');
    let type = 'action';
    let nextPage = null;

    if (href && !href.startsWith('#')) {
      const destinationUrl = new URL(href, window.location.origin);
      // Same page, different hash — an anchor jump, not a navigation, however
      // the author wrote the href ("#register" or "/home#register" from /home).
      const isSamePageAnchor = destinationUrl.hash
        && destinationUrl.origin === window.location.origin
        && destinationUrl.pathname === window.location.pathname
        && destinationUrl.search === window.location.search;
      if (!isSamePageAnchor) {
        nextPage = destinationUrl.href;
        if (destinationUrl.origin !== window.location.origin) type = 'external';
        else if (/\.(pdf|zip|docx?|xlsx?)$/i.test(destinationUrl.pathname)) type = 'download';
        else type = 'navigation';
      }

      // Section 11: never push an email address or phone number, in any
      // format — must run after the block above, which otherwise leaves the
      // raw mailto:/tel: address in nextPage.
      if (href.startsWith('mailto:') || href.startsWith('tel:')) nextPage = null;
    }

    dataLayerPush({
      event: 'ctaClick',
      cta: {
        location: ctaLocation,
        interest: ctaInterest,
        action: ctaAction,
        type,
        text: (textOf(el) || el.getAttribute('aria-label') || '').slice(0, 100),
        referrer: document.referrer || null,
        currentPage: window.location.href,
        nextPage,
      },
      linkedContent: linkedContentOf(el),
      component: componentOf(el),
      interaction: interaction('ctaClick'),
    });
  });
}
