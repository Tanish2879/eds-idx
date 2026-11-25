/*
 * Embed Block
 * Shows a YouTube or Vimeo video, an X (Twitter) post, or any page that allows
 * embedding, in an iframe. Based on the AEM Block Collection embed block.
 * https://www.aem.live/developer/block-collection/embed
 *
 * Authored rows (all but the first optional):
 * 1. URL of the video / post / page
 * 2. placeholder image: shown with a play button, the embed loads on click
 * 3. accessible name of the embed (the iframe title)
 */

const matches = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);

const loadScript = (src) => {
  if (document.querySelector(`head > script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.head.append(script);
};

const isTwitter = (url) => ['twitter.com', 'x.com'].some((host) => matches(url.hostname, host));

/**
 * X posts are drawn by widgets.js, which is slow to arrive: start fetching it as soon as the
 * block is decorated (not when it scrolls into view), with the connections opened first.
 */
function warmUpTwitter() {
  ['https://platform.twitter.com', 'https://syndication.twitter.com'].forEach((href) => {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = '';
    document.head.append(link);
  });
  loadScript('https://platform.twitter.com/widgets.js');
}

/**
 * Reads a YouTube start time: `90`, `90s` or `1m30s` → 90.
 * @param {string|null} value
 * @returns {number}
 */
function toSeconds(value) {
  if (!value) return 0;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const [, h = 0, m = 0, s = 0] = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/) || [];
  return (+h * 3600) + (+m * 60) + +s;
}

// Safari on iPhone, iPad and Mac only lets an iframe autoplay when it is muted and inline: the
// click on the placeholder does not carry into the cross-origin player.
const isApple = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  || /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

function youtubeSrc(url, autoplay) {
  // enablejsapi lets embed.js play and pause the video from a click on the shield
  const params = new URLSearchParams({ rel: '0', enablejsapi: '1', origin: window.location.origin });
  const [first, second] = url.pathname.split('/').filter(Boolean);
  let id = url.searchParams.get('v');
  if (url.hostname.endsWith('youtu.be')) id = first;
  else if (['embed', 'shorts', 'live', 'v'].includes(first)) id = second;
  const list = url.searchParams.get('list');
  if (list) params.set('list', list);
  const start = toSeconds(url.searchParams.get('t') || url.searchParams.get('start'));
  if (start) params.set('start', start);
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('playsinline', '1');
    if (isApple) params.set('mute', '1');
  }
  const path = id ? encodeURIComponent(id) : 'videoseries';
  return `https://www.youtube-nocookie.com/embed/${path}?${params}`;
}

function vimeoSrc(url, autoplay) {
  // vimeo.com/{id}, vimeo.com/{id}/{hash} (unlisted), player.vimeo.com/video/{id}
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.findIndex((part) => /^\d+$/.test(part));
  const params = new URLSearchParams(url.search);
  const hash = parts[index + 1];
  if (hash && /^[a-z0-9]+$/i.test(hash)) params.set('h', hash);
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('playsinline', '1');
    if (isApple) params.set('muted', '1');
  }
  const query = params.toString();
  return `https://player.vimeo.com/video/${parts[index] || ''}${query ? `?${query}` : ''}`;
}

const PROVIDERS = [
  {
    name: 'youtube',
    hosts: ['youtube.com', 'youtube-nocookie.com', 'youtu.be'],
    src: youtubeSrc,
    title: 'YouTube video',
  },
  {
    name: 'vimeo',
    hosts: ['vimeo.com'],
    src: vimeoSrc,
    title: 'Vimeo video',
  },
  {
    name: 'twitter',
    hosts: ['twitter.com', 'x.com'],
  },
];

/**
 * @param {string} value authored URL
 * @returns {URL|null} the URL when it is a valid http(s) address
 */
function toUrl(value) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Fluid height. In a snapped section (exactly one screen tall) the embed takes the room the
 * rest of the section leaves, measured from the real heading and text above or below it, and
 * kept up to date as the window, the fonts or the content change. embed.css sizes the embed
 * from --embed-room (and falls back to a fixed allowance until this has measured).
 * @param {Element} block the embed block
 */
function fitToSection(block) {
  const section = block.closest('.section');
  const holder = block.parentElement;
  if (!section || !holder || section.classList.contains('no-snap')
    || document.body.classList.contains('free-scroll') || !window.ResizeObserver) return;
  const px = (value) => parseFloat(value) || 0;
  const measure = () => {
    const sectionStyle = getComputedStyle(section);
    const holderStyle = getComputedStyle(holder);
    const blockStyle = getComputedStyle(block);
    // (the wrappers centre themselves with auto margins, which only hold the free space)
    const others = [...section.children].filter((el) => el !== holder)
      .concat([...holder.children].filter((el) => el !== block))
      .reduce((sum, el) => sum + el.offsetHeight, 0);
    const room = section.clientHeight - px(sectionStyle.paddingTop) - px(sectionStyle.paddingBottom)
      - px(holderStyle.paddingTop) - px(holderStyle.paddingBottom)
      - px(blockStyle.marginTop) - px(blockStyle.marginBottom) - others;
    block.style.setProperty('--embed-room', `${Math.max(180, Math.floor(room))}px`);
  };
  const observer = new ResizeObserver(measure);
  observer.observe(section);
  [...section.children].filter((el) => el !== holder).forEach((el) => observer.observe(el));
  measure();
}

// ---------------------------------------------------------------------------------------
// Embeds in use.
//
// The snap engine (scripts/section-snap.js) owns all scrolling: nothing here scrolls the page
// or calls the engine. A cross-origin player (YouTube, Vimeo, an X post) gets every wheel,
// trackpad and touch event that happens over it, and the page never sees them, so in a
// snapped section a transparent shield (embed.css) sits over the player: a gesture on it is an
// ordinary page event, which the engine turns into one snap. The embeds only react to the
// engine's 'snap:start' and 'snap:end' events.
//
// The page-level listeners below are registered once and loop over this registry, so they do
// not multiply with the number of embeds.
// ---------------------------------------------------------------------------------------
const embeds = new Set();

// The embed whose shield was last clicked, until the next snap: Space and K play or pause it.
let active = null;

// Starting one embed stops the others, so two videos never play at once.
const claim = (self) => embeds.forEach((other) => {
  if (other === self) return; // (a new embed is not in the page yet when it claims)
  if (!other.host.isConnected) embeds.delete(other);
  else other.stop();
});

/**
 * Play and pause a YouTube or Vimeo player from the page, through the provider's own
 * postMessage API, so a click on the shield (which a click can't pass through) can
 * still start and stop the video. The player's state comes back the same way.
 * @param {HTMLIFrameElement} iframe the player
 * @param {string} [name] provider name
 * @returns {object|null} toggle(), pause(), handle(messageEvent) and onPlay; null for
 *   providers without this API
 */
function connectPlayer(iframe, name, mutedStart = false) {
  const origins = {
    youtube: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
    vimeo: ['https://player.vimeo.com'],
  };
  const allowed = origins[name];
  if (!allowed) return null;
  let playing = false;
  // `alive`: the player has sent a message since it last loaded (its API answers)
  const api = { onPlay: null, alive: false };
  let muted = mutedStart;
  const send = (message) => iframe.contentWindow?.postMessage(JSON.stringify(message), '*');
  const setPlaying = (value) => {
    const started = value && !playing;
    playing = value;
    if (iframe.parentElement) iframe.parentElement.dataset.state = value ? 'playing' : 'paused';
    if (started) api.onPlay?.();
  };
  const unmute = () => {
    if (!muted) return;
    muted = false;
    if (name === 'youtube') send({ event: 'command', func: 'unMute', args: [] });
    else send({ method: 'setMuted', value: false });
  };
  const command = (play) => {
    if (play) unmute();
    if (name === 'youtube') send({ event: 'command', func: play ? 'playVideo' : 'pauseVideo', args: [] });
    else send({ method: play ? 'play' : 'pause' });
  };
  // a (re)loaded player starts paused; ask it to report its state from here on
  iframe.addEventListener('load', () => {
    api.alive = false;
    setPlaying(false);
    if (name === 'youtube') send({ event: 'listening', id: 1, channel: 'widget' });
    else ['play', 'pause', 'ended'].forEach((value) => send({ method: 'addEventListener', value }));
  });
  // called for the one message listener the page has (see setup)
  api.handle = (e) => {
    if (!allowed.includes(e.origin)) return;
    if (!api.alive && mutedStart) command(true); // iOS sometimes ignores the autoplay parameter
    api.alive = true;
    api.onAlive?.();
    let { data } = e;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (name === 'youtube') {
      const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
      // 1 playing, 3 buffering
      if (typeof state === 'number') setPlaying(state === 1 || state === 3);
    } else if (data?.event === 'play') {
      setPlaying(true);
    } else if (data?.event === 'pause' || data?.event === 'ended') {
      setPlaying(false);
    }
  };
  api.toggle = () => {
    command(!playing);
    setPlaying(!playing);
  };
  api.pause = () => {
    command(false);
    setPlaying(false);
  };
  return api;
}

let ready = false;

/** Registers the page-level listeners, once. */
function setup() {
  if (ready) return;
  ready = true;

  window.addEventListener('message', (e) => embeds.forEach((en) => {
    if (en.player && en.iframe.contentWindow === e.source) en.player.handle(e);
  }));

  // The page only sees the pointer when it is outside every player, so seeing it (or a press)
  // outside an embed puts that embed's shield back.
  const away = (e) => embeds.forEach((en) => {
    if (en.shield.classList.contains('is-off') && !en.host.contains(e.target)) en.rearm();
  });
  document.addEventListener('pointermove', away, { passive: true });
  document.addEventListener('pointerdown', away, { capture: true, passive: true });

  // A click in a player's open control zones, or Tab into it, moves focus into the iframe:
  // the player is in use and its own keys, menus and buttons must work.
  window.addEventListener('blur', () => setTimeout(() => {
    const frame = document.activeElement;
    if (frame?.tagName !== 'IFRAME') return;
    embeds.forEach((en) => {
      if (en.iframe !== frame) return;
      en.used = true;
      en.off();
      claim(en);
    });
  }, 0));
  // focus back on the page (Tab out of a player): shields on again
  window.addEventListener('focus', () => embeds.forEach((en) => {
    if (document.activeElement !== en.iframe) en.rearm();
  }));

  // After a click on a shield the keyboard stays with the page, so Space and K play or pause that
  // video (the arrow keys still snap the page). Not while a control that uses the key has focus.
  window.addEventListener('keydown', (e) => {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!active.host.isConnected || !active.player) { active = null; return; }
    const isSpace = e.key === ' ';
    if (!isSpace && e.key.toLowerCase() !== 'k') return;
    const el = e.target;
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (isSpace && el?.closest?.('button, a[href], summary, video, audio, [role="button"], [role="tab"], [role="checkbox"], [role="menuitem"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the snap engine pages on Space
    if (!e.repeat) active.player.toggle();
  }, true);

  // A snap moves away from an embed: its sound stops at once; once the move has settled it
  // goes back to how it first loaded. The embed in the section being snapped to is left alone.
  document.addEventListener('snap:start', (e) => {
    active = null;
    embeds.forEach((en) => {
      if (en.section === e.detail?.to) return;
      if (en.player && en.used) en.player.pause();
      en.rearm(true);
    });
  });
  document.addEventListener('snap:end', (e) => embeds.forEach((en) => {
    if (en.section !== e.detail?.to && en.used) en.reset();
  }));
}

/**
 * Registers an embed and adds its shield.
 * For a YouTube or Vimeo player a click on the shield plays or pauses through the player's
 * API and the shield stays on; the top and bottom of the shield are left open (embed.css) for
 * the player's own controls. For anything else a click turns the shield off so the content
 * can be used, until the pointer leaves it.
 * @param {Element} host the element holding the player
 * @param {Element} block the embed block
 * @param {object} options
 * @param {HTMLIFrameElement} [options.iframe] the player
 * @param {object|null} [options.player] play/pause API of the player (connectPlayer)
 * @param {string} [options.restSrc] address of the player as first loaded (no autoplay)
 * @param {boolean} [options.started] the visitor started it (placeholder play button)
 * @param {function(): void} [options.restore] puts the placeholder back, when it had one
 */
function register(host, block, {
  iframe = null, player = null, restSrc = '', started = false, restore = null,
}) {
  setup();
  const shield = document.createElement('div');
  shield.className = ['embed-shield', player && 'is-api'].filter(Boolean).join(' ');
  shield.setAttribute('aria-hidden', 'true');
  const entry = {
    host, shield, iframe, player, section: block.closest('.section'), used: started, timer: 0,
  };
  let pointerType = 'mouse';

  entry.off = () => shield.classList.add('is-off');
  // shield on; blur also takes keyboard focus out of the player
  entry.rearm = (blur = false) => {
    clearTimeout(entry.timer);
    shield.classList.remove('is-off');
    if (blur && iframe && document.activeElement === iframe) iframe.blur();
  };
  // shield off for a moment (touch has no hover to tell when the controls are wanted)
  entry.lift = (ms) => {
    entry.off();
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (document.activeElement !== iframe) entry.rearm();
    }, ms);
  };
  // back to how it first loaded
  entry.reset = () => {
    entry.used = false;
    if (active === entry) active = null;
    entry.rearm(true);
    if (restore) {
      embeds.delete(entry);
      restore();
    } else if (iframe) {
      iframe.src = restSrc;
    } else {
      block.scrollTop = 0; // an X post's own scrolling
    }
  };
  // another embed started
  entry.stop = () => {
    if (player) player.pause();
    else if (entry.used) entry.reset();
  };

  shield.addEventListener('pointerdown', (e) => { pointerType = e.pointerType; });
  // 6. A player whose API does not answer within 3s of loading is treated like any other
  // iframe: the shield covers all of it and a click lifts the shield, so the video stays usable.
  entry.fallback = false;
  const fallback = (on) => {
    entry.fallback = on;
    shield.classList.toggle('is-api', !on);
  };
  if (player) {
    iframe.addEventListener('load', () => {
      clearTimeout(entry.apiTimer);
      entry.apiTimer = setTimeout(() => { if (!player.alive) fallback(true); }, 3000);
    });
    player.onAlive = () => { if (entry.fallback) fallback(false); };
  }

  shield.addEventListener('click', () => {
    entry.used = true;
    if (player && entry.fallback) {
      entry.off();
      claim(entry);
    } else if (player) {
      active = entry;
      player.toggle();
      // a tap also lifts the shield for a few seconds, so YouTube's touch controls can be reached
      if (pointerType === 'touch') entry.lift(3000);
    } else {
      entry.off();
      claim(entry);
    }
  });
  if (player) player.onPlay = () => { entry.used = true; claim(entry); };
  if (started && !player) entry.off();

  host.append(shield);
  embeds.add(entry);
  if (started) claim(entry);
}

