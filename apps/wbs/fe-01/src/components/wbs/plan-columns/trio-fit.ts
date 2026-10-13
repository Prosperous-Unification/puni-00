/**
 * The attribute a resting trio wears while it does not fit its box whole.
 *
 * `styles.css` drops the trio's ink under it (and gives it back on focus), so
 * a staffed step cell reads `2 · LT` rather than `1/… 2 · LT`: the trio is the
 * first thing a folded step cell gives up, whole and to its card, before the
 * initials or the corner glyph lose a pixel (UI review F-034, 2026-10-13).
 */
export const TRIO_CLIPPED = 'data-trio-clipped';

/**
 * Whether a box's text runs past it — the one layout fact the drop depends on.
 *
 * `scrollWidth` reads the text's whole run on an `<input>` and on the parent's
 * `nowrap` span alike, ellipsis or not; `clientWidth` is what is on screen.
 */
export const overflowsBox = (element: HTMLElement): boolean =>
  element.scrollWidth > element.clientWidth;

let observer: ResizeObserver | null = null;

/**
 * One observer for every trio on the page: a box changes width when its column
 * is dragged, when the window is, and when an assignee slot appears in its
 * column. Every read happens before any write, so a frame of fifty cells
 * lays out once.
 */
function sharedObserver(): ResizeObserver {
  observer ??= new ResizeObserver((entries) => {
    const measured = entries.map(({ target }) => ({
      target,
      clipped: target instanceof HTMLElement && target.isConnected && overflowsBox(target),
    }));
    for (const { target, clipped } of measured) {
      // A row scrolled away or deleted: its box will never be seen again, and
      // an observer left holding it would keep it alive.
      if (!target.isConnected) {
        observer?.unobserve(target);
        continue;
      }
      target.toggleAttribute(TRIO_CLIPPED, clipped);
    }
  });
  return observer;
}

/**
 * Starts (or restarts) measuring one resting trio.
 *
 * Called on every render with the same node — {@link CellInput}'s `onAttach`
 * contract — and that is what keeps a trio that changed without its box
 * changing size honest: observing again resets the observation, so the
 * observer reports the box once more after this frame's layout.
 *
 * A no-op where the browser has no `ResizeObserver` — jsdom, the unit tests'
 * DOM, which lays nothing out and so has nothing that could be measured; the
 * fit is a layout fact and `e2e/plan-table-review.spec.ts` is what proves it.
 */
export function watchTrioFit(element: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  const watching = sharedObserver();
  watching.unobserve(element);
  watching.observe(element);
}
