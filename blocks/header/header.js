import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { token } from '../../scripts/utils/datalayer.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

/**
 * While the mobile menu is open the page behind it must not move: wheel and
 * touch scrolling are cancelled unless they scroll the open menu itself.
 * (iOS Safari ignores `overflow: hidden` for touch scrolling, so the
 * `is-nav-open` class alone isn't enough.)
 * @param {Event} e wheel or touchmove event
 */
function blockBackgroundScroll(e) {
  if (!document.documentElement.classList.contains('is-nav-open')) return;
  const pill = e.target.closest?.('.nav .pill');
  if (pill && pill.scrollHeight > pill.clientHeight) return;
  if (e.cancelable) e.preventDefault();
}

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('.hamburger-button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  sections.querySelectorAll('.sections .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.hamburger-button');
  // lock the page (the root is the scrolling element) while the mobile menu is
  // open; the snap engine also stands still while this class is set
  document.documentElement.classList.toggle('is-nav-open', !expanded && !isDesktop.matches);
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  // mirror the open state as a class so CSS targets .is-open instead of the
  // [aria-expanded] attribute (the aria attribute stays for accessibility)
  nav.classList.toggle('is-open', !expanded);
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // The header is on unless the "Hide Header" page toggle is on. Pages authored before the toggle
  // used a "Header" dropdown (value "hide"), so that still hides it.
  const hideHeader = getMetadata('hide-header').trim().toLowerCase();
  if (hideHeader === 'true' || hideHeader === 'yes'
    || getMetadata('header').trim().toLowerCase() === 'hide') return;

  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);
  if (!fragment) return;

  // Data-layer component type. The header lives outside <main>, so the
  // central decorateDataLayerHooks() cannot tag it — set it on the block here.
  block.dataset.blockType = 'nav';

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Main navigation');
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(c);
  });

  // class the authored paragraph wrappers (logo button-container, tools text)
  // so CSS resets them via a class rather than a bare `p` element selector
  nav.querySelectorAll('p').forEach((p) => p.classList.add('text'));

  // group brand + sections + tools into the glass pill so its background
  // applies only to them; the hamburger is added later as a sibling of the
  // pill (a separate glass tile on mobile), matching the Figma layout
  const navPill = document.createElement('div');
  navPill.className = 'pill';
  ['.brand', '.sections', '.tools'].forEach((sel) => {
    const section = nav.querySelector(sel);
    if (section) navPill.append(section);
  });
  nav.append(navPill);

  const navBrand = nav.querySelector('.brand');
  const brandLink = navBrand?.querySelector('.button');
  if (brandLink) {
    brandLink.className = '';
    brandLink.closest('.button-container').className = '';
  }
  // the logo is authored as a plain image; link it to the home page (the
  // folder the nav lives in) unless the author has already linked it
  const logoPicture = navBrand?.querySelector('picture');
  if (logoPicture && !logoPicture.closest('a')) {
    const homeLink = document.createElement('a');
    homeLink.href = navPath.replace(/[^/]*$/, '');
    logoPicture.replaceWith(homeLink);
    homeLink.append(logoPicture);
  }
  // class the brand link + logo image so CSS targets classes, not tags; the
  // link holds only the image, so it is named for screen readers
  const logoLink = navBrand?.querySelector('a');
  logoLink?.classList.add('logo');
  logoLink?.setAttribute('aria-label', 'Home');
  if (logoLink && !logoLink.dataset.cta) logoLink.dataset.cta = 'teaser-nav:home:view';
  const logoImg = navBrand?.querySelector('img');
  if (logoImg) {
    logoImg.classList.add('logo-img');
    // the logo is the page's LCP element: authored images are lazy by default, so fetch it now
    logoImg.loading = 'eager';
    logoImg.fetchPriority = 'high';
  }

  // tag the RESERVE call-to-action (last authored link in the tools section)
  // so CSS renders it as a solid-white chip; it stays visible alongside the
  // hamburger on mobile rather than collapsing into the menu
  const navTools = nav.querySelector('.tools');
  const ctaLink = navTools?.querySelector('a:last-of-type');
  if (ctaLink) {
    ctaLink.classList.add('cta');
    if (!ctaLink.dataset.cta) ctaLink.dataset.cta = 'teaser-nav:brand-launch:notify-me';
  }

  const navSections = nav.querySelector('.sections');
  if (navSections) {
    // class the authored list, items and links so CSS targets classes not tags
    navSections.querySelector('ul')?.classList.add('list');
    navSections.querySelectorAll('a').forEach((a) => {
      a.classList.add('link');
      // interest comes from the link's own text, so a renamed or newly added
      // nav item gets tracked automatically with no code change here
      if (!a.dataset.cta) a.dataset.cta = `teaser-nav:${token(a.textContent) || 'not-set'}:view`;
    });
    navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
      navSection.classList.add('item');
      const submenu = navSection.querySelector('ul');
      if (submenu) {
        navSection.classList.add('drop');
        // class the authored sub-menu list so CSS targets a class, not `ul`
        submenu.classList.add('submenu');
      }
      navSection.addEventListener('click', () => {
        if (isDesktop.matches) {
          const expanded = navSection.getAttribute('aria-expanded') === 'true';
          toggleAllNavSections(navSections);
          navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });
    });
  }

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('hamburger');
  hamburger.innerHTML = `<button type="button" class="hamburger-button" aria-controls="nav" aria-label="Open navigation">
      <span class="hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  // append after the pill so the mobile row reads: [ pill ] [ hamburger tile ]
  nav.append(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  window.addEventListener('touchmove', blockBackgroundScroll, { capture: true, passive: false });
  window.addEventListener('wheel', blockBackgroundScroll, { capture: true, passive: false });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
