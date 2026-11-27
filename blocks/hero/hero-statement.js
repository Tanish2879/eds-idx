// Hero "Statement" with Hero Slides (product page "The idea"), loaded by hero.js only when a
// Statement hero has slides; a Statement without slides (About Us) never loads this file.
// Two steps, one scroll gesture each (the section-snap engine hands them over):
//   0 → the statement, centred, over a row of the clips' thumbnails; the playing clip sits in
//       the row's slot (the middle one)
//   1 → that clip grows from its slot to fill the screen, its caption (the slide's Text: a
//       heading and a line) bottom left and the rail of clips on the right (below on phones);
//       picking a clip in the rail cross-fades to it and swaps the caption
// Fields, per Hero Slide:
//   Background Image or Video (Desktop / Mobile) → the clip (an MP4 link)
//   Video Thumbnail (Desktop)                    → its poster, thumbnail and rail image
//   Text                                         → its caption
// Without the snap engine (reduced motion, Universal Editor) the two steps stack.

import { createLoopVideo, playWhileVisible } from '../../scripts/utils/film.js';
import { attachToSnap, createGestureStepper } from '../../scripts/utils/gesture-stepper.js';
import { setAudible, trackSettled } from '../../scripts/utils/sound-fade.js';

// the open/close sequence (hero-statement.css), so a gesture can't start a step mid-way
const STEP_MS = 1300;

// the statement's lines, as on the source: one per clause (after a colon, semicolon or comma),
// when that gives 2 to 6 of them; a longer or shorter statement wraps as it is
const MIN_LINES = 2;
const MAX_LINES = 6;
// the lines after the first sharpen in turn as the statement arrives (hero-statement.css)
const LINE_SHARPEN_MS = 300;
const LINE_STAGGER_MS = 120;

/**
 * Sets a plain-text heading as one line per clause (span.clip-line). Headings with inline
 * markup are left as they are.
 * @param {Element|null} heading
 * @returns {HTMLSpanElement[]} the lines, or none
 */
function splitClauses(heading) {
  if (!heading || heading.children.length) return [];
  // split after , ; : and a space (no lookbehind: iOS Safari < 16.4 can't parse it)
  const clauses = heading.textContent.trim().replace(/([:;,])\s+/g, '$1\u0000').split('\u0000')
    .filter(Boolean);
  if (clauses.length < MIN_LINES || clauses.length > MAX_LINES) return [];
  const lines = clauses.map((clause, i) => {
    const line = document.createElement('span');
    line.className = 'clip-line';
    line.style.setProperty('--i', i);
    line.textContent = clause;
    return line;
  });
  // the spaces keep the clauses apart in the text read out
  heading.replaceChildren(...lines.flatMap((line, i) => (i ? [' ', line] : [line])));
  return lines;
}

/**
 * While the page moves down onto the statement, its lines after the first are dimmed and
 * blurred; once it arrives they sharpen in turn (hero-statement.css .is-dim/.is-sharpening).
 * @param {Element} block the hero
 * @param {number} count the statement's lines
 */
function revealLinesOnArrival(block, count) {
  const section = block.closest('.section');
  if (!section || count < MIN_LINES) return;
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    block.classList.remove('is-dim', 'is-sharpening');
  };
  document.addEventListener('snap:start', ({ detail }) => {
    reset();
    const from = detail?.from;
    const { DOCUMENT_POSITION_FOLLOWING: FOLLOWING } = Node;
    // eslint-disable-next-line no-bitwise
    const down = !!from && !!(from.compareDocumentPosition(section) & FOLLOWING);
    if (detail?.to === section && down) block.classList.add('is-dim');
  });
  document.addEventListener('snap:end', ({ detail }) => {
    if (detail?.to !== section || !block.classList.contains('is-dim')) return;
    block.classList.add('is-sharpening');
    timer = setTimeout(reset, (count - 1) * LINE_STAGGER_MS + LINE_SHARPEN_MS + 100);
  });
}

// a poster URL: this site's images at a screen-wide size, others as they are
function posterUrl(img) {
  if (!img) return '';
  const url = new URL(img.getAttribute('src'), window.location.href);
  if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return url.href;
  return `${url.pathname}?width=2000&format=webply&optimize=medium`;
}

