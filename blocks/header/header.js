/*
 * Header: transparent overlay bar (logo + menu toggle) that opens a tabbed menu panel.
 * Content comes from the nav fragment (flat sections):
 *   1. brand  — logo link(s): first = light variant, second = dark variant
 *   2. tools  — utility link(s) shown in the open panel (e.g. showroom locator)
 *   tabs      — sections whose first <p><strong> is the tab label; each later
 *               <p><strong> starts a group (optional subtitle <p>, description <p>,
 *               image, <ul> of links); a bold link is a direct-link group
 *   last      — section with only a <ul> of links → floating sticky CTAs
 * A standard nav document without tabs (brand | sections <ul> | tools links) renders as a
 * floating pill bar instead. Pages pick their nav document with the "nav" metadata
 * (e.g. /jsw-nav); without it the site default /nav is used.
 */

import { getPageMetadata } from '../../scripts/scripts.js';

const DESKTOP = window.matchMedia('(width >= 900px)');
const PILL_DESKTOP = window.matchMedia('(width >= 768px)');
let headerId = 0;

function navPath() {
  const meta = getPageMetadata('nav');
  if (!meta) return '/nav';
  return new URL(meta, window.location).pathname.replace(/(\.plain)?\.html$/, '');
}

async function fetchNav() {
  const path = navPath();
  // /content first (local preview), then site root (AEM/EDS), then a copy kept in the repo at
  // /drafts/<nav path>/nav.html, used while the nav document isn't published in AEM yet
  // (a plain .html file: the live site never serves *.plain.html from the repository)
  let resp = await fetch(`/content${path}.plain.html`);
  if (!resp.ok) resp = await fetch(`${path}.plain.html`);
  if (!resp.ok && path !== '/nav') resp = await fetch(`/drafts${path}/nav.html`);
  if (!resp.ok) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = await resp.text();
  return tmp;
}

function isBoldParagraph(node) {
  return node.tagName === 'P' && node.children.length === 1
    && node.firstElementChild.tagName === 'STRONG'
    && node.textContent.trim() === node.firstElementChild.textContent.trim();
}

function classify(sections) {
  const result = {
    brand: null, tools: [], tabs: [], sticky: null,
  };
  sections.forEach((section, idx) => {
    const first = section.firstElementChild;
    if (idx === 0) result.brand = section;
    else if (first && isBoldParagraph(first)) result.tabs.push(section);
    else if (section.querySelector('img')) result.tools.push(section);
    else if (section.querySelector('ul a')) result.sticky = section;
  });
  return result;
}

function parseTab(section) {
  const children = [...section.children];
  const label = children.shift().textContent.trim();
  const groups = [];
  let current = null;
  children.forEach((node) => {
    if (isBoldParagraph(node)) {
      const link = node.querySelector('a');
      current = {
        label: node.textContent.trim(),
        link,
        subtitle: null,
        description: [],
        picture: null,
        links: [],
      };
      groups.push(current);
      return;
    }
    if (!current) return;
    if (node.tagName === 'UL') {
      current.links.push(...node.querySelectorAll('a'));
    } else if (node.querySelector('picture, img')) {
      current.picture = node.querySelector('picture') || node.querySelector('img');
    } else if (node.tagName === 'P' && node.textContent.trim()) {
      // the first plain paragraph right after the label is its subtitle (e.g. price)
      const empty = !current.description.length && !current.links.length && !current.picture;
      if (!current.subtitle && empty) {
        current.subtitle = node.textContent.trim();
      } else {
        current.description.push(node.textContent.trim());
      }
    }
  });
  // a single paragraph with no other detail content is a description, not a subtitle
  groups.forEach((g) => {
    if (g.subtitle && !g.description.length && !g.picture) {
      g.description.push(g.subtitle);
      g.subtitle = null;
    }
  });
  return { label, groups };
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  children.flat().forEach((c) => { if (c) node.append(c); });
  return node;
}

function cloneLink(a, className) {
  const link = el('a', { href: a.getAttribute('href'), class: className });
  link.append(el('span', { class: 'nav-link-label' }, a.textContent.trim()));
  return link;
}

