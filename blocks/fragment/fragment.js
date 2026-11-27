/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {HTMLElement} The root element of the fragment
 */
/**
 * The paths a fragment page may be served at, the given one first: its site path (/modals/x),
 * the local preview's content path (/content/modals/x) and, from an AEM path
 * (/content/<site>/modals/x), the site path.
 * @param {string} path
 * @returns {string[]}
 */
function fragmentPaths(path) {
  const paths = [path];
  if (path.startsWith('/content/')) {
    paths.push(path.replace(/^\/content/, ''), path.replace(/^\/content\/[^/]+/, ''));
  } else {
    paths.push(`/content${path}`);
  }
  return [...new Set(paths)].filter((p) => p.length > 1);
}

/**
 * Fetches a fragment page's .plain.html, trying its other path forms if the given one fails.
 * @param {string} path
 * @returns {Promise<{ resp: Response, path: string } | null>}
 */
async function fetchFragment(path) {
  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of fragmentPaths(path)) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(`${candidate}.plain.html`);
    if (resp.ok) return { resp, path: candidate };
  }
  return null;
}

export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    // eslint-disable-next-line no-param-reassign
    path = path.replace(/(\.plain)?\.html/, '');
    const found = await fetchFragment(path);
    const resp = found?.resp;
    // eslint-disable-next-line no-param-reassign
    if (found) path = found.path;
    if (resp?.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      // reset base path for media to fragment base
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      decorateMain(main);
      await loadSections(main);
      return main;
    }
  }
  return null;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) block.replaceChildren(...fragment.childNodes);
}
