import {
  type AuthenticatedUser, bindCatalogueStep, listStepCatalogue, patchStepDefinition, retireStepDefinition, unbindCatalogueStep, reorderCatalogueBindings, readProjectSteps, readProjectStepUsage, readProjectStepManifest,
} from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { ProjectCaller } from '../ports/project-administration';
import type { StepDefinition } from '../ports/step-catalogue';
import type { CatalogueBindingDraft, CatalogueReadRefusal, CatalogueWriteRefusal, StepCataloguePurpose } from '../service/step-catalogue-purpose';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Validated domain defaults become exact integer hundredths; no package value is projected here. */
function definitionReply(definition:StepDefinition){
  const {defaultAllowancePercent,...identity}=definition;
  return{...identity,defaultAllowanceBps:Math.round(defaultAllowancePercent*100)};
}
/** Keeps each boundary code paired with the response arm declared by all catalogue writes. */
function requestFailure(failure:RequestFailure){
  switch(failure.code){
    case 'invalid_body':return{ok:false,status:422,body:{error:'invalid_body'}}as const;
    case 'invalid_json':return{ok:false,status:400,body:{error:'invalid_json'}}as const;
    case 'invalid_params':return{ok:false,status:400,body:{error:'invalid_params'}}as const;
    case 'invalid_query':return{ok:false,status:400,body:{error:'invalid_query'}}as const;
  }
}
/** Keeps each read refusal in its declared arm without adding write-only scope or body errors. */
function readRefusalReply(refusal:CatalogueReadRefusal){
  if('refusal'in refusal)return organizationRefusal(refusal);
  if(refusal.reason==='not_found')return{ok:false,status:404,body:{error:'not_found'}}as const;
  return{ok:false,status:403,body:{error:'forbidden',permission:refusal.permission}}as const;
}

function refusalReply(refusal:CatalogueWriteRefusal){
  if('refusal'in refusal)return organizationRefusal(refusal);
  if(refusal.reason==='not_found')return{ok:false,status:404,body:{error:refusal.reason}}as const;
  if(refusal.reason==='forbidden')return{ok:false,status:403,body:{error:refusal.reason,permission:refusal.permission}}as const;
  return{ok:false,status:403,body:{error:refusal.reason}}as const;
}