/**
 * Keeps the statement above the thumbnails: moves it up, then cuts long text with an ellipsis.
 * @param {Element} block the hero
 * @param {Element|null} content the statement (the hero's Text)
 * @param {Element} thumbs the thumbnails row
 */
function fitStatement(block, content, thumbs) {
  if (!content) return;
  const GAP = 16; // the least air between the statement's text and the thumbnails
  const TOP = 76; // clear of the site's header
  const TOLERANCE = 1; // sub-pixel rounding must never cost a line
  const heading = content.querySelector('.heading');
  const paragraphs = [...content.querySelectorAll('p')].filter((p) => p.textContent.trim());
  // cut order: the last paragraph first, the heading last
  const cuttable = [...paragraphs.reverse(), heading].filter(Boolean)
    .map((el) => ({ el, min: el === heading ? 2 : 1 }));
  const clamp = (el, lines) => {
    if (lines) {
      el.style.display = '-webkit-box';
      el.style.overflow = 'hidden';
      el.style.setProperty('-webkit-box-orient', 'vertical');
      el.style.setProperty('-webkit-line-clamp', String(lines));
    } else {
      ['display', 'overflow', '-webkit-box-orient', '-webkit-line-clamp'].forEach((prop) => el.style.removeProperty(prop));
    }
  };
  const fit = () => {
    if (block.classList.contains('is-open')) return;
    const area = content.parentElement.getBoundingClientRect();
    if (!area.height) return;
    // reset, then measure the text as it naturally is
    content.style.removeProperty('--statement-shift');
    cuttable.forEach(({ el }) => clamp(el, 0));
    const { paddingTop, paddingBottom } = getComputedStyle(content);
    const padTop = parseFloat(paddingTop) || 0;
    const padBottom = parseFloat(paddingBottom) || 0;
    // the text's box without padding, relative to the hero
    const text = () => {
      const box = content.getBoundingClientRect();
      return { top: box.top - area.top + padTop, bottom: box.bottom - area.top - padBottom };
    };
    const limit = thumbs.getBoundingClientRect().top - area.top - GAP;
    const centred = text();
    const place = () => {
      const now = text();
      const shift = Math.max(TOP, limit - (now.bottom - now.top)) - (now.top - Number.parseFloat(content.style.getPropertyValue('--statement-shift') || 0));
      content.style.setProperty('--statement-shift', `${Math.floor(shift)}px`);
    };
    // stay centred if it fits, else move up (below the header)
    if (centred.bottom <= limit + TOLERANCE) return;
    place();
    // still too tall: cut lines until it fits
    cuttable.forEach(({ el, min }) => {
      if (text().bottom <= limit + TOLERANCE) return;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      let lines = Math.round(el.getBoundingClientRect().height / lh);
      while (lines > min && text().bottom > limit + TOLERANCE) {
        lines -= 1;
        clamp(el, lines);
        place();
      }
    });
  };
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  // refit when the hero or the text changes size
  const observer = new ResizeObserver(schedule);
  observer.observe(block);
  observer.observe(content);
  document.fonts?.addEventListener('loadingdone', schedule);
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
}

/**
 * @param {Element} block the hero
 * @param {object} options
 * @param {Element|null} options.textCell the hero's Text (the statement), already decorated
 * @param {Element[]} options.slideRows the Hero Slide rows
 * @param {object} options.helpers hero.js functions
 */
