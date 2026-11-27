import {
  getMetadata, decorateIcons, createOptimizedPicture, loadCSS,
} from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import {
  DEFAULT_CTA, socialCta, legalCta, token,
} from '../../scripts/utils/datalayer.js';
import { decorateExternalLinks } from '../../scripts/scripts.js';
import decorateGlitch from '../../scripts/utils/glitch.js';

// accessible-name labels per platform key (used when the link has no visible text)
const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

const SOCIAL_KEYS = Object.keys(SOCIAL_LABELS);

// other names authors use for a platform (icon tokens, image files, text)
const SOCIAL_ALIASES = {
  twitter: 'x',
  'x-twitter': 'x',
  'linked-in': 'linkedin',
  'you-tube': 'youtube',
  fb: 'facebook',
  ig: 'instagram',
  yt: 'youtube',
};

// platform per link address
const SOCIAL_HOSTS = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)(facebook|fb)\.com$/i, 'facebook'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube'],
  [/(^|\.)(x|twitter)\.com$/i, 'x'],
];

const text = (el) => (el ? el.textContent.trim() : '');

// a social platform key for a name ("Instagram", "linked-in", "twitter" ...)
function platform(name) {
  const n = (name || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  const key = SOCIAL_ALIASES[n] || n;
  return SOCIAL_KEYS.includes(key) ? key : null;
}

// The platform a link is for: its icon token, image (file name or alt), text or address.
// Null when it's none.
function iconKey(a) {
  const span = a.querySelector('span.icon');
  const iconClass = span && [...span.classList].find((c) => c.startsWith('icon-'));
  // an authored image, not the one decorateIcons put in a token's span
  const img = a.querySelector('img:not([data-icon-name])');
  const file = img && (img.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop()
    .replace(/\.[a-z0-9]+$/i, '');
  let host = '';
  try {
    host = new URL(a.getAttribute('href') || '', window.location.href).hostname;
  } catch {
    // not a valid address
  }
  return platform(iconClass && iconClass.slice(5))
    || platform(file)
    || platform(img && img.alt)
    || platform(text(a))
    || (SOCIAL_HOSTS.find(([re]) => re.test(host)) || [])[1]
    || null;
}

// Marks an authored icon that brings its own tile (fully painted, translucent or dark edge)
// so it fills the tile (.channel.tile).
function markTile(img) {
  const check = () => {
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h || Math.abs(w / h - 1) > 0.1) return;
    try {
      const n = 24;
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, n, n);
      const { data } = ctx.getImageData(0, 0, n, n);
      let painted = 0;
      let edgeAlpha = 0;
      let edgeLight = 0;
      let edge = 0;
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          const k = (y * n + x) * 4;
          if (data[k + 3] > 8) painted += 1;
          // the outer two-pixel ring, leaving out the rounded corners
          const ring = Math.min(x, y, n - 1 - x, n - 1 - y) < 2;
          const corner = Math.min(x, n - 1 - x) < 4 && Math.min(y, n - 1 - y) < 4;
          if (ring && !corner) {
            edge += 1;
            edgeAlpha += data[k + 3];
            edgeLight += (data[k] + data[k + 1] + data[k + 2]) / 3;
          }
        }
      }
      const covered = painted / (n * n) > 0.9;
      const tileEdge = edgeAlpha / edge < 160 || edgeLight / edge < 80;
      if (covered && tileEdge) img.closest('.channel')?.classList.add('tile');
    } catch {
      // can't be read: keep it a plain icon
    }
  };
  if (img.complete) check();
  else img.addEventListener('load', check, { once: true });
}

