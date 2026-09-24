import type {
  CalendarMarkerService,
  CalendarMarkerServiceOptions,
} from './calendar-marker.resource';

/**
 * What a host must supply to install {@link calendarMarkerModule}.
 *
 * Exactly {@link CalendarMarkerServiceOptions}, unchanged by the move: the
 * project and marker stores of the one scope being installed over, the clock,
 * and the optional broadcaster. `servicesOver` supplies the stores of each
 * admitted scope, so one installation never outlives the scope it was built
 * over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Calendar marker is a resource: it
 * imports the domain library and repository ports and no other resource, and
 * `ports/sideways-type-boundaries.test.ts` keeps Plan document from reading
 * markers through it. What this extraction does not close is delivery's side:
 * `http/calendar-marker.routes.ts` and `http/project.routes.ts` still accept
 * `CalendarMarkerService` directly, the direct resource dependency of delivery
 * (K2) the backend module map lists under its composition hazards. Tracked
 * under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type CalendarMarkerRequirements = CalendarMarkerServiceOptions;

/** What installing {@link calendarMarkerModule} adds to a host graph. */
export interface CalendarMarkerExports {
  readonly calendarMarkers: CalendarMarkerService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.calendar-marker` and the label
 * drops the `module.` prefix.
 */
export const CALENDAR_MARKER_LABEL = 'application.calendar-marker';