function createFrame(block, {
  src, title, autoplay, restSrc, providerName, restore,
}) {
  const frame = document.createElement('div');
  frame.className = 'embed-frame';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.loading = 'lazy';
  iframe.allow = 'autoplay; fullscreen; encrypted-media; clipboard-write';
  // YouTube refuses to play without the page's origin as referrer
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.append(iframe);
  register(frame, block, {
    iframe,
    player: connectPlayer(iframe, providerName, autoplay && isApple),
    restSrc,
    started: autoplay,
    restore,
  });
  return frame;
}

function createPost(block, url, { autoplay, restore }) {
  const holder = document.createElement('div');
  holder.className = 'embed-post';
  const quote = document.createElement('blockquote');
  quote.className = 'twitter-tweet';
  const link = document.createElement('a');
  link.href = url.href;
  link.textContent = url.href;
  quote.append(link);
  // a card the size of a post shows at once; widgets.js swaps it for the real post
  const skeleton = document.createElement('div');
  skeleton.className = 'embed-skeleton';
  skeleton.innerHTML = '<span></span><span></span><span></span><span></span>'
    + '<div class="embed-status" role="status"><i></i><b>Loading post…</b></div>';
  holder.classList.add('is-loading');
  holder.append(skeleton, quote);
  const done = () => {
    observer.disconnect(); // eslint-disable-line no-use-before-define
    clearTimeout(giveUp); // eslint-disable-line no-use-before-define
    holder.classList.remove('is-loading');
    skeleton.remove();
  };
  const observer = new MutationObserver(() => {
    if (holder.querySelector('iframe, .twitter-tweet-rendered')) done();
  });
  observer.observe(holder, { childList: true, subtree: true, attributes: true });
  // blocked or failed: stop the shimmer and leave the plain link
  const giveUp = setTimeout(done, 10000);
  register(holder, block, { started: autoplay, restore });
  loadScript('https://platform.twitter.com/widgets.js');
  return holder;
}

