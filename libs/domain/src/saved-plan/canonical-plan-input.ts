import type { DependencyReach } from '../dependency-reach';
import type { EstimateMethod, EstimateRounding } from '../estimate';

/**
 * Every field a Saved plan's **plan input** body holds, and nothing else.
 *
 * The list is **closed**, and that is the whole point of the type. The SHA-256
 * a saved plan carries is taken over this value's serialization, so a field
 * that slips in silently changes every future hash, and a field left out is a
 * difference two saved plans can never report — the comparison's coverage bound
 * is this type's field set (`openspec/changes/saved-plans/specs/wbs-domain/spec.md`).
 * A new capture field is therefore an edit here first, with a test, and never
 * an incidental extra key on a row that happened to be read.
 *
 * ## What is deliberately outside it
 *
 * - **`project_access` and anything recording who last opened what.** Navigation
 *   history: whose screen a project was on is not part of the plan.
 * - **The audit columns** — `created_at`, `updated_at`, `created_by` on the
 *   plan's own rows. They are about *editing*, not about the plan. (The saved
 *   plan's own `created_by` is a header column, captured by value; that is a
 *   fact about the save, not about the captured plan.)
 * - **`work_item.revision` and `project.revision`** (`schema.ts:215`). Write
 *   counters: two content-identical plans carrying different counters would
 *   diff as changed, which is exactly the false positive this feature must not
 *   produce.
 * - **`broadcast.latestSeq`.** A refresh cursor. It is not a plan version and
 *   must not be dressed up as one (design.md, "Two bodies, not one blob").
 *
 * ## Why the registries are in it
 *
 * Items store **ids** into live, renameable, deletable registries. A saved plan
 * reads no live table, so without the referenced `tag`, `work_item_type` and
 * `external_system` rows by value it cannot be rendered at all; resolving them
 * against the live registry instead restates history on a rename and loses the
 * label outright on a delete. Same terms as the `keep` decision for people.
 *
 * Types only. Nothing here reads anything.
 */
export interface CanonicalPlanInput {
  /** Bumped whenever this field list changes; the body carries it. */
  readonly schemaVersion: 1;
  readonly project: CanonicalProject;
  /** Sorted by `id`. */
  readonly workItems: readonly CanonicalWorkItem[];
  /** Sorted by `id`. */
  readonly steps: readonly CanonicalStep[];
  /** Sorted by `workItemId`, then `stepId`. */
  readonly stepValues: readonly CanonicalStepValue[];
  /** Sorted by `workItemId`, then `kind`. */
  readonly measures: readonly CanonicalMeasure[];
  /** Sorted by `predecessorId`, then `successorId`. */
  readonly dependencies: readonly CanonicalDependency[];
  /** Sorted by `workItemId`, then `personId`. */
  readonly assignments: readonly CanonicalAssignment[];
  /** Sorted by `id`. */
  readonly people: readonly CanonicalNamedRow[];
  /** Sorted by `id`. */
  readonly teams: readonly CanonicalNamedRow[];
  /** Sorted by `id`. */
  readonly services: readonly CanonicalNamedRow[];
  /** Sorted by `personId`, then `teamId`. */
  readonly personTeams: readonly CanonicalPersonTeam[];
  /** Sorted by `teamId`, then `serviceId`. */
  readonly teamServices: readonly CanonicalTeamService[];
  /** Sorted by `workItemId`, then `teamId`. */
  readonly workItemTeams: readonly CanonicalWorkItemTeam[];
  /** Sorted by `workItemId`, then `serviceId`. */
  readonly workItemServices: readonly CanonicalWorkItemService[];
  /** Sorted by `startsAt`. */
  readonly priorityBands: readonly CanonicalPriorityBand[];
  /** Sorted by `teamId`. */
  readonly capacity: readonly CanonicalCapacity[];
  /** Referenced `tag` rows by value, sorted by `id`. */
  readonly tags: readonly CanonicalNamedRow[];
  /** Referenced `work_item_type` rows by value, sorted by `id`. */
  readonly workItemTypes: readonly CanonicalNamedRow[];
  /** Referenced `external_system` rows by value, sorted by `id`. */
  readonly externalSystems: readonly CanonicalNamedRow[];
}

/** The project's date-producing settings and its own metadata. */
export interface CanonicalProject {
  readonly id: string;
  readonly name: string;
  readonly restricted: boolean;
  readonly ownerId: string | null;
  readonly solutionSlug: string | null;
  readonly solutionUrl: string | null;
  readonly estimateMethod: EstimateMethod;
  readonly depReach: DependencyReach;
  readonly estimateRounding: EstimateRounding;
  readonly startDate: string | null;
  readonly pertWeightOptimistic: number;
  readonly pertWeightRealistic: number;
  readonly pertWeightPessimistic: number;
}

