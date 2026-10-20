import { type CSSProperties, type RefObject, useLayoutEffect, useState } from 'react';

import type {
  HiddenChip,
  InheritedReferenceEntry,
  ReferenceSetEntry,
  ReferenceSetLine,
} from './reference-set-contract';

export const REFERENCE_SET_STRIP_STYLE = {
  display: 'flex',
  // One line, and the callers that want a second one ask for it: a 120px
  // column that wraps is a row that grows a line per chip, which is what the
  // Tags cell was doing on 2026-08-29 (three lines, screenshotted). Both this
  // and the chip group below say `nowrap`, because one wrapping container
  // beside one that does not still wraps.
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: 4,
  // Shrinks below its content, which is what lets a `nowrap` line clip instead
  // of pushing its cell wider — and, in the Services cell, what lets the strip
  // share a flex line with the mismatch mark beside it. A `flex: 1` was
  // written here for that second case and deleted: taken out, all three
  // Chromium cases still passed, because a flex item shrinks on
  // `flex-shrink: 1` alone and the strip's content is wider than any of these
  // columns. R5 — the guard whose removal cannot be seen does not ship.
  minWidth: 0,
} as const;

/**
 * How tall one resting reference strip stands, in px.
 *
 * The strip leaves the flow while it is edited (see [ReferenceSetStrip](./reference-set-field.tsx)),
 * so something has to hold the line it was occupying or the row would shrink
 * the moment somebody clicked into a cell — the 2026-08-29 report's own fault
 * with its sign flipped. This is that height, on the anchor.
 *
 * It is a **measurement**, not a preference: the resting strip is as tall as
 * the search box in it, which is Chromium laying out a 14px `input` with this
 * table's padding and border. A constant that quietly disagreed with the real
 * one would clip the rest line by the difference, and silently — every style
 * assertion about the anchor is written against this same number. So
 * `e2e/reference-cells.spec.ts` measures the painted anchor against the
 * painted strip instead, and fails when the two part company.
 */
export const REFERENCE_SET_LINE_HEIGHT = 24;

/** The one chip line a resting strip shows; chips that would start a second wrap out of sight. */
const REST_CHIP_LINE_PX = 18;

/**
 * The chip group's line, shared by the four reference strips and the Depends
 * on strip so both say "more than fits" the same way (decision D4, UI review
 * F-057).
 *
 * At rest it wraps into a line nobody sees: the row gap pushes every chip
 * that does not fit whole onto a second line, and `maxHeight` with the
 * `hidden` overflow keeps only the first. So the rest line ends on a whole
 * chip — `Frontend ×` rather than `Frontend × Ba` — and {@link useHiddenChips}
 * counts what went. 18px holds a chip's 16px and the inherited chip's dashed
 * border. While `wrapping` (an open cell) every chip is drawn and nothing
 * clips.
 *
 * The `hidden` overflow at rest is also what keeps a chip from painting over
 * the search box beside the group: the box, later in the DOM, would take the
 * press aimed at the chip's ✕ (`round-trips every desktop reference set`,
 * 2026-08-29).
 */
// Proof: removing resting maxHeight made `rests every flex container` receive
// an empty maxHeight instead of 18px (2026-10-17).
export function chipLineStyle(wrapping: boolean, columnGap: number): CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    columnGap,
    rowGap: wrapping ? 3 : REST_CHIP_LINE_PX,
    ...(wrapping ? {} : { maxHeight: REST_CHIP_LINE_PX }),
    minWidth: 0,
    maxWidth: '100%',
    overflow: wrapping ? 'visible' : 'hidden',
  };
}

/**
 * The chips a resting {@link chipLineStyle} line could not draw whole — a
 * layout fact, so measured: every `[data-rest-chip]` whose top is at or below
 * the line's bottom (wrapped out of sight), or whose right edge runs past the
 * line's (a first chip wider than the whole line, which a wrap cannot move;
 * the caller hides it rather than draw it cut, decision D4).
 *
 * Empty while `measuring` is false — an open cell wraps every chip into reach
 * — and in jsdom, which has no `ResizeObserver` and lays nothing out; the
 * count is proven in `e2e/plan-table-review.spec.ts`. Re-measured when the
 * line resizes and whenever `chipsKey` (the chips' identities) changes.
 */
