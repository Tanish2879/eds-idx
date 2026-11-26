// Register Form "Trial" style, loaded by register-form.js only when the style is used; it
// renders the whole block (register-form.js returns straight after calling it). The dealer
// "Get in touch" request, as in the design:
//   the heading (the second line, after a line break, in grey), two tabs and the dealer map;
//   "Book a test drive": When works for you? (date + slot), Tell us about you (Back, Review
//     request), Check your request (Back, Request test drive), then two pop-ups: Verify your
//     number (the code boxes, resend countdown, Change number, Submit) and Request sent
//     (Add to calendar, Done);
//   "Get a quote": Tell us about you (Continue), then straight to the same two pop-ups (no
//     date or slot: Request sent lists the dealer and the contact, without Add to calendar).
// Both journeys share one Verify your number pop-up (buildVerify) and one Request sent pop-up
// (buildSent); what differs is set per journey in JOURNEYS (`sent`).
// Authored rows are read in model order (_register-form.json); the map uses Map Address and
// Map Pop-up Name, over the Decorative Image as its fallback; Request Sent Pop-up gives the
// pop-up's title, its label rows (e.g. a bold "Dealer") and status line.
//
// Adding states: write a step builder (see buildSlotStep), register it in STEPS and list it
// in a journey's steps in JOURNEYS. A journey's last step runs its `complete` handler.
//
// BEFORE GO-LIVE: the code service is SIMULATED (simulatedService below): no SMS is sent, no
// lead is created, and TEST_CODE is the only code that verifies. Replace it with the real
// otp-send / otp-verify / lead-submit calls (as register-form.js makes them, with its CAPTCHA);
// its responses already use the same codes, so nothing else changes. The service must then
// send OTP_LENGTH-digit codes, and the lead contract must carry the preferred date and time.

import { fetchPlaceholders } from '../../scripts/utils/common.js';

