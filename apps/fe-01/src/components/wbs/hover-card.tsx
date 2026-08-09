import type { CSSProperties, ReactNode } from 'react';

export interface HoverCardProps {
  /**
   * What the card is, for a screen reader — it names the row, because a table
   * of forty of these otherwise announces "tooltip" and nothing else.
   */
  label: string;
  /**
   * Whether this card scrolls its own content, and so has to take the wheel.
   *
   * The Name cell's preview alone. See {@link HoverCard} for why every other
   * card is pointer-transparent.
   */
  scrolls?: boolean;
  children: ReactNode;
}

/** How tall a scrolling card may get before the rest of it is scrolled to. */
const SCROLLING_MAX_HEIGHT = 320;

/**
 * The box a cell opens over the rows below when the mouse rests on it: the
 * whole of what the cell's at-rest face folds away.
 *
 * Placement, not content. Every card is an absolutely positioned child of the
 * cell's own `position: relative` wrapper, opening from the wrapper's bottom
 * edge — which is why the `<td>` it sits in has to be exempt from the grid's
 * `overflow: hidden` (`opensAPopover` in `wbs-table.tsx` is what exempts it;
 * the containing block is inside the clipper, so no styling here can escape
 * it).
 *
 * **A card does not take the pointer.** `pointer-events: none` is the default
 * and it is load-bearing rather than tidy: a card hangs over the row beneath
 * it, and one that takes the mouse eats a click aimed at that row — found in a
 * browser during the fix round, not reasoned about. A card is something to
 * read; the only reason to take the pointer back is content taller than the
 * card, which has to be scrollable to be readable at all, and {@link
 * HoverCardProps.scrolls} is that one exception.
 *
 * No delay, no follow-cursor, no flip-if-clipped: the state that renders one
 * is set on `mouseenter` and cleared on `mouseleave`, and the placement is
 * this and nothing else.
 */
export function HoverCard({ label, scrolls = false, children }: HoverCardProps) {
  const scrolling: CSSProperties = scrolls
    ? { maxHeight: SCROLLING_MAX_HEIGHT, overflowY: 'auto', pointerEvents: 'auto' }
    : { pointerEvents: 'none' };
  return (
    <div
      role="tooltip"
      aria-label={label}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 20,
        minWidth: 260,
        maxWidth: 420,
        background: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 10px',
        boxShadow: '0 4px 14px oklch(0 0 0 / 14%)',
        textAlign: 'left',
        // The cells these open from are bold, right-aligned, or both — a
        // folded role's figure is `font-weight: 600` — and a card inheriting
        // that reads as a heading rather than as a paragraph.
        fontWeight: 400,
        ...scrolling,
      }}
    >
      {children}
    </div>
  );
}
