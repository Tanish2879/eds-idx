import { loadCSS } from '../../scripts/aem.js';

/**
 * Style classes as their Style values: content converted for the editor from an import keeps a
 * hyphenated value only as words ("reach us", "reach us,photo"), and an imported page's local
 * markup joins a two-class value with a hyphen ("reach-us-photo"). Both get "reach-us" (+ "photo").
 * @param {Element} block The columns block
 */
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

  // setup image columns
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });

  // Thank-you variant: class the two structural columns so the CSS targets
  // classes instead of fragile positional selectors (div:first-child /
  // :last-child). Scoped to the variant, so default Columns is unaffected.
  if (block.classList.contains('thank-you')) {
    [...block.children].forEach((row) => {
      const [media, content] = row.children;
      if (media) media.classList.add('ty-media');
      if (!content) return;
      content.classList.add('ty-content');

      // Class the title, text and CTA so their styles apply whatever heading
      // level (Title component h1–h6) or Button type the author picks.
      const title = content.querySelector('h1, h2, h3, h4, h5, h6');
      title?.classList.add('ty-title');
      // CTA: the core Button component (renders a.button / .button-container),
      // else a rich-text link that sits alone in its paragraph — never an
      // inline link inside the subtext
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
      // subtext: the first paragraph after the title that isn't the CTA or the icon
      // (it may contain inline links)
      const text = [...content.querySelectorAll('.ty-title ~ p')]
        .find((p) => p !== ctaWrap && p.textContent.trim() && !p.querySelector('picture'));
      text?.classList.add('ty-text');
    });
  }

  // Reach Us variant (Contact Us page): its CSS/JS are fetched only when the
  // variant is used, so regular Columns pages don't pay for them. Awaited, so
  // the section is shown already styled.
  if (block.classList.contains('reach-us')) {
    const [, { default: decorateReachUs }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-reach-us.css`),
      import('./columns-reach-us.js'),
    ]);
    decorateReachUs(block);

    // Reach Us (Photo), the Style value "reach-us photo": the same layout over a dark photo
    // (and optional film) backdrop; fetched only when both classes are present
    if (block.classList.contains('photo')) {
      const [, { default: decorateReachUsPhoto }] = await Promise.all([
        loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-reach-us-photo.css`),
        import('./columns-reach-us-photo.js'),
      ]);
      decorateReachUsPhoto(block);
    }
  }

  // Split style: two video panes side by side (and an optional film card); likewise fetched
  // only when used
  if (block.classList.contains('split')) {
    const [, { default: decorateSplit }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/columns/columns-split.css`),
      import('./columns-split.js'),
    ]);
    decorateSplit(block);
  }
}
