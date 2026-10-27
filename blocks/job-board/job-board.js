import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Job Board (the Careers page): beside each other, the board's header (the heading, the search
 * box and its description; at the bottom the filter dropdowns) and the list of jobs (scrolling
 * within its own height); under them, a photo strip across the full width.
 * Rows (every property in its own cell, read by position):
 *   1. gallery image (+ alt)   2. no results message
 *   then the items, in any order (as imported, each row starts with its component id; AEM renders
 *   them without it, told apart by their cell count):
 *     Search (4 cells): heading | heading's second line | search placeholder | description
 *     Filters (5 cells): filters label | location label | locations (multifield) |
 *       department label | departments (multifield)
 *     Job (6 cells): title | department | location | description | apply link | apply label
 * A filter list left empty lists the jobs' own locations / departments instead. The search
 * matches every word typed in a job's title, department, location or description, and suggests
 * the matching roles under the box. The filters are checkbox dropdowns (several choices each,
 * with each choice's number of roles): the jobs in any chosen location (also "Mumbai, India" for
 * Mumbai) and of any chosen department. The choices are kept in the page address
 * (?q=…&location=…&location=…&department=…), so a filtered list can be shared.
 */

// the most jobs a board shows (the first ones in the content tree; the editor marks the others)
// and the longest text a field takes (the editor warns above it; longer texts are cut with "…")
export const MAX_JOBS = 15;
export const MAX_CHARS = 64;

const ANCHOR = 'open-roles'; // the board's id (the careers hero's button links to #open-roles)
const BLOCK_ROWS = 2;
const ITEM_KINDS = {
  'job-board-search': 'search', 'job-board-filters': 'filters', 'job-board-job': 'job',
};
const KIND_BY_CELLS = { 4: 'search', 5: 'filters', 6: 'job' };
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const PARAMS = { search: 'q', location: 'location', department: 'department' };
let boardId = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// a multifield's entries: one per list item / paragraph (one line: separated by semicolons)
function entries(cell) {
  if (!cell) return [];
  const items = [...cell.querySelectorAll('li, p')].map((n) => n.textContent.trim()).filter(Boolean);
  const list = items.length ? items : [text(cell)];
  return (list.length === 1 ? list[0].split(';') : list).map((v) => v.trim()).filter(Boolean);
}

// a text cut to MAX_CHARS characters, ending with "…"
const clip = (value) => (value.length > MAX_CHARS ? `${value.slice(0, MAX_CHARS - 1).trimEnd()}…` : value);

// the published page: the texts longer than MAX_CHARS cut (their full text as a tooltip); in the
// editor they stay whole (edited in place) and only the CSS shortens what doesn't fit
const CLIPPED = ['.job-board-heading span', '.job-board-filters-label', '.job-board-option-label',
  '.job-board-job-title', '.job-board-job-department', '.job-board-job-location',
  '.job-board-job-description', '.job-board-apply', '.job-board-empty'];
function clipTexts(root) {
  root.querySelectorAll(CLIPPED.join(', ')).forEach((node) => {
    const full = node.textContent.trim();
    if (full.length <= MAX_CHARS || node.children.length) return;
    node.textContent = clip(full);
    node.title = full;
  });
  root.querySelectorAll('input[placeholder]').forEach((input) => {
    input.placeholder = clip(input.placeholder);
  });
}

// for matching: lower case, without accents
const fold = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

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

// authoring: an editable field of the block or of the item it sits in (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

/*
 * The rows: the block's own properties, then its items sorted by kind, each kind in its authored
 * order. The authors may place the items in any order (jobs before the search or the filters…):
 * the board always renders the header (Search, then Filters) first, then the job list.
 */
function readRows(block) {
  const rows = [...block.children];
  const first = rows.findIndex((row) => ITEM_KINDS[text(row.firstElementChild)]);
  const start = first >= 0 && first < BLOCK_ROWS ? first : BLOCK_ROWS;
  const items = { search: [], filters: [], job: [] };
  rows.slice(start).forEach((row) => {
    let kind = ITEM_KINDS[text(row.firstElementChild)];
    if (kind) row.firstElementChild.remove();
    else kind = KIND_BY_CELLS[row.children.length] || 'job';
    items[kind].push(row);
  });
  return { props: rows.slice(0, start), items };
}

