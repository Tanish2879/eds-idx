import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { token } from '../../scripts/utils/datalayer.js';

// P2.10.5 — only usage of this block today is the newsroom media kit strip
// (Photos/Videos/Brand kit). If it's reused for a different banner later,
// this needs a way to tell instances apart instead of tagging every one.
const LOCATION = 'media-kit';

// below this viewport width the mobile image (its own Figma crop) is used
const MOBILE_MEDIA = '(max-width: 599px)';

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const imageCells = cells.filter((c) => c.querySelector('img'));
  const headingCell = cells.find((c) => c.querySelector('h1, h2, h3, h4, h5, h6'))
    || cells.find((c) => !imageCells.includes(c) && !c.querySelector('a') && c.textContent.trim());
  const linksCell = cells.find((c) => c !== headingCell && c.querySelector('a'));

  const bg = document.createElement('div');
  bg.className = 'bg';
  const [img, mobileImg] = imageCells.map((c) => c.querySelector('img'));
  if (img) {
    // decorative image: empty alt
    const picture = createOptimizedPicture(img.src, '', false, [
      { media: '(min-width: 900px)', width: '3456' },
      { media: '(min-width: 600px)', width: '1200' },
      { width: '750' },
    ]);
    moveInstrumentation(img, picture.querySelector('img'));
    if (mobileImg) {
      // only the media-scoped <source>s are needed from the mobile picture
      const mobilePicture = createOptimizedPicture(mobileImg.src, '', false, [
        { media: MOBILE_MEDIA, width: '750' },
        { width: '750' },
      ]);
      picture.prepend(...mobilePicture.querySelectorAll('source[media]'));
    }
    bg.append(picture);
  }

  const content = document.createElement('div');
  content.className = 'content';

  if (headingCell) {
    const heading = headingCell.querySelector('h1, h2, h3, h4, h5, h6');
    const h1 = document.createElement('h1');
    if (heading) {
      moveInstrumentation(heading, h1);
      h1.innerHTML = heading.innerHTML;
    } else {
      h1.textContent = headingCell.textContent.trim();
    }
    content.append(h1);
  }

  const anchors = linksCell ? [...linksCell.querySelectorAll('a')] : [];
  if (anchors.length) {
    const nav = document.createElement('ul');
    nav.className = 'buttons';
    anchors.forEach((a, index) => {
      const li = document.createElement('li');
      a.removeAttribute('class');
      if (!a.dataset.cta) a.dataset.cta = `${LOCATION}:${token(a.textContent) || 'not-set'}:view`;
      a.dataset.ctaPosition = index + 1;
      li.append(a);
      nav.append(li);
    });
    content.append(nav);
  }

  block.replaceChildren(bg, content);

  // The strip is a short band, not a full-screen snap page: opt its section
  // out of section snap (runs after blocks are decorated) and size it to content.
  block.closest('.section')?.classList.add('no-snap');
}
