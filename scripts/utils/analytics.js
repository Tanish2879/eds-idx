import { loadScript } from '../aem.js';
import { getPlaceholder } from './common.js';

// Adobe Launch (DTM) analytics loader.
//
// The script URL is read from placeholders.json under the `analytics-script`
// key. Each environment (dev/stage/prod) has its own placeholders sheet, so the
// value changes per environment while the code stays identical on every branch —
// merging develop -> main never changes which script loads, and authors can
// update the URL without a code deploy.

/**
 * Loads the Adobe Launch script for the current environment. The URL is read
 * from placeholders.json so it can be changed per environment without a code
 * deploy. Analytics is non-critical, so any failure is swallowed to protect the
 * page.
 */
export default async function loadAnalytics() {
  const src = await getPlaceholder('analytics-script');
  if (src) loadScript(src, { async: '' });
}
