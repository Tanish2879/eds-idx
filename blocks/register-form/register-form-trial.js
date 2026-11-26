// Register Form "Trial" style, loaded by register-form.js only when the style is used; it
// renders the whole block (register-form.js returns straight after calling it). The dealer
// "Get in touch" request, as in the design:
//   the heading (the second line, after a line break, in grey), two tabs and the dealer map;
//   "Book a test drive": When works for you? (date + slot), then Tell us about you (Back and
//     Review request);
//   "Get a quote": Tell us about you (Continue).
// Authored rows are read in model order (_register-form.json); the map uses Map Address and
// Map Pop-up Name, over the Decorative Image as its fallback.
//
// Adding states: write a step builder (see buildSlotStep), register it in STEPS and list it
// in a journey's steps in JOURNEYS. The last step of a journey calls onComplete with the
// collected values; it is the hook for the states still to come.

import { fetchPlaceholders } from '../../scripts/utils/common.js';

const DIAL_CODE = '+91'; // India only, as the default form
const MOBILE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^\p{L}+$/u; // letters only, any script
const NAME_MAX = '50';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IMAGE_RE = /\.(avif|gif|jpe?g|png|webp)([?#]|$)/i;
const SLOT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ANCHORS = { 'test-drive': 'test-drive', quote: 'quote' };

// authored rows, in model order
const ROW = {
  image: 0,
  heading: 1,
  consent: 2,
  notice: 3,
  redirect: 4,
  requestSent: 5,
  mapName: 6,
  mapAddress: 7,
};

// [placeholder key, fallback text]
const TEXT = {
  tabs: ['registerFormTrialTabs', 'Request type'],
  heading: ['registerFormTrialHeading', 'Get in touch with'],
  continue: ['registerFormTrialContinue', 'Continue'],
  review: ['registerFormTrialReview', 'Review request'],
  back: ['registerFormTrialBack', 'Back'],
  slotTitle: ['registerFormTrialSlotTitle', 'When works for you?'],
  date: ['registerFormTrialDate', 'Date'],
  dateRequired: ['registerFormTrialDateRequired', 'Select a date'],
  datePast: ['registerFormTrialDatePast', 'Choose today or a later date'],
  slots: ['registerFormTrialSlots', 'Available slots'],
  slotRequired: ['registerFormTrialSlotRequired', 'Select a time slot'],
  aboutTitle: ['registerFormTrialAbout', 'Tell us about you'],
  firstName: ['registerFormTrialFirstName', 'First Name*'],
  firstNameLabel: ['registerFormTrialFirstNameLabel', 'First name'],
  firstNameRequired: ['registerFormTrialFirstNameRequired', 'First name required'],
  firstNameInvalid: ['registerFormTrialFirstNameInvalid', 'Enter a valid first name'],
  firstNameShort: ['registerFormTrialFirstNameShort', 'First name must be at least 3 characters'],
  lastName: ['registerFormTrialLastName', 'Last Name*'],
  lastNameLabel: ['registerFormTrialLastNameLabel', 'Last name'],
  lastNameRequired: ['registerFormTrialLastNameRequired', 'Last name required'],
  lastNameInvalid: ['registerFormTrialLastNameInvalid', 'Enter a valid last name'],
  email: ['registerFormTrialEmail', 'Email Address (optional)'],
  emailLabel: ['registerFormTrialEmailLabel', 'Email address (optional)'],
  emailInvalid: ['registerFormTrialEmailInvalid', 'Enter a valid email address'],
  mobile: ['registerFormTrialMobile', 'Mobile Number*'],
  mobileLabel: ['registerFormTrialMobileLabel', 'Mobile number, India (+91)'],
  mobileRequired: ['registerFormTrialMobileRequired', 'Mobile number required'],
  mobileInvalid: ['registerFormTrialMobileInvalid', 'Enter a 10-digit mobile number'],
  updates: ['registerFormTrialUpdates', 'Keep me updated about JSW Motors news (optional)'],
  consent: ['registerFormTrialConsent', 'By continuing you agree that {dealer} and JSW Motors may contact you about this request.'],
  dealer: ['registerFormTrialDealer', 'the dealer'],
  mapTitle: ['registerFormTrialMapTitle', 'Map'],
  mapOpen: ['registerFormTrialMapOpen', 'Open in Google Maps'],
};

// the journeys the tabs switch between: their steps in order, and each step's buttons
const JOURNEYS = {
  'test-drive': {
    tab: ['registerFormTrialTestDrive', 'Book a test drive'],
    steps: [
      { step: 'slot', next: TEXT.continue },
      { step: 'details', next: TEXT.review, back: true },
    ],
  },
  quote: {
    tab: ['registerFormTrialQuote', 'Get a quote'],
    steps: [
      { step: 'details', next: TEXT.continue },
    ],
  },
};

let instances = 0;

// Builds elements without innerHTML, so authored strings are never parsed as markup.
// true renders an empty attribute; false/null/undefined skip it.
function createEl(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === false || value == null) return;
    node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.filter((child) => child != null));
  return node;
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const slotLabel = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;

/* ---------- authored content ---------- */

function readImage(cell) {
  if (!cell) return null;
  const pic = cell.querySelector('picture') || cell.querySelector('img');
  if (pic) return pic;
  // a DAM reference can arrive as a link to the image
  const link = cell.querySelector('a[href]');
  const href = link?.getAttribute('href') || '';
  if (!IMAGE_RE.test(href)) return null;
  const alt = link.textContent.trim();
  return createEl('img', { src: href, alt: alt === href ? '' : alt, loading: 'lazy' });
}

function readAuthored(block) {
  const rows = [...block.children];
  const cell = (i) => rows[i]?.querySelector(':scope > div') || rows[i] || null;
  const text = (i) => cell(i)?.textContent.trim() || '';
  const filled = (i) => (text(i) ? cell(i) : null);
  const headingCell = cell(ROW.heading);
  const intro = headingCell?.querySelector('p');
  return {
    image: readImage(cell(ROW.image)),
    heading: headingCell?.querySelector('h1, h2, h3, h4, h5, h6') || null,
    intro: intro?.textContent.trim() ? intro : null,
    consent: filled(ROW.consent),
    notice: filled(ROW.notice),
    redirect: cell(ROW.redirect)?.querySelector('a[href]')?.getAttribute('href') || text(ROW.redirect),
    requestSent: filled(ROW.requestSent),
    map: { name: text(ROW.mapName), address: text(ROW.mapAddress) },
  };
}

/* ---------- shared field helpers ---------- */

// shows or clears a control's error: text plus aria-invalid / aria-describedby
function setError(control, msgEl, message) {
  const entry = control.closest('.entry, .group');
  entry?.classList.toggle('has-error', !!message);
  msgEl.textContent = message || '';
  if (message) {
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', msgEl.id);
  } else {
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
  }
}

// a text input with a visually hidden label and its error line
function textEntry(uid, name, {
  label, placeholder, ...attrs
}) {
  const id = `${uid}-${name}`;
  const control = createEl('input', {
    class: 'control', id, name, placeholder, ...attrs,
  });
  const msg = createEl('p', { class: 'msg', id: `${id}-msg` });
  const el = createEl(
    'div',
    { class: 'entry' },
    createEl('label', { class: 'visually-hidden', for: id }, label),
    control,
    msg,
  );
  return { el, control, msg };
}

// strips what a field can't hold as it's typed or pasted
function sanitize(control, clean) {
  control.addEventListener('input', () => {
    const cleaned = clean(control.value);
    if (cleaned !== control.value) control.value = cleaned;
  });
}

// validate on blur once touched; clear the error as soon as the value is valid
function wireValidation(entries) {
  entries.forEach(({ control, msg, check }) => {
    let touched = false;
    control.addEventListener('focus', () => { touched = true; });
    control.addEventListener('blur', () => {
      if (touched) setError(control, msg, check());
    });
    control.addEventListener('input', () => {
      if (control.getAttribute('aria-invalid') && !check()) setError(control, msg, '');
    });
  });
}

// runs every check, shows every error, returns the first invalid control (or null)
function validateAll(entries) {
  let first = null;
  entries.forEach(({ control, msg, check }) => {
    const message = check();
    setError(control, msg, message);
    if (message && !first) first = control;
  });
  return first;
}

/* ---------- steps ---------- */

/**
 * When works for you?: the date and the time slots (past slots of today are disabled).
 * @returns {{el: Element, validate: Function, values: Function, reset: Function}}
 */
function buildSlotStep({ uid, t }) {
  const now = new Date();
  const today = isoDate(now);
  const lastHour = SLOT_HOURS[SLOT_HOURS.length - 1];
  // after the last slot, the first bookable day is tomorrow
  const first = new Date(now);
  if (now.getHours() >= lastHour) first.setDate(first.getDate() + 1);

  const date = createEl('input', {
    class: 'control date-control',
    type: 'date',
    id: `${uid}-date`,
    name: 'date',
    min: today,
    value: isoDate(first),
    required: true,
  });
  const dateMsg = createEl('p', { class: 'msg', id: `${uid}-date-msg` });

  const slotInputs = SLOT_HOURS.map((hour) => createEl('input', {
    class: 'slot-input',
    type: 'radio',
    name: 'slot',
    id: `${uid}-slot-${hour}`,
    value: `${pad(hour)}:00`,
    'data-hour': hour,
  }));
  const slotsMsg = createEl('p', { class: 'msg', id: `${uid}-slots-msg` });
  const slotsGroup = createEl(
    'fieldset',
    { class: 'group slots-group' },
    createEl('legend', { class: 'group-label' }, t(TEXT.slots)),
    createEl('div', { class: 'slots' }, ...slotInputs.map((input) => createEl(
      'label',
      { class: 'slot', for: input.id },
      input,
      createEl('span', { class: 'slot-text' }, slotLabel(Number(input.dataset.hour))),
    ))),
    slotsMsg,
  );

  const titleId = `${uid}-slot-title`;
  const el = createEl(
    'section',
    { class: 'step', 'data-step': 'slot', 'aria-labelledby': titleId },
    createEl('h3', { class: 'step-title', id: titleId, tabindex: '-1' }, t(TEXT.slotTitle)),
    createEl(
      'div',
      { class: 'group' },
      createEl('label', { class: 'group-label', for: date.id }, t(TEXT.date)),
      date,
      dateMsg,
    ),
    slotsGroup,
  );

  const checkedSlot = () => slotInputs.find((input) => input.checked) || null;

  // today: the hours already started can't be booked
  const updateSlots = () => {
    const isToday = date.value === isoDate(new Date());
    const hourNow = new Date().getHours();
    slotInputs.forEach((input) => {
      input.disabled = isToday && Number(input.dataset.hour) <= hourNow;
      if (input.disabled) input.checked = false;
    });
  };

  const entries = [
    {
      control: date,
      msg: dateMsg,
      check: () => {
        if (!date.value) return t(TEXT.dateRequired);
        return date.value < isoDate(new Date()) ? t(TEXT.datePast) : '';
      },
    },
    {
      control: slotsGroup,
      msg: slotsMsg,
      check: () => (checkedSlot() ? '' : t(TEXT.slotRequired)),
    },
  ];

  date.addEventListener('change', () => {
    updateSlots();
    setError(date, dateMsg, entries[0].check());
  });
  slotInputs.forEach((input) => input.addEventListener('change', () => setError(slotsGroup, slotsMsg, '')));
  updateSlots();

  return {
    el,
    validate: () => {
      updateSlots();
      const invalid = validateAll(entries);
      // the slot group itself can't take focus: its first free slot does
      return invalid === slotsGroup ? slotInputs.find((input) => !input.disabled) || date : invalid;
    },
    values: () => ({ date: date.value, slot: checkedSlot()?.value || '' }),
    reset: () => entries.forEach(({ control, msg }) => setError(control, msg, '')),
  };
}

/**
 * Tell us about you: names, email (optional), mobile, news opt-in, consent and notice.
 * @returns {{el: Element, validate: Function, values: Function, reset: Function}}
 */
function buildDetailsStep({ uid, t, authored }) {
  const first = textEntry(uid, 'firstname', {
    label: t(TEXT.firstNameLabel), placeholder: t(TEXT.firstName), autocomplete: 'given-name', maxlength: NAME_MAX, required: true,
  });
  const last = textEntry(uid, 'lastname', {
    label: t(TEXT.lastNameLabel), placeholder: t(TEXT.lastName), autocomplete: 'family-name', maxlength: NAME_MAX, required: true,
  });
  const email = textEntry(uid, 'email', {
    label: t(TEXT.emailLabel),
    placeholder: t(TEXT.email),
    type: 'email',
    autocomplete: 'email',
    inputmode: 'email',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });

  const mobileId = `${uid}-mobile`;
  const mobile = createEl('input', {
    class: 'control',
    id: mobileId,
    name: 'mobile',
    type: 'tel',
    placeholder: t(TEXT.mobile),
    autocomplete: 'tel-national',
    inputmode: 'numeric',
    maxlength: '10',
    required: true,
  });
  const mobileMsg = createEl('p', { class: 'msg', id: `${mobileId}-msg` });
  const mobileEntry = createEl(
    'div',
    { class: 'entry phone' },
    createEl('label', { class: 'visually-hidden', for: mobileId }, t(TEXT.mobileLabel)),
    createEl(
      'div',
      { class: 'phone-row' },
      createEl('span', { class: 'control dial', 'aria-hidden': 'true' }, DIAL_CODE),
      mobile,
    ),
    mobileMsg,
  );

  const updates = createEl('input', {
    class: 'optin-box', id: `${uid}-updates`, type: 'checkbox', name: 'updates',
  });
  const optin = createEl(
    'label',
    { class: 'optin', for: updates.id },
    updates,
    createEl('span', {}, t(TEXT.updates)),
  );

  // the authored consent, or the default naming the dealer
  const consent = createEl('div', { class: 'legal' });
  if (authored.consent) consent.append(...authored.consent.childNodes);
  else consent.textContent = t(TEXT.consent).replace('{dealer}', authored.map.name || t(TEXT.dealer));
  const notice = authored.notice
    ? createEl('div', { class: 'privacy' }, ...authored.notice.childNodes)
    : null;

  const titleId = `${uid}-details-title`;
  const el = createEl(
    'section',
    { class: 'step', 'data-step': 'details', 'aria-labelledby': titleId },
    createEl('h3', { class: 'step-title', id: titleId, tabindex: '-1' }, t(TEXT.aboutTitle)),
    createEl('div', { class: 'name-row' }, first.el, last.el),
    email.el,
    mobileEntry,
    optin,
    consent,
    notice,
  );

  sanitize(first.control, (v) => v.replace(/\P{L}/gu, ''));
  sanitize(last.control, (v) => v.replace(/\P{L}/gu, ''));
  // digits only, first digit 6-9, at most 10
  sanitize(mobile, (v) => v.replace(/\D/g, '').replace(/^[0-5]+/, '').slice(0, 10));
  email.control.addEventListener('blur', () => {
    email.control.value = email.control.value.trim().toLowerCase();
  });

  const nameCheck = (control, min, msgs) => () => {
    const value = control.value.trim();
    if (!value) return msgs.required;
    if (!NAME_RE.test(value)) return msgs.invalid;
    return value.length >= min ? '' : msgs.short;
  };
  const entries = [
    {
      ...first,
      check: nameCheck(first.control, 3, {
        required: t(TEXT.firstNameRequired),
        invalid: t(TEXT.firstNameInvalid),
        short: t(TEXT.firstNameShort),
      }),
    },
    {
      ...last,
      check: nameCheck(last.control, 1, {
        required: t(TEXT.lastNameRequired),
        invalid: t(TEXT.lastNameInvalid),
        short: t(TEXT.lastNameInvalid),
      }),
    },
    {
      ...email,
      check: () => {
        const value = email.control.value.trim();
        return !value || EMAIL_RE.test(value) ? '' : t(TEXT.emailInvalid);
      },
    },
    {
      control: mobile,
      msg: mobileMsg,
      check: () => {
        if (!mobile.value) return t(TEXT.mobileRequired);
        return MOBILE_RE.test(mobile.value) ? '' : t(TEXT.mobileInvalid);
      },
    },
  ];
  wireValidation(entries);

  return {
    el,
    validate: () => validateAll(entries),
    values: () => ({
      firstName: first.control.value.trim(),
      lastName: last.control.value.trim(),
      email: email.control.value.trim().toLowerCase(),
      phone: mobile.value,
      updates: updates.checked,
      consentText: consent.textContent.trim(),
    }),
    reset: () => entries.forEach(({ control, msg }) => setError(control, msg, '')),
  };
}

// step name -> builder; add the next states here
const STEPS = {
  slot: buildSlotStep,
  details: buildDetailsStep,
};

/* ---------- heading, tabs, map ---------- */

// the authored heading; text after a line break is the grey second line
function buildHeadline(heading, dealer, t) {
  const h = createEl('h2', { class: 'headline' });
  if (!heading) {
    h.append(t(TEXT.heading), dealer ? createEl('span', { class: 'headline-accent' }, dealer) : null);
    return h;
  }
  const nodes = [...heading.childNodes];
  const br = nodes.findIndex((n) => n.nodeName === 'BR');
  if (br === -1) {
    // no break: the heading wraps, and everything after its first line is grey
    h.classList.add('is-wrapped');
    h.append(...nodes);
  } else {
    h.append(...nodes.slice(0, br), createEl('span', { class: 'headline-accent' }, ...nodes.slice(br + 1)));
  }
  return h;
}

// a tablist with automatic activation and arrow / Home / End keys
function buildTabs(uid, panelId, t, onSelect) {
  const tabs = Object.entries(JOURNEYS).map(([name, journey]) => createEl('button', {
    type: 'button',
    class: 'tab',
    role: 'tab',
    id: `${uid}-tab-${name}`,
    'aria-controls': panelId,
    'aria-selected': 'false',
    tabindex: '-1',
    'data-journey': name,
  }, t(journey.tab)));
  const list = createEl('div', { class: 'tabs', role: 'tablist', 'aria-label': t(TEXT.tabs) }, ...tabs);

  list.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) onSelect(tab.dataset.journey);
  });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    const last = tabs.length - 1;
    const to = {
      ArrowRight: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabs[to].focus();
    onSelect(tabs[to].dataset.journey);
  });

  const select = (name) => tabs.forEach((tab) => {
    const on = tab.dataset.journey === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  return { list, select, idOf: (name) => `${uid}-tab-${name}` };
}

// the map card: a Google Maps embed of the Map Address (a still picture; the whole card opens
// it in Google Maps) over the Decorative Image, the dealer's pin and its pop-up
function buildMap({ image, map }, t) {
  const media = createEl('div', { class: 'map' }, image);
  const { name, address } = map;
  if (!address) return media;
  const query = encodeURIComponent(address);
  const label = [name, address].filter(Boolean).join(', ');
  const frame = createEl('iframe', {
    class: 'map-frame',
    src: `https://maps.google.com/maps?q=${query}&z=15&output=embed`,
    title: `${t(TEXT.mapTitle)}: ${label}`,
    loading: 'lazy',
    referrerpolicy: 'no-referrer-when-downgrade',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  frame.addEventListener('load', () => media.classList.add('is-loaded'));
  media.classList.add('has-map');
  media.append(
    frame,
    createEl('span', { class: 'map-pin', 'aria-hidden': 'true' }),
    createEl(
      'div',
      { class: 'map-tip', 'aria-hidden': 'true' },
      name ? createEl('strong', { class: 'map-name' }, name) : null,
      createEl('span', { class: 'map-address' }, address),
    ),
    createEl('a', {
      class: 'map-open',
      href: `https://www.google.com/maps/search/?api=1&query=${query}`,
      target: '_blank',
      rel: 'noopener',
      'aria-label': `${t(TEXT.mapOpen)}: ${label}`,
    }),
  );
  return media;
}

/* ---------- the block ---------- */

/**
 * @param {Element} block the register form, with the Trial style
 */
export default async function decorateTrial(block) {
  const placeholders = await fetchPlaceholders();
  const t = ([key, fallback]) => placeholders[key] || fallback;
  instances += 1;
  const uid = `register-form-trial-${instances}`;
  // anchor for in-page links (e.g. a hero CTA to #register); first form only
  if (!document.getElementById('register')) block.id = 'register';

  const authored = readAuthored(block);
  const ctx = { uid, t, authored };
  const steps = Object.fromEntries(
    Object.entries(STEPS).map(([name, build]) => [name, build(ctx)]),
  );

  const back = createEl('button', { type: 'button', class: 'secondary', 'data-action': 'back' }, t(TEXT.back));
  const next = createEl('button', {
    type: 'submit', class: 'primary', 'data-action': 'next', 'data-glitch': true,
  });
  const formId = `${uid}-journey`;
  const form = createEl(
    'form',
    {
      class: 'journey', id: formId, role: 'tabpanel', novalidate: true,
    },
    ...Object.values(steps).map((s) => s.el),
    createEl('div', { class: 'actions' }, back, next),
  );

  const state = { journey: 'test-drive', index: 0 };
  const current = () => JOURNEYS[state.journey].steps[state.index];

  // collected values of the journey so far (the states still to come submit them)
  const values = () => Object.assign(
    { journey: state.journey },
    ...JOURNEYS[state.journey].steps.map(({ step }) => steps[step].values()),
  );
  // the last step's hook: the next design states (review, OTP, request sent) plug in here
  const onComplete = (data) => {
    block.dispatchEvent(new CustomEvent('register-form-trial:complete', { detail: data }));
  };

  // set below, once render exists
  let selectJourney = () => {};
  const tabs = buildTabs(uid, formId, t, (name) => selectJourney(name));

  const render = () => {
    const { step, next: nextText, back: hasBack } = current();
    Object.entries(steps).forEach(([name, s]) => { s.el.hidden = name !== step; });
    next.textContent = t(nextText);
    back.hidden = !hasBack;
    tabs.select(state.journey);
    form.setAttribute('aria-labelledby', tabs.idOf(state.journey));
    block.dataset.journey = state.journey;
    block.dataset.step = step;
  };

  const go = (index) => {
    state.index = index;
    render();
    steps[current().step].el.querySelector('.step-title')?.focus({ preventScroll: true });
  };

  // a tab starts its journey from its first step; entered values are kept
  selectJourney = (name) => {
    if (name === state.journey || !JOURNEYS[name]) return;
    Object.values(steps).forEach((s) => s.reset());
    state.journey = name;
    state.index = 0;
    render();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const invalid = steps[current().step].validate();
    if (invalid) {
      invalid.focus();
      return;
    }
    if (state.index < JOURNEYS[state.journey].steps.length - 1) go(state.index + 1);
    else onComplete(values());
  });
  back.addEventListener('click', () => go(Math.max(0, state.index - 1)));

  const panel = createEl(
    'div',
    { class: 'panel' },
    buildHeadline(authored.heading, authored.map.name, t),
    authored.intro ? createEl('p', { class: 'intro' }, ...authored.intro.childNodes) : null,
    tabs.list,
    form,
  );
  block.replaceChildren(panel, buildMap(authored, t));
  render();

  // Vertical keys belong to the form: keep them from section snap's window keydown,
  // and outside a text field stop them scrolling too
  block.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) return;
    e.stopPropagation();
    if (!e.target.closest('input:not([type="checkbox"], [type="radio"]), textarea')) e.preventDefault();
  });

  // #test-drive / #quote open their tab and bring the form into view
  const fromHash = () => {
    const name = ANCHORS[window.location.hash.slice(1)];
    if (!name) return;
    selectJourney(name);
    block.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}
