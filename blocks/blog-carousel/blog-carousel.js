import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  moveInstrumentation, isAuthoring, takeRichtext, applyRichtext,
} from '../../scripts/scripts.js';

/*
 * Blog Carousel: one centred glass card ("OUR BLOGS" with previous / next arrows) showing a blog
 * teaser at a time (eyebrow, title, description, READ MORE bar), over a blurred backdrop image.
 * Scroll (walkthrough drafts/new-energy/jsw_walkthrough.mp4, 16.4–23.9s): the glass card peeks in
 * at the bottom while the previous section's images scroll away, then rises over that section's
 * text, which stays pinned until the card covers it (see CSS). The stage then pins and, tied to the
 * scroll (GSAP ScrollTrigger, scrubbed both ways), the page background (--page-bg, see CSS) goes
 * from white to black, the blurred backdrop fades in after it and the card settles into the
 * centre. The card's content is in place throughout, as in the walkthrough. One wheel gesture
 * from the previous section brings the card all the way up (scripts/scroll-stops.js) and the
 * darkening then plays by itself; one gesture back up returns to the previous section.
 * Rows:
 *   heading ("OUR BLOGS") | backdrop image (both optional, one row each)
 *   then one row per blog: eyebrow | title | description | link (its text is the bar label)
 */

const IMAGE_FILE = /\.(avif|gif|jpe?g|png|webp)$/i;
const MOTION = window.matchMedia('(prefers-reduced-motion: no-preference)');
// the wheel stops, relative to the section top: pinned (the card has arrived; reached in one glide
// from the previous section, then the darkening plays by itself), darkened
const GLIDE = { duration: '2.2 2.3', ease: 'power2.inOut;power2.inOut' };
const DARKEN_PHONE = 1.8; // s: the automatic darkening on phones
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

/*
 * How far above its resting place the card starts (it settles down while the page darkens):
 * --bc-settle, but never so far that it would tuck under the fixed nav bar (16px clear) on short
 * windows; none with reduced motion.
 */
