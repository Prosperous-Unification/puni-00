import { isHold, isReadiness } from '@wbs/domain';

import type { Demand } from '../../ports/demand-store';
import type { StepNodesInUse } from '../../ports/step-catalogue';
import type { StepUsageSnapshot } from '../../ports/step-usage';
import type { Repositioned, WorkItem } from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import { readCatalogueId } from './step-catalogue';
import { projectMoveStepUsage, projectStepNodesInUse } from './step-usage';

/** An existing row's within-package move. This grants no first-child fact transfer. */
export interface MoveWrite {
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly respaced: readonly Repositioned[];
}

/** Transient before-image from the actual writer; not an admitted journal/history descriptor. */
export interface MoveRecord {
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly fromParentId: string | null;
  readonly fromPosition: number;
  readonly parentId: string | null;
  readonly position: number;
  readonly destinationStatements:
    (Pick<WorkItem, 'readiness' | 'hold'> & { readonly workItemId: string }) | null;
  readonly clearedDemands: readonly Demand[];
}
export type MoveWriteOutcome =
  | { readonly kind: 'written'; readonly record: MoveRecord }
  | { readonly kind: 'not_found' | 'stale_transition' }
  | ({ readonly kind: 'step_nodes_in_use' } & StepNodesInUse);

/** Clones plain input before queue admission and rejects malformed addressing/placement. */
export function retainMoveWrite(write: MoveWrite, stamp: WriteStamp) {
  const retained = structuredClone(write);
  readCatalogueId(retained.workPackageId, 'move package');
  readCatalogueId(retained.workItemId, 'move work item');
  if (retained.parentId !== null) readCatalogueId(retained.parentId, 'move parent');
  // Proof: removing this predicate failed both actual Source finite-position oracles; SQLite's later query error no longer substitutes for this diagnostic.
  if (!Number.isFinite(retained.position)) throw new Error('move position is not finite');
  const seen = new Set([retained.workItemId]);
  for (const placement of retained.respaced) {
    readCatalogueId(placement.id, 'move respaced identity');
    // Proof: omitting this predicate failed both actual Source respaced-position diagnostic oracles.
    if (!Number.isFinite(placement.position))
      throw new Error('move respaced position is not finite');
    // Proof: removing this identity check failed both actual Source duplicate/self-respacing oracles.
    if (seen.has(placement.id)) throw new Error('move repeats a structural identity');
    seen.add(placement.id);
  }
  return { write: retained, stamp: { ...stamp } };
}

/**
 * Decides against one complete current writer capture before any clears or row changes.
 * Foreign/missing rows stay opaque; stale respacing cannot touch another sibling group.
 * Before facts are validated even when they survive. Candidate endpoint invalidity
 * currently throws before mutation; ordinary service/replay admission remains separate.
 */
export function decideMoveWrite(
  snapshot: StepUsageSnapshot,
  rows: readonly WorkItem[],
  write: MoveWrite,
):
  | Exclude<MoveWriteOutcome, { kind: 'written' }>
  | { readonly kind: 'ready'; readonly record: Omit<MoveRecord, 'clearedDemands'> } {
  const moving = rows.find(
    ({ id, workPackageId }) => id === write.workItemId && workPackageId === write.workPackageId,
  );
  if (moving === undefined) return { kind: 'not_found' };
  const destination =
    write.parentId === null
      ? null
      : rows.find(
          ({ id, workPackageId }) => id === write.parentId && workPackageId === write.workPackageId,
        );
  if (destination === undefined) return { kind: 'not_found' };
  for (const placement of write.respaced) {
    const sibling = rows.find(({ id }) => id === placement.id);
    // Proof: skipping this scope check admitted the wrong-parent respacing in both actual Source stale-transition cases.
    if (sibling?.workPackageId !== write.workPackageId || sibling.parentId !== write.parentId)
      return { kind: 'stale_transition' };
  }
  const usage = projectMoveStepUsage(snapshot, write.workItemId, write.parentId);
  // Proof: omitting this return failed both actual estimated-destination payload oracles; candidate validation still threw, so this proves the modeled outcome only.
  if (usage.count !== 0) return { kind: 'step_nodes_in_use', ...usage };
  const candidate = snapshot.packages.map((workPackage) => ({
    ...workPackage,
    workItems: workPackage.workItems.map((row) =>
      row.id === write.workItemId
        ? { ...row, parentId: write.parentId, position: write.position }
        : row,
    ),
  }));
  // Proof: omitting candidate validation admitted a stranded descendant endpoint in both actual Source move cases.
  projectStepNodesInUse(candidate, snapshot.bindings, snapshot.bindings, snapshot.facts);
  const becomesParent =
    destination !== null && !rows.some(({ parentId }) => parentId === destination.id);
  if (
    becomesParent &&
    ((destination.readiness !== null && !isReadiness(destination.readiness)) ||
      (destination.hold !== null && !isHold(destination.hold)))
  )
    throw new Error('move destination statements are malformed');
  return {
    kind: 'ready',
    record: {
      workPackageId: write.workPackageId,
      workItemId: write.workItemId,
      fromParentId: moving.parentId,
      fromPosition: moving.position,
      parentId: write.parentId,
      position: write.position,
      destinationStatements: becomesParent
        ? { workItemId: destination.id, readiness: destination.readiness, hold: destination.hold }
        : null,
    },
  };
}
