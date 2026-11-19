import {projectStoredStepFacts,readCatalogueId,readPackageStepValues,readStepIdentity,readStepUsagePackages,readStoredEstimate,type PackageStepRecord,type PackageStepValues,type StepEstimateRecord,type StepIdentity,type StepUsageTypeRecord,type StepUsageWorkItemRecord,type StepFactAddress,type StepFactKind} from '@wbs/core';
import {sql} from 'drizzle-orm';

import type {Drizzle} from './db';
import {readSettingTargetIn} from './settings';
import {captureCatalogueBindingsIn} from './step-catalogue';

/** One supplied read/writer snapshot; every query is synchronous and no legacy step table is consulted. */
export function readSqliteEstimatesIn(db:Pick<Drizzle,'all'>,workPackageId:string,ids:readonly string[]|null){
  if(ids!==null&&ids.length===0)return [];
  const selected=ids===null?sql`i.work_package_id=${workPackageId}`:sql`f.work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (i.work_package_id=${workPackageId} OR i.id IS NULL)`;
  const estimates=db.all<StepEstimateRecord>(sql`SELECT f.work_item_id AS "workItemId", f.step_id AS "stepId", f.optimistic, f.realistic, f.pessimistic FROM estimate f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE ${selected}`).map(readStoredEstimate);
  return projectSqliteStepFactsIn(db,workPackageId,estimates,'estimate');
}

/** The caller supplies already-decoded facts from this exact synchronous SQLite snapshot. */
export function projectSqliteStepFactsIn<Fact extends StepFactAddress>(db:Pick<Drizzle,'all'>,workPackageId:string,facts:readonly Fact[],family:StepFactKind):Fact[]{
  if(facts.length===0)return[];
  const {captured,bindings,identities,values}=captureSqliteStepFactContextIn(db,workPackageId,facts,family);
  // Proof: S02 erased all captured binding type requirements at this handoff; the
  // actual retained blockage read resolved after its binding's type changed. This
  // proves the dependency as a whole; selected baseline/after passed1 each.
  return projectStoredStepFacts(captured,bindings,identities,values,facts,family);
}

/** Captures current metadata once on the supplied snapshot, for point facts or explicitly typed allocator history. */
export function captureSqliteStepFactContextIn(db:Pick<Drizzle,'all'>,workPackageId:string,facts:readonly StepFactAddress[],family:StepFactKind){
  const target=readSettingTargetIn(db,{level:'work_package',id:workPackageId},null);
  if(target===null)throw new Error(`stored ${family} package is absent`);
  const chain=target.chain;
  const rows=db.all<StepUsageWorkItemRecord>(sql`SELECT id,work_package_id AS "workPackageId",parent_id AS "parentId",name,position FROM work_item WHERE work_package_id=${workPackageId}`);
  const memberships=db.all<StepUsageTypeRecord>(sql`SELECT m.work_item_id AS "workItemId",m.type_id AS "typeId",t.id AS "actualTypeId",tm.organization_id AS "organizationId",o.id AS "actualOrganizationId" FROM work_item_work_item_type m INNER JOIN work_item i ON i.id=m.work_item_id LEFT JOIN work_item_type t ON t.id=m.type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=m.type_id LEFT JOIN organization o ON o.id=tm.organization_id WHERE i.work_package_id=${workPackageId}`);
  const captured=readStepUsagePackages([chain],rows,memberships).at(0);
  if(captured===undefined)throw new Error(`stored ${family} package capture is absent`);
  const {bindings,identities:reached}=captureCatalogueBindingsIn(db,chain.organizationId,chain);
  const identities=new Map<string,StepIdentity>(reached);
  const stepIds=JSON.stringify([...new Set(facts.map(({stepId})=>stepId))]);
  for(const raw of db.all<{id:unknown;organizationId:unknown;actualOrganizationId:unknown;code:unknown;name:unknown}>(sql`SELECT d.id,d.organization_id AS "organizationId",o.id AS "actualOrganizationId",d.code,d.name FROM step_definition d LEFT JOIN organization o ON o.id=d.organization_id WHERE d.id IN (SELECT value FROM json_each(${stepIds}))`)){
    const owner=readCatalogueId(raw.organizationId,`${family} definition organization`);
    if(raw.actualOrganizationId!==owner||owner!==chain.organizationId)throw new Error(`stored ${family} definition is absent or foreign`);
    const identity=readStepIdentity(raw);identities.set(identity.id,identity);
  }
  const values=new Map<string,PackageStepValues>();
  for(const raw of db.all<PackageStepRecord>(sql`SELECT work_package_id AS "workPackageId",step_id AS "stepId",estimate_unit AS "estimateUnit",allowance_bps AS "allowanceBps",allowance_revision AS "allowanceRevision" FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id IN (SELECT value FROM json_each(${stepIds}))`)){
    const stepId=readCatalogueId(raw.stepId,`${family} package step`);values.set(stepId,readPackageStepValues(raw,workPackageId,stepId));
  }
  return{captured,bindings,identities,values};
}
