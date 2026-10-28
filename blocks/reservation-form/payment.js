/*
 * Razorpay payment for the reservation form (loaded only once a visitor proceeds to pay).
 *   1. order      with a payment service: it creates the Razorpay order (the amount is set there,
 *                 with the Key Secret, never in the page); without one: test mode, page amount
 *   2. checkout   Razorpay's Standard Checkout window (checkout.js, loaded on demand)
 *   3. verify     Razorpay's success callback is checked by the payment service (the signature,
 *                 made with the Key Secret) while a "verifying" window is shown
 * pay() resolves with the outcome: { state: 'paid' | 'failed' | 'cancelled' | 'unavailable', … }.
 * Only the public Key ID is ever in the page.
 */

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const THEME = '#000000';
let checkoutLoading = null;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false && v !== null) node.setAttribute(k, v === true ? '' : v);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

// Razorpay's checkout.js (once per page; tried again after a failed load)
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  checkoutLoading ||= new Promise((resolve, reject) => {
    const script = el('script', { src: CHECKOUT_SCRIPT, async: true });
    script.addEventListener('load', () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('checkout'))));
    script.addEventListener('error', () => {
      checkoutLoading = null;
      script.remove();
      reject(new Error('checkout'));
    });
    document.head.append(script);
  });
  return checkoutLoading;
}

/*hello 

// a POST to the payment service, its JSON answer (an error for any non-2xx answer)
async function call(service, path, body) {
  const res = await fetch(`${service.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${res.status}`);
  return json;
}

/*
 * The "verifying your payment" window, in the style of Razorpay's checkout (its card with the
 * merchant's name over the page, dimmed); it can't be closed while the check runs.
 */
function verifyingWindow(merchant, amount) {
  const title = el('p', { class: 'rf-pay-title', id: 'rf-pay-title' }, 'Verifying your payment');
  const card = el(
    'div',
    {
      class: 'rf-pay-card',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-labelledby': 'rf-pay-title',
      'aria-describedby': 'rf-pay-text',
      'aria-busy': 'true',
      tabindex: '-1',
    },
    el(
      'div',
      { class: 'rf-pay-header' },
      el('span', { class: 'rf-pay-merchant' }, merchant),
      amount ? el('span', { class: 'rf-pay-amount' }, amount) : null,
    ),
    el(
      'div',
      { class: 'rf-pay-body' },
      el('span', { class: 'rf-pay-spinner', 'aria-hidden': 'true' }),
      title,
      el('p', { class: 'rf-pay-text', id: 'rf-pay-text' }, 'This takes a few seconds. Please don’t close this window or press back.'),
    ),
    el('p', { class: 'rf-pay-footer' }, 'Secured by ', el('strong', {}, 'Razorpay')),
  );
  const overlay = el('div', { class: 'rf-pay-overlay' }, card);
  document.body.append(overlay);
  document.documentElement.classList.add('rf-pay-open');
  card.focus();
  return {
    set(text) { title.textContent = text; },
    close() {
      overlay.remove();
      document.documentElement.classList.remove('rf-pay-open');
    },
  };
}

// the checkout window: resolves with Razorpay's success response, its failure, or a dismissal
function openCheckout(Razorpay, options) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const checkout = new Razorpay({
      ...options,
      handler: (response) => settle({ state: 'authorized', response }),
      modal: {
        ondismiss: () => settle({ state: 'cancelled' }),
        confirm_close: true,
        escape: true,
      },
    });
    // a declined / failed attempt: Razorpay's window is closed, the failure page takes over
    checkout.on('payment.failed', ({ error = {} } = {}) => {
      settle({
        state: 'failed',
        reason: error.description || '',
        code: error.code || '',
        paymentId: error.metadata?.payment_id || '',
        orderId: error.metadata?.order_id || options.order_id || '',
      });
      checkout.close();
    });
    checkout.open();
  });
}

/**
 * Takes the payment.
 * @param {object} config keyId, service (payment service URL, optional), amount (rupees, used
 *   without a service), merchant, description, displayAmount (as shown, e.g. ₹10,000)
 * @param {object} data the form's cleaned values (prefill and the order's notes)
 */
export default async function pay(config, data) {
  const customer = {
    name: [data.firstName, data.lastName].filter(Boolean).join(' '),
    email: data.email || '',
    contact: data.mobile || '',
  };
  // 1. the order (amount, currency, the key it belongs to) from the payment service
  let order = null;
  if (config.service) {
    try {
      order = await call(config.service, '/orders', { customer: data });
    } catch (e) {
      return { state: 'unavailable', step: 'order' };
    }
  } else if (!(config.amount > 0)) {
    return { state: 'unavailable', step: 'amount' };
  } else {
    // eslint-disable-next-line no-console
    console.warn('reservation-form: no payment service set, the payment is not verified (test mode only)');
  }

  // 2. Razorpay's checkout window
  let Razorpay;
  try {
    Razorpay = await loadCheckout();
  } catch (e) {
    return { state: 'unavailable', step: 'checkout' };
  }
  const notes = Object.fromEntries(Object.entries(data).slice(0, 15)
    .map(([k, v]) => [k, String(v).slice(0, 250)]));
  const result = await openCheckout(Razorpay, {
    key: order?.keyId || config.keyId,
    amount: order ? order.amount : Math.round(config.amount * 100),
    currency: order?.currency || 'INR',
    order_id: order?.orderId,
    name: config.merchant,
    description: config.description,
    prefill: customer,
    notes: order ? undefined : notes,
    theme: { color: THEME },
    retry: { enabled: false },
  });
  if (result.state !== 'authorized') return result;

  // 3. the payment checked with the payment service (the signature only it can make)
  const {
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId = '',
    razorpay_signature: signature = '',
  } = result.response;
  if (!config.service) {
    return {
      state: 'paid', paymentId, orderId, verified: false,
    };
  }
  const verifying = verifyingWindow(config.merchant, config.displayAmount);
  try {
    const check = await call(config.service, '/verify', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    });
    if (!check.verified) throw new Error('not verified');
    verifying.set('Payment verified');
    return {
      state: 'paid', paymentId, orderId, verified: true, close: verifying.close,
    };
  } catch (e) {
    verifying.close();
    return {
      state: 'failed',
      reason: 'We couldn’t verify your payment.',
      code: 'VERIFICATION_FAILED',
      paymentId,
      orderId,
    };
  }
}
