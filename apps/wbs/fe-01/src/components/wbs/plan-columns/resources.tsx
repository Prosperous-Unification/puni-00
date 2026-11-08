import { cellKey } from '../editable-grid';
import type { PlanLive } from '../plan-live';
import { demandSummary } from '../resource-demand-words';
import { column } from './column';

/** What the Resources cell says on a parent, where a demand charges nothing. */
export const PARENT_DEMAND_FACT =
  'A row with work under it consumes nothing of its own: state resources on the rows beneath it.';

/**
 * Builds the Resources column (`wbs-resources` 1.5): what a leaf's work item
 * demands while any of its steps runs, `RAM 6 GiB · staging`, opened into the
 * row's Resources panel by a click, Enter or Space. The panel writes; the cell
 * only reads the tree, so a peer's demand redraws it with the plan.
 */
export function createResourcesColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'resources',
    // Proof: changed to `() => true`, `steps over a parent’s Resources cell`
    // (resource-demand-panel.test.tsx) failed on `expected <input …(9)> to be
    // <input …(5)>`: Tab from Types landed past the parent's Fact start, the
    // grid having named a cell with no box. Watched 2026-10-25.
    meta: { isEditable: (row) => row.subRows.length === 0 },
    header: () => <span>Resources</span>,
    cell: ({ row }) => {
      const summary = demandSummary(row.original.demands);
      if (row.subRows.length > 0)
        // A parent's own demand is kept and charges nothing (never inherited),
        // so it is shown muted, with the reason, rather than offered for edit.
        return (
          <span
            data-resources={row.original.id}
            data-fact={summary === '' ? undefined : `${summary}. ${PARENT_DEMAND_FACT}`}
            className="text-muted-foreground block truncate opacity-55"
          >
            {summary}
          </span>
        );
      const open = (): void => {
        live.current.openDemands(row.original.id);
      };
      return (
        // Not `readOnly`: the grid's Tab walk skips a read-only box, and this
        // one is a stop. Typing opens the panel, as the Deadline cell's does.
        <input
          aria-label={`Resources for ${row.original.number}`}
          aria-haspopup="dialog"
          data-resources={row.original.id}
          data-cell={cellKey(row.original.id, 'resources')}
          data-fact={summary === '' ? undefined : summary}
          placeholder="add"
          value={summary}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            font: 'inherit',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textOverflow: 'ellipsis',
          }}
          onChange={open}
          onClick={open}
          onKeyDown={(event) => {
            if (
              (event.key === 'Enter' || event.key === ' ') &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
              open();
              return;
            }
            live.current.onAltMove(event, row.original, 'resources');
            live.current.onCommandKey(event, row.original, 'resources');
            live.current.onTabKey(event, row.original.id, 'resources');
            live.current.onArrowKey(event, row.original.id, 'resources');
          }}
        />
      );
    },
  });
}
