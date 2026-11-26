import { loadScript } from '../aem.js';
import { getPlaceholder } from './common.js';

// OneTrust consent manager loader.
//
// The domain script ID is read from placeholders.json under the
// `onetrust-domain-script` key (OneTrust's "-test" ID outside production), so
// each environment's placeholders sheet decides which banner loads while the
// code stays identical on every branch. Without the key nothing is loaded.
//
// This only loads OneTrust. Adobe Launch (utils/analytics.js) loads on every
// page and applies the visitor's choice itself through its OneTrust integration.

const SDK_STUB = 'https://cdn.cookielaw.org/scripttemplates/otSDKStub.js';
// an authored link to this hash (e.g. "Cookie Settings" in the footer) opens
// the OneTrust preference centre
const SETTINGS_HASH = '#cookie-settings';

/**
 * Loads the OneTrust banner for the current environment. Non-critical: any
 * failure is swallowed to protect the page.
 */
export default async function loadConsentManager() {
  // Universal Editor renders pages from the AEM author host: no banner there
  if (window.location.hostname.endsWith('.adobeaemcloud.com')) return;

  const domainScript = await getPlaceholder('onetrust-domain-script');
  if (!domainScript) return;

  // OneTrust calls this on load and on every consent change; it must exist
  // before the SDK runs
  window.OptanonWrapper = window.OptanonWrapper || (() => {});

  document.addEventListener('click', (e) => {
    const link = e.target.closest(`a[href$="${SETTINGS_HASH}"]`);
    if (!link || !window.OneTrust?.ToggleInfoDisplay) return;
    e.preventDefault();
    window.OneTrust.ToggleInfoDisplay();
  });

  loadScript(SDK_STUB, {
    'data-domain-script': domainScript,
    'data-document-language': 'true',
    charset: 'UTF-8',
  }).catch(() => {});
}