export default function decorateStatement(block, { textCell, slideRows, helpers }) {
  const {
    mobileMedia, readMediaFields, videoSources, slideText, unwrapRichtext,
    moveInstrumentation, optimizedPicture, authoring,
  } = helpers;
  const onMobile = window.matchMedia(mobileMedia).matches;

  const items = slideRows.map((row) => {
    const media = readMediaFields([...row.children]);
    const sources = videoSources(media);
    // "Enable Video Control" is a cell reading "true" (read before slideText takes the row's cells)
    const hasControls = [...row.children].some((cell) => cell.textContent.trim() === 'true');
    return {
      row,
      hasControls,
      thumb: media.thumb || media.mobileThumb || media.desktop?.img || media.mobile?.img || null,
      src: onMobile ? sources.mobile : sources.desktop,
      text: slideText(row),
    };
  }).filter((item) => authoring || item.src || item.thumb);

  block.classList.add('has-clips');
  // the layers are absolute and clipped; let the snap engine page over them
  block.dataset.snapPassthrough = '';
  // the middle clip starts in the slot
  let active = Math.floor((items.length - 1) / 2);
  block.style.setProperty('--clips', items.length);
  block.style.setProperty('--clip-at', active);

  const picture = (img, width) => {
    const pic = optimizedPicture(img.getAttribute('src'), '', false, [{ width }]);
    pic.querySelector('img').classList.add('clip-img');
    return pic;
  };

  // step 0: the statement over the thumbnails row
  const intro = document.createElement('div');
  intro.className = 'clip-intro';
  if (textCell) intro.append(textCell);
  // the authored heading stays as it is in Universal Editor, where it is edited in place
  const lines = authoring ? [] : splitClauses(textCell?.querySelector('.heading'));
  const row = document.createElement('div');
  row.className = 'clip-thumbs';
  row.setAttribute('aria-hidden', 'true');
  const thumbEls = items.map((item, i) => {
    const thumb = document.createElement('div');
    thumb.className = i === active ? 'clip-thumb clip-slot' : 'clip-thumb';
    if (item.thumb) thumb.append(picture(item.thumb, '400'));
    row.append(thumb);
    return thumb;
  });
  // the playing clip sits in the middle slot and the row turns around it, so none shows twice
  const arrangeThumbs = () => {
    const count = thumbEls.length;
    if (!count) return;
    const slot = Math.floor((count - 1) / 2);
    thumbEls.forEach((thumb, i) => thumb.classList.toggle('clip-slot', i === active));
    row.replaceChildren(...thumbEls.map((_, i) => thumbEls[(active - slot + i + count) % count]));
  };
  intro.append(row);

  // step 1: the clip stage, growing from the slot
  const stage = document.createElement('div');
  stage.className = 'clip-stage';
  const films = document.createElement('div');
  films.className = 'clip-films';
  const players = items.map((item, i) => {
    const video = createLoopVideo(item.src, posterUrl(item.thumb));
    video.className = i === active ? 'clip-video is-active' : 'clip-video';
    films.append(video);
    if (!item.src) return { video, setPaused: () => {} };
    const player = playWhileVisible(video, block);
    if (i !== active) player.setPaused(true);
    return { video, ...player };
  });

  const captions = document.createElement('div');
  captions.className = 'clip-captions';
  captions.setAttribute('aria-live', 'polite');
  const captionOf = items.map((item, i) => {
    const caption = document.createElement('div');
    caption.className = i === active ? 'clip-caption is-active' : 'clip-caption';
    if (i !== active) caption.setAttribute('aria-hidden', 'true');
    moveInstrumentation(item.row, caption);
    if (item.text) {
      unwrapRichtext(item.text);
      item.text.classList.add('clip-text');
      item.text.querySelector('h1, h2, h3, h4, h5, h6')?.classList.add('clip-title');
      item.text.querySelectorAll('p').forEach((p) => {
        if (p.textContent.trim()) p.classList.add('clip-sub');
        else p.remove();
      });
      caption.append(item.text);
    }
    captions.append(caption);
    return caption;
  });

  const rail = document.createElement('div');
  rail.className = 'clip-rail';
  rail.setAttribute('role', 'group');
  rail.setAttribute('aria-label', 'Clips');
  const buttons = items.map((item, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clip-rail-item';
    const title = item.text?.querySelector('.clip-title')?.textContent.trim();
    button.setAttribute('aria-label', title || `Clip ${i + 1} of ${items.length}`);
    button.setAttribute('aria-pressed', String(i === active));
    if (item.thumb) button.append(picture(item.thumb, '400'));
    rail.append(button);
    return button;
  });

  // sound (starts off: browsers only autoplay muted clips) and pause / play, for the open stage;
  // only on the slides that enable them (Enable Video Control)
  let soundOn = false;
  let userPaused = false;
  const controlsOn = (i) => items[i].hasControls && !!items[i].src;
  // sound comes in only once the hero has settled on screen, rising from silence
  let settled = false;
  const heard = players.map(() => false);
  const applySound = () => {
    players.forEach(({ video }, i) => {
      const audible = soundOn && settled && i === active && controlsOn(i)
        && block.classList.contains('is-open');
      if (audible === heard[i]) return;
      heard[i] = audible;
      setAudible(video, audible);
    });
  };
  const controls = document.createElement('div');
  controls.className = 'clip-controls';
  const sound = document.createElement('button');
  const playback = document.createElement('button');
  [sound, playback].forEach((button) => {
    button.type = 'button';
    button.className = `clip-control clip-${button === sound ? 'sound' : 'playback'}`;
    controls.append(button);
  });
  sound.setAttribute('aria-label', 'Video sound');
  const updateControls = () => {
    sound.classList.toggle('is-sound-on', soundOn);
    sound.setAttribute('aria-pressed', String(soundOn));
    playback.classList.toggle('is-paused', userPaused);
    playback.setAttribute('aria-label', userPaused ? 'Play video' : 'Pause video');
  };
  updateControls();
  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    applySound();
    updateControls();
  });
  playback.addEventListener('click', () => {
    userPaused = !userPaused;
    players[active].setPaused(userPaused);
    updateControls();
  });

  // the controls show for the playing slide only when it enables them
  const syncControls = () => {
    controls.hidden = !controlsOn(active);
  };
  syncControls();
  stage.append(films, captions, rail);
  block.replaceChildren(intro, stage);
  if (players.some(({ active: live }) => live) && !authoring) {
    // as in the carousel: top right on desktop, above the caption on phones
    const desktop = window.matchMedia('(width >= 900px)');
    const place = () => (desktop.matches ? stage.append(controls) : captions.prepend(controls));
    place();
    desktop.addEventListener('change', place);

    trackSettled(block, (value) => {
      settled = value;
      applySound();
    });
  }
  if (!authoring) fitStatement(block, textCell, row);

  // picking a clip: cross-fade the films and the captions
  let switchTimer;
  const show = (to) => {
    if (to === active) return;
    const from = active;
    active = to;
    players[to].video.currentTime = 0;
    players[to].setPaused(controlsOn(to) && userPaused);
    applySound();
    syncControls();
    players.forEach(({ video }, i) => video.classList.toggle('is-active', i === to));
    captionOf.forEach((caption, i) => {
      caption.classList.toggle('is-active', i === to);
      if (i === to) caption.removeAttribute('aria-hidden');
      else caption.setAttribute('aria-hidden', 'true');
    });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === to)));
    // thumbnails are hidden while open, so the row turns now, ready for the scroll back
    arrangeThumbs();
    clearTimeout(switchTimer);
    // the old clip stops once it has faded out
    switchTimer = setTimeout(() => {
      if (active !== from) players[from].setPaused(true);
    }, 800);
  };
  rail.addEventListener('click', (e) => {
    const button = e.target.closest('.clip-rail-item');
    if (button) show(buttons.indexOf(button));
  });

  // the two steps; the closed stage's captions and rail are out of reach
  let step = 0;
  const setStep = (to) => {
    step = to;
    block.classList.toggle('is-open', step === 1);
    intro.inert = step === 1;
    captions.inert = step === 0;
    rail.inert = step === 0;
    controls.inert = step === 0;
    applySound();
  };
  setStep(0);

  // keyboard: the closed stage's rail is out of reach, so the statement offers a button (shown
  // on focus) that opens the clips and moves focus to the playing one once its rail shows
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.className = 'clip-open';
  opener.textContent = 'Show the clips';
  intro.append(opener);
  opener.addEventListener('click', () => {
    setStep(1);
    setTimeout(() => buttons[active]?.focus(), STEP_MS);
  });

  let busyUntil = 0;
  const stepper = createGestureStepper({
    count: 2,
    current: () => step,
    play: (to) => {
      busyUntil = performance.now() + STEP_MS;
      setStep(to);
    },
    busy: () => performance.now() < busyUntil,
  });
  revealLinesOnArrival(block, lines.length);
  attachToSnap(block.closest('.section'), stepper, () => {
    // no snap engine: the statement, then the clips, one under the other
    block.classList.add('is-static');
    intro.inert = false;
    captions.inert = false;
    rail.inert = false;
  });
}
