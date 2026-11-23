import type { StepBinding } from '@wbs/domain';
import {
  attemptOf,
  isAttemptOutcome,
  isCurrencyCode,
  isLegacyMetric,
  isMeasureKey,
  LONGEST_RATE_CARD_DIGEST,
  type MoneyBasis,
} from '@wbs/domain';

import type { StoredAttempt } from '../ports/attempt-values';
import type { StoredMeasureEstimate } from '../ports/measure-estimate-store';
import type { StoredMeasure } from '../ports/measure-store';
import type { StepFactKind } from '../ports/step-catalogue';
import type { IssuedAttemptNumber } from '../ports/step-node-attempt-store';
import type { PackageStepValues, StepIdentity } from './step-catalogue';
import { readCatalogueId } from './step-catalogue';
import type { StepFactAddress } from './step-fact-reads';
import type { StepUsagePackage } from './step-usage';
import { decideStepWrite } from './step-write';

interface StepRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
}
interface MoneyRecord {
  readonly currency: unknown;
  readonly rateCardDigest: unknown;
}
export interface StepMeasureRecord extends StepRecord, MoneyRecord {
  readonly metric: unknown;
  readonly value: unknown;
  readonly recordedAt: unknown;
}
export interface StepMeasureEstimateRecord extends StepRecord, MoneyRecord {
  readonly key: unknown;
  readonly optimistic: unknown;
  readonly realistic: unknown;
  readonly pessimistic: unknown;
  readonly singlePoint: unknown;
}
export interface StepAttemptRecord extends StepRecord {
  readonly attemptNumber: unknown;
  readonly startedAt: unknown;
  readonly endedAt: unknown;
  readonly outcome: unknown;
  readonly executorPersonId: unknown;
  readonly reference: unknown;
  readonly note: unknown;
}
export interface StepIssuedRecord extends StepRecord {
  readonly issued: unknown;
}

/**
 * Both absent columns mean an older unpriced figure. Partial/malformed bases
 * are never silently discarded. The replaced SQL helper recorded its earlier
 * half-basis corruption owner in targeted-readers.db.test.ts (2026-10-24);
 * this shared decoder requires its own current Source negative/fault evidence.
 */
export function readStoredMoneyColumns(columns: MoneyRecord): { readonly basis?: MoneyBasis } {
  const { currency, rateCardDigest } = columns;
  if (currency === null && rateCardDigest === null) return {};
  if (
    !isCurrencyCode(currency) ||
    typeof rateCardDigest !== 'string' ||
    rateCardDigest.length === 0 ||
    rateCardDigest.length > LONGEST_RATE_CARD_DIGEST
  )
    throw new Error(
      currency === null || rateCardDigest === null
        ? 'a stored money figure carries half a basis'
        : 'stored figure carries a malformed money basis',
    );
  return { basis: { currency, rateCardDigest } };
}

/**
 * Metrics are canonical stored legacy names or definition keys; aliases are
 * not rewritten on read. Historical targeted-readers.db.test.ts records on
 * the replaced SQL reader covered malformed metrics/values/times and a fact
 * naming neither metric nor definition. Those records are not fresh proof of
 * this shared decoder's current production callers.
 */
export function readStoredMeasure(row: StepMeasureRecord): StoredMeasure {
  const workItemId = readCatalogueId(row.workItemId, 'measure work item'),
    stepId = readCatalogueId(row.stepId, 'measure step');
  if (row.metric === null)
    throw new Error(`measure ${workItemId}/${stepId} names no metric and no definition`);
  if (typeof row.metric !== 'string' || (!isLegacyMetric(row.metric) && !isMeasureKey(row.metric)))
    throw new Error('stored measure has an invalid metric');
  if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0)
    throw new Error('stored measure has an invalid value');
  if (typeof row.recordedAt !== 'number' || !Number.isFinite(row.recordedAt))
    throw new Error('stored measure has an invalid recorded time');
  return {
    workItemId,
    stepId,
    metric: row.metric,
    value: row.value,
    recordedAt: row.recordedAt,
    ...readStoredMoneyColumns(row),
  };
}

/** Ranged and single-point token trios retain their complete key, values and basis. */
export function readStoredMeasureEstimate(row: StepMeasureEstimateRecord): StoredMeasureEstimate {
  const workItemId = readCatalogueId(row.workItemId, 'measure estimate work item'),
    stepId = readCatalogueId(row.stepId, 'measure estimate step');
  if (!isMeasureKey(row.key)) throw new Error('stored measure estimate has a malformed key');
  const { optimistic, realistic, pessimistic } = row;
  if (
    typeof optimistic !== 'number' ||
    !Number.isFinite(optimistic) ||
    typeof realistic !== 'number' ||
    !Number.isFinite(realistic) ||
    typeof pessimistic !== 'number' ||
    !Number.isFinite(pessimistic) ||
    optimistic < 0 ||
    optimistic > realistic ||
    realistic > pessimistic
  )
    throw new Error('stored measure estimate has a malformed trio');
  let singlePoint: boolean;
  if (row.singlePoint === true || row.singlePoint === 1) singlePoint = true;
  else if (row.singlePoint === false || row.singlePoint === 0) singlePoint = false;
  else throw new Error('stored measure estimate has a malformed single-point flag');
  if (
    singlePoint &&
    (row.key !== 'tokens' || optimistic !== realistic || realistic !== pessimistic)
  )
    throw new Error('stored measure estimate has an incoherent single point');
  return {
    workItemId,
    stepId,
    key: row.key,
    optimistic,
    realistic,
    pessimistic,
    singlePoint,
    ...readStoredMoneyColumns(row),
  };
}

