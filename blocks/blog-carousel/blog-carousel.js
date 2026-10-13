import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Blog Carousel: one centred glass card ("OUR BLOGS" with previous / next arrows) showing a blog
 * teaser at a time (eyebrow, title, description, READ MORE bar), over a blurred backdrop image.
 * Scroll (walkthrough drafts/new-energy/jsw_walkthrough.mp4, 16.4–23.9s): the glass card peeks in
 * at the bottom while the previous section's images scroll away, then rises over that section's
 * text, which stays pinned until the card covers it (see CSS). The stage then pins and, tied to the
 * scroll (GSAP ScrollTrigger, scrubbed both ways), the page background (--page-bg on <body>) goes
 * from white to black, the blurred backdrop fades in after it, the card settles into the centre
 * and its content fades / slides up part by part. Each of those three steps is one eased wheel
 * stop (scripts/scroll-stops.js), with the walkthrough's glides.
 * Rows:
 *   heading ("OUR BLOGS") | backdrop image (both optional, one row each)
 *   then one row per blog: eyebrow | title | description | link (its text is the bar label)
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const MOTION = window.matchMedia('(prefers-reduced-motion: no-preference)');
// the wheel stops, relative to the section top: card peeking in (the card top this far above the
// viewport bottom), pinned, darkened; glides fitted to the walkthrough
const PEEK = 110;
const GLIDE = { duration: '1.8 1.05 2.3', ease: 'power2.inOut;power2.inOut;power2.inOut' };
let carouselId = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== false) node.setAttribute(k, v);
  });
  node.append(...children.filter(Boolean));
  return node;
}

const icon = (path) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
};

/*
 * The row's image: an <img>, or a link to an image file. AEM delivers an image reference it can't
 * resolve (an asset that isn't in AEM Assets yet) as a plain link; placeholder images under a
 * /drafts/ folder are then loaded from the copy in this repository.
 */
function rowImage(row) {
  const img = row.querySelector('img');
  if (img) return { src: img.src, alt: img.alt, source: img };
  const link = [...row.querySelectorAll('a[href]')].find((a) => IMAGE_FILE.test(new URL(a.href, window.location).pathname));
  if (!link) return null;
  const { pathname } = new URL(link.href, window.location);
  const drafts = pathname.indexOf('/drafts/');
  return { src: drafts > 0 ? pathname.slice(drafts) : link.href, alt: '', source: link };
}

function buildSlide(row, index, total, uid) {
  const [eyebrow, title, description, linkCell] = [...row.children];
  const link = linkCell?.querySelector('a[href]');
  const slide = el('article', {
    class: 'blog-carousel-slide', id: `${uid}-slide-${index}`, 'aria-roledescription': 'slide', 'aria-label': `${index + 1} of ${total}`,
  });
  moveInstrumentation(row, slide);
  if (eyebrow?.textContent.trim()) slide.append(el('p', { class: 'blog-carousel-eyebrow' }, eyebrow.textContent.trim()));
  if (title?.textContent.trim()) slide.append(el('h3', { class: 'blog-carousel-title' }, title.textContent.trim()));
  if (description?.textContent.trim()) {
    const desc = el('div', { class: 'blog-carousel-description' });
    desc.append(...description.childNodes);
    slide.append(desc);
  }
  if (link) {
    const label = link.textContent.trim() || 'Read more';
    const cta = el(
      'a',
      { class: 'blog-carousel-link', href: link.getAttribute('href') },
      el('span', { class: 'blog-carousel-link-label' }, label),
      el('span', { class: 'blog-carousel-link-icon' }, icon('M5 11 11 5M6 5h5v5')),
    );
    if (link.title) cta.title = link.title;
    moveInstrumentation(link, cta);
    slide.append(cta);
  }
  return slide;
}

/*
 * Scroll animation (GSAP + ScrollTrigger, loaded with the wheel scroller): the page colour, the
 * backdrop, the card position and the staggered card content are all scrubbed by the pinned scroll.
 */
