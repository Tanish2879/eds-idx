import { loadCSS } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Spec Table — one row per spec (Label, Value), rendered as a definition list.
 * With the Showcase style (Style field) in a Light section, the section becomes the Code T
 * "by the numbers" screen: spec-table-showcase.js/.css, loaded only then. Awaited, so the
 * section is set up before the page's section snap starts.
 * @param {Element} block
 */
export default async function decorate(block) {
  const list = document.createElement('dl');
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const item = document.createElement('div');
    moveInstrumentation(row, item);
    [[label, 'dt'], [value, 'dd']].forEach(([cell, tag]) => {
      const el = document.createElement(tag);
      if (cell) {
        moveInstrumentation(cell, el);
        el.append(...cell.childNodes);
      }
      item.append(el);
    });
    list.append(item);
  });
  block.replaceChildren(list);

  const section = block.closest('.section.light');
  if (!section?.querySelector('.spec-table.showcase')) return;
  const [{ default: decorateShowcase }] = await Promise.all([
    import('./spec-table-showcase.js'),
    loadCSS(`${window.hlx.codeBasePath}/blocks/spec-table/spec-table-showcase.css`),
  ]);
  decorateShowcase(section);
}
