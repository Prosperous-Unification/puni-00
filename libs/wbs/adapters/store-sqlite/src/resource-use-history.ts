import { resourceUse } from '@wbs/contracts';
import type { ResourceUse } from '@wbs/domain';
import { type } from 'arktype';

const state =
  "'active' | 'cleanup_pending' | 'blocked' | 'retained' | 'release_reported' | 'release_verified'";
const legacyUse = type({
  id: 'string',
  source: "'reported' | 'runtime'",
  organizationId: 'string | null',
  projectId: 'string',
  projectName: 'string',
  resourceId: 'string',
  resourceName: 'string',
  unitLabel: 'string',
  providerId: 'string | null',
  providerName: 'string | null',
  workItemId: 'string',
  workItemName: 'string',
  stepId: 'string | null',
  attemptNumber: 'number | null',
  agentRun: 'string',
  responsiblePersonId: 'string',
  responsiblePersonName: 'string',
  locator: 'string',
  units: 'number',
  state,
  revision: 'number',
  createdAt: 'number',
  updatedAt: 'number',
  createdBy: 'string',
  updatedBy: 'string',
  'runtimeId?': 'string',
  'runtimeRevision?': 'number',
  'incarnation?': 'string',
  'pendingCleanupRequest?': 'boolean',
  'reclaimedBytes?': 'null',
  retention: type({ ownerPersonId: 'string', reason: 'string', reviewAt: 'number' }).or('null'),
}).onDeepUndeclaredKey('reject');
const currentUse = resourceUse.onDeepUndeclaredKey('reject');

/**
 * Decodes the observed projection, never a current plan. Published projectId/projectName
 * and current workPackageId/workPackageName are separate strict shapes; mixed or malformed
 * trusted state throws. Original bytes, revision, state, attribution and observed names
 * are untouched. This is unrelated to immutable runtime fingerprint encoding.
 */
export function readStoredResourceUse(candidate: unknown): ResourceUse {
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    // Proof: resource-snapshot-legacy-dispatch.
    // Injected fault failed `migrated reported resource projection preserves original attribution under current owner names`; restored GREEN.
    // Injected fault failed `original manual actor retries return original registration and event observations after live name changes`; restored GREEN.
    // Evidence scope: production-behavior.
    ('projectId' in candidate || 'projectName' in candidate)
  ) {
    // Proof: resource-snapshot-legacy-grammar.
    // Injected fault failed `resource append refuses malformed historical projection before committing transition`; restored GREEN.
    // Evidence scope: production-behavior.
    const { projectId, projectName, ...observed } = legacyUse.assert(candidate);
    // Proof: resource-snapshot-owned-projection.
    // Injected fault failed `migrated reported resource projection preserves original attribution under current owner names`; restored GREEN.
    // Evidence scope: one observed owner/name projection tuple proof.
    return { ...observed, workPackageId: projectId, workPackageName: projectName };
  }
  // Proof: resource-snapshot-current-grammar.
  // Injected fault failed `resource append refuses malformed current projection before committing transition`; restored GREEN.
  // Evidence scope: trusted-state validation/atomicity; HTTP response schema may still500 after wrong committed transition.
  return currentUse.assert(candidate);
}
