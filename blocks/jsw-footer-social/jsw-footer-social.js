import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Jsw Footer Social: the JSW footer's social column (its section lays it out, see jsw-footer.css):
 * its title, then a square button per network, each a child (Social Link).
 * Rows: 1. title; then one row per network: network (facebook, instagram, x, linkedin, youtube:
 * its icon, icons/jsw-social-<network>.svg) | profile link.
 */

const NETWORKS = {
  facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// the JSW footer's layout (variant-a / variant-b), from the section's JSW Footer block: this
// block takes the same class (the footer sets it too; this covers being rendered on its own)
function followFooterLayout(block) {
  const footer = block.closest('.section')?.querySelector('.jsw-footer');
  if (!footer) return;
  const variant = footer.classList.contains('variant-b') ? 'variant-b' : 'variant-a';
  ['variant-a', 'variant-b'].forEach((v) => block.classList.toggle(v, v === variant));
}

export default function decorate(block) {
  const authoring = isAuthoring();
  followFooterLayout(block);
  const [titleRow, ...rows] = [...block.children];
  const title = text(titleRow) ? el('h2', { class: 'jsw-footer-social-title' }, text(titleRow)) : null;
  if (authoring && title) Object.assign(title.dataset, { aueProp: 'title', aueType: 'text', aueLabel: 'Column title' });
  const list = el('ul', { class: 'jsw-footer-social-list' });
  rows.forEach((row) => {
    const [networkCell, linkCell] = [...row.children];
    const network = text(networkCell).toLowerCase();
    const name = NETWORKS[network];
    if (!name) return;
    const a = linkCell?.querySelector('a[href]');
    const href = a?.getAttribute('href') || text(linkCell);
    const item = el('li', { class: 'jsw-footer-social-item' });
    moveInstrumentation(row, item);
    if (authoring && item.dataset.aueResource) item.dataset.aueLabel = `Social: ${name}`;
    const icon = el('img', {
      src: `${window.hlx?.codeBasePath || ''}/icons/jsw-social-${network}.svg`, alt: '', width: 13, height: 13, loading: 'lazy',
    });
    // (an external profile opens in a new tab; the link says so)
    const external = /^https?:/i.test(href || '') && new URL(href, window.location).origin !== window.location.origin;
    const link = href
      ? el('a', {
        class: 'jsw-footer-social-link',
        href,
        'aria-label': external ? `JSW Motors on ${name} (opens in a new tab)` : `JSW Motors on ${name}`,
        target: external ? '_blank' : undefined,
        rel: external ? 'noopener' : undefined,
      }, icon)
      : el('span', { class: 'jsw-footer-social-link', 'aria-label': name }, icon);
    if (a) moveInstrumentation(a, link);
    item.append(link);
    list.append(item);
  });
  block.replaceChildren(...[title, list].filter(Boolean));
}
