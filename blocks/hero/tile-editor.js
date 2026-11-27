/* Hero Tech Slides, editor only: drag or nudge the close-up tile, save its Tile Position */

const STEP = 0.5;
const BIG_STEP = 5;
const SAVE_DELAY = 700;
// a press that moves less than this (px) is a click, left to the editor
const DRAG_THRESHOLD = 4;
const MOVE_HINT = 'Drag to move the tile (arrow keys nudge it, Shift for bigger steps)';

const round = (n) => Math.round(n * 10) / 10;
const coordinates = ({ x, y }) => `${round(x)}, ${round(y)}`;

/** the slide's path in the repository, from its Universal Editor resource */
function resourcePath(resource) {
  const match = /^urn:[^:]+:(\/.+)$/.exec(resource || '');
  return match ? match[1] : null;
}

// AEM's CSRF tokens last a few minutes: a fresh one for each save
async function csrfToken() {
  let res;
  try {
    res = await fetch('/libs/granite/csrf/token.json', { credentials: 'same-origin', cache: 'no-store' });
  } catch (err) {
    throw new Error(`no security token (${err.message || 'network error'})`);
  }
  if (!res.ok) throw new Error(`no security token (HTTP ${res.status})`);
  const { token } = await res.json().catch(() => ({}));
  if (!token) throw new Error('no security token (empty answer)');
  return token;
}

/** a short plain-text summary of an error page, for the console */
async function summary(res) {
  const text = await res.text().catch(() => '');
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return (doc.body?.textContent || '').split(/\s+/).join(' ').trim().slice(0, 200);
}

/** saves one field of the slide, retrying once with a new token */
async function saveField(path, name, value) {
  const post = async () => {
    const token = await csrfToken();
    const body = new URLSearchParams();
    body.append(name, value);
    body.append('_charset_', 'utf-8');
    try {
      return await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'CSRF-Token': token },
        body,
      });
    } catch (err) {
      throw new Error(`no answer from AEM (${err.message || 'network error'})`);
    }
  };
  let res = await post();
  if (res.status === 403) res = await post();
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error('Tile Position not saved', {
      path, field: name, status: res.status, detail: await summary(res),
    });
    throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** makes the tiles draggable and saves their position */
export default function editTiles({
  block, tiles, mobileQuery, geometry, move, source,
}) {
  // the x, y badge beside the tile being moved, and the save status
  const badge = document.createElement('span');
  badge.className = 'ts-tile-coords';
  badge.hidden = true;
  block.append(badge);
  let badgeTimer = 0;
  const showBadge = (i, text, linger = 0) => {
    clearTimeout(badgeTimer);
    const { x, y } = geometry.fit(i, geometry.toPx(i, geometry.position(i)));
    badge.textContent = text;
    badge.style.setProperty('--ts-badge-x', `${x}px`);
    badge.style.setProperty('--ts-badge-y', `${y}px`);
    badge.classList.toggle('is-below', y < block.clientHeight * 0.2);
    badge.hidden = false;
    if (linger) {
      badgeTimer = setTimeout(() => {
        badge.hidden = true;
      }, linger);
    }
  };

  // moved by the author: kept on screen, then shown and named in the badge
  const place = (i, px) => {
    const mobile = mobileQuery.matches;
    const pct = geometry.toPct(i, geometry.fit(i, px));
    const value = { x: round(pct.x), y: round(pct.y) };
    move(i, mobile, value);
    showBadge(i, `${coordinates(value)}${mobile ? ' · mobile' : ''}`);
    return value;
  };

  // saves run one after the other, each with its own value
  let saving = Promise.resolve();
  const commit = (tile, value, mobile) => {
    const path = resourcePath(tile.resource);
    const field = mobile ? 'tilePositionMobile' : 'tilePosition';
    const label = mobile ? 'Tile Position (Mobile)' : 'Tile Position';
    const xy = coordinates(value);
    saving = saving.then(async () => {
      showBadge(tile.index, `${xy} · saving…`);
      try {
        if (!path) throw new Error('no slide to save to');
        await saveField(path, field, xy);
        showBadge(tile.index, `${xy} · saved to ${label}`, 2000);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Tile Position not saved', path, err);
        const copied = await copy(xy);
        const why = err?.message || 'unknown error';
        showBadge(tile.index, `${xy} · not saved (${why})${copied ? ', copied' : ''}: write it in ${label}`, 10000);
      }
    });
  };

  let dragged = false;
  tiles.forEach((tile) => {
    const { el, index } = tile;
    el.classList.add('is-editable');
    el.tabIndex = 0;
    el.title = MOVE_HINT;
    el.setAttribute('aria-label', `Close-up tile. ${MOVE_HINT}`);
    // a quick first move would start the browser's own drag of the image
    el.addEventListener('dragstart', (e) => e.preventDefault());

    // hover or focus: the tile's x, y and where it comes from (its field, or the default)
    let busy = false;
    const describe = () => {
      if (busy) return;
      const shown = geometry.fit(index, geometry.toPx(index, geometry.position(index)));
      const now = geometry.toPct(index, shown);
      const from = source ? ` · ${source(index)}` : '';
      showBadge(index, `${coordinates(now)}${from}`, 5000);
    };
    el.addEventListener('pointerenter', describe);
    el.addEventListener('focus', describe);

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const from = geometry.fit(index, geometry.toPx(index, geometry.position(index)));
      const start = { x: e.clientX, y: e.clientY };
      const mobile = mobileQuery.matches;
      let moving = false;
      let value = null;
      el.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moving && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moving = true;
        busy = true;
        el.classList.add('is-moving');
        value = place(index, { x: from.x + dx, y: from.y + dy });
      };
      const end = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.classList.remove('is-moving');
        busy = false;
        if (!moving || !value) return;
        dragged = true;
        commit(tile, value, mobile);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });

    let nudgeTimer = 0;
    el.addEventListener('keydown', (e) => {
      const [dx, dy] = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
      }[e.key] || [];
      if (dx === undefined) return;
      // the hero's own arrow keys change slides: not while the tile has focus
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? BIG_STEP : STEP;
      const now = geometry.position(index);
      const mobile = mobileQuery.matches;
      const next = { x: now.x + dx * step, y: now.y + dy * step };
      const value = place(index, geometry.toPx(index, next));
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => commit(tile, value, mobile), SAVE_DELAY);
    });
  });

  // a drag ends in a click on the tile: the editor must not take it (capture, before it)
  block.addEventListener('click', (e) => {
    if (!dragged) return;
    dragged = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
