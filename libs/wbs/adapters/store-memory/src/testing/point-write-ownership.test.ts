import {stepCatalogueFixtureFromSource} from '@wbs/conformance';
import type {StepWriteOutcome,StoredActual,StoredProgress,StoredMeasure,TransactionalStores,WriteStamp} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect,test} from 'bun:test';

import {openMemoryStepCatalogueCase} from './step-catalogue-fixture';

type Mutable<Value>={-readonly[Key in keyof Value]:Value[Key]};
type PointRequest=
  |{kind:'actual';value:Mutable<StoredActual>}
  |{kind:'progress';value:Mutable<StoredProgress>}
  |{kind:'measure';value:Mutable<StoredMeasure>};
type PointStores=Pick<TransactionalStores,'actuals'|'progress'|'measures'>;
type Settlement<Value>={ok:true;value:Value}|{ok:false;cause:unknown};

/** Calls the actual operation before its first await, while retaining every rejection for the owner to settle. */
async function settle<Value>(operation:()=>Promise<Value>):Promise<Settlement<Value>>{
  try{return{ok:true,value:await operation()};}catch(cause:unknown){return{ok:false,cause};}
}

const openFixture=()=>openMemoryStepCatalogueCase('point-write-ownership',stepCatalogueFixtureFromSource);
type Fixture=Awaited<ReturnType<typeof openFixture>>;
async function withinFixture(act:(fixture:Fixture)=>Promise<void>):Promise<void>{
  const fixture=await openFixture();
  const execution=await settle(()=>act(fixture));
  const closing=await settle(fixture.close);
  if(!execution.ok&&!closing.ok)throw new AggregateError([execution.cause,closing.cause],'memory point owner and Source close failed',{cause:closing.cause});
  if(!execution.ok)throw execution.cause;
  if(!closing.ok)throw closing.cause;
}

function point(kind:PointRequest['kind'],alternate:boolean):PointRequest{
  const workItemId=alternate?'point-owner-alternate':'point-owner-original';
  const stepId=alternate?'point-step-alternate':'point-step-original';
  switch(kind){
    case'actual':return{kind,value:{workItemId,stepId,days:alternate?8:2,recordedAt:alternate?208:102}};
    case'progress':return{kind,value:{workItemId,stepId,state:alternate?'done':'in_progress',statedAt:alternate?209:103}};
    case'measure':return{kind,value:{workItemId,stepId,metric:alternate?'hours_actual':'token_actual',value:alternate?9:3,recordedAt:alternate?210:104}};
  }
}

/** No async wrapper precedes dispatch to the actual store. */
function write(stores:PointStores,request:PointRequest,stamp:WriteStamp):Promise<StepWriteOutcome>{
  switch(request.kind){
    case'actual':return stores.actuals.set(request.value,stamp);
    case'progress':return stores.progress.set(request.value,stamp);
    case'measure':return stores.measures.set(request.value,stamp);
  }
}
function remove(stores:PointStores,request:PointRequest,stamp:WriteStamp):Promise<void>{
  switch(request.kind){
    case'actual':return stores.actuals.remove(request.value.workItemId,request.value.stepId,stamp);
    case'progress':return stores.progress.remove(request.value.workItemId,request.value.stepId,stamp);
    case'measure':return stores.measures.remove(request.value.workItemId,request.value.stepId,request.value.metric,stamp);
  }
}
function read(stores:PointStores,kind:PointRequest['kind'],workPackageId:string):Promise<unknown>{
  switch(kind){
    case'actual':return stores.actuals.listByWorkPackage(workPackageId);
    case'progress':return stores.progress.listByWorkPackage(workPackageId);
    case'measure':return stores.measures.listByWorkPackage(workPackageId);
  }
}
function assertRaw(fixture:Fixture,request:PointRequest){
  const evidence=fixture.readEvidence();
  switch(request.kind){
    case'actual':expect(evidence.actuals).toEqual([request.value]);break;
    case'progress':expect(evidence.progress).toEqual([request.value]);break;
    case'measure':expect(evidence.tuples.measures).toEqual([{...request.value,currency:null,rateCardDigest:null}]);break;
  }
}
async function expectClosed(operation:()=>Promise<StepWriteOutcome>):Promise<void>{
  const outcome=await settle(operation);
  expect(outcome.ok).toBe(false);
  if(outcome.ok)throw new Error('expired point setter resolved '+outcome.value);
  expect(String(outcome.cause)).toMatch(/closed/);
}

