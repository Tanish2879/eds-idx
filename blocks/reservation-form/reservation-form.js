import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Reservation Form: a car image (left half; phones: a banner on top) beside a form on black:
 * heading, description, the form's fields, a button and a privacy disclaimer.
 * Rows (every property in its own cell, read by position):
 *   1. image (+ alt)   2. heading   3. description   4. button text   5. send-to URL
 *   6. confirmation message   7. privacy disclaimer   8. contact email (mailto: link + its text)
 *   9. privacy notice link (+ its text)
 *   then the items, in order:
 *     Form Section (1 cell): its name; groups the fields after it, up to the next section
 *     (as imported, each item row starts with its component id, see below)
 *     Form Field (7 cells): label | field name | type (text, tel, email, select) | required |
 *       width (full, half) | fixed prefix (e.g. +91) | dropdown options (one per line)
 * The form posts its values as JSON ({ data: { … } }) to the send-to URL, then shows the
 * confirmation message in its place; without a URL it only shows the message.
 */

const BLOCK_ROWS = 9;
const ITEM_KINDS = { 'reservation-form-section': 'section', 'reservation-form-field': 'field' };
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const SEND_ERROR = 'Sorry, that didn’t go through. Please try again.';
const DESIGN_FACE = /new[\s-]*science/i; // the design's typeface family (see the CSS)
let formId = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const text = (cell) => (cell?.textContent || '').trim();

// a multi-line plain-text value: its lines (paragraphs, or line breaks within the text)
function lines(cell) {
  if (!cell) return [];
  const paragraphs = [...cell.querySelectorAll('p, li')];
  const raw = paragraphs.length ? paragraphs.map((p) => p.textContent) : cell.textContent.split('\n');
  return raw.map((l) => l.trim()).filter(Boolean);
}

/*
 * The image of a row: an <img>, or a link to an image file. AEM delivers an image reference it
 * can't resolve (an asset that isn't in AEM Assets yet) as a plain link; placeholder images under
 * a /drafts/ folder are then loaded from the copy in this repository.
 */
function rowImage(row) {
  const img = row?.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...(row?.querySelectorAll('a[href]') || [])]
    .find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return { src: drafts > 0 ? pathname.slice(drafts) : link.href, alt: '', source: link };
}

// "First Name" → "firstName"
function keyOf(label) {
  const words = label.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  return words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('') || 'field';
}

// browser autofill hints for the usual reservation fields
function autocompleteOf(type, key) {
  if (type === 'email') return 'email';
  if (type === 'tel') return 'tel-national';
  if (/^first|given/i.test(key)) return 'given-name';
  if (/^last|family|surname/i.test(key)) return 'family-name';
  if (/city|town/i.test(key)) return 'address-level2';
  return undefined;
}

// the parts of a Form Field row
function parseField(row, index) {
  const [
    labelCell, nameCell, typeCell, requiredCell, widthCell, prefixCell, optionsCell,
  ] = [...row.children];
  const label = text(labelCell);
  const type = ['tel', 'email', 'select'].includes(text(typeCell)) ? text(typeCell) : 'text';
  return {
    row,
    label,
    key: text(nameCell) || keyOf(label || `field ${index + 1}`),
    type,
    required: text(requiredCell) === 'true',
    half: text(widthCell) === 'half',
    prefix: text(prefixCell),
    // one per line, or (a single line) separated by commas
    options: ((l) => (l.length === 1 ? l[0].split(',').map((o) => o.trim()).filter(Boolean) : l))(lines(optionsCell)),
  };
}

// authoring: marks an element as an editable field of the block (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

