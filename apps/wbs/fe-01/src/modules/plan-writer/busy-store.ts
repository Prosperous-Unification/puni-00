import { createChannel } from '@/modules/channel';
import type { Store } from '@/modules/store';

/**
 * Whether this project is waiting for be-01 on one of its reader's gestures —
 * the shared busy state the toolbar and the cells read.
 *
 * A gesture raises it when it starts and lowers it when it ends, **if its
 * reader is still the one on screen**. That condition is the gesture's to test,
 * not this store's: it is the same question the gesture already asks before it
 * spends its answer, `isActiveReader()` in `plan-writer.feature.ts`, and the
 * reason is the one the busy-replacement cases prove — a departed reader's
 * answer must not clear its replacement's pending rename. What this store owns
 * is the value and the telling: a boolean, stable by value, and a listener is
 * told once for each change and never when a raise finds it already raised or a
 * lower finds it already lowered.
 *
 * Notification goes through {@link createChannel}, so a listener that raises or
 * lowers from inside its own notification is told again afterwards rather than
 * re-entered, and never while the value is being changed.
 *
 * Plain TypeScript and no lifetime of its own (rule F1): it holds no resource,
 * nothing closes it, and no call on it ever throws a lifecycle refusal. Its
 * owner today is the table's mount, one per project; the project runtime of
 * OpenSpec task 10 takes it over.
 */
export interface Busy extends Store<boolean> {
  readonly raise: () => void;
  readonly lower: () => void;
}

/** The half of {@link Busy} a gesture is handed: it can raise and lower, and cannot listen. */
export type BusyWrites = Pick<Busy, 'raise' | 'lower'>;

/** Builds a project's busy state, not busy. */
export function createBusy(): Busy {
  const changes = createChannel<undefined>();
  let busy = false;
  const become = (next: boolean): void => {
    // Proof: on 2026-09-24, removing this return failed `holds the last value raised or lowered,
    // and says so once per change` after 1 run on `lower: changes heard by the listener that never
    // leaves: expected 1 to be +0`.
    if (next === busy) return;
    // Proof: on 2026-09-24, publishing before this assignment failed `holds the last value raised
    // or lowered, and says so once per change` after 1 run on `raise: the last value the sentinel
    // read: expected false to be true`.
    busy = next;
    changes.publish(undefined);
  };
  return {
    subscribe: (onChange) => changes.subscribe(onChange),
    snapshot: () => busy,
    raise: () => {
      // Proof: on 2026-09-24, `become(!busy)` here failed `holds the last value raised or lowered,
      // and says so once per change` after 2 runs on `raise: busy: expected false to be true`.
      become(true);
    },
    lower: () => {
      // Proof: on 2026-09-24, making `lower` do nothing failed `holds the last value raised or
      // lowered, and says so once per change` after 1 run on `lower: busy: expected true to be
      // false`.
      become(false);
    },
  };
}
