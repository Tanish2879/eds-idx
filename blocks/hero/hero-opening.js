/* Carousel "Opening Animation": the first slide plays in a small card between the Hero Text's
   first two paragraphs, then grows to full screen; skipped in the editor and reduced motion. */

const HURRY = 2.4;
const MOBILE = '(width < 900px)';

// card rects on the source's design frame (1280 x 720 desktop, 640 wide on
// phones): [left, top, width, height] — the first frame, and where it settles
const CARD_FROM = [516, 388, 248, 91];
const CARD_AT = [516.5, 290.5, 247, 139];

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const power3Out = (t) => 1 - (1 - t) ** 3;
const power3InOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const power2InOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const power1In = (t) => t * t;
const expoOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const mix = (a, b, t) => a + (b - a) * t;
// no blur in WebKit (Safari, iPhone): an animated blur drew a pink line along the buttons
const BLUR = !navigator.vendor?.startsWith('Apple');

function inEditor() {
  return !!document.querySelector('[data-aue-resource]');
}

/**
 * The card's rect on screen for one of the design-frame rects (or the full
 * block), with its corner radius.
 */
function cardRect(rect, w, h, mobile) {
  // phones scale the same rects by a 640-wide frame, still about its centre
  const u = mobile ? w / 640 : Math.min(w / 1280, h / 720);
  const [x, y, cw, ch] = rect;
  return {
    x: w / 2 + (x - 640) * u,
    y: h / 2 + (y - 360) * u,
    w: cw * u,
    h: ch * u,
    r: mobile ? 16 : 16 * u,
  };
}

/**
 * Fits the background holder to the card `c`, so the film fills the card
 * (cover) as it would the screen — the whole scene, on phones too; `open`
 * (0 … 1) reveals the card from the bottom up. Only the holder (absolutely
 * placed, its slides filling it) is re-laid out.
 */
function placeCard(bg, c, open) {
  bg.style.right = 'auto';
  bg.style.bottom = 'auto';
  bg.style.left = `${c.x.toFixed(2)}px`;
  bg.style.top = `${c.y.toFixed(2)}px`;
  bg.style.width = `${c.w.toFixed(2)}px`;
  bg.style.height = `${c.h.toFixed(2)}px`;
  bg.style.clipPath = `inset(${((1 - open) * 100).toFixed(2)}% 0 0 0 round ${c.r.toFixed(2)}px)`;
}

/**
 * A reveal (rise 12px, fade and sharpen in), as a function of its own time.
 */
function reveal(el, t) {
  const e = expoOut(clamp01(t));
  el.style.opacity = e.toFixed(3);
  el.style.translate = `0 ${((1 - e) * 12).toFixed(2)}px`;
  el.style.filter = BLUR && e < 1 ? `blur(${((1 - e) * 3).toFixed(2)}px)` : '';
}

/**
 * Plays the opening on a decorated carousel hero.
 * @param {Element} block the hero block
 * @param {{firstScreen: boolean, lines: Element[], content: Element}} options
 * `lines`: the opening lines; `content`: the first slide's content
 */
