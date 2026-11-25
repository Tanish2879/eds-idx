import { createOptimizedPicture, decorateIcons, loadCSS } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { DEFAULT_CTA } from '../../scripts/utils/datalayer.js';
import decorateGlitch from '../../scripts/utils/glitch.js';
import createScrollIndicator from '../../scripts/utils/scroll-indicator.js';
import { setAudible, trackSettled } from '../../scripts/utils/sound-fade.js';

// mobile image breakpoint
const MOBILE_MEDIA = '(max-width: 899px)';

const clamp01 = (n) => Math.min(1, Math.max(0, n));
// maps v within [a, b] to 0..1
const range = (v, a, b) => clamp01((v - a) / (b - a));

// mobile image widths for 1x and 2x+ screens
const MOBILE_WIDTHS = [750, 1200];

// an authored MP4 link is a background video
const VIDEO_RE = /\.mp4(\?.*)?$/i;

// returns the cell's MP4 URL, or '' if it isn't a video
function videoHref(cell) {
  if (cell.querySelector('img')) return '';
  const link = cell.querySelector('a[href]');
  const href = link ? link.getAttribute('href') : cell.textContent.trim();
  return href && VIDEO_RE.test(href) ? href : '';
}

// builds a muted, decorative background video with no source yet
function createBgVideo() {
  const video = document.createElement('video');
  video.className = 'video';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'none';
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('disableremoteplayback', '');
  video.setAttribute('aria-hidden', 'true');
  return video;
}

// adds the MP4 source to a background video
function addVideoSource(video, src) {
  const source = document.createElement('source');
  source.src = src;
  source.type = 'video/mp4';
  video.append(source);
  return source;
}

// builds a still frame of a video to stand in for an image
// (one for the other screen size waits: it loads once the screen crosses the breakpoint)
function createVideoStill(src, className, shown = true) {
  const still = createBgVideo();
  still.className = className;
  const source = addVideoSource(still, src);
  source.src = `${source.src}#t=0.1`;
  const load = () => {
    still.preload = 'metadata';
    // WebKit needs an explicit load for a late-added source
    still.load();
  };
  if (shown) load();
  else window.matchMedia(MOBILE_MEDIA).addEventListener('change', load, { once: true });
  return still;
}

// the poster in `holder` that is src's own first frame (no thumbnail) and on show, if any:
// it plays in place, so the video downloads once and its frame shows as soon as it arrives
function shownStill(holder, src) {
  const url = new URL(src, window.location.href).href;
  return [...holder.querySelectorAll('video.video-still')].find((still) => getComputedStyle(still).display !== 'none'
    && still.querySelector('source')?.src.split('#')[0] === url);
}

// loops a muted background video, the one for the screen size (videoSources), once the page
// has loaded and the hero is on screen
function wireVideo(block, bg, sources) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  if (!sources?.desktop && !sources?.mobile) return;
  if (reduce || navigator.connection?.saveData || authoring) return;
  const mobile = window.matchMedia(MOBILE_MEDIA);

  // the video over a thumbnail, faded in once it plays (hero.css)
  const video = createBgVideo();
  video.loop = true;
  video.addEventListener('playing', () => bg.classList.add('is-playing'));

  let loaded = document.readyState === 'complete';
  let visible = false;
  // the source loaded, '' until the video starts, and what plays it: the video above, or the
  // poster that is the video's first frame
  let src = '';
  let player = null;
  let awaitingTouch = false;
  let sync;
  // if iOS refuses autoplay, retry on the first touch or key press
  const play = () => {
    player.play().catch(() => {
      if (awaitingTouch) return;
      awaitingTouch = true;
      const retry = () => {
        if (!awaitingTouch) return;
        awaitingTouch = false;
        sync();
      };
      ['touchend', 'pointerdown', 'keydown'].forEach((type) => {
        window.addEventListener(type, retry, { once: true, capture: true, passive: true });
      });
    });
  };
  sync = () => {
    const wanted = mobile.matches ? sources.mobile : sources.desktop;
    // the first start, or the screen crossed the breakpoint: load that screen's video (none
    // where its field is an image, which then shows)
    // (or the same video, when the poster playing it is now hidden: the other size's)
    const hidden = player && player !== video && getComputedStyle(player).display === 'none';
    if ((wanted !== src || hidden) && (src || (loaded && visible))) {
      bg.classList.remove('is-playing');
      player?.pause();
      if (player === video) {
        video.replaceChildren();
        video.load();
        video.remove();
      }
      src = wanted;
      player = src ? shownStill(bg, src) || video : null;
      if (player === video) {
        // WebKit needs an explicit load for a late-added source
        video.preload = 'auto';
        addVideoSource(video, src);
        bg.append(video);
        video.load();
      } else if (player) {
        player.loop = true;
        player.preload = 'auto';
      }
    }
    if (!player) return;
    if (visible && !document.hidden) play();
    else player.pause();
  };

  if (!loaded) {
    window.addEventListener('load', () => { loaded = true; sync(); }, { once: true });
  }
  document.addEventListener('visibilitychange', sync);
  mobile.addEventListener('change', sync);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(block);
}

// createOptimizedPicture keeps only the image's path, so it only suits this site's own raster
// images; an image from another origin, or an SVG, keeps its own URL in a plain picture
function optimizedPicture(src, alt, eager, breakpoints) {
  const url = new URL(src, window.location.href);
  if (url.origin === window.location.origin && !/\.svg$/i.test(url.pathname)) {
    return createOptimizedPicture(src, alt, eager, breakpoints);
  }
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = eager ? 'eager' : 'lazy';
  picture.append(img);
  return picture;
}

// adds optimised mobile image sources to a picture
function addMobileSource(picture, mobileImg) {
  if (!mobileImg) return;
  const { origin, pathname } = new URL(mobileImg.getAttribute('src'), window.location.href);
  const ext = pathname.split('.').pop();
  const source = (format, type) => {
    const el = document.createElement('source');
    el.setAttribute('media', MOBILE_MEDIA);
    if (type) el.setAttribute('type', type);
    el.setAttribute('srcset', MOBILE_WIDTHS
      .map((w) => `${origin}${pathname}?width=${w}&format=${format}&optimize=medium ${w}w`)
      .join(', '));
    el.setAttribute('sizes', '100vw');
    return el;
  };
  picture.prepend(source('webply', 'image/webp'), source(ext));
}

// a media field's image, or its MP4 video (null when it's empty)
function readMedia(cell) {
  const img = cell?.querySelector('img');
  if (img) return { img };
  const video = cell ? videoHref(cell) : '';
  return video ? { video, link: cell.querySelector('a') } : null;
}

// an image or MP4 field, as opposed to a text one
function isMedia(cell) {
  return !!videoHref(cell) || (!!cell.querySelector('img') && !cell.textContent.trim());
}

// the media fields of the Hero and the Hero Slide, in their model order
const MEDIA_FIELDS = ['image', 'mobileImage', 'thumbnail', 'mobileThumbnail'];

// a field cell's Universal Editor prop
const propOf = (c) => c.dataset.aueProp || c.querySelector('[data-aue-prop]')?.dataset.aueProp;

// the Hero's Background Image: its 7th field, after Text and Manifesto (content from before
// it has six rows or fewer)
const BACKDROP_AT = MEDIA_FIELDS.length + 2;

// the Hero's Background Image cell, by its Universal Editor prop, else by its place when it
// holds an image; null when absent
function readBackdropField(cells) {
  const named = cells.find((c) => propOf(c) === 'backgroundImage');
  if (named) return named;
  const cell = cells[BACKDROP_AT];
  return cell && !propOf(cell) && cell.querySelector('img') && isMedia(cell) ? cell : null;
}

// runs `fn` once an image has loaded (or failed), right away when it has or there is none
function onImageIn(img, fn) {
  if (!img || img.complete) {
    fn();
    return;
  }
  img.addEventListener('load', fn, { once: true });
  img.addEventListener('error', fn, { once: true });
}

