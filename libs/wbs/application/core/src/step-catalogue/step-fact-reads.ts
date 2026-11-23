import {
  assertStepParallel,
  resolveSteps,
  type StepBinding,
  type StoredStepBlockage,
  type StoredStepParallel,
} from '@wbs/domain';

import type { StoredActual } from '../ports/actual-store';
import type { StoredProgress } from '../ports/progress-store';
import { type PackageStepValues, readCatalogueId, type StepIdentity } from './step-catalogue';
import type { StepUsagePackage } from './step-usage';
import { compareStepUsageIds } from './step-usage-capture';
import { decideStepWrite } from './step-write';

export interface StepFactAddress {
  readonly workItemId: string;
  readonly stepId: string;
}
import type { StepFactKind } from '../ports/step-catalogue';

/** Raw trusted actual columns are decoded once after ownership selection, including both numeric fields. */
export interface StepActualRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly days: unknown;
  readonly recordedAt: unknown;
}
export interface StepProgressRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly state: unknown;
  readonly statedAt: unknown;
}

/** Physical sparse columns stay unknown until this common address/value boundary. */
export interface StepBlockageRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly blockedAt: unknown;
}
export interface StepParallelRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly maxParallel: unknown;
}

/** No rounding/coercion is permitted for retained blockage timestamps. */
export function readStoredBlockage(row: StepBlockageRecord): StoredStepBlockage {
  const workItemId = readCatalogueId(row.workItemId, 'blockage work item');
  const stepId = readCatalogueId(row.stepId, 'blockage step');
  // Proof: S03 removed this whole scalar guard; a physical SQLite BLOB survived
  // the actual blockage full read. Selected baseline/after passed1 each.
  if (typeof row.blockedAt !== 'number' || !Number.isSafeInteger(row.blockedAt))
    throw new Error('step blockage has an invalid blocked time');
  return { workItemId, stepId, blockedAt: row.blockedAt };
}

/** Native/BLOB storage cannot become a numeric maximum through driver declarations. */
export function readStoredParallel(row: StepParallelRecord): StoredStepParallel {
  const workItemId = readCatalogueId(row.workItemId, 'parallel work item');
  const stepId = readCatalogueId(row.stepId, 'parallel step');
  if (typeof row.maxParallel !== 'number')
    throw new Error('step parallelism has an invalid maximum');
  assertStepParallel(row.maxParallel);
  return { workItemId, stepId, maxParallel: row.maxParallel };
}

/** Driver declarations do not validate trusted stored actuals. */
export function readStoredActual(row: StepActualRecord): StoredActual {
  const workItemId = readCatalogueId(row.workItemId, 'actual work item');
  const stepId = readCatalogueId(row.stepId, 'actual step');
  if (typeof row.days !== 'number' || !Number.isFinite(row.days) || row.days < 0)
    throw new Error('stored actual has a malformed day value');
  if (typeof row.recordedAt !== 'number' || !Number.isFinite(row.recordedAt))
    throw new Error('stored actual has a malformed recorded time');
  return { workItemId, stepId, days: row.days, recordedAt: row.recordedAt };
}

/** Both the progress discriminant and its timestamp must survive a physical storage boundary. */
export function readStoredProgress(row: StepProgressRecord): StoredProgress {
  const workItemId = readCatalogueId(row.workItemId, 'progress work item');
  const stepId = readCatalogueId(row.stepId, 'progress step');
  if (row.state !== 'in_progress' && row.state !== 'done')
    throw new Error('stored progress has a malformed state');
  if (typeof row.statedAt !== 'number' || !Number.isFinite(row.statedAt))
    throw new Error('stored progress has a malformed stated time');
  return { workItemId, stepId, state: row.state, statedAt: row.statedAt };
}

/** Every selected fact names a resolved leaf; SC18 ordinals, rather than package DTO positions, order each leaf. */
export function projectStoredStepFacts<Fact extends StepFactAddress>(
  captured: StepUsagePackage,
  bindings: readonly StepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
  values: ReadonlyMap<string, PackageStepValues>,
  facts: readonly Fact[],
  family: StepFactKind,
): Fact[] {
  const workItems = new Map(captured.workItems.map((row) => [row.id, row]));
  const parents = new Set(captured.workItems.map(({ parentId }) => parentId));
  const ordinals = new Map<string, ReadonlyMap<string, number>>();
  const selected: { readonly fact: Fact; readonly ordinal: number }[] = [];
  const pairs = new Set<string>();
  for (const fact of facts) {
    const row = workItems.get(fact.workItemId);
    if (row === undefined)
      throw new Error(`stored ${family} work item is absent from its captured package`);
    if (parents.has(row.id)) throw new Error(`stored ${family} names a parent work item`);
    const decision = decideStepWrite(
      captured.chain,
      row.typeState,
      fact.stepId,
      identities.get(fact.stepId) ?? null,
      bindings,
      values,
    );
    if (decision.kind !== 'resolved')
      throw new Error(`stored ${family} is not leaf-resolved: ${decision.kind}`);
    let order = ordinals.get(row.id);
    if (order === undefined) {
      order = new Map(
        resolveSteps(captured.chain, row.typeState, bindings).map(({ stepId }, ordinal) => [
          stepId,
          ordinal,
        ]),
      );
      ordinals.set(row.id, order);
    }
    const ordinal = order.get(fact.stepId);
    if (ordinal === undefined) throw new Error(`resolved ${family} ordering is absent`);
    const pair = JSON.stringify([fact.workItemId, fact.stepId]);
    if (pairs.has(pair)) throw new Error(`duplicate stored ${family} pair`);
    pairs.add(pair);
    selected.push({ fact, ordinal });
  }
  // Proof: S05 reversed only the leaf ordinal comparator; the actual full-read
  // SC18 array reversed its two leaf steps. Selected baseline/after passed1 each.
  return selected
    .sort(
      (left, right) =>
        compareStepUsageIds(left.fact.workItemId, right.fact.workItemId) ||
        left.ordinal - right.ordinal,
    )
    .map(({ fact }) => ({ ...fact }));
}
