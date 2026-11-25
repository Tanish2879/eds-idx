// only those that can snap to the start, the last one snaps to the end, the rest not at all.
export default function snapRow(row, selector) {
  let stops = [0];
  let watched = null;
  let resized = null;
  const itemsOf = () => [...row.children].filter((el) => !selector || el.matches(selector));

  const sync = () => {
    const items = itemsOf();
    const end = Math.max(0, row.scrollWidth - row.clientWidth);
    const first = items[0]?.offsetLeft ?? 0;
    // a start within half an item of the end is dropped: Safari moves one spot per swipe,
    // so a swipe back from the end would only move those few pixels
    const minGap = Math.max(2, ((items[1]?.offsetLeft ?? first) - first) / 2);
    const spots = [0];
    items.forEach((item, i) => {
      const at = item.offsetLeft - first;
      let align = 'none';
      if (!i || at < end - minGap) align = 'start';
      else if (i === items.length - 1 && end > 2) align = 'end';
      if (item.style.scrollSnapAlign !== align) item.style.scrollSnapAlign = align;
      if (i && align === 'start') spots.push(at);
      if (align === 'end') spots.push(end);
    });
    stops = spots;
    // the items scale with the screen too: watch the first for size changes
    if (items[0] !== watched) {
      if (watched) resized.unobserve(watched);
      watched = items[0] || null;
      if (watched) resized.observe(watched);
    }
  };

  resized = new ResizeObserver(sync);
  resized.observe(row);
  new MutationObserver(sync).observe(row, { childList: true });
  sync();
  return { stops: () => stops, sync };
}
