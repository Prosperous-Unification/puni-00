import type { PlanLive } from '../plan-live';
import { statusWords } from '../status-cell';
import { column } from './column';

/** Builds the drag column family against the stable live cell contract. */
export function createDragColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'drag',
    header: () => <span aria-label="Reorder" />,
    cell: ({ row }) => {
      // No frozen state here since ADR 0023. This handle used to carry
      // `aria-disabled` and a `data-fact` reading "Frozen — unfreeze this row
      // before moving it", because be-01 refused the move; a frozen work item
      // moves like any other now, and the number travels with it.
      // The status strip is drawn on this cell as colour alone, and the Status
      // column is hidden by default; the word is here for assistive tech, as
      // the cell's own text and as the handle's description
      // (`add-work-item-statuses`, task 6.4).
      // Proof: the `aria-describedby` dropped, and `puts a row on hold at
      // once…` failed on an empty description for `Reorder 010`; watched
      // 2026-09-29.
      const wordId = `strip-word-${row.original.id}`;
      return (
        <>
          <span
            draggable
            role="button"
            tabIndex={-1}
            aria-label={`Reorder ${row.original.number}`}
            aria-describedby={wordId}
            data-hint="Drag to move this row"
            style={{ cursor: 'grab' }}
            onDragStart={() => {
              live.current.setDragging(row.original.id);
            }}
            onDragEnd={() => {
              live.current.setDragging(null);
              live.current.setDropHint(null);
            }}
          >
            ⠿
          </span>
          <span id={wordId} className="sr-only">
            {statusWords(row.original.status)}
          </span>
        </>
      );
    },
  });
}
