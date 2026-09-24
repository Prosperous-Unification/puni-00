import type { RunPlanWrite } from '@/lib/local-write';
import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
import type { Publisher } from '@/modules/channel';

import type { BusyWrites } from './busy-store';

/**
 * A gesture that be-01 refused, in the sentence a reader is owed.
 *
 * An **event** and not a return value, and the split is the same one the runner
 * has always made: a refused request is something that happened to somebody, so
 * it is announced once and stays until it is read, while the fact of the refusal
 * is the {@link RunPlanWrite} outcome the caller acts on. `CellInput` is the
 * caller that needs the fact and never the sentence.
 */
export interface PlanWriteRefusal {
  sentence: string;
}

/**
 * What the plan writer needs from whoever is hosting it.
 *
 * Two kinds of member, and no React in either. The first three are **read** at
 * the moment a gesture asks, not at the moment the writer is built: the feed
 * owner can be renewed under the same reader by a covering read, and the reader
 * can leave for another project between a request and its answer. The last
 * three are the project's own **store and ports** — the writer raises and
 * lowers busy through one and says what happened through the other two, and
 * never learns who is listening.
 */
export interface PlanWriterHost {
  /**
   * The plan feed owner as it stands now, or null while none is installed.
   *
   * Its **identity** is all that is read — a gesture compares the owner it began
   * under against the owner that exists when its answer arrives. The writer calls
   * no member of it; rereads go through {@link PlanWriterHost.rereadResources}.
   */
  readRefreshOwner: () => PlanRefresh | null;
  /**
   * Whether this writer still owns the screen: the same project and the same API
   * the gesture was issued against.
   *
   * Separate from the owner above because the two guards disagree on purpose. A
   * covering read may renew the feed owner for the same logical reader, and that
   * renewal must not cost the reader its own gesture's outcome or leave it busy.
   */
  isActiveReader: () => boolean;
  /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
  rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /**
   * The project's busy state: raised when a gesture starts, and lowered when it
   * ends only if {@link PlanWriterHost.isActiveReader} still answers yes — the
   * reader that raised it owns it; a different API or project does not.
   */
  busy: BusyWrites;
  /**
   * Says that a gesture is starting, synchronously, at the moment it happens and
   * not when its answer arrives: everything between the two is the interval in
   * which the reader may have gone somewhere else, and whoever draws the focus
   * measures that interval from here. The event carries nothing; what it means
   * for the focus is the listener's decision.
   */
  commandsIssued: Publisher<undefined>;
  /** Where a refusal is announced, once, to whoever says things to the reader. */
  refusals: Publisher<PlanWriteRefusal>;
}

/**
 * One project's writer: every plan gesture goes through it, and it is what
 * decides, for each one, what has to be read again afterwards.
 *
 * Framework-free by rule F1 of the code organization design. It imports no React
 * and announces nothing itself.
 */
export interface PlanWriter {
  run: RunPlanWrite;
}
