import { decorateIcons } from '../aem.js';

/*
 * Shared "Scroll" indicator. A block that wants one imports createScrollIndicator,
 * appends the returned element where it belongs, and styles it in its own CSS.
 *
 * Authors can switch it off for a single section (the "Hide Scroll Indicator"
 * section style); createScrollIndicator then returns null, so callers only need
 * to check for that.
 *
 * Paging itself is handled by section-snap.js, the indicator is decorative.
 */

/**
 * Whether an author has hidden the scroll indicator on the block's section.
 * @param {Element} block The block asking for an indicator
 * @returns {boolean} true when the indicator must not be shown
 */
export function isScrollIndicatorHidden(block) {
  return !!block.closest('.section')?.classList.contains('hide-scroll');
}

/**
 * Builds the scroll indicator, or returns null when authors have hidden it.
 *
 * Variants (class names are what the block's CSS targets):
 *  - `cue`: `<div class="scroll-cue">` with a `.scroll-cue-label`
 *  - `pill`: `<span class="scroll">` with the icon as `.scroll-icon > .scroll-img`
 * @param {Element} block The block asking for an indicator
 * @param {object} [options]
 * @param {'cue'|'pill'} [options.variant] Markup to build, defaults to `cue`
 * @param {string} [options.label] Visible text, defaults to "Scroll"
 * @returns {Element|null} the indicator, or null when hidden
 */
export default function createScrollIndicator(block, { variant = 'cue', label = 'Scroll' } = {}) {
  if (isScrollIndicatorHidden(block)) return null;

  // Mouse-scroll glyph via the shared icon system (icons/mouse-scroll.svg),
  // decorateIcons injects it as an <img>.
  const icon = document.createElement('span');
  icon.className = 'icon icon-mouse-scroll';

  if (variant === 'pill') {
    const pill = document.createElement('span');
    pill.className = 'scroll';
    pill.setAttribute('aria-hidden', 'true');
    icon.classList.add('scroll-icon');
    pill.append(icon, document.createTextNode(label));
    decorateIcons(pill);
    icon.querySelector('img')?.classList.add('scroll-img');
    return pill;
  }

  const cue = document.createElement('div');
  cue.className = 'scroll-cue';
  cue.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'scroll-cue-label';
  text.textContent = label;
  cue.append(icon, text);
  decorateIcons(cue);
  return cue;
}