async function prepare(fixture:Fixture,kind:PointRequest['kind']){
  const{source,port,seed}=fixture;
  for(const[index,suffix]of ['original','alternate'].entries()){
    const stepId='point-step-'+suffix;
    expect((await port.defineAndBindStep(seed.organizationId,{
      id:stepId,code:stepId,name:'Owned point '+suffix,position:index+1,
      defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
    },{bindingId:'point-binding-'+suffix,scopeKind:'project',scopeId:seed.projectId,workItemTypeId:null,position:index+1},seed.stamp)).ok).toBe(true);
    await source.stores.workItems.insert(workItemRow({id:'point-owner-'+suffix,workPackageId:seed.workPackageId,name:suffix,position:(index+1)*10}),[],seed.stamp);
    expect(await source.stores.estimates.readTarget('point-owner-'+suffix,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
  }
  expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({id})=>id).sort()).toEqual(['point-owner-alternate','point-owner-original']);
  const original=point(kind,false),alternate=point(kind,true);
  const empty=fixture.readEvidence();
  expect(await write(source.stores,original,seed.stamp)).toBe('written');
  expect(await read(source.stores,kind,seed.workPackageId)).toEqual([original.value]);
  assertRaw(fixture,original);
  const written=fixture.readEvidence();
  await remove(source.stores,original,seed.stamp);
  expect(fixture.readEvidence()).toEqual(empty);
  expect(await write(source.stores,alternate,seed.stamp)).toBe('written');
  expect(await read(source.stores,kind,seed.workPackageId)).toEqual([alternate.value]);
  assertRaw(fixture,alternate);
  await remove(source.stores,alternate,seed.stamp);
  expect(fixture.readEvidence()).toEqual(empty);
  return{original,alternate,empty,written};
}

