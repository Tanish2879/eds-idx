import { inEditor, onAuthor } from '../../scripts/utils/common.js';
import { token } from '../../scripts/utils/datalayer.js';

const LOCATION = 'breadcrumb';

const pathOf = (url) => new URL(url, window.location.href).pathname.replace(/(\.html|\/)$/, '');

/**
 * cta.interest for a breadcrumb link: the destination's last path segment,
 * never the (authored, translatable) link text. "/" has no segment -> "home".
 * @param {string} href
 * @returns {string}
 */
function interestFor(href) {
  const { pathname } = new URL(href, window.location.href);
  const last = pathname.split('/').filter(Boolean).pop();
  return token(last) || 'home';
}

/**
 * @param {Element} container the authored trail, e.g. "Home / Blog / Technology /"
 * @returns {Node[][]} the nodes of each step, split at the "/" separators
 */
function steps(container) {
  const items = [[]];
  [...container.childNodes].forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) {
      items[items.length - 1].push(node);
      return;
    }
    node.textContent.split('/').forEach((part, i) => {
      if (i) items.push([]);
      if (part.trim()) items[items.length - 1].push(document.createTextNode(part.trim()));
    });
  });
  return items.filter((nodes) => nodes.length);
}

/**
 * Breadcrumb — one rich-text field holding the trail as links separated by
 * " / ". Rendered as a list in a nav, with the separators drawn by CSS (so
 * screen readers don't read them out); a link to the current page gets
 * aria-current. Hidden when empty, except for authors. In Universal Editor the
 * authored text is left as is, so it stays editable inline.
 * @param {Element} block
 */
export default function decorate(block) {
  const trail = block.querySelector('p') || block.querySelector(':scope > div > div');
  if (!trail?.textContent.trim()) {
    if (!onAuthor()) (block.closest('.breadcrumb-wrapper') || block).remove();
    return;
  }
  if (inEditor()) {
    block.setAttribute('role', 'navigation');
    block.setAttribute('aria-label', 'Breadcrumb');
    return;
  }

  const list = document.createElement('ol');
  const here = pathOf(window.location.href);
  steps(trail).forEach((nodes) => {
    const item = document.createElement('li');
    item.append(...nodes);
    item.querySelectorAll('a[href]').forEach((a) => {
      if (pathOf(a.href) === here) a.setAttribute('aria-current', 'page');
      if (!a.dataset.cta) a.dataset.cta = `${LOCATION}:${interestFor(a.href)}:view`;
    });
    list.append(item);
  });

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');
  nav.append(list);
  block.replaceChildren(nav);
}