// the board's Search item: the heading (grey line, black line), the search box, the description
function buildSearch(row, id, authoring, level) {
  const [headingCell, emphasisCell, placeholderCell, descriptionCell] = row
    ? [...row.children] : [];
  const wrap = el('div', { class: 'job-board-search' });
  if (row) moveInstrumentation(row, wrap);
  if (authoring && wrap.dataset.aueResource) wrap.dataset.aueLabel = 'Search';
  let heading = null;
  if (text(headingCell) || text(emphasisCell)) {
    const first = text(headingCell) ? el('span', { class: 'job-board-heading-muted' }, text(headingCell)) : null;
    if (authoring) editable(first, 'heading', 'text', 'Heading');
    const second = text(emphasisCell) ? el('span', { class: 'job-board-heading-strong' }, text(emphasisCell)) : null;
    if (authoring) editable(second, 'headingEmphasis', 'text', 'Heading (second line)');
    heading = el(`h${level}`, { class: 'job-board-heading', id: `${id}-heading` }, first || '', second || '');
  }
  // the search box: a combobox with the matching roles suggested under it, and a clear button
  const input = el('input', {
    class: 'job-board-input job-board-search-input',
    id: `${id}-search`,
    type: 'search',
    name: 'q',
    placeholder: text(placeholderCell) || 'Search',
    autocomplete: 'off',
    enterkeyhint: 'search',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${id}-suggestions`,
    'aria-describedby': text(descriptionCell) ? `${id}-search-description` : undefined,
  });
  const clear = el('button', {
    type: 'button', class: 'job-board-clear', 'aria-label': 'Clear search', hidden: true,
  });
  const suggestions = el('ul', {
    class: 'job-board-suggestions', id: `${id}-suggestions`, role: 'listbox', 'aria-label': 'Suggested roles', hidden: true,
  });
  const description = text(descriptionCell)
    ? el('p', { class: 'job-board-description', id: `${id}-search-description` }, text(descriptionCell)) : null;
  if (authoring) editable(description, 'description', 'text', 'Description');
  wrap.append(
    heading || '',
    el(
      'div',
      { class: 'job-board-field job-board-search-field' },
      el('label', { class: 'job-board-label', for: input.id }, text(placeholderCell) || 'Search roles'),
      input,
      clear,
      suggestions,
    ),
    description || '',
  );
  return {
    wrap, input, clear, suggestions,
  };
}

/*
 * A filter dropdown: a button showing the chosen values (or the dropdown's label) that opens a
 * list of checkbox options, each with the number of roles it would show. Several can be chosen.
 * Keyboard: Enter / Space / arrows open it; in the list arrows move, Space / Enter (un)check,
 * Escape closes (the listbox pattern, with aria-activedescendant).
 */
function createDropdown(id, label, values) {
  const valueEl = el('span', { class: 'job-board-dropdown-value' }, label);
  const trigger = el('button', {
    type: 'button',
    class: 'job-board-input job-board-dropdown-trigger',
    id: `${id}-trigger`,
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
  }, valueEl);
  const list = el('ul', {
    class: 'job-board-options', id: `${id}-list`, role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': label, tabindex: '-1', hidden: true,
  });
  const options = values.map((value, i) => {
    const count = el('span', { class: 'job-board-option-count' });
    const node = el(
      'li',
      {
        class: 'job-board-option', id: `${id}-option-${i}`, role: 'option', 'aria-selected': 'false',
      },
      el('span', { class: 'job-board-checkbox', 'aria-hidden': 'true' }),
      el('span', { class: 'job-board-option-label' }, value),
      count,
    );
    list.append(node);
    return {
      value, key: fold(value), node, count,
    };
  });
  const root = el('div', { class: 'job-board-dropdown' }, trigger, list);
  const dropdown = {
    root, trigger, options, selected: new Set(), onChange: () => {}, onOpen: () => {},
  };
  let active = -1;

  const setActive = (i) => {
    options.forEach((o, j) => o.node.classList.toggle('is-active', j === i));
    active = i;
    if (options[i]) {
      list.setAttribute('aria-activedescendant', options[i].node.id);
      options[i].node.scrollIntoView({ block: 'nearest' });
    } else list.removeAttribute('aria-activedescendant');
  };
  // the button's text: the chosen values' first parts ("Bangalore, India" → Bangalore)
  dropdown.render = () => {
    const chosen = options.filter((o) => dropdown.selected.has(o.key));
    options.forEach((o) => o.node.setAttribute('aria-selected', String(dropdown.selected.has(o.key))));
    const shown = chosen.map((o) => o.value.split(',')[0].trim()).join(', ');
    valueEl.textContent = shown || label;
    trigger.classList.toggle('has-value', !!shown);
    trigger.setAttribute('aria-label', `${label}: ${shown || 'all'}`);
  };
  dropdown.isOpen = () => !list.hidden;
  dropdown.open = (at = 'selected') => {
    if (!options.length) return;
    dropdown.onOpen(dropdown);
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    const first = options.findIndex((o) => dropdown.selected.has(o.key));
    setActive(at === 'last' ? options.length - 1 : Math.max(first, 0));
    list.focus();
  };
  dropdown.close = (focusTrigger) => {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    setActive(-1);
    if (focusTrigger) trigger.focus();
  };
  const toggle = (i) => {
    const option = options[i];
    if (!option) return;
    if (dropdown.selected.has(option.key)) dropdown.selected.delete(option.key);
    else dropdown.selected.add(option.key);
    dropdown.render();
    dropdown.onChange();
  };

  trigger.addEventListener('click', () => (dropdown.isOpen() ? dropdown.close(true) : dropdown.open()));
  trigger.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      dropdown.open(e.key === 'ArrowUp' ? 'last' : 'selected');
    }
  });
  list.addEventListener('keydown', (e) => {
    const moves = {
      ArrowDown: Math.min(active + 1, options.length - 1),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: options.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dropdown.close(true);
    } else if (e.key === 'Tab') dropdown.close();
  });
  options.forEach((o, i) => o.node.addEventListener('click', () => {
    setActive(i);
    toggle(i);
  }));
  // (a click anywhere else, or the focus leaving it, closes it)
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target)) dropdown.close();
  });
  root.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !root.contains(e.relatedTarget)) dropdown.close();
  });
  dropdown.render();
  return dropdown;
}

// the board's Filters item: its label with "Clear all", and the two dropdowns (a list the
// authors haven't filled: the jobs' own values, in their order)
function buildFilters(row, id, authoring, fallback) {
  const [labelCell, locationLabelCell, locationsCell, departmentLabelCell, departmentsCell] = row
    ? [...row.children] : [];
  const wrap = el('div', { class: 'job-board-filters', role: 'group' });
  if (row) moveInstrumentation(row, wrap);
  if (authoring && wrap.dataset.aueResource) wrap.dataset.aueLabel = 'Filters';
  const label = el('p', { class: 'job-board-filters-label', id: `${id}-filters` }, text(labelCell));
  wrap.setAttribute('aria-labelledby', label.id);
  if (authoring) editable(label, 'filterLabel', 'text', 'Filters label');
  const clear = el('button', { type: 'button', class: 'job-board-clear-all', hidden: true }, 'Clear all');
  const locations = entries(locationsCell);
  const departments = entries(departmentsCell);
  const location = createDropdown(`${id}-location`, text(locationLabelCell) || 'Locations', locations.length ? locations : fallback.locations);
  const department = createDropdown(`${id}-department`, text(departmentLabelCell) || 'Departments', departments.length ? departments : fallback.departments);
  wrap.append(
    el('div', { class: 'job-board-filters-head' }, label, clear),
    location.root,
    department.root,
  );
  return {
    wrap, clear, location, department,
  };
}

function buildJob(row, authoring, level) {
  const [titleCell, departmentCell, locationCell, descriptionCell, linkCell, labelCell] = [
    ...row.children];
  const item = el('li', { class: 'job-board-job' });
  moveInstrumentation(row, item);
  const title = text(titleCell);
  if (authoring && item.dataset.aueResource) item.dataset.aueLabel = `Job: ${title || 'Untitled'}`;
  const heading = el(`h${level + 1}`, { class: 'job-board-job-title' }, title);
  if (authoring) editable(heading, 'title', 'text', 'Job title');
  const department = text(departmentCell);
  const locations = entries(locationCell);
  const departmentEl = department ? el('span', { class: 'job-board-job-department' }, department) : null;
  if (authoring) editable(departmentEl, 'department', 'text', 'Department');
  const locationEl = locations.length
    ? el('span', { class: 'job-board-job-location' }, locations.join('; ')) : null;
  if (authoring) editable(locationEl, 'location', 'text', 'Job location');
  const meta = departmentEl || locationEl
    ? el(
      'p',
      { class: 'job-board-job-meta' },
      departmentEl || '',
      // (the dot wraps with the location, never left at the end of a line)
      locationEl ? el(
        'span',
        { class: 'job-board-job-place' },
        departmentEl ? el('span', { class: 'job-board-job-dot', 'aria-hidden': 'true' }, '•') : '',
        locationEl,
      ) : '',
    ) : null;
  const description = text(descriptionCell)
    ? el('p', { class: 'job-board-job-description' }, text(descriptionCell)) : null;
  if (authoring) editable(description, 'description', 'text', 'Job description');
  const link = linkCell?.querySelector('a[href]');
  const href = link?.getAttribute('href') || text(linkCell);
  let apply = null;
  if (href) {
    const label = text(labelCell) || 'Apply now';
    apply = el('a', {
      class: 'job-board-apply',
      href,
      'aria-label': title ? `${label}: ${title}` : undefined,
    }, label);
    if (link) moveInstrumentation(link, apply);
    if (authoring) editable(apply, 'applyLabel', 'text', 'Apply button label');
  }
  item.append(el('div', { class: 'job-board-job-main' }, heading, meta || '', description || ''), apply || '');
  return {
    item,
    values: { title, department, locations },
    department: fold(department),
    locations: locations.map(fold),
    words: fold([title, department, locations.join(' '), text(descriptionCell)].join(' ')),
  };
}

export default function decorate(block) {
  boardId += 1;
  const id = `job-board-${boardId}`;
  const authoring = isAuthoring();
  const { props, items } = readRows(block);
  const [galleryRow, emptyRow] = props;
  // the heading: the page's main heading (h1) unless the page has one already (e.g. the careers
  // hero above the board); the job titles one level below it
  const level = document.querySelector('main h1') ? 2 : 1;

  // the board's fixed structure, filled by kind whatever the authored order: the header (left
  // column: Search, then Filters), the job list (right column), then the photo strip
  const aside = el('div', { class: 'job-board-aside' });
  const results = el('div', { class: 'job-board-results' });

  // the jobs: the first MAX_JOBS; the editor shows the others too, dimmed, with a note (they
  // aren't on the published page)
  const jobs = items.job.slice(0, MAX_JOBS).map((row) => buildJob(row, authoring, level));
  const extra = authoring ? items.job.slice(MAX_JOBS).map((row) => {
    const job = buildJob(row, authoring, level);
    job.item.classList.add('is-over-limit');
    if (job.item.dataset.aueResource) job.item.dataset.aueLabel = `${job.item.dataset.aueLabel} (over the ${MAX_JOBS}-job limit: not shown)`;
    return job;
  }) : [];
  // (the header with the jobs' values for any filter list left empty; only the first Search and
  // Filters are used)
  const unique = (values) => [...new Map(values.map((v) => [fold(v), v])).values()];
  const search = buildSearch(items.search[0], id, authoring, level);
  const filters = buildFilters(items.filters[0], id, authoring, {
    locations: unique(jobs.flatMap((j) => j.values.locations)),
    departments: unique(jobs.map((j) => j.values.department).filter(Boolean)),
  });
  aside.append(search.wrap, filters.wrap);

  // the list (its own scrolling area, reachable by keyboard), the number of jobs shown (read out
  // by screen readers), the no results message
  const list = el('ul', { class: 'job-board-list', 'aria-label': 'Open roles', tabindex: '0' }, ...jobs.map((j) => j.item), ...extra.map((j) => j.item));
  const count = el('p', { class: 'job-board-count', role: 'status', 'aria-live': 'polite' });
  const empty = el('p', { class: 'job-board-empty', hidden: true }, text(emptyRow) || 'No roles match your search.');
  if (authoring) {
    editable(empty, 'emptyMessage', 'text', 'No results message');
    empty.hidden = !!jobs.length; // (shown in the editor while there are no jobs)
  }
  const limitNote = extra.length ? el('p', { class: 'job-board-limit-note', role: 'note' }, `This board shows up to ${MAX_JOBS} jobs: the last ${extra.length === 1 ? 'one (dimmed) isn’t' : `${extra.length} (dimmed) aren’t`} shown on the published page.`) : null;
  results.append(limitNote || '', count, list, empty);
  // (the id: the target of the careers hero's #open-roles button and of links to the job list)
  const board = el('section', {
    class: 'job-board-board',
    id: document.getElementById(ANCHOR) ? undefined : ANCHOR,
    'aria-labelledby': search.wrap.querySelector('.job-board-heading') ? `${id}-heading` : undefined,
  }, aside, results);

  // the photo strip under the board
  const image = rowImage(galleryRow);
  let gallery = null;
  if (image) {
    const pic = createOptimizedPicture(image.src, image.alt, false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]);
    pic.className = 'job-board-gallery-image';
    const img = pic.querySelector('img');
    moveInstrumentation(image.source, img);
    if (authoring) editable(img, 'gallery', 'media', 'Gallery image');
    gallery = el('div', { class: 'job-board-gallery' }, pic);
  }

  block.replaceChildren(...[board, gallery].filter(Boolean));
  if (!authoring) clipTexts(block);
  // opened with the board's anchor (…/careers#open-roles): the browser couldn't jump there before
  // the board was built
  if (!authoring && board.id && window.location.hash === `#${board.id}`) {
    requestAnimationFrame(() => board.scrollIntoView({ block: 'start' }));
  }

  // filtering: every typed word somewhere in the job; in one of the chosen locations (if any)
  // and of one of the chosen departments (if any)
  const { location, department } = filters;
  const inPlace = (job, place) => job.locations
    .some((l) => l === place || l.startsWith(`${place},`));
  const words = () => fold(search.input.value).split(/\s+/).filter(Boolean);
  // (skip: one filter left out, for its own options' counts)
  const matches = (job, query, skip) => query.every((w) => job.words.includes(w))
    && (skip === location || !location.selected.size
      || [...location.selected].some((place) => inPlace(job, place)))
    && (skip === department || !department.selected.size
      || department.selected.has(job.department));
  const apply = () => {
    const query = words();
    let shown = 0;
    jobs.forEach((job) => {
      const match = matches(job, query);
      job.item.hidden = !match;
      if (match) shown += 1;
    });
    count.textContent = `${shown} ${shown === 1 ? 'role' : 'roles'}`;
    if (!authoring || jobs.length) empty.hidden = shown > 0;
    list.hidden = !shown && !authoring;
    // each option's count: the roles it would show with the search and the other filter
    location.options.forEach((o) => {
      const n = jobs.filter((job) => matches(job, query, location) && inPlace(job, o.key)).length;
      o.count.textContent = n;
      o.node.classList.toggle('is-empty', !n);
    });
    department.options.forEach((o) => {
      const n = jobs.filter((job) => matches(job, query, department) && job.department === o.key)
        .length;
      o.count.textContent = n;
      o.node.classList.toggle('is-empty', !n);
    });
    filters.clear.hidden = !location.selected.size && !department.selected.size;
    search.clear.hidden = !search.input.value;
  };
  const remember = () => {
    if (authoring) return; // (the editor's page address is left alone)
    const url = new URL(window.location.href);
    const q = search.input.value.trim();
    if (q) url.searchParams.set(PARAMS.search, q);
    else url.searchParams.delete(PARAMS.search);
    [[PARAMS.location, location], [PARAMS.department, department]].forEach(([param, dropdown]) => {
      url.searchParams.delete(param);
      dropdown.options.filter((o) => dropdown.selected.has(o.key))
        .forEach((o) => url.searchParams.append(param, o.value));
    });
    window.history.replaceState(window.history.state, '', url);
  };
  const update = () => {
    apply();
    remember();
  };

  // the search's suggestions: the roles shown for what is typed (each once), up to six; choosing
  // one searches for its title
  let suggested = [];
  let activeSuggestion = -1;
  const setSuggestion = (i) => {
    [...search.suggestions.children].forEach((n, j) => {
      n.classList.toggle('is-active', j === i);
      n.setAttribute('aria-selected', String(j === i));
    });
    activeSuggestion = i;
    if (i >= 0) search.input.setAttribute('aria-activedescendant', `${id}-suggestion-${i}`);
    else search.input.removeAttribute('aria-activedescendant');
  };
  const closeSuggestions = () => {
    search.suggestions.hidden = true;
    search.input.setAttribute('aria-expanded', 'false');
    setSuggestion(-1);
  };
  const showSuggestions = () => {
    const query = words();
    const seen = new Set();
    suggested = query.length ? jobs.filter((job) => {
      const key = [job.values.title, job.values.department, job.values.locations.join(';')].join('|');
      if (!matches(job, query) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6) : [];
    search.suggestions.replaceChildren(...suggested.map((job, i) => el(
      'li',
      {
        class: 'job-board-suggestion', id: `${id}-suggestion-${i}`, role: 'option', 'aria-selected': 'false',
      },
      el('span', { class: 'job-board-suggestion-title' }, clip(job.values.title)),
      el('span', { class: 'job-board-suggestion-meta' }, [job.values.department, job.values.locations.join('; ')].filter(Boolean).map(clip).join(' · ')),
    )));
    search.suggestions.hidden = !suggested.length;
    search.input.setAttribute('aria-expanded', String(!!suggested.length));
    setSuggestion(suggested.length ? 0 : -1);
  };
  const choose = (i) => {
    const job = suggested[i];
    if (!job) return;
    search.input.value = job.values.title;
    closeSuggestions();
    update();
  };
  search.input.addEventListener('input', () => {
    update();
    showSuggestions();
  });
  search.input.addEventListener('keydown', (e) => {
    const open = !search.suggestions.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) showSuggestions();
      else {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSuggestion((activeSuggestion + step + suggested.length) % suggested.length);
      }
    } else if (e.key === 'Enter' && open && activeSuggestion >= 0) {
      e.preventDefault();
      choose(activeSuggestion);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeSuggestions();
    }
  });
  search.input.addEventListener('blur', closeSuggestions);
  // (pressing a suggestion keeps the focus in the search box)
  search.suggestions.addEventListener('mousedown', (e) => e.preventDefault());
  search.suggestions.addEventListener('click', (e) => {
    const node = e.target.closest('.job-board-suggestion');
    if (node) choose([...search.suggestions.children].indexOf(node));
  });
  search.clear.addEventListener('click', () => {
    search.input.value = '';
    closeSuggestions();
    update();
    search.input.focus();
  });

  // the dropdowns: one open at a time; "Clear all" unchecks both
  [location, department].forEach((dropdown) => {
    dropdown.onChange = update;
    dropdown.onOpen = (opening) => {
      closeSuggestions();
      [location, department].filter((d) => d !== opening).forEach((d) => d.close());
    };
  });
  filters.clear.addEventListener('click', () => {
    [location, department].forEach((dropdown) => {
      dropdown.selected.clear();
      dropdown.render();
      dropdown.close();
    });
    update();
    location.trigger.focus();
  });

  // the choices from the page address (a filter's values only when they are its options)
  if (!authoring) {
    const params = new URLSearchParams(window.location.search);
    search.input.value = params.get(PARAMS.search) || '';
    [[PARAMS.location, location], [PARAMS.department, department]].forEach(([param, dropdown]) => {
      params.getAll(param).forEach((value) => {
        const option = dropdown.options.find((o) => o.key === fold(value));
        if (option) dropdown.selected.add(option.key);
      });
      dropdown.render();
    });
  }
  apply();
}