export function useHiddenChips(
  line: RefObject<HTMLElement | null>,
  measuring: boolean,
  chipsKey: string,
): readonly HiddenChip[] {
  const [hidden, setHidden] = useState<readonly HiddenChip[]>([]);
  useLayoutEffect(() => {
    const group = line.current;
    if (!measuring || group === null || typeof ResizeObserver === 'undefined') {
      setHidden((was) => (was.length === 0 ? was : []));
      return;
    }
    const measure = (): void => {
      const edge = group.getBoundingClientRect();
      const now = [...group.querySelectorAll<HTMLElement>('[data-rest-chip]')].flatMap((chip) => {
        const box = chip.getBoundingClientRect();
        // A caller that takes an overrunning chip out of the flow (the Depends
        // on strip) leaves a line with no in-flow content; the chip then still
        // reads as overrunning rather than wrapped only because this line's
        // `alignItems: 'center'` (`chipLineStyle`) puts its static top above
        // the line's bottom (-9px on an empty 18px line). Align it to the
        // start or the end and it would read as wrapped, re-enter the flow,
        // overrun again, and flip every frame. Held by `holds a lone chip too
        // wide for its cell steady, counted` (`e2e/plan-table-review.spec.ts`).
        const wrapped = box.top >= edge.bottom - 0.5;
        const overruns = !wrapped && box.right > edge.right + 0.5;
        if (!wrapped && !overruns) return [];
        const key = chip.dataset['restChip'];
        // The selector above matched the attribute, so it is there.
        if (key === undefined) throw new Error('a rest chip without its key');
        return [{ key, text: chip.textContent.replace(/[×✕✓]/g, '').trim(), overruns }];
      });
      const said = (chips: readonly HiddenChip[]): string =>
        chips.map(({ key, text, overruns }) => `${key}\0${text}\0${String(overruns)}`).join('\0');
      setHidden((was) => (said(was) === said(now) ? was : now));
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(group);
    return () => {
      watching.disconnect();
    };
  }, [line, measuring, chipsKey]);
  return hidden;
}

/**
 * How many chips a resting line hid — `+N`, after the chips, with a `title`
 * naming them (`Also: 010.3.02, 010.3.03`). Nothing when none is hidden. The
 * cell's own hover card still lists the whole set. In `--quiet-ink`, which
 * clears 4.5:1 on a banded row where `--muted-foreground` measured 4.48 (F-071).
 */
// Proof: suppressing nonempty counts made `clips the rest line, counts what it hid`
// fail because the count text was undefined (2026-10-17).
export function HiddenChipCount({ hidden }: { hidden: readonly HiddenChip[] }) {
  if (hidden.length === 0) return null;
  return (
    <span
      data-reference-hidden-count={hidden.length}
      title={`Also: ${hidden.map(({ text }) => text).join(', ')}`}
      className="text-quiet-ink shrink-0 text-xs"
    >
      +{hidden.length}
    </span>
  );
}

/**
 * Where an open panel sits in the stack.
 *
 * Above every layer `table-frame.ts` gives a pinned or sticky cell (4 is its
 * highest) and below the `PickerList`'s own 15, which opens **inside** this
 * panel: a list that its own panel painted over would be a directory nobody
 * can read.
 */
export const REFERENCE_SET_PANEL_LAYER = 10;

export const REFERENCE_SET_ADD_CLASS =
  'shrink-0 border-0 bg-transparent text-xs hover:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--cell-bg))] hover:text-foreground';
/**
 * The `+` and a chip on the phone's sheet, where there is room for a control
 * a thumb can see: the cell's are 12px ink sized for a 120px column.
 */
export const SHEET_ADD_CLASS = 'border-border min-w-11 shrink-0 rounded-md border bg-transparent';
export const SHEET_CHIP_CLASS =
  'bg-muted inline-flex max-w-full items-center gap-1 rounded-md pl-3 text-sm';
// `min-w-0` so `max-w-full` holds: a flex item's automatic minimum is its
// content, and a minimum outranks a maximum, so a long chip ran past its line
// instead of ending in an ellipsis (review of PR #409).
export const REFERENCE_SET_CHIP_CLASS =
  'bg-muted inline-flex max-w-full min-w-0 items-center gap-0.5 rounded px-1 text-xs';
export const REFERENCE_SET_REMOVE_CLASS = 'shrink-0 border-0 bg-transparent p-0';
/**
 * The inherited chip's ink: the own chip's box, dimmed and outlined instead of
 * filled.
 *
 * A reader has to be able to tell, at a glance and without a pointer, which
 * words this row wrote and which it is carrying — that is the whole of what
 * `tags-accumulate` adds to a cell, and a chip that looked the same would make
 * the accumulation a lie about who said what. `border-dashed` rather than a
 * second fill because the filled `bg-muted` is already the row's own, and two
 * fills in one 120px cell read as two kinds of value rather than one value in
 * two states.
 */
export const REFERENCE_SET_INHERITED_CHIP_CLASS =
  'text-muted-foreground border-muted-foreground/40 inline-flex max-w-full min-w-0 items-center gap-0.5 rounded border border-dashed px-1 text-xs';

/**
 * Everything a reference cell means, one line each, in the order the strip
 * draws it — what the hover card says.
 *
 * The card exists because the rest line is **one clipped line**: a 120px column
 * fits about two chips, the `+N` after them announces that the rest was cut,
 * and until 2026-08-31 there was no way at all to read what had been cut
 * without clicking into the cell and opening a panel over the rows below. Dany,
 * that day: *"cannot hover over tags cell to see the list of tags"*. The
 * Depends-on cell has said the same thing with a [HoverCard](./hover-card.tsx) since
 * `dep-hover-highlights`; this is the other four cells joining it.
 *
 * The three sources are the three things a cell can draw, and each is included
 * on exactly the terms the cell draws it on, so the card is the cell unclipped
 * rather than a second opinion about the row:
 *
 * - the members the row **states**, which are its chips;
 * - the members it **carries** as chips beside them, which is the accumulating
 *   dimension — tags (ADR 0008) — and which name the row they were written on,
 *   because that is where a reader has to go to take one off;
 * - the reading an **overriding** dimension makes while the row states none of
 *   its own, which is the box's `↳` placeholder and is therefore drawn only
 *   when [ReferenceSetAdapter.inheritedLabel](./reference-set-contract.ts) is given *and* the row is
 *   silent. A row that states a team of its own carries none of its ancestor's,
 *   so a line about one would be a claim the cell does not make.
 *
 * @param own The members this row states, already resolved to names.
 * @param inherited The members in force from above that it does not state.
 * @param inheritedLabel The overriding dimension's ancestor reading, in words.
 * @returns One line per reading, or an empty array for a cell that says nothing.
 */
// Proof: dropping the own-set guard made `adds the overriding dimension’s reading`
// receive an inherited Core line beside own Platform (2026-10-17).
export function referenceSetLines(
  own: readonly ReferenceSetEntry[],
  inherited: readonly InheritedReferenceEntry[],
  inheritedLabel: string | undefined,
): ReferenceSetLine[] {
  return [
    ...own.map((entry) => ({ key: entry.id, text: entry.name, stated: true })),
    ...inherited.map((entry) => ({
      key: entry.id,
      text: `↳ ${entry.name} — from ${entry.fromRow}`,
      stated: false,
    })),
    ...(own.length === 0 && inheritedLabel !== undefined
      ? [{ key: '(inherited)', text: `↳ ${inheritedLabel}`, stated: false }]
      : []),
  ];
}
