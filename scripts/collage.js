// Collage section: title, text and image cards stepped by scroll; a showcase in it plays first.

import { loadScript } from './aem.js';
import { inEditor } from './utils/common.js';
import { contentChildren } from './utils/section-styles.js';

// authors add up to this many images, the cards (slots 2–9); slot 1, the feature, is only in
// a collage with a showcase, and shows its selected image
const IMAGES = 8;
// cards 2–5 sit around the copy; cards 6–9 come in on step 2
const FIRST_SET = 4;
const LAST_STEP = 2;
// the step before 0: the showcase in the section
const START = -1;
// a step's tween in s, by the step it goes to (the walkthrough: fly-up 1.1s, card swap 1.2s)
const MOTION = { duration: { 1: 1.1, 2: 1.2, default: 1.1 }, ease: 'power1.inOut' };
// the CSS fallback's step length (--collage-duration)
const CSS_STEP_MS = 900;
// inline styles a tween leaves, cleared once it ends
const TWEENED = 'top,left,width,height,borderRadius,transform';
// GSAP rounds px to whole pixels by default: a card and the engine in it then snap apart frame
// by frame (the engine shivers as it moves) and jump to their fractional places at the end
const SUBPIXEL = { autoRound: false };
// wheel events further apart than this start a new gesture
const GESTURE_GAP_MS = 200;
// the showcase hand-off in s (the walkthrough): copy fades, engine waits, travels, collage in
const HANDOFF = {
  fade: 0.155, travelAt: 0.56, travel: 0.804, reveal: 0.186,
};
// longest wait for the flying image to decode before the scene change starts anyway
const DECODE_WAIT_MS = 150;
// longest wait for a just-picked engine to finish sliding in (the showcase's 0.9s carousel)
const SLIDE_WAIT_MS = 950;

// sections already wired (the editor re-runs decoration)
const wired = new WeakSet();

/** A CSS cubic-bezier(x1, y1, x2, y2) easing, as a function GSAP can use. */
function cubicBezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i += 1) {
      t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return at(y1, y2, t);
  };
}

// the engine's travel into the card (the reference's shrink easing)
const TRAVEL_EASE = cubicBezier(0.65, 0, 0.15, 0.9);

/** The collage's last step: 1 with only the first set of cards (no step 2 to bring in). */
function collageEnd(section) {
  return section.classList.contains('is-single-set') ? 1 : LAST_STEP;
}

/** The steps a section plays: the showcase, its card, then the cards; without a showcase
 * only the cards around the copy (1), then the next set (2) if authored. */
function playedSteps(section) {
  const end = collageEnd(section);
  const steps = section.classList.contains('has-showcase') ? [START, 0, 1, end] : [1, end];
  return [...new Set(steps)];
}

/** Where the header's bar ends (--collage-clear), so the incoming cards can sit below it. */
function clearHeader(section) {
  const bar = document.querySelector('#nav .pill') || document.getElementById('nav');
  const bottom = bar?.getBoundingClientRect().bottom;
  if (bottom > 0) section.style.setProperty('--collage-clear', `${Math.round(bottom)}px`);
}

/** Keeps the copy's height in --collage-copy-h, so the cards can keep clear of it (collage.css). */
function watchCopy(section, stage) {
  const copy = [...stage.children].filter((el) => !el.classList.contains('collage-image'));
  if (!copy.length) return;
  const update = () => {
    const rects = copy.map((el) => el.getBoundingClientRect());
    const height = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
    section.style.setProperty('--collage-copy-h', `${Math.ceil(height)}px`);
  };
  const observer = new ResizeObserver(update);
  copy.forEach((el) => observer.observe(el));
}

/** Whether a default-content element is an authored image. */
function isImage(el) {
  if (el.tagName === 'PICTURE') return true;
  return el.tagName === 'P' && !!el.querySelector(':scope > picture') && !el.textContent.trim();
}

/** Marks the section's authored images as cards with their collage slot (2–9, then extras). */
function markImages(section) {
  const images = [...section.querySelectorAll(':scope > .default-content-wrapper')]
    .flatMap(contentChildren)
    .filter((el) => isImage(el) && !el.classList.contains('collage-feature'));
  images.forEach((img, i) => {
    img.classList.add('collage-image');
    img.classList.toggle('collage-card', i < IMAGES);
    img.classList.toggle('collage-extra', i >= IMAGES);
    img.dataset.slot = i + 2;
  });
  // only cards 2–5: they stay in their places and the collage ends before step 2
  section.classList.toggle('is-single-set', images.length <= FIRST_SET);
  return images;
}

