import type {
  DirectoryRead,
  PlanRefresh,
  PlanRefreshSnapshot,
  RefreshFailure,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
import type { Store } from '@/modules/store';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a
 * screen sees a feature-service and never the resource-service beneath it. The
 * same line stands in `modules/directory-management/contract.ts`, for the same
 * rule.
 */
export type { PlanRefreshSnapshot, RefreshResource };

/**
 * How far each resource has been delivered to whoever is drawing the plan.
 *
 * Per resource and not one number for the feed, because the four are read
 * separately and land in any order: a held directory read may arrive after a
 * newer tree has already installed, and it is still the newest directory
 * anybody has. Zero is "nothing delivered yet", which is what a generation
 * counter that starts at one makes safe.
 */
export interface AppliedGenerations {
  readonly tree: number;
  readonly steps: number;
  readonly directory: number;
  readonly markers: number;
}

/**
 * What one publication has for its reader, and nothing it has already had.
 *
 * A **delta** over the store snapshot below: each installed member is null when
 * that resource has nothing new, so a reader applies exactly what moved and
 * leaves the rest of the screen alone. Null means "unchanged", never "empty".
 *
 * `treeFailure` carries the **cause** and not a sentence. Saying things to a
 * person is the Notices module's job and lives in delivery until that module
 * exists; a service that imported the refusal vocabulary would be importing
 * upward out of `components/`, which the import matrix forbids.
 */
export interface PlanFeedDelivery {
  readonly staleResources: readonly RefreshResource[];
  readonly treeFailure: { readonly cause: unknown } | null;
  readonly directory: DirectoryRead | null;
  readonly tree: { readonly value: PlanRead; readonly generation: number } | null;
  readonly steps: readonly StepView[] | null;
  readonly markers: readonly CalendarMarkerView[] | null;
}

/** A refusal this feed owes the reader, in the terms its words are built from. */
export interface PlanFeedRefusal {
  readonly cause: unknown;
}

/**
 * What the feed's stream tells it.
 *
 * Declared here rather than imported from the plan read hook, which exports a
 * structurally identical `SubscriptionHandlers`: a service does not import from
 * its delivery. The two are assignable in both directions, which is what lets
 * the composition site pass this object straight to the hook's `subscribe`
 * prop.
 */
export interface PlanFeedStreamHandlers {
  /** See `ProjectStreamOptions.onChange`: what the frame said changed, or `null`. */
  onChange: (changed?: string | null, seq?: number) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * What the reading needs from whoever built it.
 *
 * `isLive` is the whole of what this resource knows about lifetimes: whether
 * anybody is still listening. **Who** that is — which project, which API,
 * whether the screen has been torn down — is the feature's knowledge, and it
 * answers this one question on the resource's behalf.
 */
export interface PlanReadingPorts {
  readonly openOwner: () => PlanRefresh;
  readonly openStream:
    ((handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream) | null;
  readonly isLive: () => boolean;
  readonly deliver: (delivery: PlanFeedDelivery) => void;
  readonly reportFailures: (failures: readonly RefreshFailure[]) => void;
  readonly reportConnection: (connected: boolean) => void;
}

/**
 * One project's refresh, its stream and its generations.
 *
 * The **resource**-service: the quirks and invariants of one resource — the
 * plan as this browser holds it — its staleness, its refresh and its stream
 * replay, which is what the design says a frontend resource-service holds. It
 * imports no React (F1) and exposes the store contract (F2) over the refresh
 * owner, whose snapshot object is rebuilt only when something in it changed.
 */
export interface PlanReading extends Store<PlanRefreshSnapshot> {
  /** The refresh owner of this reading — see {@link PlanFeed.owner}. */
  readonly owner: PlanRefresh;
  /**
   * Reads these resources again, awaiting the covering outcome.
   *
   * Failures are not thrown: they stay in the owner's snapshot and reach the
   * screen as the stale banner on the next publication.
   */
  readonly rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Stop listening, dispose the owner, drop the stream. */
  readonly close: () => void;
}

/**
 * What the plan feed needs from whoever is hosting it.
 *
 * Every member is a function for {@link PlanWriterHost}'s reason: all of them
 * are read at the moment something happens, not at the moment the feed is
 * built. A reader can leave for another project between a read starting and its
 * answer arriving, and the feed is still alive when it does.
 */
export interface PlanFeedHost {
  readonly openOwner: () => PlanRefresh;
  readonly openStream:
    ((handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream) | null;
  /**
   * Whether this feed still owns the screen: the same project and the same API
   * it was opened for.
   *
   * Separate from the feed being closed, and both are needed. A render can
   * install new props before the effect that closes this feed has run, and work
   * already in flight must know it no longer owns the table by then.
   */
  readonly isActiveReader: () => boolean;
  /** Hands the reader everything that changed since the last publication. */
  readonly publish: (delivery: PlanFeedDelivery) => void;
  /** Announces one refusal to whoever says things to the reader. */
  readonly announceRefusal: (refusal: PlanFeedRefusal) => void;
  /** Says whether the socket carrying other people's changes is up. */
  readonly setConnected: (connected: boolean) => void;
}

/**
 * The live plan on screen, for as long as this reader owns it.
 *
 * The **feature**-service, and the only thing delivery sees: one piece of
 * user-facing value — the table keeps up with other people's changes, and stops
 * the moment this reader leaves — coordinated over one resource-service. It
 * imports no React (F1) and passes on the store contract (F2).
 */
export interface PlanFeed extends Store<PlanRefreshSnapshot> {
  /**
   * The refresh owner of this lifetime.
   *
   * Exposed, rather than kept private, because two callers still reach it
   * directly and this packet moves neither: the plan writer compares its
   * **identity** to decide whether the gesture it began still belongs to the
   * reader on screen, and the marker write invalidates the marker resource on
   * it. Both leave with their own services in later packets; until then,
   * handing out the owner is what keeps this extraction behaviour-free.
   */
  readonly owner: PlanRefresh;
  /** Reads these resources again, awaiting the covering outcome. */
  readonly rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Ends this lifetime: nothing after it reaches the screen. */
  readonly close: () => void;
}
