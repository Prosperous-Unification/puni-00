import type { SubtreeCopy, SubtreeWriteOutcome } from '@wbs/core';
import { factMetricOf, isLegacyMetric, isOrphanedNotBeforeReason } from '@wbs/domain';

import { retireTokensTrio } from './measure-estimate-fixture';
import { definitionsOfWorkPackage } from './measure-fixture';
import type { MemoryState } from './memory-stores';
import { type MemoryStepWriteContext, readMemoryStepWriteIn } from './step-write';

function requireRow<Value>(rows: ReadonlyMap<string, Value>, id: string, label: string): Value {
  const row = rows.get(id);
  if (row === undefined) throw new Error('subtree ' + label + ' is absent');
  return row;
}
function replacePair<Row extends { readonly workItemId: string; readonly stepId: string }>(
  rows: Row[],
  written: Row,
): void {
  const kept = rows.filter(
    (row) => row.workItemId !== written.workItemId || row.stepId !== written.stepId,
  );
  rows.splice(0, rows.length, ...kept, structuredClone(written));
}

/**
 * Synchronous candidate-table program on a fresh actual MemoryState clone.
 * It invokes no asynchronous store or Source capability; the Source owner
 * publishes only after this returns written and its publication fence passes.
 * Other satellite families retain their current payload/mirror behavior.
 */
