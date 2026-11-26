/*
 * Table Block
 * Recreate a table
 * https://www.hlx.live/developer/block-collection/table
 * Authored in Universal Editor as Table (Columns: 2–7) with one Row item per table row.
 */
import { moveInstrumentation } from '../../scripts/scripts.js';

// Import content marks the column count and each row's type (`table-4-columns`,
// `table-col-4`). AEM never renders these, but local .plain.html content does.
const COLUMNS_MARKER = /^table-\d+-columns$/;
const ROW_MARKER = /^table-col-\d+$/;

function buildCell(rowIndex) {
  const cell = rowIndex ? document.createElement('td') : document.createElement('th');
  if (!rowIndex) cell.setAttribute('scope', 'col');
  return cell;
}

// Names the scroll region after the heading authored just above the table, if any.
function getLabel(block) {
  const prev = block.parentElement?.previousElementSibling;
  const headings = prev ? prev.querySelectorAll('h1, h2, h3, h4, h5, h6') : [];
  return headings.length ? headings[headings.length - 1].textContent.trim() : 'Table';
}

export default async function decorate(block) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const header = !block.classList.contains('no-header');
  if (header) table.append(thead);
  table.append(tbody);

  const rows = [...block.children].filter((child) => !(child.children.length === 1
    && COLUMNS_MARKER.test(child.textContent.trim())));

  rows.forEach((child, i) => {
    const row = document.createElement('tr');
    moveInstrumentation(child, row);
    if (header && i === 0) thead.append(row);
    else tbody.append(row);
    const cols = [...child.children];
    if (cols.length > 1 && ROW_MARKER.test(cols[0].textContent.trim())) cols.shift();
    cols.forEach((col) => {
      const cell = buildCell(header ? i : i + 1);
      moveInstrumentation(col, cell);
      cell.append(...col.childNodes);
      row.append(cell);
    });
  });

  // Keyboard users can reach and scroll the table when it overflows on mobile.
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', getLabel(block));
  block.tabIndex = 0;
  block.replaceChildren(table);
}