/** Current selected-organization routes; retained initial evidence is admitted again by the same-writer purpose. */
export function stepCatalogueRoutes(catalogue:StepCataloguePurpose,organizations:OrganizationAccess){
  const callerOf=async(principal:AuthenticatedUser)=>{
    principal=structuredClone(principal);
    const resolved=await organizations.resolve(principal);
    if(!resolved.ok)return resolved;
    if(resolved.access.kind==='legacy')return{ok:false,refusal:'no_active_organization'}as const;
    const caller:ProjectCaller={kind:'human',principal,expectedAccess:resolved.access};
    return{ok:true,caller}as const;
  };
  return[
    bind(listStepCatalogue,async({principal}):Promise<HttpReply<typeof listStepCatalogue>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const observed=await catalogue.read(caller.caller);
      if(!observed.ok){
        if('refusal'in observed)return organizationRefusal(observed);
        if(observed.reason==='not_found')return{ok:false,status:404,body:{error:'not_found'}};
        return{ok:false,status:403,body:{error:'forbidden',permission:observed.permission}};
      }
      return{ok:true,status:200,body:{definitions:observed.catalogue.definitions.map(definitionReply),bindings:observed.catalogue.bindings.map(binding=>({...binding}))}};
    }),
    bind(readProjectSteps,async({principal,params,query}):Promise<HttpReply<typeof readProjectSteps>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const resolved=await catalogue.readProjectSteps(caller.caller,params.id,query.type);
      if(!resolved.ok)return readRefusalReply(resolved);
      return{ok:true,status:200,body:{steps:resolved.steps.map(step=>({...step,via:step.via.map(binding=>({...binding}))}))}};
    },{prevalidate:request=>{
      // Proof: omitting raw cardinality let the real repeated-type GET collapse to200instead of400; exact restore passed (verification-project-step-read-20261119.json).
      if(request.url.searchParams.getAll('type').length>1)return{ok:false,status:400,body:{error:'invalid_query'}}as const;
      return null;
    }}),
    bind(readProjectStepUsage, async({principal, params, query}): Promise<HttpReply<typeof readProjectStepUsage>> => {
      const caller = await callerOf(principal);
      if (!caller.ok) return organizationRefusal(caller);
      const usage = await catalogue.readProjectUsage(caller.caller, params.id, query.stepId);
      if (!usage.ok) return readRefusalReply(usage);
      return {ok: true, status: 200, body: {count: usage.count, pairs: usage.pairs.map(pair => ({...pair, facts: [...pair.facts]}))}};
    }, {prevalidate: request => {
      // Proof: omitting raw cardinality changed repeated stepId400to200 after the
      // declared-query adapter collapsed it; exact restore passed (verification-project-usage-read-20261119.json).
      if (request.url.searchParams.getAll('stepId').length > 1) return {ok: false, status: 400, body: {error: 'invalid_query'}} as const;
      return null;
    }}),
    bind(readProjectStepManifest, async({principal, params}): Promise<HttpReply<typeof readProjectStepManifest>> => {
      const caller = await callerOf(principal);
      if (!caller.ok) return organizationRefusal(caller);
      const observed = await catalogue.readProjectManifest(caller.caller, params.id);
      if (!observed.ok) return readRefusalReply(observed);
      const manifest = observed.manifest;
      return {ok: true, status: 200, body: {...manifest, project: {...manifest.project}, default: [...manifest.default], types: manifest.types.map(type => ({workItemTypeId: type.workItemTypeId, codes: [...type.codes]}))}};
    }),
    bind(bindCatalogueStep,async({principal,body}):Promise<HttpReply<typeof bindCatalogueStep>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const scope={scopeKind:body.scopeKind,scopeId:body.scopeId,position:body.position,workItemTypeId:body.workItemTypeId};
      const draft:CatalogueBindingDraft=body.define===undefined?{...scope,stepId:body.stepId}:{...scope,define:{code:body.define.code,name:body.define.name,position:body.define.position,defaultEstimateUnit:body.define.defaultEstimateUnit,defaultAllowancePercent:body.define.defaultAllowanceBps/100}};
      const bound=await catalogue.bind(caller.caller,draft);
      if(!bound.ok){
        if('reason'in bound){
          if(bound.reason==='code_taken'||bound.reason==='name_taken'||bound.reason==='duplicate_binding')return{ok:false,status:409,body:{error:bound.reason}};
          if(bound.reason==='name_required')return{ok:false,status:422,body:{error:'name_required'}};
          if(bound.reason==='invalid_code')return{ok:false,status:422,body:{error:'invalid_code'}};
          if(bound.reason==='reserved_code')return{ok:false,status:422,body:{error:'reserved_code'}};
        }
        return refusalReply(bound);
      }
      return{ok:true,status:201,body:{binding:{...bound.binding},...(bound.definition===undefined?{}:{definition:definitionReply(bound.definition)})}};
    },{classifyRequestFailure:requestFailure}),
    bind(patchStepDefinition,async({principal,params,body}):Promise<HttpReply<typeof patchStepDefinition>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const patched=await catalogue.patch(caller.caller,params.stepId,{
        ...(body.name===undefined?{}:{name:body.name}),
        ...(body.defaultEstimateUnit===undefined?{}:{defaultEstimateUnit:body.defaultEstimateUnit}),
        ...(body.defaultAllowanceBps===undefined?{}:{defaultAllowancePercent:body.defaultAllowanceBps/100}),
      });
      if(!patched.ok){
        if('reason'in patched){
          if(patched.reason==='name_taken')return{ok:false,status:409,body:{error:patched.reason}};
          if(patched.reason==='name_required')return{ok:false,status:422,body:{error:'name_required'}};
          if(patched.reason==='invalid_body')return{ok:false,status:422,body:{error:'invalid_body'}};
        }
        return refusalReply(patched);
      }
      return{ok:true,status:200,body:{definition:definitionReply(patched.definition)}};
    },{classifyRequestFailure:requestFailure}),
    bind(retireStepDefinition,async({principal,params}):Promise<HttpReply<typeof retireStepDefinition>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const retired=await catalogue.retire(caller.caller,params.stepId);
      if(!retired.ok){
        if('reason'in retired&&retired.reason==='step_bound')return{ok:false,status:409,body:{error:retired.reason}};
        return refusalReply(retired);
      }
      return{ok:true,status:204,body:EMPTY};
    },{classifyRequestFailure:requestFailure}),
    bind(reorderCatalogueBindings,async({principal,body}):Promise<HttpReply<typeof reorderCatalogueBindings>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const changed=await catalogue.reorder(caller.caller,{scopeKind:body.scopeKind,scopeId:body.scopeId},body.ids);
      if(!changed.ok){
        if('reason'in changed&&changed.reason==='stale_order')return{ok:false,status:409,body:{error:'stale_order'}};
        return refusalReply(changed);
      }
      return{ok:true,status:204,body:EMPTY};
    },{classifyRequestFailure:requestFailure}),
    bind(unbindCatalogueStep,async({principal,params,body}):Promise<HttpReply<typeof unbindCatalogueStep>>=>{
      const caller=await callerOf(principal);
      if(!caller.ok)return organizationRefusal(caller);
      const changed=await catalogue.unbind(caller.caller,params.bindingId,{dryRun:body.dryRun});
      if(!changed.ok){
        if('reason'in changed&&changed.reason==='step_nodes_in_use')return{ok:false,status:409,body:{error:'step_nodes_in_use',count:changed.count,pairs:changed.pairs.map(pair=>({...pair,facts:[...pair.facts]}))}};
        return refusalReply(changed);
      }
      if(changed.kind==='preview'){
        if(changed.wouldRefuse===null)return{ok:true,status:200,body:{wouldRefuse:null}};
        return{ok:true,status:200,body:{wouldRefuse:'step_nodes_in_use',count:changed.count,pairs:changed.pairs.map(pair=>({...pair,facts:[...pair.facts]}))}};
      }
      return{ok:true,status:204,body:EMPTY};
    },{classifyRequestFailure:requestFailure}),
  ]as const;
}
