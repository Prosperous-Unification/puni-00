import {
  groupStoredStepTuples,
  type MeasureEstimateStore,
  type MeasureStore,
  projectStoredAllocatorMarks,
  readCatalogueId,
  readStoredAttempt,
  readStoredIssued,
  readStoredMeasure,
  readStoredMeasureEstimate,
  type StepFactAddress,
  type StepNodeAttemptStore,
  type StoredAttempt,
  type StoredMeasure,
  type StoredMeasureEstimate,
} from '@wbs/core';
import {
  definitionKeyOf,
  isMeasureKey,
  isMeasureKind,
  type MeasureKind,
  type MoneyBasis,
} from '@wbs/domain';

import type { MemoryAttemptTable } from './attempt-fixture';
import { captureMemoryStepFactContextIn, readMemoryStepFactsIn } from './estimate-reads';
import type { MemoryMeasureDefinitionTables } from './measure-definition-fixture';
import type { MemoryMeasureEstimateTable } from './measure-estimate-fixture';
import type { MemoryMeasureTable } from './measure-fixture';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';
import type { MemoryStepWriteContext } from './step-write';

export interface MemoryTupleReadContext extends MemoryStepWriteContext {
  readonly measureDefinitions: MemoryMeasureDefinitionTables;
}
interface FactDefinition {
  readonly id: string;
  readonly key: string;
  readonly kind: MeasureKind;
}

function selectTupleRows<Fact extends StepFactAddress>(
  context: MemoryStepWriteContext,
  rows: readonly Fact[],
  workPackageId: string,
  ids: readonly string[] | null,
): Fact[] {
  const requested = ids === null ? null : new Set(ids);
  const selected: Fact[] = [];
  for (const row of rows) {
    if (requested !== null && !requested.has(row.workItemId)) continue;
    const owner = context.workItems.byId.get(row.workItemId);
    if (owner === undefined) {
      if (requested !== null) throw new Error('targeted stored tuple work item is absent');
      continue;
    }
    if (owner.workPackageId === workPackageId) selected.push(row);
  }
  return selected;
}

/** Only an absent optional basis maps to both nullable SQL columns; a present malformed object is preserved/refused. */
function readMoneyColumns(basis: unknown): {
  readonly currency: unknown;
  readonly rateCardDigest: unknown;
} {
  if (basis === undefined) return { currency: null, rateCardDigest: null };
  if (typeof basis !== 'object' || basis === null)
    throw new Error('stored memory figure has a malformed money basis');
  return {
    currency: Reflect.get(basis, 'currency'),
    rateCardDigest: Reflect.get(basis, 'rateCardDigest'),
  };
}

function readFactDefinitions(
  context: MemoryTupleReadContext,
  workPackageId: string,
): ReadonlyMap<string, FactDefinition> {
  const owner = readCatalogueId(
    context.scope.packageOrganization.get(workPackageId),
    'tuple package organization',
  );
  const held = context.measureDefinitions.organizations.get(owner);
  if (held === undefined) throw new Error('stored tuple measure organization is absent');
  const definitions = new Map<string, FactDefinition>();
  for (const raw of held.measures) {
    const id = readCatalogueId(raw.id, 'fact measure definition');
    if (!isMeasureKey(raw.key) || !isMeasureKind(raw.kind))
      throw new Error('stored fact measure definition is malformed');
    if (definitions.has(raw.key))
      throw new Error('stored fact measure definition key is duplicated');
    definitions.set(raw.key, { id, key: raw.key, kind: raw.kind });
  }
  return definitions;
}

function requireDefinition(
  definitions: ReadonlyMap<string, FactDefinition>,
  key: string,
  basis: MoneyBasis | undefined,
): void {
  const definition = definitions.get(key);
  if (definition === undefined) throw new Error('stored measure definition is absent or foreign');
  if (basis !== undefined && definition.kind !== 'money')
    throw new Error('stored non-money figure carries a money basis');
}

export function readMemoryMeasuresIn(
  context: MemoryTupleReadContext,
  table: MemoryMeasureTable,
  workPackageId: string,
  ids: readonly string[] | null,
): StoredMeasure[] {
  const rows = selectTupleRows(context, table.rows, workPackageId, ids);
  if (rows.length === 0) return [];
  const definitions = readFactDefinitions(context, workPackageId);
  const facts = rows.map((row) => {
    const fact = readStoredMeasure({ ...row, ...readMoneyColumns(row.basis) });
    const key = definitionKeyOf(fact.metric);
    requireDefinition(definitions, key ?? 'tokens', fact.basis);
    return fact;
  });
  const groups = groupStoredStepTuples(facts, 'measure', (fact) => fact.metric);
  return readMemoryStepFactsIn(
    context,
    groups,
    workPackageId,
    null,
    (group) => group,
    'measure',
  ).flatMap((group) => group.facts);
}

