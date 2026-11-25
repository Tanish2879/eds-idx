/*
 * Columns "Reach Us" variant (Contact Us page), loaded by columns.js only when
 * the variant is picked. Authored entirely with core components — the variant
 * also lays out the default content around it in the same section:
 *   Section
 *   ├─ Title                       → page heading (H1), divider drawn in CSS
 *   ├─ Columns (Style: Reach Us)   → Info | Address | General + Press
 *   │    3 columns × 2 rows          intro | Phone   | Socials
 *   └─ Text                        → working hours
 * Inside the rich text, headings are the mono labels (ADDRESS, PHONE, …) and
 * paragraphs are the values.
 *
 * Every contact link carries data-contact (email | phone | maps | social),
 * data-contact-label (its label, e.g. "press") and, for socials, data-platform
 * — also used to set data-cta (P2.13). Not wired yet: Organization /
 * LocalBusiness JSON-LD.
 */

import { token } from '../../scripts/utils/datalayer.js';

const LOCATION = 'reach-us';
const NEW_TAB_HINT = '(opens in a new tab)';

// data-contact -> cta.action
const CTA_ACTION = {
  email: 'email', phone: 'call', maps: 'directions', social: 'follow',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// digits, spaces and + ( ) [ ] . - only, with at least 7 digits
const PHONE_RE = /^(?=(?:\D*\d){7})[\d\s+()[\].-]+$/;
const MAPS_RE = /(^|\.)google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com/i;

const PLATFORMS = [
  [/(^|\.)instagram\.com$/i, 'instagram', 'Instagram'],
  [/(^|\.)(x|twitter)\.com$/i, 'x', 'X'],
  [/(^|\.)linkedin\.com$/i, 'linkedin', 'LinkedIn'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube', 'YouTube'],
  [/(^|\.)facebook\.com$/i, 'facebook', 'Facebook'],
];

/**
 * Wraps a paragraph's plain-text email address or phone number in a
 * mailto: / tel: link, so authors don't have to create the link themselves.
 * @param {HTMLParagraphElement} p
 */
function autolink(p) {
  if (p.querySelector('a')) return;
  const text = p.textContent.trim();
  let href;
  if (EMAIL_RE.test(text)) href = `mailto:${text}`;
  else if (PHONE_RE.test(text)) href = `tel:${text.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')}`;
  if (!href) return;
  const a = document.createElement('a');
  a.href = href;
  a.append(...p.childNodes);
  p.append(a);
}

/** Text of the nearest label (heading) before the link in its column. */
function labelOf(a) {
  let node = a.closest('p, li') || a;
  while (node && !/^H[1-6]$/.test(node.tagName)) node = node.previousElementSibling;
  return node ? node.textContent.trim().toLowerCase() : '';
}

/**
 * Classifies a contact link (data-contact hooks) and makes outbound links
 * open in a new tab with an accessible hint.
 * @param {HTMLAnchorElement} a
 */
function decorateLink(a) {
  let url;
  try {
    url = new URL(a.getAttribute('href'), window.location.href);
  } catch {
    return;
  }
  const text = a.textContent.trim();
  const label = labelOf(a);
  if (label) a.dataset.contactLabel = label;

  if (url.protocol === 'mailto:') {
    a.dataset.contact = 'email';
  } else if (url.protocol === 'tel:') {
    a.dataset.contact = 'phone';
  } else if (url.origin !== window.location.origin) {
    a.target = '_blank';
    a.rel = 'noopener';
    if (MAPS_RE.test(`${url.hostname}${url.pathname}`)) {
      a.dataset.contact = 'maps';
      a.classList.add('reach-us-maps');
      a.closest('p')?.classList.add('reach-us-meta');
      a.setAttribute('aria-label', `${text} ${NEW_TAB_HINT}`);
    } else {
      a.dataset.contact = 'social';
      const [, platform, name] = PLATFORMS.find(([re]) => re.test(url.hostname)) || [];
      if (platform) a.dataset.platform = platform;
      const onPlatform = name && !text.toLowerCase().includes(name.toLowerCase()) ? ` on ${name}` : '';
      a.setAttribute('aria-label', `${text}${onPlatform} ${NEW_TAB_HINT}`);
    }
  }

  const action = CTA_ACTION[a.dataset.contact];
  if (action) a.dataset.cta = `${LOCATION}:${token(label) || 'not-set'}:${action}`;
}

/**
 * Applies the Reach Us layout around the Columns block: tags the heading and
 * working-hours wrappers and decorates the contact links.
 * Re-runnable (Universal Editor re-decorates the block on every change).
 * @param {Element} block the .columns.reach-us block
 */
export default function decorate(block) {
  const section = block.closest('.section');
  const columnsWrapper = block.closest('.columns-wrapper');
  if (!section || !columnsWrapper) return;

  // heading: the default content before the Columns; hours: the one after it
  const wrappers = [...section.querySelectorAll(':scope > .default-content-wrapper')];
  const isAfter = (wrapper) => wrapper.matches('.columns-wrapper ~ *');
  const head = wrappers.find((wrapper) => !isAfter(wrapper));
  const hours = wrappers.find(isAfter);
  head?.classList.add('reach-us-head');

  [block, hours].filter(Boolean).forEach((scope) => {
    scope.querySelectorAll('p').forEach(autolink);
    scope.querySelectorAll('a[href]').forEach(decorateLink);
  });

  hours?.classList.add('reach-us-foot');
}
