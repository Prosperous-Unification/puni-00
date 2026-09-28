import type { IsoDate } from '@wbs/domain';

import type {
  CalendarMarkerListOutcome,
  CalendarMarkerRefused,
} from '../../ports/calendar-marker-read';
import type { CalendarMarker, CalendarMarkerStore } from '../../ports/calendar-marker-store';
import type { Clock } from '../../ports/clock';
import {
  findProjectWithin,
  LEGACY_ACCESS,
  mayEditProjectWithin,
  type ResourceAccess,
} from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';

export interface CalendarMarkerServiceOptions {
  projects: ProjectStore;
  markers: CalendarMarkerStore;
  /** The instant every marker is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
  /**
   * Where `calendar_markers_changed` goes. Optional, because the controller
   * suites that only assert an HTTP answer have no collaborator to announce to;
   * a service built without one announces nothing and refuses nothing.
   */
  broadcast?: Broadcaster;
}

/**
 * What one marker write decided.
 *
 * The refusal half lives in {@link CalendarMarkerRefused}, beside the read
 * contract Plan document consumes, so that reading a project's markers costs no
 * dependency on this service. The names stay exported here.
 */
export type CalendarMarkerOutcome = { ok: true; value: CalendarMarker } | CalendarMarkerRefused;

export type {
  CalendarMarkerListOutcome,
  CalendarMarkerRefusal,
  CalendarMarkerRefused,
  CalendarMarkerSubject,
} from '../../ports/calendar-marker-read';

/** What a create carries that is not the project or the actor. */
export interface NewCalendarMarker {
  /** The composer's v4 UUID, or absent for one this service mints (task 4.4). */
  id?: string;
  date: IsoDate;
  name: string;
  /** `null` or absent both mean automatic. */
  color?: string | null;
}

/**
 * A project's calendar markers: listing them, and the four writes.
 *
 * **Not journalled and it bumps no revision**, like the priority ladder: a
 * marker is an annotation on the axis and changes no work item, so an undo
 * entry taken while one was added is not stale because of it. Slice 5 is where
 * that becomes an assertion rather than a claim.
 *
 * **Nothing here validates a marker's shape.** The `IsoDate`, the UUID v4, the
 * hex triple, `MARKER_NAME_MAX` and the 3:1 contrast bar are the controller's
 * (tasks 4.3, 4.5, 4.6a) — `CalendarMarkerStore`'s own doc states the rule for
 * the layer below, and a third copy in the middle would be a third rule free to
 * disagree with the one a client is answered against.
 *
 * Reading is not gated on write permission and that is deliberate: the project
 * routes already let a non-owner **read** a restricted project, and a marker is
 * part of what the axis draws. `canEditProject` gates the four writes only.
 */
export class CalendarMarkerService {
  private readonly clock: Clock;

  constructor(private readonly opts: CalendarMarkerServiceOptions) {
    this.clock = opts.clock;
  }

  list(projectId: string): Promise<CalendarMarkerListOutcome> {
    return this.listWithin(projectId, LEGACY_ACCESS);
  }

  /** {@link list} through the caller's access: a foreign project is `not_found`. */
  async listWithin(projectId: string, access: ResourceAccess): Promise<CalendarMarkerListOutcome> {
    const project = await findProjectWithin(this.opts.projects, projectId, access);
    if (project === null) return { ok: false, reason: 'not_found', about: 'project' };
    return { ok: true, value: await this.opts.markers.listFor(projectId) };
  }

  /**
   * Stores one marker.
   *
   * `createdAt` is this act's single reading of the clock ({@link Clock}), and
   * it is an ordering key rather than an audit stamp: `listFor` breaks a date
   * tie with it, which is why two markers written by one act must not read the
   * clock twice.
   */
  create(
    projectId: string,
    actorId: string,
    marker: NewCalendarMarker,
  ): Promise<CalendarMarkerOutcome> {
    return this.createWithin(projectId, actorId, marker, LEGACY_ACCESS);
  }

