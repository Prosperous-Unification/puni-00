import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The viewport rectangle of the mark a surface belongs to.
 *
 * Four numbers rather than the `DOMRect` they are read off, because that is all
 * placement needs and a `DOMRect` is a live object in a scrolling box: a card
 * holding one would be placed against wherever the mark has since moved to.
 */
export interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
}

/** Where a card is drawn, in viewport coordinates. */
interface Placement {
  left: number;
  top: number;
}

/** How much clear air an anchored card keeps between itself and its mark, in CSS pixels. */
const ANCHOR_GAP_PX = 6;

/** How wide a card may get, in CSS pixels. */
const CARD_MAX_WIDTH_PX = 420;

/**
 * Where an anchored card is drawn: under its mark, flipped above it when there
 * is no room, and clamped so its **own** rectangle stays inside the viewport.
 *
 * Pure, and separated from the component for the one reason that matters here:
 * the numbers it works on come from `getBoundingClientRect`, which jsdom
 * answers with zeroes, so the arithmetic can only be asserted where it is
 * handed the measurements. The wiring — that the card really is measured, and
 * really is placed by this — is a browser fact and is asserted in
 * `e2e/gantt.spec.ts` against the card's own rectangle.
 *
 * The clamp is on `left` alone. A card is `position: fixed` and never wider
 * than the viewport (see {@link HoverCard}), so a left at or past 0 with the
 * width subtracted from the right edge puts both edges inside.
 */
export function surfacePlacement(
  anchor: AnchorRect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement {
  const below = anchor.bottom + ANCHOR_GAP_PX;
  // Above only when below does not fit, and never above the top edge: a card
  // flipped off the top of the screen is the fault it was flipped to avoid.
  const top =
    below + card.height <= viewport.height
      ? below
      : Math.max(0, anchor.top - ANCHOR_GAP_PX - card.height);
  const left = Math.max(0, Math.min(anchor.left, viewport.width - card.width));
  return { left, top };
}

export interface HoverCardProps {
  /**
   * The mark this card is placed against, in viewport coordinates — and the
   * whole of what makes it a **fixed** card rather than an absolute one.
   *
   * Left off by every card that opens from a cell: those are absolutely
   * positioned children of the cell's own wrapper and the cell's box is their
   * placement. A mark inside the Gantt's SVG has no such wrapper — the user
   * space is scaled non-uniformly and holds no HTML at all — so its card is
   * portalled to the document and placed from the rectangle the browser
   * measured. See {@link surfacePlacement}.
   */
  anchor?: AnchorRect;
  /**
   * What the card is, for a screen reader — it names the row, because a table
   * of forty of these otherwise announces "tooltip" and nothing else.
   *
   * Left off by a card something points `aria-describedby` at, and that is not
   * a style choice: a description is computed by the accessible-name algorithm
   * over the element it names, where a label **wins over contents**. A labelled
   * card used as a description would read out its label and nothing else —
   * four words in place of the whole of what the cell folded away. Such a card
   * names itself in its first line instead, where it is both read out and on
   * screen. {@link HoverCardProps.id} is the other half of that pair.
   */
  label?: string;
  /**
   * The card's own id, so a control can point `aria-describedby` at it.
   *
   * Only where one does: a card nothing refers to needs no id, and minting one
   * anyway would suggest something reads it.
   */
  id?: string;
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
 * No delay and no follow-cursor anywhere: the state that renders one is set on
 * `mouseenter` and cleared on `mouseleave`. A card opening from a **cell** is
 * not flipped either — it opens from the wrapper's bottom edge and that is the
 * whole of its placement. {@link HoverCardProps.anchor} is the one exception,
 * and it exists because a Gantt bar has no wrapper to open from: such a card is
 * portalled, fixed, flipped and clamped by {@link surfacePlacement}, and the
 * delay before it opens belongs to the panel that opens it rather than to this.
 */
export function HoverCard({ label, id, scrolls = false, anchor, children }: HoverCardProps) {
  const card = useRef<HTMLDivElement | null>(null);
  // Placed under the mark to begin with and corrected once the card has a size,
  // which is the only moment its own width and height exist. `useLayoutEffect`
  // rather than `useEffect`, so the correction lands before the browser paints
  // and no card is ever seen off the edge it is about to be pulled back from.
  const [placed, setPlaced] = useState<Placement>(() =>
    anchor === undefined ? { left: 0, top: 0 } : { left: anchor.left, top: anchor.bottom },
  );
  useLayoutEffect(() => {
    const node = card.current;
    if (anchor === undefined || node === null) return;
    const box = node.getBoundingClientRect();
    setPlaced(
      surfacePlacement(
        anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    // The anchor is the rectangle read when the card was opened and does not
    // change while it is open, so this runs once per opening.
  }, [anchor]);

  const scrolling: CSSProperties = scrolls
    ? { maxHeight: SCROLLING_MAX_HEIGHT, overflowY: 'auto', pointerEvents: 'auto' }
    : { pointerEvents: 'none' };
  const anchored: CSSProperties =
    anchor === undefined
      ? { position: 'absolute', top: '100%', left: 0, maxWidth: CARD_MAX_WIDTH_PX }
      : {
          position: 'fixed',
          top: placed.top,
          left: placed.left,
          // Never wider than the screen it is clamped inside, which is what
          // lets {@link surfacePlacement} promise both edges at once. `min`
          // rather than the constant alone: 420px on a 390px phone is a card
          // that cannot be clamped into view.
          maxWidth: `min(${String(CARD_MAX_WIDTH_PX)}px, 100vw)`,
        };
  const body = (
    <div
      ref={card}
      role="tooltip"
      id={id}
      aria-label={label}
      style={{
        ...anchored,
        zIndex: 20,
        minWidth: 260,
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
  // A card that opens from a cell stays inside that cell's wrapper, which is
  // what its `position: absolute` is measured against. An anchored one is
  // portalled out: its mark is inside an `<svg>`, which can hold no HTML at
  // all, and every ancestor of it clips.
  return anchor === undefined ? body : createPortal(body, document.body);
}
