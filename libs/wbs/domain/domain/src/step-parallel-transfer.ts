import { readStepParallels } from './saved-plan/canonical-plan-input';
import type { StoredStepParallel } from './step-parallel';

interface References {
  workItems: { id: string; parentId?: string | null }[];
  steps: { id: string }[];
  stepParallels: unknown;
}

/** Captures reference identities once, including parent links used to establish leaf ownership. */
function readReferences(supplied: unknown): References {
  // Proof: references-object removed; missing source/target negatives failed (transfer-20261109).
  if (typeof supplied !== 'object' || supplied === null)
    throw new Error('step parallelism references are malformed');
  const workItems = 'workItems' in supplied ? supplied.workItems : undefined;
  const steps = 'steps' in supplied ? supplied.steps : undefined;
  // Proof: reference-lists removed; malformed source owner/target step lists failed.
  if (!Array.isArray(workItems) || !Array.isArray(steps))
    throw new Error('step parallelism reference collections are malformed');
  const ownerRows: readonly unknown[] = workItems;
  const stepRows: readonly unknown[] = steps;
  return {
    workItems: ownerRows.map((owner) => {
      // Proof: owner-object removed; null owner negative failed.
      if (typeof owner !== 'object' || owner === null)
        throw new Error('step parallelism owner is malformed');
      const id = 'id' in owner ? owner.id : undefined;
      const parentId = 'parentId' in owner ? owner.parentId : undefined;
      // Proof: owner-id removed; numeric owner ID negative failed.
      if (typeof id !== 'string') throw new Error('step parallelism owner ID is malformed');
      // Proof: parent-id removed; numeric parent ID negative failed.
      if (parentId !== undefined && parentId !== null && typeof parentId !== 'string')
        throw new Error('step parallelism parent ID is malformed');
      return parentId === undefined ? { id } : { id, parentId };
    }),
    steps: stepRows.map((step) => {
      // Proof: step-object removed; null target step negative failed.
      if (typeof step !== 'object' || step === null)
        throw new Error('step parallelism step is malformed');
      const id = 'id' in step ? step.id : undefined;
      // Proof: step-id removed; null step ID negative failed.
      if (typeof id !== 'string') throw new Error('step parallelism step ID is malformed');
      return { id };
    }),
    stepParallels: 'stepParallels' in supplied ? supplied.stepParallels : undefined,
  };
}

/** Reads explicit source/target string tuples without overwriting duplicate sources. */
function readIds(
  supplied: unknown,
  sources: ReadonlySet<string>,
  targets: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  // Proof: map-list removed; missing owner/step map negatives failed.
  if (!Array.isArray(supplied)) throw new Error('step parallelism ID map is malformed');
  const entries: readonly unknown[] = supplied;
  const ids = new Map<string, string>();
  for (const entry of entries) {
    // Proof: map-entry removed; null/short tuple negatives failed.
    if (!Array.isArray(entry) || entry.length !== 2)
      throw new Error('step parallelism ID map entry is malformed');
    const pair: readonly unknown[] = entry;
    const [source, target] = pair;
    // Proof: map-id removed; numeric mapped ID negative failed.
    if (typeof source !== 'string' || typeof target !== 'string')
      throw new Error('step parallelism mapped ID is malformed');
    // Proof: map-source-reference removed; unused unknown source owner/step negatives failed.
    if (!sources.has(source)) throw new Error('step parallelism mapped source is unknown');
    // Proof: map-target-reference removed; unused unknown target owner/step negatives failed.
    if (!targets.has(target)) throw new Error('step parallelism mapped target is unknown');
    // Proof: map-duplicate removed; duplicate owner/step source negatives failed.
    if (ids.has(source)) throw new Error('step parallelism ID map source is duplicated');
    ids.set(source, target);
  }
  return ids;
}

/**
 * Transfers sparse authored facts using explicit old-to-new identities.
 * The unknown request contains source `{workItems, steps, stepParallels}`,
 * target `{workItems, steps}` and `workItemIds`/`stepIds` arrays of string tuples.
 * Owner rows carry `id` and optional `parentId`; step rows carry `id`.
 * IDs follow saved-plan string identity, including Unicode and delimiters.
 * Throws for malformed inventories/maps/facts, non-leaf or absent references,
 * duplicate sources/pairs, missing mappings and output collisions. Empty policy
 * still requires valid inventories and maps. Unused mappings synthesize nothing.
 * Watched fault receipts: `openspec/changes/set-step-node-parallelism/evidence/transfer-20261109.json`.
 * Returns detached facts in saved-plan owner/step UTF-16 string order, preserving
 * explicit equality and sibling absence. Nothing is published or mutated on failure.
 * This internal prerequisite does not admit public writing or change wire versions.
 */
export function transferStepParallels(supplied: unknown): StoredStepParallel[] {
  // Proof: request-object removed; null request negative failed.
  if (typeof supplied !== 'object' || supplied === null)
    throw new Error('step parallelism transfer request is malformed');
  const source = readReferences('source' in supplied ? supplied.source : undefined);
  const target = readReferences('target' in supplied ? supplied.target : undefined);
  const workItemIds = readIds(
    'workItemIds' in supplied ? supplied.workItemIds : undefined,
    new Set(source.workItems.map(({ id }) => id)),
    new Set(target.workItems.map(({ id }) => id)),
  );
  const stepIds = readIds(
    'stepIds' in supplied ? supplied.stepIds : undefined,
    new Set(source.steps.map(({ id }) => id)),
    new Set(target.steps.map(({ id }) => id)),
  );
  // Proof: source-validation bypassed; missing facts, parent owner and duplicate facts negatives failed.
  const facts = readStepParallels(source);
  // Proof: equality-collapse and maximum-rewrite failed exact sparse/equality and Unicode oracles.
  // Proof: source-mutation injected an input write; exact sparse/detachment oracle failed.
  const mapped = facts.map(({ workItemId, stepId, maxParallel }) => {
    const owner = workItemIds.get(workItemId);
    const step = stepIds.get(stepId);
    // Proof: owner-mapping removed; unmapped owner negative failed.
    if (owner === undefined) throw new Error('step parallelism owner mapping is missing');
    // Proof: step-mapping removed; unmapped step negative failed.
    if (step === undefined) throw new Error('step parallelism step mapping is missing');
    return { workItemId: owner, stepId: step, maxParallel };
  });
  // Proof: target-validation bypassed; parent target and both output collision negatives failed.
  const transferred = readStepParallels({ ...target, stepParallels: mapped });
  // Proof: owner/step locale and UTF-8 substitutions independently failed Unicode ordering.
  return transferred.sort((left, right) => {
    if (left.workItemId !== right.workItemId) return left.workItemId < right.workItemId ? -1 : 1;
    return left.stepId < right.stepId ? -1 : left.stepId > right.stepId ? 1 : 0;
  });
}
