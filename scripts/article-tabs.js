// Shared tabs for the article listing blocks (blog-listing, article-carousel):
// parses the authored "Tab" item rows and builds the ARIA tab bar. Each block
// passes its own class names, so its markup and CSS stay as they are.

import { moveInstrumentation } from './scripts.js';
import { cellVal, cellMultiVal } from './utils/common.js';

/**
 * Parses the block's remaining child rows into tabs (label, root, tags). Every
 * row is kept — a tab just added in Universal Editor starts empty, and
 * dropping it would remove its element (and instrumentation) so the new tab
 * would vanish from the editor. The source row is kept so its instrumentation
 * can move onto the rendered tab button.
 * @param {Element} block
 * @returns {{ label: string, root: string, tags: string, row: Element|null }[]}
 *   a single default "All" tab when the block has no rows yet
 */
export function parseTabRows(block) {
  const tabs = [...block.children].map((row) => {
    const [labelCell, rootCell, tagsCell] = [...row.children];
    return {
      label: labelCell ? labelCell.textContent.trim() : '',
      root: rootCell ? cellVal(rootCell) : '',
      tags: tagsCell ? cellMultiVal(tagsCell).join(',') : '',
      row,
    };
  });
  if (!tabs.length) {
    tabs.push({
      label: 'All', root: '', tags: '', row: null,
    });
  }
  return tabs;
}

/**
 * Builds an ARIA tab bar (role="tablist") with roving tabindex, click and
 * keyboard selection (Arrow keys, Home, End). The bar is always rendered, even
 * for one tab, so every authored tab keeps an element carrying its Universal
 * Editor instrumentation; blocks hide a single-tab bar via `singleClass`.
 * @param {ReturnType<typeof parseTabRows>} tabs
 * @param {Object} opts
 * @param {string} opts.listClass class(es) for the tablist element
 * @param {string} [opts.singleClass] class added when there is only one tab
 * @param {string} [opts.buttonClass] class for each tab button
 * @param {string} [opts.controls] id of the panel the tabs control (aria-controls)
 * @param {(index: number) => void} opts.onSelect called when another tab is selected
 * @returns {{ element: HTMLElement, buttons: HTMLButtonElement[] }}
 */
export function buildTabBar(tabs, {
  listClass, singleClass, buttonClass, controls, onSelect,
}) {
  const element = document.createElement('div');
  element.className = listClass;
  if (singleClass && tabs.length === 1) element.classList.add(singleClass);
  element.setAttribute('role', 'tablist');

  let active = 0;
  const buttons = tabs.map((tab, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (buttonClass) btn.className = buttonClass;
    // empty just-added tabs still need a visible, selectable label in the editor
    btn.textContent = tab.label || 'New Tab';
    btn.setAttribute('role', 'tab');
    if (controls) btn.setAttribute('aria-controls', controls);
    btn.setAttribute('aria-selected', String(i === 0));
    btn.tabIndex = i === 0 ? 0 : -1;
    // componentOf() reads this for component.position on the filter ctaClick —
    // without it, the whole tab bar has no position of its own and falls back
    // to the block's shared section index.
    btn.dataset.ctaPosition = String(i + 1);
    if (tab.row) moveInstrumentation(tab.row, btn);
    element.append(btn);
    return btn;
  });

  const select = (index, focus = false) => {
    if (index !== active) {
      active = index;
      buttons.forEach((b, i) => {
        b.setAttribute('aria-selected', String(i === index));
        b.tabIndex = i === index ? 0 : -1;
      });
      onSelect(index);
    }
    if (focus) buttons[index].focus();
  };

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => select(i));
    btn.addEventListener('keydown', (e) => {
      const target = {
        ArrowRight: (i + 1) % tabs.length,
        ArrowDown: (i + 1) % tabs.length,
        ArrowLeft: (i - 1 + tabs.length) % tabs.length,
        ArrowUp: (i - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[e.key];
      if (target === undefined) return;
      e.preventDefault();
      select(target, true);
    });
  });

  return { element, buttons };
}
