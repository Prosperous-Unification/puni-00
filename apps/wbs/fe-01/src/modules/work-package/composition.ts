import type { ResourceScope } from '@/lib/organization-context';
import { httpSavedPlanApi, savedPlansAvailable } from '@/lib/saved-plan-api';
import type { WorkPackageAddressApi, WorkPackageApi } from '@/lib/wbs-api';
import { subscribeToWorkPackage, type WorkPackageStreamDeps } from '@/lib/work-package-stream';
import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
import { openDependencyLookup } from '@/modules/dependency-lookup/dependency-lookup.feature';
import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
import { planFeedForReader } from '@/modules/plan-feed/composition';
import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';
import { openSavedPlans } from '@/modules/saved-plans/saved-plans.feature';

import type { WorkPackageServices, WorkPackageSource } from './contract';

/**
 * The work package composition root: the one place that holds the HTTP client and
 * cuts each plan module's private repository port from it.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. The client is typed as the broad
 * `WorkPackageApi` here and nowhere below: each module is handed it as its own
 * narrow port — the plan feed as `PlanReadRoutes`, the calendar markers as
 * `CalendarMarkerRoutes`, the commands as `PlanCommandRoutes` — and the
 * services returned expose none of them. The saved plans are the one module
 * not cut from this client: be-01's checkpoint routes are a client of their
 * own, handed in as `savedPlanRoutes`.
 *
 * Builds nothing and calls nothing until a factory is asked, and every port
 * reaches the client at the moment of each call. The work package lifetime of the
 * rollout's last Task 6 row turns this into the work package runtime; until then the
 * page calls it once per client.
 */
export function workPackageServicesOver(
  client: WorkPackageApi,
  savedPlanRoutes: SavedPlanRoutes,
  addressRoutes: WorkPackageAddressApi,
): WorkPackageServices {
  // Proof: on 2026-09-24, cutting the ports from a copy of the client taken here (`{ ...client }`)
  // failed `reaches the client at the moment of each call, not when it was composed` with
  // `expected [] to deeply equal [ 'tree:p1', 'arrange:p1' ]`.
  return {
    dependencyLookupFor: (reader) => openDependencyLookup({ ...reader, routes: addressRoutes }),
    // Proof: on 2026-09-24, reading the feed through a second client (`httpWorkPackageApi('')`) failed
    // `reads the reader’s workPackage through the one client, and nothing before it is asked` with
    // `expected null not to be null`: no tree ever arrived.
    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
    // Proof: on 2026-09-24, writing the markers through a second client (`httpWorkPackageApi('')`)
    // failed `writes the reader’s calendar markers through the one client` with `Error: refused:
    // WbsRequestError: Failed to parse URL from /api/work-packages/p1/calendar-markers`.
    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
    // Proof: on 2026-09-24, handing out the first work package's commands for every work package failed
    // `binds each workPackage’s commands to that workPackage, over the same client` with
    // `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]`.
    planCommandsFor: (workPackageId) => createPlanCommands({ workPackageId, routes: client }),
    savedPlansFor: (reader) => openSavedPlans({ ...reader, routes: savedPlanRoutes }),
  };
}

/**
 * The saved plans' port over the browser: be-01's checkpoint routes, the
 * capability question asked of the served OpenAPI document, and a stream of the
 * work package's own that says its shelf moved.
 *
 * HTTP and the stream both authenticate with the serving origin's cookies.
 * `sinceSeq: -1` is the shelf's honest answer: a shelf read is a list of saved
 * plans, not a read of the work package at a sequence, so there is nothing for it to
 * resume from. The plan feed owns that conversation on its own socket.
 */
export function browserSavedPlanRoutes(
  streamDeps?: WorkPackageStreamDeps,
  scope?: ResourceScope,
): SavedPlanRoutes {
  const api = httpSavedPlanApi(scope);
  return {
    available: savedPlansAvailable,
    list: (workPackageId) => api.list(workPackageId),
    save: (workPackageId, name) => api.save(workPackageId, name),
    rename: (savedPlanId, name) => api.rename(savedPlanId, name),
    remove: (savedPlanId) => api.remove(savedPlanId),
    compare: (workPackageId, left, right) => api.compare(workPackageId, left, right),
    subscribe: (workPackageId, onChange) => {
      // The shelf subscribes without resuming, so whatever was published while its socket was
      // down never arrives. A resettle after a drop is reported as a change this side cannot
      // name: it may have moved the plan and the list (UI review F-100, the reconnect half).
      let dropped = false;
      return subscribeToWorkPackage(
        {
          workPackageId,
          sinceSeq: -1,
          onChange,
          onConnectionChange: (connected) => {
            // Proof: on 2026-10-16, without this callback, `counts a reconnect after a drop as a
            // move of the live plan, and rereads the shelf (F-100)` failed on `expected +0 to
            // be 1`.
            if (connected && dropped) onChange(null);
            dropped = !connected;
          },
        },
        streamDeps,
      );
    },
  };
}

/**
 * What every work package runtime of one session is built over: the plan services
 * cut from the session's one client, the saved plans over their own port, and
 * the stream opened for each work package.
 *
 * Composed once per session, by the session owner, and never in delivery: the
 * page names a work package and the session opens it over this. `streamDeps` is the
 * socket's own wiring and `savedPlanRoutes` the checkpoint routes', both left
 * out in production and injected by suites, which keeps every line of the
 * joining below production code.
 */
export function workPackageSourceOver(
  client: WorkPackageApi,
  addressRoutes: WorkPackageAddressApi,
  streamDeps?: WorkPackageStreamDeps,
  savedPlanRoutes: SavedPlanRoutes = browserSavedPlanRoutes(streamDeps),
): WorkPackageSource {
  return {
    services: workPackageServicesOver(client, savedPlanRoutes, addressRoutes),
    subscribe: (workPackageId, handlers, baseline) =>
      subscribeToWorkPackage(
        {
          workPackageId,
          // The owner read this tree anchor before its unsequenced resources.
          // Replay closes the interval from that anchor to socket registration.
          // Proof: hardcoding -1 here or at the adapter factory call sends -1
          // instead of 7 in `resumes the table subscription from its covered positive anchor`.
          // Proof: ws-covered-positive-anchor injects discarding the supplied anchor resumes the actual page from-1 instead of its covered7.
          // Test: uses covered 7 current anchor beside obsolete stored project cursor
          sinceSeq: baseline,
          // Proof: ws-covered-empty-anchor injects losing explicit baseline coverage suppresses resume from the actual page empty anchor-1.
          // Test: uses covered -1 current anchor beside obsolete stored project cursor
          hasBaseline: true,
          onChange: handlers.onChange,
          // The work package's runtime tells its own presence, and the feed, from here.
          // Proof: on 2026-09-24, `() => undefined` here failed `hands the presence slot who the
          // work package’s stream says is here, and its connection` on `expected { users: [ 'kat', 'lee' ],
          // …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`, `connected` staying `false`.
          onConnectionChange: handlers.onConnectionChange,
          // The plan feed is the one subscriber that opts into claims
          // announcements; the saved-plan shelf's socket does not (C21).
          onClaims: handlers.onClaims,
          // Proof: on 2026-09-24, `() => undefined` here failed `hands the presence slot who the
          // work package’s stream says is here, and its connection` on `expected { users: [], connected:
          // false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`.
          onPresence: handlers.onPresence,
        },
        streamDeps,
      ),
  };
}
