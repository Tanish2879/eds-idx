import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Careers Hero: the Careers page's opening section. A photo across the full width (a cool tone
 * over it), the heading at its bottom left and an optional description under it; at the bottom
 * right a button, e.g. SCROLL. Rows (every property in its own cell, read by position):
 *   1. background image (+ alt)   2. heading   3. description   4. button label   5. button link
 * A button link to an anchor (#open-roles) scrolls smoothly to the element with that id on the
 * page or, without one, to the page's Job Board (the job board takes the id open-roles); any other
 * link opens its page.
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const BOARD = 'main .job-board'; // where an anchor without its own target leads

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

// authoring: an editable field of the block (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

// the element an anchor link leads to: the one with its id, else the page's job board, else the
// section after the hero
function anchorTarget(hash, block) {
  const id = decodeURIComponent(hash.slice(1));
  return (id && document.getElementById(id))
    || document.querySelector(BOARD)
    || block.closest('.section')?.nextElementSibling;
}

// scrolls to the element (at once when the visitor prefers less motion), then moves the focus
// there for keyboard and screen reader users, and keeps the anchor in the page address
function scrollToTarget(target) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  if (target.id) window.history.replaceState(window.history.state, '', `#${target.id}`);
}

export default function decorate(block) {
  const authoring = isAuthoring();
  const [imageRow, headingRow, descriptionRow, labelRow, linkRow] = [...block.children];

  // the photo (the page's largest element: loaded first)
  const image = rowImage(imageRow);
  let media = null;
  if (image) {
    const picture = createOptimizedPicture(image.src, image.alt || text(imageRow), true, [
      { media: '(min-width: 900px)', width: '2400' }, { width: '900' }]);
    const img = picture.querySelector('img');
    img.setAttribute('fetchpriority', 'high');
    moveInstrumentation(image.source, img);
    if (authoring) editable(img, 'image', 'media', 'Background image');
    media = el('div', { class: 'careers-hero-media' }, picture);
  }

  // the heading, the description, the button
  const heading = text(headingRow) ? el('h1', { class: 'careers-hero-heading' }, text(headingRow)) : null;
  if (authoring) editable(heading, 'heading', 'text', 'Heading');
  const description = text(descriptionRow)
    ? el('p', { class: 'careers-hero-description' }, text(descriptionRow)) : null;
  if (authoring) editable(description, 'description', 'text', 'Subheading / description');
  const href = linkRow?.querySelector('a[href]')?.getAttribute('href') || text(linkRow);
  const label = text(labelRow);
  let cta = null;
  if (label && href) {
    const isAnchor = href.startsWith('#');
    const labelEl = el('span', { class: 'careers-hero-cta-label' }, label);
    if (authoring) editable(labelEl, 'ctaLabel', 'text', 'Button label');
    cta = el(
      'a',
      { class: `careers-hero-cta${isAnchor ? ' is-anchor' : ''}`, href },
      el('span', { class: 'careers-hero-cta-icon', 'aria-hidden': 'true' }),
      labelEl,
    );
    if (isAnchor) {
      cta.addEventListener('click', (e) => {
        const target = anchorTarget(href, block);
        if (!target) return;
        e.preventDefault();
        scrollToTarget(target);
      });
    }
  }

  const content = el(
    'div',
    { class: 'careers-hero-content' },
    el('div', { class: 'careers-hero-text' }, heading || '', description || ''),
    cta || '',
  );
  block.replaceChildren(...[media, content].filter(Boolean));
}
