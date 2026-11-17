// Cards "Pillars" style (About Us): one pillar per scroll step

import { attachToSnap, createGestureStepper } from '../../scripts/utils/gesture-stepper.js';

// step lock: --pl-move in the CSS plus a little
const STEP_MS = 1300;
// pillars authors may add
const CARDS_MAX = 6;
const IMAGE_TYPES = ['jpg', 'jpeg', 'png'];

/**
 * Builds an alert shown to authors on the canvas.
 * @param {string} text
 * @returns {HTMLParagraphElement}
 */
function note(text) {
  const p = document.createElement('p');
  p.className = 'pl-note';
  p.setAttribute('role', 'alert');
  p.textContent = text;
  return p;
}

/**
 * Whether a card's media cell holds a JPG or PNG image. A video or other
 * asset arrives as a link instead of a picture. Image URLs without an
 * extension (renditions, Dynamic Media) are let through.
 * @param {Element} li the card
 * @returns {boolean}
 */
function hasValidImage(li) {
  if (li.children.length < 2) return true;
  const cell = li.firstElementChild;
  const img = cell.querySelector('picture img');
  if (!img) return !cell.textContent.trim() && !cell.querySelector('a, video');
  const file = new URL(img.src, window.location.href).pathname.split('/').pop();
  const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  return !ext || IMAGE_TYPES.includes(ext);
}

/**
 * Classes the label, heading and description of a card.
 * @param {Element} li the card
 */
function classCard(li) {
  const body = li.querySelector('.card-body');
  if (!body) return;
  let seenHeading = false;
  body.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((el) => {
    if (el.tagName !== 'P') {
      if (!seenHeading) el.classList.add('pl-title');
      seenHeading = true;
      return;
    }
    // before the heading: label; after it: description
    el.classList.add(seenHeading ? 'pl-desc' : 'pl-label');
  });
}

/**
 * Decorates the Pillars style.
 * @param {Element} block the cards block
 * @param {HTMLUListElement} ul the card list
 */
export default function decoratePillars(block, ul) {
  const authoring = !!document.querySelector('[data-aue-resource]');
  [...ul.children].forEach((li) => {
    if (hasValidImage(li)) return;
    // Universal Editor can't restrict the asset type, so tell the author on
    // the card; on the site the card is left out
    if (authoring) {
      li.firstElementChild.className = 'card-image is-invalid';
      li.firstElementChild.prepend(note('Only JPG and PNG images are allowed. Replace this file with a .jpg or .png image.'));
    } else {
      li.remove();
    }
  });

  // Universal Editor can't cap the number of items either: warn the author,
  // and keep cards past the limit off the site
  if (authoring && ul.children.length > CARDS_MAX) {
    const extra = ul.children.length - CARDS_MAX;
    block.prepend(note(`Remove ${extra} card${extra === 1 ? '' : 's'}: Pillars takes at most ${CARDS_MAX} cards (now ${ul.children.length}).`));
  }
  if (!authoring) [...ul.children].slice(CARDS_MAX).forEach((li) => li.remove());

  const cards = [...ul.children];
  cards.forEach(classCard);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (authoring || reduce || cards.length < 2) {
    block.classList.add('is-static');
    return;
  }

  // the corner marks around the text
  const frame = document.createElement('div');
  frame.className = 'pl-frame';
  frame.setAttribute('aria-hidden', 'true');

  // progress rail, one mark per pillar
  const rail = document.createElement('div');
  rail.className = 'pl-rail';
  const marks = cards.map((li, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'pl-mark';
    const label = li.querySelector('.pl-label')?.textContent.trim() || `Pillar ${i + 1}`;
    mark.setAttribute('aria-label', label);
    rail.append(mark);
    return mark;
  });

  // stack the images, first on top
  cards.forEach((li, i) => li.style.setProperty('--pl-z', cards.length - i));

  let active = 0;
  const show = (to) => {
    active = Math.max(0, Math.min(cards.length - 1, to));
    block.style.setProperty('--active', active);
    cards.forEach((li, i) => {
      li.classList.toggle('is-active', i === active);
      li.classList.toggle('is-before', i < active);
      li.classList.toggle('is-next', i === active + 1);
      li.setAttribute('aria-hidden', String(i !== active));
    });
    marks.forEach((mark, i) => {
      if (i === active) mark.setAttribute('aria-current', 'step');
      else mark.removeAttribute('aria-current');
    });
  };
  marks.forEach((mark, i) => mark.addEventListener('click', () => show(i)));

  block.classList.add('is-stepped');
  // let the snap engine treat the block as one screen, not an inner scroller
  block.dataset.snapPassthrough = '';
  block.append(frame, rail);
  show(0);

  // one scroll gesture, one pillar; plain list if the snap engine doesn't start
  let busyUntil = 0;
  const stepper = createGestureStepper({
    count: cards.length,
    current: () => active,
    play: (to) => {
      busyUntil = performance.now() + STEP_MS;
      show(to);
    },
    busy: () => performance.now() < busyUntil,
  });
  attachToSnap(block.closest('.section'), stepper, () => {
    block.classList.remove('is-stepped');
    block.classList.add('is-static');
    frame.remove();
    rail.remove();
    cards.forEach((li) => li.removeAttribute('aria-hidden'));
  });
}
