import type {SubtreeCopy,TransactionalStores} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect} from 'bun:test';

import type {StepCatalogueFixture} from '../step-catalogue-fixture';
import type {StepCatalogueCaseId} from './step-catalogue';

/** Captured caller payload, not a synthesized live step or replacement persistence owner. */
function copyLeaf(row:SubtreeCopy['rows'][number],stepId:string):SubtreeCopy{
  return{
    rows:[row],respaced:[],reparented:[],
    estimates:[{workItemId:row.id,stepId,optimistic:1,realistic:2,pessimistic:3}],
    actuals:[],progress:[],measures:[],assignments:[],demands:[],dependencies:[],
    removedEstimates:[],removedActuals:[],removedProgress:[],removedMeasures:[],
  };
}

async function prepareUnboundRestore(fixture:StepCatalogueFixture){
  const {source,port,seed}=fixture,stepId='subtree-estimate-retained';
  expect(await port.defineAndBindStep(seed.organizationId,{
    id:stepId,code:stepId,name:'Historical Subtree Estimate',position:10,
    defaultEstimateUnit:'minutes',defaultAllowancePercent:12.5,
  },{
    bindingId:'subtree-estimate-binding',scopeKind:'project',scopeId:seed.projectId,
    workItemTypeId:null,position:10,
  },seed.stamp)).toMatchObject({ok:true});
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([stepId]);
  const original=workItemRow({id:'subtree-estimate-leaf',workPackageId:seed.workPackageId,name:'Restored leaf',position:10});
  await source.stores.subtrees.insertSubtree(copyLeaf(original,stepId),seed.stamp);
  expect(fixture.readEvidence().estimates).toEqual([{workItemId:original.id,stepId,optimistic:1,realistic:2,pessimistic:3}]);
  const rows=await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  expect(rows.map(({id})=>id)).toEqual([original.id]);
  const captured=rows.at(0);
  if(captured===undefined)throw new Error('healthy subtree leaf is absent');
  const copy=copyLeaf(captured,stepId);
  const values=fixture.readEvidence().packageValues;
  expect(values).toEqual([{workPackageId:seed.workPackageId,stepId,estimateUnit:'minutes',allowanceBps:1250,allowanceRevision:0}]);
  await source.stores.workItems.remove([original.id],[],seed.stamp);
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
  expect(fixture.readEvidence().estimates).toEqual([]);
  expect(await port.unbindStep(seed.organizationId,'subtree-estimate-binding',{dryRun:false},seed.stamp)).toEqual({kind:'unbound',workPackageIds:[seed.workPackageId],projectIds:[seed.projectId]});
  expect((await port.readCatalogue(seed.organizationId))?.definitions.map(({id})=>id)).toEqual([stepId]);
  expect((await port.readCatalogue(seed.organizationId))?.bindings).toEqual([]);
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps).toEqual([]);
  expect(fixture.readEvidence().packageValues).toEqual(values);
  return{copy,stepId,refusal:{kind:'estimate_refused',workItemId:original.id,stepId,reason:'step_not_resolved'}};
}

/** No estimate full-reader after the tested call: the old SQL bad success would itself make that reader throw. */
async function readRestoreState(stores:TransactionalStores,fixture:StepCatalogueFixture){
  const {seed}=fixture;
  return{
    rows:await stores.workItems.listByWorkPackage(seed.workPackageId),
    workPackage:await stores.workPackages.findById(seed.workPackageId),
    catalogue:await stores.stepCatalogue.readCatalogue(seed.organizationId),
    package:await stores.stepCatalogue.readPackage(seed.organizationId,seed.workPackageId),
    foreign:await stores.stepCatalogue.readCatalogue(seed.foreignOrganizationId),
    foreignPackage:await stores.stepCatalogue.readPackage(seed.foreignOrganizationId,seed.foreignWorkPackageId),
  };
}

/** Real public/borrowed restore payloads; fulfilled void is the current missing modeled-refusal surface. */
export const STEP_SUBTREE_ESTIMATE_ASSERTIONS:readonly{
  readonly caseId:StepCatalogueCaseId;
  assert(fixture:StepCatalogueFixture):Promise<void>;
}[]=[
  {
    caseId:'stepCatalogue.factWrite:subtree-estimate-after-unbind',
    async assert(fixture){
      const prepared=await prepareUnboundRestore(fixture),{source,seed}=fixture;
      const before=fixture.readEvidence(),state=await readRestoreState(source.stores,fixture);
      // Observe the old void boundary as unknown; no cast or invented successful DTO.
      const outcome:unknown=await source.stores.subtrees.insertSubtree(prepared.copy,{...seed.stamp,at:seed.stamp.at+1});
      expect(outcome).toEqual(prepared.refusal);
      expect(fixture.readEvidence()).toEqual(before);
      expect(await readRestoreState(source.stores,fixture)).toEqual(state);
      expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([]);
    },
  },
  {
    caseId:'stepCatalogue.factWrite:borrowed-subtree-refusal-keeps-commit',
    async assert(fixture){
      const prepared=await prepareUnboundRestore(fixture),{source,seed}=fixture;
      const values=fixture.readEvidence().packageValues;
      const survivor=workItemRow({id:'subtree-unrelated-committed-leaf',workPackageId:seed.workPackageId,name:'Unrelated successful write',position:20});
      const committed=await source.uow.run(async({stores})=>{
        await stores.workItems.insert(survivor,[],seed.stamp);
        const before=await readRestoreState(stores,fixture);
        expect(before.rows.map(({id})=>id)).toEqual([survivor.id]);
        const outcome:unknown=await stores.subtrees.insertSubtree(prepared.copy,{...seed.stamp,at:seed.stamp.at+1});
        const after=await readRestoreState(stores,fixture);
        return{commit:true,value:{outcome,before,after}};
      });
      // First refusal oracle is AFTER the explicit outer COMMIT, never an assertion-induced rollback.
      expect(committed.outcome).toEqual(prepared.refusal);
      expect(committed.after).toEqual(committed.before);
      expect(await readRestoreState(source.stores,fixture)).toEqual(committed.before);
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({id})=>id)).toEqual([survivor.id]);
      expect(fixture.readEvidence().estimates).toEqual([]);
      expect(fixture.readEvidence().packageValues).toEqual(values);
      expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([]);
    },
  },
];
