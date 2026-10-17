import type { DependencyReach } from '../dependency-reach';
import type { EstimateMethod, EstimateRounding, EstimateUnit } from '../estimate';
import type { Hold, Readiness } from '../progress';
import type { StepState } from '../progress';
import type { StoredStepBlockage } from '../step-blockage';
import { assertStepParallel, type StoredStepParallel } from '../step-parallel';
import type { TypedDependency } from '../typed-dependency';

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
  readonly schemaVersion: 8;
  readonly project: CanonicalProject;
  /** Sorted by `id`. */
  readonly workItems: readonly CanonicalWorkItem[];
  /** Sorted by `id`. */
  readonly steps: readonly CanonicalStep[];
  /** Sorted by `workItemId`, then `stepId`. */
  readonly stepValues: readonly CanonicalStepValue[];
  /** Direct leaf-owned facts, sorted by work item and step identity. */
  readonly stepBlockages: readonly StoredStepBlockage[];
  /** Sparse authored maxima; absence inherits, including after historical upgrades. */
  readonly stepParallels: readonly StoredStepParallel[];
  /** Sorted by `workItemId`, then `stepId`, then `metric`. */
  readonly measures: readonly CanonicalMeasure[];
  /** Sorted by `predecessorId`, then `successorId`. */
  readonly dependencies: readonly CanonicalDependency[];
  /** Relationship IDs and endpoint identities, sorted by `id`. */
  readonly typedDependencies: readonly TypedDependency[];
  /** Sorted by `workItemId`, then `stepId`, then `personId`. */
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
  /**
   * The IANA zone the project reads instants as days in (`step-node-attempts`
   * D5): a setting, compared under `settings`, read by no engine. Version 5;
   * an earlier body upgrades as `UTC`, the zone every project had before.
   */
  readonly timezone: string;
}

export interface CanonicalWorkItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly name: string;
  readonly notes: string;
  /**
   * Work-item-type ids, sorted. The rows themselves ride in `workItemTypes`.
   *
   * **Plural, and it was `typeId: string | null` until the caller existed.**
   * A row states 0..n types (`LabelledWorkItem.typeIds`,
   * `apps/wbs/be-01/src/repository/index.ts:455`; `work_item_type_link` is the whole
   * of the fact and there is no `work_item.type_id` column to narrow it to one).
   * A singular field stores at most one of them, so an item typed `Story` **and**
   * `Spike` would be saved as one of the two, silently, chosen by whichever the
   * fold happened to reach for — and `workItemTypes`, whose contract is "every
   * work-item-type id the captured items use", would have had a field list it
   * could not be enumerated from. `tagIds` one line up was already plural; this
   * is the same dimension counted the same way.
   */
  readonly typeIds: readonly string[];
  /** Tag ids, sorted. The rows themselves ride in `tags`. */
  readonly tagIds: readonly string[];
  /** Sorted by `externalSystemId`, then `url`. */
  readonly externalRefs: readonly CanonicalExternalRef[];
  readonly priority: number | null;
  /**
   * How many people may work this item at once — never null.
   *
   * `work_item.max_parallel` is `NOT NULL DEFAULT 1` (`schema.ts:436`), so no
   * read can produce a null and a nullable field would be a second spelling of
   * "1" that every reader would have to handle. Narrowed for the closed field
   * list's reason: a type wider than the fact admits values the plan cannot have.
   */
  readonly maxParallel: number;
  readonly frozenNumber: string | null;
  readonly serviceTeamId: string | null;
  readonly serviceId: string | null;
  readonly startNoEarlierThan: string | null;
  readonly startNoEarlierThanReason: string | null;
  /** The planner's readiness, `draft` or `ready`, or null where unsaid (schema 4). */
  readonly readiness: Readiness | null;
  /** The planner's hold, `on_hold` or `blocked`, or null for none (schema 4). */
  readonly hold: Hold | null;
}

