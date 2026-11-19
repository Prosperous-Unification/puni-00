import {listMeasuresIn} from './measure-definition';
import { projectStoredAllocatorMarks, groupStoredStepTuples, readCatalogueId, readStoredAttempt, readStoredIssued, readStoredMeasure, readStoredMeasureEstimate, type IssuedAttemptNumber, type StepAttemptRecord, type StepIssuedRecord, type StepMeasureEstimateRecord, type StepMeasureRecord, type StoredAttempt, type StoredMeasure, type StoredMeasureEstimate } from '@wbs/core';
import { definitionKeyOf, isLegacyMetric, isMeasureKey, isMeasureKind, type MeasureKind, type MoneyBasis } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import {captureSqliteStepFactContextIn, projectSqliteStepFactsIn } from './estimate-reads';
import { readSettingTargetIn } from './settings';

type Reader = Pick<Drizzle, 'all'>;
interface FactDefinition { readonly id: string; readonly key: string; readonly kind: MeasureKind }
interface MeasureReference { readonly measureId: unknown }
interface PhysicalMeasure extends StepMeasureRecord, MeasureReference { readonly storedMetric: unknown }
interface PhysicalTrio extends StepMeasureEstimateRecord, MeasureReference {}

/** Only the addressed package's own definitions are decoded, on this exact supplied snapshot. */
function readFactDefinitions(db: Reader, workPackageId: string): ReadonlyMap<string, FactDefinition> {
  const target = readSettingTargetIn(db, { level: 'work_package', id: workPackageId }, null);
  if (target === null) throw new Error('stored measure package is absent');
  const definitions = new Map<string, FactDefinition>();
  for (const row of db.all<{ id: unknown; key: unknown; kind: unknown }>(sql`SELECT id,key,kind FROM measure WHERE organization_id=${target.chain.organizationId}`)) {
    const id = readCatalogueId(row.id, 'fact measure definition');
    if (!isMeasureKey(row.key) || !isMeasureKind(row.kind)) throw new Error('stored fact measure definition is malformed');
    if (definitions.has(row.key)) throw new Error('stored fact measure definition key is duplicated');
    definitions.set(row.key, { id, key: row.key, kind: row.kind });
  }
  return definitions;
}

function requireDefinition(definitions: ReadonlyMap<string, FactDefinition>, key: unknown, reference: unknown, permitsNull: boolean): FactDefinition {
  if (!isMeasureKey(key)) throw new Error('stored measure reference has a malformed key');
  const definition = definitions.get(key);
  if (definition === undefined) throw new Error('stored measure definition is absent or foreign');
  if (reference === null) {
    if (!permitsNull) throw new Error('stored measure definition reference is absent');
  } else if (readCatalogueId(reference, 'fact measure reference') !== definition.id) throw new Error('stored measure definition is absent or foreign');
  return definition;
}

function requireMeasureBasis(definition: FactDefinition, basis: MoneyBasis | undefined): void {
  if (basis !== undefined && definition.kind !== 'money') throw new Error('stored non-money figure carries a money basis');
}

/**
 * All metrics per address survive; SC18 ordinals and metric text form the order.
 * The old SQL expression's measures.set:defined-key record (2026-10-23) named
 * loss of a custom key when metric alone was selected. The same coalesce is
 * retained here; its new Source omission observation remains separate.
 */
export function readSqliteMeasuresIn(db: Reader, workPackageId: string, ids: readonly string[] | null): StoredMeasure[] {
  if (ids !== null && ids.length === 0) return [];
  const selected = ids === null ? sql`i.work_package_id=${workPackageId}` : sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const rows = db.all<PhysicalMeasure>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",coalesce(f.metric,m.key) AS "metric",f.metric AS "storedMetric",f.measure_id AS "measureId",f.value,f.recorded_at AS "recordedAt",f.currency,f.rate_card_digest AS "rateCardDigest" FROM step_measure f LEFT JOIN work_item i ON i.id=f.work_item_id LEFT JOIN measure m ON m.id=f.measure_id WHERE ${selected}`);
  if (rows.length === 0) return [];
  const definitions = readFactDefinitions(db, workPackageId);
  const facts = rows.map(row => {
    if (row.storedMetric !== null && (typeof row.storedMetric !== 'string' || !isLegacyMetric(row.storedMetric))) throw new Error('stored measure has an invalid metric');
    if (row.metric === null) return readStoredMeasure(row);
    if (typeof row.metric !== 'string') throw new Error('stored measure has an invalid metric');
    const key = definitionKeyOf(row.metric);
    const definition = requireDefinition(definitions, key === null ? 'tokens' : key, row.measureId, row.storedMetric !== null);
    const fact = readStoredMeasure(row);
    requireMeasureBasis(definition, fact.basis);
    return fact;
  });
  const groups = groupStoredStepTuples(facts, 'measure', fact => fact.metric);
  return projectSqliteStepFactsIn(db, workPackageId, groups, 'measure').flatMap(group => group.facts);
}

