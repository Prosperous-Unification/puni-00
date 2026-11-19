import {
  readStoredBlockage,
  readStoredParallel,
  type StepBlockageRecord,
  type StepParallelRecord,
} from '@wbs/core';
import {sql} from 'drizzle-orm';

import type {Drizzle} from './db';
import {projectSqliteStepFactsIn} from './estimate-reads';

/**
 * Full sparse reads retain a wholly unattributable orphan; targeted reads also require
 * its exact requested id. This is the existing sparse contract, not the scoped census
 * rule. Selection is shared by the two fixed families and accepts no arbitrary table.
 */
function selectSparseOwners(workPackageId:string,ids:readonly string[]|null){
  // Proof: S04 removed the global-orphan selection arm; the actual retained orphan
  // disappeared from a full blockage read. Selected baseline/after passed1 each.
  const owner=sql`(i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  return ids===null?owner:sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND ${owner}`;
}

/** Raw facts and current metadata are read only on the caller's supplied transaction. */
export function readSqliteBlockagesIn(db:Pick<Drizzle,'all'>,workPackageId:string,ids:readonly string[]|null){
  if(ids!==null&&ids.length===0)return[];
  const rows=db.all<StepBlockageRecord&{readonly ownerWorkPackage:unknown}>(sql`
    SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.blocked_at AS "blockedAt",
      i.work_package_id AS "ownerWorkPackage"
    FROM step_blockage f LEFT JOIN work_item i ON i.id=f.work_item_id
    WHERE ${selectSparseOwners(workPackageId,ids)}`);
  const facts=rows.map(row=>{
    if(row.ownerWorkPackage!==workPackageId)throw new Error('step blockage has an invalid work-item reference');
    return readStoredBlockage(row);
  });
  return projectSqliteStepFactsIn(db,workPackageId,facts,'blockage');
}

/** Unknown physical maximums never reach the domain range check through driver coercion. */
export function readSqliteParallelsIn(db:Pick<Drizzle,'all'>,workPackageId:string,ids:readonly string[]|null){
  if(ids!==null&&ids.length===0)return[];
  const rows=db.all<StepParallelRecord&{readonly ownerWorkPackage:unknown}>(sql`
    SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.max_parallel AS "maxParallel",
      i.work_package_id AS "ownerWorkPackage"
    FROM step_parallel f LEFT JOIN work_item i ON i.id=f.work_item_id
    WHERE ${selectSparseOwners(workPackageId,ids)}`);
  const facts=rows.map(row=>{
    if(row.ownerWorkPackage!==workPackageId)throw new Error('step parallelism has an invalid work-item reference');
    return readStoredParallel(row);
  });
  return projectSqliteStepFactsIn(db,workPackageId,facts,'parallel');
}
