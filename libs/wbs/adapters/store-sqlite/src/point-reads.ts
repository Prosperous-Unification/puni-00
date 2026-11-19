import {readStoredActual,readStoredProgress,type StepActualRecord,type StepProgressRecord} from '@wbs/core';
import {sql} from 'drizzle-orm';

import type {Drizzle} from './db';
import {projectSqliteStepFactsIn} from './estimate-reads';

/** All selected actual columns and semantic metadata are captured on one supplied synchronous reader/writer snapshot. */
export function readSqliteActualsIn(db:Pick<Drizzle,'all'>,workPackageId:string,ids:readonly string[]|null){
  if(ids!==null&&ids.length===0)return[];
  const selected=ids===null?sql`i.work_package_id=${workPackageId}`:sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const facts=db.all<StepActualRecord>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.days,f.recorded_at AS "recordedAt" FROM actual f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE ${selected}`).map(readStoredActual);
  return projectSqliteStepFactsIn(db,workPackageId,facts,'actual');
}

/** Non-STRICT SQLite values are decoded before the same SC18 leaf projection used by estimates and actuals. */
export function readSqliteProgressIn(db:Pick<Drizzle,'all'>,workPackageId:string,ids:readonly string[]|null){
  if(ids!==null&&ids.length===0)return[];
  const selected=ids===null?sql`i.work_package_id=${workPackageId}`:sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const facts=db.all<StepProgressRecord>(sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",f.state,f.stated_at AS "statedAt" FROM step_progress f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE ${selected}`).map(readStoredProgress);
  return projectSqliteStepFactsIn(db,workPackageId,facts,'progress');
}
