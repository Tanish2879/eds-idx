import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, applyArtDirection } from '../../scripts/scripts.js';

/*
 * Carousel Dealer: full-viewport slider of linked artwork images.
 * Each row is one slide:
 *   1. image (+ alt) - artwork, usually with the location name baked in;
 *      an optional second picture is portrait mobile artwork used below 600px
 *   2. link (+ link text) - the whole slide becomes clickable; the link text is
 *      kept for screen readers (e.g. "New Delhi Experience Centre - Know more")
 * Any extra text in the link cell is kept as visible slide content.
 */

const LABELS = {
  region: 'Carousel',
  controls: 'Carousel Slide Controls',
  prev: 'Previous Slide',
  next: 'Next Slide',
  show: 'Show Slide',
  of: 'of',
};

let carouselId = 0;

function updateActiveSlide(block, slideIndex) {
  block.dataset.activeSlide = slideIndex;
  block.querySelectorAll('.carousel-dealer-slide').forEach((slide, idx) => {
    const active = idx === slideIndex;
    slide.setAttribute('aria-hidden', !active);
    slide.querySelectorAll('a').forEach((link) => {
      if (active) link.removeAttribute('tabindex');
      else link.setAttribute('tabindex', '-1');
    });
  });
  block.querySelectorAll('.carousel-dealer-slide-indicator button').forEach((button, idx) => {
    if (idx === slideIndex) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function showSlide(block, slideIndex) {
  const slides = block.querySelectorAll('.carousel-dealer-slide');
  let index = slideIndex;
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  block.querySelector('.carousel-dealer-slides').scrollTo({
    top: 0,
    left: slides[index].offsetLeft,
    behavior: 'smooth',
  });
}

function createSlide(row, idx, id) {
  const slide = document.createElement('li');
  slide.className = 'carousel-dealer-slide';
  slide.dataset.slideIndex = idx;
  slide.id = `carousel-dealer-${id}-slide-${idx}`;
  moveInstrumentation(row, slide);

  [...row.children].forEach((cell) => {
    const img = cell.querySelector('picture > img');
    const hasText = cell.textContent.trim().length > 0;
    if (img && !slide.querySelector('.carousel-dealer-slide-image')) {
      const wrap = document.createElement('div');
      wrap.className = 'carousel-dealer-slide-image';
      const optimized = createOptimizedPicture(img.src, img.alt, idx === 0, [
        { media: '(min-width: 900px)', width: '1920' },
        { width: '900' },
      ]);
      moveInstrumentation(img, optimized.querySelector('img'));
      // optional portrait mobile artwork: second picture in the image cell
      const mobileImg = cell.querySelectorAll('picture > img')[1];
      if (mobileImg) {
        const mobile = createOptimizedPicture(mobileImg.src, mobileImg.alt, false, [
          { media: '(min-width: 900px)', width: '1920' },
          { width: '900' },
        ]);
        applyArtDirection(optimized, mobile, 600);
        wrap.classList.add('is-art-directed');
      }
      wrap.append(optimized);
      slide.append(wrap);
    }
    if (hasText || cell.querySelector('a')) {
      const content = document.createElement('div');
      content.className = 'carousel-dealer-slide-content';
      moveInstrumentation(cell, content);
      [...cell.childNodes].forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.querySelector('picture')) return;
        content.append(node);
      });
      slide.append(content);
    }
  });

  // whole-slide link: first link in the slide stretches over it
  const link = slide.querySelector('.carousel-dealer-slide-content a');
  if (link) {
    link.classList.add('carousel-dealer-slide-link');
    link.classList.remove('button');
    link.closest('.button-container')?.classList.remove('button-container');
    if (!link.textContent.trim()) {
      const alt = slide.querySelector('img')?.alt;
      if (alt) link.setAttribute('aria-label', alt);
    }
    slide.classList.add('has-link');
  }
  return slide;
}

export default function decorate(block) {
  carouselId += 1;
  const id = carouselId;
  block.id = `carousel-dealer-${id}`;
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', LABELS.region);

  const rows = [...block.children];
  const container = document.createElement('div');
  container.className = 'carousel-dealer-slides-container';
  const slides = document.createElement('ul');
  slides.className = 'carousel-dealer-slides';
  rows.forEach((row, idx) => slides.append(createSlide(row, idx, id)));
  container.append(slides);
  block.replaceChildren(container);

  if (rows.length < 2) {
    updateActiveSlide(block, 0);
    return;
  }

  const nav = document.createElement('div');
  nav.className = 'carousel-dealer-navigation-buttons';
  nav.innerHTML = `
    <button type="button" class="slide-prev" aria-label="${LABELS.prev}"></button>
    <button type="button" class="slide-next" aria-label="${LABELS.next}"></button>
  `;
  container.append(nav);

  const indicatorsNav = document.createElement('nav');
  indicatorsNav.setAttribute('aria-label', LABELS.controls);
  const indicators = document.createElement('ol');
  indicators.className = 'carousel-dealer-slide-indicators';
  rows.forEach((_, idx) => {
    const li = document.createElement('li');
    li.className = 'carousel-dealer-slide-indicator';
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
  slides.querySelectorAll('.carousel-dealer-slide').forEach((slide) => observer.observe(slide));
  updateActiveSlide(block, 0);
}