function buildDetail(group, id) {
  const rich = !!(group.picture || group.description.length);
  const detail = el('div', {
    class: `nav-detail${rich ? ' nav-detail-rich' : ''}`, id, role: 'region', 'aria-label': group.label,
  });
  const text = el('div', { class: 'nav-detail-text' });
  if (rich) {
    text.append(el('p', { class: 'nav-detail-title' }, group.label));
    group.description.forEach((d) => text.append(el('p', { class: 'nav-detail-desc' }, d)));
  }
  const links = [...group.links];
  if (rich && links.length) text.append(cloneLink(links.shift(), 'nav-cta'));
  if (links.length) {
    text.append(el('ul', { class: 'nav-detail-links' }, links.map((a) => el('li', {}, cloneLink(a, 'nav-link')))));
  }
  detail.append(text);
  if (group.picture) {
    const media = el('div', { class: 'nav-detail-media' });
    media.append(group.picture.cloneNode(true));
    detail.append(media);
  }
  return detail;
}

function activate(list, items, panes, index) {
  items.forEach((item, i) => {
    const on = i === index;
    item.setAttribute(item.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-expanded', on);
    if (panes[i]) panes[i].hidden = !on;
  });
  list.dataset.active = index;
}

/* group details live beside the list on desktop and inline (accordion) on mobile */
function placeDetails(panel) {
  const details = panel.querySelector('.nav-details');
  panel.querySelectorAll('.nav-groups > li').forEach((li) => {
    const btn = li.querySelector('button.nav-group');
    const detail = btn && panel.querySelector(`#${btn.getAttribute('aria-controls')}`);
    if (!detail) return;
    if (DESKTOP.matches) details.append(detail);
    else li.append(detail);
  });
}

function buildTabPanel(tab, tabIdx, uid, onBack) {
  const panel = el('div', {
    class: 'nav-tabpanel', id: `${uid}-tabpanel-${tabIdx}`, role: 'tabpanel', 'aria-labelledby': `${uid}-tab-${tabIdx}`,
  });
  // mobile sub-panel header: back + tab title
  const back = el('button', { type: 'button', class: 'nav-back', 'aria-label': `Back from ${tab.label}` });
  back.addEventListener('click', onBack);
  panel.append(el('div', { class: 'nav-subhead' }, back, el('p', { class: 'nav-subhead-title' }, tab.label)));
  const groupList = el('ul', { class: 'nav-groups' });
  const details = el('div', { class: 'nav-details' });
  const triggers = [];
  const panes = [];
  tab.groups.forEach((group, gi) => {
    const li = el('li');
    if (group.link) {
      li.append(cloneLink(group.link, 'nav-group nav-group-link'));
    } else {
      const detailId = `${uid}-detail-${tabIdx}-${gi}`;
      const rich = !!(group.picture || group.description.length);
      const btn = el('button', {
        type: 'button', class: `nav-group${rich ? ' nav-group-rich' : ' nav-group-expand'}`, 'aria-controls': detailId, 'aria-expanded': 'false',
      }, el('span', { class: 'nav-group-label' }, group.label));
      if (group.subtitle) btn.append(el('span', { class: 'nav-group-subtitle' }, group.subtitle));
      li.append(btn);
      details.append(buildDetail(group, detailId));
      triggers.push(btn);
      panes.push(details.lastElementChild);
      const idx = triggers.length - 1;
      btn.addEventListener('click', () => {
        // mobile accordion: tapping the open group collapses it
        const open = btn.getAttribute('aria-expanded') === 'true';
        activate(groupList, triggers, panes, open && !DESKTOP.matches ? -1 : idx);
      });
    }
    groupList.append(li);
  });
  if (triggers.length) activate(groupList, triggers, panes, 0);
  panel.append(groupList, details);
  placeDetails(panel);
  return panel;
}

function buildPanel(tabs, tools, uid) {
  const panel = el('div', { class: 'nav-panel', id: `${uid}-panel` });
  if (tools.length) {
    const toolBar = el('div', { class: 'nav-tools' });
    tools.forEach((section) => section.querySelectorAll('a').forEach((a) => {
      const link = el('a', { href: a.getAttribute('href'), class: 'nav-tool' });
      const icon = a.querySelector('img');
      if (icon) {
        const img = el('img', {
          src: icon.getAttribute('src'), alt: '', width: 16, height: 16, loading: 'lazy',
        });
        link.append(img);
      }
      link.append(el('span', {}, a.textContent.trim()));
      toolBar.append(link);
    }));
    panel.append(toolBar);
  }
  const tabList = el('div', { class: 'nav-tabs', role: 'tablist' });
  const tabButtons = [];
  const tabPanels = [];
  const closeSub = () => {
    panel.classList.remove('is-sub-open');
    tabButtons.find((t) => t.getAttribute('aria-selected') === 'true')?.focus();
  };
  tabs.forEach((tab, ti) => {
    const btn = el('button', {
      type: 'button', class: 'nav-tab', role: 'tab', id: `${uid}-tab-${ti}`, 'aria-controls': `${uid}-tabpanel-${ti}`, 'aria-selected': 'false',
    }, tab.label);
    btn.addEventListener('click', () => {
      activate(tabList, tabButtons, tabPanels, ti);
      // mobile: slide the tab's sub-panel in
      panel.classList.add('is-sub-open');
    });
    tabButtons.push(btn);
    tabList.append(btn);
    tabPanels.push(buildTabPanel(tab, ti, uid, closeSub));
  });
  panel.append(tabList, ...tabPanels);
  if (tabButtons.length) activate(tabList, tabButtons, tabPanels, 0);
  DESKTOP.addEventListener('change', () => {
    panel.classList.remove('is-sub-open');
    tabPanels.forEach(placeDetails);
  });
  return panel;
}

function buildBrand(brand) {
  const first = brand && brand.querySelector('a');
  const link = el('a', { href: first ? first.getAttribute('href') : '/', class: 'nav-brand' });
  const imgs = brand ? [...brand.querySelectorAll('img')] : [];
  imgs.slice(0, 2).forEach((src, i) => {
    link.append(el('img', {
      src: src.getAttribute('src'),
      alt: i === 0 ? src.getAttribute('alt') || 'Home' : '',
      class: i === 0 ? 'nav-brand-light' : 'nav-brand-dark',
      width: 206,
      height: 40,
      loading: 'eager',
    }));
  });
  if (!imgs.length && first) link.textContent = first.textContent;
  return link;
}

function buildStickyCtas(section) {
  const wrap = el('div', { class: 'nav-sticky' });
  section.querySelectorAll('ul a').forEach((a) => {
    const item = el('div', { class: 'nav-sticky-item' });
    const label = a.textContent.trim();
    item.append(el('a', { href: a.getAttribute('href'), class: 'nav-sticky-cta' }, label));
    const close = el('button', { type: 'button', class: 'nav-sticky-close', 'aria-label': `Dismiss ${label}` });
    close.addEventListener('click', () => item.remove());
    item.append(close);
    wrap.append(item);
  });
  return wrap;
}

/* pill layout: logo | links | CTA; below 768px the links + CTA fold into a dropdown */
function togglePill(nav, button, force) {
  const open = force !== undefined ? force : nav.getAttribute('aria-expanded') !== 'true';
  nav.setAttribute('aria-expanded', open);
  button.setAttribute('aria-expanded', open);
  button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

function buildPill(sections, uid) {
  const [brandSection, linksSection, toolsSection] = sections;
  const nav = el('nav', {
    id: 'nav', class: 'nav-pill', 'aria-expanded': 'false', 'aria-label': 'Main',
  });

  const logo = brandSection?.querySelector('a[href]');
  const brand = el('a', { href: logo ? logo.getAttribute('href') : '/', class: 'nav-pill-brand' });
  const logoImg = brandSection?.querySelector('img');
  if (logoImg) {
    brand.append(el('img', {
      src: logoImg.getAttribute('src'), alt: logoImg.getAttribute('alt') || 'Home', loading: 'eager',
    }));
  } else {
    brand.textContent = (logo || brandSection)?.textContent.trim() || '';
  }

  const button = el('button', {
    type: 'button', class: 'nav-pill-toggle', 'aria-controls': `${uid}-menu`, 'aria-expanded': 'false', 'aria-label': 'Open navigation',
  }, el('span', { class: 'nav-pill-bar nav-pill-bar-top' }), el('span', { class: 'nav-pill-bar nav-pill-bar-bottom' }));

  const links = el('ul', { class: 'nav-pill-links' });
  linksSection?.querySelectorAll('a[href]').forEach((a) => {
    links.append(el('li', {}, el('a', { href: a.getAttribute('href') }, a.textContent.trim())));
  });
  const tools = el('div', { class: 'nav-pill-tools' });
  toolsSection?.querySelectorAll('a[href]').forEach((a) => {
    tools.append(el('a', { href: a.getAttribute('href'), class: 'nav-pill-cta' }, a.textContent.trim()));
  });
  const menu = el('div', { class: 'nav-pill-menu', id: `${uid}-menu` });
  if (links.children.length) menu.append(links);
  if (tools.children.length) menu.append(tools);

  nav.append(brand, button, menu);

  button.addEventListener('click', () => togglePill(nav, button));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.getAttribute('aria-expanded') === 'true') {
      togglePill(nav, button, false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) togglePill(nav, button, false);
  });
  PILL_DESKTOP.addEventListener('change', () => togglePill(nav, button, false));

  return el('div', { class: 'nav-pill-wrapper' }, nav);
}

