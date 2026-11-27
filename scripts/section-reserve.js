// "Reserve Band" section style (styles/section-reserve.css)

import decorateBrochure from './utils/brochure.js';
import { inEditor } from './utils/common.js';

/**
 * The band's brochure links become a "Download the brochure" menu. Left as authored in
 * Universal Editor. Safe to run again.
 * @param {Element} section
 */
export default function decorate(section) {
  const content = section.querySelector(':scope > .default-content-wrapper');
  if (!content || inEditor() || content.classList.contains('brochure')) return;
  const bands = [...document.querySelectorAll('main > .section.reserve-band')];
  const nth = bands.indexOf(section);
  decorateBrochure(content, nth > 0 ? `end-brochure-links-${nth + 1}` : 'end-brochure-links');
}
