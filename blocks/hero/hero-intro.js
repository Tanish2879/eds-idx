/*
 * Hero "Intro" style (About Us), loaded by hero.js only when the style is
 * picked. A light first screen — the heading split around a small image tile
 * ("BUILT FOR [tile] WHAT'S NEXT") — then, one scroll gesture per step:
 *   1. the tile grows to fill the screen (the heading parts slide away); once
 *      it does, the video plays, with sound and pause / play buttons at the
 *      bottom left
 *   2. the image blurs back and the manifesto rises in from below; its lines
 *      sharpen one after another on their own, and once the last one is sharp
 *      the video plays again behind them, evenly blurred and muted, until
 *      the visitor first interacts with the fold; scrolling on before the
 *      last line is sharp plays the rest of them quickly
 * after which the page moves on. Scrolling up plays it back.
 * Authoring: Background Image or Video (Desktop, + Mobile) fills the tile /
 * full screen; a video's poster is the Video Thumbnail (else its first
 * frame): the video sits in the tile and plays, looped,
 * only on the full screen (muted until the visitor turns the sound on) and
 * behind the finished manifesto (always muted); anywhere else it stops and
 * the image shows instead (also off screen and in a hidden tab); Text holds the
 * heading — the tile goes at its middle word ("Built for | What's next");
 * Scroll Manifesto holds one paragraph per line (a line break inside a
 * paragraph is kept).
 * Without the snap engine (reduced motion, Universal Editor) the screens
 * stack statically.
 * Figma: desktop 6350:4294 / 4296 / 4298 / 4300 / 4302, mobile 6360:5911 /
 * 5913 / 5915 / 5917; video buttons 6937:6146.
 */

import { attachToSnap, createGestureStepper } from '../../scripts/utils/gesture-stepper.js';

const GROW_MS = 1400;
// the manifesto coming in (its first line sharp with it), each further line
// sharpening, and all of it going back out (the lines blurring together)
const MANIFESTO_MS = 1000;
const LINE_MS = 1200;
const OUT_MS = 1600;
// a scroll during the manifesto's reveal plays the rest of it in this long
const HURRY_MS = 600;
// at most this many manifesto lines (paragraphs) are shown, by the screen on
// load (desktop from 900px, as in hero-intro.css); further ones are left out
// of the page
const MAX_MANIFESTO_LINES = { mobile: 7, desktop: 5 };
// the video's fade in and out (hero-intro.css, .video and --bg-video)
const VIDEO_FADE_MS = 600;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (n) => Math.min(1, Math.max(0, n));
/**
 * CSS's cubic-bezier() as a function of time (0 … 1), so a variable can follow
 * the same curve from JS
 * @returns {function(number): number}
 */
const cubicBezier = (x1, y1, x2, y2) => {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0 || x >= 1) return clamp01(x);
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 20; i += 1) {
      t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return at(y1, y2, t);
  };
};
// the first screen's entrance: the heading and tile rise from below to the
// centre, fading in from faint as the tile grows to its size
const ENTER_MS = 1400;
const ENTER_DELAY_MS = 150;
const enterEase = cubicBezier(0.2, 0.7, 0.2, 1);
const LINE_BREAK = /<br\s*\/?>/i;
// mobile: the heading stacks at the bottom left, at most this many lines
const MAX_HEADING_LINES_MOBILE = 3;

/**
 * Where to split words in two so both sides are as near the same length as
 * whole words allow (the longer side as short as it can be): the tile stays
 * centred, so the text must fit either side of it. On a tie the left side
 * takes the extra word.
 * @param {string[]} words two or more
 * @returns {number} how many words go to the left
 */
function balancedSplit(words) {
  const total = words.join(' ').length;
  let best = 1;
  let bestLonger = Infinity;
  let left = -1;
  for (let i = 1; i < words.length; i += 1) {
    left += 1 + words[i - 1].length;
    const longer = Math.max(left, total - left - 1);
    if (longer <= bestLonger) {
      best = i;
      bestLonger = longer;
    }
  }
  return best;
}

/**
 * Splits the heading into the two parts either side of the tile: at its line
 * break if it has one, otherwise where the two sides come out nearest the
 * same length (balancedSplit: "Built for | What's next"). Headings can't keep
 * a line break through publishing, so the balance is what usually decides.
 * Skipped in the editor, so the rich text is never rewritten there.
 * @param {Element} heading
 * @returns {Element[]} the parts (one for a single-word heading)
 */
