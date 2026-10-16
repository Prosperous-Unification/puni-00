import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ANCHOR_GAP_PX,
  type AnchorRect,
  type BesideAnchorRect,
  besidePlacement,
  type DiagonalAnchor,
  diagonalPlacement,
  type Placement,
  SCROLLING_MIN_HEIGHT,
  type SidewaysPlacement,
  sidewaysPlacement,
  surfacePlacement,
} from './hover-card-placement';

export {
  type AnchorRect,
  type BesideAnchorRect,
  besidePlacement,
  type DiagonalAnchor,
  diagonalPlacement,
  type SidewaysPlacement,
  sidewaysPlacement,
  surfacePlacement,
} from './hover-card-placement';

/** How wide a card may get, in CSS pixels. */
const CARD_MAX_WIDTH_PX = 420;

/**
 * How narrow a card explaining a cell may be, in CSS pixels.
 *
 * A floor rather than a fit, because these cards hold sentences: a card sized
 * to `Waits for 010` and then given `This work item may not start before this
 * day…` on the next row would be two different shapes in one column. A hint —
 * {@link HoverCardProps.compact} — is exempt, and is the width of its words.
 */
const CARD_MIN_WIDTH_PX = 260;

export interface HoverCardProps {
  /**
   * The mark this card opens **under**, in viewport coordinates — one of the
   * three things that make it a **fixed**, portalled card rather than an
   * absolute one.
   *
   * Left off by every card that opens from a cell: those are absolutely
   * positioned children of the cell's own wrapper and the cell's box is their
   * placement. A mark inside the Gantt's SVG has no such wrapper — the user
   * space is scaled non-uniformly and holds no HTML at all — so its card is
   * portalled to the document and placed from the rectangle the browser
   * measured. See {@link surfacePlacement}.
   *
   * A mark in a **cell** whose card is portalled all the same — the hint
   * layer's — takes {@link HoverCardProps.diagonal} instead: it has a column
   * and a row to clear, and this one has neither.
   */
  anchor?: AnchorRect;
  /**
   * The list this card opens beside, in viewport coordinates — a **fixed**,
   * portalled card like {@link HoverCardProps.anchor}, placed by {@link
   * besidePlacement} instead.
   *
   * The project picker's alone. A card that explains one option of a list is
   * read against the other options, so it opens clear of the list rather than
   * over it; every card that explains a *cell* opens under that cell, where
   * there is nothing being compared.
   *
   * Never passed together with `anchor`: they are two placements of one card.
   */
  beside?: BesideAnchorRect;
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
   * Whether this card is a **hint** rather than an explanation of a cell.
   *
   * One number's worth of difference and it is a real one: an explanatory card
   * is at least {@link CARD_MIN_WIDTH_PX} wide so a sentence about a cell does
   * not come out one word per line, and a hint on a 24px toolbar button drawn
   * to that floor is a 260px slab under a button that says "Undo". A hint takes
   * the width of its own words instead.
   *
   * {@link HintLayer} is the only caller, and passes it always.
   */
  compact?: boolean;
  /**
   * Whether this card scrolls its own content, and so has to take the wheel.
   *
   * The Name cell's preview alone. See {@link HoverCard} for why every other
   * card is pointer-transparent.
   */
  scrolls?: boolean;
  /**
   * Whether the **whole** card takes the pointer, rather than only the lines
   * inside it that ask for it.
   *
   * **A card a reader is meant to walk onto needs this, and a per-line
   * `pointer-events: auto` is not enough.** The card has 6px of its own padding
   * and gaps between its lines, and every one of those pixels is
   * pointer-transparent without this — so a cursor travelling down from the
   * cell crosses that band, hit-tests the row *beneath* the card, fires the
   * cell wrapper's `mouseleave`, and the card unmounts before the cursor ever
   * reaches a line. Dany, 2026-09-09: *"i cannot hover over the dropdown - it
   * disappears when i move cursor down to it"*.
   *
   * Measured in the running app at that moment: the card at `[88, 242, 370,
   * 56]` with `pointer-events: none` and `padding: 6px 10px`, and
   * `elementFromPoint` 1px and 4px inside its top edge both answering the next
   * row's name `<textarea>`.
   *
   * **`locator.hover()` cannot see this.** Playwright puts the pointer straight
   * on the element's centre, so it skips the band a hand has to cross — which
   * is why `e2e/external-refs.spec.ts` walks the pointer in `steps` now.
   *
   * Off by default, because {@link HoverCard}'s transparency is load-bearing
   * for every card that is only there to be read: one that takes the mouse eats
   * a click aimed at the row it hangs over.
   */
  takesPointer?: boolean;
  /**
   * The cross this card stands past, and the box it stays inside — a **fixed**,
   * portalled card like {@link HoverCardProps.anchor}, placed by
   * {@link diagonalPlacement} instead.
   *
   * The hint layer's card for a mark inside the plan's frame, which is what most
   * columns' pop-up is: `data-hint` and `data-fact` marks live on the drag grip,
   * the row number, Prio, Not before, Deadline, End, Slack, In parallel,
   * Service, Team, Tag and the estimate cells. Dany, 2026-09-11: _"implement
   * 'diagonal' pop-up for ALL columns ... ALL of them, must have same look and
   * feel"_.
   *
   * **Two rectangles, because the two axes clear two different things**: the
   * column is the mark's own `<td>` and the row is its `<tr>`, and a hint mark is
   * often a 20px glyph inside a 100px cell — placed against the glyph, the card
   * stands in the middle of the lane it was supposed to leave alone. The owner
   * measures both and hands over the cross; see `HintLayer`.
   *
   * Never passed together with `anchor` or `beside`: they are placements of one
   * card. A mark **outside** the frame — the toolbar's controls — keeps
   * `anchor`: its card covers nothing but the header, and a row of small buttons
   * whose cards jumped sideways would be worse for it. Nor the Gantt's own
   * anchored cards: a bar is as wide as the work it draws, and a card beside a
   * bar that fills the chart has nowhere to stand.
   */
  diagonal?: DiagonalAnchor;
  /**
   * Told when the pointer arrives on the card, and when it leaves again.
   *
   * The cell cannot see either: the card is its child in the DOM, so the
   * pointer moving from the cell onto the card fires no `mouseleave` there, and
   * moving off the card fires no `mouseenter` either. A cell that holds its card
   * open for a moment while the hand travels ({@link CellCards.holdHovered})
   * therefore needs the card itself to say "arrived" and "gone" — Dany,
   * 2026-09-10: *"i need it to go away when i move my mouse away from the
   * preview icon and not directly into the preview"*.
   *
   * Only a card that takes the pointer can report either. A transparent one is
   * never entered at all, and its cell's own leave is the whole of its
   * dismissal.
   */
  onPointerArrives?: () => void;
  children: ReactNode;
}

