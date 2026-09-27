import type {
  SavedPlanCompareReply,
  SavedPlanListEntryView,
  SavedPlanListReply,
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
  readonly compare: (
    projectId: string,
    left: SavedPlanSideRef,
    right: SavedPlanSideRef,
  ) => Promise<SavedPlanCompareReply>;
  /** Calls `onChange` on every broadcast about the project, until unsubscribed. */
  readonly subscribe: (projectId: string, onChange: () => void) => { unsubscribe(): void };
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
  /** Reads the shelf again, which no broadcast would have caused: the actor's own fast path. */
  readonly refresh: () => void;
  /** Saves the current plan as a new checkpoint, named by be-01 from its own timestamp. */
  readonly save: () => Promise<SavedPlanSaveReply>;
  readonly rename: (savedPlanId: string, name: string) => Promise<SavedPlanRenameReply>;
  readonly compare: (
    left: SavedPlanSideRef,
    right: SavedPlanSideRef,
  ) => Promise<SavedPlanCompareReply>;
}

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
