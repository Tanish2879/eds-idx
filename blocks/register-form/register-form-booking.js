// Register Form "Booking" style, loaded by register-form.js only when the style is used: the
// dealer microsite's "Get a quote" request, as in the dealer design:
//   the details screen ("Tell us about you": names, email optional, pincode, mobile, consent;
//     the privacy notice above "Continue"), then the existing journey:
//   the OTP screen in a pop-up ("Verify your number": the code boxes, resend, Change number
//     and Submit, a close button), and after the lead is created
//   the "Request sent" pop-up: the authored Request Sent field (title, label rows, status line,
//     a link as the outlined button) plus the visitor's email and their contact;
//     Done closes it and clears the form.
// On phones (below 900px) the map card moves under the details, above Continue, as in the
// dealer mobile design; desktop keeps it beside the form.
// The pop-ups are <dialog>s inside the form (the screens keep their data-screen and the
// form's own handlers); the details stay behind them; on phones they are bottom sheets
// (register-form-booking.css). A Thank-you Page Link still wins over
// the Request sent pop-up (register-form.js redirects).
// The lead-submit payload gains only the dealer microsite's lead source: source "Dealer
// Microsite", channel "Digital", subsource "" (placeholders registerFormBookingSource /
// Channel / Subsource override them); the lead API takes no other extra fields.
// The deep links #quote and #test-drive (the hero's and price bar's buttons) bring the form
// into view.

const ANCHORS = ['quote', 'test-drive'];
const LEAD_SOURCE = {
  source: 'Dealer Microsite',
  channel: 'Digital',
  subsource: '',
};
const MODAL_OPEN = 'is-modal-open'; // pauses the section snap (scripts/section-snap.js)
const CLOSE_ICON = '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">'
  + '<path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

const mobileLabel = (digits) => (digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits);

/**
 * The bold label a paragraph starts with, or null.
 * @param {HTMLParagraphElement} p
 * @returns {Element|null}
 */
function leadingLabel(p) {
  const first = [...p.childNodes]
    .find((n) => n.nodeType !== Node.TEXT_NODE || n.textContent.trim());
  return first?.nodeType === Node.ELEMENT_NODE && first.matches('strong, b') ? first : null;
}

/**
 * Reads the authored Request Sent field.
 * @param {Element|null} cell
 * @returns {{title: string, rows: Array<[string, string]>, status: string, link: Element|null}}
 */
function readRequestSent(cell) {
  const out = {
    title: '', rows: [], status: '', link: null,
  };
  if (!cell) return out;
  const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) out.title = heading.textContent.trim();
  cell.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    if (!text) return;
    const a = p.querySelector('a[href]');
    if (a && !out.link) {
      out.link = a;
      return;
    }
    const label = leadingLabel(p);
    if (label) {
      out.rows.push([label.textContent.trim(), text.slice(label.textContent.length).trim()]);
      return;
    }
    if (!out.title) out.title = text;
    else if (!out.status) out.status = text;
  });
  return out;
}

/**
 * The map card: with a Map Address, a Google Maps embed of that address (centred on it, in
 * grey) over the authored image (kept as the fallback while it loads or if it can't), the
 * dealer's pin on the address and the pop-up above it (Map Pop-up Name + the address). The
 * embed is a still picture (it would otherwise take the wheel and stop the section snap):
 * the whole card opens the address in Google Maps instead.
 * @param {Element} block the register form
 * @param {{name: string, address: string}} map the authored map fields
 * @param {Function} createEl register-form.js's element helper
 * @param {Function} ph placeholder lookup
 */
