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
   * entry's row with (`--grid-dep-lit`, the `tr[data-dep-lit]` rule in
   * `styles.css`), so the card and the grid say "this one" in the same voice.
   * Not bold: a bold line among plain ones reads as a heading over the list,
   * not as a highlight in it.
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
              ? // The row tint, verbatim — see {@link DependsCardProps.emphasisedId}.
                // The token rather than a literal, for `MATCH_TINT`'s reason:
                // `.dark` re-points the palette and a literal would not follow.
                { background: 'var(--grid-dep-lit)', borderRadius: 3 }
              : undefined
          }
        >
          {dependsLine(entry)}
        </div>
      ))}
    </HoverCard>
  );
}
