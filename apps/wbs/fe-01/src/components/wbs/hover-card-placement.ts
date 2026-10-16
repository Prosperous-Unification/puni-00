/**
 * The viewport rectangle of the mark a surface belongs to.
 *
 * Four numbers rather than the `DOMRect` they are read off, because that is all
 * placement needs and a `DOMRect` is a live object in a scrolling box: a card
 * holding one would be placed against wherever the mark has since moved to.
 */
export interface AnchorRect {
  left: number;
  /**
   * Its right edge, which is where a card standing **past** the mark opens.
   *
   * Added on 2026-09-10: Dany asked for every column's pop-up to stand left or
   * right of the thing it explains rather than under it, and the marks the hint
   * layer reads are in those columns too. Read by {@link diagonalPlacement},
   * which is the whole of that promise a day later — past the column *and* past
   * the row.
   */
  right: number;
  top: number;
  bottom: number;
}

/** Where a card is drawn, in viewport coordinates. */
export interface Placement {
  left: number;
  top: number;
}

/** How much clear air an anchored card keeps between itself and its mark, in CSS pixels. */
export const ANCHOR_GAP_PX = 6;

/**
 * Where a **diagonal** card is drawn: past the cross of its cell's column and
 * its own row, clamped so its own rectangle stays inside the frame.
 *
 * Dany, 2026-09-11: _"implement 'diagonal' pop-up for ALL columns including
 * PRIO, not before, deadline, end, slack; ALL of them, must have same look and
 * feel"_. Every card that opens from a **cell** has been diagonal since
 * `cards-open-diagonally`; the hint layer's card was the one that was not, and
 * the hint layer is what most of those columns' pop-up is — `data-hint` and
 * `data-fact` marks on the drag grip, the row number, Prio, Not before,
 * Deadline, End, Slack, In parallel, Service, Team, Tag and the estimate cells.
 * It stood **beside** its mark with the tops aligned, which left the column
 * clear and the row covered.
 *
 * Two promises, one per axis, and they are the two an in-cell card already makes
 * (see [HoverCard](./hover-card.tsx)): past the **column**, so the lane the pointer is
 * running down stays under the pointer, and past the **row**, so the work item's
 * own dates, estimates and dependencies stay readable beside the words that
 * explain one of them. Which side and which edge are measured rather than fixed
 * — the roomier one — so a column at the right edge of the frame answers to its
 * left, and a row at the bottom of it answers above itself.
 *
 * **No gap on either axis**, which is the half of _"same look and feel"_ that
 * lives in the arithmetic: an in-cell card hangs from `left: 100%` and from its
 * row's own bottom edge, so it touches the cross it clears, and a hint card
 * standing 6px off it would be a second look for the same pop-up.
 *
 * **Clamped rather than refused**, which is where this differs from
 * {@link besidePlacement}: a picker's card that would cover the list it explains
 * is better not shown, but a hint is a sentence about the thing under the
 * pointer and a reader who gets nothing has no way to ask again. So a frame with
 * room on neither side gets the card on the roomier side, pushed inside the
 * edge.
 *
 * Pure, for {@link surfacePlacement}'s reason: jsdom measures every box as zero.
 *
 * @param clear The cross to clear: the **cell's** horizontal band and the **row's** vertical one, in viewport coordinates.
 * @param clear.left The column's left edge — a card standing left of it ends here.
 * @param clear.right The column's right edge — a card standing right of it starts here.
 * @param clear.top The row's top edge — a card above the row ends here.
 * @param clear.bottom The row's bottom edge — a card below the row starts here.
 * @param card The card's own box.
 * @param card.width How wide it is.
 * @param card.height How tall it is.
 * @param frame The box it stays inside: the plan's scrolling frame ∩ the window.
 * @param frame.left Its left edge.
 * @param frame.right Its right edge.
 * @param frame.top Its top edge.
 * @param frame.bottom Its bottom edge.
 */
