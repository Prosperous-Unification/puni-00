import type {StoredActual,StoredProgress,TransactionalStores,ValueGroupPlacement} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect} from 'bun:test';

import type {StepCatalogueFixture} from '../step-catalogue-fixture';
import type {StepCatalogueCaseId} from './step-catalogue';

type Family='actual'|'progress';
type Attempt<Value>={readonly ok:true;readonly value:Value}|{readonly ok:false;readonly cause:unknown};
async function capture<Value>(read:()=>Value|Promise<Value>):Promise<Attempt<Value>>{
  try{return{ok:true,value:await read()};}catch(cause:unknown){return{ok:false,cause};}
}

async function preparePoints(fixture:StepCatalogueFixture,family:Family){
  const {source,port,seed}=fixture;
  const firstId='z-'+family+'-first',secondId='a-'+family+'-second';
  for(const authored of [
    {id:firstId,scopeKind:'organization' as const,scopeId:seed.organizationId,position:50},
    {id:secondId,scopeKind:'project' as const,scopeId:seed.projectId,position:5},
  ]){
    expect((await port.defineAndBindStep(seed.organizationId,{
      id:authored.id,code:authored.id,name:authored.id,position:authored.position,
      defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
    },{
      bindingId:authored.id+':binding',scopeKind:authored.scopeKind,scopeId:authored.scopeId,
      workItemTypeId:null,position:authored.position,
    },seed.stamp)).ok).toBe(true);
  }
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([firstId,secondId]);
  const firstLeaf=family+'-first-leaf',otherLeaf=family+'-other-leaf',siblingLeaf=family+'-sibling-leaf';
  for(const [id,workPackageId,position]of [[firstLeaf,seed.workPackageId,10],[otherLeaf,seed.workPackageId,20],[siblingLeaf,seed.siblingWorkPackageId,10]]as const){
    await source.stores.workItems.insert(workItemRow({id,workPackageId,name:id,position}),[],seed.stamp);
  }
  const actuals:readonly StoredActual[]=[
    {workItemId:firstLeaf,stepId:firstId,days:1.25,recordedAt:101},
    {workItemId:firstLeaf,stepId:secondId,days:2.5,recordedAt:102},
    {workItemId:otherLeaf,stepId:firstId,days:3.75,recordedAt:103},
    {workItemId:siblingLeaf,stepId:firstId,days:4.5,recordedAt:104},
  ];
  const progress:readonly StoredProgress[]=[
    {workItemId:firstLeaf,stepId:firstId,state:'in_progress',statedAt:201},
    {workItemId:firstLeaf,stepId:secondId,state:'done',statedAt:202},
    {workItemId:otherLeaf,stepId:firstId,state:'done',statedAt:203},
    {workItemId:siblingLeaf,stepId:firstId,state:'in_progress',statedAt:204},
  ];
  // Reverse key/position order is deliberate. The arrays are independent literal oracles.
  if(family==='actual'){
    const [first,second,other,sibling]=actuals;
    if(first===undefined||second===undefined||other===undefined||sibling===undefined)throw new Error('actual fixture literals are incomplete');
    for(const fact of [second,other,sibling,first])expect(await source.stores.actuals.set(fact,seed.stamp)).toBe('written');
    expect(fixture.readEvidence().actuals).toEqual([second,first,other,sibling]);
    return{firstLeaf,otherLeaf,siblingLeaf,firstId,first,expected:[first,second,other],targeted:[first,second]};
  }
  const [first,second,other,sibling]=progress;
  if(first===undefined||second===undefined||other===undefined||sibling===undefined)throw new Error('progress fixture literals are incomplete');
  for(const fact of [second,other,sibling,first])expect(await source.stores.progress.set(fact,seed.stamp)).toBe('written');
  expect(fixture.readEvidence().progress).toEqual([second,first,other,sibling]);
  return{firstLeaf,otherLeaf,siblingLeaf,firstId,first,expected:[first,second,other],targeted:[first,second]};
}

