// Section style "Statement" (styles/section-statement.css): the section's title, word by word,
// so the words can rise into place one after another each time the section arrives.
// Safe to re-run; the title is left as authored in Universal Editor (it's edited in place) and
// where it holds more than plain text (links, emphasis).

import { inEditor } from './utils/common.js';

/**
 * @param {Element} section a `.section.statement`
 */
export default function decorate(section) {
  if (inEditor() || section.classList.contains('is-split')) return;
  const heading = section.querySelector(':scope > .default-content-wrapper :is(h1, h2, h3, h4, h5, h6)');
  if (!heading || heading.children.length) return;
  const words = heading.textContent.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;

  // each word in its own span (inline, with the spaces kept as text, so the title reads the same)
  const parts = words.flatMap((word, i) => {
    const outer = document.createElement('span');
    outer.className = 'statement-word';
    const inner = document.createElement('span');
    inner.textContent = word;
    inner.style.setProperty('--statement-word', i);
    outer.append(inner);
    return i ? [document.createTextNode(' '), outer] : [outer];
  });
  heading.replaceChildren(...parts);
  section.classList.add('is-split');

  // in once most of the section is on screen; out again once it has left, so it replays
  new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio >= 0.6) section.classList.add('is-in');
    else if (!entry.isIntersecting || entry.intersectionRatio === 0) section.classList.remove('is-in');
  }, { threshold: [0, 0.6] }).observe(section);
}
