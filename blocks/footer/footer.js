/*
 * Footer: logo + newsletter form, link columns (accordions on mobile), legal row, social icons.
 * Content comes from the footer fragment (flat sections):
 *   brand      — section with the logo image
 *   newsletter — <p><strong> heading, then placeholder <p>, button label <p>, consent <p>
 *   columns    — repeated <p><strong> title + <ul> of links
 *   legal      — plain <p> (copyright) + <ul> of links
 *   social     — section with only a <ul> of links (label = network name)
 * Pages pick their footer document with the "footer" metadata (a path), or hide the footer
 * with "off" (e.g. designs that have no footer yet); without it the site default /footer is used.
 */

import { getPageMetadata } from '../../scripts/scripts.js';

const DESKTOP = window.matchMedia('(width >= 900px)');
const FOOTER_OFF = ['off', 'none', 'hidden'];
let footerId = 0;

async function fetchFooter(meta) {
  const path = meta ? new URL(meta, window.location).pathname.replace(/(\.plain)?\.html$/, '') : '/footer';
  // /content first (local preview), then site root (DA/EDS)
  let resp = await fetch(`/content${path}.plain.html`);
  if (!resp.ok) resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = await resp.text();
  return tmp;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  children.flat().forEach((c) => { if (c) node.append(c); });
  return node;
}

function isBold(node) {
  return node && node.tagName === 'P' && node.children.length === 1
    && node.firstElementChild.tagName === 'STRONG'
    && node.textContent.trim() === node.firstElementChild.textContent.trim();
}

function classify(sections) {
  const out = {};
  sections.forEach((s) => {
    const kids = [...s.children];
    if (s.querySelector('img') && !out.brand) out.brand = s;
    else if (isBold(kids[0]) && !s.querySelector('ul')) out.newsletter = s;
    else if (kids.some(isBold) && s.querySelector('ul')) out.columns = s;
    else if (kids[0] && kids[0].tagName === 'P' && s.querySelector('ul')) out.legal = s;
    else if (kids.length === 1 && kids[0].tagName === 'UL') out.social = s;
  });
  return out;
}

function buildBrand(section) {
  const a = section.querySelector('a');
  const img = section.querySelector('img');
  const link = el('a', { href: a ? a.getAttribute('href') : '/', class: 'footer-logo' });
  if (img) {
    link.append(el('img', {
      src: img.getAttribute('src'), alt: img.getAttribute('alt') || '', width: 206, height: 28, loading: 'lazy',
    }));
  }
  return link;
}

function buildNewsletter(section, uid) {
  const [heading, placeholder, buttonLabel, consent] = [...section.children];
  const form = el('form', { class: 'footer-newsletter', novalidate: '' });
  if (heading) form.append(el('p', { class: 'footer-newsletter-title', id: `${uid}-nl-title` }, heading.textContent.trim()));
  const input = el('input', {
    type: 'email', name: 'email', required: '', autocomplete: 'email', placeholder: placeholder ? placeholder.textContent.trim() : '', 'aria-labelledby': `${uid}-nl-title`,
  });
  const submit = el('button', { type: 'submit', class: 'footer-newsletter-submit' }, el('span', {}, buttonLabel ? buttonLabel.textContent.trim() : ''));
  form.append(el('div', { class: 'footer-newsletter-row' }, input, submit));
  if (consent) {
    const box = el('input', { type: 'checkbox', name: 'consent', required: '' });
    const label = el('label', { class: 'footer-newsletter-consent' }, box, el('span', {}, ...[...consent.childNodes].map((n) => n.cloneNode(true))));
    form.append(label);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    // no subscription backend in this project yet: hand the data to an integration
    form.dispatchEvent(new CustomEvent('footer:newsletter-submit', { bubbles: true, detail: { email: input.value } }));
  });
  return form;
}

function buildColumns(section, uid) {
  const wrap = el('div', { class: 'footer-columns' });
  const kids = [...section.children];
  let colIdx = 0;
  kids.forEach((node, i) => {
    if (!isBold(node)) return;
    const list = kids[i + 1] && kids[i + 1].tagName === 'UL' ? kids[i + 1] : el('ul');
    const listId = `${uid}-col-${colIdx}`;
    const toggle = el('button', {
      type: 'button', class: 'footer-column-toggle', 'aria-expanded': colIdx === 0 ? 'true' : 'false', 'aria-controls': listId,
    }, node.textContent.trim());
    const ul = list.cloneNode(true);
    ul.id = listId;
    ul.classList.add('footer-column-links');
    toggle.addEventListener('click', () => {
      if (DESKTOP.matches) return;
      toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') !== 'true');
    });
    wrap.append(el('div', { class: 'footer-column' }, el('p', { class: 'footer-column-title' }, toggle), ul));
    colIdx += 1;
  });
  return wrap;
}

function buildLegal(section) {
  const legal = el('div', { class: 'footer-legal' });
  const copy = section.querySelector(':scope > p');
  if (copy) legal.append(el('p', { class: 'footer-copyright' }, copy.textContent.trim()));
  const ul = section.querySelector('ul');
  if (ul) legal.append(ul.cloneNode(true));
  return legal;
}

function buildSocial(section) {
  const ul = el('ul', { class: 'footer-social' });
  section.querySelectorAll('a').forEach((a) => {
    const label = a.textContent.trim();
    const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const icon = el('span', { class: `footer-social-icon icon-${name}`, 'aria-hidden': 'true' });
    icon.style.setProperty('--footer-icon', `url("${window.hlx.codeBasePath}/icons/${name}.svg")`);
    ul.append(el('li', {}, el('a', {
      href: a.getAttribute('href'), 'aria-label': label, target: '_blank', rel: 'noopener',
    }, icon)));
  });
  return ul;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const meta = getPageMetadata('footer');
  if (FOOTER_OFF.includes(meta.toLowerCase())) {
    block.textContent = '';
    block.closest('footer')?.setAttribute('hidden', '');
    return;
  }
  const fragment = await fetchFooter(meta);
  block.textContent = '';
  if (!fragment) return;
  footerId += 1;
  const uid = `footer-${footerId}`;
  const sections = [...fragment.children].filter((c) => c.tagName === 'DIV' && c.children.length);
  const {
    brand, newsletter, columns, legal, social,
  } = classify(sections);

  const inner = el('div', { class: 'footer-inner' });
  if (brand) inner.append(el('div', { class: 'footer-brand' }, buildBrand(brand)));
  if (newsletter) inner.append(el('div', { class: 'footer-form' }, buildNewsletter(newsletter, uid)));
  if (columns) inner.append(buildColumns(columns, uid));
  inner.append(el('div', { class: 'footer-divider', role: 'presentation' }));
  const bottom = el('div', { class: 'footer-bottom' });
  if (legal) bottom.append(buildLegal(legal));
  if (social) bottom.append(buildSocial(social));
  inner.append(bottom);
  block.append(inner);
}
