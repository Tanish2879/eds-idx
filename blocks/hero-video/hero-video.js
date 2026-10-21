import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, takeRichtext } from '../../scripts/scripts.js';

/*
 * Hero Video: full-bleed muted, looping background video with the headline top left, the
 * description bottom left, a button bottom right and a "scroll" indicator on the right edge.
 * Rows (each optional, recognised by content): background media (video link + poster image) |
 * heading + paragraph | button link | scroll label.
 * The poster renders as a regular eager image (good LCP) and stays visible until the video plays,
 * if the video can't play, and when the user prefers reduced motion.
 * The video (several MB) is fetched only once the page has loaded, so it doesn't compete with the
 * first paint and the rest of the page; not at all with data saver on or on a 2G / 3G connection
 * (the poster stays); and it plays only while the hero can be seen (paused once the next section
 * covers it), which frees the CPU / GPU for scrolling on phones.
 */

const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const VIDEO_TYPES = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const SLOW_NETWORK = ['slow-2g', '2g', '3g'];

const pathOf = (href) => new URL(href, window.location).pathname;

// AEM delivers a reference it can't resolve (an asset not in AEM Assets yet) as a plain link;
// placeholder media under a /drafts/ folder are then loaded from the copy in this repository
function mediaUrl(href) {
  const path = pathOf(href);
  const drafts = path.indexOf('/drafts/');
  return drafts > 0 ? `${window.hlx?.codeBasePath || ''}${path.slice(drafts)}` : href;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false) node.setAttribute(k, v);
  });
  node.append(...children.filter(Boolean));
  return node;
}

// no video on a data saver or a slow connection (where the browser reports it)
function videoWanted() {
  const net = navigator.connection;
  return !net || !(net.saveData || SLOW_NETWORK.includes(net.effectiveType));
}

// (no poster attribute: the poster <img> underneath shows until the video plays, and the attribute
// would fetch the image a second time)
function buildVideo(links) {
  const video = el('video', {
    muted: '',
    loop: '',
    playsinline: '',
    preload: 'none', // nothing is fetched until the video starts (see decorate)
    'aria-hidden': 'true',
    tabindex: '-1',
    disablepictureinpicture: '',
  });
  video.muted = true; // the attribute alone doesn't satisfy autoplay policies in every browser
  links.forEach((a) => {
    const src = mediaUrl(a.href);
    const ext = pathOf(src).split('.').pop().toLowerCase();
    video.append(el('source', { src, type: VIDEO_TYPES[ext] }));
  });
  return video;
}

