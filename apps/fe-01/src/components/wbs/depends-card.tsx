import { HoverCard } from './hover-card';

/** One work item another waits for, as the chips have it. */
export interface DependsEntry {
  id: string;
  number: string;
  name: string;
}

export interface DependsCardProps {
  /** The waiting work item's number, so the card says whose list this is. */
  number: string;
  /** At least one: a cell with nothing in it opens no card. */
  entries: readonly DependsEntry[];
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
export function DependsCard({ number, entries }: DependsCardProps) {
  return (
    <HoverCard label={`What ${number} waits for`}>
      {entries.map((entry) => (
        <div key={entry.id}>
          {entry.number} - {entry.name}
        </div>
      ))}
    </HoverCard>
  );
}
