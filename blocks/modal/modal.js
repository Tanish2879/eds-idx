import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';

// html class read by section-snap.js (navOpen) and styles.css to hold the page still
const OPEN_CLASS = 'is-modal-open';

let idCounter = 0;

/**
 * Builds a modal around the given content and adds it to the page (not yet shown).
 * @param {Node[]} contentNodes The nodes to show inside the modal
 * @returns {Promise<{block: HTMLElement, showModal: Function}>} showModal(opener?) opens it;
 *   focus returns to `opener` (default: the focused element) on close
 */
export async function createModal(contentNodes) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1; // can take the focus when it opens, but is not a tab stop

  const content = document.createElement('div');
  content.className = 'modal-content';
  content.append(...contentNodes);

  // name the dialog after its first heading, if it has one
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    idCounter += 1;
    if (!heading.id) heading.id = `modal-title-${idCounter}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  } else {
    dialog.setAttribute('aria-label', 'Dialog');
  }

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'close-button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML = '<span class="close-icon" aria-hidden="true"></span>';

  dialog.append(closeButton, content);
  // a modal page whose section has the Side Panel style opens as a sheet from the right
  const side = !!content.querySelector('.section.side-panel');
  if (side) dialog.classList.add('side-panel');

  // a side panel slides back out before it closes (modal.css .is-closing); anything else,
  // or with reduced motion, closes at once
  const requestClose = () => {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    if (!side || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      dialog.close();
      return;
    }
    dialog.classList.add('is-closing');
    const done = () => {
      dialog.classList.remove('is-closing');
      if (dialog.open) dialog.close();
    };
    dialog.addEventListener('animationend', (e) => { if (e.target === dialog) done(); });
    window.setTimeout(done, 800); // in case the animation doesn't run
  };
  closeButton.addEventListener('click', requestClose);
  // Escape: animate the side panel out instead of the instant native close
  dialog.addEventListener('cancel', (e) => {
    if (!side) return;
    e.preventDefault();
    requestClose();
  });

  // a click on the dialog itself (not its content) is a click on the backdrop
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) requestClose();
  });

  const block = buildBlock('modal', '');
  block.replaceChildren(dialog);
  // inside main so the global main/button styles and click tracking apply;
  // loadBlock brings in modal.css before the dialog is shown
  document.querySelector('main').append(block);
  decorateBlock(block);
  await loadBlock(block);
  // decorateBlock tags the parent (main) as the block's wrapper; main is not a wrapper here
  block.parentElement?.classList.remove('modal-wrapper');

  let opener = null;

  // Escape fires `cancel` then `close`; the close button and backdrop fire `close`
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove(OPEN_CLASS);
    block.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });

  const showModal = (trigger) => {
    const active = document.activeElement;
    opener = trigger || (active instanceof HTMLElement && active !== document.body ? active : null);
    document.documentElement.classList.add(OPEN_CLASS);
    // native modal: focus moves inside, the rest of the page is inert, Escape closes
    dialog.showModal();
    // the dialog itself takes the focus, not the first control (the close button): iOS drew
    // its focus ring on the (X) at open. Tab then reaches the close button first
    dialog.focus({ preventScroll: true });
    content.scrollTop = 0;
  };

  return { block, showModal };
}

/**
 * Loads a modal page (fragment) and opens it. A page on another site, or one that
 * can't be loaded, is followed as a normal link instead.
 * @param {string} fragmentUrl The URL or path of the modal page
 * @param {HTMLElement} [trigger] The element that opened it (gets focus back on close)
 */
export async function openModal(fragmentUrl, trigger) {
  const url = new URL(fragmentUrl, window.location.href);
  const fallback = () => window.location.assign(url.href);
  if (url.origin !== window.location.origin) {
    fallback();
    return;
  }

  try {
    // eslint-disable-next-line import/no-cycle
    const { loadFragment } = await import('../fragment/fragment.js');
    const fragment = await loadFragment(url.pathname);
    if (!fragment) {
      fallback();
      return;
    }
    const { showModal } = await createModal([...fragment.childNodes]);
    showModal(trigger);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('modal failed to open', err);
    fallback();
  }
}

/**
 * The modal is opened from links, never placed on a page; an authored one renders nothing.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  if (!block.querySelector('dialog')) block.replaceChildren();
}
