import type {
  SavedPlanCompareReply,
  SavedPlanListEntryView,
  SavedPlanListReply,
  SavedPlanRemoveReply,
  SavedPlanRenameReply,
  SavedPlanSaveReply,
  SavedPlanSideRef,
} from '@/lib/saved-plan-api';
import type { Store } from '@/modules/store';

/**
 * What the shelf can be showing, as one value.
 *
 * A union rather than three booleans beside an array, because the states are
 * genuinely exclusive and the interesting one — `unavailable` — is not a
 * failure. A node without the routes is a healthy node that cannot answer this
 * question, and modelling it as `error` with a special code would put it one
 * `if` away from being rendered as a fault the reader is asked to retry.
 */
export type SavedPlanListState =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'ready'; readonly rows: readonly SavedPlanListEntryView[] };

/**
 * The saved plans' private repository port: the checkpoint routes of be-01, the
 * question whether this node has them at all, and the broadcast that says a
 * project's shelf moved.
 *
 * Handed to this module by the project composition root and never to delivery,
 * which sees {@link SavedPlans} instead (rule K2).
 */
export interface SavedPlanRoutes {
  /** Whether this node serves the saved-plan routes; a document that cannot be read rejects. */
  readonly available: () => Promise<boolean>;
  readonly list: (projectId: string) => Promise<SavedPlanListReply>;
  readonly save: (projectId: string, name?: string) => Promise<SavedPlanSaveReply>;
  readonly rename: (savedPlanId: string, name: string) => Promise<SavedPlanRenameReply>;
  readonly remove: (savedPlanId: string) => Promise<SavedPlanRemoveReply>;
  readonly compare: (
    projectId: string,
    left: SavedPlanSideRef,
    right: SavedPlanSideRef,
  ) => Promise<SavedPlanCompareReply>;
  /**
   * Calls `onChange` on every broadcast about the project, until unsubscribed, with the event's
   * type when the frame names one (`subscribeToProject`'s `changed`) and `null` or nothing when
   * it does not; and `onResettled` once each time the stream comes back after a drop, since what
   * was published in the gap is lost. A resettle is its own call, not an `onChange(null)`, so a
   * reader can say the plan *may* have changed rather than that it has (UI review F-135).
   */
  readonly subscribe: (
    projectId: string,
    onChange: (changed?: string | null) => void,
    onResettled: () => void,
  ) => { unsubscribe(): void };
}

/**
 * One selected project's saved plans, for as long as its project runtime is the
 * one published — a feature-service (rule K2).
 *
 * The shelf is read once when the runtime is opened, again on every broadcast
 * and on {@link SavedPlans.refresh}, and stops when the runtime is retired. Once
 * the runtime has been withdrawn the shelf never changes again, and every
 * request rejects with {@link SavedPlansWithdrawnError} and sends nothing.
 */
export interface SavedPlans {
  /** The shelf, starting from `loading`. */
  readonly shelf: Store<SavedPlanListState>;
  /**
   * How many broadcasts since this runtime opened may have moved the live plan, starting at 0.
   *
   * Every broadcast counts but {@link SAVED_PLANS_CHANGED}, which says only that the shelf moved:
   * a saved plan never changes, so a save, rename or delete leaves both sides of a comparison
   * where they were (F-100). A frame that names no type, or a type this side does not know,
   * counts — it may have moved anything (R5). The reader's own edits count too, because be-01
   * publishes them on the same stream. So does the stream coming back after a drop: what was
   * published while it was down never arrives, so the routes report the reconnect as a change of
   * unknown type.
   */
  readonly livePlanRevision: Store<number>;
  /**
   * How many of {@link SavedPlans.livePlanRevision}'s counts were the stream coming back after a
   * drop, starting at 0: a move that is only possible, where every other count is a frame that
   * was published. Published with the revision, so a reader of both never sees one ahead.
   */
  readonly livePlanResettles: Store<number>;
  /** Reads the shelf again, which no broadcast would have caused: the actor's own fast path. */
  readonly refresh: () => void;
  /**
   * Saves the current plan as a new checkpoint under `name`, or, with none, under the name
   * be-01 makes from its own timestamp.
   */
  readonly save: (name?: string) => Promise<SavedPlanSaveReply>;
  readonly rename: (savedPlanId: string, name: string) => Promise<SavedPlanRenameReply>;
  /** Deletes one saved plan, as its creator or the project's owner. */
  readonly remove: (savedPlanId: string) => Promise<SavedPlanRemoveReply>;
  readonly compare: (
    left: SavedPlanSideRef,
    right: SavedPlanSideRef,
  ) => Promise<SavedPlanCompareReply>;
}

/** The broadcast `saved-plan.controller.ts` publishes on save, rename and delete (TASK-255). */
export const SAVED_PLANS_CHANGED = 'saved_plans_changed';

/** What a project runtime opens its saved plans with: the project, and its own liveness. */
export interface SavedPlansReader {
  readonly projectId: string;
  /** The project runtime's `isCurrent`, asked synchronously whenever anything happens. */
  readonly isCurrent: () => boolean;
}

/** One project's saved plans, and the one way their shelf's watch is given back. */
export interface OpenedSavedPlans {
  readonly savedPlans: SavedPlans;
  /** Stops the shelf's watch and unsubscribes its stream; throws what the stream threw. */
  readonly close: () => void;
}

/** A saved-plan request asked of a project runtime that has already been withdrawn. */
export class SavedPlansWithdrawnError extends Error {
  constructor() {
    super('project_withdrawn');
    this.name = 'SavedPlansWithdrawnError';
  }
}