// the platform an icon image is for, from its file name or alt text, or null
function imageKey(img) {
  const file = (img.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop()
    .replace(/\.[a-z0-9]+$/i, '');
  return platform(file) || platform(img.alt) || null;
}

// The Connect section's icons in authored order: a loose image (UE rich text) takes the
// link for its platform, else the next link without an icon, else shows unlinked.
function socialItems(sec) {
  const order = new Map();
  [...sec.querySelectorAll('a, picture, img')].forEach((el, i) => order.set(el, i));
  const links = [...sec.querySelectorAll('a')];
  const free = links.filter((a) => !a.querySelector('picture, img, span.icon'));
  const loose = [...sec.querySelectorAll('picture, img:not(picture img)')]
    .filter((el) => !el.closest('a'));
  const items = []; // [position, element]
  loose.forEach((pic) => {
    const img = pic.tagName === 'IMG' ? pic : pic.querySelector('img');
    const key = img && imageKey(img);
    let at = key ? free.findIndex((a) => iconKey(a) === key) : -1;
    if (at < 0 && free.length) at = 0;
    if (at >= 0) {
      const [a] = free.splice(at, 1);
      a.prepend(pic);
      items.push([order.get(pic), a]);
    } else {
      const tile = document.createElement('span');
      tile.append(pic);
      items.push([order.get(pic), tile]);
    }
  });
  links.filter((a) => !items.some(([, el]) => el === a))
    .forEach((a) => items.push([order.get(a), a]));
  return items.sort(([p], [q]) => p - q).map(([, el]) => el);
}

const div = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

/** Builds a link column from a section: its heading (or first line) and its list items. */
function buildExplore(section) {
  const column = div('links');
  const heading = section.querySelector('h1, h2, h3, h4, h5, h6')
    || [...section.querySelectorAll('p')].find((p) => !p.closest('ul') && text(p));
  if (heading) {
    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = text(heading);
    column.append(title);
  }
  const list = div('list');
  section.querySelectorAll('ul > li').forEach((li, index) => {
    const a = li.querySelector('a');
    if (a) {
      a.classList.add('item', 'is-link');
      // teaser-footer (not footer:explore) — location must stay in the
      // agreed vocabulary; "explore" is a group label, not a location
      a.dataset.cta = `teaser-footer:${token(text(a)) || 'not-set'}:view`;
      a.dataset.ctaPosition = index + 1;
      list.append(a);
    } else if (text(li)) {
      const item = document.createElement('span');
      item.className = 'item';
      item.textContent = text(li);
      list.append(item);
    }
  });
  column.append(list);
  return column;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// the tail lights are found when at least this much of the 640-wide copy of
// the photo is warm (a few dozen pixels)
const MIN_LIGHTS = 40;

// An alpha mask of the photo (alpha = amount(r, g, b)), optionally blurred first,
// with its weighted centre and total weight.
function photoMask(img, width, soften, amount) {
  const height = Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (soften) ctx.filter = `blur(${soften}px)`;
  ctx.drawImage(img, 0, 0, width, height);
  ctx.filter = 'none';
  const photo = ctx.getImageData(0, 0, width, height).data; // throws if cross-origin
  const mask = ctx.createImageData(width, height);
  let weight = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < photo.length; i += 4) {
    const a = amount(photo[i], photo[i + 1], photo[i + 2]);
    mask.data.fill(255, i, i + 3);
    mask.data[i + 3] = Math.round(a * 255);
    if (a) {
      const p = i / 4;
      weight += a;
      sumX += (p % width) * a;
      sumY += Math.floor(p / width) * a;
    }
  }
  ctx.putImageData(mask, 0, 0);
  return {
    url: `url(${canvas.toDataURL()})`,
    weight,
    centre: weight ? [(sumX / weight + 0.5) / width, (sumY / weight + 0.5) / height] : null,
  };
}

// Reads the backdrop once: a sky mask (teal pixels) and a tail-light mask (warm pixels)
// with the lights' centre. Null when the photo can't be read (another origin).
function readBackdrop(img) {
  if (!img.naturalWidth) return null;
  try {
    const skyness = (r, g) => clamp((g - r - 2) / 6, 0, 1);
    const warmth = (r, g, b) => clamp((r - Math.max(g, b) - 4) / 10, 0, 1);
    const sky = photoMask(img, 320, 0, skyness);
    const lights = photoMask(img, 640, 1.5, warmth);
    const found = lights.weight >= MIN_LIGHTS;
    return {
      sky: sky.url,
      lights: found ? lights.url : null,
      centre: found ? lights.centre : null,
    };
  } catch {
    return null; // a cross-origin photo can't be read
  }
}

/** Screen position of a photo point (fractions); the photo covers its stage, bottom centre. */
function photoPoint(stage, img, [fx, fy]) {
  const r = stage.getBoundingClientRect();
  const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return [r.left + (r.width - w) * 0.5 + fx * w, r.top + (r.height - h) + fy * h];
}

// Hover lights (from the prototype): a sky glow that follows the mouse and tail lights that
// brighten as it nears them. Mouse only, not under reduced motion; sets --glow-* on the block.
// The lights sit in the photo's stage, so they stay on the photo however the stage is sized.
function decorateGlow(block, backdrop) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stage = backdrop.parentElement;
  const img = backdrop.querySelector('img');
  const glow = div('glow');
  const tail = div('tail');
  const halo = div('tail-halo');
  halo.append(document.createElement('span'));
  tail.append(halo, div('tail-light'));
  [glow, tail].forEach((el) => el.setAttribute('aria-hidden', 'true'));
  backdrop.after(glow, tail);

  // the photo is read once, the first time a mouse comes over the footer
  let read = false;
  let lightsAt = null; // the tail lights' centre on the photo (fractions)
  block.addEventListener('pointerenter', (e) => {
    if (read || !img || e.pointerType !== 'mouse') return;
    read = true;
    const apply = () => {
      const found = readBackdrop(img);
      if (!found) return;
      glow.style.setProperty('--glow-sky', found.sky);
      glow.classList.add('masked');
      if (found.lights) {
        tail.style.setProperty('--glow-lights', found.lights);
        tail.classList.add('ready');
        lightsAt = found.centre;
      }
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once: true });
  });

  const rest = {
    x: 50, y: 64, on: 0, tail: 0,
  };
  const target = { ...rest };
  const now = { ...rest };
  let frame = 0;

  const tick = () => {
    now.x += (target.x - now.x) * 0.08;
    now.y += (target.y - now.y) * 0.08;
    now.on += (target.on - now.on) * 0.12;
    now.tail += (target.tail - now.tail) * 0.12;
    const settled = Math.abs(target.x - now.x) < 0.05
      && Math.abs(target.y - now.y) < 0.05
      && Math.abs(target.on - now.on) < 0.002
      && Math.abs(target.tail - now.tail) < 0.002;
    if (settled) Object.assign(now, target);
    block.style.setProperty('--glow-x', `${now.x.toFixed(2)}%`);
    block.style.setProperty('--glow-y', `${now.y.toFixed(2)}%`);
    block.style.setProperty('--glow-on', now.on.toFixed(3));
    block.style.setProperty('--glow-tail', now.tail.toFixed(3));
    frame = settled ? 0 : requestAnimationFrame(tick);
  };
  const run = () => { if (!frame) frame = requestAnimationFrame(tick); };

  block.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = stage.getBoundingClientRect();
    target.x = clamp(((e.clientX - r.left) / r.width) * 100, 18, 82);
    target.y = clamp(((e.clientY - r.top) / r.height) * 100, 30, 78);
    target.on = 1;
    if (lightsAt) {
      const [lx, ly] = photoPoint(stage, img, lightsAt);
      const distance = Math.hypot(e.clientX - lx, e.clientY - ly);
      target.tail = 1 - clamp((distance - 60) / 520, 0, 1);
    }
    run();
  });
  block.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    Object.assign(target, rest);
    run();
  });
}