export interface CanonicalWorkItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly name: string;
  readonly notes: string;
  readonly typeId: string | null;
  /** Tag ids, sorted. The rows themselves ride in `tags`. */
  readonly tagIds: readonly string[];
  /** Sorted by `externalSystemId`, then `externalId`. */
  readonly externalRefs: readonly CanonicalExternalRef[];
  readonly priority: number | null;
  readonly maxParallel: number | null;
  readonly frozenNumber: string | null;
  readonly serviceTeamId: string | null;
  readonly serviceId: string | null;
  readonly startNoEarlierThan: string | null;
  readonly startNoEarlierThanReason: string | null;
}

export interface CanonicalExternalRef {
  readonly externalSystemId: string;
  readonly externalId: string;
}

export interface CanonicalStep {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** The three-point estimate, the derived number, the actual and the progress. */
export interface CanonicalStepValue {
  readonly workItemId: string;
  readonly stepId: string;
  readonly optimistic: number | null;
  readonly realistic: number | null;
  readonly pessimistic: number | null;
  readonly derived: number | null;
  readonly actual: number | null;
  readonly progress: number | null;
}

export interface CanonicalMeasure {
  readonly workItemId: string;
  readonly kind: string;
  readonly value: number | null;
}

export interface CanonicalDependency {
  readonly predecessorId: string;
  readonly successorId: string;
}

export interface CanonicalAssignment {
  readonly workItemId: string;
  readonly personId: string;
}

/** A registry or directory row captured by value: its id and its name. */
export interface CanonicalNamedRow {
  readonly id: string;
  readonly name: string;
}

export interface CanonicalPersonTeam {
  readonly personId: string;
  readonly teamId: string;
}

export interface CanonicalTeamService {
  readonly teamId: string;
  readonly serviceId: string;
}

export interface CanonicalWorkItemTeam {
  readonly workItemId: string;
  readonly teamId: string;
}

export interface CanonicalWorkItemService {
  readonly workItemId: string;
  readonly serviceId: string;
}

export interface CanonicalPriorityBand {
  readonly startsAt: number;
  readonly label: string;
  readonly writes: number;
}

export interface CanonicalCapacity {
  readonly teamId: string;
  readonly people: number;
}

/**
 * The already-read rows `canonicalisePlanInput` folds into one canonical value.
 *
 * Every collection is accepted in **any** order — the caller is seventeen
 * separate reads out of one SQLite read snapshot
 * (`apps/be-01/src/repository/saved-plan-capture.ts`), and neither the rows'
 * arrival order nor a query's `ORDER BY` may reach the hash. It said thirteen
 * until the caller existed and could be counted: twelve of the projection's own
 * reads, minus its refresh cursor, plus five that only a capture makes.
 */
export interface PlanInputRows {
  readonly project: CanonicalProject;
  readonly workItems: readonly CanonicalWorkItem[];
  readonly steps: readonly CanonicalStep[];
  readonly stepValues: readonly CanonicalStepValue[];
  readonly measures: readonly CanonicalMeasure[];
  readonly dependencies: readonly CanonicalDependency[];
  readonly assignments: readonly CanonicalAssignment[];
  readonly people: readonly CanonicalNamedRow[];
  readonly teams: readonly CanonicalNamedRow[];
  readonly services: readonly CanonicalNamedRow[];
  readonly personTeams: readonly CanonicalPersonTeam[];
  readonly teamServices: readonly CanonicalTeamService[];
  readonly workItemTeams: readonly CanonicalWorkItemTeam[];
  readonly workItemServices: readonly CanonicalWorkItemService[];
  readonly priorityBands: readonly CanonicalPriorityBand[];
  readonly capacity: readonly CanonicalCapacity[];
  readonly tags: readonly CanonicalNamedRow[];
  readonly workItemTypes: readonly CanonicalNamedRow[];
  readonly externalSystems: readonly CanonicalNamedRow[];
}

/** The one version this module writes. Stored bodies carry it; readers check it. */
export const CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 1 as const;

const byString =
  <T>(...keys: readonly ((row: T) => string)[]) =>
  (a: T, b: T): number => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  };

const byNumberThen =
  <T>(key: (row: T) => number, tie: (a: T, b: T) => number) =>
  (a: T, b: T): number =>
    key(a) - key(b) || tie(a, b);

const sorted = <T>(rows: readonly T[], compare: (a: T, b: T) => number): T[] =>
  [...rows].sort(compare);

/**
 * Fold already-read rows into one `CanonicalPlanInput`, in a stable key order
 * and with every collection stably ordered.
 *
 * Pure: it reads nothing, and it is the only function whose output the saved
 * plan's `input_sha256` is taken over. Both stabilities matter for the same
 * reason — the hash is over the *serialization*, so a key emitted in a
 * different order, or a row array left in query order, produces different bytes
 * for the same plan, and two saves of an unchanged plan would then compare as
 * changed.
 *
 * Every object below is built with its fields written out in a fixed order
 * rather than spread from its input, because a spread carries the *source*
 * object's insertion order into the output and a row read by a different query
 * would then serialize differently. Writing the field names out is also what
 * makes the list closed: an extra column on a read row cannot reach the body.
 *
 * The result is itself a valid `PlanInputRows`, so parsing a serialized body
 * and canonicalising it again is a no-op — the round trip 1.4 asserts.
 */
