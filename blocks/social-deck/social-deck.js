import { createOptimizedPicture, loadCSS } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { token } from '../../scripts/utils/datalayer.js';

// per-slot tilt in degrees, per breakpoint
// desktop 18.85° matches the Figma arc (≈18.85° between cards)
const TILT = { desktop: 18.85, mobile: 7 };
// authored card count bounds: extras past MAX_AUTHORED are not displayed; a
// count outside [MIN_AUTHORED, MAX_AUTHORED] is warned about for the author
const MIN_AUTHORED = 6;
const MAX_AUTHORED = 12;
const AUTOPLAY_DEFAULT = 5; // seconds

// allowed image extensions for card media (JPEG/PNG only, per the field spec);
// anything else (gif, webp, svg, mp4, exe, pdf, …) is rejected so unsupported
// files never render on a card
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// true when the src points at an allowed image file (ignores query/hash)
function isImageSrc(src) {
  if (!src) return false;
  const path = src.split(/[?#]/)[0];
  const ext = path.split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

// only external http(s) URLs are allowed for the card link; internal/relative
// paths are rejected so the card renders without a link
function externalHref(value) {
  const href = (value || '').trim();
  return /^https?:\/\/.+/i.test(href) ? href : '';
}

// autoplay class values the Auto-scroll block field can produce
const AUTOPLAY_CLASSES = ['autoplay-3s', 'autoplay', 'autoplay-8s'];
// style class values the same field can produce (Strip: flat row, social-deck-strip.js)
const STYLE_CLASSES = ['strip'];
const CONFIG_CLASSES = [...AUTOPLAY_CLASSES, ...STYLE_CLASSES];

// A container block's own property (here the Auto-scroll select) does NOT
// become a class on the block — per Adobe's model docs it serializes as a
// leading single-column row before the card rows. Read that row: if it holds
// an autoplay-* value, apply the matching class to the block and remove the row
// so it isn't decorated as a card. No-op for decks with no config row (autoplay
// then still comes from section classes).
function consumeAutoplayConfig(block) {
  const first = block.firstElementChild;
  if (!first) return;
  const cells = [...first.children];
  // cards always carry an image or link; a config row is a lone plain cell
  if (cells.length !== 1) return;
  const cell = cells[0];
  if (cell.querySelector('img, a[href]')) return;
  const value = cell.textContent.trim();
  // bail if the cell holds real content that isn't one of our config values
  if (value && !CONFIG_CLASSES.includes(value)) return;
  if (CONFIG_CLASSES.includes(value)) block.classList.add(value);
  first.remove();
}

// autoplay interval (ms) from an autoplay / autoplay-8s class; 0 when off
function autoplayInterval(block) {
  const section = block.closest('.section');
  const cls = [...block.classList, ...(section ? [...section.classList] : [])];
  const timed = cls.find((c) => /^autoplay-\d+(s)?$/.test(c));
  if (timed) {
    const secs = parseInt(timed.replace(/[^\d]/g, ''), 10);
    return secs > 0 ? secs * 1000 : 0;
  }
  return cls.includes('autoplay') ? AUTOPLAY_DEFAULT * 1000 : 0;
}

// desktop: 5-slot crown, fixed radius. mobile: 3-slot, radius derived from card width
const ARC = {
  // radius 1381 pairs with the 307px Figma card so centers sit ~380px apart
  // (matches Figma) with a clean gap — the card width and arc radius are
  // coupled, so both must grow together to avoid overlap
  desktop: { radius: 1381, halfSlots: 2 },
  mobile: { halfSlots: 1 },
};

const GAP = 8; // px clearance between centre and peek cards (mobile)

// mobile card width, mirroring CSS min(62vw, 300px); radius fallback pre-CSS
const MOBILE_CARD_VW = 0.62;
const MOBILE_CARD_MAX = 300;
const mobileCardWidth = () => Math.min(window.innerWidth * MOBILE_CARD_VW, MOBILE_CARD_MAX);

// radius giving GAP clearance to the peek card's nearest corner
const mobileRadius = (cardW, cardH, tiltDeg) => {
  const rad = (tiltDeg * Math.PI) / 180;
  return ((cardW * (1 + Math.cos(rad))) / 2 + GAP) / Math.sin(rad) + cardH;
};

// Social post cards on a fixed circular arc; scroll/drag/swipe rotates the deck.
export default async function decorate(block) {
  // Stable anchor id for in-page links (e.g. #social); only set once per page.
  if (!document.getElementById('social')) block.id = 'social';

  // the section's social icon links open in a new tab
  block.closest('.section')?.querySelectorAll('.default-content-wrapper > ul a[href]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });

  // the Auto-scroll option serializes as a leading single-column config row on
  // this container block; consume it into an autoplay-* class before reading cards
  consumeAutoplayConfig(block);

  const cardRows = [...block.children];

  // Universal Editor filters cannot limit how many cards a block takes: with
  // MAX_AUTHORED cards it gets a filter that allows none, so no "Add" is offered
  if (block.closest('[data-aue-resource]') && block.dataset.aueFilter) {
    block.dataset.aueFilter = cardRows.length >= MAX_AUTHORED ? 'social-deck-full' : 'social-deck';
  }

  // build a card <li> from a row (carries UE instrumentation)
  const buildCard = (row, index) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);

    // link may serialize as an anchor or as a plain-text URL; accept either,
    // but keep only external http(s) URLs
    const anchor = row.querySelector('a[href]');
    const linkText = [...row.querySelectorAll('p')]
      .map((p) => p.textContent.trim())
      .find((t) => /^https?:\/\/.+/i.test(t));
    const href = externalHref(anchor ? anchor.getAttribute('href') : linkText);
    if (anchor) anchor.remove();
    // drop a plain-text URL paragraph so it isn't mistaken for the caption
    if (!anchor && href) {
      [...row.querySelectorAll('p')]
        .filter((p) => p.textContent.trim() === href)
        .forEach((p) => p.remove());
    }

    const media = document.createElement('div');
    media.className = 'social-deck-card-media';

    const img = row.querySelector('img');
    if (img && isImageSrc(img.src)) {
      const pic = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '440' }]);
      moveInstrumentation(img, pic.querySelector('img'));
      // Images are draggable by default; without this, pressing on one starts the browser's own
      // native image drag instead of the deck's own pointer-drag, and — since a native drag ends
      // in pointercancel rather than pointerup — leaves the page's snap-scroll stuck disabled.
      pic.querySelector('img').draggable = false;
      media.append(pic);
    }

    const texts = [...row.querySelectorAll('p')]
      .filter((p) => !p.querySelector('img') && p.textContent.trim())
      .map((p) => p.textContent.trim());

    const caption = texts[0] || '';

    const body = document.createElement('div');
    body.className = 'social-deck-card-body';
    if (caption) {
      const cap = document.createElement('p');
      cap.textContent = caption;
      body.append(cap);
    }
    if (body.children.length) media.append(body);

    if (href) {
      const a = document.createElement('a');
      a.className = 'social-deck-card-link';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      // Data-layer CTA identity: social-deck:<topic>:watch. All tiles share the
      // same destination URL, so identity comes from data-cta, never the href.
      // The topic is derived from the authored caption; "not-set" when absent.
      a.dataset.cta = `social-deck:${token(caption) || 'not-set'}:watch`;
      a.dataset.ctaPosition = index + 1;
      a.append(media);
      li.append(a);
    } else {
      li.append(media);
    }
    return li;
  };

  const authored = cardRows.map((row, index) => buildCard(row, index));
  const count = authored.length;

  // enforce/flag the authored card count: the arc only uses the first
  // MAX_AUTHORED cards, so extras are effectively ignored; warn either way so
  // authors know when they're outside the supported 6–12 range
  if (count > MAX_AUTHORED) {
    // eslint-disable-next-line no-console
    console.warn(`Social Deck: ${count} cards authored; only the first ${MAX_AUTHORED} are shown (maximum ${MAX_AUTHORED}).`);
  } else if (count && count < MIN_AUTHORED && !block.classList.contains('strip')) {
    // the arc needs MIN_AUTHORED to fill its crown; the Strip style takes any count
    // eslint-disable-next-line no-console
    console.warn(`Social Deck: only ${count} card(s) authored; at least ${MIN_AUTHORED} are recommended.`);
  }

  const stage = document.createElement('div');
  stage.className = 'social-deck-stage';
  // cards are absolute + overflow:hidden, which section-snap would read as a floating overlay
  // and swallow the wheel; tell it this is normal page content
  stage.dataset.snapPassthrough = '';
  // sideways swipes on the deck belong to the deck: section-snap must not read their vertical
  // finger drift as a swipe to the next section
  stage.dataset.snapHorizontal = '';

  const ring = document.createElement('ul');
  ring.className = 'social-deck-cards';
  stage.append(ring);

  // keep the instrumented authored cards in the DOM (hidden) so UE can still
  // add/select them; the visible arc is built from clones
  const source = document.createElement('ul');
  source.className = 'social-deck-source';
  source.setAttribute('aria-hidden', 'true');
  authored.forEach((li) => source.append(li));

  block.replaceChildren(stage, source);

  if (!count) return;

  // Strip style: a flat row instead of the arc; its CSS/JS are fetched only
  // when the style is used
  if (block.classList.contains('strip')) {
    const [, { default: decorateStrip }] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/social-deck/social-deck-strip.css`),
      import('./social-deck-strip.js'),
    ]);
    decorateStrip(block, {
      stage, ring, source, authored, max: MAX_AUTHORED,
    });
    return;
  }

  const desktop = window.matchMedia('(min-width: 900px)');
  let { radius, halfSlots } = ARC.desktop;
  let tilt = TILT.desktop;
  // Horizontal stretch applied to each card's x position only (never to rotation or the card's
  // own size), solved per-viewport in fitToViewport() so the outermost card's corner reaches the
  // stage edge on wide/ultrawide desktop screens. 1 = untouched circle (today's layout); mobile
  // never changes this.
  let scaleX = 1;

  const usable = Math.min(count, MAX_AUTHORED);
  const arcCount = ARC.desktop.halfSlots * 2 + 1 + 4; // 5 visible + 2 buffer each side
  const arcCards = [];
  let scrollAngle = 0; // degrees; 0 = card 0 centred
  let velocity = 0;
  let raf = 0;
  let autoDir = 1; // autoplay direction: follows the way the user last moved the deck

  // props at a (fractional) slot position (0 = centre)
  const slotProps = (pos) => {
    const angle = pos * tilt;
    const rad = (angle * Math.PI) / 180;
    return {
      x: radius * Math.sin(rad) * scaleX,
      y: radius * (1 - Math.cos(rad)),
      rot: angle,
      brightness: Math.max(0, 1 - Math.abs(pos) * 0.12),
      z: 100 - Math.round(Math.abs(pos) * 10),
    };
  };

  const cardData = (idx) => authored[((idx % usable) + usable) % usable];

  // strip UE instrumentation from clones so they don't show as stray tree nodes
  const stripInstrumentation = (root) => {
    [root, ...root.querySelectorAll('*')].forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (attr.name.startsWith('data-aue-') || attr.name.startsWith('data-richtext-')) {
          el.removeAttribute(attr.name);
        }
      });
    });
  };

  const setContent = (arc, idx) => {
    const src = cardData(idx);
    const srcLink = src.querySelector('.social-deck-card-link');
    const srcMedia = src.querySelector('.social-deck-card-media');
    arc.media.innerHTML = srcMedia ? srcMedia.innerHTML : '';
    stripInstrumentation(arc.media);
    const href = srcLink ? srcLink.getAttribute('href') : '';
    if (href) arc.a.setAttribute('href', href); else arc.a.removeAttribute('href');
    // Copy data-cta/data-cta-position to the clone — it's the clickable card,
    // so cta.js and componentOf() need them for ctaClick.
    const cta = srcLink ? srcLink.dataset.cta : '';
    if (cta) arc.a.dataset.cta = cta; else delete arc.a.dataset.cta;
    const ctaPosition = srcLink ? srcLink.dataset.ctaPosition : '';
    if (ctaPosition) arc.a.dataset.ctaPosition = ctaPosition; else delete arc.a.dataset.ctaPosition;
    arc.dataIdx = idx;
  };

  const buildArc = () => {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < arcCount; i += 1) {
      const li = document.createElement('li');
      li.className = 'social-deck-arc-card';
      const a = document.createElement('a');
      a.className = 'social-deck-card-link';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const media = document.createElement('div');
      media.className = 'social-deck-card-media';
      a.append(media);
      // darkens the outer cards: a fading layer, not a filter Safari repaints every frame
      const dim = document.createElement('span');
      dim.className = 'social-deck-card-dim';
      dim.setAttribute('aria-hidden', 'true');
      li.append(a, dim);
      // dataIdx null (not -1, a real wrapped index) so paint() never skips first fill
      const arc = {
        li, a, media, dim, dataIdx: null,
      };
      arcCards.push(arc);
      frag.append(li);
    }
    ring.append(frag);
  };

  const FADE_BAND = 0.6; // slots past the edge over which cards fade out

  const paint = () => {
    const centreFloat = scrollAngle / tilt;
    const baseIdx = Math.round(centreFloat);
    arcCards.forEach((_, i) => {
      const dataIdx = baseIdx + (i - Math.floor(arcCount / 2));
      // a post keeps its slot while in view: only the slot wrapping round, out of sight, refills
      const arc = arcCards[((dataIdx % arcCount) + arcCount) % arcCount];
      const pos = dataIdx - centreFloat;
      const over = Math.abs(pos) - halfSlots; // >0 past the outermost slot
      if (arc.dataIdx !== dataIdx) setContent(arc, dataIdx);
      if (over > FADE_BAND) {
        arc.li.style.visibility = 'hidden';
        return;
      }
      arc.li.style.visibility = 'visible';
      const p = slotProps(pos);
      const opacity = over <= 0 ? 1 : Math.max(0, 1 - over / FADE_BAND);
      arc.li.style.transform = `translate(-50%, 0) translateX(${p.x}px) translateY(${p.y}px) rotate(${p.rot}deg)`;
      arc.dim.style.opacity = `${(1 - p.brightness).toFixed(3)}`;
      arc.li.style.opacity = `${opacity}`;
      arc.li.style.zIndex = `${p.z}`;
    });
  };

  // momentum + snap
  const FRICTION = 0.95;
  const SETTLE = 0.12;
  // velocity cap: desktop ~one slot step. Mobile slots are only 7deg apart, so a gentle cap keeps
  // the coast after release (cap / (1 - FRICTION) degrees) to about half a card: one simple swipe
  // moves one card instead of flinging several.
  const maxV = () => (desktop.matches ? tilt * 1.1 : tilt * 0.03);
  const SNAP_EASE = 0.14;
  let snapTarget = 0;

  const snapStep = () => {
    const diff = snapTarget - scrollAngle;
    if (Math.abs(diff) < 0.05) {
      scrollAngle = snapTarget;
      raf = 0;
      paint();
      return;
    }
    scrollAngle += diff * SNAP_EASE;
    paint();
    raf = requestAnimationFrame(snapStep);
  };

  const startSnap = () => {
    snapTarget = Math.round(scrollAngle / tilt) * tilt;
    raf = requestAnimationFrame(snapStep);
  };

  const momentum = () => {
    scrollAngle += velocity;
    velocity *= FRICTION;
    paint();
    if (Math.abs(velocity) > SETTLE) {
      raf = requestAnimationFrame(momentum);
    } else {
      velocity = 0;
      startSnap();
    }
  };

  const stopAnim = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    velocity = 0;
  };

  const addVelocity = (deltaDeg) => {
    if (deltaDeg) autoDir = deltaDeg > 0 ? 1 : -1;
    stopAnim();
    const cap = maxV();
    velocity = Math.max(-cap, Math.min(cap, velocity + deltaDeg));
    raf = requestAnimationFrame(momentum);
  };

  // Mobile/tablet wheel/trackpad: exactly one card per gesture. Wheel momentum keeps firing
  // events after the step, so stay locked until input has been quiet — unless a clearly new,
  // strong notch arrives once the step has settled. Desktop keeps the free-spinning momentum.
  const WHEEL_QUIET_MS = 120;
  const WHEEL_NOTCH_MIN = 50; // one mouse-wheel notch is ~100, well above a decayed trackpad tail
  // A diagonal trackpad swipe drifts vertically like a finger does: only count it as vertical
  // (hand off to the page) when it clearly is, not merely slightly more vertical than horizontal.
  const WHEEL_VERTICAL_BIAS = 1.8;
  let wheelLocked = false;
  let wheelTimer;
  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) * WHEEL_VERTICAL_BIAS) return;
    if (!e.deltaX) return;
    e.preventDefault();
    if (desktop.matches) {
      addVelocity(e.deltaX * 0.03);
      return;
    }
    if (wheelLocked && !raf && Math.abs(e.deltaX) >= WHEEL_NOTCH_MIN) wheelLocked = false;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelLocked = false; }, WHEEL_QUIET_MS);
    if (wheelLocked) return;
    wheelLocked = true;
    stopAnim();
    const dir = e.deltaX > 0 ? 1 : -1;
    autoDir = dir;
    snapTarget = (Math.round(scrollAngle / tilt) + dir) * tilt;
    raf = requestAnimationFrame(snapStep);
  }, { passive: false });

  // pointer drag / touch swipe
  let dragging = false;
  let dragId = -1;
  let lastX = 0;
  let startY = 0;
  let locked = false;
  let dragVel = 0;
  let moved = 0;
  const LOCK = 6;
  const DRAG_SENS = 0.12; // deg per px (desktop)
  const DRAG_SENS_MOBILE = 0.08; // gentler on mobile so a short swipe travels less than a card
  // A real drag never travels perfectly sideways — natural hand/finger jitter in the first few
  // pixels can tip dy slightly past dx even when the intent is clearly horizontal. Same bias used
  // for the wheel and touch axis checks elsewhere: only a gesture that's unambiguously vertical
  // hands off to the page; anything else stays with the deck.
  const DRAG_VERTICAL_BIAS = 1.8;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    dragId = e.pointerId;
    lastX = e.clientX;
    startY = e.clientY;
    locked = false;
    dragVel = 0;
    moved = 0;
    stopAnim();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dy) > Math.abs(dx) * DRAG_VERTICAL_BIAS) { // vertical intent -> let page scroll
        dragging = false;
        return;
      }
      locked = true;
      stage.setPointerCapture(e.pointerId);
    }
    // horizontal touch drag belongs to the deck: keep section-snap's window-level Observer from
    // reading the drag's small vertical drift as a swipe to the next section
    if (e.pointerType !== 'mouse') e.stopPropagation();
    lastX = e.clientX;
    moved += Math.abs(dx);
    const d = -dx * (desktop.matches ? DRAG_SENS : DRAG_SENS_MOBILE);
    scrollAngle += d;
    if (d) autoDir = d > 0 ? 1 : -1;
    dragVel = dragVel * 0.6 + d * 0.4;
    paint();
  });

  // same for the touch-event stream (Observer may listen to either)
  stage.addEventListener('touchmove', (e) => {
    if (locked) e.stopPropagation();
  }, { passive: true });

  const endDrag = (e) => {
    if (!dragging || (e && e.pointerId !== dragId)) return;
    dragging = false;
    locked = false;
    const cap = maxV();
    velocity = Math.max(-cap, Math.min(cap, dragVel));
    if (Math.abs(velocity) > SETTLE) {
      raf = requestAnimationFrame(momentum);
    } else {
      startSnap();
    }
  };

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // suppress the link click after a drag
  stage.addEventListener('click', (e) => {
    if (moved > LOCK) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  const DESKTOP_STAGE_H = 760; // must match .social-deck-stage height in CSS
  const FIT_BREATHING = 24; // clearance below the cards
  const MIN_SCALE = 0.5; // scale floor
  const MAX_SCALE = 2; // scale ceiling

  // Desktop: scale the whole composition by one factor to fill the fold (section svh).
  let fitting = false; // re-entrancy guard: our var/height writes retrigger the RO
  const fitToViewport = () => {
    if (fitting) return;
    fitting = true;
    try {
      const section = block.closest('.section');
      if (!desktop.matches || !section) {
        scaleX = 1;
        section?.style.removeProperty('--sd-scale');
        stage.style.height = '';
        ring.style.transform = '';
        ring.style.transformOrigin = '';
        return;
      }
      // measure at full size (s = 1, fan untransformed)
      section.style.setProperty('--sd-scale', '1');
      stage.style.height = `${DESKTOP_STAGE_H}px`;
      ring.style.transform = '';
      ring.style.transformOrigin = '';

      const sectionTop = section.getBoundingClientRect().top;
      const stageTop = stage.getBoundingClientRect().top;
      const apexTop = ring.getBoundingClientRect().top; // arc apex
      // the three least-rotated visible cards
      const central = arcCards
        .filter((c) => c.li.style.visibility !== 'hidden')
        .map((c) => ({
          c,
          rot: Math.abs(parseFloat(c.li.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] || '0')),
        }))
        .sort((a, b) => a.rot - b.rot)
        .slice(0, 3);
      // distances above and below the apex (section top → apex, apex → lowest card)
      const aboveApex = apexTop - sectionTop;
      const extent = Math.max(
        ...central.map(({ c }) => c.li.getBoundingClientRect().bottom - apexTop),
      );
      const ringWithinStage = apexTop - stageTop; // apex offset inside the stage

      // scale the composition to fill the fold, minus a breath; floored/capped
      const available = section.clientHeight - FIT_BREATHING;
      const denom = aboveApex + extent;
      const s = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, denom > 0 ? available / denom : 1),
      );

      // Stretch the outermost card's x out to the stage edge. stage.clientWidth is read in real
      // (post-scale) screen px, so it's divided by s to land in the same unscaled-ring space as
      // radius/x/cardW below (the ring itself is scaled uniformly afterwards via `scale(s)`).
      // Only x moves — rotation and the card's own width are untouched, so no distortion.
      const halfW = (stage.clientWidth / 2) / s;
      const cardW = arcCards[0].li.offsetWidth; // measured at scale 1, already unscaled
      const outerRad = (halfSlots * tilt * Math.PI) / 180;
      const rawX = radius * Math.sin(outerRad);
      // Floored at 1 (never pulled inward) — only stretches when the circle alone falls short
      // of the edge; a narrow desktop window near 900px already reaches it unaided.
      scaleX = rawX > 0
        ? Math.max(1, (halfW - (cardW / 2) * Math.cos(outerRad)) / rawX)
        : 1;
      paint(); // re-render at the stretched x before measuring/setting the stage height below

      section.style.setProperty('--sd-scale', `${s}`);
      ring.style.transformOrigin = '0 0'; // apex: horizontal centre, ring top
      ring.style.transform = `scale(${s})`;
      // stage box tracks the scaled fan so it reserves exactly the fan's height
      const h = Math.max(0, Math.round((ringWithinStage + extent) * s + FIT_BREATHING));
      stage.style.height = `${h}px`;
    } finally {
      fitting = false;
    }
  };

  const applyBreakpoint = () => {
    // scrollAngle is in tilt units; rescale so the same card stays centred
    const slotOffset = tilt ? scrollAngle / tilt : 0;
    if (desktop.matches) {
      ({ radius, halfSlots } = ARC.desktop);
      tilt = TILT.desktop;
    } else {
      halfSlots = ARC.mobile.halfSlots;
      tilt = TILT.mobile;
      scaleX = 1; // mobile is always the unstretched circle — unchanged from before
      // measured size, computed fallback pre-CSS (3:4 card)
      const cardW = arcCards[0].li.offsetWidth || mobileCardWidth();
      const cardH = arcCards[0].li.offsetHeight || cardW * (4 / 3);
      radius = mobileRadius(cardW, cardH, tilt);
    }
    scrollAngle = slotOffset * tilt;
    paint(); // position cards first so fitToViewport can measure their rotations
    fitToViewport();
  };

  buildArc();
  applyBreakpoint();
  desktop.addEventListener('change', () => { stopAnim(); applyBreakpoint(); });
  const ro = new ResizeObserver(() => {
    stopAnim();
    if (desktop.matches) fitToViewport(); else applyBreakpoint();
  });
  ro.observe(stage);
  // window resize changes available height (100vh), so re-fit the desktop arc
  window.addEventListener('resize', () => { if (desktop.matches) fitToViewport(); });

  // auto-scroll: pauses on hover/interaction or offscreen. Reduced-motion
  // visitors still get rotation, but each advance is an instant jump (no slide)
  // so we honor their preference without disabling autoplay entirely.
  const interval = autoplayInterval(block);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // autoplay runs whenever a speed is selected and at least one card exists;
  // with a single card the deck still rotates through its repeated slots
  if (interval && usable >= 1) {
    let timer = 0;
    let paused = false;

    const advance = () => {
      snapTarget = (Math.round(scrollAngle / tilt) + autoDir) * tilt;
      if (raf) cancelAnimationFrame(raf);
      if (reduceMotion) {
        // jump straight to the next card without animating the transition
        scrollAngle = snapTarget;
        paint();
      } else {
        raf = requestAnimationFrame(snapStep);
      }
    };

    const play = () => {
      if (timer || paused) return;
      timer = window.setInterval(advance, interval);
    };
    const pause = () => {
      if (timer) { window.clearInterval(timer); timer = 0; }
    };

    stage.addEventListener('pointerenter', pause);
    stage.addEventListener('pointerleave', () => { if (!paused) play(); });
    stage.addEventListener('pointerdown', pause);
    stage.addEventListener('focusin', pause);
    stage.addEventListener('focusout', () => { if (!paused) play(); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(); else if (!paused) play();
    });
    const io = new IntersectionObserver((entries) => {
      paused = !entries[0].isIntersecting;
      if (paused) pause(); else play();
    }, { threshold: 0.2 });
    io.observe(stage);

    play();
  }
}
