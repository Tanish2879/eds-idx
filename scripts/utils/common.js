// Common utility functions shared across blocks and scripts.
//
// Includes helpers for reading placeholders.json sheets and general-purpose utilities.

/**
 * Fetches a placeholders sheet and returns it as a { key: value } map.
 * Placeholders are optional, so a fetch failure resolves to an empty map rather
 * than throwing.
 * @param {string} [prefix] Optional sheet path prefix, e.g. '/some/folder'.
 *   Defaults to the site root. The file is always `${prefix}/placeholders.json`.
 * @returns {Promise<Object>} Map of placeholder keys to their values.
 */
export async function fetchPlaceholders(prefix = '') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${window.hlx.codeBasePath}${prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) return resp.json();
          return {};
        })
        .then((json) => {
          const placeholders = {};
          (json.data || []).forEach((row) => {
            if (row.key) {
              placeholders[row.key] = row.value;
            }
          });
          resolve(placeholders);
        })
        .catch(() => {
          // placeholders are optional — never let a fetch failure break callers
          resolve({});
        });
    });
  }
  return window.placeholders[prefix];
}

/**
 * Reads a single placeholder value by key.
 * @param {string} key The placeholder key to look up.
 * @param {string} [prefix] Optional sheet path prefix (see fetchPlaceholders).
 * @returns {Promise<string|undefined>} The value, or undefined if not found.
 */
export async function getPlaceholder(key, prefix = '') {
  const placeholders = await fetchPlaceholders(prefix);
  return placeholders[key];
}

/**
 * True inside Universal Editor: its data-aue-* instrumentation is only in the
 * markup there. Use it for anything that depends on that markup.
 * @returns {boolean}
 */
export function inEditor() {
  return !!document.querySelector('[data-aue-resource]');
}

/**
 * True for anyone authoring: in Universal Editor, on the AEM author host, or
 * with ?editor=true / ?ue=true. Use it to show authors hints (e.g. an empty
 * block's placeholder) instead of hiding things.
 * @returns {boolean}
 */
export function onAuthor() {
  return inEditor()
    || window.location.hostname.includes('adobeaemcloud.com')
    || window.location.search.includes('editor=true')
    || window.location.search.includes('ue=true');
}

/**
 * Reads a link's href and text from an authored block cell.
 * @param {Element} cell
 * @returns {{ text: string, href: string }}
 */
export function cellLink(cell) {
  if (!cell) return { text: '', href: '' };
  const a = cell.querySelector('a');
  const text = (a ? a.textContent : cell.textContent).trim();
  const href = a ? (a.getAttribute('href') || '').trim() : '';
  return { text, href };
}

/**
 * Reads a link href or text content from an authored block cell.
 * @param {Element} cell
 * @returns {string}
 */
export function cellVal(cell) {
  const { text, href } = cellLink(cell);
  return href || text;
}

/**
 * Reads a multi-value field's authored cell. Multi-value fields (e.g. a
 * `multi: true` text or aem-tag field) may serialise as separate <p>/<li>
 * nodes or as a single delimited string; this handles both.
 * @param {Element} cell
 * @returns {string[]} the individual values, trimmed and with empties removed
 */
export function cellMultiVal(cell) {
  if (!cell) return [];
  const els = [...cell.querySelectorAll('p, li')];
  const raw = els.length ? els.map((el) => el.textContent) : cell.textContent.split(/[\n,]/);
  return raw.map((t) => t.trim()).filter(Boolean);
}

/**
 * Reads and removes a container block's own settings. The backend serialises
 * a block's model fields as leading single-cell rows, in model order, before
 * the child item rows (which always carry one cell per item field). Settings
 * are edited in the properties panel, so the rows are removed from the
 * display DOM once read.
 * @param {Element} block
 * @param {number} count how many settings fields the block's model has — at
 *   most this many rows are consumed, so a child row is never mistaken for one
 * @returns {Element[]} the settings cells, in model order (may be fewer than
 *   `count` for content authored before a field existed)
 */
export function consumeSettingsRows(block, count) {
  const cells = [];
  while (cells.length < count
    && block.firstElementChild
    && block.firstElementChild.children.length === 1) {
    cells.push(block.firstElementChild.firstElementChild);
    block.firstElementChild.remove();
  }
  return cells;
}

/**
 * Reads a "View all" link field: a real link, or a bare path typed as plain
 * text. Anything else means the field wasn't authored.
 * @param {Element} cell the field's cell (or row)
 * @param {string} [label] authored "View All Label" override
 * @returns {{ href: string, text: string }|null}
 */
export function readViewAll(cell, label) {
  const { href, text } = cellLink(cell);
  if (href) return { href, text: label || text || 'View all' };
  if (text.startsWith('/') || text.startsWith('http')) return { href: text, text: label || 'View all' };
  return null;
}