function toggleMenu(nav, button, force) {
  const open = force !== undefined ? force : nav.getAttribute('aria-expanded') !== 'true';
  nav.setAttribute('aria-expanded', open);
  button.setAttribute('aria-expanded', open);
  button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  document.body.style.overflow = open ? 'hidden' : '';
  if (!open) nav.querySelector('.nav-panel')?.classList.remove('is-sub-open');
  if (open) nav.querySelector('.nav-tab[aria-selected="true"], .nav-tab')?.focus();
}

/* the section under the bar decides the logo/icon colour via --header-theme */
function updateTheme(nav) {
  const y = 50;
  const section = document.elementsFromPoint(window.innerWidth / 2, y)
    .map((n) => n.closest('main > .section, body > footer'))
    .find(Boolean);
  const theme = section ? getComputedStyle(section).getPropertyValue('--header-theme').trim() : '';
  nav.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const fragment = await fetchNav();
  block.textContent = '';
  if (!fragment) return;
  headerId += 1;
  const uid = `nav-${headerId}`;
  const sections = [...fragment.children].filter((c) => c.tagName === 'DIV' && c.children.length);
  const {
    brand, tools, tabs, sticky,
  } = classify(sections);

  if (!tabs.length) {
    block.classList.add('is-pill');
    block.append(buildPill(sections, uid));
    return;
  }

  const nav = el('nav', { id: 'nav', class: 'nav', 'aria-expanded': 'false' });
  const bar = el('div', { class: 'nav-bar' });
  const button = el('button', {
    type: 'button', class: 'nav-hamburger', 'aria-controls': `${uid}-panel`, 'aria-expanded': 'false', 'aria-label': 'Open navigation',
  }, el('span', { class: 'nav-hamburger-top' }), el('span', { class: 'nav-hamburger-bottom' }));
  bar.append(buildBrand(brand), button);
  nav.append(buildPanel(tabs.map(parseTab), tools, uid), bar);

  button.addEventListener('click', () => toggleMenu(nav, button));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.getAttribute('aria-expanded') === 'true') {
      toggleMenu(nav, button, false);
      button.focus();
    }
  });
  // crossing the desktop breakpoint resets an open menu
  DESKTOP.addEventListener('change', () => toggleMenu(nav, button, false));

  const wrapper = el('div', { class: 'nav-wrapper' }, nav);
  block.append(wrapper);
  if (sticky) block.append(buildStickyCtas(sticky));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateTheme(nav); ticking = false; });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateTheme(nav);
  // sections render progressively; re-check once the page has settled
  window.setTimeout(() => updateTheme(nav), 1000);
}