function settleOf(block, card) {
  if (!MOTION.matches) return 0;
  const style = getComputedStyle(block);
  const settle = parseFloat(style.getPropertyValue('--bc-settle')) || 0;
  const nav = parseFloat(style.getPropertyValue('--bc-nav')) || 0;
  return Math.max(0, Math.min(settle, card.offsetTop - nav - 16));
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
    const richtext = takeRichtext(description); // (authoring: the box is the editable rich text)
    desc.append(...description.childNodes);
    applyRichtext(desc, richtext);
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
 * backdrop and the card position are scrubbed by the pinned scroll.
 */
async function animate(block, card, backdrop) {
  const { loadScrollTrigger, glideTo } = await import('../../scripts/scroll-stops.js');
  let gsap;
  let ScrollTrigger;
  try {
    ({ gsap, ScrollTrigger } = await loadScrollTrigger());
  } catch (e) {
    block.classList.add('is-static'); // CDN unavailable: final look, no scroll effects
    return;
  }
  const pin = () => block.parentElement.offsetHeight - block.offsetHeight;

  // the mobile browser bar showing / hiding changes the window height: don't re-measure for it
  ScrollTrigger.config({ ignoreMobileResize: true });

  // the scrubbed timeline and the occlusion trigger are built per breakpoint (gsap.matchMedia):
  // crossing it reverts them and builds them again with that breakpoint's values (phones: a
  // shorter settle via --bc-settle in the CSS, and a quicker automatic darkening)
  const current = { timeline: null, darken: 0 };
  const mm = gsap.matchMedia();
  mm.add({ desktop: '(width >= 768px)', phone: '(width < 768px)' }, (context) => {
    current.darken = context.conditions.phone ? DARKEN_PHONE : Number(GLIDE.duration.split(' ')[1]);
    // the stage covers the previous section once the colour change has begun, and the card settles
    // from settleOf() above its resting place down to it (set directly from the progress, so a
    // re-measure at the very start of the pin can't leave it unset). The settle distance is
    // measured on each ScrollTrigger refresh, not per frame: reading it right after the colour
    // write would force a full restyle on every scrubbed frame
    let settle = settleOf(block, card);
    const apply = (self) => {
      block.classList.toggle('is-pinned', self.progress > 0);
      // past halfway the page reads as dark (the phone nav drops its grey bar)
      document.body.classList.toggle('is-page-dark', self.progress > 0.5);
      card.style.transform = `translateY(${(-settle * (1 - self.progress)).toFixed(2)}px)`;
    };
    // one scrubbed timeline over the pinned scroll (0 → 1), reversed when scrolling back up
    const timeline = gsap.timeline({
      defaults: { duration: 1 },
      scrollTrigger: {
        trigger: block.parentElement,
        start: 'top top',
        // (2px short of the pin: on the last section that is the page end, which can be 1px less)
        end: () => `+=${Math.max(1, pin() - 2)}`,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: apply,
        onRefresh: (self) => {
          settle = settleOf(block, card); // (offsetTop: the card's own transform doesn't count)
          apply(self);
        },
      },
    });
    // the page background (walkthrough 21.55–23.85s): the colour leads, the backdrop follows
    timeline.fromTo([document.body, block], { '--page-bg': '#ffffff' }, { '--page-bg': '#000000', ease: (t) => t ** 1.2 }, 0)
      .fromTo(backdrop, { opacity: 0 }, { opacity: 1, ease: 'power1.in' }, 0);
    current.timeline = timeline;

    // the previous section's pinned text is covered by the rising card (walkthrough 19.2–19.5s): it
    // stays crisp above the card's top edge and is cut off exactly at it, so none of it shows
    // through the glass
    const prevText = block.closest('.section')?.previousElementSibling?.querySelector('.sticky-text-layer');
    if (prevText) {
      const occlude = () => {
        const edge = card.getBoundingClientRect().top - prevText.getBoundingClientRect().top;
        prevText.style.clipPath = edge < prevText.offsetHeight ? `inset(0 0 calc(100% - ${Math.max(edge, 0).toFixed(1)}px) 0)` : '';
      };
      ScrollTrigger.create({
        trigger: block.parentElement,
        start: 'top bottom',
        end: () => `+=${window.innerHeight + pin()}`,
        onUpdate: occlude,
        onRefresh: occlude,
        onLeave: occlude,
        onLeaveBack: () => { prevText.style.clipPath = ''; },
      });
    }

    return () => {
      current.timeline = null;
      card.style.transform = '';
      block.classList.remove('is-pinned');
      document.body.classList.remove('is-page-dark');
      if (prevText) prevText.style.clipPath = '';
    };
  });

  // once the card has fully arrived (scrolled down onto the pinned stage and come to rest there),
  // the colour change plays by itself: the page glides on through the pinned range with the
  // darkening glide; scrolling back up still reverses it, and any scroll during the glide takes
  // over
  let lastY = window.scrollY;
  let direction = 0;
  let idle = 0;
  let auto = false;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y !== lastY) direction = Math.sign(y - lastY);
    lastY = y;
    clearTimeout(idle);
    idle = setTimeout(() => {
      const trigger = current.timeline?.scrollTrigger;
      if (!trigger) return;
      const { start, end } = trigger;
      if (auto || direction <= 0 || y < start - 2 || y > end - 2) return;
      auto = true;
      const left = (end - y) / Math.max(end - start, 1);
      glideTo(end, { duration: Math.max(0.6, current.darken * left), ease: 'power2.inOut' })
        .then(() => { auto = false; });
    }, 120);
  }, { passive: true });

  // sections above keep settling after load (images, the showcase hand-off), and the card's own
  // size (fonts) sets its resting place: re-measure on any of those changes
  let pending = 0;
  const remeasure = new ResizeObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(() => ScrollTrigger.refresh(), 120);
  });
  [block.closest('main') || document.body, block, card].forEach((node) => remeasure.observe(node));
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
    picture.querySelector('img').decoding = 'async'; // (below the fold: decoded off the main thread)
    backdrop.append(picture);
  }
  // phones: one dash per blog under the card (the current one white), instead of the arrows
  const dots = el('div', { class: 'blog-carousel-dots', role: 'group', 'aria-label': 'Choose a blog' });
  if (blogs.length > 1) {
    blogs.forEach((_, i) => dots.append(el('button', {
      type: 'button', class: 'blog-carousel-dot', 'aria-label': `Blog ${i + 1} of ${blogs.length}`, 'aria-controls': `${uid}-slide-${i}`,
    })));
  }
  block.replaceChildren(backdrop, card, ...(dots.children.length ? [dots] : []));

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
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', i === target));
    current = target;
  };
  [...dots.children].forEach((dot, i) => dot.addEventListener('click', () => show(i, i > current ? 1 : -1)));
  // swipe (touch): left for the next blog, right for the previous one
  let touch = null;
  card.addEventListener('touchstart', (e) => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const dir = dx < 0 ? 1 : -1;
    show(current + dir, dir);
  }, { passive: true });
  prev.addEventListener('click', () => show(current - 1, -1));
  next.addEventListener('click', () => show(current + 1, 1));
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('a')) return;
    if (e.key === 'ArrowLeft') show(current - 1, -1);
    if (e.key === 'ArrowRight') show(current + 1, 1);
  });
  show(0);

  // authoring (Universal Editor, see isAuthoring): the final, dark look, no scroll animation and no
  // scroll stops
  if (isAuthoring()) {
    block.classList.add('is-static');
    return;
  }

  // wheel stops on the section (the block itself is sticky): pinned, darkened. One gesture from the
  // previous section brings the card all the way up (the darkening then plays by itself); the
  // pinned stop is passed over on the way back up, so one gesture returns to the previous section
  const section = block.closest('.section') || block;
  const setStops = () => {
    const pinPx = block.parentElement.offsetHeight - block.offsetHeight;
    section.dataset.scrollStops = `0 ${Math.round(pinPx)}`;
  };
  section.dataset.scrollDuration = GLIDE.duration;
  section.dataset.scrollEase = GLIDE.ease;
  section.dataset.scrollSkipUp = '0';
  setStops();
  const sizes = new ResizeObserver(setStops);
  [block, card].forEach((node) => sizes.observe(node));
  window.addEventListener('resize', setStops, { passive: true });

  // the scroll animation (GSAP + ScrollTrigger) is set up only once the page has loaded and the
  // section is within two screens of the window, so it costs nothing on the first load (phones)
  const start = () => {
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      animate(block, card, backdrop);
    }, { rootMargin: '200% 0px' });
    near.observe(section);
    import('../../scripts/scroll-stops.js').then(({ default: init }) => init({ touch: true }));
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
