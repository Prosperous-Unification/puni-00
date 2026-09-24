import type { RefreshResource } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type {
  CalendarMarkerRefusal,
  CalendarMarkers,
  CalendarMarkersHost,
} from '@/modules/calendar-markers/contract';
import type { Channel } from '@/modules/channel';
import type { PlanCommands } from '@/modules/plan-commands/contract';
import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
import type {
  PlanFeed,
  PlanFeedRefusal,
  PlanFeedStreamHandlers,
} from '@/modules/plan-feed/contract';
import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import type { Presence } from '@/modules/plan-feed/presence-store';
import type { Busy } from '@/modules/plan-writer/busy-store';
import type { PlanWriter, PlanWriteRefusal } from '@/modules/plan-writer/contract';
import type { Store } from '@/modules/store';

/** What a reader hands for its feed: everything the feed needs but the routes. */
export type PlanFeedReader = Omit<PlanFeedForReader, 'routes'>;

/** What a reader hands for its marker gestures: everything they need but the routes. */
export type CalendarMarkersReader = Omit<CalendarMarkersHost, 'api'>;

/**
 * What a plan screen may build for the project it shows: its feed, its marker
 * gestures and its commands — feature-services only (rule K2).
 *
 * Factories and not instances, because the table still owns when each is
 * opened and closed: the feed per reader effect, the markers and the commands
 * per reader memo. The project runtime of OpenSpec task 10 builds them once
 * per selected project instead. The HTTP client and the three private ports
 * cut from it are inside, and no member hands either out.
 *
 * Its **identity** is the reader's API identity: a table that is handed a
 * different one has been handed a different client, and every stale-owner guard
 * that compared the client before compares this now.
 */
export interface ProjectServices {
  /** Opens one reader's live plan, reading through the plan feed's routes. */
  readonly planFeedFor: (reader: PlanFeedReader) => PlanFeed;
  /** One reader's calendar-marker gestures, writing through the markers' routes. */
  readonly calendarMarkersFor: (reader: CalendarMarkersReader) => CalendarMarkers;
  /** The commands of one project, bound to it, writing through the commands' routes. */
  readonly planCommandsFor: (projectId: string) => PlanCommands;
}

/**
 * A refusal one of this project's services announces: the feed's and the
 * markers' as a cause, the writer's as the sentence it already chose.
 *
 * The words for a cause are built by whoever listens, and nowhere here, for the
 * reason `PlanFeedDelivery` gives: a service that imported the refusal
 * vocabulary would be importing upward out of `components/`.
 */
export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRefusal;

/**
 * What a project's stream tells its runtime: the feed's two handlers, and who
 * else is in the project, which arrives on the same socket.
 */
export interface ProjectStreamHandlers extends PlanFeedStreamHandlers {
  onPresence: (users: readonly string[]) => void;
}

/** How a project's stream is opened: by project, with its runtime's handlers, from its baseline. */
export type OpenProjectStream = (
  projectId: string,
  handlers: ProjectStreamHandlers,
  baseline: number,
) => ProjectStream;

/**
 * What one project runtime is built over: the services cut from the session's
 * one client, and the way its stream is opened — absent where there is no
 * socket, as in a suite that draws the table on its own.
 */
export interface ProjectSource {
  readonly services: ProjectServices;
  readonly subscribe: OpenProjectStream | undefined;
}

/**
 * The services of one selected project, for as long as its runtime is the one
 * published — and nothing else (rule K2).
 *
 * One of each, built once when the project is opened and given back when it is
 * left: the delivered plan the feed writes and the table selects, busy, the two
 * announcement channels, the marker gestures, the writer and the commands. No
 * bag, no client, no port, no refresh owner and no stream is reachable from
 * here; the runtime's own suite enumerates this surface rather than trusting
 * the type.
 *
 * **`isCurrent` is the one answer to "is this reader still on screen"**, and
 * every guard that used to compare the table's own refs reads it instead. It
 * turns false the instant the owner withdraws this runtime — before its
 * disposal starts, whether or not a replacement follows — and never turns true
 * again, so a late answer, a captured reread and a marker gesture from a
 * runtime that has been left all find it false.
 */
export interface ProjectRuntime {
  readonly projectId: string;
  /** Whether this runtime is still the one its owner publishes. */
  readonly isCurrent: () => boolean;
  /** Every publication of the feed, folded; the table selects from it. */
  readonly plan: Store<DeliveredPlan>;
  /**
   * Who else has this project open, and whether the socket saying so is up —
   * this project's and nobody else's, starting from nobody, disconnected.
   */
  readonly presence: Store<Presence>;
  /** Raised while a gesture is out; lowered when it ends only while this runtime is current. */
  readonly busy: Busy;
  /** Every refusal this project's services announce, once each. */
  readonly refusals: Channel<PlanRefusal>;
  /** Says that a gesture is starting, before its first request is sent. */
  readonly commandsIssued: Channel<undefined>;
  /**
   * Reads these resources again and awaits the covering outcome, only while this
   * runtime is current; failures stay in the feed's own snapshot.
   */
  readonly reread: (resources: readonly RefreshResource[]) => Promise<void>;
  readonly markers: CalendarMarkers;
  readonly writer: PlanWriter;
  readonly commands: PlanCommands;
}
