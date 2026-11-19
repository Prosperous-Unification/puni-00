import type {StepFactKind,SubtreeCopy,TransactionalStores} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect} from 'bun:test';

import type {StepCatalogueFixture} from '../step-catalogue-fixture';

type PointFact=Extract<StepFactKind,'actual'|'progress'|'measure'>;
function copyPoint(row:SubtreeCopy['rows'][number],stepId:string,fact:PointFact):SubtreeCopy{
  return{rows:[row],respaced:[],reparented:[],estimates:[],
    actuals:fact==='actual'?[{workItemId:row.id,stepId,days:2.5,recordedAt:111}]:[],
    progress:fact==='progress'?[{workItemId:row.id,stepId,state:'in_progress',statedAt:112}]:[],
    measures:fact==='measure'?[{workItemId:row.id,stepId,metric:'token_actual',value:3,recordedAt:113}]:[],
    assignments:[],demands:[],dependencies:[],removedEstimates:[],removedActuals:[],removedProgress:[],removedMeasures:[]};
}
async function prepareRestore(fixture:StepCatalogueFixture,fact:PointFact){
  const{source,port,seed}=fixture,stepId='point-restore-retained',row=workItemRow({id:'point-restore-leaf',workPackageId:seed.workPackageId,name:'Point restore leaf',position:10});
  expect((await port.defineAndBindStep(seed.organizationId,{id:stepId,code:stepId,name:'Point Restore',position:10,
    defaultEstimateUnit:'workdays',defaultAllowancePercent:0},
    {bindingId:'point-restore-binding',scopeKind:'project',scopeId:seed.projectId,workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  const payload=copyPoint(row,stepId,fact);
  expect(await source.stores.subtrees.insertSubtree(payload,seed.stamp)).toBe('written');
  expect(await source.stores.estimates.readTarget(row.id,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
  if(fact==='actual')expect(await source.stores.actuals.listByWorkPackage(seed.workPackageId)).toEqual([...payload.actuals]);
  else if(fact==='progress')expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual([...payload.progress]);
  else expect(await source.stores.measures.listByWorkPackage(seed.workPackageId)).toEqual([...payload.measures]);
  const captured=(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).at(0);
  if(captured?.id!==row.id)throw new Error('healthy restored point leaf is absent');
  const copy=copyPoint(captured,stepId,fact),values=fixture.readEvidence().packageValues;
  expect(values).toEqual([{workPackageId:seed.workPackageId,stepId,estimateUnit:'workdays',allowanceBps:0,allowanceRevision:0}]);
  await source.stores.workItems.remove([row.id],[],seed.stamp);
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
  expect(fixture.readEvidence().actuals).toEqual([]);
  expect(fixture.readEvidence().progress).toEqual([]);
  expect(fixture.readEvidence().tuples.measures).toEqual([]);
  expect(await port.unbindStep(seed.organizationId,'point-restore-binding',{dryRun:false},seed.stamp)).toEqual({kind:'unbound',workPackageIds:[seed.workPackageId],projectIds:[seed.projectId]});
  expect((await port.readCatalogue(seed.organizationId))?.definitions.map(({id})=>id)).toEqual([stepId]);
  expect((await port.readCatalogue(seed.organizationId))?.bindings).toEqual([]);
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps).toEqual([]);
  expect(fixture.readEvidence().packageValues).toEqual(values);
  return{copy,values,refusal:{kind:'point_refused',fact,workItemId:row.id,stepId,reason:'step_not_resolved'}};
}
async function readState(stores:TransactionalStores,fixture:StepCatalogueFixture){
  const{seed}=fixture;
  return{rows:await stores.workItems.listByWorkPackage(seed.workPackageId),
    workPackage:await stores.workPackages.findById(seed.workPackageId),
    catalogue:await stores.stepCatalogue.readCatalogue(seed.organizationId),
    package:await stores.stepCatalogue.readPackage(seed.organizationId,seed.workPackageId),
    foreign:await stores.stepCatalogue.readCatalogue(seed.foreignOrganizationId),
    foreignPackage:await stores.stepCatalogue.readPackage(seed.foreignOrganizationId,seed.foreignWorkPackageId)};
}
async function assertRestore(fixture:StepCatalogueFixture,fact:PointFact,borrowed:boolean){
  const prepared=await prepareRestore(fixture,fact),{source,seed}=fixture;
  if(!borrowed){
    const before=fixture.readEvidence(),state=await readState(source.stores,fixture);
    const outcome:unknown=await source.stores.subtrees.insertSubtree(prepared.copy,seed.stamp);
    expect(outcome).toEqual(prepared.refusal);
    expect(fixture.readEvidence()).toEqual(before);
    expect(await readState(source.stores,fixture)).toEqual(state);
  }else{
    const survivor=workItemRow({id:'point-restore-unrelated-survivor',workPackageId:seed.workPackageId,name:'Unrelated successful write',position:20});
    const committed=await source.uow.run(async({stores})=>{
      await stores.workItems.insert(survivor,[],seed.stamp);
      const before=await readState(stores,fixture);
      expect(before.rows.map(({id})=>id)).toEqual([survivor.id]);
      const outcome:unknown=await stores.subtrees.insertSubtree(prepared.copy,seed.stamp);
      const after=await readState(stores,fixture);
      return{commit:true,value:{outcome,before,after}};
    });
    // The first modeled-refusal oracle follows the actual unrelated outer COMMIT.
    expect(committed.outcome).toEqual(prepared.refusal);
    expect(committed.after).toEqual(committed.before);
    expect(await readState(source.stores,fixture)).toEqual(committed.before);
    expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({id})=>id)).toEqual([survivor.id]);
  }
  expect(fixture.readEvidence().actuals).toEqual([]);
  expect(fixture.readEvidence().progress).toEqual([]);
  expect(fixture.readEvidence().tuples.measures).toEqual([]);
  expect(fixture.readEvidence().packageValues).toEqual(prepared.values);
}
/** Actual restore payloads retain historical points but must revalidate current leaf applicability. */
export const STEP_POINT_SUBTREE_ASSERTIONS=[
  {caseId:'stepCatalogue.factWrite:subtree-actual-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'actual',false)},
  {caseId:'stepCatalogue.factWrite:borrowed-subtree-actual-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'actual',true)},
  {caseId:'stepCatalogue.factWrite:subtree-progress-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'progress',false)},
  {caseId:'stepCatalogue.factWrite:borrowed-subtree-progress-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'progress',true)},
  {caseId:'stepCatalogue.factWrite:subtree-measure-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'measure',false)},
  {caseId:'stepCatalogue.factWrite:borrowed-subtree-measure-refusal',assert:(fixture:StepCatalogueFixture)=>assertRestore(fixture,'measure',true)},
] as const;
