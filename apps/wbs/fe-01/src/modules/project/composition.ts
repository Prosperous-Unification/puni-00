import type { ProjectApi } from '@/lib/wbs-api';
import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
import { planFeedForReader } from '@/modules/plan-feed/composition';

import type { ProjectServices } from './contract';

/**
 * The project composition root: the one place that holds the HTTP client and
 * cuts each plan module's private repository port from it.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. The client is typed as the broad
 * `ProjectApi` here and nowhere below: each module is handed it as its own
 * narrow port — the plan feed as `PlanReadRoutes`, the calendar markers as
 * `CalendarMarkerRoutes`, the commands as `PlanCommandRoutes` — and the
 * services returned expose none of them.
 *
 * Builds nothing and calls nothing until a factory is asked, and every port
 * reaches the client at the moment of each call. The project lifetime of the
 * rollout's last Task 6 row turns this into the project runtime; until then the
 * page calls it once per client.
 */
export function projectServicesOver(client: ProjectApi): ProjectServices {
  return {
    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
  };
}
