import {
  type PackageStepValues,
  projectPackageSteps,
  readCatalogueId,
  readPackageStepValues,
  type Step,
} from '@wbs/core';

import type { MemoryStepCatalogueScope, MemoryStepCatalogueTables } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';

/** Actual current chain union and controlling binding position; global defaults and old Step rows never supply values. */
export function captureMemoryPackageStepsIn(
  catalogue: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueScope,
  workPackageId: string,
) {
  const owner = context.packageOrganization.get(workPackageId);
  if (
    owner === undefined &&
    !context.packages.has(workPackageId) &&
    !catalogue.packageValues.has(workPackageId)
  )
    return null;
  const organizationId = readCatalogueId(owner, 'package steps organization');
  const capture = captureMemoryCatalogueScope(catalogue, context);
  const chain = capture.packageChain(organizationId, workPackageId);
  if (chain === null) throw new Error('selected package step chain is absent');
  const { bindings, identities } = capture.bindingRows(catalogue, organizationId, chain);
  const values = new Map<string, PackageStepValues>();
  for (const stepId of identities.keys()) {
    const row = catalogue.packageValues.get(workPackageId)?.get(stepId);
    if (row !== undefined) values.set(stepId, readPackageStepValues(row, workPackageId, stepId));
  }
  // Proof: omitting this projection accepted the missing explicit-value set in the actual Memory tree read (current-step-tree.test.ts).
  const resolved = projectPackageSteps(chain, bindings, identities, values);
  return { chain, bindings, identities, resolved };
}

/** Current package union as the compatibility Step DTO; leaf applicability is captured separately. */
export function readMemoryPackageStepsIn(
  catalogue: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueScope,
  workPackageId: string,
): Step[] {
  const captured = captureMemoryPackageStepsIn(catalogue, context, workPackageId);
  if (captured === null) return [];
  const { bindings, resolved } = captured;
  const byBinding = new Map(bindings.map((binding) => [binding.bindingId, binding]));
  return resolved.steps.map((step) => {
    const provenance = step.via.at(0);
    const controlling = provenance === undefined ? undefined : byBinding.get(provenance.bindingId);
    if (controlling?.stepId !== step.stepId)
      throw new Error('resolved package step controlling binding is absent');
    return {
      id: step.stepId,
      workPackageId,
      code: step.code,
      name: step.name,
      position: controlling.position,
      estimateUnit: step.estimateUnit,
      allowancePercent: step.allowancePercent,
    };
  });
}
