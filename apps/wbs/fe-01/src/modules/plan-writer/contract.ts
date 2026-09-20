import type { RunPlanWrite } from '@/lib/local-write';
import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';

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
 * Every member is a function rather than a value because all of them are read at
 * the moment a gesture asks, not at the moment the writer is built: the feed
 * owner can be renewed under the same reader by a covering read, and the reader
 * can leave for another project between a request and its answer.
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
  /**
   * Records where the gesture now starting was issued from, synchronously.
   *
   * Called at the moment the gesture happens and not when its answer arrives:
   * everything between the two is the interval in which the reader may have gone
   * somewhere else, and that interval is the thing the focus intent measures.
   */
  noteCommandIssued: () => void;
  /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
  rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Raises and clears the shared busy state the toolbar and the cells read. */
  setBusy: (busy: boolean) => void;
  /** Announces one refusal to whoever says things to the reader. */
  announceRefusal: (refusal: PlanWriteRefusal) => void;
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
