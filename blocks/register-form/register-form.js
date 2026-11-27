import {
  createOptimizedPicture, decorateIcons, getMetadata, loadCSS, loadScript,
} from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/utils/common.js';
import { markReferral } from '../../scripts/utils/referral.js';
import { getAttribution } from '../../scripts/utils/attribution.js';
import {
  dataLayerPush, interaction, componentOf, key as dlKey,
} from '../../scripts/utils/datalayer.js';

const OTP_LENGTH = 6;
const API_BASE = '/api/v1/web/';
const SITE_KEYS = { stage: '6LeyxvEtAAAAACXf33K8qUr0S5qT458UbWKjvcBQ', prod: '6Lcgn-wtAAAAANq0RRhn57ZoDktGkrNxB0Gk-a9D' };
const CAPTCHA_PROVIDER = 'recaptcha';
const DIAL_CODE = '+91'; // India only; the service rejects any other code

// Indian PIN code: 6 digits, never starting with 0
const PINCODE_RE = /^[1-9]\d{5}$/;
const PINCODE_LENGTH = 6;
const MOBILE_RE = /^[6-9]\d{9}$/;

// Letters only (any script); no spaces, hyphens, apostrophes or digits
const NAME_RE = /^\p{L}+$/u;
const NAME_MAX = '50';

const TLD_MAX = 20;

// Explicit list, not a suffix check: dev.jswmotors.com once fell through to prod
const STAGE_HOSTS = [
  'dev.jswmotors.com', 'stage.jswmotors.com',
  // the dealer sites' dev and stage tiers (same code, repoless); dealers.jswmotors.com is prod
  'dev-dealers.jswmotors.com', 'stage-dealers.jswmotors.com',
  'localhost', '127.0.0.1',
];

const UTM_PARAMS = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

const LOCKOUT = {
  at: 'boxes', msg: 'Too many incorrect attempts.', retry: 1, noResend: 1, lockout: 1,
};

const ERRORS = {
  INVALID_PHONE: { at: 'mobile', msg: 'Enter a valid 10-digit mobile number.' },
  INVALID_PAYLOAD: { at: 'form', msg: 'Please check your details and try again.' },
  CAPTCHA_FAILED: { at: 'form', msg: 'We could not verify your request. Please try again.' },
  ORIGIN_REJECTED: { at: 'form', msg: 'This request is not permitted from here. Please try again later.' },
  RESEND_TOO_SOON: { at: 'otp', msg: 'Please wait before requesting another code.' },
  PHONE_RATE_LIMITED: { at: 'form', msg: 'Too many codes requested for this number. Please try later.' },
  IP_RATE_LIMITED: { at: 'form', msg: 'Too many requests just now. Please try later.' },
  LOCKED: LOCKOUT,
  TOO_MANY_ATTEMPTS: LOCKOUT,
  INVALID_CODE: { at: 'boxes', msg: 'Please enter correct OTP.' },
  CODE_EXPIRED: { at: 'boxes', msg: 'That code has expired. Request a new one.', allowResend: 1 },
  TOKEN_INVALID: { at: 'form', msg: 'Please verify your number again.', screen: 'fields' },
  TOKEN_EXPIRED: { at: 'form', msg: 'Your verification expired. Please start again.', screen: 'fields' },
  TOKEN_ALREADY_USED: { at: 'form', msg: 'This registration has already been submitted.' },
  PHONE_MISMATCH: { at: 'form', msg: 'Please verify your number again.', screen: 'fields' },
  SMS_DISPATCH_FAILED: { at: 'form', msg: 'We could not send the code just now. Please try again.' },
  // the token is consumed before the lead call, so a failure means verifying again
  LEAD_UPSTREAM_ERROR: { at: 'form', msg: 'We could not complete your registration. Please try again.', screen: 'fields' },
  INTERNAL_ERROR: { at: 'form', msg: 'Something went wrong. Please try again.' },
  NETWORK: { at: 'form', msg: 'Check your connection and try again.' },
};

// analytics error codes; unmapped otp-send codes report 'otp-send-failed'
const OTP_SEND_ERROR_CODES = {
  CAPTCHA_FAILED: 'captcha-failed',
  INVALID_PHONE: 'mobile-invalid-format',
  INVALID_PAYLOAD: 'invalid-payload',
  PHONE_RATE_LIMITED: 'phone-rate-limited',
  IP_RATE_LIMITED: 'ip-rate-limited',
  RESEND_TOO_SOON: 'resend-too-soon',
  SMS_DISPATCH_FAILED: 'sms-dispatch-failed',
  INTERNAL_ERROR: 'internal-error',
  NETWORK: 'network-error',
};

const OTP_VERIFY_ERROR_CODES = {
  INVALID_CODE: 'otp-invalid-code',
  CODE_EXPIRED: 'otp-expired',
  TOO_MANY_ATTEMPTS: 'otp-too-many-attempts',
  LOCKED: 'otp-locked',
  TOKEN_INVALID: 'token-invalid',
  TOKEN_EXPIRED: 'token-invalid',
  PHONE_MISMATCH: 'phone-mismatch',
};

const DEFAULT_CONSENT_TEXT = 'I agree to JSW Motors storing my details and contacting me about the launch, reservations and related updates over email, SMS, WhatsApp and phone, as in the ';
const DEFAULT_CONSENT_LINK_HREF = '#privacy';
const DEFAULT_CONSENT_LINK_TEXT = 'Privacy Notice.';

// SHA-256 hex for the hashed email/phone Salesforce matches on. Inputs must be
// normalised exactly as sent: email lowercased and trimmed, phone as 10 bare digits.
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isPreviewHost = (h) => h.endsWith('.aem.page') || h.endsWith('.aem.live');

