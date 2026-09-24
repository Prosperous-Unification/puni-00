import type { CalendarMarkers, CalendarMarkersHost } from '@/modules/calendar-markers/contract';
import type { PlanCommands } from '@/modules/plan-commands/contract';
import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
import type { PlanFeed } from '@/modules/plan-feed/contract';

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
