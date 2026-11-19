import type {StepFactKind} from '../ports/step-catalogue';
import {workPackageRow} from '@wbs/store-memory/work-package-fixture';
import {expect,test} from 'bun:test';

import {servicesOver} from '../compose';
import {createPlanCommandRunner} from '../module/plan-commands/composition';
import {clockOf} from '../ports/clock';
import {LEGACY_EDIT_ADMISSION} from '../ports/edit-admission';
import {createLocalDependencyContext} from '../service/dependency-context';
import {createCurrentPlanFixture} from './current-plan-fixture';
import {localCommandAccess} from './organization-access-fixture';
import {fastScheduler} from './scheduler-fixture';
import {workItemRow} from './work-item-fixture';

type PointFact=Extract<StepFactKind,'actual'|'progress'|'measure'>;
type Plan=Awaited<ReturnType<typeof createCurrentPlanFixture>>;
type Settlement<Value>={ok:true;value:Value}|{ok:false;cause:unknown};
async function settle<Value>(operation:()=>Promise<Value>):Promise<Settlement<Value>>{try{return{ok:true,value:await operation()};}catch(cause:unknown){return{ok:false,cause};}}
const stamp={at:100,by:'point-handup-author'},organizationId='point-handup-org',projectId='point-handup-project',workPackageId='point-handup-package',stepId='point-handup-step',typeId='point-handup-type',parentId='point-handup-parent',childId='point-handup-child';
async function withinPlan(typed:boolean,act:(plan:Plan)=>Promise<void>){
  const plan=await createCurrentPlanFixture({organizationId,projectId,workPackage:workPackageRow({id:workPackageId,projectId}),stamp,
    types:typed?[{id:typeId,name:'Hand-up direct type'}]:[],creatorGrant:{id:'point-handup-grant',auditId:'point-handup-audit'},
    boundSteps:[{definition:{id:stepId,code:stepId,name:'Hand-up step',position:10,defaultEstimateUnit:'workdays',defaultAllowancePercent:0},
      binding:{bindingId:'point-handup-binding',scopeKind:'project',scopeId:projectId,workItemTypeId:typed?typeId:null,position:10}}]});
  const execution=await settle(()=>act(plan)),closing=await settle(plan.close);
  if(!execution.ok&&!closing.ok)throw new AggregateError([execution.cause,closing.cause],'point hand-up owner and actual Source close failed',{cause:closing.cause});
  if(!execution.ok)throw execution.cause;if(!closing.ok)throw closing.cause;
}
function commandRunner(plan:Plan){
  let next=0;const clock=clockOf({now:()=>stamp.at,newId:()=>'point-handup-generated-'+String(++next)});
  const publicGraph=servicesOver(plan.source.stores,{admission:LEGACY_EDIT_ADMISSION,dependencyContext:createLocalDependencyContext(plan.source.stores),clock,broadcast:plan.broadcast,scheduler:fastScheduler});
  return createPlanCommandRunner({commandAccess:localCommandAccess,uow:plan.source.uow,announcements:plan.broadcast,publicServices:publicGraph,
    batchServices:(scope,broadcast,admission,dependencyContext)=>servicesOver(scope.stores,{admission,dependencyContext:{kind:'bound',context:dependencyContext},clock,broadcast,scheduler:fastScheduler})});
}
async function prepare(plan:Plan,fact:PointFact,typed:boolean){
  const{source}=plan;
  await source.stores.workItems.insert(workItemRow({id:parentId,workPackageId,name:'Promoted parent',position:10}),[],stamp);
  expect(await source.stores.estimates.readTarget(parentId,stepId)).toMatchObject(typed?{kind:'step_not_resolved'}:{kind:'resolved',step:{stepId}});
  await source.stores.workItems.insert(workItemRow({id:childId,workPackageId,parentId,name:'Only child',position:10}),[],stamp);
  if(typed)expect(await source.stores.workItems.patch(childId,{typeIds:[typeId]},stamp)).toMatchObject({ok:true});
  expect(await source.stores.estimates.readTarget(childId,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
  if(fact==='actual'){
    const value={workItemId:childId,stepId,days:2.5,recordedAt:111};
    expect(await source.stores.actuals.set(value,stamp)).toBe('written');
    expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([value]);
  }else if(fact==='progress'){
    const value={workItemId:childId,stepId,state:'in_progress' as const,statedAt:112};
    expect(await source.stores.progress.set(value,stamp)).toBe('written');
    expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([value]);
  }else{
    const value={workItemId:childId,stepId,metric:'token_actual' as const,value:3,recordedAt:113};
    expect(await source.stores.measures.set(value,stamp)).toBe('written');
    expect(await source.stores.measures.listByWorkPackage(workPackageId)).toEqual([value]);
  }
  expect(await source.stores.measureEstimates.set({workItemId:childId,stepId,key:'tokens',optimistic:10,realistic:20,pessimistic:30,singlePoint:false},stamp)).toBe('written');
  expect(await source.stores.measureEstimates.listByWorkPackage(workPackageId)).toEqual([{workItemId:childId,stepId,key:'tokens',optimistic:10,realistic:20,pessimistic:30,singlePoint:false}]);
}
async function assertPoints(plan:Plan,fact:PointFact,workItemId:string){
  const{source}=plan;
  if(fact==='actual')expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([{workItemId,stepId,days:2.5,recordedAt:111}]);
  else if(fact==='progress')expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([{workItemId,stepId,state:'in_progress',statedAt:112}]);
  else expect(await source.stores.measures.listByWorkPackage(workPackageId)).toEqual([{workItemId,stepId,metric:'token_actual',value:3,recordedAt:113}]);
  expect(await source.stores.measureEstimates.listByWorkPackage(workPackageId)).toEqual([{workItemId,stepId,key:'tokens',optimistic:10,realistic:20,pessimistic:30,singlePoint:false}]);
}
for(const fact of ['actual','progress','measure'] as const){
  test('actual command '+fact+' hand-up reaches a lawful promoted leaf with its ranged trio through undo and redo',async()=>{
    await withinPlan(false,async(plan)=>{
      await prepare(plan,fact,false);const runner=commandRunner(plan);
      expect(await runner.run(workPackageId,stamp.by,[{kind:'deleteWorkItem',workItemId:childId,strategy:'cascade'}])).toMatchObject({ok:true});
      expect(await plan.source.stores.workItems.findById(childId)).toBeNull();
      expect(await plan.source.stores.estimates.readTarget(parentId,stepId)).toMatchObject({kind:'resolved',step:{stepId}});
      await assertPoints(plan,fact,parentId);
      expect(await runner.undo(workPackageId,stamp.by)).toMatchObject({ok:true});
      expect((await plan.source.stores.workItems.findById(childId))?.parentId).toBe(parentId);
      await assertPoints(plan,fact,childId);
      expect(await runner.redo(workPackageId,stamp.by)).toMatchObject({ok:true});
      expect(await plan.source.stores.workItems.findById(childId)).toBeNull();
      await assertPoints(plan,fact,parentId);
    });
  },30000);
  test('actual command '+fact+' hand-up refuses a typed-child value on an untyped promoted parent atomically',async()=>{
    await withinPlan(true,async(plan)=>{
      await prepare(plan,fact,true);const runner=commandRunner(plan);
      expect((await plan.source.stores.workItems.listByWorkPackage(workPackageId)).find(({id})=>id===parentId)?.parentId).toBeNull();
      const before=plan.fixture.stepCatalogueEvidence(),announcements=structuredClone(plan.broadcast.published);
      expect(await plan.source.stores.journal.entriesFor({workPackageId,userId:stamp.by,personId:null})).toEqual([]);
      const refused=await runner.run(workPackageId,stamp.by,[{kind:'deleteWorkItem',workItemId:childId,strategy:'cascade'}]);
      expect(refused).toMatchObject({ok:false,reason:'step_not_resolved'});
      expect(plan.fixture.stepCatalogueEvidence()).toEqual(before);
      expect(plan.broadcast.published).toEqual(announcements);
      expect(await plan.source.stores.journal.entriesFor({workPackageId,userId:stamp.by,personId:null})).toEqual([]);
      await assertPoints(plan,fact,childId);
    });
  },30000);
}