const DIAL_CODE = '+91'; // India only, as the default form
const MOBILE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^\p{L}+$/u; // letters only, any script
const NAME_MAX = '50';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IMAGE_RE = /\.(avif|gif|jpe?g|png|webp)([?#]|$)/i;
const SLOT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ANCHORS = { 'test-drive': 'test-drive', quote: 'quote' };
const OTP_LENGTH = 4; // the design's code length; the real service must match it
const RESEND_SECONDS = 30;
const MAX_ATTEMPTS = 3; // wrong codes before the number is locked
const CODE_TTL_MS = 10 * 60 * 1000;
const TEST_CODE = '1234'; // SIMULATED service only
const MODAL_OPEN = 'is-modal-open'; // pauses the section snap (scripts/section-snap.js)
const CLOSE_ICON = '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">'
  + '<path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

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
  reviewTitle: ['registerFormTrialReviewTitle', 'Check your request'],
  requestTestDrive: ['registerFormTrialRequestTestDrive', 'Request test drive'],
  dealerTerm: ['registerFormTrialDealerTerm', 'Dealer'],
  whenTerm: ['registerFormTrialWhenTerm', 'Preferred date and time'],
  nameTerm: ['registerFormTrialNameTerm', 'Name'],
  contactTerm: ['registerFormTrialContactTerm', 'Contact'],
  sendConsent: ['registerFormTrialSendConsent', 'By sending this request you agree that {dealer} and JSW Motors may contact you about it.'],
  sending: ['registerFormTrialSending', 'Sending…'],
  sendFailed: ['registerFormTrialSendFailed', 'We could not send the code just now. Please try again.'],
  otpTitle: ['registerFormTrialOtpTitle', 'Verify your number'],
  otpSent: ['registerFormTrialOtpSent', 'Enter the {n}-digit code sent on {phone}.'],
  otpGroup: ['registerFormTrialOtpGroup', 'Verification code'],
  otpDigit: ['registerFormTrialOtpDigit', 'Digit {i} of {n}'],
  resendIn: ['registerFormTrialResendIn', 'Resend code in {s}s'],
  resendPrompt: ['registerFormTrialResendPrompt', "Didn't get it?"],
  resend: ['registerFormTrialResend', 'Resend code'],
  resent: ['registerFormTrialResent', 'A new code has been sent.'],
  changeNumber: ['registerFormTrialChangeNumber', 'Change number'],
  submit: ['registerFormTrialSubmit', 'Submit'],
  verifying: ['registerFormTrialVerifying', 'Verifying…'],
  verified: ['registerFormTrialVerified', 'Number verified'],
  otpInvalid: ['registerFormTrialOtpInvalid', "That code isn't right. Check and try again."],
  otpExpired: ['registerFormTrialOtpExpired', 'That code has expired. Request a new one.'],
  otpLocked: ['registerFormTrialOtpLocked', 'Too many incorrect attempts. Try again later or change your number.'],
  submitFailed: ['registerFormTrialSubmitFailed', 'We could not send your request. Please try again.'],
  failed: ['registerFormTrialFailed', 'Something went wrong. Please try again.'],
  close: ['registerFormTrialClose', 'Close'],
  sentTitle: ['registerFormTrialSentTitle', 'Request sent to {dealer}'],
  sentCopy: ['registerFormTrialSentCopy', 'A copy is on its way to {email}.'],
  sentCall: ['registerFormTrialSentCall', 'We will call you on {phone}.'],
  sentReference: ['registerFormTrialSentReference', 'Reference {ref}.'],
  sentStatus: ['registerFormTrialSentStatus', 'Waiting for {dealer} to confirm your slot'],
  quoteStatus: ['registerFormTrialQuoteStatus', 'Waiting for {dealer} to call you with your quote'],
  addToCalendar: ['registerFormTrialAddToCalendar', 'Add to calendar'],
  calendarTitle: ['registerFormTrialCalendarTitle', 'Test drive at {dealer}'],
  done: ['registerFormTrialDone', 'Done'],
};

// the journeys the tabs switch between: their steps in order, and each step's buttons
const JOURNEYS = {
  'test-drive': {
    tab: ['registerFormTrialTestDrive', 'Book a test drive'],
    steps: [
      { step: 'slot', next: TEXT.continue },
      { step: 'details', next: TEXT.review, back: true },
      { step: 'review', next: TEXT.requestTestDrive, back: true },
    ],
    // the last step's button: send the code, then Verify your number and Request sent
    complete: 'verify',
    // Request sent: the preferred date and time, Add to calendar, the authored status line
    sent: { when: true, calendar: true, status: 'authored' },
  },
  quote: {
    tab: ['registerFormTrialQuote', 'Get a quote'],
    steps: [
      { step: 'details', next: TEXT.continue },
    ],
    // Continue goes straight to the code, then the same pop-ups
    complete: 'verify',
    // Request sent: the contact instead of a date, no calendar, the quote's own status line
    sent: { contact: true, status: TEXT.quoteStatus },
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
// fills {name} slots in a text
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
// "+91 98765 43210"
const phoneLabel = (digits) => `${DIAL_CODE} ${digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits}`;
// copies of an authored cell's content (it shows on more than one step)
const cloneNodes = (cell) => [...cell.childNodes].map((n) => n.cloneNode(true));
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// "Saturday, 7 November 2026, 11:00 AM" from 2026-11-07 and 11:00
function whenLabel(date, slot) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const part = (opts) => day.toLocaleDateString('en-GB', opts);
  const hour = Number((slot || '').split(':')[0]);
  const time = slot ? `, ${slotLabel(hour)}` : '';
  return `${part({ weekday: 'long' })}, ${d} ${part({ month: 'long' })} ${y}${time}`;
}

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

// the authored Request Sent field: a heading (the title), paragraphs starting with a bold label
// (rows), a plain paragraph (the status line)
function readRequestSent(cell) {
  const out = { title: '', rows: [], status: '' };
  if (!cell) return out;
  const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) out.title = heading.textContent.trim();
  cell.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    if (!text) return;
    const first = [...p.childNodes]
      .find((n) => n.nodeType !== Node.TEXT_NODE || n.textContent.trim());
    if (first?.nodeType === Node.ELEMENT_NODE && first.matches('strong, b')) {
      out.rows.push([first.textContent.trim(), text.slice(first.textContent.length).trim()]);
    } else if (!out.title) out.title = text;
    else if (!out.status) out.status = text;
  });
  return out;
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
    clear: () => {
      date.value = isoDate(first);
      slotInputs.forEach((input) => { input.checked = false; });
      updateSlots();
      entries.forEach(({ control, msg }) => setError(control, msg, ''));
    },
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
    ? createEl('div', { class: 'privacy' }, ...cloneNodes(authored.notice))
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
    clear: () => {
      entries.forEach(({ control, msg }) => {
        control.value = '';
        setError(control, msg, '');
      });
      updates.checked = false;
    },
    focusMobile: () => mobile.focus(),
  };
}

