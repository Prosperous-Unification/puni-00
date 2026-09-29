import {
  addCalendarDays,
  addWorkdays,
  calendarDaysBetween,
  dateOfWorkdayOrdinal,
  firstWorkdayOf,
  isIsoDate,
  type IsoDate,
  lastWorkdayOf,
  type LoadWeek,
  overlapsOf,
  snapWorkdays,
  weeklyLoadOf,
  workdayOrdinalOf,
  type WorkdaySpan,
} from '@wbs/domain';

import type { DirectoryService } from '../module/directory/directory.resource';
import type { ProjectService } from '../module/project/project.resource';
import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { ResourceAccess } from '../ports/organization-access';

/** The longest window a load read answers, in calendar days between `from` and `to`. */
export const LOAD_WINDOW_DAYS = 182;

/** The dates a load read covers, inclusive, and the same span on the workday axis. */
export interface LoadWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly span: WorkdaySpan;
}

/**
 * The window `from`..`to` names, or null when either is not a calendar day,
 * `to` precedes `from`, or the two lie more than {@link LOAD_WINDOW_DAYS}
 * apart. A load read is a Fast schedule per project; the cap bounds what one
 * request may ask the fe to draw, not what it costs.
 *
 * Proof: the cap removed made `refuses a year-long window` in
 * `person-load.controller.db.test.ts` answer 200 instead of 400; watched
 * 2026-09-29.
 */
export function loadWindowOf(from: string, to: string): LoadWindow | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const days = calendarDaysBetween(from, to);
  if (days < 0 || days > LOAD_WINDOW_DAYS) return null;
  return {
    from,
    to,
    span: { start: workdayOrdinalOf(from), end: workdayOrdinalOf(addCalendarDays(to, 1)) },
  };
}

/** Why a readable project's bookings could not be read. */
export type LoadUnavailableReason = 'engine_unavailable' | 'cycle' | 'calendar_range';

/** One booking as a load read reports it. */
export interface BookingView {
  readonly workItemId: string;
  readonly number: string;
  readonly name: string;
  readonly stepId: string | null;
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  readonly width: number;
}

export interface NamedProject {
  readonly projectId: string;
  readonly name: string;
}

export interface UnavailableProject extends NamedProject {
  readonly reason: LoadUnavailableReason;
}

export interface PersonLoadRead {
  readonly person: { readonly id: string; readonly name: string };
  readonly projects: (NamedProject & {
    readonly engine: 'fast' | 'optimized';
    readonly bookings: BookingView[];
  })[];
  readonly overlaps: {
    readonly startsOn: IsoDate;
    readonly endsOn: IsoDate;
    readonly bookings: {
      readonly projectId: string;
      readonly workItemId: string;
      readonly stepId: string | null;
    }[];
  }[];
  readonly undated: NamedProject[];
  readonly unavailable: UnavailableProject[];
}

export interface OrganizationLoadRead {
  readonly people: {
    readonly id: string;
    readonly name: string;
    readonly weeks: LoadWeek[];
  }[];
  readonly undated: NamedProject[];
  readonly unavailable: UnavailableProject[];
}

/** A slice of one project's displayed schedule that holds a person. */
interface Booking extends WorkdaySpan, BookingView {
  readonly projectId: string;
  readonly personId: string;
}

/**
 * What one project contributes to every person's load, derived from its
 * displayed schedule. `assigned` names the people an undated or unschedulable
 * project would have booked; `null` where even that is unknown, because the
 * engine it displays is not installed here.
 */
type ProjectReading =
  | { kind: 'dated'; engine: 'fast' | 'optimized'; bookings: readonly Booking[] }
  | { kind: 'undated'; assigned: ReadonlySet<string> }
  | { kind: 'unschedulable'; reason: 'cycle' | 'calendar_range'; assigned: ReadonlySet<string> }
  | { kind: 'engine_unavailable' };

export interface PersonLoadOptions {
  projects: Pick<ProjectService, 'listWithin'>;
  workItems: Pick<WorkItemService, 'latestSeq' | 'treeWithin'>;
  directory: Pick<DirectoryService, 'listWithin'>;
  /** How many project readings the process keeps; the least recently read goes first. */
  memoSize?: number;
}

/**
 * A person's bookings across every project the caller can open (WBS
 * 010.4.16, `openspec/changes/share-people-across-projects`, design D2–D5).
 *
 * Reads only: it schedules each project exactly as the project's own read
 * does and changes nothing. Projects come from {@link ProjectService.listWithin}
 * and nowhere else, so a project the caller cannot open is never read, and
 * cannot surface in a booking, an overlap or a count.
 */
export class PersonLoad {
  /** Per-process readings keyed by access and project; see {@link reading}. */
  private readonly memo = new Map<
    string,
    { revision: number; seq: number; reading: ProjectReading }
  >();
  private readonly memoSize: number;

  constructor(private readonly opts: PersonLoadOptions) {
    this.memoSize = opts.memoSize ?? 512;
  }