export function readMemoryMeasureEstimatesIn(
  context: MemoryTupleReadContext,
  table: MemoryMeasureEstimateTable,
  measures: MemoryMeasureTable,
  workPackageId: string,
  ids: readonly string[] | null,
): StoredMeasureEstimate[] {
  const rows = selectTupleRows(context, table.rows, workPackageId, ids);
  const legacy = selectTupleRows(
    context,
    measures.rows.filter((row) => row.metric === 'token_estimate'),
    workPackageId,
    ids,
  );
  if (rows.length === 0 && legacy.length === 0) return [];
  const definitions = readFactDefinitions(context, workPackageId);
  const facts = rows.map((row) =>
    readStoredMeasureEstimate({ ...row, ...readMoneyColumns(row.basis) }),
  );
  for (const row of legacy) {
    const fact = readStoredMeasure({ ...row, ...readMoneyColumns(row.basis) });
    facts.push(
      readStoredMeasureEstimate({
        workItemId: fact.workItemId,
        stepId: fact.stepId,
        key: 'tokens',
        optimistic: fact.value,
        realistic: fact.value,
        pessimistic: fact.value,
        singlePoint: true,
        ...readMoneyColumns(fact.basis),
      }),
    );
  }
  for (const fact of facts) requireDefinition(definitions, fact.key, fact.basis);
  const groups = groupStoredStepTuples(facts, 'measure_estimate', (fact) => fact.key);
  return readMemoryStepFactsIn(
    context,
    groups,
    workPackageId,
    null,
    (group) => group,
    'measure_estimate',
  ).flatMap((group) => group.facts);
}

export function readMemoryAttemptsIn(
  context: MemoryStepWriteContext,
  table: MemoryAttemptTable,
  workPackageId: string,
  ids: readonly string[] | null,
): StoredAttempt[] {
  const facts = selectTupleRows(context, table.rows, workPackageId, ids).map(readStoredAttempt);
  const groups = groupStoredStepTuples(facts, 'attempt', (fact) => fact.attemptNumber);
  return readMemoryStepFactsIn(
    context,
    groups,
    workPackageId,
    null,
    (group) => group,
    'attempt',
  ).flatMap((group) => group.facts);
}

/** Actual source/staged maps supply catalogue and measure ownership; raw placements retain their payload-independent contract. */
export function ownMemoryMeasureReads(
  writer: MeasureStore,
  table: MemoryMeasureTable,
  captureContext: () => MemoryTupleReadContext,
): MeasureStore {
  return {
    ...writer,
    async definitionsFor(workPackageId) {
      const context = captureContext();
      if (!context.scope.packages.has(workPackageId)) return await Promise.resolve(null);
      const owner = readCatalogueId(
        context.scope.packageOrganization.get(workPackageId),
        'measure package organization',
      );
      if (
        captureMemoryCatalogueScope(context.catalogue, context.scope).packageChain(
          owner,
          workPackageId,
        ) === null
      )
        throw new Error('stored measure package is absent');
      const held = context.measureDefinitions.organizations.get(owner);
      if (held === undefined) throw new Error('stored measure organization is absent');
      const definitions = structuredClone(held.measures).sort(
        (left, right) =>
          left.order - right.order || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
      );
      return await Promise.resolve(definitions);
    },
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readMemoryMeasuresIn(captureContext(), table, workPackageId, null),
      );
    },
    async listByWorkItems(workPackageId, ids) {
      const retained = [...ids];
      return await Promise.resolve(
        readMemoryMeasuresIn(captureContext(), table, workPackageId, retained),
      );
    },
  };
}

/** Both physical ranged trios and legacy single-point tokens rows share one same-state projection. */
export function ownMemoryMeasureEstimateReads(
  writer: MeasureEstimateStore,
  table: MemoryMeasureEstimateTable,
  measures: MemoryMeasureTable,
  captureContext: () => MemoryTupleReadContext,
): MeasureEstimateStore {
  return {
    ...writer,
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readMemoryMeasureEstimatesIn(captureContext(), table, measures, workPackageId, null),
      );
    },
  };
}

/** Numbered histories and counters use current applicability while preserving each port's ordering contract. */
export function ownMemoryAttemptReads(
  writer: StepNodeAttemptStore,
  table: MemoryAttemptTable,
  captureContext: () => MemoryStepWriteContext,
): StepNodeAttemptStore {
  return {
    ...writer,
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readMemoryAttemptsIn(captureContext(), table, workPackageId, null),
      );
    },
    async listByWorkItems(workPackageId, ids) {
      const retained = [...ids];
      return await Promise.resolve(
        readMemoryAttemptsIn(captureContext(), table, workPackageId, retained),
      );
    },
    async listOfWorkItem(workItemId) {
      const context = captureContext(),
        owner = context.workItems.byId.get(workItemId);
      if (owner === undefined) {
        if (table.rows.some((row) => row.workItemId === workItemId))
          throw new Error('stored attempt work item is absent');
        return await Promise.resolve(new Map<string, StoredAttempt[]>());
      }
      const byStep = new Map<string, StoredAttempt[]>();
      for (const fact of readMemoryAttemptsIn(context, table, owner.workPackageId, [workItemId])) {
        const held = byStep.get(fact.stepId);
        if (held === undefined) byStep.set(fact.stepId, [fact]);
        else held.push(fact);
      }
      return await Promise.resolve(byStep);
    },
    async listIssued(workPackageId, ids) {
      const retained = [...ids];
      return await Promise.resolve(
        readMemoryIssuedIn(captureContext(), table, workPackageId, retained),
      );
    },
  };
}

/** Parent allocators remain explicit reservations against their own direct type, not live point-fact leaves. */
export function readMemoryIssuedIn(
  context: MemoryStepWriteContext,
  table: MemoryAttemptTable,
  workPackageId: string,
  ids: readonly string[],
) {
  const facts = selectTupleRows(context, table.issued, workPackageId, ids).map(readStoredIssued);
  if (facts.length === 0) return [];
  const captured = captureMemoryStepFactContextIn(context, workPackageId, facts, 'attempt_issued');
  return projectStoredAllocatorMarks(
    captured.captured,
    captured.bindings,
    captured.identities,
    captured.values,
    facts,
  );
}
