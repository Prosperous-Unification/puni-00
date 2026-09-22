import type { CalendarMarker } from './calendar-marker-store';

/**
 * Why a marker could not be listed, stored or changed. All four are states.
 *
 * `not_found` covers **both** "no such project" and "no such marker of this
 * project", and it stays one reason on the wire: a caller who could tell the
 * two apart by the reason would learn that a marker it may not see exists
 * (spec.md, "a marker of another project answers `not_found` rather than
 * `forbidden`"). Which of the two it was is carried beside the reason instead,
 * as {@link CalendarMarkerSubject}.
 */
export type CalendarMarkerRefusal = 'not_found' | 'forbidden' | 'taken';

/**
 * What a refusal is **about** — the project the request addressed, or the
 * marker inside it.
 *
 * This is not a second reason and never reaches a client as one. It exists so a
 * route can answer the spec's `field` honestly: the refusal table blames
 * `markerId` for a marker that is absent or another project's, and the routes
 * used to blame it for an **absent project** too, naming a value that had
 * nothing to do with the refusal (TASK-279 AC #7). Only the Calendar marker
 * service knows which check failed — its gate reads the project, the store
 * reads the marker inside its own transaction — so only it can say.
 *
 * It leaks nothing the reason did not already: an existing project the caller
 * may not write answers `forbidden` and an absent one answers `not_found`, so
 * project existence is already distinguishable from outside. Marker existence
 * is not, and stays that way — `about` never reaches the wire, and the routes
 * turn it into a `field` only for a request that named a marker id itself. A
 * create that let the service mint one can still be refused `about: 'marker'`
 * (the minted id collided), and the route blames nothing for it, because the
 * two questions are separate and both are asked.
 */
export type CalendarMarkerSubject = 'project' | 'marker';

export interface CalendarMarkerRefused {
  ok: false;
  reason: CalendarMarkerRefusal;
  about: CalendarMarkerSubject;
}

export type CalendarMarkerListOutcome =
  { ok: true; value: CalendarMarker[] } | CalendarMarkerRefused;

/**
 * A project's markers, read by something that does not own them.
 *
 * Plan document needs the list and nothing else. Naming that here rather than
 * accepting `CalendarMarkerService` is what keeps one resource out of another
 * resource's file: the import matrix of
 * `docs/superpowers/specs/2026-09-19-code-organization-design.md` forbids the
 * resource-to-resource edge (K6), and `CalendarMarkerService` satisfies this
 * contract without either file knowing about the other.
 *
 * The refusal shape lives here rather than with the store port because it is
 * the service's answer, not the table's: {@link CalendarMarkerStore} refuses
 * with `not_found` or `taken` only and has no notion of `forbidden`.
 */
export interface CalendarMarkerReader {
  list(projectId: string): Promise<CalendarMarkerListOutcome>;
}