  /**
   * One person's load over `window`, or null for a person outside the caller's
   * directory — a foreign person is absent, not forbidden.
   *
   * Proof: looking the person up in the legacy (deployment-wide) directory made
   * `answers a foreign person as an absent one` in
   * `person-load.controller.db.test.ts` answer 200 instead of 404; watched
   * 2026-09-29.
   */
  async readPerson(
    personId: string,
    window: LoadWindow,
    actorId: string,
    access: ResourceAccess,
  ): Promise<PersonLoadRead | null> {
    const person = (await this.opts.directory.listWithin('people', access)).find(
      (candidate) => candidate.id === personId,
    );
    if (person === undefined) return null;
    const readings = await this.readProjects(actorId, access);
    const projects: PersonLoadRead['projects'][number][] = [];
    const theirs: Booking[] = [];
    for (const { project, reading } of readings) {
      if (reading.kind !== 'dated') continue;
      const mine = reading.bookings.filter((booking) => booking.personId === personId);
      theirs.push(...mine);
      const shown = mine.filter((booking) => intersects(booking, window.span));
      if (shown.length === 0) continue;
      projects.push({
        ...project,
        engine: reading.engine,
        bookings: shown.map(viewOf),
      });
    }
    return {
      person: { id: person.id, name: person.name },
      projects,
      overlaps: overlapsOf(theirs)
        .filter((overlap) => intersects(overlap, window.span))
        .map((overlap) => ({
          startsOn: dateOfWorkdayOrdinal(firstWorkdayOf(overlap.start)),
          endsOn: dateOfWorkdayOrdinal(lastWorkdayOf(overlap.start, overlap.end)),
          bookings: overlap.bookings.map(({ projectId, workItemId, stepId }) => ({
            projectId,
            workItemId,
            stepId,
          })),
        })),
      ...missingFrom(readings, (assigned) => assigned.has(personId)),
    };
  }

  /** Every person of the caller's directory, with booked and overlapping workdays per week. */
  async readOrganization(
    window: LoadWindow,
    actorId: string,
    access: ResourceAccess,
  ): Promise<OrganizationLoadRead> {
    const people = await this.opts.directory.listWithin('people', access);
    const readings = await this.readProjects(actorId, access);
    const byPerson = new Map<string, Booking[]>();
    for (const { reading } of readings) {
      if (reading.kind !== 'dated') continue;
      for (const booking of reading.bookings) {
        const held = byPerson.get(booking.personId);
        if (held === undefined) byPerson.set(booking.personId, [booking]);
        else held.push(booking);
      }
    }
    return {
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        weeks: weeklyLoadOf(byPerson.get(person.id) ?? [], window.span),
      })),
      ...missingFrom(readings, (assigned) => assigned.size > 0),
    };
  }

  /**
   * Every project the caller can open, in creation order then id — the order
   * the rank's unranked tail will keep — each with its reading.
   *
   * A project listed and then deleted before its tree is read is gone, not
   * unreadable, and is left out like any project the list no longer holds.
   *
   * Proof: listing and reading the projects under legacy access instead of
   * the caller's made `omits a foreign project that assigns the same person
   * id` in `person-load.controller.db.test.ts` name organization B's project,
   * and four more cases there count it; watched 2026-09-29.
   */
  private async readProjects(
    actorId: string,
    access: ResourceAccess,
  ): Promise<{ project: NamedProject; reading: ProjectReading }[]> {
    const listed = await this.opts.projects.listWithin(actorId, access);
    const ordered = [...listed].sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const read: { project: NamedProject; reading: ProjectReading }[] = [];
    for (const project of ordered) {
      const reading = await this.reading(project.id, project.revision, access);
      if (reading !== null)
        read.push({ project: { projectId: project.id, name: project.name }, reading });
    }
    return read;
  }

  /**
   * The project's reading, from the memo when neither the project row's
   * `revision` nor its event sequence has moved since it was computed.
   *
   * Both, because they cover different writes. `revision` commits with every
   * edit to the project row — start date, PERT weights, reach, estimate method
   * and rounding — and a project PATCH announces an event only for the three
   * optimizer settings. `seq` advances when a plan edit, a directory or
   * capacity change, or a `schedule_optimized` result is announced after its
   * commit, and none of those moves the project row. `revision` is the one the
   * caller's project list has just read, so it is never older than this
   * request. Keyed on the access too: a scoped read fails closed on rows that
   * cross the organization where a legacy read does not, so the two never share
   * an answer. Correctness never rests on a hit: a miss re-reads.
   *
   * Proof: the sequence comparison removed (any stored reading served) made
   * `shows a lengthened booking after a command` in
   * `person-load.controller.db.test.ts` read the old `endsOn`; watched
   * 2026-09-29.
   */
  private async reading(
    projectId: string,
    revision: number,
    access: ResourceAccess,
  ): Promise<ProjectReading | null> {
    const key = `${access.kind === 'scoped' ? `org:${access.scope.organizationId}` : 'legacy'}\u0000${projectId}`;
    const seq = await this.opts.workItems.latestSeq(projectId);
    const held = this.memo.get(key);
    // Proof: the revision comparison removed made `follows a start date moved
    // after a warm read`, `… cleared …` and `follows an estimate rule changed
    // after a warm read` in `person-load.controller.db.test.ts` serve the
    // pre-PATCH booking; watched 2026-09-29.
    if (held?.seq === seq && held.revision === revision) {
      // A hit skips `treeWithin`'s crossing-row check, which ran when this
      // reading was computed. Not an access decision: the project list above
      // re-ran the caller's access on this request, and a crossing row is
      // corrupt state no write creates without moving `seq` or `revision`.
      this.memo.delete(key);
      this.memo.set(key, held);
      return held.reading;
    }
    const tree = await this.opts.workItems.treeWithin(projectId, access);
    if (tree === null) return null;
    // Never memoized: it holds no bookings worth keeping, and a memo entry
    // would outlive the reason it was refused.
    if ('kind' in tree) return { kind: 'engine_unavailable' };
    const reading = readingOf(projectId, tree);
    this.memo.delete(key);
    this.memo.set(key, { revision, seq: tree.seq, reading });
    while (this.memo.size > this.memoSize) {
      const oldest = this.memo.keys().next();
      if (oldest.done === true) break;
      this.memo.delete(oldest.value);
    }
    return reading;
  }
}

