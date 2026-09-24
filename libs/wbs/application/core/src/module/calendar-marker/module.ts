import { DiBag } from 'di-bag';

import type { CalendarMarkerStore } from '../../ports/calendar-marker-store';
import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import {
  CalendarMarkerService,
  type CalendarMarkerServiceOptions,
} from './calendar-marker.resource';
import { CALENDAR_MARKER_LABEL } from './contract';

/**
 * Calendar marker as a sealed DI Bag module.
 *
 * Only `calendarMarkers` is exported. `calendarMarkerOptions` stays private to
 * each installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.calendar-marker/calendarMarkerOptions` rather
 * than against an anonymous binding. The two stores are required as
 * `projectStore` and `calendarMarkerStore` because the host graph's
 * `calendarMarkers` key is this module's export. `broadcast` is registered
 * even when absent, as `undefined`, the way Saved plans registers its optional
 * quota: the resource then announces nothing, as it always has.
 *
 * The module registers no disposer: `CalendarMarkerService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const calendarMarkerModule = DiBag.createBuilder()
  .register({
    calendarMarkerOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        calendarMarkerStore,
        clock,
        broadcast,
      }: {
        projectStore: ProjectStore;
        calendarMarkerStore: CalendarMarkerStore;
        clock: Clock;
        broadcast: Broadcaster | undefined;
        // Proof (2026-09-24): leaving `broadcast` out of the returned options left
        // `announces a created marker through the broadcaster installCalendarMarker wires` failing
        // (4 pass, 1 fail): the recording broadcaster received `[]`.
      }): CalendarMarkerServiceOptions => ({
        projects: projectStore,
        markers: calendarMarkerStore,
        clock,
        broadcast,
      }),
    ),
  })
  .register({
    calendarMarkers: DiBag.fromSyncFactory(
      ({
        calendarMarkerOptions,
      }: {
        calendarMarkerOptions: CalendarMarkerServiceOptions;
      }): CalendarMarkerService => new CalendarMarkerService(calendarMarkerOptions),
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['calendarMarkers', 'calendarMarkerOptions']`
  // left the private-binding, graph-label and missing-requirement assertions failing (2 pass,
  // 3 fail): `resolve('calendarMarkerOptions')` did not throw, `inspectGraph()` reported bare
  // `calendarMarkerOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: CALENDAR_MARKER_LABEL }` left only the two label
  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `calendarMarkerOptions`
  // unlabelled, and the missing-requirement message named `calendarMarkerOptions` instead of
  // `application.calendar-marker/calendarMarkerOptions`.
  .buildModule(['calendarMarkers'], { label: CALENDAR_MARKER_LABEL });
