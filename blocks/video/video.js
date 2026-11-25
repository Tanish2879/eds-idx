/*
 * Video Block
 * Plays a video file from AEM Assets (MP4, WebM) in the page. YouTube and Vimeo videos go in
 * the Embed block.
 * Based on the AEM Block Collection video block.
 * https://www.aem.live/developer/block-collection/video
 *
 * Authored rows (all but the first optional):
 * 1. the video: link to the file in AEM Assets
 * 2. poster image: shown with a play button until the video starts
 * 3. accessible name of the video
 * 4. caption: rich text shown with the video (under it; on the Combat page the text of the
 *    film pill, video.css)
 * Options (block classes): autoplay, muted, loop, no-controls (no buttons at all);
 * ratio-4-3 / ratio-1-1 / ratio-9-16 (default 16:9); full-bleed (edge to edge) or fill-screen
 * (edge to edge and as tall as the section), video.css only.
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// (no type for .mov: Chrome reports video/quicktime as unplayable and would skip the source,
// though it plays most .mov files)
const MIME_TYPES = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
};
const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|mov)$/i;

/**
 * @param {string} value authored link
 * @returns {URL|null} the link when it is a video file (by its extension)
 */
function toVideoUrl(value) {
  try {
    const url = new URL(value.trim(), window.location.href);
    return ['http:', 'https:'].includes(url.protocol) && VIDEO_FILE.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

// Universal Editor shows sections only as tall as their content (styles.css), so there is no
// screen to fit into: the video is fitted to a typical desktop screen instead (the height the
// site's full-screen blocks, e.g. Hero, are given in the editor), which gives it its published
// size. (Measuring the section itself there would measure the video and shrink it.)
const EDITOR_SCREEN = 900;

/**
 * Fluid height, as for the Embed block: in a snapped section (exactly one screen tall) the
 * video takes the room the rest of the section leaves, measured from the real heading and text
 * above or below it and kept up to date. video.css sizes the video from --video-room.
 * @param {Element} block
 */
function fitToSection(block) {
  const section = block.closest('.section');
  const holder = block.parentElement;
  if (!section || !holder || section.classList.contains('no-snap')
    || document.body.classList.contains('free-scroll') || !window.ResizeObserver) return;
  const editor = !!document.querySelector('[data-aue-resource]');
  const px = (value) => parseFloat(value) || 0;
  const measure = () => {
    const sectionStyle = getComputedStyle(section);
    const holderStyle = getComputedStyle(holder);
    const blockStyle = getComputedStyle(block);
    const caption = block.querySelector(':scope > .video-caption');
    const others = [...section.children].filter((el) => el !== holder)
      .concat([...holder.children].filter((el) => el !== block))
      .reduce((sum, el) => sum + el.offsetHeight, 0)
      + (caption ? caption.offsetHeight + px(getComputedStyle(caption).marginTop) : 0);
    const screen = editor ? EDITOR_SCREEN : section.clientHeight;
    const room = screen - px(sectionStyle.paddingTop) - px(sectionStyle.paddingBottom)
      - px(holderStyle.paddingTop) - px(holderStyle.paddingBottom)
      - px(blockStyle.marginTop) - px(blockStyle.marginBottom) - others;
    block.style.setProperty('--video-room', `${Math.max(180, Math.floor(room))}px`);
  };
  const observer = new ResizeObserver(measure);
  observer.observe(section);
  [...section.children].filter((el) => el !== holder).forEach((el) => observer.observe(el));
  const caption = block.querySelector(':scope > .video-caption');
  if (caption) observer.observe(caption);
  measure();
}

/**
 * The poster's largest authored rendition (the <img> fallback is only 750px wide, too soft
 * for a full-width video).
 * @param {HTMLPictureElement} picture
 * @returns {string}
 */
function posterUrl(picture) {
  const wide = [...picture.querySelectorAll('source[media]')]
    .find((s) => window.matchMedia(s.media).matches);
  const candidate = wide?.srcset.split(',')[0].trim().split(/\s+/)[0];
  return candidate ? new URL(candidate, window.location.href).href : picture.querySelector('img')?.src || '';
}

/** Runs `fn` once the block is about to scroll into view. */
function whenNear(block, fn) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    fn();
  }, { rootMargin: '200px' });
  observer.observe(block);
}