/**
 * How wide the one card that leaves its own row clear may get, in CSS pixels.
 *
 * Dany, 2026-09-10: *"i need the tooltip ... to be way wider to the right"*.
 * It starts past its cell and runs right, so the room it has is the rest of the
 * plan — 1000px is a document's worth of line length and still less than that
 * room on any screen this table is read on. The measured room caps it anyway,
 * which is what keeps it inside the frame.
 */
const WIDE_CARD_WIDTH_PX = 1000;

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
 * The other is {@link HoverCardProps.takesPointer}, for a card a reader is
 * meant to walk onto and click something on. Its own JSDoc has the measurement:
 * a card's 6px padding is pointer-transparent without it, so the cursor
 * hit-tests the row beneath on the way in and the card closes under the hand
 * reaching for it.
 *
 * No delay and no follow-cursor anywhere: the state that renders one is set on
 * `mouseenter` and cleared on `mouseleave`. **Every card in the plan is
 * diagonal** — past the thing it explains horizontally and past that thing's
 * row vertically — and there are two ways of being so, which is a fact about
 * where the card can be rendered rather than about how it looks:
 *
 * - A card that opens from a **cell** is an absolutely positioned child of that
 *   cell's own wrapper. It has to be: the pointer must be able to walk from the
 *   marker onto the card without leaving the cell that owns the `mouseleave`.
 *   The side and the edge come from {@link sidewaysPlacement} and the offsets
 *   are CSS — `left: 100%`, and the measured distance past the row.
 * - A card the owner **measures for it** is fixed and portalled, placed by
 *   {@link diagonalPlacement} from {@link HoverCardProps.diagonal}. The hint
 *   layer's card is this: its mark is any of ninety-odd elements across the app,
 *   so there is no wrapper for it to be a child of.
 *
 * Two placements are not diagonal, and both are outside the plan's frame:
 * {@link HoverCardProps.anchor} opens under its mark — a Gantt bar is as wide
 * as the work it draws, and a toolbar control's card covers nothing but the
 * header — and {@link HoverCardProps.beside} stands clear of a **list**.
 *
 * One more thing is measured rather than fixed: {@link HoverCardProps.scrolls}
 * — a card holding a document is as tall as the room its side of the cell has
 * ({@link SidewaysPlacement.maxHeight}), because below the cell is not where the
 * room is for a row in the lower half of the table. The scrollbox is capped
 * after the whole row’s diagonal clearance, keeping its bottom or top inside
 * the clipping frame.
 */