export default function playOpening(block, { firstScreen, lines, content }) {
  const bg = block.querySelector(':scope > .bg');
  if (!bg) return;

  // the opening's own copy of the two lines (the authored ones are kept for
  // screen readers only, by hero-opening.css)
  const sides = lines.map((p, i) => {
    const side = document.createElement('p');
    side.className = `opening-side opening-side-${i ? 'end' : 'start'}`;
    side.setAttribute('aria-hidden', 'true');
    side.textContent = p.textContent.trim();
    return side;
  });

  const skip = !firstScreen || inEditor() || window.scrollY > 10
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (skip) return;

  const root = document.documentElement;
  const heading = content?.querySelector(':scope > h1, :scope > h2');
  const ctas = content?.querySelector(':scope > .cta-wrapper, :scope > .button-wrapper');
  const chrome = [
    block.querySelector(':scope > .slide-nav'),
    block.querySelector(':scope > .scroll'),
    block.querySelector('.slide-controls'),
  ].filter(Boolean);
  const revealed = [heading, ctas, ...chrome].filter(Boolean);
  const slides = [...bg.querySelectorAll(':scope > .slide')];

  block.classList.add('is-opening');
  root.classList.add('hero-opening', 'hero-opening-nav');
  bg.before(...sides);
  revealed.forEach((el) => { el.style.opacity = '0'; });
  // hold the slides on the first one while it plays
  block.dispatchEvent(new CustomEvent('hero:hold', { detail: true }));

  // measured at the start of every frame, before anything is written: the
  // section is still hidden (zero size) when the hero is decorated, and the
  // window can change size while it plays
  const mq = window.matchMedia(MOBILE);
  let mobile = mq.matches;
  let w = 0;
  let h = 0;
  const measure = () => {
    mobile = mq.matches;
    w = block.clientWidth;
    h = block.clientHeight;
  };

  let speed = 1;
  let time = 0;
  let last = performance.now();
  let frame = 0;
  let done = false;
  let unregister = () => {};
  const hurry = () => { if (!done) speed = HURRY; };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    ['wheel', 'touchmove', 'keydown'].forEach((type) => window.removeEventListener(type, hurry));
    ['right', 'bottom', 'left', 'top', 'width', 'height', 'clipPath'].forEach((k) => { bg.style[k] = ''; });
    slides.forEach((slide) => { slide.style.scale = ''; });
    revealed.forEach((el) => {
      el.style.opacity = '';
      el.style.translate = '';
      el.style.filter = '';
    });
    sides.forEach((side) => side.remove());
    block.classList.remove('is-opening');
    root.classList.remove('hero-opening', 'hero-opening-nav');
    block.dispatchEvent(new CustomEvent('hero:hold', { detail: false }));
    unregister();
  };

  // the timeline, in seconds of the source's
  const END = 4.45;
  const render = (t) => {
    measure();
    if (!w || !h) return; // not shown yet
    const full = {
      x: 0, y: 0, w, h, r: 0,
    };
    const from = cardRect(CARD_FROM, w, h, mobile);
    const at = cardRect(CARD_AT, w, h, mobile);
    // the card rises in and settles (0.05s, 0.95s), then grows (2.07s, 1.7s)
    const settle = power3Out(clamp01((t - 0.05) / 0.95));
    const grow = power3InOut(clamp01((t - 2.07) / 1.7));
    const lerpRect = (a, b, k) => ({
      x: mix(a.x, b.x, k),
      y: mix(a.y, b.y, k),
      w: mix(a.w, b.w, k),
      h: mix(a.h, b.h, k),
      r: mix(a.r, b.r, k),
    });
    const card = lerpRect(lerpRect(from, at, settle), full, grow);
    placeCard(bg, card, power3Out(clamp01((t - 0.05) / 0.45)));
    // the film settles from a slight zoom while the card grows
    const zoom = 1.18 - 0.18 * power3Out(clamp01((t - 2.07) / 2));
    slides.forEach((slide) => { slide.style.scale = zoom.toFixed(4); });

    // the two lines: in, drifting out (desktop) and fading as the card catches them
    const u = mobile ? w / 640 : Math.min(w / 1280, h / 720);
    sides.forEach((side, i) => {
      const inT = (t - 0.17 - i * 0.08) / 0.6;
      const e = expoOut(clamp01(inT));
      const out = power1In(clamp01((t - 2.5) / 1.1));
      const drift = mobile ? 0 : (i ? 80 : -80) * u * power2InOut(clamp01((t - 2.07) / 1.7));
      side.style.opacity = (e * (1 - out)).toFixed(3);
      side.style.translate = `${drift.toFixed(2)}px ${((1 - e) * 12).toFixed(2)}px`;
      const blur = (1 - e) * 3 + out * 3;
      side.style.filter = BLUR && blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : '';
    });

    // the header (CSS transition, hero-opening.css) from 0.25s
    if (t >= 0.25) root.classList.remove('hero-opening-nav');

    // heading 3.25s, buttons 3.45s, thumbnails / scroll cue / controls 3.6s on
    if (heading) reveal(heading, (t - 3.25) / 0.8);
    if (ctas) reveal(ctas, (t - 3.45) / 0.8);
    chrome.forEach((el, i) => reveal(el, (t - 3.6 - i * 0.08) / 0.8));
  };

  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); // a background tab doesn't skip it
    last = now;
    time += dt * speed;
    if (time >= END) {
      render(END);
      finish();
      return;
    }
    render(time);
    frame = requestAnimationFrame(tick);
  };

  // input speeds it up; the page stays on the hero until it is done
  ['wheel', 'touchmove', 'keydown'].forEach((type) => window.addEventListener(type, hurry, { passive: true }));
  const section = block.closest('.section');
  import('../../scripts/section-snap.js').then((mod) => {
    if (done || !section) return;
    mod.registerBlockScroll(section, {
      canScrollDown: () => !done,
      canScrollUp: () => false,
      scrollDown: hurry,
      scrollUp: () => {},
    });
    unregister = () => mod.unregisterBlockScroll(section);
  }).catch(() => {});

  render(0);
  frame = requestAnimationFrame((now) => {
    last = now;
    frame = requestAnimationFrame(tick);
  });
}
