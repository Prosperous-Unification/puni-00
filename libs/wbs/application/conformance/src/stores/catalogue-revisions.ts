import { expect } from 'bun:test';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

const STEP='catalogue-revision-step';
export type ReadProjectRevision=(projectId:string)=>number;

async function readProjectRevisions(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision){
  const {seed,source}=fixture;
  const emptyId=seed.projectId+':empty';
  const empty=await source.stores.settings.readTarget({level:'project',id:emptyId},seed.organizationId);
  expect(empty).toMatchObject({kind:'project'});
  if(empty===null)throw new Error('required actual empty project is absent');
  expect(await source.stores.settings.packageIds(empty)).toEqual([]);
  return{
    own:readProjectRevision(seed.projectId),sibling:readProjectRevision(seed.siblingProjectId),
    foreign:readProjectRevision(seed.foreignProjectId),empty:readProjectRevision(emptyId),
  };
}

async function readRevision(fixture:StepCatalogueFixture,workPackageId:string):Promise<number>{
  const row=await fixture.source.stores.workPackages.findById(workPackageId);
  if(row===null)throw new Error('required catalogue revision package is absent');
  return row.revision;
}

async function defineOrganization(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision){
  const {seed,port}=fixture;
  const projects=await readProjectRevisions(fixture,readProjectRevision);
  const own=await readRevision(fixture,seed.workPackageId);
  const sibling=await readRevision(fixture,seed.siblingWorkPackageId);
  const foreign=await readRevision(fixture,seed.foreignWorkPackageId);
  const created=await port.defineAndBindStep(seed.organizationId,{
    id:STEP,code:STEP,name:'Catalogue revision step',defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:10,
  },{bindingId:'catalogue-revision-organization',scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:null,position:10},seed.stamp);
  expect(created.ok).toBe(true);
  expect(readProjectRevision(seed.projectId+':empty')).toBe(projects.empty+1);
  expect(readProjectRevision(seed.projectId)).toBe(projects.own+1);
  expect(readProjectRevision(seed.siblingProjectId)).toBe(projects.sibling+1);
  expect(readProjectRevision(seed.foreignProjectId)).toBe(projects.foreign);
  expect(await readRevision(fixture,seed.workPackageId)).toBe(own+1);
  expect(await readRevision(fixture,seed.siblingWorkPackageId)).toBe(sibling+1);
  expect(await readRevision(fixture,seed.foreignWorkPackageId)).toBe(foreign);
  expect(created).toMatchObject({workPackageIds:[seed.workPackageId,seed.siblingWorkPackageId].sort(),projectIds:[seed.projectId,seed.siblingProjectId,seed.projectId+':empty'].sort()});
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps.map(step=>step.stepId)).toEqual([STEP]);
  expect((await port.readPackage(seed.organizationId,seed.siblingWorkPackageId))?.steps.map(step=>step.stepId)).toEqual([STEP]);
}

