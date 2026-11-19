import {projectPackageSteps,readCatalogueId,readPackageStepValues,type PackageStepValues,type Step} from '@wbs/core';

import {captureMemoryCatalogueScope} from './step-catalogue-scope';
import type {MemoryStepCatalogueContext,MemoryStepCatalogueTables} from './step-catalogue';

/** Actual current chain union and controlling binding position; global defaults and old Step rows never supply values. */
export function readMemoryPackageStepsIn(
  catalogue:MemoryStepCatalogueTables,
  context:MemoryStepCatalogueContext,
  workPackageId:string,
):Step[]{
  const owner=context.packageOrganization.get(workPackageId);
  if(owner===undefined&&!context.packages.has(workPackageId)&&!catalogue.packageValues.has(workPackageId))return[];
  const organizationId=readCatalogueId(owner,'package steps organization');
  const capture=captureMemoryCatalogueScope(catalogue,context);
  const chain=capture.packageChain(organizationId,workPackageId);
  if(chain===null)throw new Error('selected package step chain is absent');
  const {bindings,identities}=capture.bindingRows(catalogue,organizationId,chain);
  const values=new Map<string,PackageStepValues>();
  for(const stepId of identities.keys()){
    const row=catalogue.packageValues.get(workPackageId)?.get(stepId);
    if(row!==undefined)values.set(stepId,readPackageStepValues(row,workPackageId,stepId));
  }
  const resolved=projectPackageSteps(chain,bindings,identities,values);
  const byBinding=new Map(bindings.map(binding=>[binding.bindingId,binding]));
  return resolved.steps.map(step=>{
    const provenance=step.via.at(0);
    const controlling=provenance===undefined?undefined:byBinding.get(provenance.bindingId);
    if(controlling===undefined||controlling.stepId!==step.stepId)throw new Error('resolved package step controlling binding is absent');
    return{id:step.stepId,workPackageId,code:step.code,name:step.name,position:controlling.position,estimateUnit:step.estimateUnit,allowancePercent:step.allowancePercent};
  });
}
