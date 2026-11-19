import type {StepWriteOutcome,TransactionalStores} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect} from 'bun:test';

import type {StepCatalogueFixture} from '../step-catalogue-fixture';

type PointFamily='actuals'|'progress'|'measures';
type RefusalPath='unknown'|'untyped'|'conflict'|'parent';
const LEAF='current-point-write-leaf',STEP='current-point-write-step';

function writePoint(stores:TransactionalStores,family:PointFamily,workItemId:string,stepId:string,stamp:StepCatalogueFixture['seed']['stamp']):Promise<StepWriteOutcome>{
  switch(family){
    case 'actuals':return stores.actuals.set({workItemId,stepId,days:2.5,recordedAt:111},stamp);
    case 'progress':return stores.progress.set({workItemId,stepId,state:'in_progress',statedAt:112},stamp);
    case 'measures':return stores.measures.set({workItemId,stepId,metric:'token_actual',value:3,recordedAt:113},stamp);
  }
}

async function preparePoint(fixture:StepCatalogueFixture,family:PointFamily){
  const {port,source,seed}=fixture;
  expect((await port.defineAndBindStep(seed.organizationId,{
    id:STEP,code:STEP,name:'Current Point Write',position:10,
    defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
  },{bindingId:'current-point-write-binding',scopeKind:'project',scopeId:seed.projectId,
    workItemTypeId:seed.typeId,position:10},seed.stamp)).ok).toBe(true);
  await source.stores.workItems.insert(workItemRow({id:LEAF,workPackageId:seed.workPackageId,name:'Current Point Leaf'}),[],seed.stamp);
  expect(await source.stores.workItems.patch(LEAF,{typeIds:[seed.typeId]},seed.stamp)).toMatchObject({ok:true});
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([STEP]);
  expect(await source.stores.estimates.readTarget(LEAF,STEP)).toMatchObject({kind:'resolved',step:{stepId:STEP}});
  expect(await writePoint(source.stores,family,LEAF,STEP,seed.stamp)).toBe('written');
  switch(family){
    case 'actuals':
      expect(await source.stores.actuals.listByWorkPackage(seed.workPackageId)).toEqual([{workItemId:LEAF,stepId:STEP,days:2.5,recordedAt:111}]);
      expect(fixture.readEvidence().actuals).toEqual([{workItemId:LEAF,stepId:STEP,days:2.5,recordedAt:111}]);
      await source.stores.actuals.remove(LEAF,STEP,seed.stamp);
      expect(fixture.readEvidence().actuals).toEqual([]);break;
    case 'progress':
      expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual([{workItemId:LEAF,stepId:STEP,state:'in_progress',statedAt:112}]);
      expect(fixture.readEvidence().progress).toEqual([{workItemId:LEAF,stepId:STEP,state:'in_progress',statedAt:112}]);
      await source.stores.progress.remove(LEAF,STEP,seed.stamp);
      expect(fixture.readEvidence().progress).toEqual([]);break;
    case 'measures':
      expect(await source.stores.measures.listByWorkPackage(seed.workPackageId)).toEqual([{workItemId:LEAF,stepId:STEP,metric:'token_actual',value:3,recordedAt:113}]);
      expect(fixture.readEvidence().tuples.measures).toEqual([{workItemId:LEAF,stepId:STEP,metric:'token_actual',value:3,recordedAt:113,currency:null,rateCardDigest:null}]);
      await source.stores.measures.remove(LEAF,STEP,'token_actual',seed.stamp);
      expect(fixture.readEvidence().tuples.measures).toEqual([]);break;
  }
}

async function assertPointRefusal(fixture:StepCatalogueFixture,family:PointFamily,path:RefusalPath){
  await preparePoint(fixture,family);
  const {source,seed}=fixture;
  if(path==='untyped'){
    expect(await source.stores.workItems.patch(LEAF,{typeIds:[]},seed.stamp)).toMatchObject({ok:true});
    expect(await source.stores.estimates.readTarget(LEAF,STEP)).toEqual({kind:'step_not_resolved'});
  }else if(path==='conflict'){
    expect(await source.stores.workItems.patch(LEAF,{typeIds:[seed.typeId,seed.secondTypeId]},seed.stamp)).toMatchObject({ok:true});
    expect(await source.stores.estimates.readTarget(LEAF,STEP)).toEqual({kind:'type_conflict'});
  }else if(path==='parent'){
    await source.stores.workItems.insert(workItemRow({id:'current-point-write-child',workPackageId:seed.workPackageId,parentId:LEAF,name:'Current Point Child'}),[],seed.stamp);
    expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).find(({id})=>id==='current-point-write-child')?.parentId).toBe(LEAF);
  }else{
    expect((await fixture.port.readCatalogue(seed.organizationId))?.definitions.map(({id})=>id)).not.toContain('absent-current-point-step');
  }
  const before=fixture.readEvidence();
  if(path==='parent'){
    let settled:{ok:true;outcome:StepWriteOutcome}|{ok:false;cause:unknown};
    try{settled={ok:true,outcome:await writePoint(source.stores,family,LEAF,STEP,seed.stamp)};}
    catch(cause:unknown){settled={ok:false,cause};}
    expect(settled.ok).toBe(false);
    if(settled.ok)throw new Error('parent point write unexpectedly resolved');
    expect(settled.cause).toBeInstanceOf(Error);
    expect(String(settled.cause)).toContain('step write requires a leaf work item');
  }else{
    const outcome=await writePoint(source.stores,family,LEAF,path==='unknown'?'absent-current-point-step':STEP,seed.stamp);
    expect(outcome).toBe(path==='unknown'?'unknown_step':path==='conflict'?'type_conflict':'step_not_resolved');
  }
  // Actual physical evidence includes own/foreign rows, all catalogue values,
  // work-item revisions and history; strict fact readers never mask a bad write.
  expect(fixture.readEvidence()).toEqual(before);
}

/** Current Source writer admission is observed before any postwrite strict reader. */
export const STEP_POINT_WRITER_ASSERTIONS=[
  {caseId:'stepCatalogue.pointWrite:actual-unknown',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'actuals','unknown')},
  {caseId:'stepCatalogue.pointWrite:actual-untyped',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'actuals','untyped')},
  {caseId:'stepCatalogue.pointWrite:actual-conflict',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'actuals','conflict')},
  {caseId:'stepCatalogue.pointWrite:actual-parent',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'actuals','parent')},
  {caseId:'stepCatalogue.pointWrite:progress-unknown',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'progress','unknown')},
  {caseId:'stepCatalogue.pointWrite:progress-untyped',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'progress','untyped')},
  {caseId:'stepCatalogue.pointWrite:progress-conflict',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'progress','conflict')},
  {caseId:'stepCatalogue.pointWrite:progress-parent',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'progress','parent')},
  {caseId:'stepCatalogue.pointWrite:measure-unknown',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'measures','unknown')},
  {caseId:'stepCatalogue.pointWrite:measure-untyped',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'measures','untyped')},
  {caseId:'stepCatalogue.pointWrite:measure-conflict',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'measures','conflict')},
  {caseId:'stepCatalogue.pointWrite:measure-parent',assert:(fixture:StepCatalogueFixture)=>assertPointRefusal(fixture,'measures','parent')},
] as const;
