/*
 * "Article Body" sections (.article-body): adds the contents (built from the
 * h2s, highlighting the one being read) and marks callouts.
 */

import { toClassName } from '../aem.js';
import { contentChildren } from '../utils/section-styles.js';
import { token } from '../utils/datalayer.js';

const DEFAULT_ACTIVE_LINE = 0.3;

// per section, for when the editor re-runs this
const built = new WeakMap();

/**
 * Marks paragraphs that are entirely italic as callouts. In Universal Editor
 * such a paragraph can serialize as a bare <em> with no <p>, so it's wrapped
 * in one first.
 * @param {Element} wrapper
 */
function markCallouts(wrapper) {
  contentChildren(wrapper).forEach((el) => {
    if (el.tagName === 'EM') {
      const p = document.createElement('p');
      p.className = 'article-callout';
      el.replaceWith(p);
      p.append(el);
      return;
    }
    if (el.tagName !== 'P') return;
    const em = el.querySelector(':scope > em');
    const isCallout = !!em && el.children.length === 1
      && el.textContent.trim() === em.textContent.trim();
    el.classList.toggle('article-callout', isCallout);
  });
}

/**
 * Gives every heading a unique id (the backend sets most; this covers the rest).
 * @param {Element[]} headings
 */
function ensureIds(headings) {
  const used = new Set();
  headings.forEach((h) => {
    let id = h.id || toClassName(h.textContent) || 'section';
    const base = id;
    let n = 2;
    while (used.has(id) || (!h.id && document.getElementById(id))) {
      id = `${base}-${n}`;
      n += 1;
    }
    h.id = id;
    used.add(id);
  });
}

/**
 * @param {Element} section
 * @returns {number} --article-toc-active-line as a fraction of the viewport height
 */
function activeLine(section) {
  const value = parseFloat(getComputedStyle(section).getPropertyValue('--article-toc-active-line'));
  return Number.isFinite(value) ? value / 100 : DEFAULT_ACTIVE_LINE;
}

/**
 * Builds the contents from the h2s and highlights the one being read. The
 * contents go first in the section, so on desktop they're the sticky left
 * column of its grid (styles/article-detail.css).
 * @param {Element} section
 */
function initContents(section) {
  const wrappers = [...section.querySelectorAll(':scope > .default-content-wrapper')];
  // in the editor a Text field's h2 sits one level deeper, in its richtext wrapper
  const headings = wrappers.flatMap((w) => [...w.querySelectorAll(':scope > h2, :scope > div[data-aue-type="richtext"] > h2')]);

  // re-run after an edit in the editor: keep the contents if the headings are
  // unchanged, otherwise tear them down and rebuild
  const previous = built.get(section);
  const signature = headings.map((h) => `${h.id}|${h.textContent.trim()}`).join('\n');
  if (previous?.nav.isConnected && previous.signature === signature) {
    previous.update();
    return;
  }
  previous?.controller.abort();
  previous?.nav.remove();
  built.delete(section);
  if (!headings.length) return;

  ensureIds(headings);

  const controller = new AbortController();
  const { signal } = controller;

  const nav = document.createElement('nav');
  nav.className = 'article-toc';
  nav.setAttribute('aria-label', 'Contents');
  // Not an authored EDS block, so componentOf() won't find a .block ancestor
  // here — this opts it into the same component reporting via a plain marker.
  nav.dataset.componentName = 'article-toc';
  nav.dataset.componentType = 'nav';

  // mobile toggle (hidden by CSS on desktop)
  const listId = `article-toc-list-${document.querySelectorAll('.article-toc').length}`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'article-toc-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', listId);
  toggle.innerHTML = '<span>In this article</span><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 10 8 5.5 12.5 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  nav.append(toggle);

  const ul = document.createElement('ul');
  ul.id = listId;
  ul.hidden = true;
  const entries = headings.map((heading) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent.trim();
    link.dataset.cta = `article-toc:${token(link.textContent) || 'not-set'}:view`;
    li.append(link);
    ul.append(li);
    return { link, target: heading };
  });
  nav.append(ul);
  section.prepend(nav);

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    ul.hidden = !open;
  };
  toggle.addEventListener('click', () => setOpen(ul.hidden));
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ul.hidden) return;
    setOpen(false);
    toggle.focus();
  });
  document.addEventListener('click', (e) => {
    if (!ul.hidden && !nav.contains(e.target)) setOpen(false);
  }, { signal });

  nav.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    const target = link && document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    if (window.location.hash !== link.hash) window.history.pushState(null, '', link.hash);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setOpen(false);
  });

  let current = null;
  const setCurrent = (entry) => {
    if (entry === current) return;
    current?.link.removeAttribute('aria-current');
    entry.link.setAttribute('aria-current', 'location');
    current = entry;
  };

  const update = () => {
    // the last heading above the reading line; the first one until then
    const y = window.innerHeight * activeLine(section);
    let active = entries[0];
    entries.forEach((entry) => {
      if (entry.target.getBoundingClientRect().top <= y) active = entry;
    });
    setCurrent(active);

    // mobile: hide the floating card at the end of the article (desktop
    // ignores this class)
    const ended = section.getBoundingClientRect().bottom <= window.innerHeight;
    nav.classList.toggle('is-hidden', ended);
    if (ended) setOpen(false);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true, signal });
  window.addEventListener('resize', onScroll, { passive: true, signal });
  update();

  built.set(section, {
    nav, controller, signature, update,
  });
}

/**
 * @param {Element} section a `.section.article-body`
 */
export default function decorateArticleBody(section) {
  section.querySelectorAll(':scope > .default-content-wrapper').forEach(markCallouts);
  initContents(section);
}