function splitHeading(heading) {
  let parts = heading.innerHTML.split(LINE_BREAK).map((html) => html.trim()).filter(Boolean);
  if (parts.length < 2) {
    const words = heading.textContent.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return [heading];
    const half = balancedSplit(words);
    // plain text from here on, so escape it before it goes back in as HTML
    const esc = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    parts = [words.slice(0, half).join(' '), words.slice(half).join(' ')].map(esc);
  }
  // each part clips an inner line, so the words can rise into view from
  // below their own baseline on load
  const spans = parts.slice(0, 2).map((html, i) => {
    const span = document.createElement('span');
    span.className = `part part-${i + 1}`;
    const inner = document.createElement('span');
    inner.className = 'words';
    inner.innerHTML = html;
    span.append(inner);
    return span;
  });
  heading.replaceChildren(spans[0], ' ', spans[1]);
  return spans;
}

/**
 * Mobile: keeps the split heading to maxLines, dropping whole words from its
 * end (the second part first) until it fits. Measured from the layout, so the
 * words rising in on load (a transform) are not clipped. The page is hidden
 * while it loads, so it is measured once the heading has a size, and again
 * when its width changes or it grows too tall (a font arriving), each time
 * from the authored words.
 * @param {Element} heading
 * @param {number} maxLines
 */
function limitHeadingLines(heading, maxLines) {
  const inners = [...heading.querySelectorAll('.words')];
  if (!inners.length) return;
  const authored = inners.map((el) => el.innerHTML);
  const words = inners.map((el) => el.textContent.trim().split(/\s+/).filter(Boolean));
  const fit = () => {
    inners.forEach((el, i) => { el.innerHTML = authored[i]; });
    const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
    if (!lineHeight || !heading.offsetHeight) return;
    const tooTall = () => heading.offsetHeight > lineHeight * maxLines + 1;
    const counts = words.map((list) => list.length);
    while (tooTall() && counts.some((n) => n > 1)) {
      const i = counts.findLastIndex((n) => n > 1);
      counts[i] -= 1;
      inners[i].textContent = words[i].slice(0, counts[i]).join(' ');
    }
  };
  // re-fits when its width changes, or when it grows past maxLines without one
  // (the display font arriving after the fallback, fonts.css loading lazily)
  let width = 0;
  new ResizeObserver(([entry]) => {
    const { width: w, height } = entry.contentRect;
    const next = Math.round(w);
    if (!next) return;
    const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
    const over = lineHeight && height > lineHeight * maxLines + 1;
    if (next === width && !over) return;
    width = next;
    fit();
  }).observe(heading);
}

/**
 * Sets the animation's CSS variables for progress p: 0 = first screen, 1 = the
 * image full screen, 1 + k = k manifesto lines sharp.
 * @param {Element} block
 * @param {number} p
 * @param {number} lines
 */
function render(block, p, lines) {
  block.style.setProperty('--grow', `${easeInOut(clamp01(p))}`);
  block.style.setProperty('--manifesto-in', `${clamp01(p - 1)}`);
  for (let i = 0; i < lines; i += 1) {
    block.style.setProperty(`--line-${i}`, `${clamp01(p - 1 - i)}`);
  }
}

/**
 * Measures the tile so the media can be scaled down to it, as in the design:
 * the tile shows the whole picture, small, and grows into the full screen.
 * The media is a box of the tile's own shape that just covers the screen
 * (centred, cropped by the hero); at --grow 0 it's scaled down to the tile's
 * size and moved onto it, at --grow 1 it's full size and centred.
 * @param {Element} block
 * @param {Element} tile the placeholder in the heading row
 */
function measureTile(block, tile) {
  const b = block.getBoundingClientRect();
  const t = tile.getBoundingClientRect();
  if (!b.width || !b.height || !t.width || !t.height) return;
  const ratio = t.width / t.height;
  const boxW = Math.max(b.width, b.height * ratio);
  const boxH = boxW / ratio;
  block.style.setProperty('--box-w', `${boxW}px`);
  block.style.setProperty('--box-h', `${boxH}px`);
  block.style.setProperty('--tile-s', `${t.width / boxW}`);
  block.style.setProperty('--tile-dx', `${t.left + t.width / 2 - (b.left + b.width / 2)}px`);
  block.style.setProperty('--tile-dy', `${t.top + t.height / 2 - (b.top + b.height / 2)}px`);
}