export function HoverCard({
  label,
  id,
  scrolls = false,
  takesPointer = false,
  compact = false,
  onPointerArrives,
  anchor,
  diagonal,
  beside,
  children,
}: HoverCardProps) {
  const card = useRef<HTMLDivElement | null>(null);
  // Placed under the mark to begin with and corrected once the card has a size,
  // which is the only moment its own width and height exist. `useLayoutEffect`
  // rather than `useEffect`, so the correction lands before the browser paints
  // and no card is ever seen off the edge it is about to be pulled back from.
  /**
   * Where an anchored card is drawn, and `left: 0` on the first frame **even
   * when it has an anchor**.
   *
   * A `position: fixed` card laid out at its mark's own left edge has only the
   * room between that edge and the window to lay out in, so a card anchored
   * near the right edge measures narrow and {@link surfacePlacement} is then
   * handed a width that has already been squeezed — there is nothing left for
   * it to clamp. Measured in Chromium: the schedule cue's fact card came out
   * 195px wide and eight lines tall from a pill at x=1405 in a 1600px window,
   * against a 420px ceiling it never got near.
   *
   * From zero it measures its own width up to that ceiling and the layout
   * effect below moves it into place — in `useLayoutEffect`, so the correction
   * lands before the browser paints and no card is ever seen at the left edge.
   */
  const [placed, setPlaced] = useState<Placement>(() => ({
    left: 0,
    top: anchor?.bottom ?? diagonal?.clear.bottom ?? 0,
  }));
  useLayoutEffect(() => {
    const node = card.current;
    if (node === null) return;
    const box = node.getBoundingClientRect();
    if (diagonal !== undefined) {
      setPlaced(
        diagonalPlacement(diagonal.clear, { width: box.width, height: box.height }, diagonal.frame),
      );
      return;
    }
    if (anchor === undefined) return;
    setPlaced(
      surfacePlacement(
        anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    // Most owners measure once per opening. A portalled card inside a
    // scrollbox may hand over a fresh rectangle while it stays open, so each
    // anchor identity places the card again.
  }, [anchor, diagonal]);

  /**
   * This card's own box, or null before it has ever been measured.
   *
   * Held rather than read at placement time because a card placed beside a
   * list can be **suppressed**, and a suppressed card is not in the document
   * to be measured again: the size it last had is what the next option's
   * placement is decided from. Without it a window with no room either side
   * would suppress the card once and never let it back, since the effect that
   * measures has no node to run against.
   */
  const [cardBox, setCardBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = card.current;
    if (beside === undefined || node === null) return;
    const measured = node.getBoundingClientRect();
    setCardBox({ width: measured.width, height: measured.height });
    // Each anchor identity measures again: the card's content is the option's
    // and a longer project name is a wider card.
  }, [beside]);
  const besidePlaced =
    beside === undefined
      ? null
      : besidePlacement(beside, cardBox ?? { width: 0, height: 0 }, {
          width: window.innerWidth,
          height: window.innerHeight,
        });

  /**
   * Where this card stands against its cell, once both have been measured.
   *
   * `null` is the frame before the measurement: the card draws to the **right**
   * of its cell and hangs from `100%` of its wrapper, which is where every one
   * of these opened before any of it was a choice, so nothing is ever seen to
   * jump on a cell with the room.
   *
   * Three numbers rather than one placement object, because they answer three
   * different questions: which side and which edge ({@link sidewaysPlacement}),
   * how far past the **row** that edge is, and how much room the side it took
   * actually has.
   */
  const [sideways, setSideways] = useState<SidewaysPlacement | null>(null);
  const [roomBeside, setRoomBeside] = useState<number | null>(null);
  const [pastTheRow, setPastTheRow] = useState<{ below: number; above: number } | null>(null);
  useLayoutEffect(() => {
    if (anchor !== undefined || beside !== undefined || diagonal !== undefined) return;
    // Narrowing, not a guard, and deliberately not a throw: a layout effect runs
    // on a mounted node, and a mounted node has a parent. No injected fault can
    // make either null, so a throw here would be a check whose failure can never
    // be observed — the fault R5's tally is a list of, and the one
    // `column-widths-drag` deleted a line for rather than keep unprovable. What
    // *is* provable is that the measurement happens at all, which every case in
    // `e2e/card-lanes.spec.ts` is.
    const wrapper = card.current?.parentElement;
    const box = card.current?.getBoundingClientRect();
    if (wrapper === null || wrapper === undefined || box === undefined) return;
    // What clips this card: the window, and the scrolling frame as well where
    // the cell is inside one. `overflow: auto` clips to the padding box, so the
    // frame's own picker room counts as room — it is exactly what that padding
    // is for. Found by the attribute rather than by walking up looking for a
    // computed `overflow`, for `editable-grid.ts`'s reason: the frame is a
    // named thing in this app and the name is the contract.
    const port = wrapper.closest('[data-table-frame]')?.getBoundingClientRect();
    const cell = wrapper.getBoundingClientRect();
    const frame = {
      left: Math.max(0, port?.left ?? 0),
      right: Math.min(window.innerWidth, port?.right ?? window.innerWidth),
      top: Math.max(0, port?.top ?? 0),
      bottom: Math.min(window.innerHeight, port?.bottom ?? window.innerHeight),
    };
    const placement = sidewaysPlacement(cell, box, frame);
    const row = wrapper.closest('tr')?.getBoundingClientRect();
    const roomPastRow =
      placement.align === 'top'
        ? frame.bottom - (row?.bottom ?? cell.bottom)
        : (row?.top ?? cell.top) - frame.top;
    // Proof: retaining the wrapper-only ceiling made the preview `whole blocked step card` bottom 484.9375px exceed its 459.75px frame (2026-10-14).
    setSideways({
      ...placement,
      maxHeight: Math.max(0, Math.min(placement.maxHeight, roomPastRow)),
    });
    setRoomBeside(
      (placement.side === 'right' ? frame.right - cell.right : cell.left - frame.left) -
        ANCHOR_GAP_PX,
    );
    // How far the card has to hang to clear the **row** it belongs to, measured
    // from the wrapper it is positioned in: `100%` is that wrapper, and a
    // wrapper is a line box inside a row rather than the row itself.
    setPastTheRow(
      row === undefined ? null : { below: row.bottom - cell.top, above: cell.bottom - row.top },
    );
    // Once per opening: the cell cannot move while the card is open, because
    // the pointer leaving the cell is what closes it.
  }, [anchor, beside, diagonal]);

  // A window with room on neither side of the list shows no card at all. After
  // every hook, because this is a render that draws nothing rather than a
  // component that does less.
  if (beside !== undefined && besidePlaced === null) return null;

  const scrolling: CSSProperties = scrolls
    ? {
        maxHeight: sideways?.maxHeight ?? SCROLLING_MIN_HEIGHT,
        overflowY: 'auto',
        pointerEvents: 'auto',
      }
    : { pointerEvents: takesPointer ? 'auto' : 'none' };
  const anchored: CSSProperties =
    besidePlaced !== null
      ? {
          position: 'fixed',
          top: besidePlaced.top,
          left: besidePlaced.left,
          // The same ceiling as an anchored card's, and load-bearing for the
          // same reason twice over: it is the width {@link besidePlacement}
          // decides the side from, so a card that could grow past it would be
          // placed against a width it does not have.
          maxWidth: `min(${String(CARD_MAX_WIDTH_PX)}px, 100vw)`,
        }
      : anchor === undefined && diagonal === undefined
        ? {
            position: 'absolute',
            // **Diagonally: past the cell, and past the row.** Dany,
            // 2026-09-10: _"can you make it so that all on-hover pop-ups over
            // cells - all display diagonally? like to make both the on-hover
            // element available for vertical scroll of mouse & the whole row
            // seen for context on all columns of the row"_.
            //
            // Two promises in one placement. Past the **cell** horizontally, so
            // the column the pointer is running down stays under the pointer
            // rather than under the card; past the **row** vertically, so the
            // work item's own dates, estimates and dependencies stay readable
            // beside the words that explain one of them.
            //
            // Which side and which edge are measured ({@link
            // sidewaysPlacement}); how far past the row is measured too,
            // because `100%` is the cell's own wrapper and a wrapper is a line
            // box inside a row rather than the row itself — hanging from it left
            // 3px of the row covered, in Chromium on 2026-09-10.
            ...(sideways?.side === 'left' ? { right: '100%' } : { left: '100%' }),
            ...(sideways?.align === 'bottom'
              ? { bottom: pastTheRow === null ? '100%' : pastTheRow.above }
              : { top: pastTheRow === null ? '100%' : pastTheRow.below }),
            // Shrink-to-fit measures the room between `left` and the containing
            // block's right edge, and that block is the cell — 4px. Without
            // `max-content` every one of these cards is its 260px minimum
            // however much room the plan has beside it.
            width: 'max-content',
            // The room beside the cell, measured, against the ceiling this
            // kind of card keeps: a document's is wide because it is a document,
            // and a sentence about a cell is 420px of sentence.
            maxWidth: `min(${String(scrolls ? WIDE_CARD_WIDTH_PX : CARD_MAX_WIDTH_PX)}px, ${
              roomBeside === null ? '100vw' : `${String(Math.round(roomBeside))}px`
            }, 100vw)`,
          }
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
  // A card that opens from a cell stays inside that cell's wrapper, which is
  // what its `position: absolute` is measured against. An anchored one is
  // portalled out: its mark is inside an `<svg>`, which can hold no HTML at
  // all, and every ancestor of it clips. A card placed beside a list is
  // portalled for the second of those reasons — the listbox scrolls and clips.
  const portalled = anchor !== undefined || beside !== undefined || diagonal !== undefined;
  const body = (
    <div
      ref={card}
      role="tooltip"
      id={id}
      aria-label={label}
      onMouseEnter={onPointerArrives}
      style={{
        ...anchored,
        // The height ceiling {@link sidewaysPlacement} computes is room in the
        // frame, so it has to mean the whole box. Left at `content-box`, the
        // card's own 6px padding and 1px border are added to it and the card
        // ends 14px past the edge it was sized to stay inside.
        //
        // Proof: this line removed — both browser tests in
        // `e2e/hover-cards.spec.ts`'s `takes the room around its cell` failed,
        // on `the card runs off the bottom of the window` and `the flipped card
        // runs off the top of the window`. It is the fault that found this
        // line: measured in Chromium at `cardBottom: 908` in a 900px window
        // before it existed. Watched 2026-08-11.
        boxSizing: 'border-box',
        // A portalled card is drawn on `--layer-card`, above every modal
        // surface, because the control it explains may be on one: at 20 it
        // was painted under the phone's sheets and Project settings (UI
        // review F-131). In a cell it keeps 20, measured against the table's
        // own sticky layers.
        //
        // Proof: at 20 for both, #515's original reference-sheet fact-card
        // paint probe (`e2e/reference-cells.spec.ts`) failed on `the fact card
        // is painted under <div role="dialog" … data-modal-surface="bottom"`.
        // Watched 2026-10-16 on 102a2e098; the reconciled mouse probe and the
        // independent touch wrapping case still require hosted verification.
        zIndex: portalled ? 'var(--layer-card)' : 20,
        minWidth: compact ? undefined : CARD_MIN_WIDTH_PX,
        background: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 10px',
        boxShadow: '0 4px 14px oklch(0 0 0 / 14%)',
        textAlign: 'left',
        // A card's content is names and URLs, and both arrive as one unbroken
        // token often enough that this is not a nicety: a 192-character work
        // item name laid 1396px of text inside a 388px card on a phone, and
        // the card was clipped rather than tall (measured in Chromium,
        // 2026-09-08, `e2e/project-settings.spec.ts`'s phone case).
        //
        // `break-word` rather than `anywhere`: it leaves the card's
        // **min-content** width alone, so a compact card is still the width of
        // its words and only a token that cannot fit the ceiling is broken.
        overflowWrap: 'break-word',
        // The cells these open from are bold, right-aligned, or both — a
        // folded step's figure is `font-weight: 600` — and a card inheriting
        // that reads as a heading rather than as a paragraph.
        fontWeight: 400,
        ...scrolling,
      }}
    >
      {children}
    </div>
  );
  return portalled ? createPortal(body, document.body) : body;
}
