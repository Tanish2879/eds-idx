const isWhatsApp = (a) => /wa\.me|whatsapp\.com/i.test(a.href) || /whatsapp/i.test(a.textContent);

/**
 * Authors only link the brochure PDF (e.g. "Save to device" → the PDF in DAM). From it:
 * - the WhatsApp link becomes a share link, `https://wa.me/?text=<page title> brochure: <PDF
 *   address>`, opening WhatsApp (the app on phones, WhatsApp Web on desktop) in a new tab with
 *   that message ready to send; a WhatsApp link already authored with its own `?text=` is kept
 * - the PDF link downloads the file instead of opening it (browsers honour this for files on
 *   the site's own domain)
 * Without a PDF link, the links stay as authored.
 * @param {Element} links the links paragraph
 */
function wireLinks(links) {
  const anchors = [...links.querySelectorAll('a[href]')];
  const pdf = anchors.find((a) => !isWhatsApp(a) && /\.pdf$/i.test(new URL(a.href).pathname));
  if (!pdf) return;
  pdf.setAttribute('download', decodeURIComponent(new URL(pdf.href).pathname.split('/').pop()));
  anchors.filter(isWhatsApp).forEach((a) => {
    if (!new URL(a.href).searchParams.has('text')) {
      const title = document.title.trim();
      const message = `${title ? `${title} brochure` : 'Brochure'}: ${pdf.href}`;
      a.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
    }
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

/**
 * Brochure links in default content: a paragraph of links (e.g. "Send on WhatsApp", "Save to
 * device") followed by a paragraph without any (its label, e.g. "Download the brochure")
 * become a disclosure button, the label, showing the links. Anything else is left as authored.
 * Classes added: `.brochure` (and `.is-open` while shown) on `content`, `.brochure-links` on the
 * links paragraph, `.brochure-label` on the label paragraph, `.brochure-toggle` on the button.
 * The links are wired from the PDF (see wireLinks).
 * @param {Element} content a default content wrapper
 * @param {string} id the id given to the links paragraph, if it has none
 * @returns {boolean} whether the links were found and decorated
 */
export default function decorateBrochure(content, id) {
  const label = [...content.children].find((el) => el.matches('p:not(:has(a))')
    && el.previousElementSibling?.matches('p:has(a)'));
  if (!label) return false;
  const links = label.previousElementSibling;
  links.id = links.id || id;
  links.classList.add('brochure-links');
  wireLinks(links);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'brochure-toggle';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', links.id);
  btn.append(...label.childNodes);
  label.replaceChildren(btn);
  label.classList.add('brochure-label');
  content.classList.add('brochure');

  const toggle = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    content.classList.toggle('is-open', open);
  };
  btn.addEventListener('click', () => toggle(btn.getAttribute('aria-expanded') !== 'true'));
  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !content.classList.contains('is-open')) return;
    toggle(false);
    btn.focus();
  });
  content.addEventListener('focusout', (e) => {
    if (!content.contains(e.relatedTarget)) toggle(false);
  });
  document.addEventListener('click', (e) => {
    if (!content.contains(e.target)) toggle(false);
  });
  return true;
}
