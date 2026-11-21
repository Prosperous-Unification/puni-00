import type { SubtreeCopy, SubtreeStore, SubtreeWriteOutcome } from '../../ports/subtree-store';
import type { WriteStamp } from '../../ports/write-stamp';
import { retainFirstChildWrite } from './first-child';
import { retainMoveWrite } from './move';

/** Retains only the plain subtree payload/stamp before a Source write queue; no capability is cloned. */
export function retainSubtreeWrite(copy: SubtreeCopy, stamp: WriteStamp) {
  return { copy: structuredClone(copy), stamp: { ...stamp } };
}

/** Existing Source/loan assertions fence the exact delegated port, retaining its receiver. */
export function guardSubtreeWrites(store: SubtreeStore, assertOpen: () => void): SubtreeStore {
  return {
    async inspectFirstChild(write, stamp) {
      assertOpen();
      const kept = retainFirstChildWrite(write, stamp);
      const decision = await store.inspectFirstChild(kept.write, kept.stamp);
      assertOpen();
      return structuredClone(decision);
    },
    async writeMove(write, stamp) {
      assertOpen();
      const kept = retainMoveWrite(write, stamp);
      const written = await store.writeMove(kept.write, kept.stamp);
      assertOpen();
      return structuredClone(written);
    },
    async writeFirstChild(write, stamp) {
      assertOpen();
      const kept = retainFirstChildWrite(write, stamp);
      const written = await store.writeFirstChild(kept.write, kept.stamp);
      assertOpen();
      return structuredClone(written);
    },
    async insertSubtree(copy, stamp): Promise<SubtreeWriteOutcome> {
      assertOpen();
      const kept = retainSubtreeWrite(copy, stamp);
      const written = await store.insertSubtree(kept.copy, kept.stamp);
      assertOpen();
      return structuredClone(written);
    },
  };
}
