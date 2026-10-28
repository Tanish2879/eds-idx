import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * JSW Footer: the JSW pages' footer (in the footer document, e.g. /jsw-footer, that pages pick
 * with their "footer" metadata). On its background image: at the top left the wordmark, the
 * copyright and location, the white button; at the top right the link columns; at the bottom left
 * the legal link. The columns are their own blocks in the same section (Jsw Footer Links: a title
 * and its links; Jsw Footer Social: a title and its networks), each a parent with its links as
 * children. The section lays them out (see the CSS: this block at the left, the columns at the
 * right in their order, the background and the legal link against the section's edges), so no
 * block is moved: the editor can re-render any of them in place.
 * Two layouts (the author's Layout choice, delivered as the block's class; default A):
 *   variant-a  Standard: the brand, copyright and location with the button under them, the columns
 *              at the right, the legal link at the bottom left, over the background image
 *   variant-b  Alternate: one row on a black-to-teal gradient: the brand with the copyright, the
 *              location and the legal link under it; the button; the columns (the social squares
 *              without their title). The background image isn't used.
 * The column blocks of the section follow this block's layout (they get the same class; each
 * also reads it when it is rendered on its own, e.g. by the editor).
 * Rows (every property in its own cell, read by position; the Layout is the block's class):
 *   1. logo (+ alt)   2. logo link   3. copyright   4. location   5. button link (+ label)
 *   6. legal link (+ label)   7. background image
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const VARIANTS = ['variant-a', 'variant-b'];
const COLUMN_BLOCKS = '.jsw-footer-links, .jsw-footer-social';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

/*
 * The image of a row: an <img>, or a link to an image file (AEM delivers an image it can't
 * resolve as a link; placeholders under /drafts/ then come from this repository).
 */
function rowImage(row) {
  const img = row?.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...(row?.querySelectorAll('a[href]') || [])]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  const label = link.textContent.trim();
  return {
    src: drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts)}` : link.href,
    alt: label && !label.includes('/') ? label : '',
    source: link,
  };
}

// a link row: its href and label (the label from the link's text, unless that is only the URL)
function rowLink(row) {
  const a = row?.querySelector('a[href]');
  if (!a) return null;
  const href = a.getAttribute('href');
  const label = text(a);
  return { href, label: label && label !== href ? label : '', source: a };
}

// authoring: an editable field of the block (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

export default function decorate(block) {
  const authoring = isAuthoring();
  // the layout (default: Variant A); the section's column blocks follow it
  const variant = VARIANTS.find((v) => block.classList.contains(v)) || VARIANTS[0];
  VARIANTS.forEach((v) => block.classList.toggle(v, v === variant));
  block.closest('.section')?.querySelectorAll(COLUMN_BLOCKS).forEach((column) => {
    VARIANTS.forEach((v) => column.classList.toggle(v, v === variant));
  });
  const alternate = variant === 'variant-b';
  const [logoRow, logoLinkRow, copyrightRow, locationRow, ctaRow, legalRow, backgroundRow] = [
    ...block.children];

  // the background (decorative; Variant A only: B has its gradient)
  const background = alternate ? null : rowImage(backgroundRow);
  let bg = null;
  if (background) {
    const pic = createOptimizedPicture(background.src, '', false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]);
    const img = pic.querySelector('img');
    moveInstrumentation(background.source, img);
    if (authoring) editable(img, 'background', 'media', 'Background image');
    bg = el('div', { class: 'jsw-footer-background' }, pic);
  }

  // the brand: the wordmark (a link), the copyright and location (A: the button under them)
  const brand = el('div', { class: 'jsw-footer-brand' });
  const logo = rowImage(logoRow);
  if (logo) {
    const svgOrPng = /\.(svg|png)$/i.test(new URL(logo.src, window.location).pathname);
    const img = svgOrPng
      ? el('img', {
        src: logo.src, alt: logo.alt || text(logoRow) || 'JSW Motors', width: alternate ? 145 : 164, height: alternate ? 9 : 11, loading: 'lazy',
      })
      : createOptimizedPicture(logo.src, logo.alt || 'JSW Motors', false, [{ width: '400' }]).querySelector('img');
    moveInstrumentation(logo.source, img);
    if (authoring) editable(img, 'logo', 'media', 'Logo');
    const home = rowLink(logoLinkRow);
    brand.append(home
      ? el('a', { class: 'jsw-footer-logo', href: home.href }, img.closest('picture') || img)
      : el('span', { class: 'jsw-footer-logo' }, img.closest('picture') || img));
  }
  const copyright = text(copyrightRow) ? el('span', { class: 'jsw-footer-copyright' }, text(copyrightRow)) : null;
  if (authoring) editable(copyright, 'copyright', 'text', 'Copyright');
  const location = text(locationRow) ? el('span', { class: 'jsw-footer-location' }, text(locationRow)) : null;
  if (authoring) editable(location, 'location', 'text', 'Location');
  if (copyright || location) brand.append(el('p', { class: 'jsw-footer-meta' }, copyright || '', location || ''));
  const cta = rowLink(ctaRow);
  let button = null;
  if (cta) {
    const label = el('span', { class: 'jsw-footer-cta-label' }, cta.label || 'Register interest');
    if (authoring) editable(label, 'ctaLinkText', 'text', 'Button label');
    button = el('a', { class: 'jsw-footer-cta', href: cta.href }, label, el('span', { class: 'jsw-footer-cta-icon', 'aria-hidden': 'true' }));
    moveInstrumentation(cta.source, button);
  }

  // the legal link
  const legal = rowLink(legalRow);
  let legalEl = null;
  if (legal) {
    const a = el('a', { class: 'jsw-footer-legal-link', href: legal.href }, legal.label || 'Privacy policy');
    moveInstrumentation(legal.source, a);
    if (authoring) editable(a, 'legalLinkText', 'text', 'Legal link label');
    legalEl = el('p', { class: 'jsw-footer-legal' }, a);
  }

  if (alternate) {
    // B: the brand with the legal link under it; the button in its own column
    if (legalEl) brand.append(legalEl);
    const action = el('div', { class: 'jsw-footer-action' }, button || '');
    block.replaceChildren(brand, action);
  } else {
    // A: the button under the brand; the legal link at the section's bottom left
    if (button) brand.append(button);
    block.replaceChildren(...[bg, brand, legalEl].filter(Boolean));
  }
}
