/*
 * Loaded by legacy.js only on browsers without CSS nesting. Each same-origin stylesheet is read
 * again and flattened (nested rules and nested @media unwrapped, range media queries rewritten)
 * into a <style> right after its <link>, so the cascade order stays the same.
 */
// eslint-disable-next-line import/no-cycle
import translateMedia from './legacy.js';

/**
 * Reads CSS into a tree: declarations as strings, blocks as { prelude, items }.
 * @param {string} css
 * @returns {Array<string|{prelude: string, items: Array}>}
 */
function parse(css) {
  let i = 0;
  const block = () => {
    const items = [];
    let buf = '';
    let depth = 0;
    const flush = () => {
      const text = buf.trim();
      if (text) items.push(text);
      buf = '';
    };
    while (i < css.length) {
      const c = css[i];
      if (c === '/' && css[i + 1] === '*') {
        const end = css.indexOf('*/', i + 2);
        i = end < 0 ? css.length : end + 2;
      } else if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
        buf += css.slice(i, j + 1);
        i = j + 1;
      } else {
        i += 1;
        if (c === '(') depth += 1;
        if (c === ')') depth -= 1;
        if (depth > 0 || !'{};'.includes(c)) {
          buf += c;
        } else if (c === '{') {
          const prelude = buf.trim();
          buf = '';
          items.push({ prelude, items: block() });
        } else if (c === '}') {
          flush();
          return items;
        } else {
          flush();
        }
      }
    }
    flush();
    return items;
  };
  return block();
}

/** Splits a selector list on its top-level commas. */
function splitList(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  [...selector].forEach((c, i) => {
    if ('(['.includes(c)) depth += 1;
    if (')]'.includes(c)) depth -= 1;
    if (c === ',' && !depth) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  });
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

/** The full selectors of a nested rule: & is its parent, or the parent is put in front. */
function resolve(selectors, parents) {
  if (!parents) return selectors;
  const lists = parents.length > 1 && !parents.some((p) => p.includes('::'))
    ? [`:is(${parents.join(', ')})`] : parents;
  return lists.flatMap((parent) => selectors.map((s) => (s.includes('&')
    ? s.replace(/&/g, () => parent) : `${parent} ${s}`)));
}

const raw = (items) => items.map((item) => (typeof item === 'string'
  ? `${item};` : `${item.prelude}{${raw(item.items)}}`)).join('');

const GROUP = /^@(media|supports|container|layer)\b/i;

/**
 * Writes the tree out as flat rules.
 * @param {Array} items
 * @param {string[]|null} selectors the selectors of the enclosing rule
 * @param {string[]} wrappers the enclosing @media / @supports preludes
 * @param {string[]} out
 */
function flatten(items, selectors, wrappers, out) {
  const wrap = (body) => `${wrappers.map((w) => `${w}{`).join('')}${body}${'}'.repeat(wrappers.length)}`;
  let decls = [];
  const flush = () => {
    if (decls.length && selectors) out.push(wrap(`${selectors.join(',')}{${decls.join(';')}}`));
    decls = [];
  };
  items.forEach((item) => {
    if (typeof item === 'string') {
      if (selectors) decls.push(item);
      else if (!wrappers.length) out.push(`${item};`);
      return;
    }
    flush();
    const { prelude } = item;
    if (GROUP.test(prelude)) {
      const at = prelude.startsWith('@media') ? `@media ${translateMedia(prelude.slice(6))}` : prelude;
      flatten(item.items, selectors, [...wrappers, at], out);
    } else if (prelude.startsWith('@')) {
      out.push(wrap(`${prelude}{${raw(item.items)}}`));
    } else {
      flatten(item.items, resolve(splitList(prelude), selectors), wrappers, out);
    }
  });
  flush();
}

/** url() paths are relative to the stylesheet, so they are made absolute for the <style>. */
const absoluteUrls = (css, base) => css.replace(
  /url\(\s*(['"]?)(?![a-z]+:|\/\/|#)([^'")]+)\1\s*\)/gi,
  (m, quote, path) => `url("${new URL(path, base).href}")`,
);

const seen = new WeakSet();

async function convert(link) {
  if (seen.has(link) || link.rel !== 'stylesheet') return;
  seen.add(link);
  const url = new URL(link.href, document.baseURI);
  if (url.origin !== window.location.origin) return;
  const style = document.createElement('style');
  style.dataset.legacy = link.getAttribute('href');
  link.after(style);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.status);
    const out = [];
    flatten(parse(absoluteUrls(await resp.text(), url.href)), null, [], out);
    style.textContent = out.join('\n');
  } catch (e) {
    style.remove();
  }
}

document.querySelectorAll('link[rel="stylesheet"]').forEach(convert);
new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((node) => {
  if (node.tagName === 'LINK') convert(node);
}))).observe(document.head, { childList: true });
