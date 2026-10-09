/* eslint-disable */
/* global WebImporter */

/**
 * Nav document importer for JSW Motors (design source: drafts/jsw-nav/source.html).
 * Produces /jsw-nav as a standard EDS nav document (three flat sections):
 *   1. brand    — logo link
 *   2. sections — <ul> of primary links
 *   3. tools    — CTA link(s)
 * Pages opt in with the "nav" page metadata (/jsw-nav). Writes ONLY /jsw-nav.
 */

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

// keep URLs root-relative so they resolve on any host serving /drafts
function rootRelative(src) {
  try {
    const u = new URL(src, 'https://x');
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return src;
  }
}

function link(document, a, child) {
  const out = document.createElement('a');
  out.href = rootRelative(a.getAttribute('href'));
  out.append(child || document.createTextNode(clean(a.textContent)));
  return out;
}

function brand(document, src) {
  const section = document.createElement('div');
  const a = src.querySelector('a[href]');
  const img = src.querySelector('img');
  if (!a || !img) return section;
  const out = document.createElement('img');
  out.src = rootRelative(img.getAttribute('src'));
  out.alt = clean(img.getAttribute('alt'));
  const p = document.createElement('p');
  p.append(link(document, a, out));
  section.append(p);
  return section;
}

function sections(document, src) {
  const section = document.createElement('div');
  const ul = document.createElement('ul');
  src.querySelectorAll('li a[href]').forEach((a) => {
    const li = document.createElement('li');
    li.append(link(document, a));
    ul.append(li);
  });
  section.append(ul);
  return section;
}

function tools(document, src) {
  const section = document.createElement('div');
  src.querySelectorAll('a[href]').forEach((a) => {
    const p = document.createElement('p');
    p.append(link(document, a));
    section.append(p);
  });
  return section;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const main = document.createElement('main');
    main.append(brand(document, document.querySelector('.brand')));
    main.append(document.createElement('hr'));
    main.append(sections(document, document.querySelector('.sections')));
    main.append(document.createElement('hr'));
    main.append(tools(document, document.querySelector('.tools')));
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/jsw-nav',
      report: { title: 'JSW Motors navigation', template: 'nav' },
    }];
  },
};
