/*
 * Payment service for the reservation form (a Cloudflare Worker; setup: tools/payments/README.md).
 * It holds the Razorpay Key Secret, which must never be in the website or its content:
 *   POST /orders   creates the Razorpay order for the reservation amount (set here, not by the
 *                  page): { customer } → { orderId, amount, currency, keyId }
 *   POST /verify   checks Razorpay's success response (the signature of order_id|payment_id made
 *                  with the Key Secret) and that the payment belongs to the order:
 *                  { razorpay_order_id, razorpay_payment_id, razorpay_signature } → { verified }
 *   POST /webhook  Razorpay's webhook (payment.captured, payment.failed, order.paid), checked with
 *                  the webhook secret; the server-side record of every payment
 * Settings (Worker variables; the secrets as encrypted secrets):
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 *   RESERVATION_AMOUNT_PAISE  e.g. 1000000 (₹10,000)
 *   ALLOWED_ORIGINS           the site's addresses, comma-separated; * matches one name part, e.g.
 *                             https://*--eds-idx--tanish2879.aem.page,https://www.jswmotors.com
 * Switching to other credentials (e.g. JSW's live keys) means changing these settings only.
 */

const API = 'https://api.razorpay.com/v1';
const NOTE_KEYS = ['firstName', 'lastName', 'mobile', 'email', 'city'];

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
});

function allowedOrigin(origin, env) {
  if (!origin) return '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  const match = allowed.some((pattern) => {
    const source = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+');
    return new RegExp(`^${source}$`, 'i').test(origin);
  });
  return match ? origin : '';
}

function corsHeaders(origin) {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : { Vary: 'Origin' };
}

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

// compares two hex strings in constant time
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  // eslint-disable-next-line no-bitwise
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function razorpay(env, path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
      'Content-Type': 'application/json',
    },
  });
}

async function createOrder(request, env, cors) {
  const amount = parseInt(env.RESERVATION_AMOUNT_PAISE || '1000000', 10);
  const { customer = {} } = await request.json().catch(() => ({}));
  // the order's notes: the reservation's details (shown in the Razorpay dashboard), kept short
  const notes = Object.fromEntries(NOTE_KEYS
    .filter((k) => typeof customer[k] === 'string' && customer[k])
    .map((k) => [k, customer[k].slice(0, 120)]));
  const receipt = `rsv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const res = await razorpay(env, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount, currency: 'INR', receipt, notes,
    }),
  });
  if (!res.ok) return json({ error: 'Could not create the order' }, 502, cors);
  const order = await res.json();
  return json({
    orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.RAZORPAY_KEY_ID,
  }, 200, cors);
}

async function verify(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const {
    razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
  } = body;
  if (!orderId || !paymentId || !signature) return json({ verified: false, error: 'Missing fields' }, 400, cors);
  const expected = await hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  if (!same(expected, signature)) return json({ verified: false }, 400, cors);
  // the payment itself: for this order, and taken (captured) or about to be (authorized)
  const res = await razorpay(env, `/payments/${encodeURIComponent(paymentId)}`);
  if (!res.ok) return json({ verified: false, error: 'Could not read the payment' }, 502, cors);
  const payment = await res.json();
  const verified = payment.order_id === orderId && ['captured', 'authorized'].includes(payment.status);
  return json({ verified, status: payment.status }, verified ? 200 : 400, cors);
}

async function webhook(request, env) {
  const raw = await request.text();
  const expected = await hmac(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!same(expected, request.headers.get('X-Razorpay-Signature') || '')) return json({ ok: false }, 400);
  const event = JSON.parse(raw);
  const payment = event.payload?.payment?.entity || {};
  // the record of the payment (Workers logs); forward it to the CRM / a database here
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    event: event.event,
    paymentId: payment.id,
    orderId: payment.order_id,
    status: payment.status,
    amount: payment.amount,
    email: payment.email,
    error: payment.error_description,
  }));
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/webhook' && request.method === 'POST') return webhook(request, env);
    const cors = corsHeaders(allowedOrigin(request.headers.get('Origin'), env));
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    try {
      if (pathname === '/orders') return await createOrder(request, env, cors);
      if (pathname === '/verify') return await verify(request, env, cors);
    } catch (e) {
      return json({ error: 'Payment service error' }, 500, cors);
    }
    return json({ error: 'Not found' }, 404, cors);
  },
};
