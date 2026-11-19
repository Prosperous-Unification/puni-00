import type {FirstChildWriteOutcome,StoredEstimate} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';

import {messagesOf} from '../constraint';
import {readStepBlockageActivation} from '../step-blockage-activation';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const parentId='sql-first-child-parent',peerId='sql-first-child-peer',stepId='sql-first-child-dev',otherStepId='sql-first-child-qa';
const pointTables=['estimate','actual','step_progress','step_measure','measure_estimate','step_node_attempt','step_node_attempt_issued','assignment','claim','step_blockage'] as const;

async function withinFixture(act:(fixture:Fixture)=>Promise<void>):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  let primary:{cause:unknown}|undefined;
  try{await act(fixture);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'SQL first-child owner and fixture close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

function readPhysical(fixture:Fixture,ids:readonly string[]){
  return pointTables.map(table=>({table,rows:fixture.source.db.all<Record<string,unknown>>(sql`SELECT * FROM ${sql.raw('"'+table+'"')} WHERE work_item_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) ORDER BY work_item_id,step_id`)}));
}

async function prepare(fixture:Fixture){
  const {source,seed,port}=fixture;
  for(const id of [stepId,otherStepId])expect((await port.defineAndBindStep(seed.organizationId,{id,code:id,name:id,position:0,defaultEstimateUnit:'workdays',defaultAllowancePercent:0},{bindingId:id+':binding',scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:null,position:id===stepId?0:10},seed.stamp)).ok).toBe(true);
  for(const id of [parentId,peerId])await source.stores.workItems.insert(workItemRow({id,workPackageId:seed.workPackageId,name:id,position:id===parentId?0:10}),[],seed.stamp);
  expect(await source.stores.estimates.set({workItemId:parentId,stepId,optimistic:1,realistic:2,pessimistic:3},seed.stamp)).toBe('written');
  expect(await source.stores.actuals.set({workItemId:parentId,stepId,days:1.5,recordedAt:101},seed.stamp)).toBe('written');
  expect(await source.stores.progress.set({workItemId:parentId,stepId,state:'in_progress',statedAt:102},seed.stamp)).toBe('written');
  expect(await source.stores.measures.set({workItemId:parentId,stepId,metric:'token_estimate',value:5,recordedAt:103},seed.stamp)).toBe('written');
  expect(await source.stores.measures.set({workItemId:parentId,stepId,metric:'hours_actual',value:2,recordedAt:104},seed.stamp)).toBe('written');
  expect(await source.stores.measureEstimates.set({workItemId:parentId,stepId:otherStepId,key:'tokens',optimistic:6,realistic:7,pessimistic:8,singlePoint:false},seed.stamp)).toBe('written');
  expect(await source.stores.measureEstimates.set({workItemId:parentId,stepId,key:'cost',optimistic:10,realistic:20,pessimistic:30,singlePoint:false,basis:{currency:'USD',rateCardDigest:'first-child-priced-basis'}},seed.stamp)).toBe('written');
  await source.stores.attempts.restore({workItemId:parentId,stepId,attemptNumber:7,startedAt:10,endedAt:20,outcome:'failed',executorPersonId:null,reference:'opaque-attempt-reference',note:'opaque-attempt-note'},seed.stamp);
  await source.stores.attempts.raiseIssued([{workItemId:parentId,stepId,issued:11}]);
  // Real fixture-native rows with intact FK/CHECK/ownership triggers; no public claim/permission admission is inferred from this setup.
  source.db.run(sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES('first-child-holder','First child holder',${seed.stamp.by},100,${seed.stamp.by})`);
  source.db.run(sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('first-child-holder',${seed.organizationId},'First child holder')`);
  source.db.run(sql`INSERT INTO assignment(work_item_id,step_id,person_id,created_at,updated_at,created_by) VALUES(${parentId},${stepId},'first-child-holder',91,92,${seed.stamp.by})`);
  source.db.run(sql`INSERT INTO claim(id,work_item_id,step_id,person_id,run_id,parent_claim_id,lease_expires_at,lease_revoked_at,created_at,updated_at,created_by) VALUES('first-child-live-claim',${parentId},${stepId},'first-child-holder','current-live-run',NULL,900,850,93,94,${seed.stamp.by})`);
  expect(readStepBlockageActivation(source.db)).toBe('DISABLED');
  await source.uow.run(()=>{
    source.db.run(sql`UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1`);
    return Promise.resolve({commit:true,value:undefined});
  });
  expect(readStepBlockageActivation(source.db)).toBe('ENABLED');
  source.db.run(sql`INSERT INTO step_blockage(work_item_id,step_id,blocked_at,created_at,updated_at,created_by) VALUES(${parentId},${stepId},95,96,97,${seed.stamp.by})`);
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  expect((await source.stores.estimates.listByWorkPackage(seed.workPackageId)).map(({workItemId})=>workItemId)).toEqual([parentId]);
  expect(await source.stores.attempts.listIssued(seed.workPackageId,[parentId])).toEqual([{workItemId:parentId,stepId,issued:11}]);
  const physical=readPhysical(fixture,[parentId]);
  expect(physical.every(({rows})=>rows.length>0)).toBe(true);
  expect(fixture.readEvidence().tuples.measureEstimates).toEqual(expect.arrayContaining([
    expect.objectContaining({workItemId:parentId,stepId,key:'tokens',optimistic:5,realistic:5,pessimistic:5,singlePoint:true}),
    expect.objectContaining({workItemId:parentId,stepId:otherStepId,key:'tokens',optimistic:6,realistic:7,pessimistic:8,singlePoint:false}),
    expect.objectContaining({workItemId:parentId,stepId,key:'cost',currency:'USD',rateCardDigest:'first-child-priced-basis'}),
  ]));
  return physical;
}

function childOf(fixture:Fixture,id:string){return {...workItemRow({id,workPackageId:fixture.seed.workPackageId,parentId,name:id,position:0}),parentId};}

/** All transferable point families coexist; parallel refusal and relationship/occupancy/active-use transition owners remain distinct. */
test('sqlite first child moves live point tuples and retained allocator through down and up',async()=>{
  await withinFixture(async fixture=>{
    const before=await prepare(fixture),{source,seed}=fixture;
    const catalogue=await fixture.port.readCatalogue(seed.organizationId),values=fixture.readEvidence().packageValues;
    const child=childOf(fixture,'sql-first-child-written');
    const written=await source.uow.run(async scope=>({commit:true,value:await scope.stores.subtrees.writeFirstChild({kind:'fresh',child,respaced:[],localDependencies:[],detachedIncidents:[]},{...seed.stamp,at:201})}));
    expect(written.kind).toBe('written');if(written.kind!=='written')throw new Error('lawful SQL first child was refused');
    for(const original of before){
      const current=readPhysical(fixture,[parentId,child.id]).find(({table})=>table===original.table);
      if(current===undefined)throw new Error('first child physical table is absent');
      expect(current.rows).toEqual(original.table==='step_node_attempt_issued'
        ?[...original.rows,...original.rows.map(row=>({...row,work_item_id:child.id}))]
        :original.rows.map(row=>({...row,work_item_id:child.id,updated_at:201})));
    }
    expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([{workItemId:child.id,stepId,optimistic:1,realistic:2,pessimistic:3}]);
    expect(await fixture.port.readCatalogue(seed.organizationId)).toEqual(catalogue);expect(fixture.readEvidence().packageValues).toEqual(values);
    const returned=await source.uow.run(async scope=>({commit:true,value:await scope.stores.subtrees.writeFirstChild({kind:'replay',direction:'up',record:written.record,respaced:[],localDependencies:[],detachedIncidents:[]},{...seed.stamp,at:202})}));
    expect(returned.kind).toBe('written');
    expect(await source.stores.workItems.findById(child.id)).toBeNull();
    for(const original of before)expect(readPhysical(fixture,[parentId]).find(({table})=>table===original.table)?.rows).toEqual(original.table==='step_node_attempt_issued'?original.rows:original.rows.map(row=>({...row,updated_at:202})));
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
},30000);

test('sqlite first child native failure rolls back locally while an unrelated outer write commits',async()=>{
  await withinFixture(async fixture=>{
    const physicalBefore=await prepare(fixture);const {source,seed}=fixture;
    const before=fixture.readEvidence();let failure:{cause:unknown}|undefined;
    let outcome:FirstChildWriteOutcome|undefined;
    await source.uow.run(async scope=>{
    source.db.run(sql`CREATE TEMP TRIGGER first_child_late_fault BEFORE UPDATE OF work_item_id ON actual WHEN OLD.work_item_id=${sql.raw("'"+parentId+"'")} BEGIN SELECT RAISE(ABORT,'first-child-late-native-fault'); END`);

        try{outcome=await scope.stores.subtrees.writeFirstChild({kind:'fresh',child:childOf(fixture,'sql-first-child-failed'),respaced:[],localDependencies:[],detachedIncidents:[]},seed.stamp);}catch(cause:unknown){failure={cause};}
        source.db.run(sql`DROP TRIGGER first_child_late_fault`);
        expect(outcome).toBeUndefined();expect(failure).toBeDefined();
        if(failure===undefined)throw new Error('first child dependency did not reject');
        expect(messagesOf(failure.cause).some(message=>message.includes('first-child-late-native-fault'))).toBe(true);
        expect(fixture.readEvidence()).toEqual(before);
        expect((await scope.stores.stepCatalogue.defineAndBindStep(seed.organizationId,{id:'first-child-outer-survivor',code:'first-child-outer-survivor',name:'First child outer survivor',position:50,defaultEstimateUnit:'workdays',defaultAllowancePercent:0},{bindingId:'first-child-outer-survivor-binding',scopeKind:'organization',scopeId:seed.organizationId,position:50,workItemTypeId:null},seed.stamp)).ok).toBe(true);
        return {commit:true,value:undefined};
      });
    expect(await source.stores.workItems.findById('sql-first-child-failed')).toBeNull();
    expect((await fixture.port.readCatalogue(seed.organizationId))?.definitions.some(({id})=>id==='first-child-outer-survivor')).toBe(true);
    expect(readPhysical(fixture,[parentId])).toEqual(physicalBefore);
  });
},30000);

for(const boundary of ['typed','parallel'] as const){
  test('sqlite first child '+boundary+' refusal preserves the same writer while outer commit succeeds',async()=>{
    await withinFixture(async fixture=>{
      const {source,seed,port}=fixture;
      expect((await port.defineAndBindStep(seed.organizationId,{id:stepId,code:stepId,name:stepId,position:0,defaultEstimateUnit:'workdays',defaultAllowancePercent:0},{bindingId:stepId+':binding',scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:boundary==='typed'?seed.typeId:null,position:0},seed.stamp)).ok).toBe(true);
      await source.stores.workItems.insert(workItemRow({id:parentId,workPackageId:seed.workPackageId,name:parentId,position:0}),[],seed.stamp);
      if(boundary==='typed')expect(await source.stores.workItems.patch(parentId,{typeIds:[seed.typeId]},seed.stamp)).toMatchObject({ok:true});
      expect(await source.stores.estimates.set({workItemId:parentId,stepId,optimistic:1,realistic:2,pessimistic:3},seed.stamp)).toBe('written');
      if(boundary==='parallel'){
        await source.stores.stepParallels.set({workItemId:parentId,stepId,maxParallel:2},seed.stamp);
        expect(source.db.all(sql`SELECT max_parallel FROM step_parallel WHERE work_item_id=${parentId} AND step_id=${stepId}`)).toEqual([{max_parallel:2}]);
      }
      const before=fixture.readEvidence();
      const refused=await source.uow.run(async scope=>{
        const observed=await scope.stores.subtrees.writeFirstChild({kind:'fresh',child:childOf(fixture,'sql-first-child-refused'),respaced:[],localDependencies:[],detachedIncidents:[]},seed.stamp);
        // This full writer comparison precedes an independent successful write;
        // a later outer rollback cannot erase an accidental candidate mutation.
        expect(fixture.readEvidence()).toEqual(before);
        await scope.stores.workItems.insert(workItemRow({id:'sql-first-child-independent',workPackageId:seed.workPackageId,position:20}),[],seed.stamp);
        return {commit:true,value:observed};
      });
      expect(refused).toEqual({kind:'step_nodes_in_use',count:1,pairs:[{id:parentId,name:parentId,workPackageId:seed.workPackageId,stepId,facts:boundary==='typed'?['estimate']:['parallel']}]});
      expect(await source.stores.workItems.findById('sql-first-child-independent')).toMatchObject({workPackageId:seed.workPackageId});
      expect(await source.stores.workItems.findById('sql-first-child-refused')).toBeNull();
      expect<readonly StoredEstimate[]>(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(before.estimates);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    });
  },30000);
}
