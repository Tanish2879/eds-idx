import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, isAuthoring } from '../../scripts/scripts.js';

/*
 * Reservation Form: a car image (left half; phones: a banner on top) beside a form on black:
 * heading, description, the form's fields, a button and a privacy disclaimer.
 * Rows (every property in its own cell, read by position):
 *   1. background image (+ alt)   2. heading   3. description   4. button text   5. send-to URL
 *   6. privacy disclaimer (an email address in it becomes a mailto: link)
 *   7. privacy notice link (+ its text)
 *   price card (over the image): 8. amount label   9. amount (rupees)   10. badge   11. note
 *   payment (Razorpay): 12. payment service URL   13. name in the payment window   14. page after
 *   the form is sent (and paid)   15. page after a failed payment
 *   pending state: 16. its editor preview (true: the editor shows the pending view in the form's
 *   place, its texts edited in place; never on the site)   17. pending title
 *   18. pending description
 *   then the fields, in order (the block's direct children):
 *     Form Field (3 cells): label | field name | required; its kind follows its name (see kindOf)
 *     Dropdown Field (4 cells): label | field name | required | options (a multifield)
 *     (as imported, each item row starts with its component id, see below)
 * The Razorpay Key ID (public) is not authored: it is the block's configuration, CONFIG
 * (blocks/reservation-form/config.json: { "razorpayKeyId": "rzp_live_…" }); the Key Secret is
 * never in it (only in the payment service). Without a Key ID the form posts its values as JSON
 * ({ data: { … } }) to the send-to URL, then goes to the success page. With a Key ID it takes the
 * reservation amount with Razorpay (see payment.js), then goes to the success page (the values,
 * with the payment's, are posted to the send-to URL first) or the failure page; a cancelled
 * payment stays on the form. The pages read the values from this tab's storage.
 */

// (a placeholder's address from before the JSW pages moved under /jsw, /drafts/<page>/...: its
// file is now in /drafts/jsw/<page>/)
const LEGACY_DRAFTS = /^\/drafts\/(?!jsw\/)/;

const BLOCK_ROWS = 18;
// (the next pages without authored ones: the JSW pages', under /jsw)
const SUCCESS_PAGE = '/jsw/confirmation';
const FAILURE_PAGE = '/jsw/payment-failed';
const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]+$/; // Razorpay's public Key ID
const CONFIG = '/blocks/reservation-form/config.json'; // the block's configuration (the Key ID)
const STORED = 'jsw-reservation'; // the form's data for the next pages (sessionStorage)
const ITEM_KINDS = {
  'reservation-form-section': 'section', 'reservation-form-field': 'field', 'reservation-form-dropdown': 'dropdown',
};
const PHONE_PREFIX = '+91'; // the box before a phone number field (Indian mobile numbers)
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const SEND_ERROR = 'Sorry, that didn’t go through. Please try again.';
const PAY_CANCELLED = 'The payment was cancelled. You can try again whenever you’re ready.';
const PAY_UNAVAILABLE = 'Sorry, the payment couldn’t be started. Please check your connection and try again.';
const PENDING_HEADING = 'Processing your reservation';
// the longest text each kind of field takes (its maxLength in the model): button and link texts
// (and the amount label), the heading (the design's one line in the display face), titles and
// other short texts, descriptions
const MAX_LABEL = 30;
const MAX_HEADING = 40;
const MAX_SHORT = 64;
const MAX_LONG = 200;
const LOGO_MARK = 'jsw-logo-mark'; // the pending view's mark: icons/jsw-logo-mark.svg
const PENDING_TEXT = 'Please wait while we process your request.';
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
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

/*
 * The Razorpay Key ID from the block's configuration: '' without one (no file, or no Key ID in
 * it: the form is sent without a payment); a configuration that can't be loaded fails (the
 * payment can't be started), so a reservation is never sent unpaid by mistake. Only a Key ID
 * (rzp_test_… / rzp_live_…) is used: anything else, e.g. a Key Secret by mistake, is not.
 */
let configLoading = null;
function loadKeyId() {
  configLoading ||= fetch(`${window.hlx?.codeBasePath || ''}${CONFIG}`)
    .then((res) => {
      if (res.status === 404) return {};
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    })
    .then((config) => {
      const keyId = String(config?.razorpayKeyId || '').trim();
      if (keyId && !KEY_ID.test(keyId)) {
        // eslint-disable-next-line no-console
        console.warn(`reservation-form: ${CONFIG}'s razorpayKeyId isn't a Key ID (rzp_test_… / rzp_live_…): not used, the form is sent without a payment`);
      }
      return KEY_ID.test(keyId) ? keyId : '';
    })
    .catch((err) => {
      configLoading = null; // (tried again on the next submit)
      throw err;
    });
  return configLoading;
}