// Phones and tablets: the link columns fold into an accordion, one open at a time, each
// heading a button; on desktop the headings are plain text and every list shows.
function decorateAccordion(columns) {
  const mobile = window.matchMedia('(width < 900px)');
  const items = columns.map((column, index) => {
    const title = column.querySelector('.title');
    const list = column.querySelector('.list');
    if (!title || !list) return null;
    const panel = div('panel');
    panel.id = `footer-links-${index + 1}`;
    list.replaceWith(panel);
    panel.append(list);
    const label = text(title);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.textContent = label;
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');
    return {
      column, title, label, toggle,
    };
  }).filter(Boolean);

  const setOpen = (item, open) => {
    item.column.classList.toggle('open', open);
    item.toggle.setAttribute('aria-expanded', String(open));
  };
  items.forEach((item) => {
    item.toggle.addEventListener('click', () => {
      const open = !item.column.classList.contains('open');
      items.forEach((other) => setOpen(other, other === item && open));
    });
  });

  const apply = () => items.forEach((item) => {
    if (mobile.matches) {
      item.title.replaceChildren(item.toggle);
    } else {
      setOpen(item, false);
      item.title.textContent = item.label;
    }
  });
  apply();
  mobile.addEventListener('change', apply);
}

// The page's "Visit" fold: its last section with content (an empty one, e.g. left by a page
// metadata table, doesn't count), when it holds Columns in the Reach Us (Photo) style.
function visitFold() {
  const last = [...document.querySelectorAll('main > .section')].reverse()
    .find((section) => section.children.length);
  return last?.querySelector('.columns.reach-us.photo') ? last : null;
}