/**
 * Reads the authored options. Browsers only autoplay a muted video, so autoplay is muted.
 * @param {Element} block
 */
function readOptions(block) {
  const has = (name) => block.classList.contains(name);
  const autoplay = has('autoplay');
  return {
    autoplay,
    muted: autoplay || has('muted'),
    loop: has('loop'),
    controls: !has('no-controls'),
  };
}

// No autoplay for visitors who ask for less motion or less data, nor while authoring.
const mayAutoplay = (block) => !reducedMotion.matches && !navigator.connection?.saveData
  && !block.closest('[data-aue-resource]') && !document.querySelector('[data-aue-resource]');

// ---------------------------------------------------------------------------------------
// Only one video plays with sound at a time, and a snap away from a video pauses it.
// ---------------------------------------------------------------------------------------
const players = new Set();

let ready = false;

/** Registers the page-level listener, once. */
function setup() {
  if (ready) return;
  ready = true;
  document.addEventListener('snap:start', (e) => players.forEach((p) => {
    if (p.section !== e.detail?.to) p.pause();
  }));
}

/** A video that plays with sound stops every other video with sound. */
function claim(self) {
  players.forEach((other) => {
    if (other === self) return;
    if (!other.video.isConnected) players.delete(other);
    else if (!other.video.muted) other.pause();
  });
}
/**
 * @param {Element} block
 * @param {string} src video file
 * @param {object} options readOptions() (`autoplay`: it will play by itself), plus `poster`
 *   (image URL) and `start` (the visitor asked it to play)
 * @returns {HTMLDivElement} the frame holding the video
 */
function createPlayer(block, src, title, {
  autoplay = false, muted, loop, controls, poster = '', start = false,
}) {
  setup();
  const frame = document.createElement('div');
  frame.className = 'video-frame';
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.loop = loop;
  video.controls = controls;
  if (muted) {
    video.muted = true;
    video.setAttribute('muted', '');
  }
  if (poster) video.poster = poster;
  video.setAttribute('aria-label', title || 'Video');
  // nothing downloads until it plays or nears the screen (decorate); without a poster the
  // first frame then stands in for one
  video.preload = start ? 'auto' : 'none';
  const source = document.createElement('source');
  source.src = poster || start ? src : `${src}#t=0.1`;
  const type = MIME_TYPES[new URL(src, window.location.href).pathname.split('.').pop().toLowerCase()];
  if (type) source.type = type;
  video.append(source);
  frame.append(video);

  const entry = { video, section: block.closest('.section'), pause: () => video.pause() };
  players.add(entry);
  const claimIfAudible = () => { if (!video.paused && !video.muted) claim(entry); };
  video.addEventListener('play', claimIfAudible);
  video.addEventListener('volumechange', claimIfAudible);
  video.addEventListener('playing', () => frame.classList.add('is-started'));

  if (!controls) {
    // No buttons while it plays. It can still be paused (WCAG 2.2.2): a click or tap on the
    // picture, or Space / Enter once it has keyboard focus (section-snap.js leaves Space to a
    // video). A paused video shows the big play button, so it can be told apart from a picture:
    // one that will autoplay only once the visitor paused it (or the browser refused to play).
    const toggle = () => {
      video.dataset.userPaused = !video.paused;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    };
    video.tabIndex = 0;
    video.setAttribute('aria-label', `${title || 'Video'}. Press Space to pause or play`);
    video.addEventListener('click', toggle);
    video.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) toggle();
    });
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'video-play';
    play.setAttribute('aria-label', `Play: ${title || 'video'}`);
    play.addEventListener('click', toggle);
    const sync = () => frame.classList.toggle('is-paused', video.paused
      && (!autoplay || video.dataset.userPaused === 'true' || frame.classList.contains('is-refused')));
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    sync();
    frame.append(play);
  }
  return frame;
}

/** Plays a muted video while at least half of it is on screen. */
function autoplayInView(block, video) {
  const observer = new IntersectionObserver(([entry]) => {
    if (!video.isConnected) {
      observer.disconnect();
      return;
    }
    if (entry.isIntersecting) {
      // a video the visitor paused stays paused
      if (video.dataset.userPaused === 'true') return;
      video.play().catch(() => {
        // refused (e.g. iOS Low Power Mode): the play button shows (createPlayer)
        const frame = video.closest('.video-frame');
        frame?.classList.add('is-refused');
        video.dispatchEvent(new Event('pause'));
      });
    } else {
      video.pause();
    }
  }, { threshold: 0.5 });
  observer.observe(block);
}