// the Background Image: a decorative layer behind the image (hero.css .bg-backdrop), loaded
// lazily at low priority so it never competes with the image, the LCP
function createBackdrop(cell) {
  const img = cell?.querySelector('img');
  if (!img) return null;
  const pic = createOptimizedPicture(img.src, '', false, [{ width: '2000' }]);
  pic.classList.add('bg-backdrop');
  const picImg = pic.querySelector('img');
  picImg.classList.add('bg-backdrop-img');
  picImg.setAttribute('fetchpriority', 'low');
  moveInstrumentation(img, picImg);
  addMobileSource(pic, img);
  return pic;
}

// reads Background Image or Video (Desktop), (Mobile) and Video Thumbnail (Desktop), (Mobile):
// the cells before the first text, matched by their Universal Editor prop, else by their place
function readMediaFields(cells) {
  const end = cells.findIndex((c) => !isMedia(c) && c.textContent.trim());
  const slots = end < 0 ? cells : cells.slice(0, end);
  const fields = {};
  const unnamed = slots.filter((c) => {
    const prop = propOf(c);
    if (!MEDIA_FIELDS.includes(prop) || fields[prop]) return true;
    fields[prop] = c;
    return false;
  });
  MEDIA_FIELDS.filter((name) => !fields[name]).forEach((name) => {
    fields[name] = unnamed.shift();
  });
  return {
    desktop: readMedia(fields.image),
    mobile: readMedia(fields.mobileImage),
    thumb: readMedia(fields.thumbnail)?.img || null,
    mobileThumb: readMedia(fields.mobileThumbnail)?.img || null,
  };
}

// what a screen shows until, or instead of, its video: its image, the Video Thumbnail, or
// the video's first frame
function posterOf(media, thumb) {
  if (!media) return null;
  if (media.img) return { img: media.img };
  return thumb ? { img: thumb } : { still: media.video, link: media.link };
}

// each screen's poster: desktop's with the desktop thumbnail; mobile's (its own field, else the
// desktop's) with the mobile thumbnail, else the desktop one
function screenPosters({
  desktop, mobile, thumb, mobileThumb,
}) {
  return { d: posterOf(desktop, thumb), m: posterOf(mobile || desktop, mobileThumb || thumb) };
}

// the poster images for desktop and mobile (the mobile one null when it's the same)
function posterImages(media) {
  const { d, m } = screenPosters(media);
  const desktop = d?.img || null;
  const mobile = m?.img || null;
  return { desktop, mobile: mobile === desktop ? null : mobile };
}

// the video each screen size plays: the mobile field's, else the desktop's (none on mobile
// when its field is an image)
function videoSources({ desktop, mobile }) {
  return { desktop: desktop?.video || '', mobile: (mobile || desktop)?.video || '' };
}

// a background's poster: one picture (the mobile image a source of it), else one element
// per screen size (only-desktop / only-mobile, hero.css) when either shows a video's frame
function createPoster(media, eager) {
  const { d, m } = screenPosters(media);
  const onMobile = window.matchMedia(MOBILE_MEDIA).matches;
  const pictureOf = (img, mobileImg, load) => {
    const pic = optimizedPicture(img.src, img.alt || '', load, [{ width: '2000' }]);
    pic.classList.add('bg-picture');
    const picImg = pic.querySelector('img');
    picImg.classList.add('bg-img');
    if (load) picImg.setAttribute('fetchpriority', 'high');
    moveInstrumentation(img, picImg);
    // phones get their own sizes (750/1200), of the mobile image or else the same one: never the
    // 2000px desktop file
    addMobileSource(pic, mobileImg || img);
    return pic;
  };
  const stillOf = ({ still, link }, shown = true) => {
    const el = createVideoStill(still, 'bg-img video-still', shown);
    if (link) moveInstrumentation(link, el);
    return el;
  };
  if (d?.img && m?.img) return [pictureOf(d.img, m.img, eager)];
  // the same video's first frame on both
  if (d?.still && d.still === m?.still) return [stillOf(d)];
  return [[d, 'only-desktop', !onMobile], [m, 'only-mobile', onMobile]]
    .filter(([poster]) => poster)
    .map(([poster, className, shown]) => {
      const el = poster.img ? pictureOf(poster.img, null, eager && shown) : stillOf(poster, shown);
      el.classList.add(className);
      return el;
    });
}

// removes Universal Editor's rich-text wrapper div, keeping its instrumentation
function unwrapRichtext(cell) {
  const group = cell?.querySelector(':scope > [data-aue-type="richtext"]');
  if (!group || cell.children.length !== 1 || cell.hasAttribute('data-aue-type')) return;
  moveInstrumentation(group, cell);
  group.replaceWith(...group.childNodes);
}

// cuts the title (a heading, or a group of heading lines) off after --hero-title-lines lines
// (hero.css), only when it runs longer, so a title that fits is never clipped
function capTitle(block, title, line) {
  const update = () => {
    const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
    const max = parseFloat(getComputedStyle(title).getPropertyValue('--hero-title-lines'));
    if (!lineHeight || !max) return;
    title.style.setProperty('--hero-title-lh', `${lineHeight}px`);
    title.classList.toggle('is-cut', Math.round(title.scrollHeight / lineHeight) > max);
  };
  // the screen size and the fonts loading change how far it wraps
  new ResizeObserver(update).observe(block);
  document.fonts?.ready.then(update);
}

// decorates a Text field (heading, text and buttons) as the hero's content
function decorateContent(block, textCell, { inlineLinks = false } = {}) {
  const editorial = block.classList.contains('editorial');
  const showcase = block.classList.contains('showcase');
  unwrapRichtext(textCell);
  textCell.classList.add('content');

  // links become CTA buttons (with inlineLinks, only a link alone in its paragraph)
  const alone = (a) => {
    const line = a.closest('p, li, h1, h2, h3, h4, h5, h6');
    return !line || !textCell.contains(line) || line.textContent.trim() === a.textContent.trim();
  };
  const ctas = [...textCell.querySelectorAll('a')].filter((a) => !inlineLinks || alone(a));

  if (ctas.length) {
    const [primary] = ctas;
    const headingWrap = primary.closest('h1, h2, h3, h4, h5, h6');
    if (headingWrap && textCell.contains(headingWrap)) {
      headingWrap.replaceWith(primary);
    }
    const ctaWrap = primary.closest('p') || primary;
    ctaWrap.classList.add('cta-wrapper');

    ctas.forEach((cta, i) => {
      // authored type sets the style; plain links: first primary, rest secondary
      const v2 = cta.classList.contains('primary-v2');
      let solid = i === 0;
      if (v2 || cta.classList.contains('primary')) solid = true;
      else if (cta.classList.contains('secondary')) solid = false;
      cta.classList.remove('primary', 'secondary', 'primary-v2');
      cta.classList.add('cta', 'button', solid ? 'cta-primary' : 'cta-secondary');
      if (v2) cta.classList.add('cta-v2');
      const label = document.createElement('span');
      label.className = 'cta-label';
      label.textContent = cta.textContent.trim();
      cta.textContent = '';
      cta.append(label);
      // data-layer id for the first CTA
      if (i === 0 && !cta.dataset.cta) cta.dataset.cta = DEFAULT_CTA.heroRegister;
      if (solid) {
        decorateGlitch(cta, label);
        const icon = document.createElement('span');
        icon.className = 'icon icon-plus cta-icon';
        cta.append(icon);
        decorateIcons(cta);
        icon.querySelector('img')?.classList.add('cta-icon-img');
      }
      if (cta.parentElement !== ctaWrap) ctaWrap.append(cta);
    });
  }

  // remove empty paragraphs
  [...textCell.querySelectorAll('p')]
    .filter((p) => !p.textContent.trim() && !p.querySelector('img, picture, a'))
    .forEach((p) => p.remove());

  // every h1 line is a heading
  [...textCell.querySelectorAll('h1')]
    .filter((h) => !ctas.some((a) => h.contains(a)))
    .forEach((h) => h.classList.add('heading'));

  // Statement: without an h1, the first heading is styled as one
  if (block.classList.contains('statement') && !textCell.querySelector('.heading')) {
    textCell.querySelector('h2, h3, h4, h5, h6')?.classList.add('heading');
  }

  // group consecutive heading lines
  const headingLines = [];
  for (let el = textCell.querySelector('.heading'); el?.classList.contains('heading'); el = el.nextElementSibling) {
    headingLines.push(el);
  }
  let title = headingLines[0];
  if (headingLines.length > 1) {
    const headingGroup = document.createElement('div');
    headingGroup.className = 'heading-group';
    headingLines[0].before(headingGroup);
    headingGroup.append(...headingLines);
    title = headingGroup;
  }
  // not Intro's title, which wraps around its tile
  if (title && !block.classList.contains('intro')) capTitle(block, title, headingLines[0]);

  [...textCell.querySelectorAll('p')].forEach((p) => {
    if (!ctas.some((a) => p.contains(a)) && p.textContent.trim()) p.classList.add('subtext');
  });

  // Editorial: group heading and subtext into .copy
  if (editorial) {
    const copyEls = [...textCell.children]
      .filter((el) => el.classList.contains('heading')
        || el.classList.contains('heading-group')
        || el.classList.contains('subtext'));
    if (copyEls.length) {
      const copy = document.createElement('div');
      copy.className = 'copy';
      copyEls[0].before(copy);
      copy.append(...copyEls);
    }
  }

  // Showcase: group subtext and CTA into .bottom
  if (showcase) {
    const bottomEls = [...textCell.children]
      .filter((el) => el.classList.contains('subtext') || el.classList.contains('cta-wrapper'));
    if (bottomEls.length) {
      const bottom = document.createElement('div');
      bottom.className = 'bottom';
      bottomEls[0].before(bottom);
      bottom.append(...bottomEls);
    }
  }
}