function readNullableText(value: unknown, label: string): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new Error(`stored attempt has a malformed ${label}`);
}

/** The domain constructor owns number/pair/order invariants; this physical boundary owns erased scalar/discriminant types. */
export function readStoredAttempt(row: StepAttemptRecord): StoredAttempt {
  const workItemId = readCatalogueId(row.workItemId, 'attempt work item'),
    stepId = readCatalogueId(row.stepId, 'attempt step');
  if (typeof row.attemptNumber !== 'number')
    throw new Error('stored attempt has a malformed number');
  if (typeof row.startedAt !== 'number' || !Number.isFinite(row.startedAt))
    throw new Error('stored attempt has a malformed start');
  if (row.endedAt !== null && (typeof row.endedAt !== 'number' || !Number.isFinite(row.endedAt)))
    throw new Error('stored attempt has a malformed end');
  if (row.outcome !== null && !isAttemptOutcome(row.outcome))
    throw new Error('stored attempt has a malformed outcome');
  const executorPersonId =
    row.executorPersonId === null
      ? null
      : readCatalogueId(row.executorPersonId, 'attempt executor');
  const reference = readNullableText(row.reference, 'reference'),
    note = readNullableText(row.note, 'note');
  return {
    workItemId,
    stepId,
    ...attemptOf({
      attemptNumber: row.attemptNumber,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      outcome: row.outcome,
      executorPersonId,
      reference,
      note,
    }),
  };
}

/** Issued marks outlive their attempt rows; malformed or non-positive counters are not reset or omitted. */
export function readStoredIssued(row: StepIssuedRecord): IssuedAttemptNumber {
  const workItemId = readCatalogueId(row.workItemId, 'issued work item'),
    stepId = readCatalogueId(row.stepId, 'issued step');
  if (typeof row.issued !== 'number' || !Number.isSafeInteger(row.issued) || row.issued < 1)
    throw new Error('stored issued attempt has a malformed counter');
  return { workItemId, stepId, issued: row.issued };
}

export interface StepTupleGroup<Fact extends StepFactAddress> extends StepFactAddress {
  readonly facts: readonly Fact[];
}

/**
 * Keeps every full tuple while exposing one distinct address to the existing
 * leaf/SC18 projector. Equal pairs with different suffixes are legal; duplicate
 * full identities throw. Returned nested values are detached from capture rows.
 */
export function groupStoredStepTuples<Fact extends StepFactAddress>(
  facts: readonly Fact[],
  family: StepFactKind,
  suffixOf: (fact: Fact) => string | number,
): StepTupleGroup<Fact>[] {
  const groups = new Map<string, { workItemId: string; stepId: string; facts: Fact[] }>();
  for (const fact of facts) {
    const pair = JSON.stringify([fact.workItemId, fact.stepId]);
    const held = groups.get(pair);
    if (held === undefined)
      groups.set(pair, { workItemId: fact.workItemId, stepId: fact.stepId, facts: [fact] });
    else held.facts.push(fact);
  }
  return [...groups.values()].map((group) => {
    const seen = new Set<string | number>();
    for (const fact of group.facts) {
      const suffix = suffixOf(fact);
      if (seen.has(suffix)) throw new Error(`duplicate stored ${family} tuple`);
      seen.add(suffix);
    }
    const ordered = [...group.facts].sort((left, right) => {
      const leftKey = suffixOf(left),
        rightKey = suffixOf(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    return { workItemId: group.workItemId, stepId: group.stepId, facts: structuredClone(ordered) };
  });
}

/**
 * A42 marks reserve their original address even while it is a parent. They
 * must remain resolved against that row's own stated type and exact package
 * values; this is not a leaf-point projection or a subtree expansion.
 */
export function projectStoredAllocatorMarks(
  captured: StepUsagePackage,
  bindings: readonly StepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
  values: ReadonlyMap<string, PackageStepValues>,
  marks: readonly IssuedAttemptNumber[],
): IssuedAttemptNumber[] {
  const workItems = new Map(captured.workItems.map((row) => [row.id, row]));
  const seen = new Set<string>();
  for (const mark of marks) {
    const owner = workItems.get(mark.workItemId);
    if (owner === undefined) throw new Error('stored allocator work item is absent');
    const decision = decideStepWrite(
      captured.chain,
      owner.typeState,
      mark.stepId,
      identities.get(mark.stepId) ?? null,
      bindings,
      values,
    );
    if (decision.kind !== 'resolved')
      throw new Error(`stored allocator is not directly resolved: ${decision.kind}`);
    const pair = JSON.stringify([mark.workItemId, mark.stepId]);
    if (seen.has(pair)) throw new Error('duplicate stored issued pair');
    seen.add(pair);
  }
  return marks
    .map((mark) => ({ ...mark }))
    .sort((left, right) =>
      left.workItemId < right.workItemId
        ? -1
        : left.workItemId > right.workItemId
          ? 1
          : left.stepId < right.stepId
            ? -1
            : left.stepId > right.stepId
              ? 1
              : 0,
    );
}
