import type { MeasureStore, StoredMeasure, WorkItemStore } from '@wbs/core';
import { definitionKeyOf, factMetricOf, isLegacyMetric, type MeasureDefinition } from '@wbs/domain';

import type { MemoryMeasureDefinitionTables } from './measure-definition-fixture';
import { type MemoryMeasureEstimateTable, retireTokensTrio } from './measure-estimate-fixture';
import { readMemoryStepWriteIn } from './step-write';
import { type MemoryTupleReadContext, readMemoryMeasuresIn } from './tuple-reads';
import { listValueGroupPlacements } from './value-group-placement';

/**
 * A MeasureStore backed by an array, keyed as the composite primary key is —
 * the pair **and the metric**, which is the one line that differs from
 * `inMemoryActuals` and the whole point of the table.
 *
 * A row holds its metric as readers see it (a legacy name or a definition
 * key); SQLite's `measure_id` has no twin here, so `definitionsOf` answers
 * {@link MeasureStore.definitionsFor} from the source's organization tables,
 * and a source holding no organizations owns no work package.
 */
export function inMemoryMeasures(
  workItems: WorkItemStore,
  context: MemoryTupleReadContext,
  table: MemoryMeasureTable,
  definitionsOf: (workPackageId: string) => MeasureDefinition[] | null,
  /**
   * The source's measure estimate table, whose three-point tokens trio a
   * legacy `token_estimate` write replaces ({@link retireTokensTrio}).
   */
  estimateTable: MemoryMeasureEstimateTable,
): MeasureStore {
  const { rows } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  return {
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(readMemoryMeasuresIn(context, table, workPackageId, null));
    },
    async listByWorkItems(workPackageId, ids) {
      return await Promise.resolve(readMemoryMeasuresIn(context, table, workPackageId, ids));
    },
    definitionsFor(workPackageId) {
      return Promise.resolve(definitionsOf(workPackageId));
    },
    listPlacements: (workPackageId, ids) =>
      listValueGroupPlacements(rows, workPackageId, ids, workItems),
    async set(requested, _stamp) {
      const retained = structuredClone(requested);
      const decision = readMemoryStepWriteIn(context, retained.workItemId, retained.stepId);
      // Proof: removing this refusal made memory stepCatalogue.pointWrite:measure-untyped
      // return written for an unresolved step after its healthy typed write/read/remove.
      // Restoring the guard returned the same isolated owner to passing.
      if (decision.kind !== 'resolved') return await Promise.resolve(decision.kind);
      // `tokens` and `hours` are the legacy rows under their keys, as on SQLite (design D18).
      // Proof: with this mapping removed, the memory certification's
      // `measures.set:alias-one-row` stored `tokens` as a second row; watched 2026-10-23.
      const toSet = { ...retained, metric: factMetricOf(retained.metric) };
      // SQLite's store throws the same way: a defined metric must name a
      // definition of the organization owning the work item's work package.
      // Proof: with this check removed, the memory certification's
      // `measures.set:defined-key` stored `story_points`; watched 2026-10-23.
      if (!isLegacyMetric(toSet.metric)) {
        const owner = context.workItems.byId.get(toSet.workItemId);
        const held = owner === undefined ? null : definitionsOf(owner.workPackageId);
        // Proof: admitting only foreign_gpu_minutes kept unknown-key refusal but
        // returned written for the other organization's key; current conformance
        // failed at that refusal (owned-measure-effect-memory-measure-foreign-v1).
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
      // Proof: with this call removed, the memory certification's
      // `measureEstimates.set:legacy-write-replaces-trio` read the three-point
      // trio beside the legacy figure; watched 2026-10-23.
      if (toSet.metric === 'token_estimate')
        retireTokensTrio(estimateTable, toSet.workItemId, toSet.stepId);
      return await Promise.resolve<'written'>('written');
    },
    remove(workItemId, stepId, requested, _stamp) {
      // Proof: unmapped, `measures.set:alias-one-row` kept the tokens row
      // after `remove('tokens')`; watched 2026-10-23.
      const metric = factMetricOf(requested);
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

export interface MemoryMeasureTable {
  readonly rows: StoredMeasure[];
}
export function memoryMeasureTable(): MemoryMeasureTable {
  return { rows: [] };
}

/** The tables a memory source resolves a work package's definitions through. */
export interface MemoryMeasureOwnership {
  /** Work package id to owning organization id: the twin of `work_package_organization`. */
  readonly workPackageOrganization: ReadonlyMap<string, string>;
  readonly definitions: MemoryMeasureDefinitionTables;
}

/**
 * The definitions of the organization owning `workPackageId`, in list order, or
 * null when no organization owns it: the memory twin of
 * `StepMeasureRepository.definitionsFor`.
 */
export function definitionsOfWorkPackage(
  ownership: MemoryMeasureOwnership,
  workPackageId: string,
): MeasureDefinition[] | null {
  const organizationId = ownership.workPackageOrganization.get(workPackageId);
  if (organizationId === undefined) return null;
  const held = ownership.definitions.organizations.get(organizationId);
  // SQLite's foreign key keeps an owned work package's organization in place.
  if (held === undefined) throw new Error(`organization ${organizationId} does not exist`);
  return [...held.measures].sort(
    (left, right) => left.order - right.order || left.key.localeCompare(right.key),
  );
}

/**
 * How many facts are in the organization's definition `measureId`: rows of
 * its work packages whose metric names that definition's key (legacy names
 * included), the memory twin of counting `step_measure.measure_id`.
 *
 * @throws when a fact names a work item the source does not hold.
 */
export function countFactsKeyedBy(
  ownership: MemoryMeasureOwnership,
  facts: readonly StoredMeasure[],
  workPackageOf: ReadonlyMap<string, { workPackageId: string }>,
  organizationId: string,
  measureId: string,
): number {
  const key = ownership.definitions.organizations
    .get(organizationId)
    ?.measures.find((each) => each.id === measureId)?.key;
  if (key === undefined) return 0;
  return facts.filter((fact) => {
    const owner = workPackageOf.get(fact.workItemId);
    if (owner === undefined) throw new Error(`measure names absent work item ${fact.workItemId}`);
    return (
      ownership.workPackageOrganization.get(owner.workPackageId) === organizationId &&
      definitionKeyOf(fact.metric) === key
    );
  }).length;
}

/**
 * How many trios are in the organization's definition `measureId`: stored
 * estimates of its work packages under that definition's key, the memory twin of
 * counting `measure_estimate.measure_id`. A single-point tokens trio is a
 * legacy row here and is not counted, as `tokens` is never deletable (D14).
 * Budgets are counted through it too: they are keyed the same way
 * (`work_item_budget.measure_id`, design D42).
 *
 * @throws when a trio names a work item the source does not hold.
 */
export function countEstimatesKeyedBy(
  ownership: MemoryMeasureOwnership,
  estimates: readonly { readonly workItemId: string; readonly key: string }[],
  workPackageOf: ReadonlyMap<string, { workPackageId: string }>,
  organizationId: string,
  measureId: string,
): number {
  const key = ownership.definitions.organizations
    .get(organizationId)
    ?.measures.find((each) => each.id === measureId)?.key;
  if (key === undefined) return 0;
  return estimates.filter((estimate) => {
    const owner = workPackageOf.get(estimate.workItemId);
    if (owner === undefined)
      throw new Error(`measure estimate names absent work item ${estimate.workItemId}`);
    return (
      ownership.workPackageOrganization.get(owner.workPackageId) === organizationId &&
      estimate.key === key
    );
  }).length;
}