function resolveEnv() {
  const h = window.location.hostname;
  return STAGE_HOSTS.includes(h) || isPreviewHost(h) ? 'stage' : 'prod';
}

// No CAPTCHA on *.aem.page / *.aem.live (no reCAPTCHA key can be registered there);
// must match the service's CAPTCHA_EXEMPT_ORIGINS
const captchaRequired = () => !isPreviewHost(window.location.hostname);

// 'otp-api-base' metadata can point the form at a local stub
const resolveApiBase = () => (getMetadata('otp-api-base') || API_BASE).replace(/\/+$/, '');

// The reCAPTCHA badge expands on hover, and a tap on touch leaves it open over the
// CTA. Keep it collapsed, toggled by a button over the logo (taps inside Google's
// iframe never reach us); a tap anywhere else collapses it.
function collapsibleBadge(badge) {
  if (badge.querySelector('.grecaptcha-toggle')) return;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'grecaptcha-toggle';
  toggle.setAttribute('aria-label', 'reCAPTCHA');
  const setOpen = (open) => {
    badge.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  setOpen(false);
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!badge.classList.contains('is-expanded'));
  });
  document.addEventListener('click', () => setOpen(false));
  badge.append(toggle);
}

function watchBadge() {
  const found = () => {
    const badge = document.querySelector('.grecaptcha-badge');
    if (badge) collapsibleBadge(badge);
    return !!badge;
  };
  if (found()) return;
  const observer = new MutationObserver(() => { if (found()) observer.disconnect(); });
  observer.observe(document.body, { childList: true, subtree: true });
}

