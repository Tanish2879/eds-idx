import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, applyArtDirection } from '../../scripts/scripts.js';

/*
 * Carousel Showcase: full-viewport product slider with a day/night theme toggle.
 * Each row is one slide with up to three cells (detected by content, so empty or
 * missing cells are tolerated):
 *   1. day image (required for a visual slide) + optional square mobile image
 *   2. night image (optional - enables the day/night toggle) + optional mobile image
 *      (a second picture in an image cell is used below 900px via art direction)
 *   3. text: heading, description, CTA links (e.g. Explore now, Download brochure)
 */

const LABELS = {
  region: 'Carousel',
  controls: 'Carousel Slide Controls',
  prev: 'Previous Slide',
  next: 'Next Slide',
  show: 'Show Slide',
  of: 'of',
  night: 'Switch to night view',
};

let carouselId = 0;

function optimize(picture, eager) {
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, eager, [
    { media: '(min-width: 900px)', width: '1600' },
    { width: '900' },
  ]);
  moveInstrumentation(img, optimized.querySelector('img'));
  return optimized;
}

function updateActiveSlide(block, slideIndex) {
  block.dataset.activeSlide = slideIndex;
  block.querySelectorAll('.carousel-showcase-slide').forEach((slide, idx) => {
    const active = idx === slideIndex;
    slide.setAttribute('aria-hidden', !active);
    slide.querySelectorAll('a').forEach((link) => {
      if (active) link.removeAttribute('tabindex');
      else link.setAttribute('tabindex', '-1');
    });
  });
  block.querySelectorAll('.carousel-showcase-slide-indicator button').forEach((button, idx) => {
    if (idx === slideIndex) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function showSlide(block, slideIndex) {
  const slides = block.querySelectorAll('.carousel-showcase-slide');
  let index = slideIndex;
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  block.querySelector('.carousel-showcase-slides').scrollTo({
    top: 0,
    left: slides[index].offsetLeft,
    behavior: 'smooth',
  });
}

function createSlide(row, idx, id) {
  const slide = document.createElement('li');
  slide.className = 'carousel-showcase-slide';
  slide.dataset.slideIndex = idx;
  slide.id = `carousel-showcase-${id}-slide-${idx}`;
  moveInstrumentation(row, slide);

  const media = document.createElement('div');
  media.className = 'carousel-showcase-slide-media';
  const content = document.createElement('div');
  content.className = 'carousel-showcase-slide-content';

  let pictureCount = 0;
  [...row.children].forEach((cell) => {
    const [picture, mobilePicture] = cell.querySelectorAll('picture');
    const hasText = cell.textContent.trim().length > 0;
    if (picture && !hasText) {
      const optimized = optimize(picture, idx === 0 && pictureCount === 0);
      // optional square mobile cut-out: merged after optimize() so its sources survive
      if (mobilePicture) {
        applyArtDirection(optimized, optimize(mobilePicture, false), 900);
        mobilePicture.remove();
        optimized.classList.add('carousel-showcase-image-art-directed');
      }
      optimized.classList.add(pictureCount === 0
        ? 'carousel-showcase-image-day'
        : 'carousel-showcase-image-night');
      pictureCount += 1;
      media.append(optimized);
    } else if (hasText) {
      moveInstrumentation(cell, content);
      content.append(...cell.childNodes);
    }
  });

  if (media.children.length) slide.append(media);
  if (content.childNodes.length) slide.append(content);

  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading && heading.id) slide.setAttribute('aria-labelledby', heading.id);
  content.querySelectorAll('a').forEach((a) => a.classList.add('carousel-showcase-cta'));
  return slide;
}

export default function decorate(block) {
  carouselId += 1;
  const id = carouselId;
  block.id = `carousel-showcase-${id}`;
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', LABELS.region);

  const rows = [...block.children];
  const container = document.createElement('div');
  container.className = 'carousel-showcase-slides-container';
  const slides = document.createElement('ul');
  slides.className = 'carousel-showcase-slides';
  rows.forEach((row, idx) => slides.append(createSlide(row, idx, id)));
  container.append(slides);
  block.replaceChildren(container);

  // day/night toggle - only when at least one slide carries a night image
  if (block.querySelector('.carousel-showcase-image-night')) {
    block.classList.add('has-night');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'carousel-showcase-theme-toggle';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', LABELS.night);
    toggle.addEventListener('click', () => {
      const night = block.classList.toggle('is-night');
      toggle.setAttribute('aria-pressed', night);
    });
    block.append(toggle);
  }

  if (rows.length < 2) {
    updateActiveSlide(block, 0);
    return;
  }

  const nav = document.createElement('div');
  nav.className = 'carousel-showcase-navigation-buttons';
  nav.innerHTML = `
    <button type="button" class="slide-prev" aria-label="${LABELS.prev}"></button>
    <button type="button" class="slide-next" aria-label="${LABELS.next}"></button>
  `;
  container.append(nav);

  const indicatorsNav = document.createElement('nav');
  indicatorsNav.setAttribute('aria-label', LABELS.controls);
  const indicators = document.createElement('ol');
  indicators.className = 'carousel-showcase-slide-indicators';
  rows.forEach((_, idx) => {
    const li = document.createElement('li');
    li.className = 'carousel-showcase-slide-indicator';
    li.innerHTML = `<button type="button" aria-label="${LABELS.show} ${idx + 1} ${LABELS.of} ${rows.length}"></button>`;
    li.querySelector('button').addEventListener('click', () => showSlide(block, idx));
    indicators.append(li);
  });
  indicatorsNav.append(indicators);
  block.append(indicatorsNav);

  nav.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  nav.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        updateActiveSlide(block, parseInt(entry.target.dataset.slideIndex, 10));
      }
    });
  }, { root: slides, threshold: 0.5 });
  slides.querySelectorAll('.carousel-showcase-slide').forEach((slide) => observer.observe(slide));
  updateActiveSlide(block, 0);
}
