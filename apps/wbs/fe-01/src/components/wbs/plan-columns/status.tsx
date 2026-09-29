import { cellKey } from '../editable-grid';
import type { PlanLive } from '../plan-live';
import { StatusCell } from '../status-cell';
import { column } from './column';

/** Builds the Status column against the stable live cell contract. */
export function createStatusColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'status',
    // Every row, a parent included: choosing Done on a parent speaks for every
    // leaf beneath it (`WorkItemService.setStatus`), which is the one row-level
    // write in this table that a parent takes.
    meta: { isEditable: () => true },
    // One glyph for a 28px column — the word would not fit — with the word as
    // the heading's accessible name, so the Columns control, the hint and a
    // screen reader all still say `Status`.
    header: () => (
      <span role="img" aria-label="Status" title="Status">
        ○
      </span>
    ),
    cell: ({ row }) => (
      <StatusCell
        cellKey={cellKey(row.original.id, 'status')}
        rowNumber={row.original.number}
        rowId={row.original.id}
        status={row.original.status}
        offers={live.current.statusOffers(row.original)}
        choose={(status) => {
          // `Done` and `In progress` are asked about before they are written —
          // the completion prompt holds the days and sends the command on
          // confirm; every other status is sent at once.
          // Proof: `chooseStatus`'s prompt branch removed so every status was
          // sent at once, and `choosing Done opens the completion prompt…` and
          // `asks for Started on alone before starting a row…` failed on
          // `Unable to find role="dialog" and name "Set 010 to Done"` and
          // `"Set 020 to In progress"`; watched 2026-09-29.
          live.current.chooseStatus(row.original.id, status);
        }}
        onOpenChange={(open) => {
          // The lift for a pinned cell's popover (`StatusCell`'s class note):
          // the open list is the cell's card, said through the store's keyboard
          // reading. Guarded on the way out like every other clear — a close
          // can land after another cell has taken the reading.
          const statusCell = cellKey(row.original.id, 'status');
          live.current.cellCards.updateFocused((current) => {
            if (open) return statusCell;
            return current === statusCell ? null : current;
          });
        }}
        onGridKey={(event) => {
          live.current.onAltMove(event, row.original, 'status');
          live.current.onCommandKey(event, row.original, 'status');
          live.current.onTabKey(event, row.original.id, 'status');
          live.current.onArrowKey(event, row.original.id, 'status');
        }}
      />
    ),
  });
}