  /** {@link create} through the caller's access. */
  async createWithin(
    projectId: string,
    actorId: string,
    marker: NewCalendarMarker,
    access: ResourceAccess,
  ): Promise<CalendarMarkerOutcome> {
    const gate = await this.gate(projectId, actorId, access);
    if (!gate.ok) return gate;

    const row: CalendarMarker = {
      id: marker.id ?? this.clock.newId(),
      projectId,
      date: marker.date,
      name: marker.name,
      color: marker.color ?? null,
      createdAt: this.clock.now(),
    };
    const written = await this.opts.markers.create(row);
    // **The one store call whose `not_found` is not about a marker.**
    // `CalendarMarkerRepository.create` reads the project first and refuses
    // `not_found` when nothing holds it, then reads the id and refuses `taken`
    // (`repository/calendar-marker.ts:94,103`); it never reads a marker to
    // decide the row is missing, because the row it is about does not exist
    // yet. The other three go through `one(tx, projectId, id)` after `gate`
    // already proved the project, so their `not_found` is the marker.
    if (!written.ok)
      return {
        ok: false,
        reason: written.reason,
        about: written.reason === 'taken' ? 'marker' : 'project',
      };
    await this.announce(projectId);
    return { ok: true, value: written.marker };
  }

  rename(
    projectId: string,
    id: string,
    actorId: string,
    name: string,
  ): Promise<CalendarMarkerOutcome> {
    return this.renameWithin(projectId, id, actorId, name, LEGACY_ACCESS);
  }

  /** {@link rename} through the caller's access. */
  async renameWithin(
    projectId: string,
    id: string,
    actorId: string,
    name: string,
    access: ResourceAccess,
  ): Promise<CalendarMarkerOutcome> {
    const gate = await this.gate(projectId, actorId, access);
    if (!gate.ok) return gate;

    const written = await this.opts.markers.rename(projectId, id, name);
    if (!written.ok) return { ok: false, reason: written.reason, about: 'marker' };
    await this.announce(projectId);
    return { ok: true, value: written.marker };
  }

  recolor(
    projectId: string,
    id: string,
    actorId: string,
    color: string | null,
  ): Promise<CalendarMarkerOutcome> {
    return this.recolorWithin(projectId, id, actorId, color, LEGACY_ACCESS);
  }

  /** {@link recolor} through the caller's access. */
  async recolorWithin(
    projectId: string,
    id: string,
    actorId: string,
    color: string | null,
    access: ResourceAccess,
  ): Promise<CalendarMarkerOutcome> {
    const gate = await this.gate(projectId, actorId, access);
    if (!gate.ok) return gate;

    const written = await this.opts.markers.recolor(projectId, id, color);
    if (!written.ok) return { ok: false, reason: written.reason, about: 'marker' };
    await this.announce(projectId);
    return { ok: true, value: written.marker };
  }

  remove(projectId: string, id: string, actorId: string): Promise<CalendarMarkerOutcome> {
    return this.removeWithin(projectId, id, actorId, LEGACY_ACCESS);
  }

  /** {@link remove} through the caller's access. */
  async removeWithin(
    projectId: string,
    id: string,
    actorId: string,
    access: ResourceAccess,
  ): Promise<CalendarMarkerOutcome> {
    const gate = await this.gate(projectId, actorId, access);
    if (!gate.ok) return gate;

    const written = await this.opts.markers.remove(projectId, id);
    if (!written.ok) return { ok: false, reason: written.reason, about: 'marker' };
    await this.announce(projectId);
    return { ok: true, value: written.marker };
  }

  /**
   * Announced **after** the store answered ok and never before it, and never on
   * a refusal: an event is a client's instruction to re-read, so one sent for a
   * write that did not happen makes every reader fetch the list it already has.
   */
  private async announce(projectId: string): Promise<void> {
    await this.opts.broadcast?.publish(projectId, { type: 'calendar_markers_changed' });
  }

  /**
   * The half every write shares: the project exists, and this actor may write
   * to it.
   *
   * The marker itself is **not** read here. Its existence is decided inside the
   * store's own transaction, where the read is the decision rather than a
   * report about it — `CalendarMarkerRepository.create`'s rule, and the one
   * that keeps a marker deleted between this check and the write from being
   * answered as though it were still there.
   */
  private async gate(
    projectId: string,
    actorId: string,
    access: ResourceAccess,
  ): Promise<{ ok: true } | CalendarMarkerRefused> {
    // Proof: finding the project unscoped here, and separately in `listWithin`,
    // failed `answers 404 alike for a foreign and an absent project on every
    // step and marker route` in `step-marker-organization.controller.db.test.ts`;
    // watched 2026-09-27.
    const project = await findProjectWithin(this.opts.projects, projectId, access);
    if (project === null) return { ok: false, reason: 'not_found', about: 'project' };
    if (!mayEditProjectWithin(project, actorId, access))
      return { ok: false, reason: 'forbidden', about: 'project' };
    return { ok: true };
  }
}
