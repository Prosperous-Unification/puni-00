import { type ProjectStreamDeps, subscribeToProject } from '@/lib/project-stream';
import type { ProjectApi } from '@/lib/wbs-api';
import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
import { planFeedForReader } from '@/modules/plan-feed/composition';

import type { ProjectServices, ProjectSource } from './contract';

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
  // Proof: on 2026-09-24, cutting the ports from a copy of the client taken here (`{ ...client }`)
  // failed `reaches the client at the moment of each call, not when it was composed` with
  // `expected [] to deeply equal [ 'tree:p1', 'arrange:p1' ]`.
  return {
    // Proof: on 2026-09-24, reading the feed through a second client (`httpProjectApi('')`) failed
    // `reads the reader’s project through the one client, and nothing before it is asked` with
    // `expected null not to be null`: no tree ever arrived.
    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
    // Proof: on 2026-09-24, writing the markers through a second client (`httpProjectApi('')`)
    // failed `writes the reader’s calendar markers through the one client` with `Error: refused:
    // WbsRequestError: Failed to parse URL from /api/projects/p1/calendar-markers`.
    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
    // Proof: on 2026-09-24, handing out the first project's commands for every project failed
    // `binds each project’s commands to that project, over the same client` with
    // `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]`.
    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
  };
}

/**
 * What every project runtime of one session is built over: the plan services
 * cut from the session's one client, and the stream opened for each project.
 *
 * Composed once per session, by the session owner, and never in delivery: the
 * page names a project and the session opens it over this. `streamDeps` is the
 * socket's own wiring, left out in production and injected by suites, which
 * keeps every line of the joining below production code.
 */
export function projectSourceOver(
  client: ProjectApi,
  streamDeps?: ProjectStreamDeps,
): ProjectSource {
  return {
    services: projectServicesOver(client),
    subscribe: (projectId, handlers, baseline) =>
      subscribeToProject(
        {
          projectId,
          // The owner read this tree anchor before its unsequenced resources.
          // Replay closes the interval from that anchor to socket registration.
          // Proof: hardcoding -1 here or at the adapter factory call sends -1
          // instead of 7 in `resumes the table subscription from its covered positive anchor`.
          sinceSeq: baseline,
          hasBaseline: true,
          onChange: handlers.onChange,
          // The project's runtime tells its own presence, and the feed, from here.
          // Proof: on 2026-09-24, `() => undefined` here failed `hands the presence slot who the
          // project’s stream says is here, and its connection` on `expected { users: [ 'kat', 'lee' ],
          // …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`, `connected` staying `false`.
          onConnectionChange: handlers.onConnectionChange,
          // Proof: on 2026-09-24, `() => undefined` here failed `hands the presence slot who the
          // project’s stream says is here, and its connection` on `expected { users: [], connected:
          // false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`.
          onPresence: handlers.onPresence,
        },
        streamDeps,
      ),
  };
}
