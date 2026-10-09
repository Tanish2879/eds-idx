/* eslint-disable */
/* global WebImporter */

/**
 * Nav fragment importer for MG Select (source: homepage header).
 * Produces /nav as flat, semantic sections (no classes, no form controls):
 *   1. brand   — logo links (light + dark variants)
 *   2. tools   — panel utility link (showroom locator + pin icon)
 *   3..n tabs  — first <p><strong> = tab label; later <p><strong> = group label
 *                (+ optional subtitle <p>),
 *                description <p>, image, <ul> of links
 *   last       — sticky CTA links ("Book ... Couture Edition")
 * header.js reads this structure; it never invents copy.
 */

const ORIGIN = 'https://www.mgselect.co.in';

function clean(text) {
  return (text || '').replace(/[​\s]+/g, ' ').trim();
}

function absImg(src) {
  if (!src) return '';
  return src.startsWith('//') ? `https:${src}` : src;
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

function img(doc, source) {
  return el(doc, 'img', { src: absImg(source.getAttribute('src')), alt: clean(source.getAttribute('alt')) });
}

function linkList(doc, anchors) {
  const ul = doc.createElement('ul');
  const seen = new Set();
  anchors.forEach((a) => {
    const label = clean(a.textContent);
    const href = relHref(a.getAttribute('href'));
    if (!label || !href || seen.has(`${label}|${href}`)) return;
    seen.add(`${label}|${href}`);
    ul.append(el(doc, 'li', {}, [el(doc, 'a', { href }, [label])]));
  });
  return ul;
}

function buildNav(document) {
  const header = document.querySelector('.header-section');
  const sections = [];

  // 1. brand
  const brand = document.createElement('div');
  header.querySelectorAll('.header__overlay a.header__logo--main').forEach((a) => {
    const i = a.querySelector('img');
    if (i) brand.append(el(document, 'p', {}, [el(document, 'a', { href: relHref(a.getAttribute('href')) || '/' }, [img(document, i)])]));
  });
  sections.push(brand);

  // 2. tools (first showroom-locator style utility link with icon)
  const tools = document.createElement('div');
  // panel utility link (top-right of the open menu): lives in the fixed user-info
  // area; its pin icon is a sibling image in the same area
  const utilArea = header.querySelector('.header__user__info');
  const util = utilArea && [...utilArea.querySelectorAll('a[href]')].find((a) => clean(a.textContent));
  if (util) {
    const icon = utilArea.querySelector('img');
    const children = icon ? [img(document, icon), ` ${clean(util.textContent)}`] : [clean(util.textContent)];
    tools.append(el(document, 'p', {}, [el(document, 'a', { href: relHref(util.getAttribute('href')) }, children)]));
  }
  sections.push(tools);

  // 3..n tabs
  const tabLabels = [...header.querySelectorAll('.header__main--tabs .header__main--tab')].map((t) => clean(t.textContent));
  const pages = header.querySelectorAll('.header__main .header-new-section__page');
  tabLabels.forEach((label, ti) => {
    const pg = pages[ti];
    if (!pg) return;
    const sec = document.createElement('div');
    // tab label: first bold paragraph of the section
    sec.append(el(document, 'p', {}, [el(document, 'strong', {}, [label])]));
    const items = [...pg.querySelectorAll('.header__main--left .header__accordion--menu > li')];
    const panes = [...pg.querySelectorAll('.header__main--right > .header__main--content')];
    let paneIdx = 0;
    items.forEach((li) => {
      const title = li.querySelector('h3, h4, [class*=title]');
      const titleText = clean((title || li).childNodes.length ? (title || li).textContent : '');
      const subtitle = li.querySelector('p');
      const directLink = li.querySelector('a[href]');
      if (directLink && !li.getAttribute('aria-controls')) {
        // left item is a plain link (e.g. ABOUT MG SELECT)
        sec.append(el(document, 'p', {}, [el(document, 'strong', {}, [el(document, 'a', { href: relHref(directLink.getAttribute('href')) }, [clean(directLink.textContent) || titleText])])]));
        return;
      }
      const name = clean(title ? title.textContent : li.textContent.replace(subtitle ? subtitle.textContent : '', ''));
      // group label: subsequent bold paragraphs
      sec.append(el(document, 'p', {}, [el(document, 'strong', {}, [name])]));
      if (subtitle && clean(subtitle.textContent)) sec.append(el(document, 'p', {}, [clean(subtitle.textContent)]));
      const pane = panes[paneIdx]; paneIdx += 1;
      if (!pane) return;
      const desc = [...pane.querySelectorAll('p')].map((p) => clean(p.textContent)).filter((t) => t && !/^ex-showroom/i.test(t));
      desc.slice(0, 1).forEach((t) => sec.append(el(document, 'p', {}, [t])));
      const pic = pane.querySelector('img');
      if (pic) sec.append(el(document, 'p', {}, [img(document, pic)]));
      const anchors = [...pane.querySelectorAll('a[href]')].filter((a) => clean(a.textContent));
      if (anchors.length) sec.append(linkList(document, anchors));
    });
    sections.push(sec);
  });

  // last: sticky CTAs (page-level floating buttons)
  const sticky = [...document.querySelectorAll('a.sticky-cta-button')];
  if (sticky.length) {
    const sec = document.createElement('div');
    sec.append(linkList(document, sticky));
    sections.push(sec);
  }
  return sections;
}

export default {
  transform: (payload) => {
    const { document } = payload;
    const sections = buildNav(document);
    const main = document.createElement('main');
    sections.forEach((s, i) => {
      if (i > 0) main.append(document.createElement('hr'));
      main.append(s);
    });
    document.body.innerHTML = '';
    document.body.append(main);
    return [{
      element: document.body,
      path: '/nav',
      report: { title: 'nav', sections: sections.length },
    }];
  },
};
