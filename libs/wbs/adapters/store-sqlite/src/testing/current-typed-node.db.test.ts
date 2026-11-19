import {parseDependencyReceipt} from '@wbs/contracts/dependency-runtime';
import type {StoredTypedDependency} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';

import {inspectDependencyActivation} from '../cross-work-package-dependency-activation';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;

async function withinFixture(act:(fixture:Fixture)=>Promise<void>):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  let primary:{cause:unknown}|undefined;
  try{await act(fixture);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'current typed endpoint owner and fixture close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

/** Fixture-only complete persisted activation; real inspector retains exact ledger/schema/trigger validation. */
async function seedExternalAuthority(fixture:Fixture):Promise<void>{
  const {source,seed}=fixture;
  expect(inspectDependencyActivation(source.db)).toEqual({state:'DISABLED',receipt:null});
  const receipt=parseDependencyReceipt({
    protocol:'wbs-dependency-activation',version:1,activationId:'current-typed-endpoints',
    databaseIdentity:fixture.fixtureId,candidateImage:'wbs@sha256:'+'a'.repeat(64),
    rollbackImage:'wbs@sha256:'+'b'.repeat(64),participantProofSha256:'c'.repeat(64),
    migrationCaptureSha256:'d'.repeat(64),activatedAt:seed.stamp.at,
  });
  await source.uow.run(()=>{
    source.db.run(sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${JSON.stringify(receipt)})`);
    source.db.run(sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`);
    return Promise.resolve({commit:true,value:undefined});
  });
  expect(inspectDependencyActivation(source.db)).toEqual({state:'ENABLED',receipt});
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}