for(const kind of ['actual','progress','measure'] as const){
  test('actual memory '+kind+' setter retains its request before the Source queue',async()=>{
    await withinFixture(async(fixture)=>{
      const prepared=await prepare(fixture,kind),{source,seed}=fixture;
      const request=structuredClone(prepared.original);
      const stamp={...seed.stamp};
      const dispatch:{pending:Promise<Settlement<StepWriteOutcome>>|undefined;started:boolean}={pending:undefined,started:false};
      const held=await settle(()=>source.uow.run(()=>{
        // This actual public set is invoked while the real UoW owns the coordinator.
        dispatch.pending=settle(()=>{dispatch.started=true;return write(source.stores,request,stamp);});
        Object.assign(request.value,prepared.alternate.value);
        stamp.at+=100;
        return Promise.resolve({commit:false,value:'held point owner released'});
      }));
      const pending=dispatch.pending;
      if(pending===undefined){if(!held.ok)throw held.cause;throw new Error('actual point set was not dispatched');}
      const queued=await pending;
      if(!held.ok&&!queued.ok)throw new AggregateError([held.cause,queued.cause],'point hold and queued setter failed',{cause:queued.cause});
      if(!held.ok)throw held.cause;
      if(!queued.ok)throw queued.cause;
      expect(dispatch.started).toBe(true);
      expect(held.value).toBe('held point owner released');
      expect(request).toEqual(prepared.alternate);
      expect(queued.value).toBe('written');
      // Independent healthy writes proved both destinations. The first feature
      // oracle detects caller mutation without requiring an invalid target.
      assertRaw(fixture,prepared.original);
      expect(fixture.readEvidence()).toEqual(prepared.written);
      expect(await read(source.stores,kind,seed.workPackageId)).toEqual([prepared.original.value]);
    });
  },30000);

  test('actual memory '+kind+' setter refuses an expired committed loan and cannot revive',async()=>{
    await withinFixture(async(fixture)=>{
      const prepared=await prepare(fixture,kind),{source,seed}=fixture;
      const retained=await source.uow.run(async({stores})=>{
        expect(await write(stores,prepared.original,seed.stamp)).toBe('written');
        expect(await read(stores,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        await remove(stores,prepared.original,seed.stamp);
        await stores.workItems.insert(workItemRow({id:'point-owner-committed',workPackageId:seed.workPackageId,name:'Committed independently',position:30}),[],seed.stamp);
        return{commit:true,value:stores};
      });
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({id})=>id).sort()).toEqual(['point-owner-alternate','point-owner-committed','point-owner-original']);
      const committed=fixture.readEvidence();
      await expectClosed(()=>write(retained,prepared.original,seed.stamp));
      expect(fixture.readEvidence()).toEqual(committed);
      await source.uow.run(async({stores})=>{
        expect(await write(stores,prepared.original,seed.stamp)).toBe('written');
        expect(await read(stores,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        await expectClosed(()=>write(retained,prepared.alternate,seed.stamp));
        expect(await read(stores,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        await remove(stores,prepared.original,seed.stamp);
        return{commit:true,value:undefined};
      });
      expect(fixture.readEvidence()).toEqual(committed);
    });
  },30000);

  test('actual memory '+kind+' setter refuses its closed Source',async()=>{
    await withinFixture(async(fixture)=>{
      const prepared=await prepare(fixture,kind),{source,seed}=fixture;
      const retained=source.stores;
      expect(fixture.readEvidence()).toEqual(prepared.empty);
      const detached=await read(retained,kind,seed.workPackageId);
      expect(detached).toEqual([]);
      await fixture.close();
      await expectClosed(()=>write(retained,prepared.original,seed.stamp));
      expect(detached).toEqual([]);
      // No post-close database or fixture state access is used as fake evidence.
    });
  },30000);
}

for(const kind of ['actual','progress','measure'] as const){
  test('actual memory '+kind+' setter refuses an expired repair loan and cannot revive',async()=>{
    await withinFixture(async(fixture)=>{
      const prepared=await prepare(fixture,kind),{source,seed}=fixture;
      const captured:{stores:PointStores|undefined}={stores:undefined};
      const rolledBack=await source.uow.run(async({stores})=>{
        expect(await write(stores,prepared.original,seed.stamp)).toBe('written');
        expect(await read(stores,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        return{commit:false,value:'original turn rolled back',afterRollback:async({stores:repair})=>{
          expect(await read(repair,kind,seed.workPackageId)).toEqual([]);
          expect(await write(repair,prepared.original,seed.stamp)).toBe('written');
          expect(await read(repair,kind,seed.workPackageId)).toEqual([prepared.original.value]);
          await remove(repair,prepared.original,seed.stamp);
          await repair.workItems.insert(workItemRow({id:'point-owner-repaired',workPackageId:seed.workPackageId,name:'Repair persisted independently',position:30}),[],seed.stamp);
          captured.stores=repair;
        }};
      });
      expect(rolledBack).toBe('original turn rolled back');
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({id})=>id).sort()).toEqual(['point-owner-alternate','point-owner-original','point-owner-repaired']);
      const expired=captured.stores;
      if(expired===undefined)throw new Error('actual afterRollback did not supply its repair stores');
      const committed=fixture.readEvidence();
      await expectClosed(()=>write(expired,prepared.original,seed.stamp));
      expect(fixture.readEvidence()).toEqual(committed);
      await source.uow.run<undefined>(()=>Promise.resolve({commit:false,value:undefined,afterRollback:async({stores:repair})=>{
        expect(await write(repair,prepared.original,seed.stamp)).toBe('written');
        expect(await read(repair,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        await expectClosed(()=>write(expired,prepared.alternate,seed.stamp));
        expect(await read(repair,kind,seed.workPackageId)).toEqual([prepared.original.value]);
        await remove(repair,prepared.original,seed.stamp);
      }}));
      expect(fixture.readEvidence()).toEqual(committed);
    });
  },30000);
}

test('actual memory point setter refuses Source close before its queued turn independently of the held UoW',async()=>{
  await withinFixture(async(fixture)=>{
    const prepared=await prepare(fixture,'actual'),{source,seed}=fixture;
    const dispatch:{pending:Promise<Settlement<StepWriteOutcome>>|undefined;started:boolean}={pending:undefined,started:false};
    const held=await settle(()=>source.uow.run(async()=>{
      // Public set dispatch and synchronous retention occur while this actual
      // loan still owns the coordinator; only its turn can perform the write.
      dispatch.pending=settle(()=>{dispatch.started=true;return write(source.stores,prepared.original,seed.stamp);});
      await fixture.close();
      return{commit:false,value:'closed while holding the coordinator'};
    }));
    const pending=dispatch.pending;
    if(pending===undefined){if(!held.ok)throw held.cause;throw new Error('queued close owner never dispatched the setter');}
    const queued=await pending;
    // Both promises are settled before either oracle. The held UoW's expected
    // close rejection is a premise, never the queued setter's refusal evidence.
    expect(dispatch.started).toBe(true);
    expect(held.ok).toBe(false);
    if(held.ok)throw new Error('closed Source UoW unexpectedly completed');
    expect(String(held.cause)).toMatch(/memory source is closed/);
    expect(queued.ok).toBe(false);
    if(queued.ok)throw new Error('queued setter wrote after Source close: '+queued.value);
    expect(String(queued.cause)).toMatch(/memory source is closed/);
    // The fixture owns its memoized close; no post-close persistence read is
    // treated as evidence and no unfinished promise escapes this owner.
  });
},30000);