function captchaLoader() {
  const siteKey = getMetadata('captcha-site-key') || SITE_KEYS[resolveEnv()] || '';
  const provider = (getMetadata('captcha-provider') || CAPTCHA_PROVIDER) === 'recaptcha'
    ? 'recaptcha'
    : 'turnstile';
  let ready = null;
  let host = null;

  function load() {
    if (!ready) {
      ready = siteKey
        ? loadScript(provider === 'recaptcha'
          ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
          : 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', { async: '' })
        : Promise.reject(new Error('no captcha site key configured'));
      if (siteKey && provider === 'recaptcha') ready.then(watchBadge, () => {});
    }
    return ready;
  }

  // tokens are single-use, so a fresh one is fetched for every send
  async function token() {
    await load();
    if (provider === 'recaptcha') {
      await new Promise((r) => { window.grecaptcha.ready(r); });
      return window.grecaptcha.execute(siteKey, { action: 'otp_send' });
    }
    if (!host) {
      host = document.createElement('div');
      host.className = 'register-form-captcha';
      host.setAttribute('aria-hidden', 'true');
      document.body.append(host);
    }
    return new Promise((resolve, reject) => {
      window.turnstile.render(host, {
        sitekey: siteKey,
        callback: resolve,
        'error-callback': () => reject(new Error('captcha')),
        'expired-callback': () => reject(new Error('captcha expired')),
        appearance: 'interaction-only',
      });
    });
  }

  return { load, token };
}

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

// empty means required (the default)
const isRequired = (val) => {
  if (val == null || val === '') return true;
  return ['true', '1', 'yes'].includes(String(val).trim().toLowerCase());
};

// Same-origin only (root-relative, or http(s) on this origin), so authored content
// can't make the redirect an XSS / open-redirect sink
const isSafeRedirect = (url) => {
  if (!url || url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
};

// cuts the domain suffix after the last dot to TLD_MAX characters
const capTld = (value) => {
  const at = value.lastIndexOf('@');
  if (at === -1) return value;
  const dot = value.slice(at + 1).lastIndexOf('.');
  if (dot === -1) return value;
  return value.slice(0, at + dot + 2 + TLD_MAX);
};

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  // Booking style: its steps load alongside the placeholders (register-form-booking.js)
  const booking = block.classList.contains('booking');
  const bookingModule = booking ? Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/register-form/register-form-booking.css`),
    import('./register-form-booking.js'),
  ]).then(([, mod]) => mod.default) : null;
  const placeholders = await fetchPlaceholders();
  const ph = (key, fallback) => placeholders[key] || fallback;
  // placeholder text gets a trailing * only when the field is required
  const starred = (key, fallback, required) => `${ph(key, fallback).replace(/\*$/, '')}${required ? '*' : ''}`;

  // anchor for in-page links (e.g. a hero CTA to #register); first form only
  if (!document.getElementById('register')) block.id = 'register';

  // Vertical keys belong to the form: keep them from section snap's window keydown,
  // and outside a text field stop them scrolling too
  block.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) return;
    e.stopPropagation();
    if (!e.target.closest('input:not([type="checkbox"]), textarea')) e.preventDefault();
  });

  // Booking: its own fields come after the Thank-you Page Link (6th row on): the Request Sent
  // pop-up's text, the map's pop-up name and address; they are not fields of the form, so they
  // are set aside for the style
  const bookingRows = booking ? [...block.children].slice(5) : [];
  bookingRows.forEach((row) => row.remove());
  const [requestSentRow, mapNameRow, mapAddressRow, mapCoordsRow, ...wayfindRows] = bookingRows;
  const rowText = (row) => row?.textContent.trim() || '';

  let picture = null;
  let heading = null;
  let intro = null;
  let redirectFromField = '';
  const textRows = [];

  [...block.children].forEach((row) => {
    const img = row.querySelector('img');
    const h = row.querySelector('h1, h2, h3');
    const link = row.querySelector('a[href]');
    // The "Thank-you Page Link" row is just a link; a consent row with a link has more text
    if (link && !h && !img && row.textContent.trim() === link.textContent.trim()) {
      redirectFromField = link.getAttribute('href') || '';
    } else if (img) {
      // createOptimizedPicture keeps only the path: for this site's own raster images only
      const { origin, pathname } = new URL(img.src, window.location.href);
      picture = origin === window.location.origin && !/\.svg$/i.test(pathname)
        ? createOptimizedPicture(img.src, img.alt || '', false, [{ width: '750' }])
        : img.closest('picture') || img;
    } else if (h) {
      // "Heading & Intro" cell: a heading (normalised to <h2>) and an intro <p>
      if (h.tagName === 'H2') {
        heading = h;
      } else {
        heading = document.createElement('h2');
        heading.append(...h.childNodes);
      }
      heading.classList.add('heading');
      intro = row.querySelector('p');
    } else {
      // blank rows kept too, so the fallback order below doesn't shift
      textRows.push(row.querySelector('p') || row);
    }
  });

  const isFirstNameRequired = isRequired(placeholders.registerFormRequireFirstName);
  const firstNameRequired = ph('registerFormFirstNameRequired', 'First name required');
  const firstNameInvalid = ph('registerFormFirstNameInvalid', 'Enter a valid first name');
  const firstNameTooShort = ph('registerFormFirstNameTooShort', 'First name must be at least 3 characters');
  const firstNamePlaceholder = starred('registerFormFirstName', 'First Name', isFirstNameRequired);

  const isLastNameRequired = isRequired(placeholders.registerFormRequireLastName);
  const lastNameRequired = ph('registerFormLastNameRequired', 'Last name required');
  const lastNameInvalid = ph('registerFormLastNameInvalid', 'Enter a valid last name');
  const lastNameTooShort = ph('registerFormLastNameTooShort', 'Last name must be at least 1 character');
  const lastNamePlaceholder = starred('registerFormLastName', 'Last Name', isLastNameRequired);

  // Booking: email is optional; the pincode is as in the default form
  const isEmailRequired = !booking && isRequired(placeholders.registerFormRequireEmail);
  const emailRequired = ph('registerFormEmailRequired', 'Email address required');
  const emailInvalid = ph('registerFormEmailInvalid', 'Enter a valid email address');
  const emailPlaceholder = starred('registerFormEmail', 'Email Address', isEmailRequired);

  const isPincodeRequired = isRequired(placeholders.registerFormRequirePincode);
  const pincodeRequired = ph('registerFormPincodeRequired', 'Pincode required');
  const pincodeInvalid = ph('registerFormPincodeInvalid', 'Enter a valid 6-digit pincode');
  const pincodePlaceholder = starred('registerFormPincode', 'Pincode', isPincodeRequired);

  const mobilePlaceholder = ph('registerFormMobile', 'Mobile Number*');
  const mobileRequired = ph('registerFormMobileRequired', 'Mobile Number required');
  const mobileInvalid = ph('registerFormMobileInvalid', 'Enter a valid 10-digit mobile number');
  const consentRequired = ph('registerFormConsentRequired', 'Tick this to continue');

  // thank-you page: authored field first, then the placeholder; replaces the success screen
  const rawRedirect = (redirectFromField || placeholders.registerFormRedirectUrl || '').trim();
  const redirectUrl = isSafeRedirect(rawRedirect) ? rawRedirect : '';

  // Consent vs notice by content, not position (authored order has drifted before):
  // the consent row carries the Privacy Notice link, the notice is plain prose
  const withLink = textRows.filter((r) => r.querySelector('a[href]'));
  let consentRow = null;
  let notice = null;
  if (withLink.length === 1) {
    [consentRow] = withLink;
    [notice = null] = textRows.filter((r) => !r.querySelector('a[href]'));
  } else {
    [consentRow = null, notice = null] = textRows; // model order: consent, then notice
  }
  // the authored nodes keep the Privacy Notice <a> as a real link
  const consentNodes = consentRow && consentRow.textContent.trim()
    ? [...consentRow.childNodes]
    : [
      document.createTextNode(DEFAULT_CONSENT_TEXT),
      createEl('a', { href: DEFAULT_CONSENT_LINK_HREF }, DEFAULT_CONSENT_LINK_TEXT),
    ];

  const media = createEl('div', { class: 'media' }, picture);
  const body = createEl('div', { class: 'content' });

  // Get OTP / Resend / Submit have no data-cta: they're tracked as form events
  const back = createEl(
    'button',
    {
      type: 'button', class: 'back', 'data-action': 'back', 'data-cta': 'register-form:not-set:back',
    },
    createEl('span', { class: 'back-chevron', 'aria-hidden': 'true' }),
    ph('registerFormBack', 'Back'),
  );
  body.append(back);
  if (heading) body.append(heading);
  if (intro) {
    intro.classList.add('intro');
    body.append(intro);
  }

  const formId = 'register-form';

  // labelled text field: hidden <label>, input with floating label, error text
  const buildField = (name, {
    type = 'text', placeholder, label, required = true, errorMsg, ...inputAttrs
  }) => createEl(
    'div',
    { class: 'field' },
    createEl('label', { class: 'sr', for: `${formId}-${name}` }, label),
    createEl(
      'span',
      { class: 'input-wrap' },
      createEl('input', {
        class: 'input', id: `${formId}-${name}`, type, name, placeholder, ...inputAttrs, required,
      }),
      createEl('span', { class: 'float', 'aria-hidden': 'true' }, placeholder),
    ),
    createEl('p', { class: 'error', 'data-for': name, id: `${formId}-${name}-error` }, errorMsg),
  );

  const namesRow = createEl(
    'div',
    { class: 'row names' },
    buildField('firstname', {
      label: ph('registerFormFirstNameLabel', 'First name'),
      placeholder: firstNamePlaceholder,
      required: isFirstNameRequired,
      errorMsg: firstNameRequired,
      autocomplete: 'given-name',
      maxlength: NAME_MAX,
    }),
    buildField('lastname', {
      label: ph('registerFormLastNameLabel', 'Last name'),
      placeholder: lastNamePlaceholder,
      required: isLastNameRequired,
      errorMsg: lastNameRequired,
      autocomplete: 'family-name',
      maxlength: NAME_MAX,
    }),
  );

  const emailField = buildField('email', {
    type: 'email',
    label: ph('registerFormEmailLabel', 'Email address'),
    placeholder: emailPlaceholder,
    required: isEmailRequired,
    errorMsg: emailRequired,
    autocomplete: 'email',
    inputmode: 'email',
    // stops phone keyboards "correcting" the address (e.g. .co.in to .com)
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });

  // No maxlength: it would cut a pasted "560 001" before the input filter strips the space
  const pincodeField = buildField('pincode', {
    label: ph('registerFormPincodeLabel', 'Pincode'),
    placeholder: pincodePlaceholder,
    required: isPincodeRequired,
    errorMsg: pincodeRequired,
    autocomplete: 'postal-code',
    inputmode: 'numeric',
  });

  // country code and mobile share one row
  const mobileField = createEl(
    'div',
    { class: 'field' },
    createEl(
      'div',
      { class: 'row' },
      createEl('label', { class: 'sr', for: `${formId}-code` }, ph('registerFormCountryCode', 'Country code')),
      createEl('input', {
        class: 'input code',
        id: `${formId}-code`,
        name: 'code',
        type: 'text',
        value: DIAL_CODE,
        readonly: true,
        tabindex: '-1',
        'aria-readonly': 'true',
      }),
      createEl('label', { class: 'sr', for: `${formId}-mobile` }, ph('registerFormMobileLabel', 'Mobile number')),
      createEl(
        'span',
        { class: 'input-wrap' },
        createEl('input', {
          class: 'input',
          id: `${formId}-mobile`,
          type: 'tel',
          name: 'mobile',
          placeholder: mobilePlaceholder,
          autocomplete: 'tel',
          inputmode: 'numeric',
          maxlength: '10',
          required: true,
        }),
        createEl('span', { class: 'float', 'aria-hidden': 'true' }, mobilePlaceholder),
      ),
    ),
    createEl('p', { class: 'error', 'data-for': 'mobile', id: `${formId}-mobile-error` }, mobileRequired),
  );

  const consentField = createEl(
    'div',
    { class: 'field' },
    createEl(
      'label',
      { class: 'consent', for: `${formId}-consent` },
      createEl('input', {
        class: 'consent-check', id: `${formId}-consent`, type: 'checkbox', name: 'consent', required: true,
      }),
      createEl('span', { class: 'consent-text' }, ...consentNodes),
    ),
    createEl('p', { class: 'error', 'data-for': 'consent', id: `${formId}-consent-error` }, consentRequired),
  );

  const fieldsScreen = createEl(
    'div',
    { class: 'fields', 'data-screen': 'fields' },
    namesRow,
    emailField,
    pincodeField,
    mobileField,
    consentField,
    createEl('button', { class: 'submit', type: 'submit', 'data-action': 'get-otp' }, ph('registerFormGetOtp', 'Get OTP')),
    createEl('p', {
      class: 'status', role: 'status', 'aria-live': 'polite', 'data-status': 'fields',
    }),
  );

  const otpBoxEls = Array.from({ length: OTP_LENGTH }, (_, i) => createEl('input', {
    class: 'otp-box',
    type: 'text',
    inputmode: 'numeric',
    // room for the whole code (not 1): maxlength would clip an autofilled code
    // before fillFrom() can spread it
    maxlength: String(OTP_LENGTH),
    'aria-label': `Digit ${i + 1} of ${OTP_LENGTH}`,
    placeholder: 'X',
    // on every box: iOS offers "From Messages" only for the focused one
    autocomplete: 'one-time-code',
  }));

  const otpScreen = createEl(
    'div',
    { class: 'otp', 'data-screen': 'otp', hidden: true },
    createEl(
      'p',
      { class: 'otp-head' },
      `${ph('registerFormOtpHeadingPrefix', 'Enter the')} ${OTP_LENGTH} ${ph('registerFormOtpHeadingSuffix', 'Digit code sent on')} `,
      createEl('b', { class: 'otp-number' }),
      createEl('button', {
        type: 'button', class: 'change', 'data-action': 'change-number', 'data-cta': 'register-form:not-set:change-number',
      }, ph('registerFormChangeNumber', 'Change Number')),
    ),
    createEl('div', { class: 'otp-boxes' }, ...otpBoxEls),
    createEl('p', { class: 'otp-error', hidden: true }, ph('registerFormOtpInvalid', "That code isn't right. Check and try again.")),
    createEl(
      'p',
      { class: 'resend' },
      createEl('span', { class: 'resend-timer' }, `${ph('registerFormResendIn', 'Resend code in')} `, createEl('span', { class: 'timer' }, '0:30')),
      createEl('button', {
        type: 'button', class: 'resend-link', 'data-action': 'resend', disabled: true,
      }, ph('registerFormResend', 'Resend Code')),
    ),
    createEl('button', { class: 'submit', type: 'button', 'data-action': 'verify-otp' }, ph('registerFormSubmitOtp', 'Submit')),
    createEl('p', {
      class: 'status', role: 'status', 'aria-live': 'polite', 'data-status': 'otp',
    }),
  );

  const successScreen = createEl(
    'div',
    { class: 'success', 'data-screen': 'success', hidden: true },
    createEl('div', { class: 'check', 'aria-hidden': 'true' }, createEl('span', { class: 'icon icon-check check-icon', 'aria-hidden': 'true' })),
    createEl('h3', { class: 'success-title' }, ph('registerFormSuccessTitle', "You're in! A new kind of journey awaits.")),
    createEl('p', { class: 'success-text' }, ph('registerFormSuccessText', "The countdown to extraordinary begins. We'll be in touch soon with your exclusive experience details.")),
    createEl('a', { class: 'back-home', href: '/', 'data-cta': 'register-form:not-set:view' }, ph('registerFormBackHome', 'Back to Home')),
  );

  const form = createEl('form', { class: 'form', novalidate: true }, fieldsScreen, otpScreen, successScreen);
  body.append(form);

  if (notice && notice.textContent.trim()) {
    notice.classList.add('notice');
    body.append(notice);
  }

  block.replaceChildren(media, body);
  decorateIcons(block);

  const getOtpBtn = form.querySelector('[data-action="get-otp"]');
  const verifyBtn = form.querySelector('[data-action="verify-otp"]');
  const changeBtn = form.querySelector('[data-action="change-number"]');
  const resendLink = form.querySelector('[data-action="resend"]');
  const otpError = form.querySelector('.otp-error');
  const otpNumber = form.querySelector('.otp-number');
  const resendWrap = form.querySelector('.resend');
  const timerEl = form.querySelector('.timer');
  const statusEls = {
    fields: form.querySelector('[data-status="fields"]'),
    otp: form.querySelector('[data-status="otp"]'),
  };
  const fields = Object.fromEntries(['firstname', 'lastname', 'email', 'pincode', 'mobile', 'consent']
    .filter((name) => form[name])
    .map((name) => [name, form[name]]));

  const apiBase = resolveApiBase();
  const captcha = captchaLoader();

  // kept in this closure only: never storage, cookies, the DOM or the data layer
  let verificationToken = null;
  let screen = 'fields';
  let inFlight = false;
  // separate from inFlight: it must outlast the request that set it
  let otpLockedOut = false;

  // Analytics never receive personal values (names, email, phone, OTP, token);
  // only field names, stable error codes and status literals
  const dlComponent = componentOf(block);
  const formName = getMetadata('form-name') || 'register-interest';
  // each fires once per page load
  let firedFormView = false;
  let firedFormStart = false;
  let firedMobileEntered = false;
  const firedStripped = {};
  // form.firstField: the first field touched, reused by every event that reports it
  let firstFieldTouched = null;

  const track = (event, formData, increment = true) => dataLayerPush({
    event,
    form: { name: formName, ...formData },
    component: dlComponent,
    interaction: interaction(event, increment),
  });

  const trackFieldError = (step, errorField, errorCode, extra = {}, event = 'formError', increment = true) => track(event, {
    step, errorField, errorCode, errorDetail: dlKey(formName, errorField, errorCode), ...extra,
  }, increment);

  // last error code pushed per field, so re-validation doesn't repeat it
  const trackedErrorCode = {};

  // Get OTP reports every invalid field in one push, joined with "|" (the only
  // separator not used inside codes or authored values)
  const trackBulkFieldErrors = (step, entries) => {
    track('formError', {
      step,
      errorField: entries.map((entry) => entry.name).join('|'),
      errorCode: entries.map((entry) => entry.code).join('|'),
      errorDetail: dlKey(formName, ...entries.flatMap((entry) => [entry.name, entry.code])),
    });
    entries.forEach((entry) => { trackedErrorCode[entry.name] = entry.code; });
  };

  // validators return { msg, code }; msg is display-only, code goes to analytics
  const valid = { msg: '' };
  const nameValidator = (name, required, min, msgs, shortCode) => (el) => {
    const value = el.value.trim();
    if (!value) return required ? { msg: msgs.required, code: `${name}-required` } : valid;
    if (!NAME_RE.test(value)) return { msg: msgs.invalid, code: `${name}-invalid` };
    return value.length >= min ? valid : { msg: msgs.short, code: shortCode };
  };
  const validators = {
    firstname: nameValidator('firstname', isFirstNameRequired, 3, {
      required: firstNameRequired, invalid: firstNameInvalid, short: firstNameTooShort,
    }, 'firstname-too-short'),
    lastname: nameValidator('lastname', isLastNameRequired, 1, {
      required: lastNameRequired, invalid: lastNameInvalid, short: lastNameTooShort,
    }, 'lastname-invalid'),
    email: (el) => {
      const value = el.value.trim();
      if (!value) return isEmailRequired ? { msg: emailRequired, code: 'email-required' } : valid;
      // Same pattern as the backend's leadmap.js EMAIL regex — no domain/TLD allow-list.
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
        ? valid : { msg: emailInvalid, code: 'email-invalid-format' };
    },
    pincode: (el) => {
      const value = el.value.trim();
      if (!value) return isPincodeRequired ? { msg: pincodeRequired, code: 'pincode-required' } : valid;
      return PINCODE_RE.test(value) ? valid : { msg: pincodeInvalid, code: 'pincode-invalid-format' };
    },
    mobile: (el) => {
      const digits = el.value.replace(/\D/g, '');
      if (!digits) return { msg: mobileRequired, code: 'mobile-required' };
      return MOBILE_RE.test(digits) ? valid : { msg: mobileInvalid, code: 'mobile-invalid-format' };
    },
    consent: (el) => (el.checked ? valid : { msg: consentRequired, code: 'consent-required' }),
  };

  const fieldWrap = (el) => el.closest('.field');
  const errorEl = (name) => form.querySelector(`.error[data-for="${name}"]`);

  // floating label: the field is "filled" when it has a value
  const updateFilled = (el) => {
    const wrap = fieldWrap(el);
    if (!wrap) return;
    wrap.classList.toggle('is-filled', el.type === 'checkbox' ? el.checked : !!el.value.trim());
  };

  const clearError = (name) => {
    fieldWrap(fields[name]).classList.remove('has-error');
    fields[name].removeAttribute('aria-invalid');
    fields[name].removeAttribute('aria-describedby');
    trackedErrorCode[name] = null;
  };

  // Not colour alone: aria-invalid plus aria-describedby on the error text.
  // shouldTrack=false updates the UI only, where the caller pushes its own error.
  const showError = (name, message, errorCode, shouldTrack = true) => {
    fieldWrap(fields[name]).classList.add('has-error');
    errorEl(name).textContent = message;
    fields[name].setAttribute('aria-invalid', 'true');
    fields[name].setAttribute('aria-describedby', errorEl(name).id);
    if (!shouldTrack || trackedErrorCode[name] === errorCode) return;
    trackedErrorCode[name] = errorCode;
    trackFieldError('details', name, errorCode);
  };

  // only disabled in flight; validation runs on submit
  const refresh = () => { getOtpBtn.disabled = inFlight; };

  // fields the user has focused; only these validate on blur
  const touched = new Set();

  // strips what a field can't hold as it's typed or pasted; reported once per field
  const sanitize = (el, clean, errorCode) => {
    if (!el) return; // a field this form doesn't have
    el.addEventListener('input', () => {
      const cleaned = clean(el.value);
      if (cleaned === el.value) return;
      el.value = cleaned;
      if (firedStripped[el.name]) return;
      firedStripped[el.name] = true;
      trackFieldError('details', el.name, errorCode);
    });
  };
  // digits only, max 10, first digit 6-9
  sanitize(fields.mobile, (v) => v.replace(/\D/g, '').replace(/^[0-5]+/, '').slice(0, 10), 'mobile-input-rejected');
  // digits only, max 6, no leading 0
  sanitize(fields.pincode, (v) => v.replace(/\D/g, '').replace(/^0+/, '').slice(0, PINCODE_LENGTH), 'pincode-input-rejected');
  sanitize(fields.firstname, (v) => v.replace(/\P{L}/gu, ''), 'name-input-rejected');
  sanitize(fields.lastname, (v) => v.replace(/\P{L}/gu, ''), 'name-input-rejected');
  sanitize(fields.email, capTld, 'email-tld-too-long');

  // lowercase on blur, not per keystroke (which would move the caret)
  fields.email.addEventListener('blur', () => {
    const lower = fields.email.value.toLowerCase();
    if (lower !== fields.email.value) fields.email.value = lower;
  });

  Object.entries(fields).forEach(([name, el]) => {
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      // clear the error as soon as the field becomes valid
      if (fieldWrap(el).classList.contains('has-error')) {
        const { msg, code } = validators[name](el);
        if (msg) showError(name, msg, code); else clearError(name);
      }
      updateFilled(el);
      refresh();
    });

    // the consent checkbox validates on submit only
    if (el.type === 'checkbox') return;
    el.addEventListener('focus', () => {
      touched.add(name);
      if (firedFormStart) return;
      firedFormStart = true;
      firstFieldTouched = name;
      track('formStart', { step: 'details', firstField: name });
    });
    el.addEventListener('blur', () => {
      if (name === 'mobile' && !firedMobileEntered && MOBILE_RE.test(fields.mobile.value)) {
        firedMobileEntered = true;
        track('mobileEntered', { step: 'details', firstField: firstFieldTouched });
      }
      if (!touched.has(name)) return;
      const { msg, code } = validators[name](el);
      if (msg) showError(name, msg, code);
    });
  });

  const setStatus = (which, message, isError) => {
    const node = statusEls[which];
    node.textContent = message || '';
    node.classList.toggle('is-error', !!isError);
  };

  const setScreen = (name) => {
    screen = name;
    block.dataset.screen = name;
    form.querySelectorAll('[data-screen]').forEach((s) => block.classList.remove(`is-${s.dataset.screen}`));
    block.classList.add(`is-${name}`);
    form.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  };

  // what the lead-submit payload carries beyond the fields, and what a valid fields screen does
  // next: nothing more and Get OTP, except in the Booking style (register-form-booking.js)
  let leadExtras = () => ({});
  // eslint-disable-next-line no-use-before-define -- called only on submit, once all is defined
  let afterFieldsValid = () => requestCode(false);

  // resend timer
  let timerId = null;
  const stopTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };
  const startTimer = (seconds) => {
    stopTimer();
    let remaining = seconds;
    resendWrap.hidden = false; // hidden during a lockout
    resendWrap.classList.remove('can-resend');
    resendLink.disabled = true;
    const render = () => {
      timerEl.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    };
    render();
    timerId = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        render();
        return;
      }
      stopTimer();
      timerEl.textContent = '0:00';
      resendWrap.classList.add('can-resend');
      resendLink.disabled = false;
    }, 1000);
  };

  // OTP boxes
  const otpValue = () => otpBoxEls.map((b) => b.value).join('');
  const refreshVerify = () => {
    verifyBtn.disabled = inFlight || otpLockedOut || otpValue().length !== OTP_LENGTH;
  };
  const showOtpError = (msg) => {
    otpError.textContent = msg;
    otpError.hidden = false;
    otpBoxEls.forEach((b) => b.classList.add('is-error'));
  };
  const hideOtpError = () => {
    otpError.hidden = true;
    otpBoxEls.forEach((b) => b.classList.remove('is-error'));
  };
  // also lifts a lockout
  const clearOtpBoxes = () => {
    otpLockedOut = false;
    otpBoxEls.forEach((b) => {
      b.value = '';
      b.disabled = false;
    });
    hideOtpError();
    refreshVerify();
  };

  // Spreads digits across the boxes from `start` and focuses the first empty one.
  // OS code autofill (iOS "From Messages", Android SMS) puts the whole code in one box.
  const fillFrom = (start, raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, OTP_LENGTH - start);
    if (!digits) return;
    [...digits].forEach((d, n) => {
      const box = otpBoxEls[start + n];
      if (box) box.value = d;
    });
    hideOtpError();
    const next = otpBoxEls.findIndex((b) => !b.value);
    otpBoxEls[next === -1 ? OTP_LENGTH - 1 : next].focus();
    refreshVerify();
  };

  // a full code always starts at box 0, wherever it landed
  const fillStart = (digits, i) => (digits.length >= OTP_LENGTH ? 0 : i);

  otpBoxEls.forEach((boxInput, i) => {
    boxInput.addEventListener('input', () => {
      const digits = boxInput.value.replace(/\D/g, '');
      if (digits.length > 1) {
        boxInput.value = '';
        fillFrom(fillStart(digits, i), digits);
        return;
      }
      boxInput.value = digits;
      hideOtpError();
      if (boxInput.value && i < OTP_LENGTH - 1) otpBoxEls[i + 1].focus();
      refreshVerify();
    });
    boxInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !boxInput.value && i > 0) otpBoxEls[i - 1].focus();
    });
    boxInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '');
      fillFrom(fillStart(digits, i), digits);
    });
  });

  async function api(path, payload) {
    if (!apiBase) return { code: 'INTERNAL_ERROR' };
    try {
      const res = await fetch(`${apiBase}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      return json && json.code ? json : { code: 'INTERNAL_ERROR' };
    } catch {
      return { code: 'NETWORK' }; // includes a rejected origin (its 403 has no CORS headers)
    }
  }

  function busy(on) {
    inFlight = on;
    form.classList.toggle('is-busy', on);
    refresh();
    refreshVerify();
  }

  function surface(code, data = {}) {
    const spec = ERRORS[code] || ERRORS.INTERNAL_ERROR;
    // the server's message wins, except for INVALID_CODE (always our own copy)
    let msg = typeof data.message === 'string' && data.message.trim() && code !== 'INVALID_CODE'
      ? data.message : spec.msg;
    if (spec.retry && data.retryAfter) msg += ` Try again in ${Math.ceil(data.retryAfter / 60)} minute(s).`;

    if (spec.noResend) {
      stopTimer();
      resendWrap.classList.remove('can-resend');
      resendLink.disabled = true;
      resendWrap.hidden = true; // no frozen countdown; startTimer() shows it again
    }
    if (spec.allowResend) {
      stopTimer();
      timerEl.textContent = '0:00';
      resendWrap.classList.add('can-resend');
      resendLink.disabled = false;
    }
    if (spec.screen) {
      verificationToken = null;
      stopTimer();
      setScreen(spec.screen);
    }
    if (spec.lockout) {
      otpLockedOut = true;
      otpBoxEls.forEach((b) => { b.disabled = true; });
      refreshVerify();
    }

    // UI only: the callers push their own analytics for these
    if (spec.at === 'mobile') {
      showError('mobile', msg, undefined, false);
    } else if (spec.at === 'boxes' && screen === 'otp') {
      showOtpError(msg);
      // disabled boxes can't take focus
      (spec.lockout ? changeBtn : otpBoxEls[0]).focus();
      setStatus('otp', '');
    } else if (spec.at === 'boxes') {
      // e.g. LOCKED from otp-send while the OTP screen is hidden
      setStatus('fields', msg, true);
      setStatus('otp', '');
    } else {
      setStatus(spec.at === 'otp' ? 'otp' : 'fields', msg, true);
    }
  }

  // after a failed resend, hand the link back unless surface() took it away (lockout)
  const restoreResend = () => {
    if (!resendWrap.hidden && resendWrap.classList.contains('can-resend')) resendLink.disabled = false;
  };

  const phoneDigits = () => fields.mobile.value.replace(/\D/g, '');

  async function requestCode(isResend) {
    if (inFlight) return;
    busy(true);

    let captchaToken;
    if (captchaRequired()) {
      try {
        captchaToken = await captcha.token();
      } catch {
        busy(false);
        surface('CAPTCHA_FAILED');
        if (isResend) restoreResend();
        trackFieldError('otp-verify', 'captcha', 'captcha-failed', { otpStatus: 'failed' });
        return;
      }
    }

    // a resend reports otpResend instead
    if (!isResend) track('otpRequest', { step: 'otp-verify', otpStatus: 'requested' });
    const res = await api('otp-send', {
      phone: phoneDigits(),
      ...(captchaToken ? { captchaToken } : {}),
    });
    busy(false);

    if (res.code !== 'OTP_SENT') {
      surface(res.code, { ...res.data, message: res.message });
      if (isResend) restoreResend();
      trackFieldError('otp-verify', 'otp', OTP_SEND_ERROR_CODES[res.code] || 'otp-send-failed', { otpStatus: 'failed' });
      return;
    }

    if (isResend) track('otpResend', { step: 'otp-verify', otpStatus: 'resent' });
    else track('otpSent', { step: 'otp-verify', otpStatus: 'sent' });

    otpNumber.textContent = (res.data && res.data.maskedPhone) || `${DIAL_CODE} ${fields.mobile.value}`;
    clearOtpBoxes();
    setScreen('otp');
    setStatus('fields', '');
    startTimer((res.data && res.data.resendAfter) || 30);
    otpBoxEls[0].focus();
  }

  async function verifyAndSubmit() {
    // Enter in a digit box and the form's submit event reach here even with Submit disabled
    if (inFlight || otpLockedOut) return;
    if (otpValue().length !== OTP_LENGTH) {
      showOtpError("That code isn't right. Check and try again.");
      otpBoxEls[otpValue().length].focus();
      return;
    }
    busy(true);

    const verified = await api('otp-verify', { phone: phoneDigits(), code: otpValue() });

    if (verified.code !== 'OTP_VERIFIED') {
      busy(false);
      surface(verified.code, { ...verified.data, message: verified.message });
      trackFieldError('otp-verify', 'otp', OTP_VERIFY_ERROR_CODES[verified.code] || 'otp-invalid-code', { otpStatus: 'failed' });
      return;
    }

    stopTimer();
    verificationToken = verified.data.verificationToken;
    track('otpVerified', { step: 'otp-verify', otpStatus: 'verified' });

    // everything was collected on the first screen, so the lead is submitted now;
    // the API still takes a single fullName as well as the parts
    const q = new URLSearchParams(window.location.search);
    const firstName = fields.firstname.value.trim();
    const lastName = fields.lastname.value.trim();
    const email = fields.email.value.trim().toLowerCase();
    const pincode = fields.pincode?.value.trim() || '';
    const phone = phoneDigits();
    track('formSubmitAttempt', { step: 'confirm' });
    const created = await api('lead-submit', {
      fullName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      email,
      pincode,
      phone,
      consent: {
        granted: fields.consent.checked,
        text: form.querySelector('.consent-text').textContent.trim(),
      },
      verificationToken,
      ...leadExtras(),
      // current-page params win; persisted ones (scripts/utils/attribution.js)
      // fill in whatever this page doesn't carry
      utm: {
        ...getAttribution(),
        ...Object.fromEntries(
          Object.entries(UTM_PARAMS)
            .map(([k, param]) => [k, q.get(param) || ''])
            .filter(([, v]) => v !== ''),
        ),
      },
    });
    verificationToken = null; // single-use, consumed by the server either way
    busy(false);

    if (created.code !== 'LEAD_CREATED') {
      surface(created.code, { ...created.data, message: created.message });
      // no increment: it answers formSubmitAttempt and reports the same count
      trackFieldError('confirm', 'submit', 'submit-server-error', {}, 'formSubmitFailure', false);
      return;
    }

    const [hashedEmail, hashedPhone] = await Promise.all([sha256Hex(email), sha256Hex(phone)]);
    track('leadSubmit', {
      leadType: formName, leadStatus: 'submitted', hashedEmail, hashedPhone,
    }, false);

    if (redirectUrl) {
      // lets the thank-you page refuse direct visits (require-referral metadata, scripts.js)
      try {
        markReferral(new URL(redirectUrl, window.location.origin).pathname);
      } catch {
        // best effort; never block the redirect
      }
      // delayed so the leadSubmit beacon leaves first
      window.setTimeout(() => window.location.assign(redirectUrl), 300);
      return;
    }
    setScreen('success');
    setStatus('otp', '');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (screen !== 'fields' || inFlight) return;
    // show every error at once, reported as one combined push
    let firstInvalid = null;
    const invalidFields = [];
    // (only the fields the form has)
    Object.entries(validators).filter(([name]) => fields[name]).forEach(([name, fn]) => {
      const { msg, code } = fn(fields[name]);
      if (!msg) {
        clearError(name);
        return;
      }
      showError(name, msg, code, false);
      invalidFields.push({ name, code });
      firstInvalid = firstInvalid || fields[name];
    });
    if (invalidFields.length) {
      trackBulkFieldErrors('details', invalidFields);
      firstInvalid.focus();
      return;
    }
    afterFieldsValid();
  });

  verifyBtn.addEventListener('click', verifyAndSubmit);

  // also lifts a lockout: the server locks per number, so a new number is a way out
  const returnToFields = () => {
    stopTimer();
    verificationToken = null;
    clearOtpBoxes();
    setScreen('fields');
    setStatus('fields', '');
    fields.mobile.focus();
  };
  changeBtn.addEventListener('click', returnToFields);
  back.addEventListener('click', returnToFields);

  resendLink.addEventListener('click', () => {
    if (resendLink.disabled || inFlight) return;
    // off until startTimer() or restoreResend() hands it back
    resendLink.disabled = true;
    clearOtpBoxes();
    requestCode(true);
  });

  // CAPTCHA script loads on first mobile focus
  if (captchaRequired()) {
    fields.mobile.addEventListener('focus', () => { captcha.load().catch(() => {}); }, { once: true });
  }

  // autofilled / pre-filled values
  Object.values(fields).filter((el) => el.type !== 'checkbox').forEach(updateFilled);

  if (bookingModule) {
    const decorateBooking = await bookingModule;
    decorateBooking(block, {
      form,
      fields,
      ph,
      createEl,
      setScreen,
      getScreen: () => screen,
      requestCode: () => requestCode(false),
      requestSent: requestSentRow?.querySelector(':scope > div') || requestSentRow,
      map: {
        name: rowText(mapNameRow),
        address: rowText(mapAddressRow),
        coordinates: rowText(mapCoordsRow),
      },
      // Find Us Card (the Booking style's wayfind option): region, city, PIN, note
      wayfind: Object.fromEntries(['region', 'city', 'pin', 'note']
        .map((key, i) => [key, rowText(wayfindRows[i])])),
      setLeadExtras: (fn) => { leadExtras = fn; },
      setAfterFieldsValid: (fn) => { afterFieldsValid = fn; },
    });
  } else {
    setScreen('fields');
  }

  // formView: once the form has been at least half visible for 1s
  if ('IntersectionObserver' in window) {
    let viewTimer = null;
    const viewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (viewTimer || firedFormView) return;
          viewTimer = window.setTimeout(() => {
            firedFormView = true;
            viewObserver.disconnect();
            track('formView', { step: 'details', screenType: 'inline' });
          }, 1000);
        } else if (viewTimer) {
          window.clearTimeout(viewTimer);
          viewTimer = null;
        }
      });
    }, { threshold: [0.5] });
    viewObserver.observe(block);
  }

  window.addEventListener('pagehide', stopTimer, { once: true });
}
