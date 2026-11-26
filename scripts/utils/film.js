// Film helpers shared by the Hero "Product" and Columns "Split" styles: an authored MP4 link
// becomes a looping, muted preview (decorative) and a "watch the film" player in the site modal
// (blocks/modal). The preview respects prefers-reduced-motion and Save-Data, and plays only
// while on screen.

// an authored link to an MP4 file is a video
export const VIDEO_RE = /\.mp4(\?.*)?$/i;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// the previews' sync functions; they all hold still while a film plays in the modal
const previews = new Set();
let filmOpen = false;
const syncPreviews = () => previews.forEach((sync) => sync());

// iOS in Low Power Mode starts no video, even muted, unless a tap starts it (a scroll isn't
// one), so previews stay on their poster. A tap anywhere then starts the refused ones and wakes
const refused = new Set();
const unloaded = new Set();
let tapsWatched = false;
const onTap = () => {
  unloaded.forEach((video) => {
    if (video.src) {
      unloaded.delete(video);
      return;
    }
    video.play().catch(() => {});
    video.pause();
  });
  const retry = [...refused];
  refused.clear();
  retry.forEach((sync) => sync());
};
const watchTaps = () => {
  if (tapsWatched) return;
  tapsWatched = true;
  ['touchend', 'click'].forEach((type) => {
    document.addEventListener(type, onTap, { capture: true, passive: true });
  });
};

/**
 * Whether the page is open in Universal Editor (videos stay still there, content stays editable).
 * @param {Element} el an element of the block
 * @returns {boolean}
 */
export const isAuthoring = (el) => !!el.closest('[data-aue-resource]')
  || !!document.querySelector('[data-aue-resource]');

/**
 * The first link to an MP4 file inside `root`.
 * @param {Element} root
 * @returns {HTMLAnchorElement|null}
 */
export function findVideoLink(root) {
  return [...root.querySelectorAll('a[href]')]
    .find((a) => VIDEO_RE.test(a.getAttribute('href'))) || null;
}

/**
 * A muted, looping, decorative video with no source loaded yet (see playWhileVisible).
 * @param {string} src MP4 URL
 * @param {string} [poster] image shown until it plays
 * @returns {HTMLVideoElement}
 */
export function createLoopVideo(src, poster) {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.disablePictureInPicture = true;
  ['muted', 'playsinline', 'disablepictureinpicture'].forEach((a) => video.setAttribute(a, ''));
  video.setAttribute('aria-hidden', 'true');
  if (poster) video.poster = poster;
  video.dataset.src = src;
  return video;
}

/**
 * Plays a loop video while `target` is on screen and the tab is visible; pauses otherwise.
 * Nothing loads or plays under reduced motion, Save-Data or in Universal Editor (the poster,
 * or the first frame, stays). The returned `setPaused` lets a pause button stop it for good.
 * @param {HTMLVideoElement} video from createLoopVideo
 * @param {Element} [target] element whose visibility drives playback (default: the video)
 * @returns {{ setPaused: function(boolean): void, active: boolean }}
 */
export function playWhileVisible(video, target = video) {
  const still = () => {
    // no poster: show the first frame instead of an empty box
    if (!video.poster && !video.src) {
      video.preload = 'metadata';
      video.src = `${video.dataset.src}#t=0.1`;
    }
  };
  if (reduceMotion() || navigator.connection?.saveData || isAuthoring(video)) {
    still();
    return { setPaused: () => {}, active: false };
  }
  let visible = false;
  let paused = false;
  const sync = () => {
    if (visible && !paused && !filmOpen && !document.hidden) {
      if (!video.src) {
        video.preload = 'auto';
        video.src = video.dataset.src;
      }
      video.play().catch((e) => {
        if (e?.name === 'NotAllowedError') refused.add(sync);
      });
    } else if (video.src) {
      video.pause();
    }
  };
  if (!video.src) unloaded.add(video);
  watchTaps();
  // really on screen: with full-screen sections the next one sits right at the viewport's edge,
  // which counts as intersecting (zero area) and would load its film before anyone gets there
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio > 0;
    sync();
  }, { threshold: [0, 0.01] }).observe(target);
  document.addEventListener('visibilitychange', sync);
  previews.add(sync);
  return {
    active: true,
    setPaused: (on) => {
      paused = on;
      sync();
    },
  };
}

// --- the film player (styles/film.css), as the Code T prototype's `.media` overlay ---
// The film fills a frame 5% in from the window's edges (radius 18px) over a 88% black backdrop,
// the eyebrow, title and text at its bottom left, sound and pause buttons at its bottom right,
// a progress line along its foot. Opening, the frame grows out of the card's thumbnail (0.9s
// power3.inOut) as the backdrop fades in (0.5s power2.out) and the poster settles from 1.06x
// (1.2s power3.out); at 0.7s the copy, the buttons and the close button rise 16px out of a 6px
// blur (0.55s power3.out, 0.06s apart). Closing reverses it: they fade (0.25s power2.in), the
// frame shrinks back into the thumbnail (0.8s from 0.08s), the film fades (0.35s from 0.45s)
// and the backdrop (0.5s from 0.4s); with the thumbnail off screen it all fades (0.45s from
// 0.1s). With reduced motion it opens and closes at once and the film doesn't start on its own.