// the dealer line: the authored Request Sent "Dealer" row, else the map's name and address
function dealerLine(authored, sent) {
  const row = sent.rows.find(([term]) => /^dealer$/i.test(term));
  return row ? row[1] : [authored.map.name, authored.map.address].filter(Boolean).join(', ');
}

// "+91 98765 43210, riya.sharma@example.com"
const contactLine = (v) => [v.phone ? phoneLabel(v.phone) : '', v.email].filter(Boolean).join(', ');

// a <dl> of [term, value] rows, empty values left out
function fillSummary(dl, rows) {
  dl.replaceChildren(...rows.filter(([, value]) => value).map(([term, value]) => createEl(
    'div',
    { class: 'summary-row' },
    createEl('dt', { class: 'summary-term' }, term),
    createEl('dd', { class: 'summary-value' }, value),
  )));
}

/**
 * Check your request: dealer, preferred date and time, name, contact; the send consent and the
 * notice. Filled from the other steps each time it shows.
 * @returns {{el: Element, validate: Function, values: Function, reset: Function, show: Function}}
 */
function buildReviewStep({
  uid, t, authored, sent,
}) {
  const dealer = authored.map.name || t(TEXT.dealer);
  const summary = createEl('dl', { class: 'summary' });
  const titleId = `${uid}-review-title`;
  const el = createEl(
    'section',
    { class: 'step', 'data-step': 'review', 'aria-labelledby': titleId },
    createEl('h3', { class: 'step-title', id: titleId, tabindex: '-1' }, t(TEXT.reviewTitle)),
    summary,
    createEl('p', { class: 'legal send-consent' }, fill(t(TEXT.sendConsent), { dealer })),
    authored.notice ? createEl('div', { class: 'privacy' }, ...cloneNodes(authored.notice)) : null,
  );
  return {
    el,
    validate: () => null,
    values: () => ({}),
    reset: () => {},
    clear: () => summary.replaceChildren(),
    show: (v) => fillSummary(summary, [
      [t(TEXT.dealerTerm), dealerLine(authored, sent)],
      [t(TEXT.whenTerm), whenLabel(v.date, v.slot)],
      [t(TEXT.nameTerm), `${v.firstName || ''} ${v.lastName || ''}`.trim()],
      [t(TEXT.contactTerm), contactLine(v)],
    ]),
  };
}

// step name -> builder; add the next states here
const STEPS = {
  slot: buildSlotStep,
  details: buildDetailsStep,
  review: buildReviewStep,
};

/* ---------- the code service (SIMULATED) ---------- */

// Stands in for otp-send / otp-verify / lead-submit with the same response codes, so the real
// calls can replace it as they are. Design review only: no SMS, no lead; TEST_CODE verifies.
function simulatedService() {
  let sentAt = 0;
  let attempts = 0;
  return {
    async send() {
      await wait(400);
      sentAt = Date.now();
      attempts = 0;
      return { code: 'OTP_SENT', data: { resendAfter: RESEND_SECONDS } };
    },
    async verify(phone, code) {
      await wait(500);
      if (attempts >= MAX_ATTEMPTS) return { code: 'LOCKED' };
      if (Date.now() - sentAt > CODE_TTL_MS) return { code: 'CODE_EXPIRED' };
      if (code !== TEST_CODE) {
        attempts += 1;
        return { code: attempts >= MAX_ATTEMPTS ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE' };
      }
      return { code: 'OTP_VERIFIED', data: { verificationToken: 'simulated' } };
    },
    async submit() {
      await wait(400);
      return { code: 'LEAD_CREATED', data: { reference: `JSW-${String(Date.now()).slice(-6)}` } };
    },
  };
}

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

/* ---------- pop-ups ---------- */

// the section snap pauses while any Trial pop-up is open
const syncModalFlag = () => document.documentElement.classList.toggle(
  MODAL_OPEN,
  !!document.querySelector('.register-form.trial dialog[open]'),
);

// a <dialog>; Esc runs onCancel instead of the browser's own close (set by each pop-up)
function buildPopup(className, labelId) {
  return createEl('dialog', { class: `popup ${className}`, 'aria-labelledby': labelId });
}
const onEscape = (dialog, fn) => dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  fn();
});

