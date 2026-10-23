import type { MeasureStore, StepStore, StoredMeasure, WorkItemStore } from '@wbs/core';
import { definitionKeyOf, isLegacyMetric, type MeasureDefinition } from '@wbs/domain';

import type { MemoryMeasureDefinitionTables } from './measure-definition-fixture';
import { readTargetedSatelliteRows } from './targeted-satellite-rows';
import { compareValueGroupIds, listValueGroupPlacements } from './value-group-placement';

/**
 * A MeasureStore backed by an array, keyed as the composite primary key is —
 * the pair **and the metric**, which is the one line that differs from
 * `inMemoryActuals` and the whole point of the table.
 *
 * A row holds its metric as readers see it (a legacy name or a definition
 * key); SQLite's `measure_id` has no twin here, so `definitionsOf` answers
 * {@link MeasureStore.definitionsFor} from the source's organization tables,
 * and a source holding no organizations owns no project.
 */
export function inMemoryMeasures(
  workItems: WorkItemStore,
  table: MemoryMeasureTable = memoryMeasureTable(),
  steps?: StepStore,
  definitionsOf: (projectId: string) => MeasureDefinition[] | null = () => null,
): MeasureStore {
  const { rows } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map((w) => w.id));
      return order(
        rows.filter((row) => ids.has(row.workItemId)),
        await steps?.listByProject(projectId),
      );
    },
    async listByWorkItems(projectId, workItemIds) {
      const targeted = await readTargetedSatelliteRows(
        'measure',
        rows,
        projectId,
        workItemIds,
        workItems,
        steps,
        (row) => {
          if (typeof row.metric !== 'string' || row.metric === '') {
            throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid metric`);
          }
          if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) {
            throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid value`);
          }
          if (typeof row.recordedAt !== 'number' || !Number.isFinite(row.recordedAt)) {
            throw new Error(`measure ${row.workItemId}/${row.stepId} has an invalid recorded time`);
          }
        },
      );
      return order(targeted.rows, targeted.steps);
    },
    definitionsFor(projectId) {
      return Promise.resolve(definitionsOf(projectId));
    },
    listPlacements: (projectId, ids) => listValueGroupPlacements(rows, projectId, ids, workItems),
    async set(toSet, _stamp) {
      // SQLite's store throws the same way: a defined metric must name a
      // definition of the organization owning the work item's project.
      // Proof: with this check removed, the memory certification's
      // `measures.set:defined-key` stored `story_points`; watched 2026-10-23.
      if (!isLegacyMetric(toSet.metric)) {
        const owner = await workItems.findById(toSet.workItemId);
        const held = owner === null ? null : definitionsOf(owner.projectId);
        if (held?.some((each) => each.key === toSet.metric) !== true)
          throw new Error(
            `measure ${toSet.metric} is not defined by the organization owning work item ${toSet.workItemId}`,
          );
      }
      const kept = rows.filter(
        (row) =>
          !(
            row.workItemId === toSet.workItemId &&
            row.stepId === toSet.stepId &&
            row.metric === toSet.metric
          ),
      );
      rows.splice(0, rows.length, ...kept, structuredClone(toSet));
      // `'written'`, always: these fixtures enforce no references at all, so
      // they cannot tell a step that has gone from one that never existed. That
      // is the memory source lagging the SQLite one on a named method (D29),
      // and slice 5 is where it goes on the allowlist or is tightened.
      return 'written' as const;
    },
    remove(workItemId, stepId, metric, _stamp) {
      const kept = rows.filter(
        (row) => !(row.workItemId === workItemId && row.stepId === stepId && row.metric === metric),
      );
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve();
    },
    moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      const moved = rows.map((row) =>
        row.workItemId === fromWorkItemId ? { ...row, workItemId: toWorkItemId } : row,
      );
      rows.splice(0, rows.length, ...moved);
      return Promise.resolve();
    },
  };
}

function order(
  rows: StoredMeasure[],
  steps: Awaited<ReturnType<StepStore['listByProject']>> | undefined,
): StoredMeasure[] {
  if (steps === undefined) return rows;
  const position = new Map(steps.map((step) => [step.id, step.position]));
  return [...rows].sort(
    (left, right) =>
      compareValueGroupIds(left.workItemId, right.workItemId) ||
      (position.get(left.stepId) ?? 0) - (position.get(right.stepId) ?? 0) ||
      left.stepId.localeCompare(right.stepId) ||
      left.metric.localeCompare(right.metric),
  );
}

export interface MemoryMeasureTable {
  readonly rows: StoredMeasure[];
}
export function memoryMeasureTable(): MemoryMeasureTable {
  return { rows: [] };
}

/** The tables a memory source resolves a project's definitions through. */
export interface MemoryMeasureOwnership {
  /** Project id to owning organization id: the twin of `project_organization`. */
  readonly projectOrganization: ReadonlyMap<string, string>;
  readonly definitions: MemoryMeasureDefinitionTables;
}

/**
 * The definitions of the organization owning `projectId`, in list order, or
 * null when no organization owns it: the memory twin of
 * `StepMeasureRepository.definitionsFor`.
 */
export function definitionsOfProject(
  ownership: MemoryMeasureOwnership,
  projectId: string,
): MeasureDefinition[] | null {
  const organizationId = ownership.projectOrganization.get(projectId);
  if (organizationId === undefined) return null;
  const held = ownership.definitions.organizations.get(organizationId);
  // SQLite's foreign key keeps an owned project's organization in place.
  if (held === undefined) throw new Error(`organization ${organizationId} does not exist`);
  return [...held.measures].sort(
    (left, right) => left.order - right.order || left.key.localeCompare(right.key),
  );
}

/**
 * How many facts are in the organization's definition `measureId`: rows of
 * its projects whose metric names that definition's key (legacy names
 * included), the memory twin of counting `step_measure.measure_id`.
 *
 * @throws when a fact names a work item the source does not hold.
 */
export function countFactsKeyedBy(
  ownership: MemoryMeasureOwnership,
  facts: readonly StoredMeasure[],
  projectOf: ReadonlyMap<string, { projectId: string }>,
  organizationId: string,
  measureId: string,
): number {
  const key = ownership.definitions.organizations
    .get(organizationId)
    ?.measures.find((each) => each.id === measureId)?.key;
  if (key === undefined) return 0;
  return facts.filter((fact) => {
    const owner = projectOf.get(fact.workItemId);
    if (owner === undefined) throw new Error(`measure names absent work item ${fact.workItemId}`);
    return (
      ownership.projectOrganization.get(owner.projectId) === organizationId &&
      definitionKeyOf(fact.metric) === key
    );
  }).length;
}