export function canonicalisePlanInput(values: PlanInputRows): CanonicalPlanInput {
  return {
    schemaVersion: CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
    project: {
      id: values.project.id,
      name: values.project.name,
      restricted: values.project.restricted,
      ownerId: values.project.ownerId,
      solutionSlug: values.project.solutionSlug,
      solutionUrl: values.project.solutionUrl,
      estimateMethod: values.project.estimateMethod,
      depReach: values.project.depReach,
      estimateRounding: values.project.estimateRounding,
      startDate: values.project.startDate,
      pertWeightOptimistic: values.project.pertWeightOptimistic,
      pertWeightRealistic: values.project.pertWeightRealistic,
      pertWeightPessimistic: values.project.pertWeightPessimistic,
    },
    workItems: sorted(values.workItems, byString((row) => row.id)).map((row) => ({
      id: row.id,
      parentId: row.parentId,
      position: row.position,
      name: row.name,
      notes: row.notes,
      typeId: row.typeId,
      tagIds: sorted(row.tagIds, byString((id: string) => id)),
      externalRefs: sorted(
        row.externalRefs,
        byString(
          (ref: CanonicalExternalRef) => ref.externalSystemId,
          (ref: CanonicalExternalRef) => ref.externalId,
        ),
      ).map((ref) => ({ externalSystemId: ref.externalSystemId, externalId: ref.externalId })),
      priority: row.priority,
      maxParallel: row.maxParallel,
      frozenNumber: row.frozenNumber,
      serviceTeamId: row.serviceTeamId,
      serviceId: row.serviceId,
      startNoEarlierThan: row.startNoEarlierThan,
      startNoEarlierThanReason: row.startNoEarlierThanReason,
    })),
    steps: sorted(values.steps, byString((row) => row.id)).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
    })),
    stepValues: sorted(
      values.stepValues,
      byString(
        (row) => row.workItemId,
        (row) => row.stepId,
      ),
    ).map((row) => ({
      workItemId: row.workItemId,
      stepId: row.stepId,
      optimistic: row.optimistic,
      realistic: row.realistic,
      pessimistic: row.pessimistic,
      derived: row.derived,
      actual: row.actual,
      progress: row.progress,
    })),
    measures: sorted(
      values.measures,
      byString(
        (row) => row.workItemId,
        (row) => row.kind,
      ),
    ).map((row) => ({ workItemId: row.workItemId, kind: row.kind, value: row.value })),
    dependencies: sorted(
      values.dependencies,
      byString(
        (row) => row.predecessorId,
        (row) => row.successorId,
      ),
    ).map((row) => ({ predecessorId: row.predecessorId, successorId: row.successorId })),
    assignments: sorted(
      values.assignments,
      byString(
        (row) => row.workItemId,
        (row) => row.personId,
      ),
    ).map((row) => ({ workItemId: row.workItemId, personId: row.personId })),
    people: namedRows(values.people),
    teams: namedRows(values.teams),
    services: namedRows(values.services),
    personTeams: sorted(
      values.personTeams,
      byString(
        (row) => row.personId,
        (row) => row.teamId,
      ),
    ).map((row) => ({ personId: row.personId, teamId: row.teamId })),
    teamServices: sorted(
      values.teamServices,
      byString(
        (row) => row.teamId,
        (row) => row.serviceId,
      ),
    ).map((row) => ({ teamId: row.teamId, serviceId: row.serviceId })),
    workItemTeams: sorted(
      values.workItemTeams,
      byString(
        (row) => row.workItemId,
        (row) => row.teamId,
      ),
    ).map((row) => ({ workItemId: row.workItemId, teamId: row.teamId })),
    workItemServices: sorted(
      values.workItemServices,
      byString(
        (row) => row.workItemId,
        (row) => row.serviceId,
      ),
    ).map((row) => ({ workItemId: row.workItemId, serviceId: row.serviceId })),
    priorityBands: sorted(
      values.priorityBands,
      byNumberThen(
        (row) => row.startsAt,
        byString((row: CanonicalPriorityBand) => row.label),
      ),
    ).map((row) => ({ startsAt: row.startsAt, label: row.label, writes: row.writes })),
    capacity: sorted(values.capacity, byString((row) => row.teamId)).map((row) => ({
      teamId: row.teamId,
      people: row.people,
    })),
    tags: namedRows(values.tags),
    workItemTypes: namedRows(values.workItemTypes),
    externalSystems: namedRows(values.externalSystems),
  };
}

function namedRows(rows: readonly CanonicalNamedRow[]): CanonicalNamedRow[] {
  return sorted(rows, byString((row) => row.id)).map((row) => ({ id: row.id, name: row.name }));
}

/**
 * The bytes the SHA-256 is taken over, and the bytes the body stores.
 *
 * Plain `JSON.stringify`, because `canonicalisePlanInput` has already done the
 * only two things that make a serialization stable — fixed key order and sorted
 * collections. A key-sorting serializer here would hide a canonicaliser that
 * had stopped doing its half, so this function deliberately adds nothing.
 */
export function serialiseCanonicalPlanInput(input: CanonicalPlanInput): string {
  return JSON.stringify(input);
}
