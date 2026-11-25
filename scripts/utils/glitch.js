/*
 * CTA "glitch" hover (Figma "CTA Glitch Animation"). On hover / keyboard
 * focus a couple of letters flash grey for four quick frames, then the label
 * settles. Applies to every primary CTA on the page via one delegated
 * listener (initGlitch, called from scripts.js), so CTAs that blocks build
 * later are covered too. The hover background itself is plain CSS.
 *
 * The label keeps its exact textContent (CTA tracking reads it); the letters
 * are only wrapped in spans, and the link gets an aria-label so screen
 * readers announce the words, not single letters.
 */

// every primary CTA: authored primary buttons (incl. thank-you .ty-cta), the
// hero, header and footer Register CTAs, and the register form's solid buttons
const SELECTOR = [
  'a.button.primary',
  'button.button.primary',
  '.cta.cta-primary',
  '.footer-register',
  'header .tools .cta',
  '.register-form .submit',
  '.register-form .back-home',
  // any other link a block opts in (e.g. the Cards Roller's "Know more")
  '[data-glitch]',
].join(', ');

// letters dimmed per frame in the Figma variants for "REGISTER INTEREST"
const DESIGN_TEXT = 'register interest';
const DESIGN_FRAMES = [[2, 13], [0, 10], [4, 16], [7, 14]];
const FRAME_COUNT = DESIGN_FRAMES.length;
const FRAME_MS = 80;
const LETTERS_PER_FRAME = 2;

const prepared = new WeakMap(); // CTA -> { chars, text, timer }

// any other label: random letter pairs, never repeating the previous frame
function randomFrames(text) {
  const pool = [...text].map((ch, i) => (ch.trim() ? i : -1)).filter((i) => i >= 0);
  const frames = [];
  let prev = [];
  for (let f = 0; f < FRAME_COUNT; f += 1) {
    const last = prev;
    const choices = pool.filter((i) => !last.includes(i));
    const frame = [];
    while (frame.length < LETTERS_PER_FRAME && choices.length) {
      frame.push(...choices.splice(Math.floor(Math.random() * choices.length), 1));
    }
    frames.push(frame);
    prev = frame;
  }
  return frames;
}

// the element holding the label text: an explicit label, the hero's
// .cta-label, or the CTA itself when it contains only text
function labelOf(cta, label) {
  if (label) return label;
  const inner = cta.querySelector('.cta-label');
  if (inner) return inner;
  const onlyText = [...cta.children].every((c) => c.classList.contains('glitch-label'));
  return onlyText ? cta : null;
}

/**
 * Splits a CTA label into letter spans (idempotent; re-splits if the label
 * text has changed since). Returns the prepared state, or null if the CTA has
 * no plain-text label to animate.
 * @param {Element} cta The interactive element
 * @param {Element} [label] The element holding the label text
 */
function prepare(cta, label) {
  const target = labelOf(cta, label);
  if (!target) return null;
  const text = target.textContent.trim();
  if (!text) return null;
  const known = prepared.get(cta);
  if (known && known.text === text) return known;

  if (!cta.hasAttribute('aria-label') || known) cta.setAttribute('aria-label', text);
  const chars = [...text].map((ch) => {
    const span = document.createElement('span');
    span.className = 'glitch-char';
    span.textContent = ch;
    return span;
  });
  // Keep the letters in one inline wrapper: if the label is a flex container
  // (e.g. the footer pill), loose letter spans would each become a flex item
  // and pick up its gap.
  const word = document.createElement('span');
  word.className = 'glitch-label';
  word.append(...chars);
  target.replaceChildren(word);
  cta.classList.add('glitch');
  const state = { chars, text, timer: null };
  prepared.set(cta, state);
  return state;
}

function reset(state) {
  clearTimeout(state.timer);
  state.chars.forEach((c) => c.classList.remove('is-dim'));
}

function play(cta) {
  if (cta.matches(':disabled, [aria-disabled="true"]')) return;
  const state = prepare(cta);
  if (!state) return;
  reset(state);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const isDesignText = state.text.toLowerCase() === DESIGN_TEXT;
  const frames = isDesignText ? DESIGN_FRAMES : randomFrames(state.text);
  let i = 0;
  const step = () => {
    state.chars.forEach((c) => c.classList.remove('is-dim'));
    if (i >= frames.length) return; // settled hover state
    frames[i].forEach((n) => state.chars[n]?.classList.add('is-dim'));
    i += 1;
    state.timer = setTimeout(step, FRAME_MS);
  };
  step();
}

function stop(cta) {
  const state = prepared.get(cta);
  if (state) reset(state);
}

let listening = false;

/** Registers the page-wide delegated hover/focus listeners. Idempotent. */
export function initGlitch() {
  if (listening) return;
  listening = true;
  const canHover = window.matchMedia('(hover: hover)');
  const ctaOf = (e) => e.target.closest?.(SELECTOR);

  // mouseover/mouseout bubble (mouseenter doesn't); relatedTarget filters out
  // moves between the CTA's own children
  document.addEventListener('mouseover', (e) => {
    const cta = ctaOf(e);
    if (!cta || cta.contains(e.relatedTarget) || !canHover.matches) return;
    play(cta);
  });
  document.addEventListener('mouseout', (e) => {
    const cta = ctaOf(e);
    if (cta && !cta.contains(e.relatedTarget)) stop(cta);
  });
  document.addEventListener('focusin', (e) => {
    const cta = ctaOf(e);
    if (cta && cta.matches(':focus-visible')) play(cta);
  });
  document.addEventListener('focusout', (e) => {
    const cta = ctaOf(e);
    if (cta) stop(cta);
  });
}

/**
 * Prepares a CTA up front (used by blocks whose label sits in a specific
 * child) and makes sure the page-wide listeners are active.
 * @param {Element} link The interactive element
 * @param {Element} [label] The element holding the label text
 */
export default function decorateGlitch(link, label) {
  prepare(link, label);
  initGlitch();
}