function buildField(field, id, authoring) {
  const wrap = el('div', { class: `reservation-form-field${field.half ? ' is-half' : ''}${field.prefix ? ' has-prefix' : ''}` });
  moveInstrumentation(field.row, wrap);
  if (authoring && wrap.dataset.aueResource) wrap.dataset.aueLabel = `Field: ${field.label || field.key}`;
  const shown = `${field.label}${field.required ? '*' : ''}`;
  // the label is read out by screen readers; the design shows it inside the field
  wrap.append(el('label', { class: 'reservation-form-label', for: id }, field.label || field.key));
  if (field.prefix) wrap.append(el('span', { class: 'reservation-form-prefix', 'aria-hidden': 'true' }, field.prefix));
  const common = {
    id,
    name: field.key,
    required: field.required,
    autocomplete: autocompleteOf(field.type, field.key),
    'aria-describedby': field.prefix ? `${id}-prefix` : undefined,
  };
  let control;
  if (field.type === 'select') {
    control = el(
      'select',
      { ...common, class: 'reservation-form-input' },
      el('option', { value: '' }, shown),
      ...field.options.map((option) => el('option', { value: option }, option)),
    );
  } else {
    control = el('input', {
      ...common,
      class: 'reservation-form-input',
      type: field.type,
      placeholder: shown,
      inputmode: field.type === 'tel' ? 'tel' : undefined,
      pattern: field.type === 'tel' ? '[0-9 ]{6,15}' : undefined,
    });
  }
  wrap.append(control);
  if (field.prefix) wrap.append(el('span', { id: `${id}-prefix`, class: 'reservation-form-label' }, `Prefix ${field.prefix}`));
  return wrap;
}

// the disclaimer text with its email addresses as links, and the privacy notice link in place of
// its text when the text contains it; returns whether the link was placed in the text
function fillDisclaimer(target, value, privacy) {
  const pattern = new RegExp(`(${EMAIL.source})${privacy ? `|(${privacy.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})` : ''}`, 'g');
  let last = 0;
  let placed = false;
  [...value.matchAll(pattern)].forEach((m) => {
    target.append(value.slice(last, m.index));
    if (m[1]) target.append(el('a', { href: `mailto:${m[1]}` }, m[1]));
    else if (!placed) {
      target.append(el('a', { href: privacy.href }, m[0]));
      placed = true;
    } else target.append(m[0]);
    last = m.index + m[0].length;
  });
  target.append(value.slice(last));
  return placed;
}

