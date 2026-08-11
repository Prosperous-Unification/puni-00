import { HoverCard } from './hover-card';

/** One work item another waits for, as the chips have it. */
export interface DependsEntry {
  id: string;
  number: string;
  name: string;
}

/**
 * One dependency as it is written wherever this list appears: `010 - Strip the
 * hull`, the same shape the dependency picker uses.
 *
 * A function rather than two spellings, because the card is not the only place
 * this list is read: the cell's box points `aria-describedby` at an off-screen
 * copy for readers with no pointer, and a card and a description that disagreed
 * about one row's dependencies would be worse than either.
 */
export const dependsLine = (entry: DependsEntry): string => `${entry.number} - ${entry.name}`;

export interface DependsCardProps {
  /** The waiting work item's number, so the card says whose list this is. */
  number: string;
  /** At least one: a cell with nothing in it opens no card. */
  entries: readonly DependsEntry[];
  /**
   * The entry whose pill the pointer is on, or null while the pointer is on
   * the cell's input area — where the whole list is the answer and no line is
   * singled out.
   *
   * Emphasised as a background swatch in the same tint the table lights the
   * entry's row with, so the card and the grid say "this one" in the same
   * voice. Not bold: a bold line among plain ones reads as a heading over the
   * list, not as a highlight in it.
   *
   * `--card-dep-lit` and not `--grid-dep-lit`, which is the same tint and not
   * the same colour: both are the same dose of `--ring` into the surface they
   * land on, and this card's surface is `--popover` where the rows' is
   * `--background`. In the dark palette those two greys sit either side of one
   * absolute mix, so a single token moved the rows lighter and this line darker
   * — see the tokens' own note in `styles.css`. In light they coincide, which
   * is why the fault only ever showed on a dark page.
   */
  emphasisedId: string | null;
}

/**
 * What a row is waiting for, by name.
 *
 * The cell shows `010 ✕ 030 ✕` — numbers, because a chip has room for one and
 * because the number is what somebody types to add a dependency. A number is
 * not what anyone remembers a work item by, though, and following one means
 * scrolling to that row and reading its name. This card is that trip.
 *
 * `010 - Strip the hull`, the same shape the dependency picker's list uses,
 * with the dash: a space alone let a number and a name that starts with a digit
 * run together.
 */
export function DependsCard({ number, entries, emphasisedId }: DependsCardProps) {
  return (
    <HoverCard label={`What ${number} waits for`}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={
            entry.id === emphasisedId
              ? // The row tint on *this* surface — see
                // {@link DependsCardProps.emphasisedId}. The token rather than a
                // literal, for `MATCH_TINT`'s reason: `.dark` re-points the
                // palette and a literal would not follow.
                //
                // Inset, and the inset given straight back as negative margin:
                // a swatch with no padding is a box the exact shape of the
                // glyphs, whose rounded corners cut into the first and last
                // letter and read as a rendering fault rather than as a
                // highlight. The margin is what keeps the emphasis from
                // *moving* the line it emphasises — padding alone would shift
                // this line's text 4px right of every other line's and reflow
                // the card as the pointer walked the pills.
                {
                  // WITHHELD on this head: the pre-review absolute token, back
                  // in place so `the tint moves the same way on both surfaces,
                  // in both palettes` is watched failing on the inversion it
                  // exists to catch. Restored by the next commit.
                  background: 'var(--grid-dep-lit)',
                  borderRadius: 4,
                  padding: '1px 4px',
                  margin: '-1px -4px',
                }
              : undefined
          }
        >
          {dependsLine(entry)}
        </div>
      ))}
    </HoverCard>
  );
}