// The Dealer footer inside the Visit fold, as the dealer prototypes have it (#garage): the
// built block moves into the fold's .reach-us-photo-footer container, its parts marked to come
// in with the Visit content (.reach-us-photo-item, columns-reach-us-photo.js), and the site
// footer band, left empty, is hidden (no blank band, no snap stop of its own). Links keep their
// analytics attributes; the block keeps its classes and data-block-* (componentOf, the look).
function mergeIntoFold(block, inner) {
  const fold = visitFold();
  const siteFooter = block.closest('footer');
  if (!fold || !siteFooter) return;
  // rule and link columns first, then the legal lines and Privacy policy (the design's order)
  [inner.querySelector(':scope > .end'), inner.querySelector(':scope > .start'),
    inner.querySelector(':scope > .legal')]
    .filter(Boolean)
    .forEach((part) => part.classList.add('reach-us-photo-item'));
  const host = div('reach-us-photo-footer');
  // still the page's footer for assistive tech (the site <footer> is hidden)
  host.setAttribute('role', 'contentinfo');
  host.append(block);
  fold.append(host);
  siteFooter.hidden = true;
  siteFooter.classList.add('footer-merged');
}

/** Loads and decorates the footer. */
export default async function decorate(block) {
  // the page's own footer (metadata) first, then the site's /footer
  const footerMeta = getMetadata('footer');
  const paths = [
    footerMeta && new URL(footerMeta, window.location).pathname,
    '/footer',
  ].filter((path, index, all) => path && all.indexOf(path) === index);

  let fragment;
  // eslint-disable-next-line no-restricted-syntax
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    fragment = await loadFragment(path);
    if (fragment) break;
  }
  // no footer content anywhere: leave the block empty rather than fail
  if (!fragment) return;

  block.textContent = '';

  // Data-layer component type. The footer lives outside <main>, so the
  // central decorateDataLayerHooks() cannot tag it — set it on the block here.
  block.dataset.blockType = 'nav';

  // unwrap an inner <main> so we always work from the content divs
  const innerMain = fragment.querySelector('main');
  const source = innerMain || fragment;
  const sections = [...source.children].filter((el) => el.tagName === 'DIV');

  // sort sections: social links/icons, link columns, background picture, CTA link,
  // and anything else = legal (logo, copyright, legal links)
  let reserveLink; // register CTA
  let legal; // copyright + legal links (privacy, terms, ...)
  let backdrop; // full-bleed background picture
  let socialTitle; // Connect heading
  const columnSections = []; // heading + link list sections
  const socialLinks = []; // social platform anchors

  sections.forEach((sec) => {
    const links = [...sec.querySelectorAll('a')];
    const pictures = sec.querySelectorAll('picture');
    const heading = sec.querySelector('h1, h2, h3, h4, h5, h6');
    const images = sec.querySelectorAll('picture, img:not(picture img)');

    // social: all its links are platform links, or a heading ("Connect") with icon images
    const allSocial = links.every(iconKey);
    if ((links.length && allSocial) || (heading && images.length && allSocial)) {
      socialLinks.push(...socialItems(sec));
      socialTitle = socialTitle || heading;
    } else if (sec.querySelector('ul li')) {
      columnSections.push(sec);
    } else if (!backdrop && !links.length && pictures.length === 1 && !text(sec)) {
      [backdrop] = pictures;
    } else if (!reserveLink && links.length === 1 && text(sec) === text(links[0])) {
      [reserveLink] = links;
    } else if (!legal) {
      legal = sec;
    }
  });
  const [exploreSection] = columnSections;
  // several link columns switch on the multi-column layout (logo + CTA on
  // the left, columns + Connect on the right, legal links along the bottom)
  const columns = columnSections.length > 1;

  // a logo or a link column switches on the Explore layout; without, the original footer
  const logoImg = legal?.querySelector('picture img');

  // the dealer sites' look (footer-dealer.css), on the same content: page metadata "Footer
  // Style" (Dealer / Default) decides; without it, link columns with no logo are a dealer
  // footer (the brand footer always has the JSW logo)
  const footerStyle = getMetadata('footer-style').trim().toLowerCase();
  const dealer = footerStyle ? footerStyle === 'dealer' : columns && !logoImg;
  if (dealer) {
    block.classList.add('dealer');
    await loadCSS(`${window.hlx.codeBasePath}/blocks/footer/footer-dealer.css`);
  }
  const explore = !!(exploreSection || logoImg);
  if (explore) block.classList.add('explore');
  if (columns) block.classList.add('columns');

  const inner = div('inner');
  // left column (brand, copyright, legal links), centred CTA, right column
  // (Explore links, social); on mobile the columns dissolve into one flow
  const start = div('start');
  const end = div('end');

  const meta = div('meta');
  const legalGroup = div('legal');
  if (legal) {
    if (logoImg) {
      const brand = createOptimizedPicture(logoImg.src, logoImg.alt || 'JSW Motors', false, [{ width: '400' }]);
      brand.classList.add('brand');
      brand.querySelector('img').classList.add('mark');
      start.append(brand);
    }

    const copyright = div('copyright');
    legal.querySelectorAll('p').forEach((p) => {
      // every link is a legal link, whether authored on its own line (a new
      // paragraph) or several in one paragraph (Shift+Enter between them)
      const links = [...p.querySelectorAll('a')];
      if (links.length) {
        links.forEach((a) => {
          a.classList.add('privacy');
          legalGroup.append(a);
        });
      } else if (text(p)) {
        const line = document.createElement('span');
        line.className = 'line';
        line.textContent = text(p);
        copyright.append(line);
      }
    });
    if (copyright.children.length) meta.append(copyright);
  }
  start.append(meta);

  // legal links: the analytics token is the bare topic ("privacy"), so drop a trailing "Policy"
  [...legalGroup.children].forEach((a, index) => {
    a.dataset.cta = legalCta(text(a).replace(/\s*policy\s*$/i, ''));
    a.dataset.ctaPosition = index + 1;
  });
  if (legalGroup.children.length) start.append(legalGroup);

  // register-interest pill
  let cta;
  if (reserveLink) {
    cta = div('cta');
    // primary/secondary keep the global button styles; a default link becomes the plain CTA
    const primary = reserveLink.classList.contains('primary');
    const secondary = reserveLink.classList.contains('secondary');
    if (!primary && !secondary) reserveLink.classList.add('register', 'plain');
    if (!reserveLink.dataset.cta) reserveLink.dataset.cta = DEFAULT_CTA.footerRegister;
    // primary CTAs get the same glitch hover as the hero's
    if (primary) decorateGlitch(reserveLink);
    cta.append(reserveLink);
  }

  const linkColumns = (columns ? columnSections : [exploreSection].filter(Boolean))
    .map(buildExplore);
  end.append(...linkColumns);
  // the dealer footer shows every list open on phones too (no accordion)
  if (columns && !dealer) decorateAccordion(linkColumns);

  // social icon buttons
  if (socialLinks.length) {
    const social = div('social');
    socialLinks.forEach((a, index) => {
      const authored = a.querySelector('picture') || a.querySelector('img') || a.querySelector('span.icon');
      a.classList.add('channel');
      if (a.tagName !== 'A') {
        // an icon image authored without a link: shown as it is, named by
        // its alt text (or its platform)
        const img = a.querySelector('img');
        const key = img && imageKey(img);
        if (key) a.dataset.platform = key;
        if (img && !img.alt.trim() && key) img.alt = SOCIAL_LABELS[key];
        social.append(a);
        return;
      }
      const key = iconKey(a);
      // the accessible name: authored link text, unless it's an address
      const label = text(a);
      a.setAttribute('aria-label', label && !/[/.]/.test(label) ? label : SOCIAL_LABELS[key]);
      a.dataset.platform = key; // lets CSS order the icons per platform
      a.dataset.cta = socialCta(key);
      a.dataset.ctaPosition = index + 1;
      // show the authored icon (image or token); only a link with none gets the project's icon
      if (authored) {
        a.querySelectorAll('img').forEach((img) => { img.alt = ''; });
        a.replaceChildren(authored);
      } else {
        const icon = document.createElement('span');
        icon.className = `icon icon-${key}`;
        a.replaceChildren(icon);
      }
      social.append(a);
    });
    decorateIcons(social); // swaps icon spans for <img src="/icons/{key}.svg">
    social.querySelectorAll('img').forEach((img) => img.classList.add('symbol'));
    // authored icons that bring their own tile fill it
    social.querySelectorAll('img:not([data-icon-name])').forEach(markTile);
    if (columns) {
      // Connect column: its heading above the icons, like the link columns
      const connect = div('links connect');
      if (socialTitle) {
        const title = document.createElement('p');
        title.className = 'title';
        title.textContent = text(socialTitle);
        connect.append(title);
      }
      connect.append(social);
      end.append(connect);
    } else {
      end.append(social);
    }
  }

  if (columns) {
    // the CTA sits under the brand, the legal links get their own bottom row
    if (cta) start.append(cta);
    legalGroup.remove();
    inner.append(start, end);
    if (legalGroup.children.length) inner.append(legalGroup);
  } else {
    inner.append(start);
    if (cta) inner.append(cta);
    inner.append(end);
  }

  const footer = document.createElement('div');
  if (backdrop) {
    const img = backdrop.querySelector('img');
    const bg = createOptimizedPicture(img.src, '', false, [
      { media: '(width >= 900px)', width: '2560' },
      { width: '1200' },
    ]);
    bg.classList.add('backdrop');
    bg.setAttribute('aria-hidden', 'true');
    // the photo and its lights share a stage: the whole footer on desktop, the photo's own
    // box along the bottom on phones
    const stage = div('stage');
    stage.append(bg);
    footer.append(stage);
    // the columns footer's sky lights up under the mouse. Only built where there is a mouse:
    // its blended glow layer makes the whole footer one blended paint, which iPhones couldn't
    // repaint fast enough while scrolling (stale parts of the footer showed for a moment)
    const mouse = window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
    if (columns && mouse) decorateGlow(block, bg);
  }
  footer.append(inner);
  // social links (facebook, instagram, x, linkedin) open in a new tab
  decorateExternalLinks(footer);
  block.append(footer);

  // the Dealer footer of a page that ends on the Visit fold goes into that fold
  if (dealer) mergeIntoFold(block, inner);
}
