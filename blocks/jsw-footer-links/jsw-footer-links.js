import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Jsw Footer Links: one column of the JSW footer (its section lays it out, see jsw-footer.css):
 * its title, then its links, each a child (Footer Link).
 * Rows: 1. title; then one row per link (its link, with its label as the link's text).
 */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// authoring: an editable field of the block or of the link it sits in (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

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
  const [titleRow, ...linkRows] = [...block.children];
  const title = text(titleRow) ? el('h2', { class: 'jsw-footer-links-title' }, text(titleRow)) : null;
  if (authoring) editable(title, 'title', 'text', 'Column title');
  const list = el('ul', { class: 'jsw-footer-links-list' });
  linkRows.forEach((row) => {
    const a = row.querySelector('a[href]');
    // (a link row without its link, e.g. one just added in the editor: its label only)
    const label = a ? text(a) : text(row);
    const href = a?.getAttribute('href');
    const item = el('li', { class: 'jsw-footer-links-item' });
    moveInstrumentation(row, item);
    if (authoring && item.dataset.aueResource) item.dataset.aueLabel = `Link: ${label || 'Untitled'}`;
    const link = href
      ? el('a', { class: 'jsw-footer-links-link', href }, label && label !== href ? label : href)
      : el('span', { class: 'jsw-footer-links-link' }, label);
    if (a) moveInstrumentation(a, link);
    if (authoring) editable(link, 'linkText', 'text', 'Label');
    item.append(link);
    list.append(item);
  });
  block.replaceChildren(...[title, list].filter(Boolean));
}