async function bindProvenance(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision){
  const {seed,port,source}=fixture;
  expect((await port.defineAndBindStep(seed.organizationId,{
    id:STEP,code:STEP,name:'Catalogue revision step',defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:10,
  },{bindingId:'catalogue-revision-organization',scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  expect(await source.stores.workPackages.setStepUnit(seed.workPackageId,STEP,'minutes',seed.stamp)).toMatchObject({ok:true});
  expect(await source.stores.workPackages.setStepAllowance(seed.workPackageId,STEP,13.25,seed.stamp)).toMatchObject({ok:true});
  const explicit=fixture.readEvidence().packageValues;
  const projects=await readProjectRevisions(fixture,readProjectRevision);
  const own=await readRevision(fixture,seed.workPackageId);
  const sibling=await readRevision(fixture,seed.siblingWorkPackageId);
  const foreign=await readRevision(fixture,seed.foreignWorkPackageId);
  const bound=await port.bindStep(seed.organizationId,{
    bindingId:'catalogue-revision-project',scopeKind:'project',scopeId:seed.projectId,stepId:STEP,workItemTypeId:null,position:20,
  },seed.stamp);
  expect(bound.ok).toBe(true);
  expect(await readRevision(fixture,seed.workPackageId)).toBe(own+1);
  expect(await readRevision(fixture,seed.siblingWorkPackageId)).toBe(sibling);
  expect(await readRevision(fixture,seed.foreignWorkPackageId)).toBe(foreign);
  expect(readProjectRevision(seed.projectId)).toBe(projects.own+1);
  expect(readProjectRevision(seed.siblingProjectId)).toBe(projects.sibling);
  expect(readProjectRevision(seed.foreignProjectId)).toBe(projects.foreign);
  expect(readProjectRevision(seed.projectId+':empty')).toBe(projects.empty);
  expect(bound).toMatchObject({workPackageIds:[seed.workPackageId],projectIds:[seed.projectId]});
  expect(fixture.readEvidence().packageValues).toEqual(explicit);
  const ownSteps=await port.readPackage(seed.organizationId,seed.workPackageId);
  const siblingSteps=await port.readPackage(seed.organizationId,seed.siblingWorkPackageId);
  expect(ownSteps?.steps).toMatchObject([{stepId:STEP,estimateUnit:'minutes',allowancePercent:13.25,allowanceRevision:1}]);
  expect(ownSteps?.steps.at(0)?.via).toHaveLength(2);
  expect(siblingSteps?.steps.at(0)?.via).toHaveLength(1);
}


async function unbindScope(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision){
  const {seed,port,source}=fixture;
  expect((await port.defineAndBindStep(seed.organizationId,{
    id:STEP,code:STEP,name:'Catalogue revision step',defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:10,
  },{bindingId:'catalogue-revision-organization',scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  expect(await source.stores.workPackages.setStepUnit(seed.workPackageId,STEP,'minutes',seed.stamp)).toMatchObject({ok:true});
  expect(await source.stores.workPackages.setStepAllowance(seed.workPackageId,STEP,13.25,seed.stamp)).toMatchObject({ok:true});
  const leaf='catalogue-revision-protected-leaf';
  await source.stores.workItems.insert(workItemRow({id:leaf,workPackageId:seed.workPackageId}),[],seed.stamp);
  expect(await source.stores.estimates.set({workItemId:leaf,stepId:STEP,optimistic:1,realistic:2,pessimistic:3},seed.stamp)).toBe('written');
  const protectedState=fixture.readEvidence();
  expect(await port.unbindStep(seed.organizationId,'catalogue-revision-organization',{dryRun:true},seed.stamp)).toMatchObject({kind:'preview',wouldRefuse:'step_nodes_in_use'});
  expect(fixture.readEvidence()).toEqual(protectedState);
  expect(await port.unbindStep(seed.organizationId,'catalogue-revision-organization',{dryRun:false},seed.stamp)).toMatchObject({kind:'step_nodes_in_use'});
  expect(fixture.readEvidence()).toEqual(protectedState);
  await source.stores.estimates.remove(leaf,STEP,seed.stamp);
  expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([]);
  const before=fixture.readEvidence();
  expect(await port.unbindStep(seed.organizationId,'catalogue-revision-organization',{dryRun:true},seed.stamp)).toEqual({kind:'preview',wouldRefuse:null});
  expect(fixture.readEvidence()).toEqual(before);
  const projects=await readProjectRevisions(fixture,readProjectRevision);
  const own=await readRevision(fixture,seed.workPackageId),sibling=await readRevision(fixture,seed.siblingWorkPackageId),foreign=await readRevision(fixture,seed.foreignWorkPackageId);
  const unbound=await port.unbindStep(seed.organizationId,'catalogue-revision-organization',{dryRun:false},seed.stamp);
  expect(unbound.kind).toBe('unbound');
  expect(readProjectRevision(seed.projectId+':empty')).toBe(projects.empty+1);
  expect(readProjectRevision(seed.projectId)).toBe(projects.own+1);
  expect(readProjectRevision(seed.siblingProjectId)).toBe(projects.sibling+1);
  expect(readProjectRevision(seed.foreignProjectId)).toBe(projects.foreign);
  expect(await readRevision(fixture,seed.workPackageId)).toBe(own+1);
  expect(await readRevision(fixture,seed.siblingWorkPackageId)).toBe(sibling+1);
  expect(await readRevision(fixture,seed.foreignWorkPackageId)).toBe(foreign);
  expect(unbound).toMatchObject({workPackageIds:[seed.workPackageId,seed.siblingWorkPackageId].sort(),projectIds:[seed.projectId,seed.siblingProjectId,seed.projectId+':empty'].sort()});
  expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps).toEqual([]);
}

async function patchMetadata(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision){
  const{seed,port,source}=fixture;
  await defineOrganization(fixture,readProjectRevision);
  expect(await source.stores.workPackages.setStepUnit(seed.workPackageId,STEP,'minutes',seed.stamp)).toMatchObject({ok:true});
  expect(await source.stores.workPackages.setStepAllowance(seed.workPackageId,STEP,13.25,seed.stamp)).toMatchObject({ok:true});
  const before=fixture.readEvidence();
  const exact=await port.patchStepDefinition(seed.organizationId,STEP,{name:'Catalogue revision step',defaultEstimateUnit:'workdays',defaultAllowancePercent:0},seed.stamp);
  expect(exact).toMatchObject({ok:true,workPackageIds:[],projectIds:[]});
  expect(fixture.readEvidence()).toEqual(before);
  const projects=await readProjectRevisions(fixture,readProjectRevision);
  const own=await readRevision(fixture,seed.workPackageId),sibling=await readRevision(fixture,seed.siblingWorkPackageId),foreign=await readRevision(fixture,seed.foreignWorkPackageId);
  const changed=await port.patchStepDefinition(seed.organizationId,STEP,{name:'Catalogue revised metadata',defaultEstimateUnit:'minutes',defaultAllowancePercent:25},seed.stamp);
  expect(changed).toMatchObject({ok:true,definition:{name:'Catalogue revised metadata',defaultEstimateUnit:'minutes',defaultAllowancePercent:25},workPackageIds:[seed.workPackageId,seed.siblingWorkPackageId].sort(),projectIds:[seed.projectId,seed.siblingProjectId,seed.projectId+':empty'].sort()});
  expect(readProjectRevision(seed.projectId+':empty')).toBe(projects.empty+1);
  expect(readProjectRevision(seed.projectId)).toBe(projects.own+1);
  expect(readProjectRevision(seed.siblingProjectId)).toBe(projects.sibling+1);
  expect(readProjectRevision(seed.foreignProjectId)).toBe(projects.foreign);
  expect(await readRevision(fixture,seed.workPackageId)).toBe(own+1);
  expect(await readRevision(fixture,seed.siblingWorkPackageId)).toBe(sibling+1);
  expect(await readRevision(fixture,seed.foreignWorkPackageId)).toBe(foreign);
  expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
  expect((await port.readPackage(seed.organizationId,seed.workPackageId))?.steps).toMatchObject([{name:'Catalogue revised metadata',estimateUnit:'minutes',allowancePercent:13.25,allowanceRevision:1}]);
  expect((await port.readPackage(seed.organizationId,seed.siblingWorkPackageId))?.steps).toMatchObject([{name:'Catalogue revised metadata',estimateUnit:'workdays',allowancePercent:0,allowanceRevision:0}]);
}

async function reorderBindingsAt(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision,scopeKind:'organization'|'space'|'project'){
  const{seed,port,source}=fixture;
  const scope={scopeKind,scopeId:scopeKind==='organization'?seed.organizationId:scopeKind==='space'?seed.spaceId:seed.projectId};
  const bindings=['reorder-a','reorder-b','reorder-c'];
  for(const[index,bindingId]of bindings.entries()){
    const position=[12,31,73][index];
    if(position===undefined)throw Error('test binding rank absent');
    const created=await port.defineAndBindStep(seed.organizationId,{id:bindingId+':step',code:bindingId,name:bindingId,defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:position},{...scope,bindingId,workItemTypeId:index===0?null:index===1?seed.typeId:seed.secondTypeId,position},seed.stamp);
    expect(created.ok).toBe(true);
  }
  const elsewhere=scopeKind==='organization'?{scopeKind:'project' as const,scopeId:seed.projectId}:{scopeKind:'organization' as const,scopeId:seed.organizationId};
  expect((await port.bindStep(seed.organizationId,{...elsewhere,bindingId:'reorder-elsewhere',stepId:'reorder-a:step',workItemTypeId:null,position:5},seed.stamp)).ok).toBe(true);
  expect((await port.defineAndBindStep(seed.foreignOrganizationId,{id:'reorder-foreign:step',code:'reorder-foreign',name:'reorder foreign',defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:1},{bindingId:'reorder-foreign',scopeKind:'project',scopeId:seed.foreignProjectId,workItemTypeId:null,position:1},seed.stamp)).ok).toBe(true);
  expect(await source.stores.workPackages.setStepUnit(seed.workPackageId,'reorder-a:step','minutes',seed.stamp)).toMatchObject({ok:true});
  expect(await source.stores.workPackages.setStepAllowance(seed.workPackageId,'reorder-a:step',13.25,seed.stamp)).toMatchObject({ok:true});
  const leaf='reorder-protected-leaf';
  await source.stores.workItems.insert(workItemRow({id:leaf,workPackageId:seed.workPackageId}),[],seed.stamp);
  expect(await source.stores.estimates.set({workItemId:leaf,stepId:'reorder-a:step',optimistic:1,realistic:2,pessimistic:3},seed.stamp)).toBe('written');
  const before=fixture.readEvidence(),catalogue=await port.readCatalogue(seed.organizationId);
  if(catalogue===null)throw Error('test own catalogue absent after healthy definitions');
  expect(catalogue.bindings.filter(binding=>binding.scopeKind===scope.scopeKind&&binding.scopeId===scope.scopeId).map(binding=>binding.bindingId).sort()).toEqual(bindings);
  // Missing method is a scaffolding failure only; the later guards need observed omissions.
  expect(typeof port.reorderBindings).toBe('function');
  for(const ids of [[],['reorder-a','reorder-b'],['reorder-a','reorder-b','reorder-b'],['reorder-a','reorder-b','reorder-elsewhere'],['reorder-a','reorder-b','reorder-foreign'],['reorder-a','reorder-b','absent'],[...bindings,'reorder-a'],[...bindings,'reorder-elsewhere']]){
    expect(await port.reorderBindings(seed.organizationId,scope,ids,seed.stamp)).toEqual({ok:false,reason:'stale_order'});
    expect(fixture.readEvidence()).toEqual(before);
  }
  expect(await port.reorderBindings(seed.organizationId,{scopeKind:'project',scopeId:seed.foreignProjectId},[],seed.stamp)).toEqual({ok:false,reason:'not_found'});
  expect(await port.reorderBindings(seed.organizationId,{scopeKind:'project',scopeId:'absent'},[],seed.stamp)).toEqual({ok:false,reason:'not_found'});
  expect(await port.reorderBindings('absent',scope,[],seed.stamp)).toEqual({ok:false,reason:'not_found'});
  expect(await port.reorderBindings(seed.organizationId,{scopeKind:'project',scopeId:seed.projectId+':empty'},[],seed.stamp)).toEqual({ok:true,workPackageIds:[],projectIds:[]});
  expect(await port.reorderBindings(seed.organizationId,scope,bindings,seed.stamp)).toEqual({ok:true,workPackageIds:[],projectIds:[]});
  expect(fixture.readEvidence()).toEqual(before);
  const projects=await readProjectRevisions(fixture,readProjectRevision);
  const revisions=await Promise.all([seed.workPackageId,seed.siblingWorkPackageId,seed.foreignWorkPackageId].map(id=>readRevision(fixture,id)));
  const next=['reorder-c','reorder-a','reorder-b'];
  const affectedPackages=scopeKind==='organization'?[seed.workPackageId,seed.siblingWorkPackageId].sort():[seed.workPackageId];
  const affectedProjects=scopeKind==='organization'?[seed.projectId,seed.siblingProjectId,seed.projectId+':empty'].sort():scopeKind==='space'?[seed.projectId,seed.projectId+':empty'].sort():[seed.projectId];
  expect(await port.reorderBindings(seed.organizationId,scope,next,seed.stamp)).toEqual({ok:true,workPackageIds:affectedPackages,projectIds:affectedProjects});
  const reordered=await port.readCatalogue(seed.organizationId);
  if(reordered===null)throw Error('test own catalogue disappeared after reorder');
  expect(reordered.definitions).toEqual(catalogue.definitions);
  expect(reordered.bindings.filter(binding=>binding.scopeKind!==scope.scopeKind||binding.scopeId!==scope.scopeId)).toEqual(catalogue.bindings.filter(binding=>binding.scopeKind!==scope.scopeKind||binding.scopeId!==scope.scopeId));
  for(const[index,id]of next.entries()){
    const original=catalogue.bindings.find(binding=>binding.bindingId===id);
    if(original===undefined)throw Error('test original binding absent');
    expect(reordered.bindings.find(binding=>binding.bindingId===id)).toEqual({...original,position:(index+1)*10});
  }
  expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
  expect(fixture.readEvidence().estimates).toEqual(before.estimates);
  expect(readProjectRevision(seed.projectId)).toBe(projects.own+1);
  expect(readProjectRevision(seed.siblingProjectId)).toBe(projects.sibling+(scopeKind==='organization'?1:0));
  expect(readProjectRevision(seed.projectId+':empty')).toBe(projects.empty+(scopeKind==='project'?0:1));
  expect(readProjectRevision(seed.foreignProjectId)).toBe(projects.foreign);
  expect(await readRevision(fixture,seed.workPackageId)).toBe(Number(revisions[0])+1);
  expect(await readRevision(fixture,seed.siblingWorkPackageId)).toBe(Number(revisions[1])+(scopeKind==='organization'?1:0));
  expect(await readRevision(fixture,seed.foreignWorkPackageId)).toBe(revisions[2]);
  const after=fixture.readEvidence();
  expect(await port.reorderBindings(seed.organizationId,scope,next,seed.stamp)).toEqual({ok:true,workPackageIds:[],projectIds:[]});
  expect(fixture.readEvidence()).toEqual(after);
}

async function reorderBorrowed(fixture:StepCatalogueFixture){
  const{seed,port,source}=fixture,scope={scopeKind:'project' as const,scopeId:seed.projectId};
  for(const[index,bindingId]of ['reorder-a','reorder-b'].entries())expect((await port.defineAndBindStep(seed.organizationId,{id:bindingId+':step',code:bindingId,name:bindingId,defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:index+1},{...scope,bindingId,workItemTypeId:null,position:index+1},seed.stamp)).ok).toBe(true);
  const before=fixture.readEvidence();
  expect(typeof port.reorderBindings).toBe('function');
  await source.uow.run(async({stores})=>{
    expect(await stores.stepCatalogue.reorderBindings(seed.organizationId,scope,['reorder-b','reorder-a'],seed.stamp)).toMatchObject({ok:true,workPackageIds:[seed.workPackageId],projectIds:[seed.projectId]});
    return{commit:false,value:undefined};
  });
  expect(fixture.readEvidence()).toEqual(before);
  await source.uow.run(async({stores})=>{
    expect(await stores.stepCatalogue.reorderBindings(seed.organizationId,scope,['reorder-b'],seed.stamp)).toEqual({ok:false,reason:'stale_order'});
    await stores.workItems.insert(workItemRow({id:'reorder-unrelated',workPackageId:seed.workPackageId}),[],seed.stamp);
    return{commit:true,value:undefined};
  });
  expect(await source.stores.workItems.findById('reorder-unrelated')).not.toBeNull();
  expect((await port.readCatalogue(seed.organizationId))?.bindings.map(({bindingId,position})=>({bindingId,position}))).toEqual([{bindingId:'reorder-a',position:1},{bindingId:'reorder-b',position:2}]);
}

export const CATALOGUE_REVISION_ASSERTIONS=[
  {caseId:'binding-reorder-organization',assert:(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision)=>reorderBindingsAt(fixture,readProjectRevision,'organization')},
  {caseId:'binding-reorder-space',assert:(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision)=>reorderBindingsAt(fixture,readProjectRevision,'space')},
  {caseId:'binding-reorder-project',assert:(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision)=>reorderBindingsAt(fixture,readProjectRevision,'project')},
  {caseId:'binding-reorder-borrowed',assert:reorderBorrowed},
  {caseId:'definition-patch-revisions-and-noop',assert:patchMetadata},
  {caseId:'definition-reach-revisions',assert:defineOrganization},
  {caseId:'binding-provenance-revisions',assert:bindProvenance},
  {caseId:'unbind-scope-revisions',assert:unbindScope},
];

/** All actual Source operations settle before its fixture's existing retirement owner runs. */
export async function runCatalogueRevisionCase(fixture:StepCatalogueFixture,observe:(fixture:StepCatalogueFixture,readProjectRevision:ReadProjectRevision)=>Promise<void>,readProjectRevision:ReadProjectRevision):Promise<void>{
  let primary:{cause:unknown}|undefined;
  try{await observe(fixture,readProjectRevision);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'catalogue revision observation and Source close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}