/**
 * One link from a work item out to a system that is not this one.
 *
 * **The identifier is the `url`, and there is no `externalId`.** The field this
 * replaces named a column that does not exist: `work_item_external_ref` is
 * `(id, work_item_id, system_id, url, position)` (`schema.ts:1169-1187`) and
 * what a user typed is the URL. Sorting by a field the row cannot supply is not
 * a sort — it compares `undefined` against `undefined`, leaves the array in
 * arrival order, and puts the read's `ORDER BY` into the hash, which is the one
 * thing this module exists to keep out of it.
 *
 * `position` is stored rather than dropped: it is the order the refs are shown
 * in (`wier_by_work_item` is `(work_item_id, position)`), so a saved plan
 * without it renders somebody's links in an order they did not choose. It is
 * **not** the sort key — two refs that tie on it would then order by arrival —
 * so the ordering is by `externalSystemId` then `url`, and `position` rides as
 * an ordinary value.
 *
 * **It is a rank, not the column** (assumption A-7, settled 2026-09-03). The
 * repository's read type is `{ id, systemId, url }`
 * (`apps/wbs/be-01/src/repository/index.ts:481-485`) and carries no position, which
 * is why the fold first written against this field did not typecheck. Widening
 * that read was the obvious repair and is the wrong one: both readers already
 * `ORDER BY position` (`work-item.ts:220`, `directory.ts:171`), and the only
 * writer deletes every row for the item and reinserts the deduplicated list
 * with `position: at` (`work-item.ts:641-658`). The stored numbers are
 * therefore dense from 0 in exactly the order the array arrives in, so the
 * column and the index are one fact and a widened read would be a second
 * spelling of it that only ever gets to disagree. The fold ranks the ordered
 * array instead. That is also the stabler value of the two: were a row ever
 * spaced in gaps, two plans identical in every visible way would hash apart on
 * the spacing, and this field exists to record what a reader sees.
 */
export interface CanonicalExternalRef {
  readonly externalSystemId: string;
  readonly url: string;
  readonly position: number;
}

export interface CanonicalStep {
  readonly estimateUnit: EstimateUnit;
  readonly id: string;
  /** Captured step code, or null when the step was uncoded at capture. */
  readonly code: string | null;
  readonly name: string;
  readonly position: number;
  /**
   * The step's estimate allowance when the plan was saved — history, never
   * the live project's (`add-project-step-estimate-allowances`). A version-1
   * body predates allowances and is read at 0% by the `1` upgrade.
   */
  readonly allowancePercent: number;
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
  /**
   * What somebody said about this step, or `null` when nobody has.
   *
   * **A state, not a percentage.** `step_progress.state` is
   * {@link StepState} — `in_progress` or `done` (`libs/wbs/domain/domain/src/progress.ts:37`)
   * — and the live projection carries it as one
   * (`work-item.service.ts:453`, `progress: Record<string, StepState>`). The
   * `number | null` this replaces had no source: nothing in the plan produces a
   * percentage, so the fold would have had to invent one, and a reader would
   * have had to guess what 0 meant against a step nobody had spoken about.
   * Absence is still absence — no row is `null`, which is the same "two
   * spellings of nobody has said" rule the column itself is written under.
   */
  readonly progress: StepState | null;
}

/**
 * One measured figure — tokens or hours — for one **step** of one work item.
 *
 * **`stepId` is here and `kind` is now `metric`**, both because the row is
 * `measure (work_item_id, step_id, metric, value, recorded_at)`
 * (`repository/index.ts:1004-1012`). Without `stepId` the collection's own
 * ordering contract — by work item then kind — makes two steps' token counts on
 * one item indistinguishable, and a fold has to pick one of them to store: the
 * plan says 1200 tokens for Build and 300 for Test, and the record says 1200 for
 * the item. `metric` rather than `kind` for the same reason the field above is a
 * state: the canonical name should be the column's, so a reader checking the
 * body against the table has nothing to translate.
 */
export interface CanonicalMeasure {
  readonly workItemId: string;
  readonly stepId: string;
  readonly metric: string;
  readonly value: number | null;
}

export interface CanonicalDependency {
  readonly predecessorId: string;
  readonly successorId: string;
}

/**
 * Who is doing one **step** of one work item.
 *
 * **`stepId` is here**, because `assignment` is
 * `(work_item_id, step_id, person_id)` (`repository/index.ts:1205-1209`) and the
 * scheduler reads it that way: `schedulePlanInput` folds the same rows into
 * `workItemId -> { [stepId]: personId }` before `slicesOf` sees them
 * (`saved-plan-schedule.ts:41-48`), and the person floor is per step. A
 * `(workItemId, personId)` pair cannot rebuild that map, so a saved plan without
 * `stepId` could not reproduce its own dates — which is the one thing a
 * materialised record of a plan is for.
 */
