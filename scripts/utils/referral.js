// Marks that a visitor arrived at a page via a genuine in-app redirect
// (e.g. register-form's post-submit thank-you page), so that page can opt
// out of rendering for anyone who navigated to it directly.
//
// NOT a security boundary: EDS pages are static and publicly served, so
// nothing here stops a determined visitor from setting the marker
// themselves. This only stops casual direct access — bookmarks, shared
// links, crawlers, a stray internal link — which is the actual, common case
// for a page like /thank-you.
//
// sessionStorage is what makes this the right shape for it: a fresh tab
// (bookmark, shared link, a new visit days later) has none, but a genuine
// visitor refreshing or using back/forward within the SAME tab still sees
// their own marker, so the page they just earned stays usable.

const PREFIX = 'jsw:referred:';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** Call right before redirecting a visitor to `path` after a real action. */
export function markReferral(path) {
  try {
    sessionStorage.setItem(`${PREFIX}${path}`, String(Date.now()));
  } catch {
    // Storage can throw in a locked-down context (private mode, disabled
    // storage). Best-effort only — never block the redirect itself over it.
  }
}

/** True if the CURRENT page was reached via a markReferral() call for it,
 *  within `ttlMs` (default 30 minutes). */
export function wasReferred(pathname, ttlMs = DEFAULT_TTL_MS) {
  let markedAt = 0;
  try {
    markedAt = Number(sessionStorage.getItem(`${PREFIX}${pathname}`)) || 0;
  } catch {
    return false;
  }
  return markedAt > 0 && Date.now() - markedAt < ttlMs;
}
