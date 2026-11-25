import { loadCSS, toClassName } from './aem.js';

/* Side navigation */

// touch screens and small windows open the list by tapping the line instead of pointing
const TAP = window.matchMedia('(hover: none), (width < 768px)');
const CALM = window.matchMedia('(prefers-reduced-motion: reduce)');
const EDGE = 72;
const BAND = 0.32;
const CLOSE_DELAY = 260;

/** a section without an id gets one from its label (lowercase, dashes, unique on the page) */
function ensureId(section, label) {
  if (section.id) return section.id;
  const base = toClassName(label) || 'section';
  let id = base;
  for (let n = 2; document.getElementById(id); n += 1) id = `${base}-${n}`;
  section.id = id;
  return id;
}

function goTo(section) {
  section.scrollIntoView({ behavior: CALM.matches ? 'auto' : 'smooth' });
}

/** Builds the side navigation for the page's labelled sections */
export default async function initSectionNav(main) {
  // not in Universal Editor: the canvas is for editing, and it would cover the right edge
  if (document.querySelector('[data-aue-resource]')) return;
  const sections = [...main.querySelectorAll(':scope > .section')];
  const labelled = sections
    .map((section) => ({ section, label: section.dataset.navlabel?.trim() }))
    .filter(({ label }) => label);
  if (!labelled.length) return;

  await loadCSS(`${window.hlx.codeBasePath}/styles/section-nav.css`);

  const nav = document.createElement('nav');
  nav.className = 'section-nav';
  nav.setAttribute('aria-label', 'Sections');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'section-nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'section-nav-list');
  toggle.setAttribute('aria-label', 'Sections');
  const line = document.createElement('span');
  line.className = 'section-nav-line';
  line.setAttribute('aria-hidden', 'true');
  line.append(document.createElement('b'));
  toggle.append(line);

  const list = document.createElement('ol');
  list.className = 'section-nav-list';
  list.id = 'section-nav-list';
  list.style.setProperty('--section-nav-count', labelled.length);

  const links = labelled.map(({ section, label }, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--section-nav-i', i);
    const a = document.createElement('a');
    a.href = `#${ensureId(section, label)}`;
    a.textContent = label;
    li.append(a);
    list.append(li);
    return a;
  });

  // small screens: a close button on the left while the list is open (styles/section-nav.css)
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'section-nav-close';
  close.setAttribute('aria-label', 'Close the sections list');

  nav.append(toggle, list, close);
  // fixed in place, so it takes no room; placed before main so it comes early in the tab order
  main.before(nav);

  // open / close
  let open = false;
  let closeTimer;
  const setOpen = (value) => {
    clearTimeout(closeTimer);
    if (value === open) return;
    open = value;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const closeSoon = () => {
    clearTimeout(closeTimer);
    if (open) closeTimer = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  // keyboard focus in the list keeps it open; focus left on a clicked link does not
  const keyboardFocus = () => nav.contains(document.activeElement)
    && document.activeElement.matches(':focus-visible');

  // pointing at the right edge opens the list; it stays open while the pointer is on its labels
  document.addEventListener('mousemove', (e) => {
    if (TAP.matches) return;
    const nearEdge = window.innerWidth - e.clientX < EDGE
      && Math.abs(e.clientY - window.innerHeight / 2) < window.innerHeight * BAND;
    // the labels keep it open, not the veil behind them
    const onLabels = open && e.target.closest?.('.section-nav-list li, .section-nav-toggle');
    if (nearEdge || onLabels) setOpen(true);
    else if (!keyboardFocus()) closeSoon();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    if (!TAP.matches && !keyboardFocus()) closeSoon();
  });

  // the line is a button
  let pointer = '';
  toggle.addEventListener('pointerdown', (e) => { pointer = e.pointerType; });
  toggle.addEventListener('click', (e) => {
    if (e.detail > 0 && pointer === 'mouse' && !TAP.matches) setOpen(true);
    else setOpen(!open);
  });
  // a tap anywhere else (the veil behind the labels too) closes it
  document.addEventListener('click', (e) => {
    if (open && TAP.matches && !e.target.closest?.('.section-nav a, .section-nav-toggle, .section-nav-close')) setOpen(false);
  }, true);
  // a tap on the open veil (over the line too) closes it
  list.addEventListener('click', (e) => {
    if (open && TAP.matches && !e.target.closest('a')) setOpen(false);
  });
  close.addEventListener('click', () => {
    const keyboard = close.matches(':focus-visible');
    setOpen(false);
    if (keyboard) toggle.focus();
  });
  // a touch outside the labels, line and close button closes it (iOS sends no click on empty areas)
  const closeOnOutside = (e) => {
    if (open && TAP.matches && !e.target.closest?.('.section-nav a, .section-nav-toggle, .section-nav-close')) setOpen(false);
  };
  document.addEventListener('pointerdown', closeOnOutside, true);
  document.addEventListener('touchstart', closeOnOutside, { capture: true, passive: true });
  // a swipe, scroll or snap closes the list too
  const closeOnMove = () => { if (open && TAP.matches) setOpen(false); };
  document.addEventListener('touchmove', closeOnMove, { capture: true, passive: true });
  document.addEventListener('snap:start', closeOnMove);
  window.addEventListener('scroll', closeOnMove, { passive: true });
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    setOpen(false);
    toggle.focus();
  });
  nav.addEventListener('focusout', (e) => {
    if (!nav.contains(e.relatedTarget)) closeSoon();
  });

  // going to a section
  links.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (TAP.matches) {
        setOpen(false);
        a.blur();
      }
      if (window.location.hash !== a.hash) window.history.pushState(null, '', a.hash);
      if (document.documentElement.classList.contains('snap-active')) {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else {
        goTo(labelled[i].section);
      }
    });
  });

  // the current section, how far down the page, and the ink, on every scroll
  let current = -2;
  let light;
  let frame = 0;
  const update = () => {
    frame = 0;
    const y = window.scrollY;
    const mid = y + window.innerHeight / 2;
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    const progress = limit > 0 ? Math.min(1, Math.max(0, y / limit)) : 0;
    nav.style.setProperty('--section-nav-progress', progress.toFixed(4));

    let at = -1;
    labelled.forEach(({ section }, i) => { if (section.offsetTop <= mid) at = i; });
    if (at !== current) {
      current = at;
      links.forEach((a, i) => {
        if (i === at) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }

    // dark ink while a Light section fills the middle of the screen
    let here = sections[0];
    sections.forEach((section) => { if (section.offsetTop <= mid) here = section; });
    const isLight = here.classList.contains('light');
    if (isLight !== light) {
      light = isLight;
      nav.classList.toggle('is-ink-dark', light);
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('snap:end', schedule);
  update();
}