/** A nullable tokens reference is the documented legacy representation, not permission to infer any other key. */
export function readSqliteMeasureEstimatesIn(db: Reader, workPackageId: string, ids:readonly string[]|null): StoredMeasureEstimate[] {
  if(ids!==null&&ids.length===0)return[];
  const selected=ids===null?sql`i.work_package_id=${workPackageId}`:sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const rows = db.all<PhysicalTrio>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.measure_key AS "key",f.measure_id AS "measureId",f.optimistic,f.realistic,f.pessimistic,f.single_point AS "singlePoint",f.currency,f.rate_card_digest AS "rateCardDigest" FROM measure_estimate f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE ${selected}`);
  if (rows.length === 0) return [];
  const definitions = readFactDefinitions(db, workPackageId);
  const facts = rows.map(row => {
    const definition = requireDefinition(definitions, row.key, row.measureId, row.key === 'tokens');
    const fact = readStoredMeasureEstimate(row);
    requireMeasureBasis(definition, fact.basis);
    return fact;
  });
  return projectSqliteStepFactsIn(db, workPackageId, groupStoredStepTuples(facts, 'measure_estimate', fact => fact.key), 'measure_estimate').flatMap(group => group.facts);
}

/** Complete numbered history per pair; no live-state filter drops finished attempts. */
export function readSqliteAttemptsIn(db: Reader, workPackageId: string, ids: readonly string[] | null): StoredAttempt[] {
  if (ids !== null && ids.length === 0) return [];
  const selected = ids === null ? sql`i.work_package_id=${workPackageId}` : sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const facts = db.all<StepAttemptRecord>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.attempt_number AS "attemptNumber",f.started_at AS "startedAt",f.ended_at AS "endedAt",f.outcome,f.executor_person_id AS "executorPersonId",f.reference,f.note FROM step_node_attempt f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE ${selected}`).map(readStoredAttempt);
  return projectSqliteStepFactsIn(db, workPackageId, groupStoredStepTuples(facts, 'attempt', fact => fact.attemptNumber), 'attempt').flatMap(group => group.facts);
}

/** Resolves the addressed work item's package on this same snapshot; dangling matching facts are never hidden as an absent work item. */
export function readSqliteAttemptsOfIn(db: Reader, workItemId: string): ReadonlyMap<string, readonly StoredAttempt[]> {
  const owner = db.all<{ workPackageId: unknown }>(sql`SELECT work_package_id AS "workPackageId" FROM work_item WHERE id=${workItemId}`).at(0);
  if (owner === undefined) {
    if (db.all(sql`SELECT 1 FROM step_node_attempt WHERE work_item_id=${workItemId} LIMIT 1`).length !== 0) throw new Error('stored attempt work item is absent');
    return new Map<string,StoredAttempt[]>();
  }
  const workPackageId = readCatalogueId(owner.workPackageId, 'attempt package');
  const byStep = new Map<string, StoredAttempt[]>();
  for (const fact of readSqliteAttemptsIn(db, workPackageId, [workItemId])) {
    const held = byStep.get(fact.stepId);
    if (held === undefined) byStep.set(fact.stepId, [fact]); else held.push(fact);
  }
  return byStep;
}

/** Allocator identity is preserved even on parents, checked against their own stated type and exact current package values. */
export function readSqliteIssuedIn(db:Reader,workPackageId:string,ids:readonly string[]):IssuedAttemptNumber[]{
  if(ids.length===0)return[];
  const facts=db.all<StepIssuedRecord>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.issued FROM step_node_attempt_issued f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`).map(readStoredIssued);
  if(facts.length===0)return[];
  const captured=captureSqliteStepFactContextIn(db,workPackageId,facts,'attempt_issued');
  return projectStoredAllocatorMarks(captured.captured,captured.bindings,captured.identities,captured.values,facts);
}

/** A missing package is the nullable read outcome; an existing malformed scope is refused by the current target reader. */
export function readSqliteMeasureDefinitionsIn(db:Drizzle,workPackageId:string){
  const target=readSettingTargetIn(db,{level:'work_package',id:workPackageId},null);
  return target===null?null:listMeasuresIn(db,target.chain.organizationId);
}