// carousel slide duration and maximum slide count
const SLIDE_MS = 6000;
const MAX_SLIDES = 3;

// carousel control icons
const SPEAKER = '<path d="M1.125 4.25a.5.5 0 0 1 .5-.5H4.5l3.375-2.625v9.75L4.5 8.25H1.625a.5.5 0 0 1-.5-.5z"/>';
const CONTROL_ICONS = {
  sound: `${SPEAKER}<path d="M9.5 4.5c.67.83.67 2.17 0 3M10.75 3.25c1.33 1.6 1.33 3.9 0 5.5" fill="none" stroke="currentColor" stroke-linecap="round"/>`,
  muted: `${SPEAKER}<path d="M9.5 5l2 2M11.5 5l-2 2" fill="none" stroke="currentColor" stroke-linecap="round"/>`,
  play: '<path d="M.5.93v10.14a.5.5 0 0 0 .74.44l9.2-5.07a.5.5 0 0 0 0-.88L1.24.49A.5.5 0 0 0 .5.93z"/>',
  pause: '<path d="M0 .5A.5.5 0 0 1 .5 0H4a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5H.5a.5.5 0 0 1-.5-.5zM6.5.5A.5.5 0 0 1 7 0h3.5a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5z"/>',
};

// builds a control icon
function controlIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', name === 'play' || name === 'pause' ? '0 0 11 12' : '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = CONTROL_ICONS[name];
  return svg;
}

// builds a toggle button whose icon and label follow its state
function createToggle(className, look, onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  let state = false;
  const set = (on) => {
    state = on;
    const { icon, label } = look(on);
    button.replaceChildren(controlIcon(icon));
    button.setAttribute('aria-label', label);
  };
  set(state);
  button.addEventListener('click', () => {
    state = !state;
    set(state);
    onToggle(state);
  });
  return { button, set };
}

// rotates the carousel slides; returns the video controls, or null.
// options (Tech Slides): webgl, slideMs, resume, navHold; reports hero:running
function wireCarousel(block, items, slides, thumbs, nav, fill, onShow, options = {}) {
  const {
    webgl: useWebgl = true, slideMs = SLIDE_MS, resume = false, navHold = true,
    // false: no autoplay, the slides change on a thumbnail pick only and their videos loop
    rotate = true,
  } = options;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = 0;
  let timer = 0;
  // the current slide's time left, and when its timer ends (0: not counting)
  let left = slideMs;
  let deadline = 0;
  let stopped = reduce;
  let held = false;
  let paused = false;
  let visible = false;
  let loaded = document.readyState === 'complete';

  // failed or refused videos fall back to the timer
  const videos = [];
  const failed = new Set();
  let refused = false;
  const playable = (i) => (failed.has(i) || refused ? null : videos[i]);

  // the visitor's sound choice per slide; heard only once the hero has settled on screen,
  // rising from silence (muted while it is scrolled to or from)
  const wanted = [];
  const heard = [];
  let settled = false;
  const applySound = () => videos.forEach((video, i) => {
    const audible = !!wanted[i] && settled && i === index;
    if (!video || audible === !!heard[i]) return;
    heard[i] = audible;
    setAudible(video, audible);
  });
  const prepare = (i) => {
    fill(i);
    const src = items[i].video;
    if (!src || videos[i] || navigator.connection?.saveData) return;
    // a slide without a thumbnail plays its first-frame poster (one download)
    const still = shownStill(slides[i], src);
    if (still) {
      videos[i] = still;
      if (!rotate) still.loop = true;
      return;
    }
    const video = createBgVideo();
    if (!rotate) video.loop = true;
    video.preload = 'metadata';
    addVideoSource(video, src);
    slides[i].append(video);
    // WebKit needs an explicit load for a late-added source
    video.load();
    videos[i] = video;
  };

  const stack = slides[0].parentElement;

  // WebGL transition, with CSS as the fallback
  let webgl = null;
  const loadWebgl = () => {
    if (reduce || !useWebgl) return;
    import('./slide-transition.js')
      .then(({ default: create }) => { webgl = create(stack); })
      .catch(() => {});
  };

  // shows a slide; `back` reverses the direction
  const show = (next, back = false) => {
    const to = (next + slides.length) % slides.length;
    if (to === index) return;
    paused = false;
    left = slideMs;
    deadline = 0;
    prepare(to);
    // preload the next slide
    prepare((to + 1) % slides.length);
    if (playable(to)) playable(to).currentTime = 0;
    // reset the next slide's position before it animates in
    slides[to].classList.remove('is-leaving');
    stack.classList.toggle('is-back', back);
    stack.classList.toggle('is-gl', !!webgl?.run(slides[index], slides[to], back));
    slides[to].getBoundingClientRect();
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-leaving', i === index);
      slide.classList.toggle('is-active', i === to);
      if (i === to) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    thumbs.forEach((thumb, i) => {
      if (i === to) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    onShow?.(to);
    index = to;
    applySound();
  };

  let sync;
  const awaitInput = () => {
    if (refused) return;
    refused = true;
    const retry = () => {
      if (!refused) return;
      refused = false;
      sync();
    };
    ['touchend', 'pointerdown', 'keydown'].forEach((type) => {
      window.addEventListener(type, retry, { once: true, capture: true, passive: true });
    });
  };

  let wasRunning = null;
  sync = () => {
    clearTimeout(timer);
    // keep what's left of the current slide's time
    if (deadline) left = Math.max(0, deadline - performance.now());
    deadline = 0;
    const advance = () => {
      show(index + 1);
      sync();
    };
    const running = !stopped && !paused && visible && loaded && !document.hidden;
    const counting = running && !held;
    if (counting !== wasRunning) {
      wasRunning = counting;
      block.dispatchEvent(new CustomEvent('hero:running', { detail: counting }));
    }
    const video = playable(index);
    // move on from a video that ended while held
    if (running && !held && video?.ended) {
      advance();
      return;
    }
    videos.forEach((v) => { if (v !== video) v?.pause(); });
    if (video && running && !video.ended) {
      const playing = index;
      video.play().catch((err) => {
        // AbortError is a pause interrupting play, not a failure
        if (err.name === 'AbortError') return;
        if (err.name === 'NotAllowedError') awaitInput();
        else failed.add(playing);
        if (playing === index) sync();
      });
    } else video?.pause();
    if (!running || held || video || !rotate) return;
    const ms = resume ? left : slideMs;
    deadline = performance.now() + ms;
    timer = setTimeout(advance, ms);
  };

  // media events don't bubble, so capture them
  const slideOf = (e) => videos.indexOf(e.target.closest?.('video'));
  stack.addEventListener('playing', (e) => {
    slides[slideOf(e)]?.classList.add('is-playing');
  }, true);
  stack.addEventListener('ended', (e) => {
    if (slideOf(e) === index) sync();
  }, true);
  stack.addEventListener('error', (e) => {
    const i = slideOf(e);
    if (i < 0) return;
    failed.add(i);
    slides[i].classList.remove('is-playing');
    if (i === index) sync();
  }, true);

  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => {
    // a step that wraps round the loop (swipe on from the last slide) says
    // which way it goes in data-direction; a plain pick compares positions
    const { direction } = thumb.dataset;
    delete thumb.dataset.direction;
    show(i, direction ? direction === 'back' : i < index);
    sync();
  }));

  // Universal Editor: build every slide, no rotation
  const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  if (authoring) {
    stopped = true;
    slides.forEach((slide, i) => fill(i));
    return null;
  }

  const hold = (on) => {
    held = on;
    sync();
  };
  if (navHold) {
    nav.addEventListener('pointerenter', () => hold(true));
    nav.addEventListener('pointerleave', () => hold(false));
    nav.addEventListener('focusin', () => hold(true));
    nav.addEventListener('focusout', (e) => {
      if (!nav.contains(e.relatedTarget)) hold(false);
    });
  }
  // another part of the hero (the opening animation, Tech Slides) can hold the rotation
  block.addEventListener('hero:hold', (e) => hold(!!e.detail));

  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(block);
  trackSettled(block, (value) => {
    settled = value;
    applySound();
  });

  // load videos and the next slide after page load
  const onLoad = () => {
    loaded = true;
    prepare(0);
    prepare(1);
    sync();
    loadWebgl();
  };
  if (loaded) onLoad();
  else window.addEventListener('load', onLoad, { once: true });

  // video controls are opt-in per slide
  if (reduce || !items.some((item) => item.controls && item.video)) return null;
  const controls = document.createElement('div');
  controls.className = 'slide-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Video controls');
  const sound = createToggle('slide-sound', (on) => (on
    ? { icon: 'sound', label: 'Mute video' }
    : { icon: 'muted', label: 'Unmute video' }), (on) => {
    wanted[index] = on;
    applySound();
  });
  const play = createToggle('slide-play', (on) => (on
    ? { icon: 'play', label: 'Play video' }
    : { icon: 'pause', label: 'Pause video' }), (on) => {
    paused = on;
    sync();
  });
  controls.append(sound.button, play.button);
  // show controls only for the current slide when its video can play
  const refresh = () => {
    controls.hidden = !(items[index].controls && playable(index));
    sound.set(!!wanted[index]);
    play.set(paused);
  };
  refresh();
  ['loadstart', 'playing', 'error'].forEach((type) => stack.addEventListener(type, refresh, true));
  new MutationObserver(refresh).observe(stack, { attributes: true, subtree: true, attributeFilter: ['aria-hidden'] });
  return controls;
}

