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
 * Two kinds of member, and no React in either. The first two are **read** at
 * the moment a gesture asks, not at the moment the writer is built: the reader
 * can leave for another project between a request and its answer. The last
 * three are the project's own **store and ports** — the writer raises and
 * lowers busy through one and says what happened through the other two, and
 * never learns who is listening.
 */
export interface PlanWriterHost {
  /**
   * The plan feed owner as it stands now: null while none is installed, and
   * null from the instant the reader is withdrawn.
   *
   * Its **identity** is all that is read — a gesture compares the owner it began
   * under against the owner answered when its answer arrives, and that is the
   * whole of "is this still the reader's gesture". A feed opens its refresh
   * owner once and never renews it, and the project runtime answers `null` here
   * once its owner has withdrawn it (`readRefreshOwner` in
   * `runtime/project-runtime.ts`), so a reader that left and a reader replaced
   * fail the same comparison. The writer calls no member of it; rereads go
   * through {@link PlanWriterHost.rereadResources}.
   */
  readRefreshOwner: () => PlanRefresh | null;
  /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
  rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /**
   * The project's busy state: raised when a gesture starts, and lowered when it
   * ends, however it ended. It is one project runtime's own, so a gesture whose
   * reader has left lowers only a busy state nobody draws any more.
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