export default function decorate(block) {
  formId += 1;
  const uid = `reservation-form-${formId}`;
  const authoring = isAuthoring();
  const rows = [...block.children];
  const [imageRow, headingRow, descriptionRow, submitRow, actionRow, successRow, disclaimerRow,
    emailRow, privacyRow] = rows;
  const items = rows.slice(BLOCK_ROWS);

  // image (the page's largest element: loaded first)
  const media = el('div', { class: 'reservation-form-media' });
  const image = rowImage(imageRow);
  if (image) {
    const picture = createOptimizedPicture(image.src, image.alt || text(imageRow), true, [{ media: '(min-width: 768px)', width: '1200' }, { width: '750' }]);
    const img = picture.querySelector('img');
    img.setAttribute('fetchpriority', 'high');
    moveInstrumentation(image.source, img);
    if (authoring) editable(img, 'image', 'media', 'Car image');
    media.append(picture);
  }

  // heading, description
  const panel = el('div', { class: 'reservation-form-panel' });
  if (text(headingRow)) {
    const heading = el('h1', { class: 'reservation-form-heading' }, text(headingRow));
    if (authoring) editable(heading, 'heading', 'text', 'Heading');
    panel.append(heading);
  }
  const description = lines(descriptionRow);
  if (description.length) {
    const p = el('p', { class: 'reservation-form-description' }, description.join('\n'));
    if (authoring) editable(p, 'description', 'text', 'Description');
    panel.append(p);
  }

  // the form: its sections (fieldsets) with their fields, then the button
  const form = el('form', { class: 'reservation-form-form', novalidate: true });
  let group = null;
  let index = 0;
  items.forEach((row) => {
    // an item row may start with its component id (as imported: AEM's content import picks the
    // item's model by it); AEM renders the items without it, told apart by their cell count
    let kind = ITEM_KINDS[text(row.firstElementChild)];
    if (kind) row.firstElementChild.remove();
    else kind = row.children.length <= 1 ? 'section' : 'field';
    if (kind === 'section') {
      // Form Section
      const title = text(row);
      group = el('fieldset', { class: 'reservation-form-section' });
      moveInstrumentation(row, group);
      if (title) {
        const legend = el('legend', { class: 'reservation-form-label' }, title);
        if (authoring) editable(legend, 'title', 'text', 'Section name');
        group.append(legend);
      }
      if (authoring && group.dataset.aueResource) group.dataset.aueLabel = `Section: ${title || 'Form Section'}`;
      form.append(group);
      return;
    }
    // Form Field (fields before any section get a group of their own)
    if (!group) {
      group = el('div', { class: 'reservation-form-section' });
      form.append(group);
    }
    group.append(buildField(parseField(row, index), `${uid}-${index}`, authoring));
    index += 1;
  });
  // the same field name twice would send one value only: later ones get a number
  const seen = new Map();
  form.querySelectorAll('[name]').forEach((control) => {
    const n = seen.get(control.name) || 0;
    seen.set(control.name, n + 1);
    if (n) control.name = `${control.name}${n + 1}`;
  });
  const submit = el('button', { type: 'submit', class: 'reservation-form-submit' }, text(submitRow) || 'Submit');
  if (authoring) editable(submit, 'submitLabel', 'text', 'Button text');
  const status = el('p', { class: 'reservation-form-status', role: 'status', 'aria-live': 'polite' });
  form.append(submit, status);
  panel.append(form);

  // privacy disclaimer: its text (email addresses in it become links), then the contact email and
  // the privacy notice link, each ending its sentence ("… anytime at privacy@… . Full Privacy
  // Notice."); the notice link replaces its text instead when the disclaimer contains it
  const disclaimer = text(disclaimerRow);
  const linkOf = (row) => {
    const a = row?.querySelector('a[href]');
    return a ? { href: a.getAttribute('href'), text: a.textContent.trim(), source: a } : null;
  };
  const email = linkOf(emailRow);
  if (email) email.text ||= email.href.replace(/^mailto:/i, '');
  const privacy = linkOf(privacyRow);
  if (privacy) privacy.text ||= 'Privacy Notice';
  if (disclaimer || email || privacy) {
    const small = el('p', { class: 'reservation-form-disclaimer' });
    let placed = false;
    if (disclaimer) {
      // (its own span when links follow it: authoring edits only the text itself in place)
      const own = email || privacy ? el('span') : small;
      placed = fillDisclaimer(own, disclaimer, privacy);
      if (authoring) editable(own, 'disclaimer', 'text', 'Privacy disclaimer');
      if (own !== small) small.append(own);
    }
    if (email) {
      const a = el('a', { href: email.href }, email.text);
      moveInstrumentation(email.source, a);
      small.append(disclaimer ? ' ' : '', a, '.');
    }
    if (privacy && !placed) {
      const a = el('a', { href: privacy.href }, privacy.text);
      moveInstrumentation(privacy.source, a);
      small.append(disclaimer || email ? ' ' : '', a, '.');
    }
    panel.append(small);
  }

  block.replaceChildren(media, panel);

  // the design's faces (New Science, from the platform stylesheet) replace the fallbacks once
  // loaded; the heading's fallback spacing is then dropped
  document.fonts.ready.then(() => {
    const loaded = [...document.fonts]
      .some((face) => DESIGN_FACE.test(face.family) && face.status === 'loaded');
    block.classList.toggle('has-design-faces', loaded);
  });

  // sending
  const action = text(actionRow);
  const success = lines(successRow).join('\n');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (authoring) return; // nothing is sent from the editor
    status.textContent = '';
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = {};
    form.querySelectorAll('[name]').forEach((control) => {
      const prefix = control.parentElement.querySelector('.reservation-form-prefix')?.textContent;
      data[control.name] = prefix && control.value ? `${prefix} ${control.value.trim()}` : control.value.trim();
    });
    submit.disabled = true;
    try {
      if (action) {
        const res = await fetch(action, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
      }
      // kept for this tab: a confirmation page fills its {firstName}, {email}, … from it
      try {
        sessionStorage.setItem('jsw-reservation', JSON.stringify(data));
      } catch (err) { /* no storage (private mode) */ }
      // the confirmation takes the form's place
      const done = el('p', { class: 'reservation-form-success', tabindex: '-1', role: 'status' }, success || 'Thank you.');
      form.replaceWith(done);
      done.focus({ preventScroll: true });
    } catch (err) {
      status.textContent = SEND_ERROR;
      submit.disabled = false;
    }
  });
}