export interface CanonicalAssignment {
  readonly workItemId: string;
  readonly stepId: string;
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
  /**
   * What choosing this band by name writes into a work item's priority.
   *
   * `defaultValue`, the field's name on {@link PriorityBand}, rather than the
   * `writes` this replaces — the same rule the corrected `metric` is under: a
   * canonical name that is not the source's is a translation every reader
   * checking a stored body against the ladder has to perform.
   */
  readonly defaultValue: number;
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
 * (`apps/wbs/be-01/src/repository/saved-plan-capture.ts`), and neither the rows'
 * arrival order nor a query's `ORDER BY` may reach the hash. It said thirteen
 * until the caller existed and could be counted: twelve of the projection's own
 * reads, minus its refresh cursor, plus five that only a capture makes.
 */
export interface PlanInputRows {
  readonly project: CanonicalProject;
  readonly workItems: readonly CanonicalWorkItem[];
  readonly steps: readonly CanonicalStep[];
  readonly stepValues: readonly CanonicalStepValue[];
  /** Direct leaf-owned facts, sorted by work item and step identity. */
  readonly stepBlockages: readonly StoredStepBlockage[];
  /** Sparse authored maxima; absence inherits, including after historical upgrades. */
  readonly stepParallels: readonly StoredStepParallel[];
  readonly measures: readonly CanonicalMeasure[];
  readonly dependencies: readonly CanonicalDependency[];
  readonly typedDependencies: readonly TypedDependency[];
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
export const CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 8 as const;

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
  // Proof: capture validation call removed; duplicate capture negative failed (step-blockages.test.ts), 2026-10-14.
  // Proof: capture validation removed; unknown-owner capture negative failed (capture-validation.txt), 2026-10-17.
  const stepParallels = readStepParallels(values);
  assertStepBlockages(values);
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
      timezone: values.project.timezone,
    },
    workItems: sorted(
      values.workItems,
      byString((row) => row.id),
    ).map((row) => ({
      id: row.id,
      parentId: row.parentId,
      position: row.position,
      name: row.name,
      notes: row.notes,
      typeIds: sorted(
        row.typeIds,
        byString((id: string) => id),
      ),
      tagIds: sorted(
        row.tagIds,
        byString((id: string) => id),
      ),
      externalRefs: sorted(
        row.externalRefs,
        byString(
          (ref: CanonicalExternalRef) => ref.externalSystemId,
          (ref: CanonicalExternalRef) => ref.url,
        ),
      ).map((ref) => ({
        externalSystemId: ref.externalSystemId,
        url: ref.url,
        position: ref.position,
      })),
      priority: row.priority,
      maxParallel: row.maxParallel,
      frozenNumber: row.frozenNumber,
      serviceTeamId: row.serviceTeamId,
      serviceId: row.serviceId,
      startNoEarlierThan: row.startNoEarlierThan,
      startNoEarlierThanReason: row.startNoEarlierThanReason,
      readiness: row.readiness,
      hold: row.hold,
    })),
    steps: sorted(
      values.steps,
      byString((row) => row.id),
    ).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      position: row.position,
      allowancePercent: row.allowancePercent,
      // Proof: forcing workdays failed canonical minute preservation (canonical-plan-input.test.ts).
      estimateUnit: row.estimateUnit,
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
    stepBlockages: sorted(
      values.stepBlockages,
      byString(
        (row) => row.workItemId,
        (row) => row.stepId,
      ),
    ).map(({ workItemId, stepId, blockedAt }) => ({ workItemId, stepId, blockedAt })),
    stepParallels: sorted(
      stepParallels,
      byString(
        (row) => row.workItemId,
        (row) => row.stepId,
      ),
    ),
    measures: sorted(
      values.measures,
      byString(
        (row) => row.workItemId,
        (row) => row.stepId,
        (row) => row.metric,
      ),
    ).map((row) => ({
      workItemId: row.workItemId,
      stepId: row.stepId,
      metric: row.metric,
      value: row.value,
    })),
    dependencies: sorted(
      values.dependencies,
      byString(
        (row) => row.predecessorId,
        (row) => row.successorId,
      ),
    ).map((row) => ({ predecessorId: row.predecessorId, successorId: row.successorId })),
    typedDependencies: sorted(
      values.typedDependencies,
      byString((row) => row.id),
    ).map((row) => ({
      id: row.id,
      predecessor:
        row.predecessor.scope === 'whole'
          ? { scope: row.predecessor.scope, workItemId: row.predecessor.workItemId }
          : {
              scope: row.predecessor.scope,
              workItemId: row.predecessor.workItemId,
              stepId: row.predecessor.stepId,
            },
      successor:
        row.successor.scope === 'whole'
          ? { scope: row.successor.scope, workItemId: row.successor.workItemId }
          : {
              scope: row.successor.scope,
              workItemId: row.successor.workItemId,
              stepId: row.successor.stepId,
            },
      // Proof: replacing the captured FF type with FS made the mounted saved-plan
      // read after a live FF→FS edit fail: expected FF, received FS (2026-09-28).
      type: row.type,
    })),
    assignments: sorted(
      values.assignments,
      byString(
        (row) => row.workItemId,
        (row) => row.stepId,
        (row) => row.personId,
      ),
    ).map((row) => ({
      workItemId: row.workItemId,
      stepId: row.stepId,
      personId: row.personId,
    })),
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
    ).map((row) => ({
      startsAt: row.startsAt,
      label: row.label,
      defaultValue: row.defaultValue,
    })),
    capacity: sorted(
      values.capacity,
      byString((row) => row.teamId),
    ).map((row) => ({
      teamId: row.teamId,
      people: row.people,
    })),
    tags: namedRows(values.tags),
    workItemTypes: namedRows(values.workItemTypes),
    externalSystems: namedRows(values.externalSystems),
  };
}