const popupActions = (...buttons) => createEl('div', { class: 'popup-actions' }, ...buttons);

/**
 * Verify your number: the code boxes, the resend countdown, Change number and Submit.
 * Its states are classes on the pop-up: is-busy, is-error, is-locked, is-verified; the
 * countdown row gets can-resend when it runs out.
 * @returns {{dialog: HTMLDialogElement, open: Function, hide: Function}}
 */
function buildVerify({
  uid, t, service, onClose, onChangeNumber, onVerified,
}) {
  const titleId = `${uid}-otp-title`;
  const msgId = `${uid}-otp-msg`;
  let phone = '';
  let timer = 0;
  let busy = false;
  let locked = false;

  const close = createEl('button', { type: 'button', class: 'popup-close', 'aria-label': t(TEXT.close) });
  close.insertAdjacentHTML('beforeend', CLOSE_ICON);
  const sub = createEl('p', { class: 'popup-sub' });
  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => createEl('input', {
    class: 'code-box',
    type: 'text',
    inputmode: 'numeric',
    // room for a whole code: OS autofill (iOS "From Messages", Android SMS) puts it in one box
    maxlength: String(OTP_LENGTH),
    autocomplete: 'one-time-code',
    'aria-label': fill(t(TEXT.otpDigit), { i: i + 1, n: OTP_LENGTH }),
    'aria-describedby': msgId,
  }));
  const msg = createEl('p', { class: 'code-msg', id: msgId, role: 'alert' });
  const waitText = createEl('span', { class: 'resend-wait' });
  const resendBtn = createEl('button', { type: 'button', class: 'resend-btn', disabled: true }, t(TEXT.resend));
  const resendRow = createEl(
    'p',
    { class: 'resend-row' },
    waitText,
    createEl('span', { class: 'resend-prompt' }, `${t(TEXT.resendPrompt)} `),
    resendBtn,
  );
  const live = createEl('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const change = createEl('button', { type: 'button', class: 'secondary' }, t(TEXT.changeNumber));
  const submit = createEl('button', {
    type: 'button', class: 'primary', 'data-glitch': true, disabled: true,
  }, t(TEXT.submit));

  const dialog = buildPopup('verify', titleId);
  dialog.append(
    close,
    createEl('h3', { class: 'popup-title', id: titleId }, t(TEXT.otpTitle)),
    sub,
    createEl('div', { class: 'code-boxes', role: 'group', 'aria-label': t(TEXT.otpGroup) }, ...boxes),
    msg,
    resendRow,
    live,
    popupActions(change, submit),
  );

  const value = () => boxes.map((b) => b.value).join('');
  const stopTimer = () => {
    clearInterval(timer);
    timer = 0;
  };
  const hide = () => {
    stopTimer();
    if (dialog.open) dialog.close();
    syncModalFlag();
  };
  const refresh = () => {
    submit.disabled = busy || locked || value().length !== OTP_LENGTH;
    dialog.classList.toggle('is-busy', busy);
    dialog.setAttribute('aria-busy', String(busy));
  };
  // error text under the boxes; the boxes turn red with it (aria-invalid, not colour alone)
  const showMsg = (text) => {
    msg.textContent = text || '';
    dialog.classList.toggle('is-error', !!text);
    boxes.forEach((b) => {
      if (text) b.setAttribute('aria-invalid', 'true');
      else b.removeAttribute('aria-invalid');
    });
  };
  const clearBoxes = () => {
    locked = false;
    boxes.forEach((b) => {
      b.value = '';
      b.disabled = false;
    });
    dialog.classList.remove('is-locked', 'is-verified');
    showMsg('');
    refresh();
  };

  // resend countdown: "Resend code in 30s", then "Didn't get it? Resend code"
  const allowResend = () => {
    stopTimer();
    resendRow.classList.add('can-resend');
    resendBtn.disabled = false;
    live.textContent = `${t(TEXT.resendPrompt)} ${t(TEXT.resend)}`;
  };
  const startTimer = (seconds) => {
    stopTimer();
    let left = seconds;
    resendRow.classList.remove('can-resend');
    resendBtn.disabled = true;
    const tick = () => { waitText.textContent = fill(t(TEXT.resendIn), { s: left }); };
    tick();
    timer = setInterval(() => {
      left -= 1;
      if (left > 0) tick();
      else allowResend();
    }, 1000);
  };

  // spreads digits across the boxes from `start` and focuses the first empty one
  const fillFrom = (start, raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, OTP_LENGTH - start);
    if (!digits) return;
    [...digits].forEach((d, n) => { boxes[start + n].value = d; });
    showMsg('');
    const nextEmpty = boxes.findIndex((b) => !b.value);
    boxes[nextEmpty === -1 ? OTP_LENGTH - 1 : nextEmpty].focus();
    refresh();
  };

  const verify = async () => {
    if (busy || locked || value().length !== OTP_LENGTH) return;
    busy = true;
    submit.textContent = t(TEXT.verifying);
    refresh();
    const res = await service.verify(phone, value());
    if (res.code === 'OTP_VERIFIED') {
      stopTimer();
      boxes.forEach((b) => { b.disabled = true; });
      dialog.classList.add('is-verified');
      live.textContent = t(TEXT.verified);
      // the caller submits the request, closes this pop-up (hide) and opens what comes next
      await onVerified(res.data || {}, hide);
      busy = false;
      submit.textContent = t(TEXT.submit);
      refresh();
      return;
    }
    busy = false;
    submit.textContent = t(TEXT.submit);
    if (res.code === 'TOO_MANY_ATTEMPTS' || res.code === 'LOCKED') {
      // the number is locked: only Change number gets out
      locked = true;
      stopTimer();
      boxes.forEach((b) => { b.disabled = true; });
      dialog.classList.add('is-locked');
      showMsg(t(TEXT.otpLocked));
      refresh();
      change.focus();
      return;
    }
    if (res.code === 'CODE_EXPIRED') {
      showMsg(t(TEXT.otpExpired));
      allowResend();
      refresh();
      resendBtn.focus();
      return;
    }
    showMsg(res.code === 'INVALID_CODE' ? t(TEXT.otpInvalid) : t(TEXT.failed));
    refresh();
    boxes[0].focus();
  };

  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => box.select());
    box.addEventListener('input', (e) => {
      // one key: that digit replaces the box; anything longer (autofill) is spread
      const typed = e.inputType === 'insertText' && e.data ? e.data.replace(/\D/g, '').slice(-1) : null;
      const digits = typed ?? box.value.replace(/\D/g, '');
      if (dialog.classList.contains('is-error')) showMsg('');
      if (digits.length > 1) {
        box.value = '';
        fillFrom(digits.length >= OTP_LENGTH ? 0 : i, digits);
        return;
      }
      box.value = digits;
      if (digits && i < OTP_LENGTH - 1) boxes[i + 1].focus();
      refresh();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        e.preventDefault();
        boxes[i - 1].value = '';
        boxes[i - 1].focus();
        if (dialog.classList.contains('is-error')) showMsg('');
        refresh();
      } else if (e.key === 'ArrowLeft' && i > 0) {
        e.preventDefault();
        boxes[i - 1].focus();
      } else if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) {
        e.preventDefault();
        boxes[i + 1].focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        verify();
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      fillFrom(digits.length >= OTP_LENGTH ? 0 : i, digits);
    });
  });

  // a fresh code: empty boxes, the countdown restarted
  const send = async () => {
    const res = await service.send(phone);
    if (res.code !== 'OTP_SENT') return false;
    clearBoxes();
    startTimer(res.data?.resendAfter || RESEND_SECONDS);
    return true;
  };

  resendBtn.addEventListener('click', async () => {
    if (resendBtn.disabled) return;
    resendBtn.disabled = true;
    if (!(await send())) {
      showMsg(t(TEXT.sendFailed));
      resendBtn.disabled = false;
      return;
    }
    live.textContent = t(TEXT.resent);
    boxes[0].focus();
  });
  submit.addEventListener('click', verify);
  // ×, Esc: back to Check your request; Change number: back to the details
  const dismiss = () => {
    hide();
    onClose();
  };
  close.addEventListener('click', dismiss);
  onEscape(dialog, dismiss);
  change.addEventListener('click', () => {
    hide();
    onChangeNumber();
  });

  return {
    dialog,
    // sends the code, then opens; false when it couldn't be sent
    open: async (digits) => {
      phone = digits;
      sub.textContent = fill(t(TEXT.otpSent), { n: OTP_LENGTH, phone: phoneLabel(digits) });
      busy = false;
      submit.textContent = t(TEXT.submit);
      if (!(await send())) return false;
      dialog.showModal();
      syncModalFlag();
      boxes[0].focus();
      return true;
    },
    hide,
  };
}