export default function decorate(block) {
  const rows = [...block.children];
  const allLinks = [...block.querySelectorAll('a[href]')];
  const videoLinks = allLinks.filter((a) => VIDEO_FILE.test(pathOf(a.href)));
  // the poster: an <img>, or a link to an image file (an asset AEM couldn't resolve)
  const img = block.querySelector('img');
  const posterLink = img ? null : allLinks.find((a) => IMAGE_FILE.test(pathOf(a.href)));
  const poster = (img && { src: img.src, alt: img.alt, source: img })
    || (posterLink && {
      src: mediaUrl(posterLink.href), alt: posterLink.textContent.trim(), source: posterLink,
    });
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  const textRow = heading ? rows.find((r) => r.contains(heading)) : null;
  const cta = allLinks.find((a) => !videoLinks.includes(a) && a !== posterLink
    && !(textRow && textRow.contains(a)));
  const ctaRow = cta ? rows.find((r) => r.contains(cta)) : null;
  const used = [textRow, ctaRow, ...videoLinks.map((a) => rows.find((r) => r.contains(a)))];
  if (poster) used.push(rows.find((r) => r.contains(poster.source)));
  // the scroll label: a remaining row with plain text only
  const labelRow = rows.find((r) => !used.includes(r) && r.textContent.trim() && !r.querySelector('a, img'));

  // background: poster image + video
  const media = el('div', { class: 'hero-video-media' });
  if (poster) {
    const picture = createOptimizedPicture(poster.src, poster.alt, true, [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]);
    const posterImg = picture.querySelector('img');
    posterImg.setAttribute('fetchpriority', 'high');
    moveInstrumentation(poster.source, posterImg);
    media.append(picture);
  }
  let video;
  if (videoLinks.length && videoWanted()) {
    video = buildVideo(videoLinks);
    media.append(video);
  }

  // content overlay
  const content = el('div', { class: 'hero-video-content' });
  if (textRow) {
    // (authoring: the heading and the paragraphs go to two places of the layout grid, with the
    // button, a separate field, between them, so no element holds exactly this rich text: it is
    // edited in the block's properties; the editor's wrapper is only removed)
    takeRichtext(textRow);
    moveInstrumentation(textRow, content);
    heading.classList.add('hero-video-headline');
    content.append(heading);
    const paragraphs = [...textRow.querySelectorAll('p')].filter((p) => p.textContent.trim());
    if (paragraphs.length) {
      const desc = el('div', { class: 'hero-video-description' }, ...paragraphs);
      content.append(desc);
    }
  }
  if (cta) {
    const button = el('a', { href: cta.getAttribute('href'), class: 'hero-video-cta' });
    // a trailing "+" in the authored text is drawn as an icon
    button.append(el('span', { class: 'hero-video-cta-label' }, cta.textContent.replace(/\s*\+\s*$/, '').trim()));
    button.append(el('span', { class: 'hero-video-cta-icon', 'aria-hidden': 'true' }));
    moveInstrumentation(ctaRow, button);
    content.append(button);
  }

  // scroll indicator: scrolls to whatever follows the hero
  const label = labelRow?.textContent.trim() || 'SCROLL';
  const scroll = el(
    'button',
    { type: 'button', class: 'hero-video-scroll', 'aria-label': `${label.charAt(0)}${label.slice(1).toLowerCase()} down` },
    el('span', { class: 'hero-video-scroll-mouse', 'aria-hidden': 'true' }),
    el('span', { class: 'hero-video-scroll-label' }, label),
  );
  if (labelRow) moveInstrumentation(labelRow, scroll);
  scroll.addEventListener('click', async () => {
    const top = block.getBoundingClientRect().bottom + window.scrollY;
    // glide like a wheel step: use the glide of the scroll stop that starts there, if any
    const stop = [...document.querySelectorAll('[data-scroll-stops]')]
      .find((s) => Math.abs(s.getBoundingClientRect().top + window.scrollY - top) < 2);
    const glide = stop ? {
      duration: Number(stop.dataset.scrollDuration) || undefined,
      ease: stop.dataset.scrollEase || undefined,
    } : undefined;
    const { glideTo } = await import('../../scripts/scroll-stops.js');
    glideTo(top, glide);
  });

  block.replaceChildren(media, content, scroll);

  if (!video) return;
  // the video fades in over the poster once it actually plays; with reduced motion it stays paused
  video.addEventListener('playing', () => block.classList.add('is-playing'));
  // the browser tries each <source> in turn: only the last one failing means no playable format
  video.lastElementChild?.addEventListener('error', () => video.remove());
  let started = false; // fetching / playing allowed (once the page has loaded)
  let inView = true; // the hero is on screen
  let covered = false; // the next section has slid over it (the hero may be pinned underneath)
  const sync = () => {
    if (!started) return;
    if (REDUCED_MOTION.matches) {
      video.pause();
      block.classList.remove('is-playing');
    } else if (!inView || covered) {
      video.pause(); // its last frame stays, so it carries on seamlessly when uncovered
    } else {
      video.play().catch(() => { /* autoplay blocked: the poster stays */ });
    }
  };
  REDUCED_MOTION.addEventListener('change', sync);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  }).observe(block);
  const next = (block.closest('.section') || block).nextElementSibling;
  if (next) {
    // covered: the next section's top has reached the top 1% of the screen, or it is past it
    new IntersectionObserver(([entry]) => {
      covered = entry.isIntersecting || entry.boundingClientRect.top < 0;
      sync();
    }, { rootMargin: '0px 0px -99% 0px' }).observe(next);
  }
  const start = () => {
    started = true;
    video.preload = 'auto';
    sync();
  };
  const afterLoad = () => {
    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}
