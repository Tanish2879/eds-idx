// Persists UTM/click-id attribution across page navigation
// Keeps both a first-touch (written once, never overwritten) and a
// last-touch (overwritten whenever a page actually carries attribution
// params) record. Only last-touch has a reader today (register-form.js);
// first-touch is captured for future reporting use.

const PREFIX = 'jsw:attribution:';
// Attribution older than this is treated as stale rather than crediting a
// months-old click.
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PARAM_NAMES = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

/** Attribution params present on the CURRENT URL, if any. */
function readCurrentParams() {
  const q = new URLSearchParams(window.location.search);
  const found = {};
  Object.entries(PARAM_NAMES).forEach(([key, param]) => {
    const value = q.get(param);
    if (value) found[key] = value;
  });
  return found;
}

function readStored(name) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${name}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(name, data) {
  try {
    localStorage.setItem(`${PREFIX}${name}`, JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    // Storage can throw in a locked-down context (private mode, disabled
    // storage). Best-effort only.
  }
}

/** Call on every page load. A no-op when the current URL carries no
 *  attribution params, so navigating to an unrelated page never clobbers
 *  what was already captured. */
export function captureAttribution() {
  const found = readCurrentParams();
  if (Object.keys(found).length === 0) return;
  if (!readStored('first')) writeStored('first', found);
  writeStored('last', found);
}

/** The last-touch attribution, if captured within `ttlMs` (default 30 days).
 *  Returns only the keys actually present — never forced blanks. */
export function getAttribution(ttlMs = DEFAULT_TTL_MS) {
  const stored = readStored('last');
  if (!stored || typeof stored.ts !== 'number' || Date.now() - stored.ts > ttlMs) return {};
  const out = {};
  Object.keys(PARAM_NAMES).forEach((key) => {
    if (stored[key]) out[key] = stored[key];
  });
  return out;
}