async function animate(block, card, backdrop) {
  const { loadScrollTrigger } = await import('../../scripts/scroll-stops.js');
  let gsap;
  let ScrollTrigger;
  try {
    ({ gsap, ScrollTrigger } = await loadScrollTrigger());
  } catch (e) {
    block.classList.add('is-static'); // CDN unavailable: final look, no scroll effects
    return;
  }
  const pin = () => block.parentElement.offsetHeight - block.offsetHeight;
  const settle = () => parseFloat(getComputedStyle(block).getPropertyValue('--bc-settle')) || 0;
  const lift = () => (MOTION.matches ? 24 : 0);

  // one scrubbed timeline over the pinned scroll (0 → 1), reversed when scrolling back up
  const tl = gsap.timeline({
    defaults: { duration: 1 },
    scrollTrigger: {
      trigger: block.parentElement,
      start: 'top top',
      end: () => `+=${pin()}`,
      scrub: true,
      invalidateOnRefresh: true,
      // the stage only covers the previous section once the colour change has begun
      onUpdate: (self) => block.classList.toggle('is-pinned', self.progress > 0),
      onRefresh: (self) => block.classList.toggle('is-pinned', self.progress > 0),
    },
  });
  // the page background (walkthrough 21.55–23.85s): the colour leads, the backdrop follows
  tl.fromTo(document.body, { '--page-bg': '#ffffff' }, { '--page-bg': '#000000', ease: (t) => t ** 1.2 }, 0)
    .fromTo(backdrop, { opacity: 0 }, { opacity: 1, ease: 'power1.in' }, 0)
    .fromTo(card, { y: () => (MOTION.matches ? -settle() : 0) }, { y: 0, ease: 'none' }, 0);
  // the card content comes in with it, one part after another: heading row, eyebrow, title,
  // description, READ MORE (the same part of every blog, so switching blogs later is unaffected)
  const groups = [
    [card.querySelector('.blog-carousel-head')],
    ...['eyebrow', 'title', 'description', 'link'].map((part) => [...card.querySelectorAll(`.blog-carousel-${part}`)]),
  ].filter((g) => g.length && g[0]);
  groups.forEach((group, i) => {
    tl.fromTo(group, { autoAlpha: 0, y: lift }, {
      autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out',
    }, 0.12 + i * 0.08);
  });

  // the previous section's pinned text exits under the rising card: it fades while the card's top
  // edge crosses it, so nothing of it shows through the glass
  const prevText = block.closest('.section')?.previousElementSibling?.querySelector('.sticky-text-layer');
  if (prevText) {
    gsap.fromTo(prevText, { opacity: 1 }, {
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: card, start: 'top 62%', end: 'top 30%', scrub: true, invalidateOnRefresh: true,
      },
    });
  }

  // sections above keep settling after load (images, the showcase hand-off): re-measure
  let pending = 0;
  new ResizeObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(() => ScrollTrigger.refresh(), 120);
  }).observe(block.closest('main') || document.body);
  block.classList.add('is-animated');
}

export default function decorate(block) {
  carouselId += 1;
  const uid = `blog-carousel-${carouselId}`;
  const rows = [...block.children];

  // leading single-cell rows: the heading and the backdrop image; then the blogs
  let heading;
  let image;
  const blogs = [];
  rows.forEach((row) => {
    if (row.children.length <= 1 && !blogs.length) {
      const img = rowImage(row);
      if (img && !image) image = { ...img, row };
      else if (!img && row.textContent.trim() && !heading) heading = row;
    } else blogs.push(row);
  });

  const card = el('div', {
    class: 'blog-carousel-card', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': heading?.textContent.trim() || 'Blogs',
  });
  const head = el('div', { class: 'blog-carousel-head' });
  const prev = el('button', { type: 'button', class: 'blog-carousel-prev', 'aria-label': 'Previous blog' }, icon('M10 3 5 8l5 5'));
  const next = el('button', { type: 'button', class: 'blog-carousel-next', 'aria-label': 'Next blog' }, icon('m6 3 5 5-5 5'));
  if (heading) {
    const h2 = el('h2', { class: 'blog-carousel-heading' }, heading.textContent.trim());
    moveInstrumentation(heading, h2);
    head.append(prev, h2, next);
  } else head.append(prev, next);

  const slides = el('div', { class: 'blog-carousel-slides', 'aria-live': 'polite' });
  blogs.forEach((row, i) => slides.append(buildSlide(row, i, blogs.length, uid)));
  card.append(head, slides);
  if (blogs.length < 2) [prev, next].forEach((b) => { b.hidden = true; });

  const backdrop = el('div', { class: 'blog-carousel-backdrop', 'aria-hidden': 'true' });
  if (image) {
    const picture = createOptimizedPicture(image.src, image.alt, false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]);
    moveInstrumentation(image.source, picture.querySelector('img'));
    backdrop.append(picture);
  }
  block.replaceChildren(backdrop, card);

  // selection: the outgoing blog slides / fades out while the next one comes in from the side
  let current = -1;
  const show = (index, dir = 1) => {
    const list = [...slides.children];
    if (!list.length) return;
    const target = (index + list.length) % list.length;
    if (target === current) return;
    list.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === target);
      slide.classList.toggle('is-leaving', i === current);
      slide.inert = i !== target;
    });
    slides.style.setProperty('--bc-dir', dir);
    current = target;
  };
  prev.addEventListener('click', () => show(current - 1, -1));
  next.addEventListener('click', () => show(current + 1, 1));
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('a')) return;
    if (e.key === 'ArrowLeft') show(current - 1, -1);
    if (e.key === 'ArrowRight') show(current + 1, 1);
  });
  show(0);

  // wheel stops on the section (the block itself is sticky): peek, pinned, darkened
  const section = block.closest('.section') || block;
  const setStops = () => {
    const pinPx = block.parentElement.offsetHeight - block.offsetHeight;
    const settle = MOTION.matches ? parseFloat(getComputedStyle(block).getPropertyValue('--bc-settle')) || 0 : 0;
    const peek = card.offsetTop - settle + PEEK - window.innerHeight;
    section.dataset.scrollStops = `${Math.round(Math.min(peek, -1))} 0 ${Math.round(pinPx)}`;
  };
  section.dataset.scrollDuration = GLIDE.duration;
  section.dataset.scrollEase = GLIDE.ease;
  setStops();
  new ResizeObserver(setStops).observe(block);
  window.addEventListener('resize', setStops, { passive: true });

  const start = () => {
    animate(block, card, backdrop);
    import('../../scripts/scroll-stops.js').then(({ default: init }) => init());
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
