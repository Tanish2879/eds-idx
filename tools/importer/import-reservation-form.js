/* eslint-disable */
/* global WebImporter */

/**
 * Importer for the /reservation-form page (design source: drafts/reservation-form/source.html).
 * Builds one reservation-form block with xwalk field hints + page metadata (no header, no footer).
 * Writes ONLY /reservation-form — no other page is created or modified.
 *
 * Block rows (every property in its own cell):
 *   1. image (+ alt)   2. heading   3. description   4. submitLabel   5. submitAction
 *   6. successMessage   7. disclaimer   8. privacyEmail (+ privacyEmailText)
 *   9. privacyLink (+ privacyLinkText)   10. amountLabel   11. amount   12. amountBadge
 *   13. amountNote   14. razorpayKeyId (public; empty, for the authors)   15. paymentService
 *   16. merchantName   17. successPage   18. failurePage
 *   (the contact email is its own mailto: link property: in a text field md2jcr keeps a link's URL
 *   instead of the text, and markdown turns an email address in a sentence into a link)
 *   then the items, each row starting with its component id (the block allows several child
 *   types: md2jcr picks the item's model by that first cell, and would otherwise read every item
 *   with the first allowed one): reservation-form-section | title,
 *   reservation-form-field | label | fieldName | required, or
 *   reservation-form-dropdown | label | fieldName | required | options (a multifield; left empty
 *   for the authors to fill)
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep media root-relative so they resolve on any host serving /drafts
function rootRelative(src) {
  try {
    const u = new URL(src, 'https://x');
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return src;
  }
}

function hinted(document, field, ...nodes) {
  const cell = document.createElement('div');
  cell.append(document.createComment(` field:${field} `), ...nodes);
  return cell;
}

function para(document, text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

// a text property: its value as a paragraph (an empty cell when there is none)
function textCell(document, field, value) {
  return value ? hinted(document, field, para(document, value)) : hinted(document, field);
}

// the component id cell that starts an item row
function idCell(document, id) {
  const cell = document.createElement('div');
  cell.textContent = id;
  return cell;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const src = document.querySelector('.reservation-form-source');
    const main = document.createElement('main');
    const value = (sel) => clean(src.querySelector(sel)?.textContent);

    const cells = [];
    // 1. image (alt text collapses into the image)
    const source = src.querySelector('img.image');
    const img = document.createElement('img');
    img.src = rootRelative(source.getAttribute('src'));
    img.alt = clean(source.getAttribute('alt'));
    cells.push([hinted(document, 'image', img)]);
    // 2–7. texts
    cells.push([textCell(document, 'heading', value('h1'))]);
    cells.push([textCell(document, 'description', value('.description'))]);
    cells.push([textCell(document, 'submitLabel', value('.submit'))]);
    cells.push([textCell(document, 'submitAction', value('.action'))]);
    cells.push([textCell(document, 'successMessage', value('.success'))]);
    cells.push([textCell(document, 'disclaimer', value('.disclaimer'))]);
    // 8. contact email: a mailto: link (its text collapses into it)
    const mail = src.querySelector('a.email');
    if (mail) {
      const a = document.createElement('a');
      a.href = mail.getAttribute('href');
      a.textContent = clean(mail.textContent);
      const p = document.createElement('p');
      p.append(a);
      cells.push([hinted(document, 'privacyEmail', p)]);
    } else cells.push([hinted(document, 'privacyEmail')]);
    // 9. privacy notice link (its text collapses into the link)
    const privacy = src.querySelector('a.privacy');
    if (privacy) {
      const a = document.createElement('a');
      a.href = rootRelative(privacy.getAttribute('href'));
      a.textContent = clean(privacy.textContent);
      const p = document.createElement('p');
      p.append(a);
      cells.push([hinted(document, 'privacyLink', p)]);
    } else cells.push([hinted(document, 'privacyLink')]);
    // 10–13. the price card
    cells.push([textCell(document, 'amountLabel', value('.amount-label'))]);
    cells.push([textCell(document, 'amount', value('.amount'))]);
    cells.push([textCell(document, 'amountBadge', value('.amount-badge'))]);
    cells.push([textCell(document, 'amountNote', value('.amount-note'))]);
    // 14–18. payment: Key ID (public), payment service URL, name in the payment window, the
    // pages after a successful / failed payment (links)
    cells.push([textCell(document, 'razorpayKeyId', value('.razorpay-key'))]);
    cells.push([textCell(document, 'paymentService', value('.payment-service'))]);
    cells.push([textCell(document, 'merchantName', value('.merchant'))]);
    ['success', 'failure'].forEach((kind) => {
      const page = src.querySelector(`a.${kind}-page`);
      if (!page) {
        cells.push([hinted(document, `${kind}Page`)]);
        return;
      }
      const a = document.createElement('a');
      a.href = rootRelative(page.getAttribute('href'));
      a.textContent = rootRelative(page.getAttribute('href'));
      const p = document.createElement('p');
      p.append(a);
      cells.push([hinted(document, `${kind}Page`, p)]);
    });

    // items, in order
    src.querySelectorAll('.item').forEach((item) => {
      if (item.classList.contains('section')) {
        cells.push([idCell(document, 'reservation-form-section'), textCell(document, 'title', clean(item.textContent))]);
        return;
      }
      const label = clean([...item.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
      const common = [
        textCell(document, 'label', label),
        textCell(document, 'fieldName', item.dataset.name || ''),
        textCell(document, 'required', item.dataset.required === 'true' ? 'true' : 'false'),
      ];
      if (item.classList.contains('dropdown')) {
        // options: any listed in the source (none: the authors add them in the editor)
        const options = [...item.querySelectorAll('li')].map((li) => clean(li.textContent)).join(', ');
        cells.push([idCell(document, 'reservation-form-dropdown'), ...common, textCell(document, 'options', options)]);
      } else cells.push([idCell(document, 'reservation-form-field'), ...common]);
    });
    main.append(WebImporter.Blocks.createBlock(document, { name: 'reservation-form', cells }));

    main.append(WebImporter.Blocks.getMetadataBlock(document, {
      Title: clean(document.title),
      Description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
      // the design has no header and no footer
      nav: clean(document.querySelector('meta[name="nav"]')?.getAttribute('content')),
      footer: clean(document.querySelector('meta[name="footer"]')?.getAttribute('content')),
    }));

    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/reservation-form',
      report: { title: document.title, template: 'reservation-form', blocks: ['reservation-form'] },
    }];
  },
};