function namedRows(rows: readonly CanonicalNamedRow[]): CanonicalNamedRow[] {
  return sorted(
    rows,
    byString((row) => row.id),
  ).map((row) => ({ id: row.id, name: row.name }));
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

/** Validates direct blockage at capture and stored-body boundaries without repairing trusted state. */
export function assertStepBlockages(body: unknown): void {
  // Proof: collection guard removed; missing/malformed current facts negatives failed (step-blockages.test.ts); watched 2026-10-14.
  if (
    typeof body !== 'object' ||
    body === null ||
    !('stepBlockages' in body) ||
    !Array.isArray(body.stepBlockages)
  )
    throw new Error('step blockage collection is missing or malformed');
  // Proof: reference-list guard removed; malformed owner-list stored read failed (step-blockages.test.ts); watched 2026-10-14.
  if (
    !('workItems' in body) ||
    !Array.isArray(body.workItems) ||
    !('steps' in body) ||
    !Array.isArray(body.steps)
  )
    throw new Error('step blockage references have no owner or step collection');
  const owners = new Set<string>();
  const parents = new Set<string>();
  const steps = new Set<string>();
  const ownerRows: readonly unknown[] = body.workItems;
  for (const owner of ownerRows) {
    // Proof: owner-shape guard removed; malformed owner-row stored read failed (step-blockages.test.ts); watched 2026-10-14.
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('id' in owner) ||
      typeof owner.id !== 'string'
    )
      throw new Error('step blockage owner collection is malformed');
    owners.add(owner.id);
    if ('parentId' in owner && typeof owner.parentId === 'string') parents.add(owner.parentId);
  }
  const stepRows: readonly unknown[] = body.steps;
  for (const step of stepRows) {
    // Proof: step-shape guard removed; malformed step-row stored read failed (step-blockages.test.ts); watched 2026-10-14.
    if (typeof step !== 'object' || step === null || !('id' in step) || typeof step.id !== 'string')
      throw new Error('step blockage step collection is malformed');
    steps.add(step.id);
  }
  const pairs = new Set<string>();
  const facts: readonly unknown[] = body.stepBlockages;
  for (const fact of facts) {
    // Proof: fact-shape/time guard removed; fractional-time capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (
      typeof fact !== 'object' ||
      fact === null ||
      !('workItemId' in fact) ||
      typeof fact.workItemId !== 'string' ||
      !('stepId' in fact) ||
      typeof fact.stepId !== 'string' ||
      !('blockedAt' in fact) ||
      typeof fact.blockedAt !== 'number' ||
      !Number.isSafeInteger(fact.blockedAt)
    )
      throw new Error('step blockage fact is malformed');
    // Proof: owner guard removed; unknown-owner capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (!owners.has(fact.workItemId)) throw new Error('step blockage owner is unknown');
    // Proof: leaf guard removed; parent-owner capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (parents.has(fact.workItemId)) throw new Error('step blockage owner is not a leaf');
    // Proof: step guard removed; unknown-step capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (!steps.has(fact.stepId)) throw new Error('step blockage step is unknown');
    const pair = JSON.stringify([fact.workItemId, fact.stepId]);
    // Proof: pair guard removed; duplicate capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (pairs.has(pair)) throw new Error('step blockage pair is duplicated');
    pairs.add(pair);
  }
}