export function applyMemorySubtreeIn(
  candidate: MemoryState,
  context: MemoryStepWriteContext,
  copy: SubtreeCopy,
): SubtreeWriteOutcome {
  const { tables } = candidate,
    { byId, teamsOf, typesOf } = tables.workItems;
  for (const moved of copy.respaced) {
    const row = requireRow(byId, moved.id, 'respaced row');
    byId.set(row.id, { ...row, position: moved.position });
  }
  for (const row of copy.rows) {
    if (byId.has(row.id)) throw new Error('subtree row identity already exists');
    if (!tables.workPackages.workPackages.has(row.workPackageId))
      throw new Error('subtree package is absent');
    if (row.parentId !== null) requireRow(byId, row.parentId, 'parent');
    if (isOrphanedNotBeforeReason(row.startNoEarlierThan, row.startNoEarlierThanReason))
      throw new Error('subtree not-before reason has no date');
    const teamIds =
      row.teamIds === undefined
        ? row.serviceTeamId === null
          ? []
          : [row.serviceTeamId]
        : [...new Set(row.teamIds)].sort();
    if (teamIds.some((id) => !tables.directory.teams.has(id)))
      throw new Error('subtree team is absent');
    const selectedTeam = row.teamIds === undefined ? row.serviceTeamId : (teamIds.at(0) ?? null);
    byId.set(row.id, structuredClone({ ...row, serviceTeamId: selectedTeam }));
    teamsOf.set(row.id, teamIds);
    if (row.typeIds !== undefined && row.typeIds.length > 0) {
      typesOf.set(
        row.id,
        [...new Set(row.typeIds)].filter((id) => tables.directory.workItemTypes.has(id)),
      );
    }
  }
  for (const child of copy.reparented) {
    const row = requireRow(byId, child.id, 'reparented row');
    if (child.parentId !== null) requireRow(byId, child.parentId, 'reparenting parent');
    byId.set(row.id, { ...row, parentId: child.parentId, position: child.position });
  }
  // All candidate rows, direct types and parent changes precede the same-state
  // applicability capture. No step value has been published on a refused path.
  for (const estimate of copy.estimates) {
    const decision = readMemoryStepWriteIn(context, estimate.workItemId, estimate.stepId);
    if (decision.kind !== 'resolved')
      return {
        kind: 'estimate_refused',
        workItemId: estimate.workItemId,
        stepId: estimate.stepId,
        reason: decision.kind,
      };
  }
  for (const [fact, points] of [
    ['actual', copy.actuals],
    ['progress', copy.progress],
    ['measure', copy.measures],
  ] as const) {
    for (const point of points) {
      const decision = readMemoryStepWriteIn(context, point.workItemId, point.stepId);
      // Proof: BULK_MEM_ACTUAL/PROGRESS/MEASURE each omitted only its kind.
      // Each public restore owner returned written instead of point_refused after
      // healthy restore/remove/unbind; each exact-restored control passed.
      if (decision.kind !== 'resolved')
        return {
          kind: 'point_refused',
          fact,
          workItemId: point.workItemId,
          stepId: point.stepId,
          reason: decision.kind,
        };
    }
  }
  for (const estimate of copy.estimates) replacePair(tables.estimates.rows, estimate);
  for (const actual of copy.actuals) replacePair(tables.actuals.rows, actual);
  for (const progress of copy.progress) replacePair(tables.progress.rows, progress);
  for (const requested of copy.measures) {
    const measure = { ...requested, metric: factMetricOf(requested.metric) };
    if (!isLegacyMetric(measure.metric)) {
      const owner = requireRow(byId, measure.workItemId, 'measure work item');
      const definitions = definitionsOfWorkPackage(
        {
          workPackageOrganization: tables.organizationLimits.workPackageOrganization,
          definitions: tables.directory.measureDefinitions,
        },
        owner.workPackageId,
      );
      if (definitions?.some((definition) => definition.key === measure.metric) !== true)
        throw new Error('subtree measure is not defined by its owner');
    }
    const kept = tables.measures.rows.filter(
      (row) =>
        row.workItemId !== measure.workItemId ||
        row.stepId !== measure.stepId ||
        row.metric !== measure.metric,
    );
    tables.measures.rows.splice(0, tables.measures.rows.length, ...kept, structuredClone(measure));
    if (measure.metric === 'token_estimate')
      retireTokensTrio(tables.measureEstimates, measure.workItemId, measure.stepId);
  }
  for (const assignment of copy.assignments) {
    if (!tables.directory.people.has(assignment.personId))
      throw new Error('subtree assignment person is absent');
    tables.directory.assignments.set(
      assignment.workItemId + '::' + assignment.stepId,
      structuredClone(assignment),
    );
  }
  for (const demand of copy.demands) {
    requireRow(byId, demand.workItemId, 'demand work item');
    if (!tables.directory.resources.resources.has(demand.resourceId))
      throw new Error('subtree demanded resource is absent');
    tables.directory.resources.demands.set(
      demand.workItemId + '::' + demand.resourceId,
      structuredClone(demand),
    );
  }
  for (const dependency of copy.dependencies) {
    requireRow(byId, dependency.predecessorId, 'dependency predecessor');
    requireRow(byId, dependency.successorId, 'dependency successor');
    if (
      tables.dependencies.rows.some(
        (row) =>
          row.id === dependency.id ||
          (row.predecessorId === dependency.predecessorId &&
            row.successorId === dependency.successorId),
      )
    )
      throw new Error('subtree dependency identity already exists');
    tables.dependencies.rows.push(structuredClone(dependency));
  }
  for (const key of copy.removedEstimates) {
    const kept = tables.estimates.rows.filter(
      (row) => row.workItemId !== key.workItemId || row.stepId !== key.stepId,
    );
    tables.estimates.rows.splice(0, tables.estimates.rows.length, ...kept);
  }
  for (const key of copy.removedActuals) {
    const kept = tables.actuals.rows.filter(
      (row) => row.workItemId !== key.workItemId || row.stepId !== key.stepId,
    );
    tables.actuals.rows.splice(0, tables.actuals.rows.length, ...kept);
  }
  for (const key of copy.removedProgress) {
    const kept = tables.progress.rows.filter(
      (row) => row.workItemId !== key.workItemId || row.stepId !== key.stepId,
    );
    tables.progress.rows.splice(0, tables.progress.rows.length, ...kept);
  }
  for (const key of copy.removedMeasures) {
    const metric = factMetricOf(key.metric);
    const kept = tables.measures.rows.filter(
      (row) =>
        row.workItemId !== key.workItemId || row.stepId !== key.stepId || row.metric !== metric,
    );
    tables.measures.rows.splice(0, tables.measures.rows.length, ...kept);
  }
  return 'written';
}