// a Tech Slides Tile Position field's value ("33, 61")
const POSITION_RE = /^\s*\d{1,3}(\.\d+)?\s*,\s*\d{1,3}(\.\d+)?\s*$/;

// a Hero Slide's own Text cell, or null when it's left empty
function slideText(row) {
  // the first cell is the image or video
  const cells = [...row.children].slice(1);
  const cell = cells.find((c) => c.dataset.aueProp === 'text'
    || c.querySelector(':scope > [data-aue-prop="text"]'))
    // published: the cell with text that isn't the video, the video controls toggle or a
    // Tile Position
    || cells.find((c) => {
      const text = c.textContent.trim();
      return !videoHref(c) && !/^(true|false)?$/.test(text) && !POSITION_RE.test(text);
    });
  if (!cell?.textContent.trim() && !cell?.querySelector('a, img')) return null;
  return cell;
}

// each slide's content: its own Text, else the hero's (null without either); shows the
// first slide's and returns the wrapper holding them and where the current one is (for the
// video controls), or null if no slide has its own
function buildSlideContents(block, items, globalText, nav = null) {
  if (!items.some((item) => item.text)) return null;
  const contents = items.map((item) => {
    if (!item.text) return globalText;
    decorateContent(block, item.text);
    return item.text;
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'slide-contents';
  // the hero's own content stays in the DOM (hidden) even if every slide has its own
  const all = [...new Set([...contents, globalText].filter(Boolean))];
  wrapper.append(...all);
  let current = 0;
  // Thumbnails at the Bottom, on phones: the thumbnails join the video controls' line, inside
  // the current slide's content; otherwise they stay in the hero
  const narrow = window.matchMedia('(width < 900px)');
  const placeThumbs = () => {
    if (!nav || !block.classList.contains('thumbs-bottom')) return;
    if (narrow.matches) (contents[current] || wrapper).append(nav);
    else block.append(nav);
  };
  narrow.addEventListener('change', placeThumbs);
  const show = (i) => {
    current = i;
    // mobile: the controls go above this slide's content (own row if it has none)
    const controls = wrapper.querySelector('.slide-controls');
    if (controls) (contents[i] || wrapper).prepend(controls);
    placeThumbs();
    all.forEach((content) => {
      const on = content === contents[i];
      content.classList.toggle('is-active', on);
      content.inert = !on;
      if (on) content.removeAttribute('aria-hidden');
      else content.setAttribute('aria-hidden', 'true');
    });
  };
  show(0);
  return {
    wrapper, show, placeThumbs, active: () => contents[current] || wrapper,
  };
}

// UE: puts each slide's Text in its slide, so the content tree nests it there
function nestSlideTexts(block, items, holders) {
  items.forEach((item, i) => {
    if (!item.text) return;
    decorateContent(block, item.text);
    holders[i].append(item.text);
  });
}

// Combat theme: the narrative's carousel, right after the statement (default content)
function isCombatNarrative(block) {
  return document.body.classList.contains('combat')
    && block.classList.contains('carousel') && !block.classList.contains('opening')
    && !!block.parentElement?.previousElementSibling?.classList.contains('default-content-wrapper');
}

// builds the carousel slides and thumbnails from the Hero Slide rows
function buildCarousel(block, bg, rows, firstScreen, globalText) {
  // Universal Editor keeps empty slides so authors can select them
  const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  const onMobile = window.matchMedia(MOBILE_MEDIA).matches;
  const items = [];
  rows.forEach((row) => {
    const media = readMediaFields([...row.children]);
    const sources = videoSources(media);
    // the video controls toggle is a cell reading "true"
    const controls = [...row.children].some((cell) => cell.textContent.trim() === 'true');
    if ((media.desktop || media.mobile || authoring) && items.length < MAX_SLIDES) {
      items.push({
        media,
        sources,
        // the video for the screen size the page opens on
        video: onMobile ? sources.mobile : sources.desktop,
        controls,
        text: slideText(row),
        resource: row.dataset.aueResource,
        row,
      });
    }
  });
  if (!items.length) return null;

  // Showroom layout: the hero's own Text stays beside every slide (hero-showroom.js), so it
  // isn't one of the slide contents that take turns
  const shared = block.classList.contains('showroom');
  const slideFallback = shared ? null : globalText;

  // UE: hides the hero's content on slides with their own Text
  const cover = (i) => !shared && globalText?.classList.toggle('is-covered', !!items[i].text);

  // a slide's image, or its video's thumbnail (else its first frame)
  const poster = (i) => createPoster(items[i].media, !i && firstScreen);

  // a single slide is a still background
  if (items.length === 1) {
    bg.replaceChildren(...poster(0));
    if (items[0].row) moveInstrumentation(items[0].row, bg);
    if (authoring) {
      nestSlideTexts(block, items, [bg]);
      cover(0);
      return { sources: items[0].sources };
    }
    const contents = buildSlideContents(block, items, slideFallback);
    return { sources: items[0].sources, contents: contents?.wrapper, active: contents?.active };
  }

  const slides = items.map((item, i) => {
    const slide = document.createElement('div');
    slide.className = i === 0 ? 'slide is-active' : 'slide';
    if (i) slide.setAttribute('aria-hidden', 'true');
    if (item.row) moveInstrumentation(item.row, slide);
    return slide;
  });
  bg.classList.add('slides');
  // the slides are absolute and clipped, which section-snap reads as a floating layer
  // and would swallow the scroll over them
  bg.dataset.snapPassthrough = '';
  bg.replaceChildren(...slides);

  const fill = (i) => {
    if (!slides[i].firstChild) slides[i].append(...poster(i));
  };
  fill(0);

  const nav = document.createElement('div');
  nav.className = 'slide-nav';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Background slides');
  const thumbs = items.map(({ media, video }, i) => {
    // the slide's image or Video Thumbnail, else (a video) its first frame
    const { desktop, mobile } = posterImages(media);
    const img = desktop || mobile;
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'slide-thumb';
    thumb.setAttribute('aria-label', `Show slide ${i + 1} of ${items.length}`);
    if (!i) thumb.setAttribute('aria-current', 'true');
    // a video without a thumbnail: its first frame, loaded after the page
    const still = media.desktop?.video || media.mobile?.video;
    if (!img && still && !navigator.connection?.saveData) {
      const add = () => thumb.append(createVideoStill(video || still, 'slide-thumb-video'));
      if (document.readyState === 'complete') add();
      else window.addEventListener('load', add, { once: true });
    }
    if (!img) return thumb;
    const pic = optimizedPicture(img.src, '', false, [{ width: '160' }]);
    pic.classList.add('slide-thumb-picture');
    pic.querySelector('img').classList.add('slide-thumb-img');
    thumb.append(pic);
    return thumb;
  });
  nav.append(...thumbs);

  const contents = authoring ? null : buildSlideContents(block, items, slideFallback, nav);
  const onShow = authoring ? cover : contents?.show;
  // Combat theme: the narrative's clips change on a pick only, as on the prototype. Showroom
  // layout: no autoplay either (a thumbnail pick or a phone swipe changes the slide,
  // hero-showroom.js), and its
  // own photo wipe in place of the WebGL one
  const controls = wireCarousel(block, items, slides, thumbs, nav, fill, onShow, {
    rotate: !isCombatNarrative(block) && !shared,
    webgl: !shared,
  });
  // after wireCarousel has filled the slides
  if (authoring) {
    nestSlideTexts(block, items, slides);
    cover(0);
  }
  return {
    nav,
    controls,
    contents: contents?.wrapper,
    active: contents?.active,
    placeThumbs: contents?.placeThumbs,
  };
}

// places the controls above the heading on mobile, top right on desktop; `host` is the
// content they go in, or a function giving the current slide's
function placeControls(block, host, controls) {
  const desktop = window.matchMedia('(width >= 900px)');
  const place = () => {
    const content = typeof host === 'function' ? host() : host;
    if (desktop.matches || !content) block.append(controls);
    else content.prepend(controls);
  };
  place();
  desktop.addEventListener('change', place);
}

// keeps unused Hero Slides hidden in the DOM so Universal Editor can still select them
function keepUnusedSlides(rows) {
  const unused = rows.filter((row) => row.hasAttribute('data-aue-resource'));
  if (!unused.length) return [];
  const holder = document.createElement('div');
  holder.className = 'unused-slides';
  holder.hidden = true;
  holder.append(...unused);
  return [holder];
}

// sets the editorial animation's CSS variables for progress p (0..1)
function render(block, p) {
  // background swaps to the mountain layer, marble fades in
  block.style.setProperty('--bg-op', `${1 - range(p, 0.04, 0.14)}`);
  block.style.setProperty('--mtn-in', `${range(p, 0.04, 0.14)}`);
  block.style.setProperty('--fold2-op', `${range(p, 0.06, 0.18)}`);

  // content fades out as the card shrinks
  block.style.setProperty('--content-op', `${1 - range(p, 0.06, 0.45)}`);

  // image shrinks to a centred card
  block.style.setProperty('--cardness', `${range(p, 0.12, 0.45)}`);

  // card holds, then rises and fades out
  block.style.setProperty('--exit', `${range(p, 0.62, 0.78)}`);

  // manifesto fades in blurred, then its lines sharpen one by one
  const easeOut = (t) => 1 - (1 - t) ** 3;
  block.style.setProperty('--manifesto-in', `${easeOut(range(p, 0.62, 0.78))}`);
  block.style.setProperty('--manifesto-p', `${range(p, 0.8, 0.98)}`);
  block.style.setProperty('--p', `${p}`);
}

// editorial step timings
const INTRO_MS = 2400;
const BLUR_HOLD_MS = 500;
const LINE_MS = 600;
const REBLUR_MS = 600;
const REBLUR_HOLD_MS = 300;
const BACK_MS = 1600;
// a scroll during the manifesto's reveal plays the rest of it in this long
const HURRY_MS = 600;
// progress at the blurred and sharp manifesto
const MANIFESTO_P = 0.8;
const SHARP_P = 0.98;
// progress at which the manifesto is 90% faded in
const SHOWN_P = 0.62 + 0.16 * (1 - 0.1 ** (1 / 3));
// wheel pause that starts a new gesture
const GESTURE_GAP_MS = 200;
// after the reveal was hurried, a scroll moves the page on only once this long
// has passed (the hurried reveal plays out, plus a little): the rest of the
// same wheel flick would otherwise page on as soon as it ends
const HURRY_SETTLE_MS = 1200;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const SHOWN_MS = (() => {
  let ms = 0;
  while (ms < INTRO_MS && MANIFESTO_P * easeInOut(ms / INTRO_MS) < SHOWN_P) ms += 10;
  return ms;
})();

// two-step scroll controller for section-snap, one step per gesture
function createStepper(block, lines) {
  let step = 0;
  let p = 0;
  let frame = 0;
  let pause = 0;
  // a gesture plays at most one step
  let consumed = false;
  let hurried = false; // the reveal under way was sped up (hurryDown)
  let lastWheel = -Infinity;
  let lastMag = 0;
  // after a hurried reveal, the gesture that hurried it is used up for
  // HURRY_SETTLE_MS; after that, the next scroll the snap engine takes as a
  // gesture moves the page on (it already ignores trackpad momentum)
  let settling = false;
  let settleUntil = 0;
  const animating = () => frame !== 0 || pause !== 0;

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

  // animates p to `to` over `duration`, then runs `done`
  const animate = (to, duration, ease, done) => {
    const from = p;
    cancelAnimationFrame(frame);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      p = from + (to - from) * ease(t);
      render(block, p);
      frame = t < 1 ? requestAnimationFrame(tick) : 0;
      if (!frame) done?.();
    };
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(pause);
    pause = 0;
  };

  const playDown = () => {
    stop();
    step = 1;
    consumed = true;
    hurried = false;
    animate(MANIFESTO_P, INTRO_MS, easeInOut);
    pause = setTimeout(() => {
      pause = 0;
      animate(SHARP_P, Math.max(1, lines) * LINE_MS, (t) => t);
    }, SHOWN_MS + BLUR_HOLD_MS);
  };

  // re-blur the lines, then play back to the first screen
  const playUp = () => {
    stop();
    step = 0;
    consumed = true;
    const back = () => animate(0, BACK_MS, easeInOut);
    if (p <= MANIFESTO_P) {
      back();
      return;
    }
    animate(MANIFESTO_P, REBLUR_MS, easeInOut, () => {
      pause = setTimeout(() => {
        pause = 0;
        back();
      }, REBLUR_HOLD_MS);
    });
  };

  return {
    canScrollDown: () => step < 1,
    canScrollUp: () => step > 0,
    scrollDown: playDown,
    scrollUp: playUp,
    isBusy: () => {
      if (settling && !animating() && performance.now() >= settleUntil) {
        settling = false;
        consumed = false;
      }
      return settling || animating() || consumed;
    },
    // a new scroll down during the manifesto's reveal (once it is on screen,
    // while its lines sharpen) plays the rest of it quickly; the page stays,
    // and the next scroll moves it on. Before that, the image shrinking to the
    // card plays out
    hurryDown: () => {
      if (consumed || hurried || step !== 1 || (!frame && !pause) || p < SHOWN_P) return;
      stop();
      hurried = true;
      consumed = true;
      settling = true;
      settleUntil = performance.now() + HURRY_SETTLE_MS;
      animate(SHARP_P, HURRY_MS, easeInOut);
    },
  };
}

// fallback without the snap engine: the animation follows the scroll position
function wireScrub(block) {
  block.classList.remove('is-stepped');
  block.closest('.section')?.classList.add('no-snap', 'scroll-runway');

  let ticking = false;
  const update = () => {
    ticking = false;
    const total = block.offsetHeight - window.innerHeight;
    const scrolled = Math.min(Math.max(-block.getBoundingClientRect().top, 0), total);
    render(block, total > 0 ? scrolled / total : 0);
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

// wires the editorial two-fold scroll animation
function wireScrollFolds(block) {
  // static under reduced motion and in Universal Editor
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  if (authoring) {
    block.classList.add('is-static', 'is-authoring', 'is-marble-ready');
    return;
  }

  // load the marble backdrop after page load or the first scroll
  const showMarble = () => block.classList.add('is-marble-ready');
  if (document.readyState === 'complete') showMarble();
  else window.addEventListener('load', showMarble, { once: true });
  window.addEventListener('scroll', showMarble, { once: true, passive: true });

  if (reduce) {
    block.classList.add('is-static');
    return;
  }
  block.classList.add('is-animated', 'is-stepped');
  render(block, 0);

  // use the snap engine if it starts, otherwise fall back to scrubbing
  const section = block.closest('.section');
  // the stepper needs the section to snap
  section?.classList.remove('no-snap');
  const lines = block.querySelectorAll('.manifesto-line').length;
  const snap = import('../../scripts/section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, createStepper(block, lines));
    return mod;
  });
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (!root.classList.contains('snap-active')) {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
      wireScrub(block);
    }
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}

/* ---------- Combat motion: the hero's load intro and the narrative statement's lines ---------- */

// Combat theme: splits a plain-text element into the lines it renders on (span.text-line, each
// holding a span.text-line-inner) for a line-by-line reveal, the line breaks frozen. Returns the
// lines and a function putting the original text back, or null when it can't: inline markup,
// or not laid out yet
function splitLines(el) {
  if (!el?.getClientRects().length) return null;
  if ([...el.childNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)) return null;
  const words = el.textContent.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const original = [...el.childNodes];
  const spans = words.map((word) => {
    const span = document.createElement('span');
    span.textContent = word;
    return span;
  });
  el.replaceChildren(...spans.flatMap((span, i) => (i ? [' ', span] : [span])));
  const lines = [];
  let top = null;
  spans.forEach((span) => {
    const y = span.getBoundingClientRect().top;
    if (top === null || Math.abs(y - top) > 2) {
      lines.push([]);
      top = y;
    }
    lines[lines.length - 1].push(span.textContent);
  });
  const lineEls = lines.map((line) => {
    const outer = document.createElement('span');
    outer.className = 'text-line';
    const inner = document.createElement('span');
    inner.className = 'text-line-inner';
    inner.textContent = line.join(' ');
    // the space keeps the words apart in the text read out
    outer.append(inner, ' ');
    return outer;
  });
  el.replaceChildren(...lineEls);
  return { lines: lineEls, restore: () => el.replaceChildren(...original) };
}

// Combat theme: the hero intro's length (hero.css .combat-intro), and how long it waits for the
// photo before it starts anyway
const COMBAT_INTRO_MS = 2700;
const COMBAT_INTRO_WAIT_MS = 800;

// Combat theme, the first section's Showcase: the load intro (hero.css .combat-intro). The hero
// opens from a card to full screen as its photo settles, then the lockup and title lines rise,
// then the CTA, price and description card. The photo is painted from the first frame (clipped
// and scaled, never transparent). Not under reduced motion, in Universal Editor, or when the
// page opens scrolled or deep-linked away from the hero; any scroll or snap move ends it.
// backdropImg: the Background Image's, if any
function playCombatIntro(block, backdropImg) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (block.closest('[data-aue-resource]') || document.querySelector('[data-aue-resource]')) return;
  const section = block.closest('.section');
  let id = window.location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // a malformed hash: looked up as it is
  }
  const target = id ? document.getElementById(id) : null;
  if (window.scrollY > 1 || (id && !section?.contains(target))) return;

  const heading = block.querySelector('.content > .heading');
  let restore = null;
  let started = false;
  let done = false;
  let onScroll;
  const finish = () => {
    if (done) return;
    done = true;
    block.classList.remove('combat-intro', 'is-intro-playing');
    restore?.();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('snap:start', finish);
  };
  onScroll = () => { if (window.scrollY > 1) finish(); };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('snap:start', finish);

  // the title's lines are read once it is laid out (the section shows after its blocks load)
  let frames = 0;
  const start = () => {
    if (started || done) return;
    if (!block.getClientRects().length && frames < 30) {
      frames += 1;
      requestAnimationFrame(start);
      return;
    }
    started = true;
    const split = splitLines(heading);
    if (split) {
      restore = split.restore;
      split.lines.forEach((line, i) => line.style.setProperty('--i', i));
    }
    block.classList.add('is-intro-playing');
    setTimeout(finish, COMBAT_INTRO_MS);
  };
  block.classList.add('combat-intro');
  // starts once the photo is in, then the Background Image (added after it) has painted too, as
  // on the prototype, or after COMBAT_INTRO_WAIT_MS. The backdrop paints in the first frame's
  // card, no larger than the photo did, so the photo stays the LCP
  const img = block.querySelector(':scope > .bg img.bg-img');
  onImageIn(img, () => onImageIn(backdropImg, () => {
    requestAnimationFrame(() => requestAnimationFrame(start));
  }));
  setTimeout(start, COMBAT_INTRO_WAIT_MS);
}