/**
 * Poster image with a play button; the video loads when it is clicked.
 * @param {function(): void} onPlay
 */
function createPlaceholder(picture, title, onPlay) {
  const wrapper = document.createElement('div');
  wrapper.className = 'video-placeholder';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'video-play';
  play.setAttribute('aria-label', title ? `Play: ${title}` : 'Play video');
  wrapper.append(picture, play);
  wrapper.addEventListener('click', onPlay);
  return wrapper;
}

/**
 * Combat page: the poster is a thumbnail in the film pill, too small to watch in, so the
 * video plays full screen; leaving full screen stops it and brings the pill back.
 * @param {HTMLVideoElement} video
 * @param {function(): void} onExit
 */
function playFullScreen(video, onExit) {
  const exit = () => {
    video.pause();
    onExit();
  };
  if (video.requestFullscreen) {
    video.requestFullscreen().then(() => {
      const onChange = () => {
        if (document.fullscreenElement) return;
        document.removeEventListener('fullscreenchange', onChange);
        exit();
      };
      document.addEventListener('fullscreenchange', onChange);
    }).catch(() => video.focus());
    return;
  }
  try {
    // iPhone: only the video element has a full-screen mode
    video.addEventListener('webkitendfullscreen', exit, { once: true });
    video.webkitEnterFullscreen();
  } catch {
    video.focus();
  }
}

/**
 * The optional caption (4th row), as its authored cell, so it stays editable in Universal Editor.
 * @param {Element} row
 * @returns {Element|null}
 */
function readCaption(row) {
  if (!row?.textContent.trim()) return null;
  const caption = row.firstElementChild || row;
  caption.classList.add('video-caption');
  return caption;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  // the caption row is set aside first, so its text and links are never taken for the
  // video's own fields
  const caption = rows.length > 3 ? readCaption(rows.splice(3, 1)[0]) : null;
  const link = block.querySelector('a');
  const url = toVideoUrl(link?.href || rows[0]?.textContent || '');
  const picture = block.querySelector('picture');
  // the accessible name, else the poster's alt text
  const title = rows
    .filter((row) => !(link && row.contains(link)) && !row.querySelector('picture'))
    .map((row) => row.textContent.trim())
    .find((text) => text && !/^https?:\/\//.test(text)) || picture?.querySelector('img')?.alt.trim() || '';
  const options = readOptions(block);
  const autoplay = options.autoplay && mayAutoplay(block);

  block.textContent = '';
  if (!url) {
    // not a video file (e.g. a YouTube link: that goes in the Embed block): hidden on the page,
    // a note for the author in Universal Editor
    block.classList.add('video-empty');
    if (block.closest('[data-aue-resource]')) {
      block.textContent = 'Video: choose an MP4 or WebM file from AEM Assets. '
        + 'For YouTube or Vimeo, use the Embed block.';
    }
    return;
  }
  if (caption) block.append(caption);
  fitToSection(block);
  // a video file
  const poster = picture ? posterUrl(picture) : '';
  if (picture && !autoplay) {
    const placeholder = createPlaceholder(picture, title, () => {
      const frame = createPlayer(block, url.href, title, {
        ...options, autoplay: false, poster, start: true,
      });
      placeholder.replaceWith(frame);
      const video = frame.querySelector('video');
      video.play().catch(() => {});
      if (document.body.classList.contains('combat')) {
        playFullScreen(video, () => {
          frame.replaceWith(placeholder);
          placeholder.querySelector('.video-play')?.focus();
        });
        return;
      }
      // the poster's play button is gone: keyboard focus moves to the video
      video.focus();
    });
    block.prepend(placeholder);
    return;
  }
  const frame = createPlayer(block, url.href, title, { ...options, autoplay, poster });
  block.prepend(frame);
  const video = frame.querySelector('video');
  if (autoplay) autoplayInView(block, video);
  else if (!poster) {
    whenNear(block, () => {
      video.preload = 'metadata';
      video.load(); // (WebKit needs it for a preload change after the source was added)
    });
  }
}
