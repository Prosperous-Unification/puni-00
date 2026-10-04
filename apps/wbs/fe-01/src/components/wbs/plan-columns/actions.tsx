import { ActionsMenu } from '../actions-menu';
import type { PlanLive } from '../plan-live';
import { statusActions } from '../status-cell';
import { column } from './column';

/** Builds the actions column family against the stable live cell contract. */
export function createActionsColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'actions',
    header: () => <span aria-label="Row actions" />,
    cell: ({ row }) => (
      <ActionsMenu
        number={row.original.number}
        // Menu state follows the PlanLive contract, so opening one preserves cells.
        open={row.original.readings.actionsOpen}
        busy={row.original.readings.busy}
        onOpen={() => {
          live.current.setOpenMenuRowId(row.original.id);
        }}
        onClose={() => {
          // Only this row's own menu, so a menu that has already been
          // replaced by another row's cannot close the new one on its way
          // out.
          live.current.setOpenMenuRowId((current) =>
            current === row.original.id ? null : current,
          );
        }}
        actions={[
          // The status entries first — every settable status the row does not
          // read and whose write would change something, in the menu order
          // (`statusOffersOf`) — then Add child, Move under… and Duplicate,
          // then Unfreeze where it applies, and Delete last in the destructive
          // tint (Dany, 2026-09-13: "Set status * … Duplicate … Delete in the
          // end"). `Done` and `In progress` ask for their days through the
          // completion prompt exactly as the cell does. The status word is
          // drawn as the status card draws it — bold, `Done` in green — so a
          // status is said one way everywhere.
          ...statusActions(live.current.statusOffers(row.original), (status) => {
            live.current.chooseStatus(row.original.id, status);
          }),
          {
            id: 'add-child',
            // Offered on a frozen row as well: its number stays pinned, and a
            // new child is given a number of its own beneath it.
            label: 'Add child',
            run: () => {
              void live.current.addChild(row.original);
            },
          },
          {
            id: 'move-under',
            // The keyboard's and the phone's reparent to any row, where a
            // drag or Alt+Right reaches only what is next to it.
            label: 'Move under…',
            run: () => {
              live.current.openMoveUnder(row.original.id);
            },
          },
          {
            id: 'duplicate',
            // Offered on a frozen row as well, unlike Delete and unlike
            // moving one: a freeze pins the number a row left the tool
            // under, and the copy is given none. Copying is not moving.
            label: 'Duplicate',
            run: () => {
              void live.current.duplicateRow(row.original.id);
            },
          },
          ...(row.original.frozenNumber === null
            ? []
            : [
                {
                  id: 'unfreeze',
                  label: 'Unfreeze',
                  run: () => {
                    void live.current.run((write) =>
                      write.perform(['tree'], () =>
                        live.current.commands.unfreezeWorkItem(row.original.id),
                      ),
                    );
                  },
                },
              ]),
          {
            id: 'delete',
            label: 'Delete',
            destructive: true,
            ...(row.original.frozenNumber === null
              ? {}
              : { refusedBecause: 'Frozen — unfreeze this row before deleting it' }),
            run: () => {
              void live.current.deleteRow(row.original);
            },
          },
        ]}
      />
    ),
  });
}