interface PointReads{
  listByWorkPackage(workPackageId:string):Promise<readonly(StoredActual|StoredProgress)[]>;
  listByWorkItems(workPackageId:string,ids:readonly string[]):Promise<readonly(StoredActual|StoredProgress)[]>;
  listPlacements(workPackageId:string,ids:readonly string[]):Promise<readonly ValueGroupPlacement[]>;
}
function readPort(fixture:StepCatalogueFixture,family:Family):PointReads{
  return family==='actual'?fixture.source.stores.actuals:fixture.source.stores.progress;
}

/** Ordinary ordering/selection plus real fixture-owned storage corruption; no writer/refusal contract is fabricated. */
export const STEP_POINT_READER_ASSERTIONS:readonly{
  readonly caseId:StepCatalogueCaseId;
  assert(fixture:StepCatalogueFixture):Promise<void>;
}[]=readerAssertions();

function readerAssertions():readonly{readonly caseId:StepCatalogueCaseId;assert(fixture:StepCatalogueFixture):Promise<void>}[]{
  const families:readonly Family[]=['actual','progress'];
  return families.flatMap<{readonly caseId:StepCatalogueCaseId;assert(fixture:StepCatalogueFixture):Promise<void>}>(family=>[
  {
    caseId:family==='actual'?'stepCatalogue.factRead:actual-current-order':'stepCatalogue.factRead:progress-current-order',
    async assert(fixture:StepCatalogueFixture){
      const prepared=await preparePoints(fixture,family),before=fixture.readEvidence();
      expect(await readPort(fixture,family).listByWorkPackage(fixture.seed.workPackageId)).toEqual(prepared.expected);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId:family==='actual'?'stepCatalogue.factRead:actual-targeted-order':'stepCatalogue.factRead:progress-targeted-order',
    async assert(fixture:StepCatalogueFixture){
      const prepared=await preparePoints(fixture,family),before=fixture.readEvidence(),port=readPort(fixture,family),{seed}=fixture;
      expect(await port.listByWorkItems(seed.workPackageId,[prepared.firstLeaf,'absent-leaf',prepared.siblingLeaf,prepared.firstLeaf])).toEqual(prepared.targeted);
      expect(await port.listByWorkItems(seed.siblingWorkPackageId,[prepared.firstLeaf])).toEqual([]);
      expect(await port.listByWorkItems(seed.workPackageId,[])).toEqual([]);
      expect(await port.listPlacements(seed.workPackageId,[prepared.otherLeaf,prepared.otherLeaf,'absent-leaf',prepared.siblingLeaf])).toEqual([{id:prepared.otherLeaf,afterId:prepared.firstLeaf}]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId:family==='actual'?'stepCatalogue.factRead:actual-malformed-value':'stepCatalogue.factRead:progress-malformed-time',
    async assert(fixture:StepCatalogueFixture){
      const prepared=await preparePoints(fixture,family),port=readPort(fixture,family),{seed}=fixture;
      expect(await port.listByWorkPackage(seed.workPackageId)).toEqual(prepared.expected);
      expect(await port.listByWorkItems(seed.workPackageId,[prepared.firstLeaf])).toEqual(prepared.targeted);
      const healthy=fixture.readEvidence();
      const restore=fixture.corruptStepFact(family==='actual'
        ?{kind:'actual_days',workItemId:prepared.firstLeaf,stepId:prepared.firstId,value:-1}
        :{kind:'progress_time',workItemId:prepared.firstLeaf,stepId:prepared.firstId,value:'unreadable-stated-time'});
      const execution=await capture(async()=>{
        const corrupt=fixture.readEvidence();
        if(family==='actual')expect<unknown>(corrupt.actuals.find(row=>row.workItemId===prepared.firstLeaf&&row.stepId===prepared.firstId)).toEqual({...prepared.first,days:-1});
        else expect<unknown>(corrupt.progress.find(row=>row.workItemId===prepared.firstLeaf&&row.stepId===prepared.firstId)).toEqual({...prepared.first,statedAt:'unreadable-stated-time'});
        const full=await capture(()=>port.listByWorkPackage(seed.workPackageId));
        const targeted=await capture(()=>port.listByWorkItems(seed.workPackageId,[prepared.firstLeaf]));
        // Both actual calls settle before the first refusal oracle or restoration.
        expect(full.ok).toBe(false);expect(targeted.ok).toBe(false);
        if(full.ok||targeted.ok)throw new Error('corrupt point reader resolved');
        expect(full.cause).toBeInstanceOf(Error);expect(targeted.cause).toBeInstanceOf(Error);
        expect(fixture.readEvidence()).toEqual(corrupt);
      });
      const restored=await capture(restore);
      if(!execution.ok&&!restored.ok)throw new AggregateError([execution.cause,restored.cause],'point reader test and corruption restoration failed',{cause:restored.cause});
      if(!execution.ok)throw execution.cause;
      if(!restored.ok)throw restored.cause;
      expect(fixture.readEvidence()).toEqual(healthy);
    },
  },
  {
    caseId:family==='actual'?'stepCatalogue.factRead:actual-unresolved-type':'stepCatalogue.factRead:progress-unresolved-type',
    async assert(fixture:StepCatalogueFixture){
      const prepared=await preparePoints(fixture,family),port=readPort(fixture,family),{seed}=fixture;
      expect(await port.listByWorkPackage(seed.workPackageId)).toEqual(prepared.expected);
      expect(await port.listByWorkItems(seed.workPackageId,[prepared.firstLeaf])).toEqual(prepared.targeted);
      const typedId=family+'-typed-only';
      expect((await fixture.port.defineAndBindStep(seed.organizationId,{id:typedId,code:typedId,name:typedId,position:30,defaultEstimateUnit:'workdays',defaultAllowancePercent:0},{bindingId:typedId+':binding',scopeKind:'project',scopeId:seed.projectId,workItemTypeId:seed.typeId,position:30},seed.stamp)).ok).toBe(true);
      expect((await fixture.port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([prepared.firstId,'a-'+family+'-second',typedId]);
      const leaf=(await fixture.source.stores.workItems.listByWorkPackage(seed.workPackageId)).find(row=>row.id===prepared.firstLeaf);
      expect(leaf?.typeIds).toEqual([]);
      const healthy=fixture.readEvidence();
      const restore=fixture.corruptStepFact(family==='actual'
        ?{kind:'actual_step',workItemId:prepared.firstLeaf,stepId:prepared.firstId,value:typedId}
        :{kind:'progress_step',workItemId:prepared.firstLeaf,stepId:prepared.firstId,value:typedId});
      const execution=await capture(async()=>{
        const corrupt=fixture.readEvidence();
        const raw=family==='actual'?corrupt.actuals:corrupt.progress;
        expect(raw.find(row=>row.workItemId===prepared.firstLeaf&&row.stepId===typedId)).toEqual({...prepared.first,stepId:typedId});
        const full=await capture(()=>port.listByWorkPackage(seed.workPackageId));
        const targeted=await capture(()=>port.listByWorkItems(seed.workPackageId,[prepared.firstLeaf]));
        expect(full.ok).toBe(false);expect(targeted.ok).toBe(false);
        if(full.ok||targeted.ok)throw new Error('unresolved typed point reader resolved');
        expect(full.cause).toBeInstanceOf(Error);expect(targeted.cause).toBeInstanceOf(Error);
        expect(fixture.readEvidence()).toEqual(corrupt);
      });
      const restored=await capture(restore);
      if(!execution.ok&&!restored.ok)throw new AggregateError([execution.cause,restored.cause],'typed point reader test and restoration failed',{cause:restored.cause});
      if(!execution.ok)throw execution.cause;
      if(!restored.ok)throw restored.cause;
      expect(fixture.readEvidence()).toEqual(healthy);
    },
  },
]);
}