// Combat theme: the statement's lines after the first are dimmed and blurred while it comes in
// from above, then sharpen in turn once it arrives (hero.css .is-dim/.is-sharpening); split for
// the reveal only, then put back. Combat motion's events only fire when it runs
const STATEMENT_SHARPEN_MS = 300;
const STATEMENT_STAGGER_MS = 120;
function wireStatementReveal(section, statement) {
  if (!statement) return;
  let restore = null;
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    statement.classList.remove('is-dim', 'is-sharpening');
    restore?.();
    restore = null;
  };
  document.addEventListener('combat:move', ({ detail }) => {
    reset();
    if (detail?.to !== section || detail.direction !== 'down') return;
    const split = splitLines(statement);
    if (!split) return;
    restore = split.restore;
    split.lines.slice(1).forEach((line, i) => line.style.setProperty('--i', i));
    statement.classList.add('is-dim');
  });
  document.addEventListener('combat:arrive', ({ detail }) => {
    if (detail?.section !== section || !restore) return;
    const lines = statement.querySelectorAll('.text-line').length;
    statement.classList.add('is-sharpening');
    timer = setTimeout(reset, (lines - 1) * STATEMENT_STAGGER_MS + STATEMENT_SHARPEN_MS + 100);
  });
}

// Combat theme: how long the narrative's clip takes to open (hero.css --hero-narrative-ms)
const NARRATIVE_MS = 900;

