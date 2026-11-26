// add delayed functionality here
import loadAnalytics from './utils/analytics.js';

// Adobe Launch (and the tags it loads) runs in the delayed phase so it never
// competes with page load. The data layer and the pageView push are set up in
// the eager phase (scripts.js); Launch processes whatever is already queued.
loadAnalytics().catch(() => {});
