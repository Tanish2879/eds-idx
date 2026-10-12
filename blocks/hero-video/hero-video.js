import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Hero Video: full-bleed muted, looping background video with the headline top left, the
 * description bottom left, a button bottom right and a "scroll" indicator on the right edge.
 * Rows (each optional, recognised by content): background media (video link + poster image) |
 * heading + paragraph | button link | scroll label.
 * The poster renders as a regular eager image (good LCP) and stays visible until the video plays,
 * if the video can't play, and when the user prefers reduced motion.
 */

const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;
const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const VIDEO_TYPES = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const pathOf = (href) => new URL(href, window.location).pathname;

// AEM delivers a reference it can't resolve (an asset not in AEM Assets yet) as a plain link;
// placeholder media under a /drafts/ folder are then loaded from the copy in this repository
function mediaUrl(href) {
  const path = pathOf(href);
  const drafts = path.indexOf('/drafts/');
  return drafts > 0 ? path.slice(drafts) : href;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false) node.setAttribute(k, v);
  });
  node.append(...children.filter(Boolean));
  return node;
}

function buildVideo(links, posterSrc) {
  const video = el('video', {
    muted: '',
    loop: '',
    playsinline: '',
    preload: 'auto',
    'aria-hidden': 'true',
    tabindex: '-1',
    disablepictureinpicture: '',
  });
  video.muted = true; // the attribute alone doesn't satisfy autoplay policies in every browser
  if (posterSrc) video.poster = posterSrc;
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
  let posterSrc;
  if (poster) {
    const picture = createOptimizedPicture(poster.src, poster.alt, true, [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]);
    const posterImg = picture.querySelector('img');
    posterImg.setAttribute('fetchpriority', 'high');
    moveInstrumentation(poster.source, posterImg);
    posterSrc = posterImg.currentSrc || picture.querySelector('img').src;
    media.append(picture);
  }
  let video;
  if (videoLinks.length) {
    video = buildVideo(videoLinks, posterSrc);
    media.append(video);
  }

  // content overlay
  const content = el('div', { class: 'hero-video-content' });
  if (textRow) {
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
  const sync = () => {
    if (REDUCED_MOTION.matches) {
      video.pause();
      block.classList.remove('is-playing');
    } else {
      video.play().catch(() => { /* autoplay blocked: the poster stays */ });
    }
  };
  REDUCED_MOTION.addEventListener('change', sync);
  sync();
}
