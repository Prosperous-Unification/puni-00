import { useRef } from 'react';

import { useCardOpenOn } from '../cell-card-store';
import { cellKey } from '../editable-grid';
import { MARK_BOX_PX, markStyle, refMarksOf, refMarksSentence } from '../external-ref-marks';
import { ExternalRefsCard } from '../external-refs-card';
import type { PlanLive } from '../plan-live';
import { LinkIcon } from '../toolbar-icons';
import { column } from './column';

/**
 * How long an open links card survives the pointer leaving its cell, in ms.
 *
 * **A grace period on closing, and it is what makes the card reachable at all.**
 * The cell is 40px wide and its card is up to 400px, so a pointer aimed at a
 * link on the right leaves the cell **sideways into the Name column** before it
 * has descended far enough to be over the card. There is no corridor to model
 * the way {@link dependencyPointerRegion} models one — the cell and the card
 * touch, and the path between them crosses a third cell — so the card is held
 * for long enough to be walked to instead.
 *
 * Measured, 2026-09-09: with no grace at all, a 15-step diagonal from the marks
 * to the second card line's right-hand end left `card.count() === 0` before it
 * arrived. Dany, the same day: _"i want to then be able to hover over the
 * tooltip to click and go to the linked item"_.
 *
 * 200ms, which is a hand's transit and not a wait anybody reads as one — and it
 * is **only** on the way out. Opening stays instant, which is the rule
 * `hints-are-the-page-s-own` set for words about the project.
 *
 * A late clear is safe rather than merely unlikely: it goes through the same
 * `(current) => current === refsCell ? null : current` guard every writer here
 * uses, so a timer that fires after the pointer has armed another cell is a
 * no-op on that cell's card.
 */
const CARD_GRACE_MS = 200;