export function diagonalPlacement(
  clear: AnchorRect,
  card: { width: number; height: number },
  frame: { left: number; right: number; top: number; bottom: number },
): Placement {
  const toTheRight = frame.right - clear.right;
  const toTheLeft = clear.left - frame.left;
  const below = frame.bottom - clear.bottom;
  const above = clear.top - frame.top;
  // The **roomier** side on each axis rather than "does it fit", which is
  // {@link sidewaysPlacement}'s rule for an in-cell card and is this one's for
  // the same reason: a card that fits in 30px of room is a card 30px wide. `>=`
  // on both counts, so a tie stands right of the column and below the row —
  // where an in-cell card stands when it has the choice.
  const onTheRight = toTheRight >= card.width || toTheRight >= toTheLeft;
  const underneath = below >= card.height || below >= above;
  return {
    // Inside both edges on each axis: the `max` for a card pushed off the near
    // edge of the frame, the `min` for one that would run off the far one.
    left: Math.max(
      frame.left,
      Math.min(onTheRight ? clear.right : clear.left - card.width, frame.right - card.width),
    ),
    top: Math.max(
      frame.top,
      Math.min(underneath ? clear.bottom : clear.top - card.height, frame.bottom - card.height),
    ),
  };
}

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
 * Proof: changing the below-mark gap addition to subtraction failed three
 * fixed-output cases in `hover-card-placement.test.ts`, including `below the
 * mark with its gap` on top 222 rather than 234. Watched 2026-10-16.
 *
 * The clamp is on `left` alone. A card is `position: fixed` and never wider
 * than the viewport (see [HoverCard](./hover-card.tsx)), so a left at or past 0 with the
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

/**
 * The horizontal bounds of a **list**, at the row of the option a card is
 * open for — the mark a card opens *beside* rather than under.
 *
 * Both edges, because the card may open at either: see {@link
 * besidePlacement}. The list's own rect rather than the option's, because
 * every option in a one-column list shares the list's width, and a card
 * anchored to the option lands on top of the list it is being read against.
 */
export interface BesideAnchorRect {
  left: number;
  right: number;
  top: number;
}

/**
 * Where a card opens beside a list: clear of the list's right edge, on the
 * row of the option it describes.
 *
 * Flipped to the list's **left** edge where the viewport has no room on the
 * right, and `null` — no card at all — where neither side fits. A clamp back
 * into the viewport is what this deliberately is not: a clamped card slides
 * over the list at exactly the widths where the list is hardest to read, which
 * is the fault the placement exists to fix. A card that must cover the list to
 * exist has no claim on the space.
 *
 * `top` is clamped so a card opening from the last row of a long list does not
 * hang off the bottom of the window; it is never moved horizontally to make
 * room, which is what lets the card stay still while the pointer walks the
 * list.
 *
 * Pure, and separated from the component for {@link surfacePlacement}'s
 * reason: jsdom measures every box as zero, so the arithmetic can only be
 * asserted where the measurements are handed to it. That it is really wired to
 * the listbox's own rectangle is asserted through the production call path in
 * `project-page.test.tsx`, where the card's box is stubbed for the same
 * reason.
 *
 * Proof: the flip replaced by a clamp to the viewport's right edge — `a narrow
 * window flips the card to the left of the list` failed on `expected 400 to be
 * less than 400`, the clamped card starting exactly where the list starts, and
 * `a window with room on neither side shows no card` failed on `expected <div
 * role="tooltip" …(2)>…(4)</div> to be null`. Watched 2026-08-29.
 */
