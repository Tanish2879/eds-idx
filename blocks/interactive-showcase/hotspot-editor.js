/*
 * interactive-showcase, Universal Editor only (loaded by interactive-showcase.js in the editor):
 * the + points can be dragged on the showcase image, or nudged with the arrow keys once one is
 * focused (Shift for bigger steps). On release the new x, y is written into that point's bullet
 * of the item's Hotspots field (title and text kept) and saved to the item. Clicking the image
 * anywhere else shows the x, y at that spot and copies it, for writing a new bullet.
 * x and y are as authored: percentages of the image from its bottom-left corner.
 * The frames run some images off the card's edges (cut off, as designed): a + can only be moved
 * within the part of the image the card shows, and one authored in the cut-off part is drawn at
 * the nearest visible edge, outlined, until it is moved in.
 */

const STEP = 0.5;
const BIG_STEP = 5;
const SAVE_DELAY = 700;
// a press that moves less than this (px) is a click: it opens the tooltip as usual
const DRAG_THRESHOLD = 4;
// a + (60px) stays this far (px) inside the card's edges, so all of it is seen
const EDGE = 34;
const MOVE_HINT = 'Drag to move (arrow keys nudge, Shift for bigger steps)';

const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const round = (n) => Math.round(n * 10) / 10;

/**
 * the part of the image the card shows, in % of the image (y from the top), EDGE px inside the
 * card's edges; measured from offsets, which leave out the slide animation's transforms
 */
function visibleArea(figure) {
  const stage = figure.closest('.stage');
  const w = figure.offsetWidth;
  const h = figure.offsetHeight;
  if (!stage || !w || !h) {
    return {
      x0: 0, x1: 100, y0: 0, y1: 100,
    };
  }
  let left = 0;
  let top = 0;
  for (let n = figure; n && n !== stage; n = n.offsetParent) {
    left += n.offsetLeft;
    top += n.offsetTop;
  }
  const x0 = clamp(((EDGE - left) / w) * 100);
  const y0 = clamp(((EDGE - top) / h) * 100);
  return {
    x0,
    y0,
    x1: Math.max(x0, clamp(((stage.clientWidth - EDGE - left) / w) * 100)),
    y1: Math.max(y0, clamp(((stage.clientHeight - EDGE - top) / h) * 100)),
  };
}

/** "x, y" as authored (spot.y is kept from the top, as the stylesheet places it) */
const coordinates = (x, yFromTop) => `${round(x)}, ${round(100 - yFromTop)}`;

/** the bullet's text: "x, y | TITLE | description", leaving out what the author left out */
function bulletText({
  x, y, title, text,
}) {
  const parts = [coordinates(x, y)];
  if (title || text) parts.push(title);
  if (text) parts.push(text);
  return parts.join(' | ');
}

/** the item's path in the repository, from its Universal Editor resource */
function resourcePath(row) {
  const match = /^urn:[^:]+:(\/.+)$/.exec(row.dataset.aueResource || '');
  return match ? match[1] : null;
}

let csrf = null;
async function csrfToken() {
  if (!csrf) {
    csrf = fetch('/libs/granite/csrf/token.json', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`CSRF ${res.status}`))))
      .then(({ token }) => token)
      .catch((err) => {
        csrf = null;
        throw err;
      });
  }
  return csrf;
}