/**
 * Validates sparse authored maxima at capture and stored-body boundaries.
 * Throws for malformed collections, references, pairs or maxima; copies each
 * fact with a single read of its fields so validation and canonical bytes agree.
 * Empty collections need no references and never change another fact family's
 * historical failure contract.
 */
export function readStepParallels(body: unknown): StoredStepParallel[] {
  // Proof: collection guard removed; missing capture facts negative failed (collection.txt), 2026-10-17.
  if (
    typeof body !== 'object' ||
    body === null ||
    !('stepParallels' in body) ||
    !Array.isArray(body.stepParallels)
  )
    throw new Error('step parallelism collection is missing or malformed');
  const supplied: readonly unknown[] = body.stepParallels;
  if (supplied.length === 0) return [];
  // Proof: reference-list guard removed; malformed owner-list negative failed (reference-lists.txt).
  if (
    !('workItems' in body) ||
    !Array.isArray(body.workItems) ||
    !('steps' in body) ||
    !Array.isArray(body.steps)
  )
    throw new Error('step parallelism references have no owner or step collection');
  const owners = new Set<string>();
  const parents = new Set<string>();
  const steps = new Set<string>();
  const ownerRows: readonly unknown[] = body.workItems;
  for (const owner of ownerRows) {
    // Proof: owner-shape guard removed; malformed owner-row negative failed (owner-shape.txt).
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('id' in owner) ||
      typeof owner.id !== 'string'
    )
      throw new Error('step parallelism owner collection is malformed');
    owners.add(owner.id);
    if ('parentId' in owner && typeof owner.parentId === 'string') parents.add(owner.parentId);
  }
  const stepRows: readonly unknown[] = body.steps;
  for (const step of stepRows) {
    // Proof: step-shape guard removed; malformed step-row negative failed (step-shape.txt).
    if (typeof step !== 'object' || step === null || !('id' in step) || typeof step.id !== 'string')
      throw new Error('step parallelism step collection is malformed');
    steps.add(step.id);
  }
  const pairs = new Set<string>();
  const facts: StoredStepParallel[] = [];
  for (const fact of supplied) {
    // Proof: object guard removed; null-fact capture negative failed (fact-object.txt).
    if (typeof fact !== 'object' || fact === null)
      throw new Error('step parallelism fact is malformed');
    const workItemId = 'workItemId' in fact ? fact.workItemId : undefined;
    const stepId = 'stepId' in fact ? fact.stepId : undefined;
    const maxParallel = 'maxParallel' in fact ? fact.maxParallel : undefined;
    // Proof: value-shape guard removed; string-maximum capture negative failed (fact-values.txt).
    if (
      typeof workItemId !== 'string' ||
      typeof stepId !== 'string' ||
      typeof maxParallel !== 'number'
    )
      throw new Error('step parallelism fact is malformed');
    // Proof: range call removed; oversized-maximum capture negative failed (range.txt).
    assertStepParallel(maxParallel);
    // Proof: owner guard removed; unknown-owner capture negative failed (owner.txt).
    if (!owners.has(workItemId)) throw new Error('step parallelism owner is unknown');
    // Proof: leaf guard removed; parent-owner capture negative failed (leaf.txt).
    if (parents.has(workItemId)) throw new Error('step parallelism owner is not a leaf');
    // Proof: step guard removed; unknown-step capture negative failed (step.txt).
    if (!steps.has(stepId)) throw new Error('step parallelism step is unknown');
    const pair = JSON.stringify([workItemId, stepId]);
    // Proof: uniqueness guard removed; duplicate capture negative failed (duplicate.txt).
    if (pairs.has(pair)) throw new Error('step parallelism pair is duplicated');
    pairs.add(pair);
    // Proof: rereading the accessor emitted 1001 after validating 2; single-read regression failed (accessor-reread.txt).
    facts.push({ workItemId, stepId, maxParallel });
  }
  return facts;
}