/**
 * The tile's video: looped, muted by default, over the poster image. Its
 * source is only added once the page has loaded, so it never competes with
 * the first screen. It plays only while active — on the full screen (step 1)
 * unless the visitor paused it, or in the background behind the finished
 * manifesto (always muted, the visitor's buttons hidden) — and while the hero
 * is on screen; it fades in once it actually plays. Anywhere else it's paused
 * and faded out, so the image is the background. Autoplay can still be
 * refused (e.g. low-power mode): the image then stays.
 * @param {Element} block
 * @param {Element} bg the media layer
 * @param {string} src
 * @param {Function} createVideo builds a silent, decorative video (hero.js)
 * @param {Function} addSource gives a video its source (hero.js)
 * @returns {object} setActive(bool, background): playing (behind the
 *   manifesto) or not; setPaused(bool): the visitor's pause; setSound(bool):
 *   the visitor's sound choice; element: the video
 */
function wireTileVideo(block, bg, src, createVideo, addSource) {
  const video = createVideo();
  video.loop = true;
  video.addEventListener('playing', () => block.classList.add('is-playing'));
  bg.append(video);

  let loaded = document.readyState === 'complete';
  let visible = false;
  let active = false;
  let background = false;
  let paused = false;
  let soundOn = false;
  // the visitor's sound choice applies on the full screen only
  const applySound = () => {
    const muted = background || !soundOn;
    video.muted = muted;
    if (muted) video.setAttribute('muted', '');
    else video.removeAttribute('muted');
  };
  let sourced = false;
  const sync = () => {
    if (!sourced && loaded) {
      sourced = true;
      video.preload = 'auto';
      addSource(video, src);
    }
    if (!sourced) return;
    const wanted = active && (background || !paused);
    if (wanted && visible && !document.hidden) video.play().catch(() => {});
    else video.pause();
  };

  if (!loaded) {
    window.addEventListener('load', () => { loaded = true; sync(); }, { once: true });
  }
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(block);

  return {
    element: video,
    setActive: (isActive, inBackground = false) => {
      if (isActive === active && inBackground === background) return;
      active = isActive;
      background = isActive && inBackground;
      applySound();
      // off its steps the image shows again, not a paused frame
      if (!active) block.classList.remove('is-playing');
      sync();
    },
    // a paused video keeps its frame on screen (is-playing stays)
    setPaused: (isPaused) => {
      paused = isPaused;
      sync();
    },
    setSound: (on) => {
      soundOn = on;
      applySound();
    },
  };
}

/**
 * Sound and pause / play buttons for the tile's video, shown (by CSS) only
 * while the video fills the screen. The video starts muted, so it can
 * autoplay; sound comes on only when the visitor asks for it.
 * @param {object} video the controller from wireTileVideo
 * @returns {Element} the button group
 */
function buildVideoControls(video) {
  const controls = document.createElement('div');
  controls.className = 'controls';
  const button = (name) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `control ${name}`;
    controls.append(el);
    return el;
  };
  const sound = button('sound');
  const playback = button('playback');
  sound.setAttribute('aria-label', 'Video sound');

  let soundOn = false;
  let paused = false;
  const update = () => {
    sound.classList.toggle('is-sound-on', soundOn);
    sound.setAttribute('aria-pressed', String(soundOn));
    playback.classList.toggle('is-paused', paused);
    playback.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  };
  update();

  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    video.setSound(soundOn);
    update();
  });
  playback.addEventListener('click', () => {
    paused = !paused;
    video.setPaused(paused);
    update();
  });
  return controls;
}

/**
 * @param {Element} block the hero block (classes: intro)
 * @param {object} parts built by hero.js
 * @param {Element} parts.bg background layer (picture, and video if authored)
 * @param {Element|null} parts.textCell the Text cell
 * @param {Element|null} parts.manifestoCell the Scroll Manifesto cell
 * @param {Element|null} parts.scrollIndicator the "Scroll" pill
 * @param {string} parts.videoSrc the authored Video, if any
 * @param {Function} parts.createVideo builds a silent, decorative video
 * @param {Function} parts.addSource gives a video its source
 * @param {Element[]} parts.rest hidden rows kept for the editor
 */
