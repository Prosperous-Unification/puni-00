import type { PlanDocumentImport } from '@wbs/contracts';
import {
  allowancePercentOf,
  canDepend,
  cleanName,
  EstimateTrio,
  estimateUnitOf,
  findTypedEndpointDefect,
  formatTypedDependencyKey,
  isCurrencyCode,
  isHexTriple,
  isIsoDate,
  isLegacyMetric,
  isMarkerName,
  isMeasureKey,
  isOrphanedNotBeforeReason,
  isReservedStepCode,
  isStepCode,
  isStepState,
  LONGEST_NOT_BEFORE_REASON,
  LONGEST_RATE_CARD_DIGEST,
  MEASURE_METRICS,
  type MeasureMetric,
  minuteTrioProblem,
  MOST_MEASURE_ORDER,
  MOST_PEOPLE_AT_ONCE,
  PertWeights,
  priorityLadderProblem,
  refuseDemand,
  suggestStepCodes,
  ThreePointEstimate,
  type TypedDependency,
  validateCustomColor,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { StoredDependency } from '../../ports/dependency-values';
import type { Scheduler } from '../../ports/scheduler';
import { MOST_CHARACTERS_IN_A_UNIT_LABEL } from '../../service/command-fields';
import { MOST_CHARACTERS_IN_A_REF_NAME } from '../../service/command-normalizers';
import { findDependencyGraphCycle } from '../../service/dependency-graph';
import {
  findImportDependencyDuplicate,
  type ImportPreparation,
  type ImportRefusalCode,
  type PreparedActual,
  type PreparedAssignment,
  type PreparedAttempt,
  type PreparedEstimate,
  type PreparedImport,
  type PreparedMeasure,
  type PreparedNamedEntry,
  type PreparedProgress,
  preparedRow,
  type PreparedWorkItem,
  rowShape,
} from './import-values';

export type {
  ImportPreparation,
  ImportRefusalCode,
  PreparedActual,
  PreparedAssignment,
  PreparedAttempt,
  PreparedCapacity,
  PreparedDependency,
  PreparedEstimate,
  PreparedExternalRef,
  PreparedImport,
  PreparedMarker,
  PreparedMeasure,
  PreparedNamedEntry,
  PreparedPerson,
  PreparedProgress,
  PreparedStep,
  PreparedTeam,
  PreparedWorkItem,
} from './import-values';

type DocumentRow = PlanDocumentImport['workItems'][number];
type DocumentStep = PlanDocumentImport['steps'][number];

type Refusal = Extract<ImportPreparation, { ok: false }>;

const refuses = (code: ImportRefusalCode, path: string, detail: string | null = null): Refusal => ({
  ok: false,
  code,
  path,
  detail,
});

interface Indexed<T> {
  byId: Map<string, T>;
}

function indexById<T extends { id: string }>(rows: T[], path: string): Indexed<T> | Refusal {
  const byId = new Map<string, T>();
  for (let at = 0; at < rows.length; at += 1) {
    const row = rows.at(at);
    if (row === undefined) throw new Error(`${path} changed length during preparation`);
    // Proof: removing the duplicate lookup made the mounted duplicate-row test miss this path.
    if (row.id === '' || byId.has(row.id))
      return refuses('invalid_body', `${path}[${String(at)}].id`, row.id);
    byId.set(row.id, row);
  }
  return { byId };
}

function isRefusal<T>(indexed: Indexed<T> | Refusal): indexed is Refusal {
  return 'ok' in indexed;
}

function normalizedNamed<T extends { name: string }>(rows: T[], path: string): T[] | Refusal {
  const seen = new Set<string>();
  for (let at = 0; at < rows.length; at += 1) {
    const row = rows.at(at);
    if (row === undefined) throw new Error(`${path} changed length during preparation`);
    const name = cleanName(row.name);
    // Proof: removing the normalized-name lookup made the mounted duplicate-tag test return 204.
    if (name === null || seen.has(name))
      return refuses('invalid_body', `${path}[${String(at)}].name`, name);
    row.name = name;
    seen.add(name);
  }
  return rows;
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function stepEntries(
  values: Record<string, unknown>,
  path: string,
  steps: ReadonlyMap<string, DocumentStep>,
): [string, unknown][] | Refusal {
  const entries = Object.entries(values);
  for (const [stepId] of entries) {
    // Proof: bypassing this lookup made the mounted unknown-step test return 204.
    if (!steps.has(stepId)) return refuses('unknown_ref', `${path}.${stepId}`);
  }
  return entries;
}

function parseLeaf(
  row: DocumentRow,
  at: number,
  steps: ReadonlyMap<string, DocumentStep>,
):
  | Pick<PreparedWorkItem, 'estimates' | 'actuals' | 'progress' | 'measures' | 'assignments'>
  | Refusal {
  const prefix = `workItems[${String(at)}]`;
  const estimateEntries = stepEntries(row.estimates, `${prefix}.estimates`, steps);
  if ('ok' in estimateEntries) return estimateEntries;
  const estimates: PreparedEstimate[] = [];
  const units = new Map([...steps].map(([id, step]) => [id, step.estimateUnit]));
  for (const [stepId, value] of estimateEntries) {
    const unit = estimateUnitOf(units, stepId);
    const estimate = unit === 'minutes' ? EstimateTrio(value) : ThreePointEstimate(value);
    // Proof: bypassing this parse made the unordered-estimate test accept 3/2/1.
    if (estimate instanceof type.errors)
      return refuses('invalid_body', `${prefix}.estimates.${stepId}`);
    // Proof: bypassing this guard imported fractional minutes with 201 instead of 400 (composed minute import test).
    if (unit === 'minutes' && minuteTrioProblem(estimate) !== null)
      return refuses('invalid_body', `${prefix}.estimates.${stepId}`);
    estimates.push({ stepFileId: stepId, ...estimate });
  }

  const actualEntries = stepEntries(row.actuals, `${prefix}.actuals`, steps);
  if ('ok' in actualEntries) return actualEntries;
  const actuals: PreparedActual[] = [];
  for (const [stepId, days] of actualEntries) {
    // Proof: bypassing this guard made the mounted negative-actual test return 204.
    if (!isFiniteNonnegative(days)) return refuses('invalid_body', `${prefix}.actuals.${stepId}`);
    actuals.push({ stepFileId: stepId, days });
  }

  const progressEntries = stepEntries(row.progress, `${prefix}.progress`, steps);
  if ('ok' in progressEntries) return progressEntries;
  const progress: PreparedProgress[] = [];
  for (const [stepId, state] of progressEntries) {
    // Proof: bypassing this predicate made the invalid-progress test accept not_started.
    if (!isStepState(state)) return refuses('invalid_body', `${prefix}.progress.${stepId}`);
    progress.push({ stepFileId: stepId, state });
  }

  const measures: PreparedMeasure[] = [];
  for (const [metric, values] of Object.entries(row.measures)) {
    // Proof: removing the metric predicate made the unknown-metric test accept hours.
    // Proof: removing the record predicate made the non-object-measure-map test fail with ok:true.
    if (!isMeasureMetric(metric) || !isUnknownRecord(values))
      return refuses('invalid_body', `${prefix}.measures.${metric}`);
    const measured = stepEntries(values, `${prefix}.measures.${metric}`, steps);
    if ('ok' in measured) return measured;
    for (const [stepId, value] of measured) {
      // Proof: bypassing this guard made the negative-measure test accept -1.
      if (!isFiniteNonnegative(value))
        return refuses('invalid_body', `${prefix}.measures.${metric}.${stepId}`);
      measures.push({ stepFileId: stepId, metric, value });
    }
  }
  return { estimates, actuals, progress, measures, assignments: [] };
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMeasureMetric(metric: string): metric is MeasureMetric {
  return MEASURE_METRICS.some((known) => known === metric);
}

function preparedNamed<T extends { id: string; name: string }>(
  index: ReadonlyMap<string, T>,
): ReadonlyMap<string, PreparedNamedEntry> {
  return new Map(
    [...index].map(([fileId, entry]) => [fileId, { fileId, name: entry.name }] as const),
  );
}

function firstHierarchyRefusal(
  rows: DocumentRow[],
  byId: ReadonlyMap<string, DocumentRow>,
): Refusal | null {
  const siblings = new Set<string>();
  for (let at = 0; at < rows.length; at += 1) {
    const row = rows.at(at);
    if (row === undefined) throw new Error('workItems changed length during preparation');
    if (row.parentId !== null && !byId.has(row.parentId))
      return refuses('unknown_ref', `workItems[${String(at)}].parentId`);
    const sibling = `${row.parentId ?? ''}\u0000${String(row.position)}`;
    if (siblings.has(sibling)) return refuses('invalid_body', `workItems[${String(at)}].position`);
    siblings.add(sibling);
    const seen = new Set<string>();
    let cursor: DocumentRow | undefined = row;
    while (cursor !== undefined && cursor.parentId !== null) {
      if (seen.has(cursor.id)) return refuses('cycle', `workItems[${String(at)}].parentId`);
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId);
    }
  }
  return null;
}

function firstDependencyRefusal(rows: DocumentRow[]): Refusal | null {
  const shaped = rows.map(rowShape);
  const edges: (StoredDependency & { path: string })[] = [];
  for (let successorAt = 0; successorAt < rows.length; successorAt += 1) {
    const successor = rows.at(successorAt);
    if (successor === undefined) throw new Error('workItems changed length during preparation');
    for (let predecessorAt = 0; predecessorAt < successor.dependsOn.length; predecessorAt += 1) {
      const predecessorId = successor.dependsOn.at(predecessorAt);
      if (predecessorId === undefined)
        throw new Error('dependsOn changed length during preparation');
      edges.push({
        id: `file-edge-${String(edges.length)}`,
        projectId: 'file',
        predecessorId,
        successorId: successor.id,
        path: `workItems[${String(successorAt)}].dependsOn[${String(predecessorAt)}]`,
      });
    }
  }
  for (let at = 0; at < edges.length; at += 1) {
    const edge = edges.at(at);
    if (edge === undefined) throw new Error('dependency list changed during preparation');
    // Proof: bypassing this planner made the ancestry/cycle test accept both complete graphs.
    const refusal = canDepend(
      shaped,
      edges.filter((_entry, index) => index !== at),
      edge.predecessorId,
      edge.successorId,
    );
    if (refusal === 'not_found') return refuses('unknown_ref', edge.path);
    if (refusal !== null) return refuses(refusal, edge.path);
  }
  return null;
}

function validateDates(row: DocumentRow, at: number, projectStart: string | null): Refusal | null {
  const dates = [
    ['startNoEarlierThan', row.startNoEarlierThan],
    ['deadline', row.deadline],
    ['factStart', row.factStart],
    ['factEnd', row.factEnd],
  ] as const;
  for (const [field, value] of dates) {
    // Proof: bypassing date validation made the mounted deadline-before-start test return 204.
    if (value !== null && !isIsoDate(value))
      return refuses('invalid_body', `workItems[${String(at)}].${field}`);
  }
  if (row.startNoEarlierThanReason !== null) {
    const reason = row.startNoEarlierThanReason.trim();
    // Proof: bypassing this bound made the overlong-reason case accept 201 characters.
    if (reason.length > LONGEST_NOT_BEFORE_REASON)
      return refuses('invalid_body', `workItems[${String(at)}].startNoEarlierThanReason`);
    row.startNoEarlierThanReason = reason === '' ? null : reason;
  }
  // Proof: bypassing the pair rule made the orphan-reason case accept words without a date.
  if (isOrphanedNotBeforeReason(row.startNoEarlierThan, row.startNoEarlierThanReason))
    return refuses('invalid_body', `workItems[${String(at)}].startNoEarlierThanReason`);
  // Proof: bypassing this comparison made the mounted deadline-before-start test return 204.
  if (projectStart !== null && row.deadline !== null && row.deadline < projectStart)
    return refuses('deadline_before_project_start', `workItems[${String(at)}].deadline`);
  return null;
}

/**
 * Refuses every row carrying more than one distinct type (WBS 010.4.10), whatever
 * the document version: `path` is the first such row and `detail` lists the file
 * ids of all of them, so one round trip names every row to fix. A type conflict
 * already in a project is kept by copying; a file cannot create one.
 *
 * Proof: the call in prepareImport skipped and `refuses rows carrying several
 * types, naming every such row` received ok: true; the module test `refuses a
 * row carrying two types before any write, announcing nothing` received
 * ok: true too. Watched 2026-09-27.
 */
function multiTypeRowsRefusal(
  rows: readonly { id: string; typeIds: readonly string[] }[],
): Refusal | null {
  const conflicted = rows.flatMap((row, at) =>
    new Set(row.typeIds).size > 1 ? [{ row, at }] : [],
  );
  const first = conflicted.at(0);
  if (first === undefined) return null;
  return refuses(
    'work_item_takes_one_type',
    `workItems[${String(first.at)}].typeIds`,
    conflicted.map(({ row }) => row.id).join(', '),
  );
}

/**
 * Validates and resolves one archival document completely before source admission.
 *
 * The input has already crossed {@link PlanDocumentImport}'s structural boundary,
 * but leaf step maps remain opaque there so derived parent aggregates can be
 * discarded without interpretation. This pass derives leafhood from `parentId`,
 * validates only leaf maps, checks hierarchy and dependencies against the complete
 * file graph, and names every remaining reference as a `…FileId`. The returned
 * value therefore cannot be mistaken for a store-ready object carrying database ids.
 *
 * Enabled scheduling is the only case that asks the installed scheduler. A disabled
 * plan retains an optimized preference so a later deployment can enable it.
 */
export function prepareImport(
  supplied: PlanDocumentImport,
  scheduler: Pick<Scheduler, 'supports'>,
): ImportPreparation {
  const document = structuredClone(supplied);
  const projectName = cleanName(document.settings.name);
  // Proof: bypassing this check made the blank-project-name test accept whitespace.
  if (projectName === null) return refuses('invalid_body', 'settings.name');
  document.settings.name = projectName;
  // Proof: bypassing this predicate made the invalid-project-start test accept 2026-02-31.
  if (document.settings.startDate !== null && !isIsoDate(document.settings.startDate))
    return refuses('invalid_body', 'settings.startDate');
  // Proof: bypassing this parse made the invalid-PERT test accept three zero weights.
  if (PertWeights(document.settings.pertWeights) instanceof type.errors)
    return refuses('invalid_body', 'settings.pertWeights');
  // Proof: bypassing capability refusal made the mounted unavailable-engine test return 204.
  if (
    document.settings.optimizationEnabled &&
    !scheduler.supports(document.settings.scheduleEngine)
  )
    return refuses('engine_unavailable', 'settings.scheduleEngine');

  for (let at = 0; at < document.capacity.length; at += 1) {
    const entry = document.capacity.at(at);
    if (entry === undefined) throw new Error('capacity changed length during preparation');
    // Proof: bypassing this range made the mounted zero-capacity test return 204.
    if (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > MOST_PEOPLE_AT_ONCE)
      return refuses('invalid_body', `capacity[${String(at)}].size`);
    // Proof: bypassing this lookup made the duplicate-capacity-team test fail with ok:true.
    if (document.capacity.slice(0, at).some(({ teamId }) => teamId === entry.teamId))
      return refuses('invalid_body', `capacity[${String(at)}].teamId`);
  }

  for (let at = 0; at < document.priorityBands.length; at += 1) {
    const band = document.priorityBands.at(at);
    if (band === undefined) throw new Error('priorityBands changed length during preparation');
    band.label = band.label.trim();
    // Proof: bypassing this guard made the nonpositive-band-start test fail with ok:true.
    if (!Number.isSafeInteger(band.startsAt) || band.startsAt < 1)
      return refuses('invalid_body', `priorityBands[${String(at)}].startsAt`);
    // Proof: bypassing this guard made the nonpositive-band-default test fail with ok:true.
    if (!Number.isSafeInteger(band.defaultValue) || band.defaultValue < 1)
      return refuses('invalid_body', `priorityBands[${String(at)}].defaultValue`);
    const previous = at === 0 ? undefined : document.priorityBands.at(at - 1);
    // Proof: bypassing ordered starts made the mounted invalid-band path assertion fail.
    if (previous !== undefined && band.startsAt <= previous.startsAt)
      return refuses('invalid_body', `priorityBands[${String(at)}].startsAt`);
  }
  // Proof: bypassing the ladder parser made an out-of-band default pass.
  if (priorityLadderProblem(document.priorityBands) !== null)
    return refuses('invalid_body', 'priorityBands');

  const markerIndex = indexById(document.calendarMarkers, 'calendarMarkers');
  if (isRefusal(markerIndex)) return markerIndex;
  for (let at = 0; at < document.calendarMarkers.length; at += 1) {
    const marker = document.calendarMarkers.at(at);
    if (marker === undefined) throw new Error('calendarMarkers changed length during preparation');
    // Proof: bypassing this predicate made the malformed-marker-date case pass.
    if (!isIsoDate(marker.date))
      return refuses('invalid_body', `calendarMarkers[${String(at)}].date`);
    // Proof: bypassing this predicate made the blank-marker-name case pass.
    if (!isMarkerName(marker.name))
      return refuses('invalid_body', `calendarMarkers[${String(at)}].name`);
    // Proof: bypassing this check made the malformed-marker-color case pass.
    if (
      marker.color !== null &&
      (!isHexTriple(marker.color) || !validateCustomColor(marker.color).ok)
    )
      return refuses('invalid_body', `calendarMarkers[${String(at)}].color`, marker.color);
  }

  const directoryLists = [
    ['teams', document.directory.teams],
    ['people', document.directory.people],
    ['tags', document.directory.tags],
    ['services', document.directory.services],
    ['types', document.directory.types],
    ['externalSystems', document.directory.externalSystems],
  ] as const;
  for (const [kind, rows] of directoryLists) {
    const normalized = normalizedNamed(rows, `directory.${kind}`);
    if ('ok' in normalized) return normalized;
  }
  // Names are distinct once normalized, so an attempt's executor, which the
  // file names rather than identifies, resolves to at most one person.
  const personFileIdOf = new Map(document.directory.people.map(({ id, name }) => [name, id]));

  const teams = indexById(document.directory.teams, 'directory.teams');
  if (isRefusal(teams)) return teams;
  const people = indexById(document.directory.people, 'directory.people');
  if (isRefusal(people)) return people;
  const tags = indexById(document.directory.tags, 'directory.tags');
  if (isRefusal(tags)) return tags;
  const services = indexById(document.directory.services, 'directory.services');
  if (isRefusal(services)) return services;
  const types = indexById(document.directory.types, 'directory.types');
  if (isRefusal(types)) return types;
  const externalSystems = indexById(
    document.directory.externalSystems,
    'directory.externalSystems',
  );
  if (isRefusal(externalSystems)) return externalSystems;

  for (let at = 0; at < document.capacity.length; at += 1) {
    const capacity = document.capacity.at(at);
    if (capacity === undefined) throw new Error('capacity changed length during preparation');
    // Proof: bypassing this lookup made the unknown-capacity-team test pass.
    if (!teams.byId.has(capacity.teamId))
      return refuses('unknown_ref', `capacity[${String(at)}].teamId`, capacity.teamId);
  }

  for (let at = 0; at < document.directory.teams.length; at += 1) {
    const team = document.directory.teams.at(at);
    if (team === undefined) throw new Error('teams changed length during preparation');
    for (let refAt = 0; refAt < team.serviceIds.length; refAt += 1)
      // Proof: bypassing this lookup made the unknown-owned-service test pass.
      if (!services.byId.has(team.serviceIds[refAt] ?? ''))
        return refuses(
          'unknown_ref',
          `directory.teams[${String(at)}].serviceIds[${String(refAt)}]`,
        );
  }
  for (let at = 0; at < document.directory.people.length; at += 1) {
    const person = document.directory.people.at(at);
    if (person === undefined) throw new Error('people changed length during preparation');
    for (let refAt = 0; refAt < person.teamIds.length; refAt += 1)
      // Proof: bypassing this lookup made the unknown-membership-team test pass.
      if (!teams.byId.has(person.teamIds[refAt] ?? ''))
        return refuses('unknown_ref', `directory.people[${String(at)}].teamIds[${String(refAt)}]`);
  }

  const normalizedSteps = normalizedNamed(document.steps, 'steps');
  if ('ok' in normalizedSteps) return normalizedSteps;
  const steps = indexById(document.steps, 'steps');
  if (isRefusal(steps)) return steps;
  const stepPositions = new Set<number>();
  const stepCodes = new Set<string>();
  for (let at = 0; at < document.steps.length; at += 1) {
    const step = document.steps.at(at);
    if (step === undefined) throw new Error('steps changed length during preparation');
    // Proof: bypassing this guard made the duplicate-step-position case pass.
    if (!Number.isSafeInteger(step.position) || stepPositions.has(step.position))
      return refuses('invalid_body', `steps[${String(at)}].position`, String(step.position));
    stepPositions.add(step.position);
    // Proof: with this guard bypassed, `refuses a step allowance over 1000%,
    // and carries a valid one to the prepared step` prepared 1000.01% instead
    // of refusing it (2026-09-27).
    if (allowancePercentOf(step.allowancePercent) === null)
      return refuses(
        'invalid_body',
        `steps[${String(at)}].allowancePercent`,
        String(step.allowancePercent),
      );
    if (step.code === null) continue;
    // Proof: with this guard bypassed, `refuses a version-3 step code that is
    // malformed, reserved or a duplicate` prepared `QA` instead of refusing it
    // (2026-09-27).
    if (!isStepCode(step.code))
      return refuses('invalid_body', `steps[${String(at)}].code`, step.code);
    // Proof: with this guard bypassed, the same test prepared the reserved
    // `s1-qa` instead of refusing it (2026-09-27).
    if (isReservedStepCode(step.code))
      return refuses('invalid_body', `steps[${String(at)}].code`, step.code);
    // Proof: with this guard bypassed, the same test prepared a second step
    // coded `impl` instead of refusing it (2026-09-27).
    if (stepCodes.has(step.code))
      return refuses('invalid_body', `steps[${String(at)}].code`, step.code);
    stepCodes.add(step.code);
  }
  const rows = indexById(document.workItems, 'workItems');
  if (isRefusal(rows)) return rows;
  const resourcePreparation = prepareResources(document, rows.byId);
  if ('ok' in resourcePreparation) return resourcePreparation;
  // Proof: bypassing whole-graph hierarchy validation made the mounted self-cycle test return 204.
  const hierarchyRefusal = firstHierarchyRefusal(document.workItems, rows.byId);
  if (hierarchyRefusal !== null) return hierarchyRefusal;
  const typeRefusal = multiTypeRowsRefusal(document.workItems);
  if (typeRefusal !== null) return typeRefusal;
  const parents = new Set(document.workItems.flatMap((row) => row.parentId ?? []));
  const preparedRows: PreparedWorkItem[] = [];
  const externalRefIds = new Set<string>();

  for (let at = 0; at < document.workItems.length; at += 1) {
    const row = document.workItems.at(at);
    if (row === undefined) throw new Error('workItems changed length during preparation');
    const rowName = cleanName(row.name);
    // Proof: bypassing this guard made the blank-row-name test fail with ok:true.
    if (rowName === null) return refuses('invalid_body', `workItems[${String(at)}].name`);
    row.name = rowName;
    // Proof: bypassing this guard made the fractional-row-position test pass.
    if (!Number.isSafeInteger(row.position))
      return refuses('invalid_body', `workItems[${String(at)}].position`);
    const dateRefusal = validateDates(row, at, document.settings.startDate);
    if (dateRefusal !== null) return dateRefusal;
    // Proof: bypassing this guard made the mounted zero-priority test return 204.
    if (row.priority !== null && (!Number.isSafeInteger(row.priority) || row.priority < 1))
      return refuses('invalid_body', `workItems[${String(at)}].priority`);
    // Proof: bypassing this range made the zero-parallelism test pass.
    if (
      !Number.isSafeInteger(row.maxParallel) ||
      row.maxParallel < 1 ||
      row.maxParallel > MOST_PEOPLE_AT_ONCE
    )
      return refuses('invalid_body', `workItems[${String(at)}].maxParallel`);
    const references = [
      [row.serviceTeamId === null ? [] : [row.serviceTeamId], teams.byId, 'serviceTeamId'],
      [row.serviceId === null ? [] : [row.serviceId], services.byId, 'serviceId'],
      [row.teamIds, teams.byId, 'teamIds'],
      [row.tagIds, tags.byId, 'tagIds'],
      [row.serviceIds, services.byId, 'serviceIds'],
      [row.typeIds, types.byId, 'typeIds'],
    ] as const;
    for (const [ids, index, field] of references) {
      for (let refAt = 0; refAt < ids.length; refAt += 1)
        // Proof: bypassing this lookup made the unknown-row-tag test pass.
        if (!index.has(ids[refAt] ?? ''))
          return refuses(
            'unknown_ref',
            `workItems[${String(at)}].${field}${ids.length === 1 && !field.endsWith('Ids') ? '' : `[${String(refAt)}]`}`,
          );
    }
    for (let refAt = 0; refAt < row.externalRefs.length; refAt += 1) {
      const reference = row.externalRefs.at(refAt);
      if (reference === undefined)
        throw new Error('externalRefs changed length during preparation');
      // Proof: removing the duplicate lookup made the duplicate-external-ref-id test pass.
      if (reference.id === '' || externalRefIds.has(reference.id))
        return refuses(
          'invalid_body',
          `workItems[${String(at)}].externalRefs[${String(refAt)}].id`,
        );
      externalRefIds.add(reference.id);
      // Proof: bypassing this guard made the empty-external-URL test pass.
      if (reference.url === '')
        return refuses(
          'invalid_body',
          `workItems[${String(at)}].externalRefs[${String(refAt)}].url`,
        );
      // Proof: bypassing this bound made the overlong-external-ref-name test pass.
      if (reference.name.length > MOST_CHARACTERS_IN_A_REF_NAME)
        return refuses(
          'invalid_body',
          `workItems[${String(at)}].externalRefs[${String(refAt)}].name`,
        );
      // Proof: bypassing this lookup made the mounted unknown-system test return 204.
      if (!externalSystems.byId.has(reference.systemId))
        return refuses(
          'unknown_ref',
          `workItems[${String(at)}].externalRefs[${String(refAt)}].systemId`,
        );
    }
    const assignments: PreparedAssignment[] = [];
    for (const [stepId, personId] of Object.entries(row.assignees)) {
      // Proof: bypassing this lookup made the unknown-assignment-step test fail with ok:true.
      if (!steps.byId.has(stepId))
        return refuses('unknown_ref', `workItems[${String(at)}].assignees.${stepId}`);
      // Proof: bypassing this lookup made the mounted unknown-person test return 204.
      if (!people.byId.has(personId))
        return refuses('unknown_ref', `workItems[${String(at)}].assignees.${stepId}`);
      assignments.push({ stepFileId: stepId, personFileId: personId });
    }
    // Proof: forcing every row to leaf made the round-trip contract store its
    // restored parent in all four value tables even though re-export hid the duplication.
    const leaf = !parents.has(row.id);
    const values = leaf
      ? parseLeaf(row, at, steps.byId)
      : { estimates: [], actuals: [], progress: [], measures: [], assignments: [] };
    if ('ok' in values) return values;
    const attempts: PreparedAttempt[] = [];
    for (const [index, { stepId, executor, ...attempt }] of row.attempts.entries()) {
      // `classifyPlanDocument` has keyed every attempt to a step of the file.
      if (!steps.byId.has(stepId)) throw new Error(`attempt step ${stepId} left the file`);
      const personFileId = executor === null ? null : personFileIdOf.get(cleanName(executor) ?? '');
      // Proof: a miss here defaulted to another file person made `refuses an
      // attempt executor the directory does not name, creating no project`
      // answer 500 (`prepared attempt executor mapping disappeared`) for 400
      // `unknown_ref`; watched 2026-10-12.
      if (personFileId === undefined)
        return refuses(
          'unknown_ref',
          `workItems[${String(at)}].attempts[${String(index)}].executor`,
        );
      attempts.push({ ...attempt, stepFileId: stepId, personFileId });
    }
    preparedRows.push({ ...preparedRow(row), isLeaf: leaf, ...values, assignments, attempts });
  }

  const measurePreparation = prepareMeasures(
    document,
    rows.byId,
    new Set(document.workItems.flatMap(({ id }) => (parents.has(id) ? [] : [id]))),
    steps.byId,
  );
  if ('ok' in measurePreparation) return measurePreparation;
  // Proof: bypassing graph validation made the mounted dangling-dependency test return 204.
  const dependencyRefusal = firstDependencyRefusal(document.workItems);
  if (dependencyRefusal !== null) return dependencyRefusal;
  const dependencies = document.workItems.flatMap((row) =>
    row.dependsOn.map((predecessorFileId) => ({
      predecessorFileId,
      successorFileId: row.id,
    })),
  );
  const typedDependencies: TypedDependency[] = [];
  const typedDependencyPaths = new Map<string, string>();
  const externalDependencies: PreparedImport['externalDependencies'] = [];
  const relationshipKeys = new Set<string>();
  const leafByFileId = new Map(preparedRows.map(({ fileId, isLeaf }) => [fileId, isLeaf]));
  const stepBlockages: PlanDocumentImport['stepBlockages'] = [];
  const blockagePairs = new Map<string, Set<string>>();
  for (const [at, fact] of document.stepBlockages.entries()) {
    const prefix = `stepBlockages[${String(at)}]`;
    // Proof: bypassing this refusal admitted direct blockage unknown owner and parent in prepare-import.test.ts (2026-10-14).
    if (leafByFileId.get(fact.workItemId) !== true)
      return refuses('invalid_body', `${prefix}.workItemId`);
    // Proof: bypassing this refusal admitted direct blockage unknown step in prepare-import.test.ts (2026-10-14).
    if (!steps.byId.has(fact.stepId)) return refuses('invalid_body', `${prefix}.stepId`);
    // Proof: bypassing this refusal admitted direct blockage fractional and unsafe time in prepare-import.test.ts (2026-10-14).
    if (!Number.isSafeInteger(fact.blockedAt))
      return refuses('invalid_body', `${prefix}.blockedAt`);
    const held = blockagePairs.get(fact.workItemId) ?? new Set<string>();
    // Proof: bypassing this refusal admitted direct blockage duplicate pair in prepare-import.test.ts (2026-10-14).
    if (held.has(fact.stepId)) return refuses('invalid_body', prefix);
    held.add(fact.stepId);
    blockagePairs.set(fact.workItemId, held);
    stepBlockages.push({ ...fact });
  }
  const inStepOrder = [...document.steps].sort(
    (left, right) =>
      left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const relationshipIds = new Set<string>();
  for (const [at, relationship] of document.typedDependencies.entries()) {
    const path = `typedDependencies[${String(at)}].id`;
    // Proof: bypassing empty-ID and repeated-ID checks separately failed the named
    // authored-ID preparation tests (2026-10-22), including the cross-arm case.
    if (relationship.id === '' || relationshipIds.has(relationship.id))
      return refuses('invalid_typed_dependency', path);
    relationshipIds.add(relationship.id);
  }
  for (const [at, relationship] of document.typedDependencies.entries()) {
    const prefix = `typedDependencies[${String(at)}]`;
    const endpointOf = (
      endpoint: typeof relationship.predecessor | typeof relationship.successor,
    ) =>
      endpoint.scope === 'whole'
        ? {
            scope: 'whole' as const,
            workItemId: 'workItem' in endpoint ? endpoint.workItem : endpoint.workItemId,
          }
        : {
            scope: endpoint.scope,
            workItemId: 'workItem' in endpoint ? endpoint.workItem : endpoint.workItemId,
            stepId: 'step' in endpoint ? endpoint.step : endpoint.stepId,
          };
    if ('kind' in relationship.predecessor && relationship.predecessor.kind === 'external') {
      const successor = endpointOf(relationship.successor);
      const defect = findTypedEndpointDefect(successor, {
        isLeaf: (workItemId) => leafByFileId.get(workItemId),
        hasStep: (stepId) => steps.byId.has(stepId),
      });
      if (defect !== null)
        return refuses(
          'invalid_typed_dependency',
          `${prefix}.successor.${defect === 'unknown_step' ? 'step' : 'workItem'}`,
          defect,
        );
      const predecessor = relationship.predecessor;
      const key = JSON.stringify([
        predecessor.projectId,
        predecessor.workItemId,
        predecessor.scope,
        'stepId' in predecessor ? predecessor.stepId : null,
        successor,
        relationship.type,
      ]);
      // Proof: forcing this duplicate guard false made the module's duplicate external declaration test receive external_dependencies_inactive instead of invalid_typed_dependency (2026-10-22).
      if (relationshipKeys.has(key))
        return refuses('invalid_typed_dependency', prefix, 'duplicate');
      relationshipKeys.add(key);
      const mapping = document.externalMappings.find(
        ({ source }) =>
          source.projectId === predecessor.projectId &&
          source.workItemId === predecessor.workItemId &&
          source.scope === predecessor.scope &&
          ('stepId' in source ? source.stepId : null) ===
            ('stepId' in predecessor ? predecessor.stepId : null),
      );
      const destination =
        mapping?.destination ??
        (predecessor.scope === 'whole'
          ? {
              scope: 'whole' as const,
              projectId: predecessor.projectId,
              workItemId: predecessor.workItemId,
            }
          : {
              scope: predecessor.scope,
              projectId: predecessor.projectId,
              workItemId: predecessor.workItemId,
              stepId: predecessor.stepId,
            });
      externalDependencies.push({
        path: prefix,
        predecessor,
        destination,
        successor,
        type: relationship.type,
      });
      continue;
    }
    const typed: TypedDependency = {
      id: relationship.id,
      predecessor: endpointOf(relationship.predecessor),
      successor: endpointOf(relationship.successor),
      type: relationship.type,
    };
    for (const side of ['predecessor', 'successor'] as const) {
      const defect = findTypedEndpointDefect(typed[side], {
        isLeaf: (workItemId) => leafByFileId.get(workItemId),
        hasStep: (stepId) => steps.byId.has(stepId),
      });
      // Proof (2026-09-28): forcing hasStep true made the memory source's
      // missing-step transfer test throw from graph resolution instead of
      // returning invalid_typed_dependency before admission.
      if (defect !== null)
        return refuses(
          'invalid_typed_dependency',
          `${prefix}.${side}.${defect === 'unknown_step' ? 'step' : 'workItem'}`,
          defect,
        );
    }
    const key = formatTypedDependencyKey(typed);
    // Proof (2026-09-28): bypassing this check made the memory source's
    // duplicate-relationship import throw from its store instead of refusing.
    if (relationshipKeys.has(key)) return refuses('invalid_typed_dependency', prefix, 'duplicate');
    relationshipKeys.add(key);
    typedDependencies.push(typed);
    typedDependencyPaths.set(typed.id, prefix);
  }
  const duplicatePath = findImportDependencyDuplicate(
    externalDependencies.map(({ destination, ...relationship }) => ({
      ...relationship,
      predecessor: destination,
    })),
  );
  // Proof: bypassing this refusal admitted the mapped-destination collision
  // in prepare-import.test.ts (2026-10-22).
  if (duplicatePath !== null)
    return refuses('invalid_typed_dependency', duplicatePath, 'duplicate');
  if (typedDependencies.length > 0) {
    const cycle = findDependencyGraphCycle({
      rows: document.workItems.map(rowShape),
      // Proof (2026-09-28): restoring file-array order made the shuffled-step
      // position-order cycle test import a project instead of refusing it.
      steps: inStepOrder.map(({ id, allowancePercent, estimateUnit }) => {
        const checked = allowancePercentOf(allowancePercent);
        if (checked === null) throw new Error(`validated allowance disappeared for step ${id}`);
        return { id, allowancePercent: checked, estimateUnit };
      }),
      estimates: preparedRows.flatMap(({ fileId, estimates }) =>
        estimates.map(({ stepFileId }) => ({ workItemId: fileId, stepId: stepFileId })),
      ),
      legacy: dependencies.map(({ predecessorFileId, successorFileId }, at) => ({
        id: `file-edge-${String(at)}`,
        projectId: 'file',
        predecessorId: predecessorFileId,
        successorId: successorFileId,
      })),
      typed: typedDependencies,
      reach: document.settings.depReach,
    });
    // Proof (2026-09-28): bypassing this refusal made the memory source admit
    // a combined legacy/typed cycle and create a project (ok: true).
    if (cycle !== null) return refuses('invalid_typed_dependency', 'typedDependencies', cycle.kind);
  }
  // A file of an earlier version codes none of its steps and one of version 3
  // codes all of them (`classifyPlanDocument`); suggesting around the file's
  // own codes keeps the two apart without assuming which.
  const uncoded = inStepOrder.filter(({ code }) => code === null);
  const suggested = suggestStepCodes(
    uncoded.map(({ name }) => name),
    stepCodes,
  );
  const codeByFileId = new Map<string, string | undefined>([
    ...inStepOrder.flatMap(({ id, code }) => (code === null ? [] : [[id, code] as const])),
    ...uncoded.map(({ id }, at) => [id, suggested[at]] as const),
  ]);
  const preparedSteps = document.steps.map(
    ({ id, name, position, allowancePercent, estimateUnit }) => {
      const code = codeByFileId.get(id);
      if (code === undefined) throw new Error(`step ${id} was not coded during preparation`);
      return { fileId: id, name, position, allowancePercent, estimateUnit, code };
    },
  );
  const stepByFileId = new Map(preparedSteps.map((step) => [step.fileId, step] as const));
  const preparedTeams = document.directory.teams.map(({ id, name, serviceIds }) => ({
    fileId: id,
    name,
    serviceFileIds: serviceIds,
  }));
  const teamByFileId = new Map(preparedTeams.map((team) => [team.fileId, team] as const));
  const preparedPeople = document.directory.people.map(({ id, name, kind, teamIds }) => ({
    fileId: id,
    name,
    kind,
    teamFileIds: teamIds,
  }));
  const personByFileId = new Map(preparedPeople.map((person) => [person.fileId, person] as const));
  return {
    ok: true,
    value: {
      settings: document.settings,
      stepBlockages,
      capacity: document.capacity.map(({ teamId, size }) => ({ teamFileId: teamId, size })),
      priorityBands: document.priorityBands,
      calendarMarkers: document.calendarMarkers.map(({ id, date, name, color }) => ({
        fileId: id,
        date,
        name,
        color,
      })),
      steps: preparedSteps,
      workItems: preparedRows,
      dependencies,
      typedDependencies,
      typedDependencyPaths,
      externalDependencies,
      stepByFileId,
      teamByFileId,
      personByFileId,
      tagByFileId: preparedNamed(tags.byId),
      serviceByFileId: preparedNamed(services.byId),
      typeByFileId: preparedNamed(types.byId),
      externalSystemByFileId: preparedNamed(externalSystems.byId),
      ...resourcePreparation,
      ...measurePreparation,
    },
  };
}

/**
 * The file's measures checked against its own definitions (`wbs-measure-budgets`
 * design D63), as the commands would check them against an organization's:
 *
 * - each definition well formed as `createMeasure` requires (key, unit, order,
 *   currency exactly on money) and its key stated once and not a legacy metric
 *   name; only the seeded `time` schedules work and only the seeded
 *   `agent_minutes` is derived, so any other definition claiming either is
 *   refused;
 * - each fact, trio and budget names a definition of the file and a row (a
 *   leaf for facts and trios) and step of it, in the measure's scale, at most
 *   once per place and key; no fact in the scheduling measure, a derived one,
 *   or `tokens` and `hours` (their facts are the row's legacy `measures`), no
 *   trio where three points are forbidden or beside the row's legacy token
 *   estimate, no budget in the scheduling measure;
 * - figures from 0, a trio ordered, a basis exactly on money with a digest of
 *   1 to {@link LONGEST_RATE_CARD_DIGEST} characters.
 *
 * Whether the importing organization holds each definition in the same shape
 * is decided at admission (`ImportService`), where its definitions are read.
 */
function prepareMeasures(
  document: PlanDocumentImport,
  rows: ReadonlyMap<string, DocumentRow>,
  leaves: ReadonlySet<string>,
  steps: ReadonlyMap<string, DocumentStep>,
):
  | Pick<PreparedImport, 'measureDefinitions' | 'measureFacts' | 'measureEstimates' | 'budgets'>
  | Refusal {
  const definitions = new Map<string, PlanDocumentImport['measureDefinitions'][number]>();
  for (const [at, definition] of document.measureDefinitions.entries()) {
    const path = (field: string) => `measureDefinitions[${String(at)}].${field}`;
    // Proof: with each refusal in this loop bypassed alone, its case of
    // `refuses a version-11 file whose measures do not hold together`
    // (prepare-import.test.ts) prepared ok; watched 2026-10-23.
    if (
      !isMeasureKey(definition.key) ||
      isLegacyMetric(definition.key) ||
      definitions.has(definition.key)
    )
      return refuses('invalid_body', path('key'), definition.key);
    const name = cleanName(definition.name);
    if (name === null) return refuses('invalid_body', path('name'));
    const unit = definition.unit.trim();
    if (unit === '' || unit.length > MOST_CHARACTERS_IN_A_UNIT_LABEL)
      return refuses('invalid_body', path('unit'));
    if (
      !Number.isSafeInteger(definition.order) ||
      definition.order < 0 ||
      definition.order > MOST_MEASURE_ORDER
    )
      return refuses('invalid_body', path('order'));
    if (
      definition.kind === 'money'
        ? !isCurrencyCode(definition.currency)
        : definition.currency !== null
    )
      return refuses('invalid_body', path('currency'));
    if (definition.schedulesWork && definition.key !== 'time')
      return refuses('invalid_body', path('schedulesWork'));
    if (definition.derived && definition.key !== 'agent_minutes')
      return refuses('invalid_body', path('derived'));
    definitions.set(definition.key, { ...definition, name, unit });
  }
  const integerIn = (key: string, ...values: number[]) =>
    definitions.get(key)?.scale !== 'integer' || values.every(Number.isInteger);
  const basisRefusal = (
    key: string,
    basis: PlanDocumentImport['measureFacts'][number]['basis'],
    path: string,
  ): Refusal | null => {
    const definition = definitions.get(key);
    // A command refuses an unpriced write in a money measure
    // (`rate_card_required`, design D43); the import names that code as its
    // detail, since D65 adds no refusal code.
    // Proof: with this refusal skipped, `refuses a version-11 file whose
    // measures do not hold together: an unpriced money fact` and `: an
    // unpriced money trio` (prepare-import.test.ts) prepared ok; watched 2026-10-24.
    if (basis === null)
      return definition?.kind === 'money'
        ? refuses('invalid_body', path, 'rate_card_required')
        : null;
    if (definition?.kind !== 'money') return refuses('invalid_body', path);
    // A command derives the basis currency from the definition (`money-basis.ts`),
    // so a basis naming another one is a figure no command could have written.
    // Proof: with the equality dropped, `refuses a version-11 file whose
    // measures do not hold together` (prepare-import.test.ts) prepared an EUR
    // fact and an EUR trio on a USD `cost`; watched 2026-10-23.
    if (!isCurrencyCode(basis.currency) || basis.currency !== definition.currency)
      return refuses('invalid_body', `${path}.currency`);
    if (basis.rateCardDigest === '' || basis.rateCardDigest.length > LONGEST_RATE_CARD_DIGEST)
      return refuses('invalid_body', `${path}.rateCardDigest`);
    return null;
  };
  const placed = (prefix: string, workItemId: string, stepId: string, key: string) => {
    if (!definitions.has(key)) return refuses('unknown_ref', `${prefix}.measure`, key);
    if (!rows.has(workItemId)) return refuses('unknown_ref', `${prefix}.workItemId`, workItemId);
    if (!leaves.has(workItemId)) return refuses('invalid_body', `${prefix}.workItemId`, workItemId);
    if (!steps.has(stepId)) return refuses('unknown_ref', `${prefix}.stepId`, stepId);
    return null;
  };
  const factPlaces = new Set<string>();
  for (const [at, fact] of document.measureFacts.entries()) {
    const prefix = `measureFacts[${String(at)}]`;
    const refused = placed(prefix, fact.workItemId, fact.stepId, fact.measure);
    if (refused !== null) return refused;
    const definition = definitions.get(fact.measure);
    if (
      definition === undefined ||
      definition.schedulesWork ||
      definition.derived ||
      fact.measure === 'tokens' ||
      fact.measure === 'hours'
    )
      return refuses('invalid_body', `${prefix}.measure`, fact.measure);
    if (fact.value < 0 || !integerIn(fact.measure, fact.value))
      return refuses('invalid_body', `${prefix}.value`);
    const basis = basisRefusal(fact.measure, fact.basis, `${prefix}.basis`);
    if (basis !== null) return basis;
    const place = JSON.stringify([fact.workItemId, fact.stepId, fact.measure]);
    if (factPlaces.has(place)) return refuses('invalid_body', prefix);
    factPlaces.add(place);
  }
  const trioPlaces = new Set<string>();
  for (const [at, trio] of document.measureEstimates.entries()) {
    const prefix = `measureEstimates[${String(at)}]`;
    const refused = placed(prefix, trio.workItemId, trio.stepId, trio.measure);
    if (refused !== null) return refused;
    const definition = definitions.get(trio.measure);
    if (definition === undefined || definition.schedulesWork || !definition.threePoint)
      return refuses('invalid_body', `${prefix}.measure`, trio.measure);
    const { optimistic, realistic, pessimistic } = trio;
    if (
      optimistic < 0 ||
      optimistic > realistic ||
      realistic > pessimistic ||
      !integerIn(trio.measure, optimistic, realistic, pessimistic)
    )
      return refuses('invalid_body', prefix);
    // The legacy token estimate is the single-point tokens trio (design D28):
    // a three-point trio beside it would replace it on write, half-reading the file.
    const legacyEstimates = rows.get(trio.workItemId)?.measures['token_estimate'];
    if (
      trio.measure === 'tokens' &&
      isUnknownRecord(legacyEstimates) &&
      legacyEstimates[trio.stepId] !== undefined
    )
      return refuses('invalid_body', `${prefix}.measure`, trio.measure);
    const basis = basisRefusal(trio.measure, trio.basis, `${prefix}.basis`);
    if (basis !== null) return basis;
    const place = JSON.stringify([trio.workItemId, trio.stepId, trio.measure]);
    if (trioPlaces.has(place)) return refuses('invalid_body', prefix);
    trioPlaces.add(place);
  }
  const budgetPlaces = new Set<string>();
  for (const [at, budget] of document.budgets.entries()) {
    const prefix = `budgets[${String(at)}]`;
    if (!definitions.has(budget.measure))
      return refuses('unknown_ref', `${prefix}.measure`, budget.measure);
    if (!rows.has(budget.workItemId))
      return refuses('unknown_ref', `${prefix}.workItemId`, budget.workItemId);
    if (definitions.get(budget.measure)?.schedulesWork === true)
      return refuses('invalid_body', `${prefix}.measure`, budget.measure);
    const figures = [
      budget.cap,
      ...(budget.holdPerAttempt === null ? [] : [budget.holdPerAttempt]),
    ];
    if (figures.some((figure) => figure < 0) || !integerIn(budget.measure, ...figures))
      return refuses('invalid_body', prefix);
    const place = JSON.stringify([budget.workItemId, budget.measure]);
    if (budgetPlaces.has(place)) return refuses('invalid_body', prefix);
    budgetPlaces.add(place);
  }
  return {
    measureDefinitions: [...definitions.values()],
    measureFacts: document.measureFacts,
    measureEstimates: document.measureEstimates,
    budgets: document.budgets,
  };
}

/**
 * The file's resources, their capacities and demands, resolved to file ids
 * (`wbs-resources`): names cleaned and distinct, ids distinct, every capacity
 * and demand naming a resource the file states, every demand a row it holds,
 * no pair stated twice, and a demand on an exclusive resource exactly 1.
 *
 * Proof: with each refusal below bypassed alone, its case of `refuses a
 * version-10 file whose resources do not resolve` (prepare-import.test.ts)
 * answered ok; watched 2026-10-20.
 */
function prepareResources(
  document: PlanDocumentImport,
  rows: ReadonlyMap<string, DocumentRow>,
): Pick<PreparedImport, 'resourceByFileId' | 'resourceCapacities' | 'demands'> | Refusal {
  const named = normalizedNamed(document.directory.resources, 'directory.resources');
  if ('ok' in named) return named;
  const resources = indexById(document.directory.resources, 'directory.resources');
  if (isRefusal(resources)) return resources;
  const stated = new Set<string>();
  for (const [at, { resourceId }] of document.resourceCapacities.entries()) {
    if (!resources.byId.has(resourceId))
      return refuses('unknown_ref', `resourceCapacities[${String(at)}].resourceId`, resourceId);
    if (stated.has(resourceId))
      return refuses('invalid_body', `resourceCapacities[${String(at)}].resourceId`, resourceId);
    stated.add(resourceId);
  }
  const demanded = new Set<string>();
  for (const [at, { workItemId, resourceId, units }] of document.demands.entries()) {
    const resource = resources.byId.get(resourceId);
    if (resource === undefined)
      return refuses('unknown_ref', `demands[${String(at)}].resourceId`, resourceId);
    if (!rows.has(workItemId))
      return refuses('unknown_ref', `demands[${String(at)}].workItemId`, workItemId);
    const pair = JSON.stringify([workItemId, resourceId]);
    if (demanded.has(pair)) return refuses('invalid_body', `demands[${String(at)}]`);
    demanded.add(pair);
    const refusal = refuseDemand(resource.kind, units);
    if (refusal !== null) return refuses('invalid_body', `demands[${String(at)}].units`, refusal);
  }
  return {
    resourceByFileId: new Map(
      document.directory.resources.map(({ id, name, kind, unitLabel }) => [
        id,
        { fileId: id, name, kind, unitLabel },
      ]),
    ),
    resourceCapacities: document.resourceCapacities.map(({ resourceId, units }) => ({
      resourceFileId: resourceId,
      units,
    })),
    demands: document.demands.map(({ workItemId, resourceId, units }) => ({
      workItemFileId: workItemId,
      resourceFileId: resourceId,
      units,
    })),
  };
}
