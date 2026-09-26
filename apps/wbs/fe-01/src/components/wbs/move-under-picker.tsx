import { Button } from '../ui/button';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '../ui/modal';
import { planMove } from './drag-drop';
import { type TreeRow } from './wbs-rows';

/**
 * The parents `row` may be moved under, in tree order: every row but itself,
 * its own descendants, its current parent (where it already is) and any row
 * the dependencies already drawn would refuse — {@link planMove}'s own verdict
 * for a middle drop, so the picker and the drag never disagree.
 */
export function moveUnderCandidates(flat: readonly TreeRow[], row: TreeRow): TreeRow[] {
  return flat.filter(
    (candidate) => candidate.id !== row.parentId && planMove(flat, row.id, candidate.id, 'into').ok,
  );
}

/** How a destination is named, in the picker and in the drag's `Move under …` cue. */
export const destinationLabel = (row: Pick<TreeRow, 'number' | 'name'>): string =>
  row.name === '' ? row.number : `${row.number} · ${row.name}`;

/**
 * Move under…: the keyboard's and the phone's way to put a row under any
 * parent, where Alt+Right only reaches the sibling above. One button per
 * destination, so choosing one is a single activation, and the same move a
 * middle drop sends.
 */
export function MoveUnderPicker({
  row,
  candidates,
  onChoose,
  onOpenChange,
}: {
  row: TreeRow;
  candidates: readonly TreeRow[];
  onChoose: (parentId: string) => void;
  /** `false` on Cancel, Escape or a click outside: nothing is sent. */
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent side="centre" closeButton={false} className="max-w-sm">
        <ModalHeader>
          <ModalTitle>Move {row.number} under…</ModalTitle>
          <ModalDescription>It becomes the last child of the row you choose.</ModalDescription>
        </ModalHeader>
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  onChoose(candidate.id);
                }}
              >
                {destinationLabel(candidate)}
              </Button>
            </li>
          ))}
        </ul>
        <ModalFooter>
          <ModalClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
