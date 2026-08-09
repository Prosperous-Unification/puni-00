import { useSyncExternalStore } from 'react';

/**
 * Which of the two things that can draw a plan is drawing it.
 *
 * Two renderers of one plan, not two components with two copies of the state:
 * `WbsTable` owns everything either of them needs and swaps only what it
 * renders at the end. `openspec/changes/mobile-cards/design.md` has why the
 * switch sits there and not above it.
 */
export type PlanRenderer = 'cards' | 'table';

/**
 * The width the table stops being the right answer at, in CSS pixels.
 *
 * 768 is the width the table cannot be made to fit rather than a convention
 * borrowed from a framework: a two-phase plan's columns add up to about 1106px
 * before anything scrolls (`table-frame.ts`), and every way of closing that gap
 * — smaller type, fewer columns, a horizontal scroll — is a table nobody can
 * read on a phone. Below this the plan is cards.
 */
export const CARDS_BELOW = 768;

/**
 * Which renderer a viewport this wide gets.
 *
 * Pure, and the only place the number is compared, because this is where the
 * fault would live — {@link useRendererForViewport} does nothing but feed it a
 * width. The question is the viewport's width and nothing else: not the
 * pointer, not the user agent, not the orientation, so a narrow window on a
 * laptop is answered exactly as a phone is.
 */
export function rendererForWidth(width: number): PlanRenderer {
  return width < CARDS_BELOW ? 'cards' : 'table';
}

/**
 * Tells React when to ask again, which is whenever the window changes size.
 *
 * A rotation, a browser chrome that appears, a desktop window dragged narrow:
 * all of them are one `resize`. Nothing here is debounced — the snapshot below
 * is a string of two values, so a burst of resize events that do not cross the
 * breakpoint produce one unchanged snapshot and no re-render at all.
 */
function subscribeToResize(onResize: () => void): () => void {
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
  };
}

/**
 * The renderer this viewport asks for, following it while the page is open.
 *
 * `window.innerWidth` rather than `matchMedia`, which is the idiomatic answer
 * and is not available: **jsdom 24 ships no `window.matchMedia` at all** —
 * probed on 2026-08-09, not assumed — so a hook built on it would throw in
 * every one of this app's tests, and the usual repair is a stub that always
 * answers `false`, which is a breakpoint test asserting the stub.
 *
 * `useSyncExternalStore` rather than a `useState` an effect writes after the
 * first paint: on a phone that first paint is the whole table laid out at
 * 1106px and thrown away. The snapshot is a primitive, so React compares it by
 * value and a resize that does not cross the breakpoint re-renders nothing.
 */
export function useRendererForViewport(): PlanRenderer {
  return useSyncExternalStore(subscribeToResize, () => rendererForWidth(window.innerWidth));
}