/** Universal Editor: tells the author how many images the collage has against the 8 it needs. */
function showImageCount(section, count) {
  section.querySelector(':scope > .collage-notice')?.remove();
  const notice = document.createElement('p');
  notice.className = 'collage-notice';
  notice.setAttribute('role', 'status');
  const missing = IMAGES - count;
  const plural = (n) => `${n} image${n === 1 ? '' : 's'}`;
  if (!missing) {
    notice.textContent = `Collage: ${IMAGES} of ${IMAGES} images added.`;
  } else if (missing > 0) {
    notice.textContent = `Collage needs exactly ${IMAGES} images. ${plural(count)} added: add ${missing} more.`;
  } else {
    const extra = count - IMAGES > 1 ? `Images ${IMAGES + 1}-${count}` : `Image ${count}`;
    notice.textContent = `Collage needs exactly ${IMAGES} images. ${plural(count)} added: `
      + `remove ${-missing}. ${extra} won't show on the page.`;
  }
  notice.classList.toggle('is-invalid', !!missing);
  section.prepend(notice);
}

/** A rect's position and size, for GSAP. */
function box({
  left, top, width, height,
}) {
  return {
    left, top, width, height,
  };
}

/** A copy of an image showing the very file it shows now (loaded already), with its filter. */
function snapshot(img) {
  const copy = new Image();
  copy.src = img.currentSrc || img.src;
  copy.alt = img.alt;
  const { filter } = getComputedStyle(img);
  if (filter !== 'none') copy.style.filter = filter;
  return copy;
}

/** The section's moving parts and which of their properties move. */
function movingParts(section) {
  const card = ['top', 'left', 'width', 'height', 'borderRadius', 'y'];
  const parts = [...section.querySelectorAll('.collage-feature, .collage-card')]
    .map((el) => ({ el, keys: card }));
  const featureImg = section.querySelector('.collage-feature img');
  if (featureImg) parts.push({ el: featureImg, keys: ['top', 'left', 'width', 'height'] });
  section.querySelectorAll(':scope > .default-content-wrapper > :not(.collage-image)')
    .forEach((el) => parts.push({ el, keys: ['y'] }));
  return parts;
}

/** The element's current values for keys, in px. */
function measure(el, keys) {
  const cs = getComputedStyle(el);
  const values = {};
  keys.forEach((key) => {
    if (key === 'y') {
      values.y = cs.transform === 'none' ? 0 : new DOMMatrixReadOnly(cs.transform).m42;
    } else if (key === 'borderRadius') {
      values.borderRadius = cs.borderTopLeftRadius;
    } else {
      values[key] = cs[key];
    }
  });
  return values;
}

/** Tweens every part, all together, from where it was to where CSS puts the new step; ms. */
function tweenStep(section, apply, next) {
  const { gsap } = window;
  const parts = movingParts(section);
  const els = parts.map(({ el }) => el);
  const before = parts.map(({ el, keys }) => measure(el, keys));
  gsap.killTweensOf(els);
  gsap.set(els, { clearProps: TWEENED });
  apply();
  const after = parts.map(({ el, keys }) => measure(el, keys));

  const duration = MOTION.duration[next] ?? MOTION.duration.default;
  parts.forEach((part, i) => {
    if (part.keys.every((key) => `${before[i][key]}` === `${after[i][key]}`)) return;
    gsap.fromTo(part.el, before[i], {
      ...after[i], ...SUBPIXEL, duration, ease: MOTION.ease, overwrite: true, clearProps: TWEENED,
    });
  });
  return duration * 1000;
}

/** Returns a function showing a source's image (and filter) in the feature card, else image 1. */
function adopter(feature) {
  const holder = feature.tagName === 'PICTURE' ? feature : feature.querySelector('picture');
  const authored = holder ? [...holder.children] : [];
  let shown = '';
  return (source) => {
    if (!holder) return;
    const img = source?.querySelector('img');
    const key = img ? `${img.currentSrc || img.src} ${getComputedStyle(img).filter}` : '';
    if (key === shown) return;
    shown = key;
    holder.replaceChildren(...(img ? [snapshot(img)] : authored));
  };
}