/** saves the Hotspots field of the item at `path` (AEM's standard content update) */
async function saveHotspots(path, html) {
  const body = new FormData();
  body.append('hotspots', html);
  body.append('_charset_', 'utf-8');
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'CSRF-Token': await csrfToken() },
    body,
  });
  if (!res.ok) throw new Error(`save ${res.status}`);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function editItem({
  row, figure, hotCell, spots,
}, closeTooltip) {
  const path = resourcePath(row);
  const bullets = hotCell ? [...hotCell.querySelectorAll('li')] : [];

  // the x, y badge beside the point being moved, and the save status
  const badge = document.createElement('span');
  badge.className = 'hotspot-coords';
  badge.hidden = true;
  figure.append(badge);
  let badgeTimer = 0;
  const showBadge = (x, y, text, linger = 0) => {
    clearTimeout(badgeTimer);
    badge.textContent = text;
    badge.style.setProperty('--interactive-showcase-x', `${x}%`);
    badge.style.setProperty('--interactive-showcase-y', `${y}%`);
    badge.classList.toggle('is-below', y < 15);
    badge.hidden = false;
    if (linger) {
      badgeTimer = setTimeout(() => {
        badge.hidden = true;
      }, linger);
    }
  };

  const draw = (entry, x, y) => {
    entry.btn.style.setProperty('--interactive-showcase-x', `${x}%`);
    entry.btn.style.setProperty('--interactive-showcase-y', `${y}%`);
  };

  // moved by the author: only within the part of the image the card shows
  const place = (entry, x, y) => {
    const area = visibleArea(figure);
    entry.spot.x = round(clamp(x, area.x0, area.x1));
    entry.spot.y = round(clamp(y, area.y0, area.y1));
    draw(entry, entry.spot.x, entry.spot.y);
    entry.btn.classList.remove('is-outside');
    entry.btn.title = MOVE_HINT;
    showBadge(entry.spot.x, entry.spot.y, coordinates(entry.spot.x, entry.spot.y));
  };

  // where a + is seen: its x, y, or for one in the cut-off part the nearest visible point
  const shownAt = (entry) => {
    const area = visibleArea(figure);
    return {
      x: clamp(entry.spot.x, area.x0, area.x1),
      y: clamp(entry.spot.y, area.y0, area.y1),
    };
  };

  // a + authored in the cut-off part is drawn at the nearest visible edge, outlined, until it
  // is moved in (its saved x, y is left as it is until then)
  const markHidden = () => {
    spots.forEach((entry) => {
      const { x, y } = entry.spot;
      const { x: shownX, y: shownY } = shownAt(entry);
      const outside = Math.abs(shownX - x) > 0.05 || Math.abs(shownY - y) > 0.05;
      draw(entry, outside ? shownX : x, outside ? shownY : y);
      entry.btn.classList.toggle('is-outside', outside);
      entry.btn.title = outside
        ? `At ${coordinates(x, y)} this point is in the part of the image the card cuts off, so it is not seen: drag it in`
        : MOVE_HINT;
    });
  };
  markHidden();
  // a quick first move would start the browser's own drag of the image under the +, which
  // cancels the + 's drag
  figure.addEventListener('dragstart', (e) => e.preventDefault());
  // sizes change as the image loads and the screen is resized
  if (window.ResizeObserver) new ResizeObserver(markHidden).observe(figure);
  window.addEventListener('resize', markHidden);

  // saves run one after the other, each with the field as it is by then
  let saving = Promise.resolve();
  const commit = (entry, index) => {
    const { x, y } = entry.spot;
    const xy = coordinates(x, y);
    if (bullets[index]) bullets[index].textContent = bulletText(entry.spot);
    const html = hotCell?.innerHTML.trim();
    saving = saving.then(async () => {
      showBadge(x, y, `${xy} · saving…`);
      try {
        if (!path || !html) throw new Error('nothing to save to');
        await saveHotspots(path, html);
        showBadge(x, y, `${xy} · saved`, 1800);
      } catch {
        const copied = await copy(xy);
        showBadge(x, y, `${xy} · not saved${copied ? ', copied' : ''}: update the bullet by hand`, 6000);
      }
    });
  };

  let dragged = false;
  spots.forEach((entry, index) => {
    const { btn } = entry;
    btn.classList.add('hotspot-draggable');

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const box = figure.getBoundingClientRect();
      // from where the + is seen (an outlined one is not at its own x, y)
      const seen = shownAt(entry);
      const start = {
        x: e.clientX, y: e.clientY, sx: seen.x, sy: seen.y,
      };
      let moving = false;
      btn.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moving && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moving) closeTooltip();
        moving = true;
        btn.classList.add('is-dragging');
        place(entry, start.sx + (dx / box.width) * 100, start.sy + (dy / box.height) * 100);
      };
      const end = () => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', end);
        btn.removeEventListener('pointercancel', end);
        btn.classList.remove('is-dragging');
        if (!moving) return;
        dragged = true;
        commit(entry, index);
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    });

    let nudgeTimer = 0;
    btn.addEventListener('keydown', (e) => {
      const [dx, dy] = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      }[e.key] || [];
      if (dx === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      closeTooltip();
      const step = e.shiftKey ? BIG_STEP : STEP;
      const seen = shownAt(entry);
      place(entry, seen.x + dx * step, seen.y + dy * step);
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => commit(entry, index), SAVE_DELAY);
    });
  });

  // a drag ends in a click on the + : it must not open the tooltip (capture, before the +)
  figure.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.target.closest('.hotspot, .tooltip')) return;
    // anywhere else on the image: show (and copy) the x, y of that spot
    const box = figure.getBoundingClientRect();
    const x = round(clamp(((e.clientX - box.left) / box.width) * 100));
    const y = round(clamp(((e.clientY - box.top) / box.height) * 100));
    const xy = coordinates(x, y);
    copy(xy).then((copied) => showBadge(x, y, copied ? `${xy} · copied` : xy, 3000));
  }, true);
}

/**
 * @param {Array} items the block's items: { row, figure, hotCell, spots: [{ btn, spot }] }
 * @param {Function} closeTooltip closes the open tooltip, if any
 */
export default function editHotspots(items, closeTooltip) {
  items.forEach((item) => editItem(item, closeTooltip));
}
