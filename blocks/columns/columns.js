import { loadCSS } from '../../scripts/aem.js';

// imports yield "reach us", "reach us,photo" or "reach-us-photo"; map them to reach-us (+ photo)
function normalizeStyleClasses(block) {
  const { classList } = block;
  [...classList].forEach((c) => {
    if (c.includes(',')) c.split(',').filter(Boolean).forEach((part) => classList.add(part));
  });
  if (classList.contains('reach-us-photo')) classList.add('reach-us', 'photo');
  if (classList.contains('reach') && classList.contains('us')) classList.add('reach-us');
}

export default async function decorate(block) {
  normalizeStyleClasses(block);
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });

  // Thank-you: class the columns so CSS avoids fragile positional selectors
  if (block.classList.contains('thank-you')) {
    [...block.children].forEach((row) => {
      const [media, content] = row.children;
      if (media) media.classList.add('ty-media');
      if (!content) return;
      content.classList.add('ty-content');

      // classed so styles apply whatever heading level or Button type the author picks
      const title = content.querySelector('h1, h2, h3, h4, h5, h6');
      title?.classList.add('ty-title');
      // CTA: a Button component, else a link alone in its paragraph (never an inline subtext link)
      const cta = content.querySelector('.button-container a[href], a.button[href]')
        || [...content.querySelectorAll('p a[href]')]
          .filter((a) => a.closest('p').textContent.trim() === a.textContent.trim())
          .pop();
      const ctaWrap = cta?.closest('p');
      if (cta) {
        // a "default"-type Button or plain link still renders as the solid CTA
        cta.classList.add('button', 'primary', 'ty-cta');
        ctaWrap?.classList.add('button-wrapper');
      }
      // subtext: first paragraph after the title that isn't the CTA or the icon
      const text = [...content.querySelectorAll('.ty-title ~ p')]
        .find((p) => p !== ctaWrap && p.textContent.trim() && !p.querySelector('picture'));
      text?.classList.add('ty-text');
    });
  }

  // variant CSS/JS load only when used; awaited so the section shows already styled
  if (block.classList.contains('reach-us')) {
    const [, { default: decorateReachUs }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-reach-us.css`),
      import('./columns-reach-us.js'),
    ]);
    decorateReachUs(block);

    // Reach Us (Photo) ("reach-us photo"): same layout over a photo/film backdrop
    if (block.classList.contains('photo')) {
      const [, { default: decorateReachUsPhoto }] = await Promise.all([
        loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-reach-us-photo.css`),
        import('./columns-reach-us-photo.js'),
      ]);
      decorateReachUsPhoto(block);
    }
  }

  if (block.classList.contains('split')) {
    const [, { default: decorateSplit }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-split.css`),
      import('./columns-split.js'),
    ]);
    decorateSplit(block);
  }
}