/** Builds the refs column family against the stable live cell contract. */
export function createRefsColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'refs',
    // **A drawn link, not the word.** `Prio`'s bargain — five characters
    // at the header's 10px all-caps inside a 32px envelope — does not
    // survive here: `LINKS` ran under the `NAME` heading beside it, which
    // Dany photographed on 2026-08-31. A shape has no such width.
    //
    // The `sr-only` word is not decoration. {@link LinkIcon} is
    // `aria-hidden` like every icon in that file, so without it this
    // column heading announces nothing at all — and a heading is what a
    // screen reader names every cell under it by.
    header: () => (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <LinkIcon />
        <span className="sr-only">Links</span>
      </span>
    ),
    cell: ({ row }) => {
      // A subscription and not a reading off `live`: this cell is a component,
      // so it can be told about its own card without the table rendering.
      // First, and unconditionally, because it is a hook.
      // `flexRender` builds this with `React.createElement`, so it **is** a
      // component and the hook below is legal; the rule reads the property
      // name `cell` and cannot see the call site.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const cardOpen = useCardOpenOn(live.current.cellCards, cellKey(row.original.id, 'refs'));
      // The vocabulary is the immutable directory reading for this render.
      // The pending close, so the pointer arriving on the card can call it off.
      // A hook, for {@link useCardOpenOn}'s reason: `flexRender` builds this
      // with `React.createElement`, so this really is a component.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
      const cancelClose = (): void => {
        if (closing.current === null) return;
        clearTimeout(closing.current);
        closing.current = null;
      };
      const marks = refMarksOf(row.original.externalRefs, row.original.readings.externalSystems);
      const refsCell = cellKey(row.original.id, 'refs');
      const carded = marks.length > 0 && cardOpen;
      const sentenceId = `refs-${row.original.id}`;
      return (
        <span
          // The positioned ancestor the card opens from, and — the Name
          // cell's arrangement, for the Name cell's reason — the element
          // that **closes** it: this span holds the marks *and* the card,
          // so `mouseleave` fires only once the pointer is outside both and
          // the trip from a 6px dot down to a link on the card never
          // unmounts what it is travelling to.
          //
          // **Absolute, filling the `<td>`, because the card is armed by the
          // whole cell** since 2026-09-09. Dany, that day: _"i want hover over
          // the whole cell surface to trigger the tooltip"_ — the hover target
          // had been a 28×12 box inside a 40×26 cell, so a pointer resting
          // anywhere else in the column got nothing.
          //
          // `position: relative` with `height: '100%'` was the first attempt and
          // **does not work**: a percentage height on a child of a `table-cell`
          // is undefined in the spec and Chromium does not resolve it, so the
          // box fell back to its content's 12px and the cell's bottom-right
          // corner still armed nothing (watched: `the bottom right of the cell
          // opened no card`). An absolutely positioned box resolves `inset`
          // against the **padding box of the nearest positioned ancestor**,
          // which here is the `<td>` itself — every cell in this column is
          // `position: sticky`, and sticky is positioned. So `inset: 0` is
          // exactly the cell's own rectangle, padding included, and
          // `e2e/external-refs.spec.ts` asserts the two boxes match rather than
          // trusting that sentence.
          //
          // Out of flow, so this cell contributes no height at all to its row —
          // which strengthens design D2's "the dots never change the row's
          // height" rather than weakening it: the row is the Name cell's, as it
          // already was.
          style={{ position: 'absolute', inset: 0, display: 'block' }}
          onMouseEnter={() => {
            // **The card's own re-arm.** The pointer left this wrapper on its
            // way here — across the Name cell — so this fires when it arrives
            // on the card, which is the moment the pending close has to be
            // called off. Without it the grace period would expire under a
            // reader who had already got where they were going.
            cancelClose();
            live.current.cellCards.updateHovered(() => refsCell);
          }}
          onMouseLeave={() => {
            // Held for {@link CARD_GRACE_MS} rather than cleared here, because
            // the trip from a 40px cell to a link on a 400px card leaves the
            // cell before it reaches the card. The same-cell guard makes the
            // late clear safe: a leave fires after the enter of whatever the
            // pointer moved on to.
            cancelClose();
            closing.current = setTimeout(() => {
              closing.current = null;
              live.current.cellCards.updateHovered((current) =>
                current === refsCell ? null : current,
              );
            }, CARD_GRACE_MS);
          }}
        >
          <button
            type="button"
            data-refs-cell={row.original.id}
            aria-label={`Links for ${row.original.number}`}
            // The whole cell in one sentence for a reader with no pointer
            // — the card's content, which a pointer is the only other way
            // to reach. Absent on a row with no links, so nothing is
            // announced about a cell that says nothing.
            aria-describedby={marks.length === 0 ? undefined : sentenceId}
            onMouseEnter={() => {
              live.current.cellCards.updateHovered(() => refsCell);
            }}
            onClick={() => {
              live.current.setRefsEditing(row.original.id);
            }}
            // **The whole cell, and the marks centred in it.** The button is
            // the hover and click surface and it fills the `<td>`; the 12px box
            // inside it is where the marks are placed. Two boxes rather than
            // one because they answer different questions — how much of the
            // column a pointer may rest on, and where the dots sit — and until
            // 2026-09-09 one box answered both, at 28×12 in a 40×26 cell.
            //
            // The reset in `styles.css` stops at `[data-grid]`, so a
            // `<button>` in here keeps the platform's border, background
            // and padding unless it is told not to. All three are told.
            style={{
              display: 'flex',
              alignItems: 'center',
              // The whole of the span above, which is the whole of the cell.
              // Percentages resolve here because the span has a definite size —
              // it is absolutely positioned with `inset: 0`.
              width: '100%',
              height: '100%',
              // The 4px `CELL` gives every `<td>` horizontally, put back where
              // the marks are drawn rather than where the pointer is read: the
              // span above covers the padding so a hover lands anywhere in the
              // column, and this keeps the dots at the same x they have always
              // been drawn at.
              padding: '0 4px',
              margin: 0,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              // The fixed-height box the marks are placed inside, and the
              // whole of design D2's "the dots never change the row's
              // height": every mark is out of flow **inside this**, so a row
              // wired to four systems and a row wired to none lay out
              // identically and the claim is one Chromium can measure (jsdom
              // lays nothing out — `e2e/external-refs.spec.ts` is the oracle,
              // and it measures the marks against *this* box rather than
              // against the button, which now fills the cell and would contain
              // them however they were placed).
              data-ref-marks-box
              style={{
                position: 'relative',
                display: 'block',
                width: '100%',
                height: MARK_BOX_PX,
                flexShrink: 0,
              }}
            >
              {marks.map((mark, at) => (
                <span
                  key={mark.kind}
                  role="img"
                  // Design D3's third channel: the column is readable with
                  // no colour at all, because every mark says what it stands
                  // for and how many links it covers.
                  aria-label={mark.label}
                  data-ref-mark={mark.kind}
                  style={markStyle(mark.kind, at)}
                >
                  {mark.kind === 'overflow' ? '+' : null}
                </span>
              ))}
            </span>
          </button>
          {marks.length > 0 && (
            <span id={sentenceId} hidden>
              {refMarksSentence(marks)}
            </span>
          )}
          {carded && (
            <ExternalRefsCard
              number={row.original.number}
              refs={row.original.externalRefs}
              systems={row.original.readings.externalSystems}
            />
          )}
        </span>
      );
    },
  });
}
