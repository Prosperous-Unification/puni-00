import type { StandardSchemaV1 } from '@ark/schema';
import {
  type DocumentExternalMapping,
  type DocumentV14TypedDependency,
  type LegacyDocumentDependency12,
  legacyDocumentDependency12Request,
  type LegacyDocumentMapping12,
  legacyDocumentMapping12Request,
  validateSchema,
} from '@wbs/contracts';

/** Projects only the owned published12 external names after strict legacy validation. */
function readLegacyPredecessor(
  endpoint: LegacyDocumentDependency12['predecessor'],
): DocumentV14TypedDependency['predecessor'] {
  if (endpoint.kind === 'internal') return endpoint;
  const display = {
    workPackageName: endpoint.display.projectName,
    abbreviation: endpoint.display.abbreviation,
    workItemName: endpoint.display.workItemName,
    address: endpoint.display.address,
    ...(endpoint.display.stepName === undefined ? {} : { stepName: endpoint.display.stepName }),
  };
  if (endpoint.scope === 'whole')
    return {
      kind: 'external',
      scope: 'whole',
      workPackageId: endpoint.projectId,
      workItemId: endpoint.workItemId,
      display,
    };
  return {
    kind: 'external',
    scope: endpoint.scope,
    workPackageId: endpoint.projectId,
    workItemId: endpoint.workItemId,
    stepId: endpoint.stepId,
    display: { ...display, stepName: endpoint.display.stepName },
  };
}

/** Refuses mixed historical/current leaves; diagnostics retain the original request paths. */
export async function readLegacyDocumentDependency12(
  input: unknown,
): Promise<StandardSchemaV1.Result<DocumentV14TypedDependency>> {
  const checked = await validateSchema(legacyDocumentDependency12Request, input);
  if (checked.issues !== undefined) return checked;
  return {
    value: { ...checked.value, predecessor: readLegacyPredecessor(checked.value.predecessor) },
  };
}

/** Converts only an already validated published12 mapping identity. */
function readLegacyIdentity(
  identity: LegacyDocumentMapping12['source'],
): DocumentExternalMapping['source'] {
  if (identity.scope === 'whole')
    return { scope: 'whole', workPackageId: identity.projectId, workItemId: identity.workItemId };
  return {
    scope: identity.scope,
    workPackageId: identity.projectId,
    workItemId: identity.workItemId,
    stepId: identity.stepId,
  };
}

/** Keeps legacy mapping decoding separate from current14 admission, without fallback. */
export async function readLegacyDocumentMapping12(
  input: unknown,
): Promise<StandardSchemaV1.Result<DocumentExternalMapping>> {
  const checked = await validateSchema(legacyDocumentMapping12Request, input);
  if (checked.issues !== undefined) return checked;
  return {
    value: {
      source: readLegacyIdentity(checked.value.source),
      destination: readLegacyIdentity(checked.value.destination),
    },
  };
}