export function besidePlacement(
  anchor: BesideAnchorRect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement | null {
  const top = Math.max(0, Math.min(anchor.top, viewport.height - card.height));
  const beyondRight = anchor.right + ANCHOR_GAP_PX;
  if (beyondRight + card.width <= viewport.width) return { left: beyondRight, top };
  const beforeLeft = anchor.left - ANCHOR_GAP_PX - card.width;
  return beforeLeft >= 0 ? { left: beforeLeft, top } : null;
}

/**
 * What a {@link diagonalPlacement} card is placed from: the cross it stands past
 * and the box it stays inside.
 *
 * One object rather than two props because neither half is meaningful alone — a
 * cross with no frame has nothing to be clamped into, and a frame with no cross
 * has nothing to clear — and because the owner measures both in the one pass,
 * from the one mark. See [HoverCardProps.diagonal](./hover-card.tsx).
 */
export interface DiagonalAnchor {
  /**
   * The cell's horizontal band and the row's vertical one, in viewport
   * coordinates: `left`/`right` from the mark's `<td>`, `top`/`bottom` from its
   * `<tr>`.
   */
  clear: AnchorRect;
  /** The plan's scrolling frame ∩ the window, which the card is clamped inside. */
  frame: { left: number; right: number; top: number; bottom: number };
}

/** How much of the window's height a scrolling card may take. */
export const VIEWPORT_SHARE = 0.9;

/**
 * How tall a scrolling card is where neither side of its cell has the room.
 *
 * A floor rather than a fit: a cell sitting on the fold has a few pixels either
 * way, and a card sized to those is a card with one line in it. Overflowing the
 * window by a little and scrolling inside is the readable failure.
 */
export const SCROLLING_MIN_HEIGHT = 160;

/** Which way a card opens beside its cell, which edge it hangs from, and how tall it may be. */
export interface SidewaysPlacement {
  /** The side of the cell the card stands on. */
  side: 'left' | 'right';
  /** Whether the card hangs from the row's bottom edge or from its top. */
  align: 'top' | 'bottom';
  /**
   * How tall it may be, in CSS pixels: the room the frame has at the edge it
   * hangs from, capped at {@link VIEWPORT_SHARE} of the frame and floored at
   * {@link SCROLLING_MIN_HEIGHT}.
   *
   * Only a scrolling card reads it — every other one is as tall as its own
   * words.
   */
  maxHeight: number;
}

/**
 * Which side of its cell a card opens on, and which edge it hangs from.
 *
 * Dany, 2026-09-10, about the cards that only inform — Start, the reference
 * cells, a folded step: *"I still want to see what is up and down from it for
 * context; like, just push them to the side (left or right) ... depending on
 * where horizontally it is"*. A card beside its cell leaves that cell's whole
 * column clear, so the rows above and below it stay readable — which is the
 * thing a plan is read down.
 *
 * **The side is measured rather than fixed**, and that is the *"depending on
 * where horizontally it is"*: a card that always opened right would be cut off
 * by the frame for every column near the right edge, and a 260px card on a cell
 * 100px from the edge is not a card anybody can read. Right where the room is
 * there, otherwise the roomier side.
 *
 * `align` is the same question vertically: a card *beside* its cell hangs from
 * the cell's own top edge, so the only failure is a card taller than the room
 * below that top — a row low in the frame. Hanging it from the cell's
 * **bottom** edge instead keeps it inside, and either way it never covers its
 * own cell.
 *
 * Pure, and separated from the component for {@link surfacePlacement}'s reason:
 * the rectangles come from `getBoundingClientRect`, which jsdom answers with
 * zeroes. That a real cell is measured and really placed by this is a browser
 * fact, in `e2e/card-lanes.spec.ts`.
 *
 * @param cell The cell's wrapper, in viewport coordinates.
 * @param cell.left Its left edge — the container's left less this is the room to the left.
 * @param cell.right Its right edge — the container's right less this is the room to the right.
 * @param cell.top Its top edge, which a card hangs from where there is room below it.
 * @param cell.bottom Its bottom edge, which a card hangs from where there is not.
 * @param card The card's own box — how much room it is asking for.
 * @param card.width How wide it wants to be.
 * @param card.height How tall it is.
 * @param container The box that clips it: the window, ∩ the scrolling frame.
 * @param container.left Its left edge.
 * @param container.right Its right edge.
 * @param container.top Its top edge.
 * @param container.bottom Its bottom edge.
 */
export function sidewaysPlacement(
  cell: { left: number; right: number; top: number; bottom: number },
  card: { width: number; height: number },
  container: { left: number; right: number; top: number; bottom: number },
): SidewaysPlacement {
  const toTheRight = container.right - cell.right;
  const toTheLeft = cell.left - container.left;
  const below = container.bottom - cell.top;
  const above = cell.bottom - container.top;
  // The **roomier** side rather than "does it fit": a card that fits in 30px of
  // room is a card 30px tall, and the reader asked for the room. `>=` so a tie
  // hangs downward, which is where every card in this table hung before there
  // was a choice.
  const align = below >= above ? 'top' : 'bottom';
  return {
    // `>=` on both counts, so a tie opens right and hangs from the top, which
    // is where every card in this table opened before there was a choice.
    side: toTheRight >= card.width || toTheRight >= toTheLeft ? 'right' : 'left',
    align,
    // The room at the edge it hangs from, and never taller than the frame
    // itself: a card in a frame with 100px to give is 100px tall, whatever
    // floor a scrolling card would otherwise keep.
    maxHeight: Math.min(
      (container.bottom - container.top) * VIEWPORT_SHARE,
      Math.max(align === 'top' ? below : above, SCROLLING_MIN_HEIGHT),
    ),
  };
}
