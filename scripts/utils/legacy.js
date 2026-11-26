/*
 * Older browsers (iOS Safari < 17.2, Chrome < 120) can't read nested CSS or range media queries
 * such as (width >= 900px). Only on those, screen-size checks in JS are rewritten here and the
 * stylesheets are flattened by legacy-css.js. Other browsers stop at the check.
 */

/** @returns {boolean} true when the browser can't read nested rules like `a { b {} }` */
function lacksNesting() {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('a{b{color:red}}');
    return sheet.cssRules[0].cssRules?.length !== 1;
  } catch (e) {
    return true;
  }
}

const STEP = { px: 0.02, em: 0.001, rem: 0.001 };
const FLIP = {
  '<': '>', '<=': '>=', '>': '<', '>=': '<=',
};

const feature = (name, op, value, unit) => {
  const n = Number(value);
  if (op === '>=') return `(min-${name}: ${n}${unit})`;
  if (op === '>') return `(min-${name}: ${+(n + STEP[unit]).toFixed(3)}${unit})`;
  if (op === '<=') return `(max-${name}: ${n}${unit})`;
  return `(max-${name}: ${+(n - STEP[unit]).toFixed(3)}${unit})`;
};

/**
 * Rewrites range media features as min-/max- ones: (width >= 900px) is (min-width: 900px),
 * (width < 900px) is (max-width: 899.98px), (600px <= width < 900px) both.
 * @param {string} query
 * @returns {string}
 */
export default function translateMedia(query) {
  const N = '(-?[\\d.]+)(px|r?em)';
  const F = '(width|height)';
  return query
    .replace(
      new RegExp(`\\(\\s*${N}\\s*(<=?)\\s*${F}\\s*(<=?)\\s*${N}\\s*\\)`, 'g'),
      (m, a, au, op1, name, op2, b, bu) => `${feature(name, FLIP[op1], a, au)} and ${feature(name, op2, b, bu)}`,
    )
    .replace(
      new RegExp(`\\(\\s*${F}\\s*([<>]=?)\\s*${N}\\s*\\)`, 'g'),
      (m, name, op, n, unit) => feature(name, op, n, unit),
    )
    .replace(
      new RegExp(`\\(\\s*${N}\\s*([<>]=?)\\s*${F}\\s*\\)`, 'g'),
      (m, n, unit, op, name) => feature(name, FLIP[op], n, unit),
    );
}

if (lacksNesting()) {
  document.documentElement.classList.add('legacy-css');
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => matchMedia(translateMedia(String(query)));
  // eslint-disable-next-line import/no-cycle
  import('./legacy-css.js');
}