type Tree = Exclude<Awaited<ReturnType<WorkItemService['treeWithin']>>, null | { kind: string }>;

/**
 * A project's bookings, from the tree its own page reads.
 *
 * Offsets are snapped before they are placed on the shared axis: a finish of
 * 3.0000000000000004 beside another project's start of 3 is a hand-off with a
 * drifted bit, not an overlap of a trillionth of a day. The dates are the
 * plan's own arithmetic on the unsnapped offsets, so a load bar and the plan's
 * row name the same days.
 *
 * @throws when a slice names a work item the tree does not hold: the two come
 * from one read, so a miss is a broken read, never a booking to drop.
 */
function readingOf(projectId: string, tree: Tree): ProjectReading {
  const assigned = new Set(tree.assignedPeople.map((person) => person.id));
  if (tree.scheduleError !== null) {
    return { kind: 'unschedulable', reason: tree.scheduleError, assigned };
  }
  if (tree.startDate === null) return { kind: 'undated', assigned };
  const startDate = tree.startDate;
  const anchor = workdayOrdinalOf(startDate);
  const rows = new Map(tree.workItems.map((row) => [row.id, row] as const));
  const bookings: Booking[] = [];
  for (const slice of tree.slices) {
    if (slice.personId === null) continue;
    const start = anchor + snapWorkdays(slice.earliestStart);
    const end = anchor + snapWorkdays(slice.earliestFinish);
    if (end <= start) continue;
    const row = rows.get(slice.workItemId);
    if (row === undefined) {
      throw new Error(`slice ${slice.id} names work item ${slice.workItemId} the tree lacks`);
    }
    bookings.push({
      projectId,
      personId: slice.personId,
      workItemId: slice.workItemId,
      number: row.number,
      name: row.name,
      stepId: slice.stepId,
      start,
      end,
      startsOn: addWorkdays(startDate, firstWorkdayOf(slice.earliestStart)),
      endsOn: addWorkdays(startDate, lastWorkdayOf(slice.earliestStart, slice.earliestFinish)),
      width: slice.width,
    });
  }
  const engine = (tree.optimization?.displayed ?? 'fast') === 'fast' ? 'fast' : 'optimized';
  return { kind: 'dated', engine, bookings };
}

function viewOf(booking: Booking): BookingView {
  const { workItemId, number, name, stepId, startsOn, endsOn, width } = booking;
  return { workItemId, number, name, stepId, startsOn, endsOn, width };
}

function intersects(span: WorkdaySpan, window: WorkdaySpan): boolean {
  return span.start < window.end && span.end > window.start;
}

/**
 * The readable projects that could not contribute bookings: undated ones and
 * unschedulable ones that `names` someone, and every project whose engine is
 * not installed here — whom it names is unknowable without its schedule.
 */
function missingFrom(
  readings: readonly { project: NamedProject; reading: ProjectReading }[],
  names: (assigned: ReadonlySet<string>) => boolean,
): { undated: NamedProject[]; unavailable: UnavailableProject[] } {
  const undated: NamedProject[] = [];
  const unavailable: UnavailableProject[] = [];
  for (const { project, reading } of readings) {
    if (reading.kind === 'undated' && names(reading.assigned)) undated.push(project);
    if (reading.kind === 'unschedulable' && names(reading.assigned)) {
      unavailable.push({ ...project, reason: reading.reason });
    }
    if (reading.kind === 'engine_unavailable') {
      unavailable.push({ ...project, reason: 'engine_unavailable' });
    }
  }
  return { undated, unavailable };
}