function loadEmbed(block, url, title, autoplay = false, restore = null) {
  if (block.classList.contains('embed-is-loaded')) return;
  const provider = PROVIDERS.find((p) => p.hosts.some((host) => matches(url.hostname, host)));
  if (provider) block.classList.add(`embed-${provider.name}`);
  const content = provider?.name === 'twitter'
    ? createPost(block, url, { autoplay, restore })
    : createFrame(block, {
      src: provider ? provider.src(url, autoplay) : url.href,
      title: title || provider?.title || `Content from ${url.hostname}`,
      autoplay,
      // back to the start, paused: the address without autoplay
      restSrc: provider ? provider.src(url, false) : url.href,
      providerName: provider?.name,
      restore,
    });
  block.replaceChildren(content);
  block.classList.add('embed-is-loaded');
  // widgets.js only scans the page once when it starts: a post added after that needs this
  if (provider?.name === 'twitter') window.twttr?.widgets?.load(block);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  const link = block.querySelector('a');
  const url = toUrl(link?.href || rows[0]?.textContent || '');
  const placeholder = block.querySelector('picture');
  const title = rows
    .filter((row) => !(link && row.contains(link)) && !row.querySelector('picture'))
    .map((row) => row.textContent.trim())
    .find((text) => text && !toUrl(text)) || '';
  // the authored content is replaced below; keep what the page's structured data (VideoObject)
  // needs, see scripts/utils/schema.js
  if (url) {
    block.dataset.embedUrl = url.href;
    if (title) block.dataset.embedTitle = title;
    const thumb = placeholder?.querySelector('img')?.src;
    if (thumb) block.dataset.embedThumb = thumb;
  }

  // the authored content is replaced below; keep what the page's structured data (VideoObject)
  // needs, see scripts/utils/schema.js
  if (url) {
    block.dataset.embedUrl = url.href;
    if (title) block.dataset.embedTitle = title;
    const thumb = placeholder?.querySelector('img')?.src;
    if (thumb) block.dataset.embedThumb = thumb;
  }

  block.textContent = '';
  if (!url) {
    block.classList.add('embed-empty');
    return;
  }
  fitToSection(block);
  if (isTwitter(url)) warmUpTwitter();
  // an X post has no cheap placeholder to wait behind: start it now, its card holds the room
  if (isTwitter(url) && !placeholder) {
    loadEmbed(block, url, title);
    return;
  }

  if (placeholder) {
    const wrapper = document.createElement('div');
    wrapper.className = 'embed-placeholder';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'embed-play';
    play.setAttribute('aria-label', title ? `Play: ${title}` : 'Play');
    wrapper.append(placeholder, play);
    // a snap away from a started embed puts the placeholder and its play button back
    const restore = () => {
      block.replaceChildren(wrapper);
      block.classList.remove('embed-is-loaded', 'embed-youtube', 'embed-vimeo', 'embed-twitter');
    };
    wrapper.addEventListener('click', () => loadEmbed(block, url, title, true, restore));
    block.append(wrapper);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect();
      loadEmbed(block, url, title);
    }
  }, { rootMargin: '200px' });
  observer.observe(block);
}
