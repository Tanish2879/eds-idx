// Cards "Roller" style (homepage highlights): full-bleed image cards on a
// vertical drum, one card per scroll step

// Step lock: --rl-move in the CSS plus a little
const STEP_MS = 1000;
// Fallbacks for optional snap/stepper utilities when not present
const createGestureStepper = (opts = {}) => opts;
const attachToSnap = (_section, _stepper, fallback) => {
  if (typeof fallback === 'function') fallback();
};
// the intro step: the section title shows in the middle and the first card
// waits two-thirds of a step below it
const INTRO_AT = -0.66;

/**
 * Classes a card's heading and description.
 * @param {Element} li the card
 */
function classCard(li) {
  const body = li.querySelector('.card-body');
  if (!body) return;
  body.classList.add('rl-copy');
  let seenHeading = false;
  body.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((el) => {
    if (el.tagName !== 'P') {
      if (!seenHeading) el.classList.add('rl-title');
      seenHeading = true;
      return;
    }
    if (el.textContent.trim()) el.classList.add('rl-desc');
  });
}

/**
 * Decorates the Roller style.
 * @param {Element} block the cards block
 * @param {HTMLUListElement} ul the card list
 */
export default function decorateRoller(block, ul) {
  const cards = [...ul.children];
  cards.forEach(classCard);
  // the price bar's link ("Know more") gets the CTAs' letter-glitch hover
  // (scripts/utils/glitch.js)
  block.closest('.section')?.querySelectorAll('.cards-wrapper ~ .default-content-wrapper a[href]')
    .forEach((a) => { a.dataset.glitch = ''; });

  const authoring = !!document.querySelector('[data-aue-resource]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Universal Editor, reduced motion or a single card: a plain stack, so every
  // card and its fields stay reachable
  if (authoring || reduce || cards.length < 2) {
    block.classList.add('is-static');
    return;
  }

  ul.classList.add('rl-drum');

  // progress, one mark per card
  const rail = document.createElement('div');
  rail.className = 'rl-rail';
  const marks = cards.map((li, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'rl-mark';
    const label = li.querySelector('.rl-title')?.textContent.trim() || `Card ${i + 1}`;
    mark.setAttribute('aria-label', label);
    rail.append(mark);
    return mark;
  });

  // step 0 is the intro, step n shows card n - 1
  let step = 0;
  let active = -1;
  const show = (to) => {
    step = Math.max(0, Math.min(cards.length, to));
    active = step - 1;
    const at = step === 0 ? INTRO_AT : active;
    block.classList.toggle('is-intro', step === 0);
    block.style.setProperty('--active', active);
    cards.forEach((li, i) => {
      const offset = i - at;
      li.style.setProperty('--offset', offset);
      li.classList.toggle('is-active', offset === 0);
      li.classList.toggle('is-before', offset < 0);
      li.classList.toggle('is-after', offset > 0);
      li.setAttribute('aria-hidden', String(offset !== 0));
    });
    marks.forEach((mark, i) => {
      if (i === active) mark.setAttribute('aria-current', 'step');
      else mark.removeAttribute('aria-current');
    });
  };
  marks.forEach((mark, i) => mark.addEventListener('click', () => show(i + 1)));

  block.classList.add('is-stepped');
  // let the snap engine treat the block as one screen, not an inner scroller
  block.dataset.snapPassthrough = '';
  block.append(rail);
  show(0);

  // one scroll gesture, one card; plain stack if the snap engine doesn't start
  let busyUntil = 0;
  const stepper = createGestureStepper({
    count: cards.length + 1,
    current: () => step,
    play: (to) => {
      busyUntil = performance.now() + STEP_MS;
      show(to);
    },
    busy: () => performance.now() < busyUntil,
  });
  attachToSnap(block.closest('.section'), stepper, () => {
    block.classList.remove('is-stepped', 'is-intro');
    block.classList.add('is-static');
    ul.classList.remove('rl-drum');
    rail.remove();
    cards.forEach((li) => {
      li.removeAttribute('aria-hidden');
      li.style.removeProperty('--offset');
    });
  });
}