function buildMap(block, map, createEl, ph) {
  const media = block.querySelector(':scope > .media');
  const address = map?.address || '';
  if (!media || !address) return;
  const name = map.name || '';
  const query = encodeURIComponent(address);
  const label = [name, address].filter(Boolean).join(', ');
  const frame = createEl('iframe', {
    class: 'booking-map-frame',
    src: `https://maps.google.com/maps?q=${query}&z=15&output=embed`,
    title: `${ph('registerFormBookingMapTitle', 'Map')}: ${label}`,
    loading: 'lazy',
    referrerpolicy: 'no-referrer-when-downgrade',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  frame.addEventListener('load', () => media.classList.add('is-map-loaded'));
  const pin = createEl('span', { class: 'booking-map-pin', 'aria-hidden': 'true' });
  const tip = createEl(
    'div',
    { class: 'booking-map-tip', 'aria-hidden': 'true' },
    name ? createEl('strong', { class: 'booking-map-name' }, name) : null,
    createEl('span', { class: 'booking-map-address' }, address),
  );
  const open = createEl('a', {
    class: 'booking-map-open',
    href: `https://www.google.com/maps/search/?api=1&query=${query}`,
    target: '_blank',
    rel: 'noopener',
    'aria-label': `${ph('registerFormBookingMapOpen', 'Open in Google Maps')}: ${label}`,
  });
  media.classList.add('has-map');
  media.append(frame, pin, tip, open);
}

/**
 * @param {Element} block the register form
 * @param {object} ctx built by register-form.js
 */
export default function decorateBooking(block, {
  form, fields, ph, createEl, setScreen, requestSent, map, setLeadExtras,
}) {
  const sent = readRequestSent(requestSent);
  // eslint-disable-next-line no-use-before-define -- a function declaration below
  buildMap(block, map, createEl, ph);

  const actions = (...buttons) => createEl('div', { class: 'booking-actions' }, ...buttons);

  // --- the details screen ---
  const fieldsScreen = form.querySelector('[data-screen="fields"]');
  const notice = block.querySelector('.content > .notice');
  fieldsScreen.prepend(createEl('h3', { class: 'booking-step-title' }, ph('registerFormBookingAbout', 'Tell us about you')));
  const getOtpBtn = fieldsScreen.querySelector('[data-action="get-otp"]');
  const fieldsActions = actions();
  if (getOtpBtn) {
    getOtpBtn.textContent = ph('registerFormBookingContinue', 'Continue');
    getOtpBtn.before(fieldsActions);
    fieldsActions.append(getOtpBtn);
  } else {
    fieldsScreen.append(fieldsActions);
  }
  // the notice goes with the details the visitor gives, above the button
  if (notice) fieldsActions.before(notice);

  // phones: the map card sits under the details, above Continue, as the mobile design orders
  // them; desktop keeps it beside the form (first in the block, where register-form.js put it)
  const media = block.querySelector(':scope > .media');
  const onPhone = window.matchMedia('(width < 900px)');
  const placeMap = () => {
    if (onPhone.matches) fieldsActions.before(media);
    else if (media.parentElement !== block) block.prepend(media);
  };
  if (media) {
    placeMap();
    onPhone.addEventListener('change', placeMap);
    // squeezed below 90 design px (short screens, error lines) it hides and keeps its room,
    // as in the design; 1 design px = the phone CSS's --rfb-u
    const designPx = () => Math.max(
      0.8,
      Math.min(window.innerWidth / 375, window.innerHeight / 640, 1.6),
    );
    new ResizeObserver(() => {
      media.classList.toggle('is-tiny', onPhone.matches && media.clientHeight < 90 * designPx());
    }).observe(media);
  }

  // --- the pop-ups: <dialog>s in the form, each holding one of its screens ---
  const modal = (screen, labelId) => {
    const dialog = createEl('dialog', { class: 'booking-modal', 'aria-labelledby': labelId });
    screen.after(dialog);
    dialog.append(screen);
    return dialog;
  };

  // OTP: "Verify your number", the code sent to …, the boxes, resend, Change number + Submit
  const otpScreen = form.querySelector('[data-screen="otp"]');
  const otpTitleId = `${block.id || 'register-form'}-otp-title`;
  const otpDialog = otpScreen ? modal(otpScreen, otpTitleId) : null;
  const changeBtn = otpScreen?.querySelector('[data-action="change-number"]');
  if (otpScreen) {
    otpScreen.prepend(createEl('h3', { class: 'booking-modal-title', id: otpTitleId }, ph('registerFormBookingOtpTitle', 'Verify your number')));
    const close = createEl('button', {
      type: 'button', class: 'booking-modal-close', 'aria-label': ph('registerFormBookingClose', 'Close'),
    });
    close.insertAdjacentHTML('beforeend', CLOSE_ICON);
    close.addEventListener('click', () => changeBtn?.click());
    otpScreen.prepend(close);
    const verifyBtn = otpScreen.querySelector('[data-action="verify-otp"]');
    if (verifyBtn) {
      const otpActions = actions();
      verifyBtn.before(otpActions);
      if (changeBtn) {
        changeBtn.classList.add('booking-back');
        otpActions.append(changeBtn);
      }
      otpActions.append(verifyBtn);
    }
    // the first box takes the focus when the pop-up opens
    otpScreen.querySelector('.otp-box')?.setAttribute('autofocus', '');
  }

  // Request sent: the authored title, the visitor's email, the rows, the status
  const successScreen = form.querySelector('[data-screen="success"]');
  const sentTitleId = `${block.id || 'register-form'}-sent-title`;
  const sentDialog = successScreen ? modal(successScreen, sentTitleId) : null;
  const sentSub = createEl('p', { class: 'booking-modal-sub' });
  const sentRows = createEl('dl', { class: 'booking-summary booking-sent-rows' });
  const doneBtn = createEl('button', { type: 'button', class: 'submit booking-done', autofocus: true }, ph('registerFormBookingDone', 'Done'));
  if (successScreen) {
    let alt = null;
    if (sent.link) {
      alt = createEl('a', { class: 'booking-back booking-sent-alt', href: sent.link.getAttribute('href') }, sent.link.textContent.trim());
    }
    successScreen.replaceChildren(
      createEl('h3', { class: 'booking-modal-title', id: sentTitleId }, sent.title || ph('registerFormBookingSuccessTitle', 'Request sent')),
      sentSub,
      sentRows,
      sent.status ? createEl('p', { class: 'booking-sent-status' }, sent.status) : null,
      actions(alt, doneBtn),
    );
  }

  const fillSent = () => {
    const email = fields.email?.value.trim() || '';
    const digits = fields.mobile?.value.replace(/\D/g, '') || '';
    const phone = digits ? `+91 ${mobileLabel(digits)}` : '';
    const name = `${fields.firstname?.value.trim() || ''} ${fields.lastname?.value.trim() || ''}`.trim();
    const where = email
      ? `${ph('registerFormBookingSentCopy', 'A copy is on its way to')} ${email}.`
      : `${ph('registerFormBookingSentCall', 'We will call you on')} ${phone}.`;
    sentSub.textContent = where;
    const rows = [...sent.rows, [ph('registerFormBookingContactTerm', 'Contact'), [name, phone].filter(Boolean).join(', ')]];
    sentRows.replaceChildren(...rows.filter(([, value]) => value)
      .flatMap(([term, value]) => [createEl('dt', {}, term), createEl('dd', {}, value)]));
  };

  // open / close the pop-up of the screen the form is on (register-form.js sets data-screen)
  const root = document.documentElement;
  const show = (dialog) => {
    if (dialog && !dialog.open) dialog.showModal();
  };
  const hide = (dialog) => {
    if (dialog?.open) dialog.close();
  };
  const sync = () => {
    const { screen } = block.dataset;
    if (screen === 'success') {
      hide(otpDialog);
      fillSent();
      show(sentDialog);
    } else if (screen === 'otp') {
      // the number as the design writes it, "+91 98765 43210" (display only)
      const number = otpScreen?.querySelector('.otp-number');
      if (number) number.textContent = number.textContent.replace(/^(\+91)\s*(\d{5})(\d{5})$/, '$1 $2 $3');
      hide(sentDialog);
      show(otpDialog);
    } else {
      hide(otpDialog);
      hide(sentDialog);
    }
    root.classList.toggle(MODAL_OPEN, !!(otpDialog?.open || sentDialog?.open));
  };
  new MutationObserver(sync).observe(block, { attributes: true, attributeFilter: ['data-screen'] });

  // Done: the pop-up closes and the form starts over, empty
  const done = () => {
    ['firstname', 'lastname', 'email', 'pincode', 'mobile'].forEach((name) => {
      const el = fields[name];
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (fields.consent?.checked) fields.consent.click();
    setScreen('fields');
  };
  doneBtn.addEventListener('click', done);
  // the outlined link (e.g. Explore the Combat) closes the pop-up before it goes
  successScreen?.querySelector('.booking-sent-alt')?.addEventListener('click', done);
  // Esc: the OTP pop-up goes back to the details (as Change number), Request sent is Done
  otpDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    changeBtn?.click();
  });
  sentDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    done();
  });

  setLeadExtras(() => ({
    source: ph('registerFormBookingSource', LEAD_SOURCE.source),
    channel: ph('registerFormBookingChannel', LEAD_SOURCE.channel),
    subsource: ph('registerFormBookingSubsource', LEAD_SOURCE.subsource),
  }));

  // #quote / #test-drive: bring the form into view
  const fromHash = () => {
    if (!ANCHORS.includes(window.location.hash.slice(1))) return;
    block.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();

  setScreen('fields');
}
