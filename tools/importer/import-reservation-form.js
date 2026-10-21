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
 *   9. privacyLink (+ privacyLinkText)
 *   (the contact email is its own mailto: link property: in a text field md2jcr keeps a link's URL
 *   instead of the text, and markdown turns an email address in a sentence into a link)
 *   then the items, each row starting with its component id (the block allows two child types:
 *   md2jcr picks the item's model by that first cell, and would otherwise read every item with the
 *   first allowed one): reservation-form-section | title, or reservation-form-field | label | fieldName |
 *   control | required | width | prefix | options
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

    // items, in order
    src.querySelectorAll('.item').forEach((item) => {
      if (item.classList.contains('section')) {
        cells.push([idCell(document, 'reservation-form-section'), textCell(document, 'title', clean(item.textContent))]);
        return;
      }
      // (a textarea holds one value: the options as one comma-separated paragraph)
      const options = [...item.querySelectorAll('li')].map((li) => clean(li.textContent)).join(', ');
      const label = clean([...item.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
      cells.push([
        idCell(document, 'reservation-form-field'),
        textCell(document, 'label', label),
        textCell(document, 'fieldName', item.dataset.name || ''),
        textCell(document, 'control', item.dataset.type || 'text'),
        textCell(document, 'required', item.dataset.required === 'true' ? 'true' : 'false'),
        textCell(document, 'width', item.dataset.width || 'full'),
        textCell(document, 'prefix', item.dataset.prefix || ''),
        textCell(document, 'options', options),
      ]);
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