// an .ics file for the booked slot (one hour, the dealer's local time)
function downloadCalendar({
  date, slot, title, location, reference,
}) {
  if (!date || !slot) return;
  const [y, m, d] = date.split('-');
  const hour = Number(slot.split(':')[0]);
  const at = (h) => `${y}${m}${d}T${pad(h)}0000`;
  const esc = (v) => String(v).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JSW Motors//Test drive//EN',
    'BEGIN:VEVENT',
    `UID:${reference || now}-test-drive@jswmotors.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${at(hour)}`,
    `DTEND:${at(hour + 1)}`,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : null,
    reference ? `DESCRIPTION:${esc(reference)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const link = createEl('a', { href: url, download: 'test-drive.ics', hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Request sent: the title, where the copy goes and the reference, the dealer, the status line
 * and Done; per journey (JOURNEYS `sent`) the preferred date and time and Add to calendar
 * (Book a test drive) or the contact (Get a quote).
 * @returns {{dialog: HTMLDialogElement, open: Function, hide: Function}}
 */
function buildSent({
  uid, t, authored, sent, onDone,
}) {
  const titleId = `${uid}-sent-title`;
  const dealer = authored.map.name || t(TEXT.dealer);
  const sub = createEl('p', { class: 'popup-sub' });
  const summary = createEl('dl', { class: 'summary' });
  const calendar = createEl('button', { type: 'button', class: 'secondary' }, t(TEXT.addToCalendar));
  const done = createEl('button', {
    type: 'button', class: 'primary', 'data-glitch': true, autofocus: true,
  }, t(TEXT.done));
  const status = createEl('p', { class: 'sent-status' });
  const dialog = buildPopup('sent', titleId);
  dialog.append(
    createEl('h3', { class: 'popup-title', id: titleId }, sent.title || fill(t(TEXT.sentTitle), { dealer })),
    sub,
    summary,
    status,
    popupActions(calendar, done),
  );

  let booking = null;
  const hide = () => {
    if (dialog.open) dialog.close();
    syncModalFlag();
  };
  // Done, Esc: the pop-up closes and the form starts over
  const finish = () => {
    hide();
    onDone();
  };
  calendar.addEventListener('click', () => { if (booking) downloadCalendar(booking); });
  done.addEventListener('click', finish);
  onEscape(dialog, finish);

  return {
    dialog,
    open: (v, reference, {
      when = false, contact = false, calendar: withCalendar = false, status: statusText,
    } = {}) => {
      const where = v.email
        ? fill(t(TEXT.sentCopy), { email: v.email })
        : fill(t(TEXT.sentCall), { phone: phoneLabel(v.phone) });
      sub.textContent = [where, reference ? fill(t(TEXT.sentReference), { ref: reference }) : '']
        .filter(Boolean).join(' ');
      const dealerValue = dealerLine(authored, sent);
      fillSummary(summary, [
        [t(TEXT.dealerTerm), dealerValue],
        when ? [t(TEXT.whenTerm), whenLabel(v.date, v.slot)] : null,
        contact ? [t(TEXT.contactTerm), contactLine(v)] : null,
        // any other authored label rows
        ...sent.rows.filter(([term]) => !/^dealer$/i.test(term)),
      ].filter(Boolean));
      // 'authored': the Request Sent field's status line, else the default; or a text of its own
      status.textContent = statusText === 'authored' || !statusText
        ? sent.status || fill(t(TEXT.sentStatus), { dealer })
        : fill(t(statusText), { dealer });
      calendar.hidden = !withCalendar;
      booking = withCalendar ? {
        date: v.date,
        slot: v.slot,
        title: fill(t(TEXT.calendarTitle), { dealer }),
        location: authored.map.address || dealerValue,
        reference,
      } : null;
      dialog.showModal();
      syncModalFlag();
    },
    hide,
  };
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
  const sent = readRequestSent(authored.requestSent);
  const ctx = {
    uid, t, authored, sent,
  };
  const service = simulatedService();
  const steps = Object.fromEntries(
    Object.entries(STEPS).map(([name, build]) => [name, build(ctx)]),
  );

  const back = createEl('button', { type: 'button', class: 'secondary', 'data-action': 'back' }, t(TEXT.back));
  const next = createEl('button', {
    type: 'submit', class: 'primary', 'data-action': 'next', 'data-glitch': true,
  });
  // a problem the whole step has (e.g. the code couldn't be sent), above its buttons
  const formMsg = createEl('p', { class: 'msg form-msg', role: 'alert' });
  const formId = `${uid}-journey`;
  const form = createEl(
    'form',
    {
      class: 'journey', id: formId, role: 'tabpanel', novalidate: true,
    },
    ...Object.values(steps).map((s) => s.el),
    formMsg,
    createEl('div', { class: 'actions' }, back, next),
  );

  const state = { journey: 'test-drive', index: 0 };
  const current = () => JOURNEYS[state.journey].steps[state.index];

  // collected values of the journey so far
  const values = () => Object.assign(
    { journey: state.journey },
    ...JOURNEYS[state.journey].steps.map(({ step }) => steps[step].values()),
  );

  // set below, once render exists
  let selectJourney = () => {};
  const tabs = buildTabs(uid, formId, t, (name) => selectJourney(name));

  const render = () => {
    const { step, next: nextText, back: hasBack } = current();
    steps[step].show?.(values());
    Object.entries(steps).forEach(([name, s]) => { s.el.hidden = name !== step; });
    formMsg.textContent = '';
    next.disabled = false;
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

  // --- the pop-ups after the last step of Book a test drive ---
  const stepIndex = (name) => JOURNEYS[state.journey].steps.findIndex(({ step }) => step === name);

  // Done: the form starts over, empty, on its first step
  const sentPopup = buildSent({
    uid,
    t,
    authored,
    sent,
    onDone: () => {
      Object.values(steps).forEach((s) => s.clear?.());
      go(0);
    },
  });

  const verifyPopup = buildVerify({
    uid,
    t,
    service,
    onClose: () => next.focus(),
    onChangeNumber: () => {
      go(stepIndex('details'));
      steps.details.focusMobile();
    },
    // the number is verified: send the request, then Request sent
    onVerified: async ({ verificationToken }, hideVerify) => {
      const v = values();
      const res = await service.submit({
        fullName: `${v.firstName} ${v.lastName}`.trim(),
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone,
        consent: { granted: true, text: v.consentText, updates: v.updates },
        requestType: v.journey,
        // Book a test drive only
        ...(v.date ? { preferredDate: v.date, preferredSlot: v.slot } : {}),
        verificationToken,
      });
      hideVerify();
      if (res.code !== 'LEAD_CREATED') {
        formMsg.textContent = t(TEXT.submitFailed);
        next.focus();
        return;
      }
      sentPopup.open(v, res.data?.reference || '', JOURNEYS[v.journey].sent);
    },
  });

  // what a journey's last step does: send the code and open Verify your number
  const complete = {
    verify: async () => {
      next.disabled = true;
      next.textContent = t(TEXT.sending);
      formMsg.textContent = '';
      const opened = await verifyPopup.open(values().phone);
      next.disabled = false;
      next.textContent = t(current().next);
      if (!opened) formMsg.textContent = t(TEXT.sendFailed);
    },
  };
  // a journey without a complete handler (none today) reports its values in an event
  const report = () => block.dispatchEvent(new CustomEvent('register-form-trial:complete', { detail: values() }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (next.disabled) return;
    const invalid = steps[current().step].validate();
    if (invalid) {
      invalid.focus();
      return;
    }
    if (state.index < JOURNEYS[state.journey].steps.length - 1) go(state.index + 1);
    else (complete[JOURNEYS[state.journey].complete] || report)();
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
  block.replaceChildren(panel, buildMap(authored, t), verifyPopup.dialog, sentPopup.dialog);
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
