/* eslint-disable */
/* global WebImporter */

/**
 * Footer fragment importer for MG Select (source: homepage footer).
 * Produces /footer as flat, semantic sections (no classes, no form controls):
 *   1. brand      — logo link
 *   2. newsletter — <p><strong> heading, placeholder <p>, button label <p>,
 *                   consent <p> (with policy link); footer.js builds the form
 *   3. links      — per column: <p><strong> title + <ul> of links
 *   4. legal      — copyright <p> + <ul> of legal links
 *   5. social     — <ul> of social links (label = network name)
 */

const ORIGIN = 'https://www.mgselect.co.in';

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

function relHref(href) {
  if (!href) return '';
  return href.startsWith(ORIGIN) ? href.slice(ORIGIN.length) || '/' : href;
}

function el(doc, tag, attrs = {}, children = []) {
  const e = doc.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v) e.setAttribute(k, v); });
  children.forEach((c) => e.append(typeof c === 'string' ? doc.createTextNode(c) : c));
  return e;
}

function bold(doc, text) {
  return el(doc, 'p', {}, [el(doc, 'strong', {}, [text])]);
}

function linkList(doc, anchors, labelFn) {
  const ul = doc.createElement('ul');
  anchors.forEach((a) => {
    const href = relHref(a.getAttribute('href'));
    const label = labelFn ? labelFn(a) : clean(a.textContent);
    if (href && label) ul.append(el(doc, 'li', {}, [el(doc, 'a', { href }, [label])]));
  });
  return ul;
}

// social links have icon-only markup; name them after the network's host
function networkName(a) {
  const host = new URL(a.getAttribute('href'), ORIGIN).hostname.replace(/^www\./, '');
  const known = { 'instagram.com': 'Instagram', 'x.com': 'X', 'twitter.com': 'X', 'linkedin.com': 'LinkedIn', 'facebook.com': 'Facebook', 'youtube.com': 'YouTube' };
  return clean(a.getAttribute('aria-label')) || known[host] || host.split('.')[0];
}

function buildFooter(document) {
  const footer = document.querySelector('footer.mg-select__footer');
  const sections = [];

  // 1. brand
  const brand = document.createElement('div');
  const logoLink = footer.querySelector('.footer__logo a');
  const logo = logoLink && logoLink.querySelector('img');
  if (logo) {
    brand.append(el(document, 'p', {}, [el(document, 'a', { href: relHref(logoLink.getAttribute('href')) || '/' }, [
      el(document, 'img', { src: logo.getAttribute('src'), alt: clean(logo.getAttribute('alt')) || 'MG Select' }),
    ])]));
  }
  sections.push(brand);

  // 2. newsletter copy (controls are built by footer.js)
  const form = footer.querySelector('form.newsletter__form');
  if (form) {
    const sec = document.createElement('div');
    const heading = form.querySelector('.newsletter__form--heading');
    if (heading) sec.append(bold(document, clean(heading.textContent)));
    const email = form.querySelector('input[type="email"], input.newsletter__form-input:not([type="checkbox"])');
    if (email && email.getAttribute('placeholder')) sec.append(el(document, 'p', {}, [clean(email.getAttribute('placeholder'))]));
    const submit = form.querySelector('.newsletter__form-submit');
    const submitLabel = clean(submit && submit.textContent) || 'SIGN UP';
    sec.append(el(document, 'p', {}, [submitLabel]));
    const label = form.querySelector('.newsletter__form-label');
    if (label) {
      // walk every text node; text inside a link becomes that link (once)
      const p = document.createElement('p');
      const added = new Set();
      const walker = document.createTreeWalker(label, 4);
      let n = walker.nextNode();
      while (n) {
        const text = clean(n.textContent);
        const a = n.parentElement && n.parentElement.closest('a[href]');
        if (a && label.contains(a)) {
          if (!added.has(a)) {
            added.add(a);
            p.append(el(document, 'a', { href: relHref(a.getAttribute('href')) }, [clean(a.textContent)]));
          }
        } else if (text) {
          p.append(document.createTextNode(`${text} `));
        }
        n = walker.nextNode();
      }
      sec.append(p);
    }
    sections.push(sec);
  }

  // 3. link columns
  const cols = document.createElement('div');
  footer.querySelectorAll('.footer__navigation--content').forEach((list) => {
    const col = list.parentElement;
    const title = col.querySelector(':scope > div:first-child');
    if (title) cols.append(bold(document, clean(title.textContent)));
    cols.append(linkList(document, [...list.querySelectorAll('a[href]')]));
  });
  sections.push(cols);

  // 4. legal
  const legal = document.createElement('div');
  const legalWrap = footer.querySelector('.footer__legal');
  if (legalWrap) {
    const copy = legalWrap.querySelector(':scope > div');
    if (copy) legal.append(el(document, 'p', {}, [clean(copy.textContent)]));
    legal.append(linkList(document, [...legalWrap.querySelectorAll(':scope > a[href]')]));
  }
  sections.push(legal);

  // 5. social
  const social = document.createElement('div');
  social.append(linkList(document, [...footer.querySelectorAll('.footer__social a[href]')], networkName));
  sections.push(social);

  return sections;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const sections = buildFooter(document);
    const main = document.createElement('main');
    sections.forEach((s, i) => {
      if (i > 0) main.append(document.createElement('hr'));
      main.append(s);
    });
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/footer',
      report: { title: 'footer', sections: sections.length },
    }];
  },
};