test('current SQL typed node endpoints use owned catalogue identity after a real whole-edge control',async()=>{
  await withinFixture(async(fixture)=>{
    const {source,seed,port}=fixture;
    const stepId='current-external-node-step',predecessorId='current-external-predecessor',successorId='current-external-successor';
    expect((await port.defineAndBindStep(seed.organizationId,{
      id:stepId,code:stepId,name:'Current external node step',position:10,
      defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
    },{bindingId:'current-external-node-binding',scopeKind:'organization',scopeId:seed.organizationId,
      workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
    for(const [id,workPackageId] of [[predecessorId,seed.workPackageId],[successorId,seed.siblingWorkPackageId]]){
      await source.stores.workItems.insert(workItemRow({id,workPackageId,name:id}),[],seed.stamp);
      expect(await source.stores.estimates.readTarget(id,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
      expect((await port.readPackage(seed.organizationId,workPackageId))?.steps.map(({stepId})=>stepId)).toEqual([stepId]);
    }
    expect(fixture.readEvidence().packageValues).toEqual([
      {workPackageId:seed.workPackageId,stepId,estimateUnit:'workdays',allowanceBps:0,allowanceRevision:0},
      {workPackageId:seed.siblingWorkPackageId,stepId,estimateUnit:'workdays',allowanceBps:0,allowanceRevision:0},
    ]);
    expect(source.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='step'`)).toEqual([]);
    await seedExternalAuthority(fixture);
    const whole:StoredTypedDependency={
      id:'current-whole-control',workPackageId:seed.siblingWorkPackageId,type:'FS',
      predecessor:{workPackageId:seed.workPackageId,workItemId:predecessorId,scope:'whole'},
      successor:{workPackageId:seed.siblingWorkPackageId,workItemId:successorId,scope:'whole'},
    };
    await source.stores.typedDependencies.add(whole,seed.stamp);
    expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([whole]);
    expect(await source.stores.typedDependencies.incidents.capture(whole.id)).toEqual({dependency:whole,createdAt:seed.stamp.at,createdBy:seed.stamp.by});
    await source.stores.typedDependencies.remove(whole.id,seed.stamp);
    expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([]);
    expect(source.db.all(sql`SELECT id FROM external_dependency`)).toEqual([]);

    const node:StoredTypedDependency={
      id:'current-node-relationship',workPackageId:seed.siblingWorkPackageId,type:'SS',
      predecessor:{workPackageId:seed.workPackageId,workItemId:predecessorId,scope:'node',stepId},
      successor:{workPackageId:seed.siblingWorkPackageId,workItemId:successorId,scope:'node',stepId},
    };
    // First feature call uses the actual guarded repository and current schema.
    // Its old SELECT FROM step must not be hidden by a compatibility view or raw row insertion.
    await source.stores.typedDependencies.add(node,seed.stamp);
    expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([node]);
    expect(await source.stores.typedDependencies.listByWorkPackage(seed.siblingWorkPackageId)).toEqual([node]);
    expect(await source.stores.typedDependencies.incidents.capture(node.id)).toEqual({dependency:node,createdAt:seed.stamp.at,createdBy:seed.stamp.by});
    expect(source.db.all(sql`SELECT id,predecessor_step_id AS predecessorStepId,successor_step_id AS successorStepId FROM external_dependency`)).toEqual([
      {id:node.id,predecessorStepId:stepId,successorStepId:stepId},
    ]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
},30000);

/** Bun's installed matcher declaration says void; runtime rejects matcher must still be awaited with its original receiver. */
async function expectRejected(promise:Promise<unknown>,expected:string):Promise<void>{
  const rejection:{toThrow(expected:string):unknown}=expect(promise).rejects;
  await rejection.toThrow(expected);
}

async function prepareCurrentNodes(fixture:Fixture){
  const {source,seed,port}=fixture;
  const stepId='evidence-current-step',predecessorId='evidence-predecessor',successorId='evidence-successor';
  expect((await port.defineAndBindStep(seed.organizationId,{
    id:stepId,code:stepId,name:'Evidence current step',position:10,
    defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
  },{bindingId:'evidence-current-binding',scopeKind:'organization',scopeId:seed.organizationId,
    workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  for(const [id,workPackageId] of [[predecessorId,seed.workPackageId],[successorId,seed.siblingWorkPackageId]]){
    await source.stores.workItems.insert(workItemRow({id,workPackageId,name:id}),[],seed.stamp);
    expect(await source.stores.estimates.readTarget(id,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
  }
  await seedExternalAuthority(fixture);
  const dependency:StoredTypedDependency={
    id:'evidence-node-control',workPackageId:seed.siblingWorkPackageId,type:'FS',
    predecessor:{workPackageId:seed.workPackageId,workItemId:predecessorId,scope:'node',stepId},
    successor:{workPackageId:seed.siblingWorkPackageId,workItemId:successorId,scope:'node',stepId},
  };
  await source.stores.typedDependencies.add(dependency,seed.stamp);
  expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([dependency]);
  expect(await source.stores.typedDependencies.incidents.capture(dependency.id)).toEqual({dependency,createdAt:seed.stamp.at,createdBy:seed.stamp.by});
  await source.stores.typedDependencies.remove(dependency.id,seed.stamp);
  expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([]);
  return{dependency,stepId,predecessorId,successorId};
}

for(const side of ['predecessor','successor'] as const){
  for(const defect of ['missing definition','missing package value','foreign definition'] as const){
    test('current SQL typed evidence refuses '+defect+' at '+side+' without changing persistence',async()=>{
      await withinFixture(async(fixture)=>{
        const {source,seed,port}=fixture;
        const healthy=await prepareCurrentNodes(fixture);
        const selected=healthy.dependency[side];
        const stepId='evidence-refused-step';
        if(defect==='missing definition'){
          expect((await port.readCatalogue(seed.organizationId))?.definitions.map(({id})=>id)).not.toContain(stepId);
        }else{
          const organizationId=defect==='foreign definition'?seed.foreignOrganizationId:seed.organizationId;
          const otherProject=side==='predecessor'?seed.siblingProjectId:seed.projectId;
          expect((await port.defineAndBindStep(organizationId,{
            id:stepId,code:stepId,name:'Evidence separately owned step',position:20,
            defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
          },{bindingId:'evidence-refused-binding',scopeKind:'project',
            scopeId:defect==='foreign definition'?seed.foreignProjectId:otherProject,
            workItemTypeId:null,position:20},seed.stamp)).ok).toBe(true);
          expect(source.db.all(sql`SELECT step_id FROM work_package_step WHERE work_package_id=${selected.workPackageId} AND step_id=${stepId}`)).toEqual([]);
          if(defect==='foreign definition'){
            // One explicit corruption boundary: preserve every original schema
            // byte while giving a foreign definition a false package mapping.
            // The public repository must independently reject that trusted row.
            const trigger=source.db.get<{sql:unknown}>(sql`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='work_package_step_scope_insert'`)?.sql;
            if(typeof trigger!=='string')throw new Error('package ownership trigger is absent');
            const beforeSchema=source.db.all(sql`SELECT type,name,sql FROM sqlite_master ORDER BY type,name`);
            await source.uow.run(()=>{
              source.db.run(sql`DROP TRIGGER work_package_step_scope_insert`);
              source.db.run(sql`INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES(${selected.workPackageId},${stepId},'workdays',0,0)`);
              source.db.run(sql.raw(trigger));
              return Promise.resolve({commit:true,value:undefined});
            });
            expect(source.db.all(sql`SELECT type,name,sql FROM sqlite_master ORDER BY type,name`)).toEqual(beforeSchema);
            expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
            expect(source.db.all(sql`SELECT organization_id FROM step_definition WHERE id=${stepId}`)).toEqual([{organization_id:seed.foreignOrganizationId}]);
            expect(source.db.all(sql`SELECT step_id FROM work_package_step WHERE work_package_id=${selected.workPackageId} AND step_id=${stepId}`)).toEqual([{step_id:stepId}]);
          }
        }
        const refused:StoredTypedDependency={...healthy.dependency,[side]:{...selected,scope:'node',stepId}};
        const before=fixture.readEvidence();
        await expectRejected(source.stores.typedDependencies.add(refused,seed.stamp),
          'names step '+stepId+' outside work package '+selected.workPackageId); 
        expect(fixture.readEvidence()).toEqual(before);
        expect(source.db.all(sql`SELECT id FROM external_dependency`)).toEqual([]);
      });
    },30000);
  }
}

test('current SQL incident evidence survives temporary node shape and restores a lawful descendant endpoint',async()=>{
  await withinFixture(async(fixture)=>{
    const {source,seed}=fixture;
    const healthy=await prepareCurrentNodes(fixture);
    await source.stores.typedDependencies.add(healthy.dependency,seed.stamp);
    const original=await source.stores.typedDependencies.incidents.capture(healthy.dependency.id);
    expect(original).toEqual({dependency:healthy.dependency,createdAt:seed.stamp.at,createdBy:seed.stamp.by});
    const childId='evidence-descendant-leaf';
    const descendant:StoredTypedDependency={...healthy.dependency,
      predecessor:{workPackageId:seed.workPackageId,workItemId:healthy.predecessorId,scope:'descendant-step',stepId:healthy.stepId}};
    await source.uow.run(async(scope)=>{
      await scope.stores.workItems.insert(workItemRow({id:childId,workPackageId:seed.workPackageId,parentId:healthy.predecessorId,name:'Evidence descendant leaf'}),[],seed.stamp);
      expect(await scope.stores.estimates.readTarget(childId,healthy.stepId)).toMatchObject({kind:'resolved',step:{stepId:healthy.stepId}});
      // Capture intentionally verifies stable ownership while this actual loan
      // temporarily retains the old node shape. Terminal restore checks shape.
      expect(await scope.stores.typedDependencies.incidents.capture(original.dependency.id)).toEqual(original);
      await scope.stores.typedDependencies.incidents.detach(original);
      expect(await scope.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([]);
      await scope.stores.typedDependencies.incidents.restore({...original,dependency:descendant},healthy.dependency,seed.stamp);
      return{commit:true,value:undefined};
    });
    expect(await source.stores.typedDependencies.listIncident([seed.workPackageId,seed.siblingWorkPackageId])).toEqual([descendant]);
    expect(await source.stores.typedDependencies.incidents.capture(descendant.id)).toEqual({...original,dependency:descendant});
    expect((await source.stores.workItems.findById(childId))?.parentId).toBe(healthy.predecessorId);
    const before=fixture.readEvidence();
    await expectRejected(source.stores.typedDependencies.update(healthy.dependency,seed.stamp),'a parent');
    expect(fixture.readEvidence()).toEqual(before);
    const wrongDescendant:StoredTypedDependency={...descendant,
      predecessor:{...descendant.predecessor,workItemId:childId}};
    await expectRejected(source.stores.typedDependencies.update(wrongDescendant,seed.stamp),'a leaf');
    expect(fixture.readEvidence()).toEqual(before);
  });
},30000);
