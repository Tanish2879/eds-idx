import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Cards Timeline: horizontally scrolling timeline of milestone cards.
 * Each row is one card:
 *   1. image
 *   2. text: year (first short paragraph, e.g. "1924"), title (heading),
 *      description (remaining paragraphs)
 * The card closest to the centre of the track is marked active (enlarged).
 * The title becomes a toggle that reveals the description over the image.
 * A tick scale below the track shows one major tick per card; clicking a
 * tick scrolls that card into the centre.
 */

const YEAR_PATTERN = /^\s*\d{3,4}s?\s*$/;
let timelineId = 0;

function extractYear(body) {
  const candidate = [...body.children].find((el) => el.tagName === 'P' && YEAR_PATTERN.test(el.textContent));
  if (!candidate) return null;
  const year = document.createElement('p');
  year.className = 'cards-timeline-year';
  year.textContent = candidate.textContent.trim();
  candidate.remove();
  return year;
}

function buildTitleToggle(body, id) {
  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  const description = [...body.children].filter((el) => el !== heading);
  if (!heading) return;

  heading.classList.add('cards-timeline-title');
  if (!description.length) return;

  const panel = document.createElement('div');
  panel.className = 'cards-timeline-description';
  panel.id = `${id}-description`;
  panel.hidden = true;
  panel.append(...description);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cards-timeline-toggle';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panel.id);
  button.append(...heading.childNodes);
  heading.append(button);
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', open);
    panel.hidden = !open;
  });
  body.append(panel);
}

function setActive(block, index) {
  block.querySelectorAll('.cards-timeline-item').forEach((item, idx) => {
    item.classList.toggle('is-active', idx === index);
  });
  block.querySelectorAll('.cards-timeline-tick').forEach((tick, idx) => {
    if (idx === index) tick.setAttribute('aria-current', 'true');
    else tick.removeAttribute('aria-current');
  });
}

function scrollToItem(track, item) {
  track.scrollTo({
    left: item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2,
    behavior: 'smooth',
  });
}

export default function decorate(block) {
  timelineId += 1;
  const blockId = `cards-timeline-${timelineId}`;

  const track = document.createElement('ul');
  track.className = 'cards-timeline-track';

  [...block.children].forEach((row, idx) => {
    const li = document.createElement('li');
    li.className = 'cards-timeline-item';
    li.dataset.index = idx;
    moveInstrumentation(row, li);

    const card = document.createElement('div');
    card.className = 'cards-timeline-card';
    let year = null;

    [...row.children].forEach((cell) => {
      const img = cell.querySelector('picture > img');
      if (img && !cell.textContent.trim()) {
        cell.className = 'cards-timeline-card-image';
        const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
        moveInstrumentation(img, optimized.querySelector('img'));
        img.closest('picture').replaceWith(optimized);
        card.append(cell);
      } else if (cell.textContent.trim()) {
        cell.className = 'cards-timeline-card-body';
        year = year || extractYear(cell);
        buildTitleToggle(cell, `${blockId}-item-${idx}`);
        card.append(cell);
      }
    });

    if (year) li.append(year);
    li.append(card);
    track.append(li);
  });

  const items = [...track.children];
  const scale = document.createElement('div');
  scale.className = 'cards-timeline-scale';
  const ticks = document.createElement('ol');
  ticks.className = 'cards-timeline-ticks';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'cards-timeline-tick';
    const year = item.querySelector('.cards-timeline-year')?.textContent;
    tick.setAttribute('aria-label', `Show ${year || `item ${idx + 1}`}`);
    tick.addEventListener('click', () => scrollToItem(track, item));
    li.append(tick);
    ticks.append(li);
  });
  scale.append(ticks);

  block.replaceChildren(track, scale);
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setActive(block, parseInt(entry.target.dataset.index, 10));
    });
  }, { root: track, rootMargin: '0px -45% 0px -45%', threshold: 0 });
  items.forEach((item) => observer.observe(item));
  setActive(block, 0);
}