export default function decorateIntro(block, {
  bg, textCell, manifestoCell, scrollIndicator, videoSrc, createVideo, addSource, rest,
}) {
  const authoring = !!document.querySelector('[data-aue-resource]');

  // first screen: the heading row, the tile placeholder between its parts
  const screen = document.createElement('div');
  screen.className = 'screen';
  const tile = document.createElement('span');
  tile.className = 'tile';
  tile.setAttribute('aria-hidden', 'true');
  if (textCell) {
    const heading = textCell.querySelector('.heading');
    if (heading && !authoring) {
      const split = splitHeading(heading);
      split[0].after(tile);
      if (!window.matchMedia('(width >= 900px)').matches) {
        limitHeadingLines(heading, MAX_HEADING_LINES_MOBILE);
      }
    } else if (heading) {
      heading.after(tile);
    } else {
      textCell.append(tile);
    }
    screen.append(textCell);
  } else {
    screen.append(tile);
  }

  // manifesto: one line per paragraph, carrying the cell's instrumentation
  const manifesto = document.createElement('div');
  manifesto.className = 'manifesto';
  const lines = [];
  if (manifestoCell) {
    [...manifestoCell.attributes].forEach(({ name, value }) => {
      if (name.startsWith('data-aue-') || name.startsWith('data-richtext-')) {
        manifesto.setAttribute(name, value);
        manifestoCell.removeAttribute(name);
      }
    });
    const maxLines = window.matchMedia('(width >= 900px)').matches
      ? MAX_MANIFESTO_LINES.desktop
      : MAX_MANIFESTO_LINES.mobile;
    [...manifestoCell.querySelectorAll('p')].filter((p) => p.textContent.trim())
      .slice(0, maxLines)
      .forEach((p, i) => {
        p.classList.add('line');
        p.style.setProperty('--line', `var(--line-${i})`);
        manifesto.append(p);
        lines.push(p);
      });
  }

  bg.classList.add('media');
  const children = [bg, screen, manifesto];
  if (scrollIndicator) children.push(scrollIndicator);
  block.replaceChildren(...children, ...rest);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goStatic = () => {
    block.classList.remove('is-animated');
    block.classList.add('is-static');
    lines.forEach((line, i) => block.style.setProperty(`--line-${i}`, '1'));
  };
  if (authoring || reduce) {
    goStatic();
    return;
  }

  block.classList.add('is-animated');
  // the video stays out on data saver: the poster image plays its part
  const video = videoSrc && !navigator.connection?.saveData
    ? wireTileVideo(block, bg, videoSrc, createVideo, addSource)
    : null;
  if (video) block.append(buildVideoControls(video));
  // the image's blurred copies (the progressive blur, hero-intro.css) use
  // the source the browser picked for it
  const poster = bg.querySelector('img.bg-img');
  const setPoster = () => {
    if (poster.currentSrc) block.style.setProperty('--poster', `url("${poster.currentSrc}")`);
  };
  if (poster) {
    poster.addEventListener('load', setPoster);
    if (poster.complete) setPoster();
  }
  // Measured whenever the hero or the tile changes size: the section is still
  // hidden while the hero decorates (nothing to measure yet), and the fonts
  // arriving or a resize shift the heading, and with it the tile.
  // The first screen rises in on its own once the hero is shown (it has a
  // size): the frame after its start state is painted, so it animates.
  const enter = () => {
    if (block.classList.contains('is-in') || !block.getBoundingClientRect().height) return;
    block.classList.add('is-in');
    const start = performance.now() + ENTER_DELAY_MS;
    const tick = (now) => {
      const t = clamp01((now - start) / ENTER_MS);
      block.style.setProperty('--enter', `${enterEase(t)}`);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const measure = () => {
    measureTile(block, tile);
    enter();
  };
  const ro = new ResizeObserver(measure);
  ro.observe(block);
  ro.observe(tile);
  document.fonts?.ready.then(measure);

  let step = 0;
  let p = 0;
  let frame = 0;
  render(block, 0, lines.length);

  // progress for each step: 0 the first screen, 1 the image full screen, and
  // 1 + lines the manifesto with every line sharp
  const STEPS = [0, 1, lines.length + 1];
  // the video plays once a step's animation is over: on the full screen with
  // its buttons, behind the finished manifesto muted and without them;
  // leaving the step stops it at once, the image taking over.
  // Behind the manifesto it loops only until the visitor first interacts with
  // the fold (scroll, swipe, tap, key), then fades back to the blurred image,
  // so it never plays through a page move; it plays again the next time the
  // last line finishes. The listeners only watch: the same gesture still moves
  // the page or the steps.
  const section = block.closest('.section') || block;
  const INPUTS = ['pointerdown', 'touchstart', 'wheel'];
  let stopOnInput = null;
  let bgOffTimer = 0;
  const disarm = () => {
    if (!stopOnInput) return;
    INPUTS.forEach((type) => section.removeEventListener(type, stopOnInput, true));
    document.removeEventListener('keydown', stopOnInput, true);
    stopOnInput = null;
  };
  const setVideo = (on, background = false) => {
    disarm();
    clearTimeout(bgOffTimer);
    const wasBg = block.classList.contains('is-bg-video');
    video?.setActive(on, background);
    block.classList.toggle('is-on-video', on && !background);
    if (on && background) {
      block.classList.add('is-bg-video');
      stopOnInput = () => setVideo(false);
      const opts = { capture: true, passive: true };
      INPUTS.forEach((type) => section.addEventListener(type, stopOnInput, opts));
      document.addEventListener('keydown', stopOnInput, opts);
    } else if (wasBg && !on) {
      // the blur stays (and the video above the image) until it has faded
      // out, so the fading video is never seen sharp
      bgOffTimer = setTimeout(() => block.classList.remove('is-bg-video'), VIDEO_FADE_MS);
    } else {
      block.classList.remove('is-bg-video');
    }
  };

  // Back on the finished manifesto (the page returning to the hero from the
  // next fold): once the hero has settled full screen and the wheel has gone
  // quiet (so the gesture that brought it back, or its momentum, doesn't stop
  // it straight away), the video plays behind it again.
  const SETTLE_MS = 250;
  let lastWheel = -Infinity;
  window.addEventListener('wheel', () => { lastWheel = performance.now(); }, { capture: true, passive: true });
  let settling = 0;
  let lastTop = NaN;
  let stillSince = 0;
  const settle = (now) => {
    settling = 0;
    if (step !== STEPS.length - 1 || frame || stopOnInput) return;
    const { top } = section.getBoundingClientRect();
    if (top !== lastTop) {
      lastTop = top;
      stillSince = now;
    }
    const still = now - stillSince >= SETTLE_MS;
    // stopped short of full screen (no snap): leave it
    if (still && Math.abs(top) > 1) return;
    if (still && now - lastWheel >= SETTLE_MS) setVideo(true, true);
    else settling = requestAnimationFrame(settle);
  };
  new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(settling);
    settling = 0;
    if (!entry.isIntersecting) return;
    lastTop = NaN;
    settling = requestAnimationFrame(settle);
  }, { threshold: 0.98 }).observe(section);

  // the moves from p to a step's progress: the grow in one go; going on, the
  // manifesto coming in, then one line after another; going back, the
  // manifesto out in one go
  const moves = (from, to) => {
    const list = [];
    let at = from;
    if (to > at) {
      if (at < 1) {
        list.push([at, Math.min(1, to), GROW_MS]);
        at = Math.min(1, to);
      }
      while (at < to) {
        const next = Math.min(to, Math.floor(at) + 1);
        list.push([at, next, at < 2 ? MANIFESTO_MS : LINE_MS]);
        at = next;
      }
    } else if (to < at) {
      if (at > 1) {
        list.push([at, Math.max(1, to), OUT_MS, true]);
        at = Math.max(1, to);
      }
      if (to < at) list.push([at, to, GROW_MS]);
    }
    return list;
  };

  // plays the queued moves to the current step, one after another
  let queue = [];
  let hurried = false;
  const run = () => {
    const move = queue.shift();
    if (!move) {
      frame = 0;
      if (step === 1) setVideo(true);
      if (step === 2) setVideo(true, true);
      return;
    }
    const [from, toP, duration, together] = move;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOut(t);
      if (together) {
        // going back out: every line blurs and the manifesto leaves at
        // once, rather than replaying the lines one by one in reverse
        const k = 1 - e;
        block.style.setProperty('--manifesto-in', `${clamp01(from - 1) * k}`);
        lines.forEach((_, i) => block.style.setProperty(`--line-${i}`, `${clamp01(from - 1 - i) * k}`));
        p = toP + (from - toP) * k;
      } else {
        p = from + (toP - from) * e;
        render(block, p, lines.length);
      }
      if (t < 1) frame = requestAnimationFrame(tick);
      else run();
    };
    frame = requestAnimationFrame(tick);
  };

  const play = (to) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, to));
    setVideo(false);
    step = next;
    hurried = false;
    cancelAnimationFrame(frame);
    queue = moves(p, STEPS[next]);
    run();
  };

  // a new scroll down while the manifesto is still sharpening plays the rest
  // of it quickly, the lines sharpening one after another in HURRY_MS; the
  // page stays, and the next scroll moves it on. Only once the manifesto has
  // risen in (its first line sharp), as the Editorial style does: a trackpad
  // swipe speeding up reads as a new gesture, and would otherwise hurry the
  // manifesto it just started. The tile's grow always plays out.
  const hurry = () => {
    if (hurried || step !== STEPS.length - 1 || !frame || p < 2) return false;
    hurried = true;
    cancelAnimationFrame(frame);
    queue = [[p, STEPS[step], HURRY_MS]];
    run();
    return true;
  };

  const stepper = createGestureStepper({
    count: STEPS.length,
    current: () => step,
    play,
    busy: () => frame !== 0,
    hurry,
  });
  attachToSnap(block.closest('.section'), stepper, goStatic);
}