const EASE = {
  power1In: 'cubic-bezier(0.11, 0, 0.5, 0)',
  power1Out: 'cubic-bezier(0.5, 1, 0.89, 1)',
  power2In: 'cubic-bezier(0.32, 0, 0.67, 0)',
  power2Out: 'cubic-bezier(0.33, 1, 0.68, 1)',
  power3Out: 'cubic-bezier(0.25, 1, 0.5, 1)',
  power3InOut: 'cubic-bezier(0.76, 0, 0.24, 1)',
};

const ICONS = {
  sound: '<svg class="film-icon-sound" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 5.8h2.6L8.2 2.6v10.8L4.4 10.2H1.8z"/><path class="ln" d="M10.6 5.4a3.6 3.6 0 0 1 0 5.2M12.6 3.6a6.2 6.2 0 0 1 0 8.8"/></svg>',
  muted: '<svg class="film-icon-muted" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 5.8h2.6L8.2 2.6v10.8L4.4 10.2H1.8z"/><path class="ln" d="M10.8 6.4l3.2 3.2M14 6.4l-3.2 3.2"/></svg>',
  pause: '<svg class="film-icon-pause" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.6" y="2.6" width="3" height="10.8" rx="1"/><rect x="9.4" y="2.6" width="3" height="10.8" rx="1"/></svg>',
  play: '<svg class="film-icon-play" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.6 2.9v10.2a.6.6 0 0 0 .9.5l8-5.1a.6.6 0 0 0 0-1L5.5 2.4a.6.6 0 0 0-.9.5z"/></svg>',
};

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

// a rectangle on screen, as the frame's left/top/width/height/radius
const rectOf = (node) => {
  const r = node.getBoundingClientRect();
  return {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    borderRadius: getComputedStyle(node).borderRadius || '0px',
  };
};

// whether the thumbnail can take the frame back (on screen and shown)
const onScreen = (node) => {
  if (!node?.isConnected) return false;
  const r = node.getBoundingClientRect();
  const cs = getComputedStyle(node);
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
    && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1;
};

/**
 * Opens the film in the site modal, as a full-window player: the video (it starts on its own,
 * with sound if the browser allows, unless the visitor prefers reduced motion), its eyebrow,
 * title and text, sound and play/pause buttons. Focus returns to `trigger`.
 * @param {object} film
 * @param {string} film.src MP4 URL
 * @param {string} [film.poster]
 * @param {string} [film.eyebrow]
 * @param {string} [film.title] the dialog's heading (its accessible name)
 * @param {Node[]} [film.body] text nodes or elements, cloned into the dialog
 * @param {string} [film.captions] a WebVTT captions file, shown by default
 * @param {string} [film.captionsLang] its language (default: the page's)
 * @param {Element} [film.from] the thumbnail the player grows from and shrinks back into
 *   (default: the trigger's card's `.product-film-media` / `.split-film-media`)
 * @param {string} [film.className] a class added to the player, for the opening block's variant
 * @param {HTMLElement} [trigger]
 */