// Combat theme, a carousel right after default content (the narrative statement): the
// statement shows first with the clip in a card below it, the next scroll opens the clip to
// full screen (hero.css .is-narrative/.is-open). Needs the snap engine; without it the two
// share the screen instead (hero.css)
function wireCombatNarrative(block) {
  const section = block.closest('.section');
  const wrapper = block.parentElement;
  if (!section || !wrapper?.previousElementSibling?.classList.contains('default-content-wrapper')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (block.closest('[data-aue-resource]') || document.querySelector('[data-aue-resource]')) return;

  let open = false;
  let busyUntil = 0;
  const setOpen = (value, instant = false) => {
    open = value;
    block.classList.toggle('is-instant', instant);
    block.classList.toggle('is-open', value);
    busyUntil = instant ? 0 : performance.now() + NARRATIVE_MS;
  };
  // entering from the fold below: already open; from above: the statement first
  const onStart = ({ detail }) => {
    if (detail?.to !== section) return;
    setOpen(!!detail.from && detail.from.offsetTop > section.offsetTop, true);
  };

  block.classList.add('is-narrative');
  wireStatementReveal(section, wrapper.previousElementSibling.querySelector('h1, h2, h3, h4, h5, h6, p'));
  document.addEventListener('snap:start', onStart);
  const snap = import('../../scripts/section-snap.js').then((mod) => {
    mod.registerBlockScroll(section, {
      canScrollDown: () => !open,
      canScrollUp: () => open,
      scrollDown: () => setOpen(true),
      scrollUp: () => setOpen(false),
      isBusy: () => performance.now() < busyUntil,
      destroy: () => {
        document.removeEventListener('snap:start', onStart);
        block.classList.remove('is-narrative', 'is-open', 'is-instant');
      },
    });
    return mod;
  });
  // no snap engine after all: unregister, so the statement and clip share the screen
  const root = document.documentElement;
  const settle = () => {
    if (!root.classList.contains('snap-settled')) return false;
    if (!root.classList.contains('snap-active')) {
      snap.then((mod) => mod.unregisterBlockScroll(section)).catch(() => {});
    }
    return true;
  };
  if (!settle()) {
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
}

/**
 * Product: moves the Logo field into the Text, before the title. It is found by field name in
 * Universal Editor, else by row: after Text, Scroll Manifesto and Background Image comes Logo
 * (_hero.json field order).
 * @param {Element[]} ownCells all the hero's own field cells, in order (Background Image too)
 * @param {Element} textCell the Text cell
 */
function placeProductImages(ownCells, textCell) {
  let logo = ownCells.find((c) => propOf(c) === 'logo');
  if (!logo) {
    const at = ownCells.indexOf(textCell);
    if (at >= 0) logo = ownCells[at + 3];
  }
  // the field's image; a reference to an image outside AEM Assets (e.g. https://…/logo.png) is
  // delivered as a link to it, so the link becomes the image
  const imageOf = (cell) => {
    const pic = cell?.querySelector('picture') || cell?.querySelector('img');
    if (pic) return pic;
    const link = [...(cell?.querySelectorAll('a[href]') || [])]
      .find((a) => /\.(png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(a.getAttribute('href')));
    if (!link) return null;
    const img = document.createElement('img');
    img.src = link.href;
    const text = link.title || link.textContent.trim();
    img.alt = text && text !== link.getAttribute('href') && text !== link.href ? text : '';
    moveInstrumentation(link, img);
    return img;
  };
  const pictureLine = (cell) => {
    const pic = imageOf(cell);
    if (!pic) return null;
    // the logo sits on the first screen: never lazy (the delivery marks every image but the
    // page's first as lazy)
    const img = pic.matches('img') ? pic : pic.querySelector('img');
    if (img) img.loading = 'eager';
    const line = document.createElement('p');
    line.append(pic);
    return line;
  };
  const title = textCell.querySelector('h1, h2, h3, h4, h5, h6');
  const logoLine = pictureLine(logo);
  if (logoLine) textCell.insertBefore(logoLine, title || textCell.firstChild);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // Hero Slide rows, set aside from the hero's own fields
  const slideRows = [...block.children]
    .filter((row) => row.children.length > 1 || row.dataset.aueModel === 'hero-slide');
  // Universal Editor: block adding slides past MAX_SLIDES
  if (block.dataset.aueFilter) {
    block.dataset.aueFilter = slideRows.length >= MAX_SLIDES ? 'hero-full' : 'hero';
  }
  const ownCells = [...block.querySelectorAll(':scope > div > div')]
    .filter((c) => !slideRows.includes(c.parentElement));
  // the Background Image, set aside from the other fields
  const backdropCell = readBackdropField(ownCells);
  const allCells = ownCells.filter((c) => c !== backdropCell);
  // Product: its Text holds the film's MP4 link, so a cell with a heading is never media
  const product = block.classList.contains('product');
  const isProductText = (c) => product && !!c.querySelector('h1, h2, h3, h4, h5, h6');
  // the image and video fields; set aside so a video's link isn't read as a CTA
  const media = readMediaFields(allCells.filter((c) => !isProductText(c)));
  const sources = videoSources(media);
  const cells = allCells.filter((c) => !isMedia(c) || isProductText(c));

  const textCell = cells.find((c) => c.querySelector('a, h1, h2, h3, h4, h5, h6'))
    || cells.find((c) => c.textContent.trim());

  // manifesto: a text cell with no heading or links
  const manifestoCell = cells.find((c) => c !== textCell
    && c.textContent.trim()
    && !c.querySelector('a, h1, h2, h3, h4, h5, h6'));
  unwrapRichtext(textCell);
  unwrapRichtext(manifestoCell);

  const bg = document.createElement('div');
  bg.className = 'bg';
  // load eagerly only in the first section
  const firstScreen = !block.closest('.section')?.previousElementSibling;
  // Tech Slides: Hero Slides on the carousel's rotation, with its own layout (hero-tech-slides.js)
  const techSlides = block.classList.contains('tech-slides');
  // a carousel with slides doesn't use the hero's own image
  const carouselSlides = (block.classList.contains('carousel') || techSlides)
    && slideRows.some((row) => row.dataset.aueModel
    || row.querySelector('img') || [...row.children].some(videoHref));
  // Dealer: its Video Thumbnail is the product card's image (hero-dealer.js), never a poster
  const dealer = block.classList.contains('dealer');
  const posterMedia = dealer ? { ...media, thumb: null, mobileThumb: null } : media;
  // the image, or the video's thumbnail (else its first frame) until it plays
  const posters = posterImages(posterMedia);
  if (!carouselSlides) bg.append(...createPoster(posterMedia, firstScreen));
  // the Background Image, behind it; in the first section added once the image is in, so the
  // image paints first and stays the LCP, the backdrop painting no larger after it
  const backdrop = carouselSlides ? null : createBackdrop(backdropCell);
  if (backdrop) {
    onImageIn(firstScreen ? bg.querySelector('img.bg-img') : null, () => bg.prepend(backdrop));
  }

  const editorial = block.classList.contains('editorial');
  const showcase = block.classList.contains('showcase');
  const teaser = block.classList.contains('teaser');
  const carousel = block.classList.contains('carousel');
  const intro = block.classList.contains('intro');

  // Product decorates its own Text (hero-product.js), around the film card
  if (textCell && !product) decorateContent(block, textCell);

  const fold1Children = [bg];
  if (textCell) fold1Children.push(textCell);
  // scroll indicator (none on Teaser, Statement and Dealer, whose card takes its corner)
  const pill = editorial || showcase || carousel || intro || product;
  const statement = block.classList.contains('statement');
  const noIndicator = teaser || statement || techSlides || dealer;
  const scrollIndicator = noIndicator ? null : createScrollIndicator(block, {
    variant: pill ? 'pill' : 'cue',
  });
  if (scrollIndicator && !pill) {
    if (textCell) textCell.append(scrollIndicator);
    else fold1Children.push(scrollIndicator);
  } else if (scrollIndicator) {
    fold1Children.push(scrollIndicator);
  }

  // Statement: load its CSS
  if (block.classList.contains('statement')) {
    await loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-statement.css`);
  }

  // Statement with Hero Slides: the clips grow from a thumbnail slot (hero-statement.js);
  // a Statement without slides stays a still, centred statement
  const editing = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
  if (statement && slideRows.length && (editing || slideRows.some((row) => row.querySelector('img')
    || [...row.children].some(videoHref)))) {
    const { default: decorateStatement } = await import('./hero-statement.js');
    decorateStatement(block, {
      textCell,
      slideRows,
      helpers: {
        mobileMedia: MOBILE_MEDIA,
        readMediaFields,
        videoSources,
        slideText,
        unwrapRichtext,
        moveInstrumentation,
        optimizedPicture,
        authoring: editing,
      },
    });
    return;
  }

  // Intro: load its CSS and JS
  if (intro) {
    const [, { default: decorateIntro }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-intro.css`),
      import('./hero-intro.js'),
    ]);
    decorateIntro(block, {
      bg,
      textCell,
      manifestoCell,
      scrollIndicator,
      // the video for the screen size the page opens on
      videoSrc: window.matchMedia(MOBILE_MEDIA).matches ? sources.mobile : sources.desktop,
      createVideo: () => createBgVideo(),
      addSource: addVideoSource,
      rest: keepUnusedSlides(slideRows),
    });
    return;
  }

  // Tech Slides: load its CSS and JS
  if (techSlides) {
    const [, { default: decorateTechSlides }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-tech-slides.css`),
      import('./hero-tech-slides.js'),
    ]);
    decorateTechSlides(block, {
      bg,
      textCell,
      slideRows,
      firstScreen,
      helpers: {
        maxSlides: MAX_SLIDES,
        mobileMedia: MOBILE_MEDIA,
        readMediaFields,
        videoSources,
        createPoster,
        slideText,
        decorateContent,
        wireCarousel,
        keepUnusedSlides,
        moveInstrumentation,
        createOptimizedPicture: optimizedPicture,
      },
    });
    return;
  }

  // Product: load its CSS and JS
  if (product) {
    // its Logo field goes into the Text, before the title, where hero-product.js lays it out
    // (images can't be authored inside a Universal Editor text)
    if (textCell) placeProductImages(ownCells, textCell);
    const [, { default: decorateProduct }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-product.css`),
      import('./hero-product.js'),
    ]);
    decorateProduct(block, {
      bg,
      textCell,
      firstScreen,
      thumb: media.thumb,
      scrollIndicator,
      rest: keepUnusedSlides(slideRows),
      helpers: {
        decorateContent,
        unwrapRichtext,
        moveInstrumentation,
        optimizedPicture,
      },
    });
    wireVideo(block, bg, sources);
    return;
  }

  // Dealer: load its CSS and JS (the Text is already decorated as the Default hero's)
  if (dealer) {
    const [, { default: decorateDealer }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-dealer.css`),
      import('./hero-dealer.js'),
    ]);
    decorateDealer(block, {
      bg,
      textCell,
      thumb: media.thumb,
      rest: keepUnusedSlides(slideRows),
      helpers: { moveInstrumentation, optimizedPicture },
    });
    wireVideo(block, bg, sources);
    return;
  }

  // Editorial with a manifesto: two-fold scroll animation
  if (editorial && manifestoCell) {
    const pin = document.createElement('div');
    pin.className = 'pin';

    const fold1 = document.createElement('div');
    fold1.className = 'fold-1';
    fold1.append(...fold1Children);

    const fold2 = document.createElement('div');
    fold2.className = 'fold-2';

    const manifesto = document.createElement('div');
    manifesto.className = 'manifesto';
    moveInstrumentation(manifestoCell, manifesto);
    const lines = [...manifestoCell.querySelectorAll('p')].filter((p) => p.textContent.trim());
    const manifestoLines = lines.length ? lines : [manifestoCell];
    manifestoLines.forEach((line, i) => {
      line.classList.add('manifesto-line');
      line.style.setProperty('--i', i);
      manifesto.append(line);
    });
    manifesto.style.setProperty('--lines', manifestoLines.length);

    // one mountain layer animates from full screen to card to gone
    // (the poster image: a video plays in the background until the card takes over)
    let mountain = null;
    const mountainImg = posters.desktop || posters.mobile;
    if (mountainImg) {
      mountain = document.createElement('div');
      mountain.className = 'mountain';
      mountain.setAttribute('aria-hidden', 'true');
      const mPic = optimizedPicture(mountainImg.src, '', false, [{ width: '2000' }]);
      addMobileSource(mPic, posters.mobile || mountainImg);
      mPic.classList.add('mountain-picture');
      mPic.querySelector('img').classList.add('mountain-img');
      mountain.append(mPic);
    }

    pin.append(fold1, fold2);
    if (mountain) pin.append(mountain);
    pin.append(manifesto);
    block.replaceChildren(pin, ...keepUnusedSlides(slideRows));

    wireVideo(block, bg, sources);
    wireScrollFolds(block);
    return;
  }

  let carouselControls = null;
  let placeThumbs = null;
  // every style but the carousel (its slides play their own) loops its video
  if (!carousel) wireVideo(block, bg, sources);
  let controlsHost = textCell;
  const opening = carousel && block.classList.contains('opening');
  // Opening Animation: the Hero Text's first two paragraphs are its lines
  const lines = opening && textCell ? [...textCell.querySelectorAll(':scope > p.subtext')].slice(0, 2) : [];
  lines.forEach((p) => p.classList.add('opening-line'));
  if (carousel) {
    const carouselParts = buildCarousel(block, bg, slideRows, firstScreen, textCell);
    // slides with their own Text: their contents take the hero's content's place (Showroom
    // layout: they go after it, the hero's content stays)
    if (carouselParts?.contents) {
      const at = fold1Children.indexOf(textCell);
      const keep = block.classList.contains('showroom') ? 1 : 0;
      if (at >= 0) fold1Children.splice(at + keep, 1 - keep, carouselParts.contents);
      else fold1Children.splice(1, 0, carouselParts.contents);
      controlsHost = carouselParts.active;
    }
    // UE: the hero's content first, so the content tree lists it before the slides
    const authoring = !!block.closest('[data-aue-resource]') || !!document.querySelector('[data-aue-resource]');
    const textAt = fold1Children.indexOf(textCell);
    if (authoring && textAt > 0) fold1Children.unshift(...fold1Children.splice(textAt, 1));
    if (carouselParts?.nav) {
      fold1Children.push(carouselParts.nav);
      carouselControls = carouselParts.controls || null;
      placeThumbs = carouselParts.placeThumbs || null;
    } else {
      // single slide: loop its video like a still hero
      wireVideo(block, bg, carouselParts ? carouselParts.sources : sources);
    }
  }
  block.replaceChildren(...fold1Children, ...keepUnusedSlides(slideRows));
  if (carouselControls) placeControls(block, controlsHost, carouselControls);
  placeThumbs?.();
  if (carousel && !opening && document.body.classList.contains('combat')) wireCombatNarrative(block);
  // Combat theme: the first section's Showcase plays the load intro
  if (showcase && firstScreen && document.body.classList.contains('combat')) {
    playCombatIntro(block, backdrop?.querySelector('img'));
  }

  // Carousel "Opening Animation": the film plays in a small card on load, then
  // grows to full screen (hero-opening.js); its CSS also hides the two lines
  // it uses, so it loads whenever the option is on
  if (opening) {
    const [, { default: playOpening }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-opening.css`),
      import('./hero-opening.js'),
    ]);
    playOpening(block, {
      firstScreen,
      lines,
      // the first slide's content
      content: typeof controlsHost === 'function' ? controlsHost() : controlsHost,
    });
  }

  // Carousel "Showroom Layout": the hero's own Text (eyebrow + label/value lines) stays beside
  // every slide as an eyebrow and an info card (hero-showroom.js)
  if (carousel && block.classList.contains('showroom')) {
    const [, { default: decorateShowroom }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/hero/hero-showroom.css`),
      import('./hero-showroom.js'),
    ]);
    decorateShowroom(block, textCell);
  }
}
