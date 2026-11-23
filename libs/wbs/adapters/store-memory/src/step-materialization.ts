import {
  type PackageSteps,
  type PackageStepValues,
  projectPackageSteps,
  readPackageStepValues,
  readStepDefinition,
} from '@wbs/core';
import type { WorkPackageChain } from '@wbs/domain';

import type { MemoryStepCatalogueScope, MemoryStepCatalogueTables } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';

/** Resolves a complete package union using only captured scope, identities and explicit values. */
export function readMemoryCataloguePackageIn(
  captured: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueScope,
  chain: WorkPackageChain,
): PackageSteps {
  const { bindings, identities } = captureMemoryCatalogueScope(captured, context).bindingRows(
    captured,
    chain.organizationId,
    chain,
  );
  const values = new Map<string, PackageStepValues>();
  for (const stepId of identities.keys()) {
    const row = captured.packageValues.get(chain.workPackageId)?.get(stepId);
    if (row !== undefined)
      values.set(stepId, readPackageStepValues(row, chain.workPackageId, stepId));
  }
  return projectPackageSteps(chain, bindings, identities, values);
}

/** One package's reached union, independent of leaves; only missing explicit values are inserted. */
export function materializeMemoryPackageValuesIn(
  captured: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueScope,
  chain: WorkPackageChain,
): void {
  const { identities } = captureMemoryCatalogueScope(captured, context).bindingRows(
    captured,
    chain.organizationId,
    chain,
  );
  let values = captured.packageValues.get(chain.workPackageId);
  if (values === undefined) {
    values = new Map();
    captured.packageValues.set(chain.workPackageId, values);
  }
  for (const stepId of identities.keys()) {
    if (values.has(stepId)) continue;
    const definition = captured.definitions.get(stepId);
    if (definition === undefined) throw new Error('catalogue reached definition disappeared');
    const decoded = readStepDefinition(definition);
    values.set(stepId, {
      workPackageId: chain.workPackageId,
      stepId,
      estimateUnit: decoded.defaultEstimateUnit,
      allowanceBps: definition.defaultAllowanceBps,
      allowanceRevision: 0,
    });
  }
  readMemoryCataloguePackageIn(captured, context, chain);
}