export async function openFilm({
  src, poster, eyebrow, title, body = [], captions, captionsLang, from, className,
}, trigger) {
  const [{ createModal }, { loadCSS }] = await Promise.all([
    import('../../blocks/modal/modal.js'),
    import('../aem.js'),
  ]);
  const cssLoaded = loadCSS(`${window.hlx.codeBasePath}/styles/film.css`);
  const thumb = from || trigger?.closest('.product-film, .split-film')
    ?.querySelector('.product-film-media, .split-film-media') || null;

  const back = el('div', 'film-player-back');
  const player = el('div', 'film-player');
  // the opening block's own variant (e.g. the Columns Split film's text limits, film.css)
  if (className) player.classList.add(className);

  let posterImg = null;
  if (poster) {
    posterImg = el('img', 'film-player-poster');
    posterImg.alt = '';
    posterImg.src = poster;
    player.append(posterImg);
  }

  const video = el('video', 'film-player-video');
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  if (poster) video.poster = poster;
  if (captions) {
    const track = el('track');
    track.kind = 'captions';
    track.src = captions;
    track.srclang = captionsLang || document.documentElement.lang || 'en';
    track.label = 'Captions';
    track.default = true;
    video.append(track);
  }
  video.src = src;

  const info = el('div', 'film-player-info');
  if (eyebrow) {
    const p = el('p', 'film-player-eyebrow');
    p.textContent = eyebrow;
    info.append(p);
  }
  const heading = el('h2', 'film-player-title');
  heading.textContent = title || eyebrow || 'Film';
  info.append(heading);
  body.forEach((node) => {
    const copy = node.cloneNode(true);
    if (copy.nodeType === Node.ELEMENT_NODE) {
      copy.removeAttribute('class');
      copy.classList.add('film-player-text');
    }
    info.append(copy);
  });

  const bar = el('div', 'film-player-bar');
  const sound = el('button', 'film-player-btn film-player-sound', ICONS.sound + ICONS.muted);
  const toggle = el('button', 'film-player-btn film-player-toggle', ICONS.pause + ICONS.play);
  [sound, toggle].forEach((b) => { b.type = 'button'; });
  bar.append(sound, toggle);
  const progress = el('div', 'film-player-progress', '<span></span>');
  progress.setAttribute('aria-hidden', 'true');
  const fill = progress.firstElementChild;

  player.append(video, el('div', 'film-player-scrim'), info, bar, progress);

  const { block, showModal } = await createModal([back, player]);
  await cssLoaded;
  const dialog = block.querySelector('dialog');
  const closeButton = dialog.querySelector('.close-button');
  dialog.classList.add('film-dialog');
  // the backdrop is drawn by .film-player-back, so it can fade with the frame

  const sync = () => {
    player.classList.toggle('is-paused', video.paused);
    player.classList.toggle('is-muted', video.muted);
    toggle.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    sound.setAttribute('aria-label', video.muted ? 'Sound on' : 'Mute');
  };
  ['play', 'pause', 'volumechange'].forEach((type) => video.addEventListener(type, sync));
  video.addEventListener('timeupdate', () => {
    fill.style.transform = `scaleX(${video.duration ? video.currentTime / video.duration : 0})`;
  });
  const playPause = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  toggle.addEventListener('click', playPause);
  video.addEventListener('click', playPause);
  sound.addEventListener('click', () => { video.muted = !video.muted; });
  sync();

  const motion = !reduceMotion();
  // the film shows once it plays, over its poster
  if (posterImg) {
    video.style.opacity = '0';
    video.addEventListener('playing', () => {
      if (video.style.opacity !== '0') return;
      video.style.opacity = '';
      if (motion) video.animate({ opacity: [0, 1] }, { duration: 400, easing: EASE.power1Out });
    }, { once: true });
  }

  const chrome = [info, bar, closeButton];
  let running = [];
  const stop = () => {
    running.forEach((a) => a.cancel());
    running = [];
  };
  const run = (target, keyframes, options) => {
    const a = target.animate(keyframes, { fill: 'both', ...options });
    running.push(a);
    return a;
  };

  // closing: animated (unless reduced motion), then the native close (modal.js cleans up)
  let closing = false;
  const close = () => {
    if (closing || !dialog.open) return;
    closing = true;
    video.pause();
    if (!motion) {
      dialog.close();
      return;
    }
    stop();
    chrome.forEach((node) => run(node, { opacity: 0 }, { duration: 250, easing: EASE.power2In }));
    let last;
    if (onScreen(thumb)) {
      last = run(player, rectOf(thumb), {
        duration: 800, delay: 80, easing: EASE.power3InOut,
      });
      run(video, { opacity: 0 }, { duration: 350, delay: 450, easing: EASE.power1In });
      if (posterImg) {
        run(posterImg, { opacity: 0 }, { duration: 350, delay: 450, easing: EASE.power1In });
      }
      run(back, { opacity: 0 }, { duration: 500, delay: 400, easing: EASE.power2In });
    } else {
      last = run(dialog, { opacity: 0 }, { duration: 450, delay: 100, easing: EASE.power2In });
    }
    last.finished.catch(() => {}).then(() => { if (dialog.open) dialog.close(); });
  };
  // the close button and a click beside the frame (modal.js would close at once): caught first
  block.addEventListener('click', (e) => {
    if (!e.target.closest('.close-button') && e.target !== back && e.target !== dialog) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);
  dialog.addEventListener('cancel', (e) => {
    if (!e.cancelable) return;
    e.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    stop();
    video.pause();
    filmOpen = false;
    syncPreviews();
  });

  filmOpen = true;
  syncPreviews();
  showModal(trigger);

  if (motion) {
    run(back, { opacity: [0, 1] }, { duration: 500, easing: EASE.power2Out });
    if (onScreen(thumb)) {
      run(player, [{ ...rectOf(thumb), offset: 0 }], { duration: 900, easing: EASE.power3InOut });
    } else {
      run(player, { opacity: [0, 1] }, { duration: 500, easing: EASE.power2Out });
    }
    if (posterImg) {
      run(posterImg, { transform: ['scale(1.06)', 'none'] }, {
        duration: 1200, easing: EASE.power3Out,
      });
    }
    chrome.forEach((node, i) => run(node, {
      opacity: [0, 1],
      transform: ['translateY(16px)', 'none'],
      filter: ['blur(6px)', 'blur(0)'],
    }, { duration: 550, delay: 700 + i * 60, easing: EASE.power3Out }));
    // the open state is the CSS one: nothing kept once it has played
    Promise.all(running.map((a) => a.finished)).then(stop, () => {});
    // sound if the browser allows it, else muted
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }
}

/**
 * Builds the round play badge (decorative).
 * @returns {HTMLSpanElement}
 */
export function createPlayBadge() {
  const badge = document.createElement('span');
  badge.className = 'film-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = '<svg viewBox="0 0 12 12" focusable="false"><path d="M3 1.8v8.4L10.2 6z" fill="currentColor"/></svg>';
  return badge;
}
