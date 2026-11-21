import { type } from 'arktype';

import { requestSchema } from './schema-shape';
const internalEndpoint = type({ kind: "'internal'", scope: "'whole'", workItem: 'string' })
  .or({ kind: "'internal'", scope: "'node'", workItem: 'string', step: 'string' })
  .or({ kind: "'internal'", scope: "'descendant-step'", workItem: 'string', step: 'string' });
const externalDisplay = type({
  projectName: 'string',
  abbreviation: 'string',
  workItemName: 'string',
  address: 'string',
  'stepName?': 'string',
});
const externalEndpoint = type({
  kind: "'external'",
  scope: "'whole'",
  projectId: 'string',
  workItemId: 'string',
  display: externalDisplay,
}).or({
  kind: "'external'",
  scope: "'node' | 'descendant-step'",
  projectId: 'string',
  workItemId: 'string',
  stepId: 'string',
  // Proof: making stepName optional admitted the missing-label classifier test
  // in plan-document.resource.test.ts (2026-10-22).
  display: externalDisplay.and({ stepName: 'string' }),
});
const documentV12TypedDependency = type({
  id: 'string',
  predecessor: internalEndpoint.or(externalEndpoint),
  successor: internalEndpoint,
  type: "'FS' | 'SS' | 'FF'",
});
const documentExternalIdentity = type({
  scope: "'whole'",
  projectId: 'string',
  workItemId: 'string',
}).or({
  scope: "'node' | 'descendant-step'",
  projectId: 'string',
  workItemId: 'string',
  stepId: 'string',
});
const documentExternalMapping = type({
  source: documentExternalIdentity,
  destination: documentExternalIdentity,
});
/** Strict published12 leaves keep old identity/display spelling; version selection happens before this decoder. */
export const legacyDocumentDependency12Request = requestSchema(documentV12TypedDependency);
export type LegacyDocumentDependency12 = typeof documentV12TypedDependency.infer;
/** Source/destination spelling is checked before any current import identity is constructed. */
export const legacyDocumentMapping12Request = requestSchema(documentExternalMapping);
export type LegacyDocumentMapping12 = typeof documentExternalMapping.infer;

/** Raw published12 dependency shape for complete historical response construction. */
export function createLegacyDocumentDependency12() {
  return documentV12TypedDependency;
}
