import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * JSW Footer: the JSW pages' footer (in the footer document, e.g. /jsw-footer, that pages pick
 * with their "footer" metadata). One block holds everything: its own properties, then its
 * children, the Footer Columns (one level, each its own node in the editor's content tree, with
 * everything it shows inside it):
 *   Footer Column (3 cells): title | links (a multifield: link + label each, delivered as a list
 *                            of links) | social icons (a multifield: profile link + network each;
 *                            the network, the link's text, picks the icon
 *                            icons/jsw-social-<network>.svg)
 *   (as imported, each child row starts with its component id; AEM renders them without it)
 * A column shows its first MAX_ITEMS links and its first MAX_ITEMS social icons (the rest are
 * not rendered).
 * Two layouts (the author's Layout, delivered as the block's class; default A):
 *   variant-a  Standard: the wordmark, copyright and location with the button under them at the
 *              left, the columns at the right, the legal link at the bottom left, over the
 *              background media (an image, or a video with the image as its poster)
 *   variant-b  Alternate: one row on a black-to-teal gradient: the wordmark, copyright, location
 *              and legal link; the button; the columns (a social column's title only read out)
 * Rows (every property in its own cell, read by position; the Layout is the block's class):
 *   1. logo (+ alt)   2. logo link   3. copyright   4. location   5. button label   6. button link
 *   7. legal link (+ label)   8. background media (image / video)   9. background image
 *   10. background video
 */

const BLOCK_ROWS = 10;
const MAX_ITEMS = 4;
const VARIANTS = ['variant-a', 'variant-b'];
const COLUMN_ID = 'jsw-footer-column';
const NETWORKS = {
  facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube',
};
// (a social icon without a known network: told by its link's site)
const NETWORK_HOSTS = {
  'facebook.com': 'facebook',
  'instagram.com': 'instagram',
  'x.com': 'x',
  'twitter.com': 'x',
  'linkedin.com': 'linkedin',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
};
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// an asset's address: placeholders under /drafts/ come from this repository (on the code host;
// in the editor the page itself comes from AEM author)
function assetSrc(href) {
  const { pathname } = new URL(href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts)}` : href;
}

/*
 * The asset of a cell: an <img>, or a link to a file of that kind (AEM delivers an asset it
 * can't resolve, or a video, as a plain link).
 */
function cellAsset(cell, kind = 'image') {
  const img = kind === 'image' ? cell?.querySelector('img') : null;
  if (img) return { src: img.src, alt: img.alt, source: img };
  const pattern = kind === 'image' ? IMAGE_FILE : VIDEO_FILE;
  const link = [...(cell?.querySelectorAll('a[href]') || [])]
    .find((a) => pattern.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const label = link.textContent.trim();
  return { src: assetSrc(link.href), alt: label && !label.includes('/') ? label : '', source: link };
}

// a link cell: its href and label (the label from the link's text, unless that is only the URL)
function cellLink(cell) {
  const a = cell?.querySelector('a[href]');
  if (!a) return null;
  const href = a.getAttribute('href');
  const label = text(a);
  return { href, label: label && label !== href ? label : '', source: a };
}

// authoring: an editable field of the block or of the child it sits in (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

// the rows: the block's own properties, then its children (the columns)
function readRows(block) {
  const rows = [...block.children];
  const first = rows.findIndex((row) => text(row.firstElementChild) === COLUMN_ID);
  const start = first >= 0 && first < BLOCK_ROWS ? first : BLOCK_ROWS;
  const columns = rows.slice(start);
  columns.forEach((row) => {
    if (text(row.firstElementChild) === COLUMN_ID) row.firstElementChild.remove();
  });
  return { props: rows.slice(0, start), columns };
}

// a multifield cell's entries (its links, in order)
function cellEntries(cell) {
  return [...(cell?.querySelectorAll('a[href]') || [])].map((a) => {
    const href = a.getAttribute('href');
    const label = text(a);
    return { href, label: label && label !== href ? label : '', source: a };
  });
}

// the background: the image, or the video with the image as its poster
function buildBackground(typeRow, imageRow, videoRow, authoring) {
  const image = cellAsset(imageRow, 'image');
  const video = text(typeRow).toLowerCase() === 'video' ? cellAsset(videoRow, 'video') : null;
  if (!image && !video) return null;
  const bg = el('div', { class: 'jsw-footer-background', 'aria-hidden': 'true' });
  if (video) {
    const type = /\.webm$/i.test(video.src) ? 'video/webm' : 'video/mp4';
    const player = el('video', {
      class: 'jsw-footer-video', muted: true, loop: true, playsinline: true, preload: 'metadata', poster: image?.src,
    }, el('source', { src: video.src, type }));
    player.muted = true;
    moveInstrumentation(video.source, player);
    if (authoring) editable(player, 'backgroundVideo', 'media', 'Background video');
    // (playing by itself, unless the visitor prefers less motion: then the poster stays)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      player.autoplay = true;
      player.play?.()?.catch?.(() => {});
    }
    bg.append(player);
    if (image && authoring) {
      // (in the editor the poster stays editable: the background image field, hidden behind)
      const poster = el('img', { class: 'jsw-footer-poster', src: image.src, alt: '' });
      moveInstrumentation(image.source, poster);
      editable(poster, 'background', 'media', 'Background image (the video\'s poster)');
      bg.append(poster);
    }
    return bg;
  }
  const pic = createOptimizedPicture(image.src, '', false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]);
  const img = pic.querySelector('img');
  moveInstrumentation(image.source, img);
  if (authoring) editable(img, 'background', 'media', 'Background image');
  bg.append(pic);
  return bg;
}

// the network of a social icon: its chosen network, else its link's site
function networkOf({ href, label }) {
  const chosen = label.toLowerCase();
  if (NETWORKS[chosen]) return chosen;
  try {
    const host = new URL(href, window.location).hostname.replace(/^www\./, '');
    const site = Object.keys(NETWORK_HOSTS).find((h) => host === h || host.endsWith(`.${h}`));
    if (site) return NETWORK_HOSTS[site];
  } catch (e) {
    // (not a URL: no network)
  }
  return chosen;
}

// a social icon: its square button (the network's icon)
function buildSocial(entry) {
  const network = networkOf(entry);
  const name = NETWORKS[network] || network || 'Social';
  const external = /^https?:/i.test(entry.href)
    && new URL(entry.href, window.location).origin !== window.location.origin;
  const accessible = `JSW Motors on ${name}`;
  const icon = NETWORKS[network]
    ? el('img', {
      src: `${window.hlx?.codeBasePath || ''}/icons/jsw-social-${network}.svg`, alt: '', width: 13, height: 13, loading: 'lazy',
    })
    : el('span', { class: 'jsw-footer-social-name' }, name);
  const a = el('a', {
    class: 'jsw-footer-social-link',
    href: entry.href,
    'aria-label': external ? `${accessible} (opens in a new tab)` : accessible,
    target: external ? '_blank' : undefined,
    rel: external ? 'noopener' : undefined,
  }, icon);
  moveInstrumentation(entry.source, a);
  return el('li', { class: 'jsw-footer-social-item' }, a);
}

// a link of a column: its label as the link's text
function buildLink(entry) {
  const a = el('a', { class: 'jsw-footer-link', href: entry.href }, entry.label || entry.href);
  moveInstrumentation(entry.source, a);
  return el('li', { class: 'jsw-footer-link-item' }, a);
}

/*
 * A Footer Column: its node (the column's own, in the editor: selecting anything in it selects
 * the column) holds its title, its links and its social icons, the first MAX_ITEMS of each
 */
function buildColumn(row, authoring) {
  const [titleCell, linksCell, socialCell] = [...row.children];
  const title = text(titleCell);
  const links = cellEntries(linksCell).slice(0, MAX_ITEMS);
  const social = cellEntries(socialCell).slice(0, MAX_ITEMS);
  const column = el('div', { class: 'jsw-footer-column' });
  moveInstrumentation(row, column);
  if (authoring && column.dataset.aueResource) column.dataset.aueLabel = `Column: ${title || 'Untitled'}`;
  const heading = el('h2', { class: 'jsw-footer-column-title' }, title);
  if (authoring) editable(heading, 'title', 'text', 'Column title');
  column.append(el('div', { class: 'jsw-footer-column-head' }, heading));
  if (links.length) column.append(el('ul', { class: 'jsw-footer-link-list' }, ...links.map(buildLink)));
  if (social.length) {
    column.classList.add('is-social');
    column.append(el('ul', { class: 'jsw-footer-social-list' }, ...social.map(buildSocial)));
  }
  return column;
}

export default function decorate(block) {
  const authoring = isAuthoring();
  // the layout (default: Variant A)
  const variant = VARIANTS.find((v) => block.classList.contains(v)) || VARIANTS[0];
  VARIANTS.forEach((v) => block.classList.toggle(v, v === variant));
  const alternate = variant === 'variant-b';
  const { props, columns } = readRows(block);
  const [logoRow, logoLinkRow, copyrightRow, locationRow, ctaLabelRow, ctaLinkRow, legalRow,
    typeRow, imageRow, videoRow] = props;

  // the background media (Variant A; B has its gradient)
  const bg = alternate ? null : buildBackground(typeRow, imageRow, videoRow, authoring);

  // the brand: the wordmark (a link), the copyright and location
  const brand = el('div', { class: 'jsw-footer-brand' });
  const logo = cellAsset(logoRow, 'image');
  if (logo) {
    const vector = /\.(svg|png)$/i.test(new URL(logo.src, window.location).pathname);
    const img = vector
      ? el('img', {
        src: logo.src, alt: logo.alt || text(logoRow) || 'JSW Motors', width: alternate ? 145 : 164, height: alternate ? 9 : 11, loading: 'lazy',
      })
      : createOptimizedPicture(logo.src, logo.alt || 'JSW Motors', false, [{ width: '400' }]).querySelector('img');
    moveInstrumentation(logo.source, img);
    if (authoring) editable(img, 'logo', 'media', 'Logo');
    const home = cellLink(logoLinkRow);
    const media = img.closest('picture') || img;
    brand.append(home
      ? el('a', { class: 'jsw-footer-logo', href: home.href }, media)
      : el('span', { class: 'jsw-footer-logo' }, media));
  }
  const copyright = text(copyrightRow) ? el('span', { class: 'jsw-footer-copyright' }, text(copyrightRow)) : null;
  if (authoring) editable(copyright, 'copyright', 'text', 'Copyright');
  const location = text(locationRow) ? el('span', { class: 'jsw-footer-location' }, text(locationRow)) : null;
  if (authoring) editable(location, 'location', 'text', 'Location');
  if (copyright || location) brand.append(el('p', { class: 'jsw-footer-meta' }, copyright || '', location || ''));

  // the button: its label and its link, two fields (shown with its link)
  const ctaLabel = text(ctaLabelRow);
  const ctaLink = cellLink(ctaLinkRow) || (text(ctaLinkRow) ? { href: text(ctaLinkRow) } : null);
  let button = null;
  if (ctaLink) {
    const label = el('span', { class: 'jsw-footer-cta-label' }, ctaLabel || ctaLink.label || 'Register interest');
    if (authoring) editable(label, 'ctaLabel', 'text', 'Button label');
    button = el('a', { class: 'jsw-footer-cta', href: ctaLink.href }, label, el('span', { class: 'jsw-footer-cta-icon', 'aria-hidden': 'true' }));
    if (ctaLink.source) moveInstrumentation(ctaLink.source, button);
  }

  // the legal link
  const legal = cellLink(legalRow);
  let legalEl = null;
  if (legal) {
    const a = el('a', { class: 'jsw-footer-legal-link', href: legal.href }, legal.label || 'Privacy policy');
    moveInstrumentation(legal.source, a);
    if (authoring) editable(a, 'legalLinkText', 'text', 'Legal link label');
    legalEl = el('p', { class: 'jsw-footer-legal' }, a);
  }

  // the columns: the footer's children
  const nav = el('nav', { class: 'jsw-footer-columns', 'aria-label': 'Footer' }, ...columns.map((row) => buildColumn(row, authoring)));

  let inner;
  if (alternate) {
    // B: the brand with the legal link under it; the button in its own column; the columns
    if (legalEl) brand.append(legalEl);
    inner = el('div', { class: 'jsw-footer-inner' }, brand, el('div', { class: 'jsw-footer-action' }, button || ''), nav);
  } else {
    // A: the button under the brand; the columns; the legal link at the bottom left
    if (button) brand.append(button);
    inner = el('div', { class: 'jsw-footer-inner' }, brand, nav, legalEl || '');
  }
  block.replaceChildren(...[bg, inner].filter(Boolean));
}