/** The Interactive Showcase in the section and the scene change to the collage (null without). */
function createScene(section) {
  const showcase = section.querySelector('.interactive-showcase');
  const stage = section.querySelector(':scope > .default-content-wrapper');
  if (!showcase || !stage) return null;
  section.classList.add('has-showcase');
  // the centre card isn't authored: it shows the showcase's selected image
  const feature = document.createElement('p');
  feature.className = 'collage-image collage-feature';
  feature.dataset.slot = '1';
  feature.append(document.createElement('picture'));
  stage.append(feature);
  const wrapper = showcase.closest('.interactive-showcase-wrapper') || showcase;
  const adopt = adopter(feature);
  // interactive-showcase.js marks its selected image data-zoom-source
  const source = () => showcase.querySelector('[data-zoom-source]');
  // ends the scene change under way
  let finish = null;

  return {
    // the showcase's selected image becomes the feature, framed as that engine (collage.css)
    adopt: () => {
      const figure = source();
      const panel = figure?.closest('.panel');
      if (panel) feature.dataset.engine = [...panel.parentElement.children].indexOf(panel) + 1;
      adopt(figure);
    },
    // only the layer on show takes focus and clicks
    showing: (on) => { wrapper.inert = !on; },
    // the hand-off (HANDOFF): the copy fades, the engine travels into the card inside a frame
    // that shrinks and darkens into the black card, then the collage fades in around it; going
    // up the same timeline plays backwards. Going down, onLanded() runs once the engine is in the
    // card. Returns its length in ms
    play(down, apply, onLanded) {
      finish?.();
      const { gsap } = window;
      const figure = source();
      const sourceImg = figure?.querySelector('img');
      if (!gsap || !sourceImg) {
        apply();
        if (down) requestAnimationFrame(() => onLanded?.());
        return 0;
      }
      section.classList.add('is-flying');
      // going down, lay step 0 out first to measure the card
      if (down) apply();
      const cardImg = feature.querySelector('img');

      // the showcase's copy and + points fade out (interactive-showcase.js). Going down the
      // collage's white fades in over the showcase and its dark corners while the engine
      // travels, the rest of the collage and its text once the card has landed; going up the
      // whole collage fades out at once, before the engine travels back
      const copy = [showcase.querySelector('.copy'), ...figure.querySelectorAll('.hotspot, .tooltip')]
        .filter(Boolean);
      // all of the stage's content, the card too, so it doesn't show before the engine flies
      const parts = [...stage.children];
      const white = getComputedStyle(stage).backgroundColor;
      const clear = white.replace(/^rgba?\((\d+),\s*(\d+),\s*(\d+).*$/, 'rgba($1, $2, $3, 0)');
      const hidden = [sourceImg, feature];
      if (down) {
        gsap.set(stage, { backgroundColor: clear });
        gsap.set(parts, { opacity: 0 });
      } else gsap.set(stage, { opacity: 1 });
      gsap.set(copy, { opacity: down ? 1 : 0 });

      let flyer = null;
      let timeline = null;
      const end = () => {
        if (finish !== end) return;
        finish = null;
        timeline?.kill();
        flyer?.remove();
        if (!down) apply();
        gsap.set([stage, ...parts, ...copy], { clearProps: 'opacity' });
        gsap.set(stage, { clearProps: 'backgroundColor' });
        hidden.forEach((el) => el.style.removeProperty('visibility'));
        section.classList.remove('is-flying');
      };
      finish = end;

      // a just-picked engine is still sliding in (interactive-showcase.css): start from where it
      // settles, not from mid-slide, where its lower part is still cut off
      const panel = figure.closest('.panel');
      const sliding = !!panel && getComputedStyle(panel).transform !== 'none';
      const settled = new Promise((resolve) => {
        const started = performance.now();
        const check = () => {
          if (!sliding || getComputedStyle(panel).transform === 'none'
            || performance.now() - started > SLIDE_WAIT_MS) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });

      settled.then(() => {
        if (finish !== end) return;
        const at = sourceImg.getBoundingClientRect();
        const ratio = at.height / Math.max(1, at.width);
        const card = feature.getBoundingClientRect();
        const cs = getComputedStyle(feature);
        // the frame starts as the part of the engine the showcase shows (its stage, the screen)
        const clip = figure.closest('.stage')?.getBoundingClientRect() || at;
        const left = Math.max(at.left, clip.left, 0);
        const top = Math.max(at.top, clip.top, 0);
        const shown = {
          left,
          top,
          width: Math.min(at.right, clip.right, document.documentElement.clientWidth) - left,
          height: Math.min(at.bottom, clip.bottom, window.innerHeight) - top,
        };
        // and ends as the card, the engine framed in it as the card frames it (collage.css)
        const framed = cardImg.getBoundingClientRect();
        const ends = {
          showcase: {
            frame: { ...box(shown), borderRadius: 0 },
            img: {
              left: at.left - shown.left,
              top: at.top - shown.top,
              width: at.width,
              height: at.height,
            },
          },
          card: {
            frame: { ...box(card), borderRadius: cs.borderTopLeftRadius },
            img: {
              left: framed.left - card.left,
              top: framed.top - card.top,
              width: framed.width,
              height: framed.width * ratio,
            },
          },
        };

        // the frame: the card's own background, darkening in as it travels, and the engine
        flyer = document.createElement('div');
        flyer.className = 'collage-flyer';
        flyer.setAttribute('aria-hidden', 'true');
        const black = document.createElement('div');
        black.className = 'collage-flyer-card';
        black.style.backgroundColor = cs.backgroundColor;
        black.style.backgroundImage = cs.backgroundImage;
        // the file already on screen: a bare copy of the <img> would load its smaller fallback
        const img = snapshot(down ? sourceImg : cardImg);
        img.alt = '';
        flyer.append(black, img);
        gsap.set(flyer, { ...ends.showcase.frame, ...SUBPIXEL });
        gsap.set(img, { ...ends.showcase.img, ...SUBPIXEL });
        gsap.set(black, { opacity: 0 });

        // nothing on screen changes until the copy is decoded, so no frame shows it blank
        const decoded = img.decode().catch(() => {});
        Promise.race([decoded, new Promise((r) => { setTimeout(r, DECODE_WAIT_MS); })])
          .then(() => {
            if (finish !== end) return;
            document.body.append(flyer);
            hidden.forEach((el) => { el.style.visibility = 'hidden'; });
            const {
              fade, travelAt, travel, reveal,
            } = HANDOFF;
            const move = { ...SUBPIXEL, duration: travel, ease: TRAVEL_EASE };
            const done = () => {
              end();
              if (down) onLanded?.();
            };
            timeline = gsap.timeline({ paused: true, onComplete: done, onReverseComplete: end })
              .fromTo(copy, { opacity: 1 }, { opacity: 0, duration: fade, ease: 'power1.out' }, 0)
              .fromTo(flyer, ends.showcase.frame, { ...ends.card.frame, ...move }, travelAt)
              .fromTo(img, ends.showcase.img, { ...ends.card.img, ...move }, travelAt)
              .fromTo(black, { opacity: 0 }, { opacity: 1, ...move }, travelAt);
            const appear = { duration: reveal, ease: 'power1.out' };
            const landed = travelAt + travel;
            if (down) {
              timeline
                .fromTo(stage, { backgroundColor: clear }, {
                  backgroundColor: white, duration: travel, ease: 'power1.inOut',
                }, travelAt)
                .fromTo(parts, { opacity: 0 }, { opacity: 1, ...appear }, landed);
            } else timeline.fromTo(stage, { opacity: 0 }, { opacity: 1, ...appear }, landed);
            // going up: start from the end silently (its onComplete would end the scene at once)
            if (down) timeline.play(0);
            else timeline.progress(1, true).reverse();
          });
      });
      const total = (HANDOFF.travelAt + HANDOFF.travel + HANDOFF.reveal) * 1000 + DECODE_WAIT_MS;
      return total + (sliding ? SLIDE_WAIT_MS : 0);
    },
  };
}

/** The section's step state and its snap controller. */
function createSteps(section, scene) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // with a showcase the section starts on it, without one on the cards around the copy
  const [first] = playedSteps(section);
  let step = first;
  let busyUntil = 0;

  const show = (next, animate = true) => {
    if (next === step && section.dataset.collageStep) return;
    const direction = Math.sign(next - step);
    const crossing = scene && Math.min(step, next) < 0 && Math.max(step, next) >= 0;
    step = next;
    const apply = () => {
      clearHeader(section);
      section.dataset.collageStep = next >= 0 ? `${next}` : 'showcase';
      scene?.showing(next < 0);
    };
    if (crossing && next >= 0) scene.adopt();
    if (!animate || reduce) {
      if (window.gsap) {
        const els = movingParts(section).map(({ el }) => el);
        window.gsap.killTweensOf(els);
        window.gsap.set(els, { clearProps: TWEENED });
      }
      apply();
      busyUntil = 0;
    } else if (crossing) {
      // down from the showcase the feature card carries on up into its next place by itself
      const onward = () => {
        if (step === 0 && !section.classList.contains('is-runway')) {
          show(playedSteps(section).find((s) => s > 0));
        }
      };
      busyUntil = performance.now() + scene.play(direction > 0, apply, onward);
    } else {
      let ms = CSS_STEP_MS;
      if (section.classList.contains('is-tweened')) ms = tweenStep(section, apply, next);
      else apply();
      busyUntil = performance.now() + ms;
      // and up to it, once the card has grown back into the middle the engine goes on back to
      // the showcase by itself. Neither carries on if a gesture has moved the step on meanwhile,
      // nor on the runway, which steps by scroll position
      if (scene && next === 0 && direction < 0) {
        setTimeout(() => {
          if (step === 0 && !section.classList.contains('is-runway')) show(START);
        }, ms);
      }
    }
  };
  show(first, false);

  // one step per gesture: trackpad momentum can't play a second step, only a fresh gesture can
  let consumed = false;
  let lastWheel = -Infinity;
  let lastMag = 0;
  const fresh = () => { consumed = false; };
  window.addEventListener('wheel', (e) => {
    const now = performance.now();
    const mag = Math.abs(e.deltaY);
    if (now - lastWheel > GESTURE_GAP_MS || (mag >= 10 && mag > lastMag * 1.5)) fresh();
    lastWheel = now;
    lastMag = mag;
  }, { capture: true, passive: true });
  window.addEventListener('touchstart', fresh, { capture: true, passive: true });
  window.addEventListener('keydown', fresh, { capture: true });

  return {
    // for section-snap's registerBlockScroll
    controller: {
      canScrollDown: () => step < collageEnd(section),
      canScrollUp: () => step > first,
      scrollDown: () => { consumed = true; show(playedSteps(section).find((s) => s > step)); },
      scrollUp: () => { consumed = true; show(playedSteps(section).findLast((s) => s < step)); },
      isBusy: () => performance.now() < busyUntil || consumed,
    },
    // leaving downwards: start over next time
    reset: () => show(first, false),
    goTo: (next) => show(next),
    reduce,
  };
}

/** Hands the moves to GSAP once the snap engine has settled (it loads GSAP itself). */
function useGsap(section) {
  const tweened = () => { if (window.gsap) section.classList.add('is-tweened'); };
  if (window.gsap) {
    tweened();
    return;
  }
  loadScript(`${window.hlx.codeBasePath}/scripts/vendor/gsap.min.js`).then(tweened).catch(() => {});
}

/** No snap engine: the section is a tall runway and the step follows the scroll position. */
function wireRunway(section, steps) {
  section.classList.add('is-runway');
  let ticking = false;
  const update = () => {
    ticking = false;
    const { top } = section.getBoundingClientRect();
    const vh = window.innerHeight;
    if (top > vh * 0.4) {
      steps.reset();
      return;
    }
    // the runway's scroll length is split evenly between the played steps
    const total = Math.max(1, section.offsetHeight - vh);
    const progress = Math.min(1, Math.max(0, -top / total));
    const played = playedSteps(section);
    steps.goTo(played[Math.min(played.length - 1, Math.floor(progress * played.length))]);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/** Decorates a "Collage" section. */
export default function decorate(section) {
  const images = markImages(section);
  if (inEditor()) {
    showImageCount(section, images.length);
    return;
  }
  if (wired.has(section)) return;
  wired.add(section);
  // one stage: content authored either side of a showcase joins the first wrapper
  const [stage, ...more] = section.querySelectorAll(':scope > .default-content-wrapper');
  more.forEach((wrapper) => {
    stage.append(...wrapper.children);
    wrapper.remove();
  });

  // let gestures over the clipped cards reach the section snap
  section.dataset.snapPassthrough = '';
  watchCopy(section, stage);

  const scene = createScene(section);
  const steps = createSteps(section, scene);

  // load every image once the section comes into view (cards 6–9 start off screen)
  const loadAll = () => images.forEach((el) => {
    const img = el.querySelector('img');
    if (img) img.loading = 'eager';
  });
  new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) loadAll();
    // the runway drives its own steps; a scene change places things itself
    if (section.classList.contains('is-runway') || section.classList.contains('is-flying')) return;
    if (entry.intersectionRatio < 0.6 && entry.boundingClientRect.top > 0) steps.reset();
  }), { threshold: [0, 0.6] }).observe(section);

  // register with the snap engine now; drop to the runway if it never becomes active
  const snap = import('./section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, steps.controller);
    return mod;
  });
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (!root.classList.contains('snap-active')) {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      wireRunway(section, steps);
    }
    // no motion at all under reduced motion
    if (!steps.reduce) useGsap(section);
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}
