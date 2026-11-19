import type {TransactionalStores,WriteStamp,StoredStepBlockage,StoredStepParallel} from '@wbs/core';
import {WorkPackageStepMissing} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';

import {readStepBlockageActivation} from '../step-blockage-activation';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
type SparseStores=Pick<TransactionalStores,'blockages'|'stepParallels'>;
type Family='blockage'|'parallel';
const LEAF='sparse-current-leaf',PEER='sparse-current-peer',SIBLING='sparse-current-sibling';
const GLOBAL='z-sparse-global',LOCAL='a-sparse-project';

async function withinFixture(exercise:(fixture:Fixture)=>Promise<void>):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  let primary:{cause:unknown}|undefined;
  try{await exercise(fixture);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'sparse read owner and Source close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

async function seedScope(fixture:Fixture):Promise<void>{
  const {source,seed,port}=fixture;
  for(const[id,scopeKind,scopeId,position,bindingPosition]of [
    [GLOBAL,'organization',seed.organizationId,900,10],
    [LOCAL,'project',seed.projectId,1,5],
  ]as const){
    expect((await port.defineAndBindStep(seed.organizationId,{
      id,code:id,name:id,position,defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
    },{bindingId:id+':binding',scopeKind,scopeId,workItemTypeId:null,position:bindingPosition},seed.stamp)).ok).toBe(true);
  }
  for(const[id,workPackageId,position]of [[LEAF,seed.workPackageId,10],[PEER,seed.workPackageId,20],[SIBLING,seed.siblingWorkPackageId,10]]as const)
    await source.stores.workItems.insert(workItemRow({id,workPackageId,name:id,position}),[],seed.stamp);
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([GLOBAL,LOCAL]);
  expect(await source.stores.estimates.readTarget(LEAF,GLOBAL)).toMatchObject({kind:'resolved',step:{stepId:GLOBAL}});
  expect(readStepBlockageActivation(source.db)).toBe('DISABLED');
  source.db.run(sql`UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1`);
  expect(readStepBlockageActivation(source.db)).toBe('ENABLED');
  expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
  expect(source.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='step'`)).toEqual([]);
}

function createFact(family:Family,workItemId:string,stepId:string,value:number){
  return family==='blockage'?{workItemId,stepId,blockedAt:value}:{workItemId,stepId,maxParallel:value};
}
async function setFact(stores:SparseStores,family:Family,workItemId:string,stepId:string,value:number,stamp:WriteStamp):Promise<void>{
  if(family==='blockage')expect(await stores.blockages.set({workItemId,stepId,blockedAt:value},stamp)).toBe('written');
  else await stores.stepParallels.set({workItemId,stepId,maxParallel:value},stamp);
}
function readFacts(stores:SparseStores,family:Family,workPackageId:string,ids:readonly string[]|null):Promise<readonly(StoredStepBlockage|StoredStepParallel)[]>{
  if(family==='blockage')return ids===null?stores.blockages.listByWorkPackage(workPackageId):stores.blockages.listByWorkItems(workPackageId,ids);
  return ids===null?stores.stepParallels.listByWorkPackage(workPackageId):stores.stepParallels.listByWorkItems(workPackageId,ids);
}
function tableOf(family:Family){return family==='blockage'?'step_blockage':'step_parallel';}
async function expectHealthy(fixture:Fixture,family:Family):Promise<void>{
  const before=fixture.readEvidence().snapshot;
  expect<unknown>(await readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).toEqual([createFact(family,LEAF,GLOBAL,2)]);
  expect<unknown>(await readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).toEqual([createFact(family,LEAF,GLOBAL,2)]);
  expect(fixture.readEvidence().snapshot).toEqual(before);
}

function deleteTrusted(fixture:Fixture,kind:'values'|'definition'|'work_item'):void{
  const {db}=fixture.source;
  db.run(sql`PRAGMA foreign_keys=OFF`);
  try{
    if(kind==='values')db.run(sql`DELETE FROM work_package_step WHERE work_package_id=${fixture.seed.workPackageId} AND step_id=${GLOBAL}`);
    else if(kind==='definition')db.run(sql`DELETE FROM step_definition WHERE id=${GLOBAL}`);
    else db.run(sql`DELETE FROM work_item WHERE id=${LEAF}`);
  }finally{db.run(sql`PRAGMA foreign_keys=ON`);}
  expect(db.all('PRAGMA foreign_keys')).toEqual([{foreign_keys:1}]);
}

async function withinDeadline<Value>(pending:Promise<Value>):Promise<Value>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([pending,new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>{reject(new Error('sparse read did not settle independently of the held writer'));},2000);
  })]);}finally{if(timer!==undefined)clearTimeout(timer);}
}

for(const family of ['blockage','parallel']as const){
  test('current sparse '+family+' full and targeted reads use leaf SC18 order and preserve shared-package isolation',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);
      const {source,seed}=fixture;
      await setFact(source.stores,family,LEAF,LOCAL,3,seed.stamp);
      await setFact(source.stores,family,LEAF,GLOBAL,2,seed.stamp);
      await setFact(source.stores,family,PEER,GLOBAL,4,seed.stamp);
      await setFact(source.stores,family,SIBLING,GLOBAL,5,seed.stamp);
      const before=fixture.readEvidence().snapshot;
      expect<unknown>(await readFacts(source.stores,family,seed.workPackageId,null)).toEqual([
        createFact(family,LEAF,GLOBAL,2),createFact(family,LEAF,LOCAL,3),createFact(family,PEER,GLOBAL,4),
      ]);
      expect<unknown>(await readFacts(source.stores,family,seed.workPackageId,[LEAF])).toEqual([createFact(family,LEAF,GLOBAL,2),createFact(family,LEAF,LOCAL,3)]);
      expect(await readFacts(source.stores,family,seed.workPackageId,[SIBLING])).toEqual([]);
      expect(await readFacts(source.stores,family,seed.workPackageId,[])).toEqual([]);
      expect<unknown>(await readFacts(source.stores,family,seed.siblingWorkPackageId,null)).toEqual([createFact(family,SIBLING,GLOBAL,5)]);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  for(const corruption of ['values','definition']as const){
    test('current sparse '+family+' refuses missing trusted '+corruption+' after healthy full and targeted reads',async()=>{
      await withinFixture(async fixture=>{
        await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
        deleteTrusted(fixture,corruption);
        const before=fixture.readEvidence().snapshot;
        for(const ids of [null,[LEAF]]as const){
          const pending=readFacts(fixture.source.stores,family,fixture.seed.workPackageId,ids);
          if(corruption==='values'){
            await expect(pending).rejects.toThrow(WorkPackageStepMissing);
            await expect(pending).rejects.toMatchObject({workPackageId:fixture.seed.workPackageId,stepId:GLOBAL});
          }else await expect(pending).rejects.toThrow('catalogue step identity is absent or malformed');
        }
        expect(fixture.readEvidence().snapshot).toEqual(before);
      });
    },15000);
  }

  test('current sparse '+family+' refuses a foreign definition after a healthy actual read',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      fixture.source.db.run(sql`UPDATE step_definition SET organization_id=${fixture.seed.foreignOrganizationId} WHERE id=${GLOBAL}`);
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow();
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow();
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' refuses a point whose own leaf no longer resolves the binding',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      fixture.source.db.run(sql`UPDATE step_binding SET work_item_type_id=${fixture.seed.typeId} WHERE id=${GLOBAL+':binding'}`);
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow(/resolved/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/resolved/);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' refuses retained facts on a parent',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      await fixture.source.stores.workItems.insert(workItemRow({id:'sparse-child',workPackageId:fixture.seed.workPackageId,parentId:LEAF,name:'Child',position:10}),[],fixture.seed.stamp);
      expect(fixture.source.db.all(sql`SELECT work_item_id FROM ${sql.raw(tableOf(family))}`)).toEqual([{work_item_id:LEAF}]);
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow(/parent|leaf/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/parent|leaf/);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' decodes a malformed physical scalar without coercion',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      fixture.source.db.run(sql`PRAGMA ignore_check_constraints=ON`);
      try{fixture.source.db.run(sql`UPDATE ${sql.raw(tableOf(family))} SET ${sql.raw(family==='blockage'?'blocked_at':'max_parallel')}=X'32' WHERE work_item_id=${LEAF} AND step_id=${GLOBAL}`);}
      finally{fixture.source.db.run(sql`PRAGMA ignore_check_constraints=OFF`);}
      expect(fixture.source.db.all('PRAGMA ignore_check_constraints')).toEqual([{ignore_check_constraints:0}]);
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow();
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow();
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' preserves explicit full-read orphan refusal and targeted ID filtering',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      deleteTrusted(fixture,'work_item');
      expect(fixture.source.db.all(sql`SELECT work_item_id FROM ${sql.raw(tableOf(family))}`)).toEqual([{work_item_id:LEAF}]);
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow(/work.item|work item/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.siblingWorkPackageId,null)).rejects.toThrow(/work.item|work item/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/work.item|work item/);
      expect(await readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[PEER])).toEqual([]);
      expect(await readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[])).toEqual([]);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' public read observes committed facts while its Source writer is held',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      const entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
      const writer=fixture.source.uow.run(async({stores})=>{
        await setFact(stores,family,LEAF,GLOBAL,6,fixture.seed.stamp);
        entered.resolve();await release.promise;return{commit:true,value:undefined};
      }).then(()=>({ok:true as const}),(cause:unknown)=>{entered.reject(cause);return{ok:false as const,cause};});
      let primary:{cause:unknown}|undefined;
      let observed:ReturnType<typeof readFacts>|undefined;
      try{
        await withinDeadline(entered.promise);
        observed=readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null);
        expect<unknown>(await withinDeadline(observed)).toEqual([createFact(family,LEAF,GLOBAL,2)]);
      }catch(cause:unknown){primary={cause};}
      release.resolve();
      const settled=await writer;
      const lateObservation=observed===undefined?{ok:true as const}:await observed.then(()=>({ok:true as const}),(cause:unknown)=>({ok:false as const,cause}));
      if(!lateObservation.ok&&(primary===undefined||!Object.is(primary.cause,lateObservation.cause))){
        if(primary===undefined)primary={cause:lateObservation.cause};
        else primary={cause:new AggregateError([primary.cause,lateObservation.cause],'sparse read deadline and late observation failed')};
      }
      if(!settled.ok){if(primary!==undefined)throw new AggregateError([primary.cause,settled.cause],'sparse read and held writer failed');throw settled.cause;}
      if(primary!==undefined)throw primary.cause;
      expect<unknown>(await readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).toEqual([createFact(family,LEAF,GLOBAL,6)]);
    });
  },15000);

  test('current sparse '+family+' borrowed read cannot revive after the actual Source writer loan ends',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      const captured:{stores:SparseStores|undefined}={stores:undefined};
      await fixture.source.uow.run(async({stores})=>{
        captured.stores=stores;
        expect<unknown>(await readFacts(stores,family,fixture.seed.workPackageId,null)).toEqual([createFact(family,LEAF,GLOBAL,2)]);
        return{commit:false,value:undefined};
      });
      const retained=captured.stores;if(retained===undefined)throw new Error('actual sparse writer loan was not captured');
      const before=fixture.readEvidence().snapshot;
      await expect(readFacts(retained,family,fixture.seed.workPackageId,null)).rejects.toThrow(/closed/);
      await expect(readFacts(retained,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/closed/);
      await fixture.source.uow.run(async({stores})=>{
        expect<unknown>(await readFacts(stores,family,fixture.seed.workPackageId,null)).toEqual([createFact(family,LEAF,GLOBAL,2)]);
        await expect(readFacts(retained,family,fixture.seed.workPackageId,null)).rejects.toThrow(/closed/);
        await expect(readFacts(retained,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/closed/);
        return{commit:false,value:undefined};
      });
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);

  test('current sparse '+family+' public reads reject after Source close including empty selection',async()=>{
    await withinFixture(async fixture=>{
      await seedScope(fixture);await setFact(fixture.source.stores,family,LEAF,GLOBAL,2,fixture.seed.stamp);await expectHealthy(fixture,family);
      await fixture.close();
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,null)).rejects.toThrow(/closed/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[LEAF])).rejects.toThrow(/closed/);
      await expect(readFacts(fixture.source.stores,family,fixture.seed.workPackageId,[])).rejects.toThrow(/closed/);
    });
  },15000);
}