// the JSW mark's SVG markup (fetched once, when a payment starts; empty if it can't be loaded)
let logoMarkup = null;
function loadLogoMark() {
  logoMarkup ||= fetch(`${window.hlx?.codeBasePath || ''}/icons/${LOGO_MARK}.svg`)
    .then((res) => (res.ok ? res.text() : ''))
    .catch(() => '');
  return logoMarkup;
}

// the mark injected inline in its box (decorative: the view's text says what is happening)
async function injectLogoMark(box) {
  const markup = await loadLogoMark();
  if (!markup || box.firstElementChild) return;
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  if (svg.nodeName !== 'svg') return;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  box.append(document.importNode(svg, true));
}

/*
 * An authored text within its field's limit: a longer one (content from before the limits, or
 * imported) is cut with "…" on the page, with a warning for the authors; in the editor it stays
 * whole (edited in place: a cut text would be saved cut) and only the CSS shortens what doesn't fit
 */
function fit(value, limit, field) {
  if (!value || value.length <= limit) return value;
  const authoring = isAuthoring();
  // eslint-disable-next-line no-console
  console.warn(`reservation-form: the ${field} has ${value.length} characters, more than its ${limit}${authoring ? '' : ': cut with "…"'}`);
  return authoring ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

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
  return { src: drafts > 0 ? `${window.hlx?.codeBasePath || ''}${pathname.slice(drafts).replace(LEGACY_DRAFTS, '/drafts/jsw/')}` : link.href, alt: '', source: link };
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

// a list value (the Options multifield): its entries, one per paragraph / list item / line, or
// separated by commas when delivered as one line
function entries(cell) {
  const l = lines(cell);
  return l.length === 1 ? l[0].split(',').map((o) => o.trim()).filter(Boolean) : l;
}

/*
 * A Form Field's kind follows its name (or label): an email address, a mobile / phone number
 * (with the PHONE_PREFIX box) or text; first and last name sit side by side (half width).
 */
function kindOf(key, label) {
  const name = `${key} ${label}`;
  if (/e-?mail/i.test(name)) return 'email';
  if (/mobile|phone|\btel\b/i.test(name)) return 'tel';
  return 'text';
}
const isNamePart = (key, label) => /^(first|last|given|family|sur)/i.test(key)
  || /\b(first|last|given|family)\s*name\b|\bsurname\b/i.test(label);

/*
 * Validation and sanitisation of the reservation fields before the data is sent. Each rule
 * cleans the value first (that cleaned value is checked and sent), then returns an error message,
 * or '' when the value is valid. The fields they apply to are always required.
 *   name    first / last name: trimmed; 2–50 characters of letters, spaces, hyphens, apostrophes
 *   mobile  spaces, dashes and parentheses removed; 10 digits, optionally after a + country code
 *   email   lower-cased; name@domain.tld without any whitespace
 */
const NAME_CHARS = /^(?=.*\p{L})[\p{L}\p{M} '’-]+$/u; // letters (any script), space, - and ' (or ’)
const MOBILE_NUMBER = /^(\+\d{1,3})?\d{10}$/;
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGES = {
  required: 'Please fill in this field.',
  nameLength: 'Please enter between 2 and 50 characters.',
  nameChars: 'Please use letters only (spaces, hyphens and apostrophes are allowed).',
  mobile: 'Please enter a 10-digit mobile number (a leading + with the country code is allowed).',
  email: 'Please enter a valid email address without spaces, e.g. name@example.com.',
};
const RULES = {
  name: {
    clean: (raw) => raw.trim(),
    check: (value) => {
      if (!value) return MESSAGES.required;
      if (value.length < 2 || value.length > 50) return MESSAGES.nameLength;
      return NAME_CHARS.test(value) ? '' : MESSAGES.nameChars;
    },
  },
  mobile: {
    clean: (raw) => raw.replace(/[\s()-]/g, ''),
    check: (value) => {
      if (!value) return MESSAGES.required;
      return MOBILE_NUMBER.test(value) ? '' : MESSAGES.mobile;
    },
  },
  email: {
    clean: (raw) => raw.toLowerCase(),
    check: (value) => {
      if (!value) return MESSAGES.required;
      return /\s/.test(value) || !EMAIL_ADDRESS.test(value) ? MESSAGES.email : '';
    },
  },
};

// a field's rule (by its kind), or null
function ruleOf(type, key, label) {
  if (type === 'email') return 'email';
  if (type === 'tel') return 'mobile';
  if (type === 'text' && isNamePart(key, label)) return 'name';
  return null;
}

/*
 * Checks a control against its rule (or, without one, only whether a required field is filled):
 * shows / clears the message in the field's error line (announced by screen readers, the field
 * marked aria-invalid), and returns the cleaned value. No HTML / browser validation is used.
 */
function validate(control) {
  const rule = RULES[control.dataset.rule];
  const value = rule ? rule.clean(control.value) : control.value.trim();
  let message = rule ? rule.check(value) : '';
  if (!rule && !value && control.dataset.required === 'true') message = MESSAGES.required;
  const error = document.getElementById(`${control.id}-error`);
  if (error) error.textContent = message;
  if (message) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
  return { value, message };
}

// the parts of a Form Field row (label | field name | required) or of a Dropdown Field row
// (label | field name | required | options); rows of the earlier 7-property field model
// (label | name | type | required | width | prefix | options) are still read
function parseField(row, index, kind) {
  const cells = [...row.children];
  const legacy = kind !== 'dropdown' && cells.length >= 7;
  const [labelCell, nameCell] = cells;
  const label = text(labelCell);
  const key = text(nameCell) || keyOf(label || `field ${index + 1}`);
  if (legacy) {
    const [, , typeCell, requiredCell, widthCell, prefixCell, optionsCell] = cells;
    const type = ['tel', 'email', 'select'].includes(text(typeCell)) ? text(typeCell) : 'text';
    return {
      row,
      label,
      key,
      type,
      required: text(requiredCell) === 'true',
      half: text(widthCell) === 'half',
      prefix: text(prefixCell),
      options: entries(optionsCell),
      rule: ruleOf(type, key, label),
    };
  }
  const required = text(cells[2]) === 'true';
  if (kind === 'dropdown') {
    return {
      row, label, key, type: 'select', required, half: false, prefix: '', options: entries(cells[3]), rule: null,
    };
  }
  const type = kindOf(key, label);
  return {
    row,
    label,
    key,
    type,
    required,
    half: type === 'text' && isNamePart(key, label),
    prefix: type === 'tel' ? PHONE_PREFIX : '',
    options: [],
    rule: ruleOf(type, key, label),
  };
}

// an amount in rupees ("10000", "₹10,000"), or 0
function rupees(value) {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// sessionStorage, where available (not in some private modes)
function store(data) {
  try {
    sessionStorage.setItem(STORED, JSON.stringify(data));
  } catch (err) { /* no storage */ }
}

// authoring: marks an element as an editable field of the block (resource inherited)
function editable(node, prop, type, label) {
  if (node) Object.assign(node.dataset, { aueProp: prop, aueType: type, aueLabel: label });
}

function buildField(field, id, authoring) {
  const wrap = el('div', { class: `field${field.half ? ' is-half' : ''}${field.prefix ? ' has-prefix' : ''}` });
  moveInstrumentation(field.row, wrap);
  if (authoring && wrap.dataset.aueResource) wrap.dataset.aueLabel = `${field.type === 'select' ? 'Dropdown' : 'Field'}: ${field.label || field.key}`;
  const required = field.required || Boolean(field.rule); // (the rules' fields are required)
  const label = fit(field.label, MAX_SHORT, `field label "${field.label.slice(0, 24)}…"`);
  const shown = `${label}${required ? '*' : ''}`;
  // the label is read out by screen readers; the design shows it inside the field
  wrap.append(el('label', { class: 'label', for: id }, label || field.key));
  if (field.prefix) wrap.append(el('span', { class: 'prefix', 'aria-hidden': 'true' }, field.prefix));
  // (no HTML validation attributes: the block checks the fields itself, see validate)
  const common = {
    id,
    name: field.key,
    'data-rule': field.rule || undefined,
    'data-required': required ? 'true' : undefined,
    'aria-required': required ? 'true' : undefined,
    autocomplete: autocompleteOf(field.type, field.key),
    'aria-describedby': [field.prefix ? `${id}-prefix` : '', `${id}-error`].filter(Boolean).join(' '),
  };
  let control;
  if (field.type === 'select') {
    control = el(
      'select',
      { ...common, class: 'input' },
      el('option', { value: '' }, shown),
      ...field.options.map((option) => el('option', { value: option }, fit(option, MAX_SHORT, 'dropdown choice'))),
    );
  } else {
    // (an email field is a text input with the email keyboard: type=email would bring the
    // browser's own checks and trimming)
    const email = field.type === 'email';
    control = el('input', {
      ...common,
      class: 'input',
      type: email ? 'text' : field.type,
      placeholder: shown,
      inputmode: { tel: 'tel', email: 'email' }[field.type],
      autocapitalize: email ? 'off' : undefined,
      spellcheck: email ? 'false' : undefined,
    });
  }
  wrap.append(control);
  // the field's error line (empty while valid)
  wrap.append(el('p', { class: 'error', id: `${id}-error`, 'aria-live': 'polite' }));
  if (field.rule || required) {
    // checked when the field is left (a dropdown: when changed); once flagged, re-checked as it
    // is corrected
    control.addEventListener(field.type === 'select' ? 'change' : 'blur', () => validate(control));
    control.addEventListener('input', () => {
      if (control.hasAttribute('aria-invalid')) validate(control);
    });
  }
  if (field.prefix) wrap.append(el('span', { id: `${id}-prefix`, class: 'label' }, `Prefix ${field.prefix}`));
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
  const [backgroundRow, headingRow, descriptionRow, submitRow, actionRow, disclaimerRow,
    privacyRow, amountLabelRow, amountRow, badgeRow, noteRow, serviceRow,
    merchantRow, successPageRow, failurePageRow, pendingPreviewRow, pendingHeadingRow,
    pendingDescriptionRow] = rows;
  // (content imported before the price card and payment rows: its items start earlier, at the
  // first row naming an item's component)
  const first = rows.findIndex((row) => ITEM_KINDS[text(row.firstElementChild)]);
  const items = rows.slice(first >= 0 && first < BLOCK_ROWS ? first : BLOCK_ROWS);
  const prop = (row) => (items.includes(row) ? undefined : row);

  // image (the page's largest element: loaded first)
  const media = el('div', { class: 'media' });
  const image = rowImage(backgroundRow);
  if (image) {
    const picture = createOptimizedPicture(image.src, image.alt || text(backgroundRow), true, [{ media: '(min-width: 768px)', width: '1200' }, { width: '750' }]);
    const img = picture.querySelector('img');
    img.setAttribute('fetchpriority', 'high');
    moveInstrumentation(image.source, img);
    if (authoring) editable(img, 'background', 'media', 'Background Image');
    media.append(picture);
  }

  // the price card over the image: label (and badge), the amount, the note
  const amount = rupees(text(prop(amountRow)));
  const amountLabel = fit(text(prop(amountLabelRow)), MAX_LABEL, 'amount label');
  const displayAmount = amount ? INR.format(amount) : '';
  if (amount) {
    const label = el('p', { class: 'price-label' }, amountLabel);
    if (authoring) editable(label, 'amountLabel', 'text', 'Amount label');
    const badge = text(prop(badgeRow))
      ? el('span', { class: 'price-badge' }, fit(text(badgeRow), MAX_LABEL, 'amount badge')) : null;
    if (authoring) editable(badge, 'amountBadge', 'text', 'Amount badge');
    const note = fit(lines(prop(noteRow)).join(' '), MAX_LONG, 'amount note');
    const noteEl = note ? el('p', { class: 'price-note' }, note) : null;
    if (authoring) editable(noteEl, 'amountNote', 'text', 'Amount note');
    media.append(el(
      'div',
      { class: 'price' },
      el('div', { class: 'price-head' }, label, badge),
      el('p', { class: 'price-amount' }, displayAmount),
      noteEl,
    ));
  }

  // heading, description
  const panel = el('div', { class: 'panel' });
  if (text(headingRow)) {
    const heading = el('h1', { class: 'heading' }, fit(text(headingRow), MAX_HEADING, 'heading'));
    if (authoring) editable(heading, 'heading', 'text', 'Heading');
    panel.append(heading);
  }
  const description = lines(descriptionRow);
  if (description.length) {
    const p = el('p', { class: 'description' }, fit(description.join('\n'), MAX_LONG, 'description'));
    if (authoring) editable(p, 'description', 'text', 'Description');
    panel.append(p);
  }

  // the form: its fields (the block's own children, in one grid), then the button; a Form
  // Section row of content from before the fields were flattened is left out
  const form = el('form', { class: 'form', novalidate: true });
  const group = el('div', { class: 'field-group' });
  form.append(group);
  let index = 0;
  items.forEach((row) => {
    // an item row may start with its component id (as imported: AEM's content import picks the
    // item's model by it); AEM renders the items without it, told apart by their cell count
    let kind = ITEM_KINDS[text(row.firstElementChild)];
    if (kind) row.firstElementChild.remove();
    else if (row.children.length <= 1) kind = 'section';
    else kind = row.children.length === 4 ? 'dropdown' : 'field';
    if (kind === 'section') return;
    group.append(buildField(parseField(row, index, kind), `${uid}-${index}`, authoring));
    index += 1;
  });
  // the same field name twice would send one value only: later ones get a number
  const seen = new Map();
  form.querySelectorAll('[name]').forEach((control) => {
    const n = seen.get(control.name) || 0;
    seen.set(control.name, n + 1);
    if (n) control.name = `${control.name}${n + 1}`;
  });
  const submit = el('button', { type: 'submit', class: 'submit' }, fit(text(submitRow), MAX_LABEL, 'button text') || 'Submit');
  if (authoring) editable(submit, 'submitLabel', 'text', 'Button text');
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  form.append(submit, status);
  panel.append(form);

  // privacy disclaimer: its text (email addresses in it become mailto: links), then the privacy
  // notice link ending its sentence ("… anytime at privacy@…. Full Privacy Notice."); the notice
  // link replaces its text instead when the disclaimer contains it
  // (zero-width spaces taken out: the import puts one after an email's @, see the importer)
  const disclaimer = fit(text(disclaimerRow).replace(/\u200b/g, ''), MAX_LONG, 'disclaimer');
  const linkOf = (row) => {
    const a = row?.querySelector('a[href]');
    return a ? { href: a.getAttribute('href'), text: a.textContent.trim(), source: a } : null;
  };
  const privacy = linkOf(privacyRow);
  if (privacy) privacy.text = fit(privacy.text || 'Privacy Notice', MAX_LABEL, 'privacy link text');
  if (disclaimer || privacy) {
    const small = el('p', { class: 'disclaimer' });
    let placed = false;
    if (disclaimer) {
      // (its own span when links follow it: authoring edits only the text itself in place)
      const own = privacy ? el('span') : small;
      placed = fillDisclaimer(own, disclaimer, privacy);
      if (authoring) editable(own, 'disclaimer', 'text', 'Privacy disclaimer');
      if (own !== small) small.append(own);
    }
    if (privacy && !placed) {
      const a = el('a', { href: privacy.href }, privacy.text);
      moveInstrumentation(privacy.source, a);
      small.append(disclaimer ? ' ' : '', a, '.');
    }
    panel.append(small);
  }

  block.replaceChildren(media, panel);

  // the design's faces (New Science, from the platform stylesheet) replace the fallbacks once
  // loaded; the heading's fallback spacing is then dropped (checked again whenever fonts finish
  // loading: the faces only start loading once the block's text is laid out)
  const detectFaces = () => {
    const loaded = [...document.fonts]
      .some((face) => DESIGN_FACE.test(face.family) && face.status === 'loaded');
    block.classList.toggle('has-design-faces', loaded);
  };
  document.fonts.ready.then(detectFaces);
  document.fonts.addEventListener('loadingdone', detectFaces);

  // sending
  const action = text(actionRow);
  const send = (data) => fetch(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout?.(10000),
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status}`);
  });
  const pageOf = (row, fallback) => prop(row)?.querySelector('a[href]')?.getAttribute('href')
    || text(prop(row)) || fallback;
  const payment = {
    keyId: '', // (from the block's configuration, on sending: see loadKeyId)
    service: text(prop(serviceRow)),
    amount,
    displayAmount,
    merchant: fit(text(prop(merchantRow)), MAX_SHORT, 'merchant name') || 'JSW Motors',
    description: amountLabel || 'Reservation amount',
    successPage: pageOf(successPageRow, SUCCESS_PAGE),
    failurePage: pageOf(failurePageRow, FAILURE_PAGE),
  };
  if (!authoring) loadKeyId().catch(() => {}); // (ready by the time the form is sent)
  const ready = () => {
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
  };

  /*
   * The pending view: in the form's place (as tall, so nothing else moves; the block marked
   * is-pending) from the moment the payment is submitted until the next page opens: the JSW mark
   * with a light sweeping across it, the pending heading and text. In the editor, with its preview
   * on, it is shown in the form's place, the heading and text edited in place (the block's own
   * fields: the block's resource)
   */
  const pendingDescription = fit(lines(prop(pendingDescriptionRow)).join('\n'), MAX_LONG, 'pending description');
  const pendingTitle = el('p', { class: 'status-title' }, fit(text(prop(pendingHeadingRow)), MAX_SHORT, 'pending title') || PENDING_HEADING);
  const pendingText = el('p', { class: 'status-text' }, pendingDescription || PENDING_TEXT);
  if (authoring) {
    editable(pendingTitle, 'pendingHeading', 'text', 'Pending title');
    editable(pendingText, 'pendingDescription', 'text', 'Pending description');
  }
  const pending = el(
    'div',
    {
      class: 'pending-view', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true', tabindex: '-1',
    },
    el('span', { class: 'logo', 'aria-hidden': 'true' }),
    pendingTitle,
    pendingText,
  );
  const showPending = (focus = true) => {
    if (pending.isConnected) return;
    pending.style.setProperty('--form-height', `${form.offsetHeight}px`);
    injectLogoMark(pending.querySelector('.logo'));
    form.replaceWith(pending);
    block.classList.add('is-pending');
    if (focus) pending.focus({ preventScroll: true });
  };
  const hidePending = () => {
    if (pending.isConnected) pending.replaceWith(form);
    block.classList.remove('is-pending');
  };
  payment.onPending = showPending;
  // the editor's preview of the pending state (its Pending tab), never on the site
  if (authoring && text(prop(pendingPreviewRow)) === 'true') showPending(false);
  // the next page (the authored Confirmation / Failure page)
  const go = (page) => {
    showPending();
    window.location.href = page;
  };
  // back on the form from the next page (the browser's back button restores it as it was left)
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    hidePending();
    ready();
  });

  /*
   * The payment, once the form is valid: Razorpay's window (see payment.js), the pending view
   * once it is submitted, then
   *   paid       the success page (the values with the payment's sent to the send-to URL first)
   *   failed     the failure page (declined, or the payment couldn't be verified)
   *   cancelled  (the window closed) / unavailable (no connection): a message on the form
   */
  async function takePayment(data) {
    loadLogoMark(); // (the pending view's mark, ready by the time it shows)
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    store(data);
    let result;
    try {
      const { default: pay } = await import('./payment.js');
      result = await pay(payment, data);
    } catch (err) {
      result = { state: 'unavailable' };
    }
    const { paymentId = '', orderId = '' } = result;
    if (result.state === 'paid') {
      const paid = {
        ...data, paymentId, orderId, paymentStatus: result.verified ? 'verified' : 'unverified',
      };
      store(paid);
      // (the payment is taken: the success page follows even when sending the lead fails)
      showPending();
      if (action) await send(paid).catch(() => {});
      go(payment.successPage);
    } else if (result.state === 'failed') {
      store({
        ...data, paymentId, orderId, paymentStatus: 'failed', failureReason: result.reason, failureCode: result.code,
      });
      go(payment.failurePage);
    } else {
      status.classList.toggle('is-info', result.state === 'cancelled');
      status.textContent = result.state === 'cancelled' ? PAY_CANCELLED : PAY_UNAVAILABLE;
      ready();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (authoring) return; // nothing is sent from the editor
    status.textContent = '';
    status.classList.remove('is-info');
    // every field cleaned and checked (see RULES): with any problem, each one is shown under its
    // field, the first gets the focus, and nothing is sent
    const results = new Map([...form.querySelectorAll('[name]')].map((c) => [c, validate(c)]));
    const invalid = [...results].find(([, r]) => r.message);
    if (invalid) {
      invalid[0].focus();
      return;
    }
    // the cleaned values; a mobile number without its own + country code gets the prefix box's
    const data = {};
    results.forEach(({ value }, control) => {
      const prefix = control.parentElement.querySelector('.prefix')?.textContent;
      data[control.name] = prefix && value && !value.startsWith('+') ? `${prefix}${value}` : value;
    });
    submit.disabled = true;
    try {
      payment.keyId = await loadKeyId();
    } catch (err) {
      status.textContent = PAY_UNAVAILABLE;
      submit.disabled = false;
      return;
    }
    if (payment.keyId) {
      takePayment(data);
      return;
    }
    try {
      if (action) await send(data);
      // kept for this tab: the confirmation page fills its {firstName}, {email}, … from it
      store(data);
      go(payment.successPage);
    } catch (err) {
      status.textContent = SEND_ERROR;
      submit.disabled = false;
    }
  });
}
