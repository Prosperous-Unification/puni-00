import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import type { RegistryClientPullPlan } from './registry-client-plan';
import { selectRegistryClientArtifact } from './registry-client-software';

const Identity = type('0 < string <= 256');
const Hash = type(/^[a-f0-9]{64}$/);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const Ownership = type({
  operationId: Identity,
  registryId: Identity,
  snapshotId: Hash,
  scope: "'current'|'recovery'",
  '+': 'reject',
});
export type RegistryClientOwnership = typeof Ownership.infer;
/** Nonsecret root completion, produced only after all planned clients, server, credentials and namespace effects terminate. Its transport authentication is supplied separately by the fixed root channel. */
export const RegistryClientCompletion = Ownership.merge({
  journalRevision: 'number.safe >= 0',
  storageId: Identity,
  registryPath: Identity.narrow(isAbsolute),
  censusSha256: Hash,
  filesystem: Identity,
  planSha256: Hash,
  coverageSha256: Hash,
  revisionsSha256: Hash,
  pullCount: 'number.safe >= 0',
  clientSha256: Hash,
  completedAt: Timestamp,
  // Proof: the host extra-receipt negative settled a token-bearing completion when merge lost the base undeclared-key policy.
  '+': 'reject',
});
export type RegistryClientCompletion = typeof RegistryClientCompletion.infer;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Pure completion projection for the exact root-owned plan, never evidence that an unexecuted plan succeeded. The fixed root action calls this only after teardown; callers must authenticate that action before persisting its value. */
export function createRegistryClientCompletion(
  plan: RegistryClientPullPlan,
  owner: RegistryClientOwnership,
  at: string,
): RegistryClientCompletion {
  return RegistryClientCompletion.assert({
    ...owner,
    ...plan.binding,
    planSha256: hash(plan),
    coverageSha256: hash(
      plan.pulls.map((pull) => ({
        repository: pull.repository,
        reference: pull.reference,
        selection: pull.selection,
      })),
    ),
    revisionsSha256: hash(
      plan.revisions.map((revision) => revision.repository + '@' + revision.digest).sort(),
    ),
    pullCount: plan.pulls.length,
    clientSha256: selectRegistryClientArtifact().sha256,
    completedAt: at,
  });
}

/** Reject malformed, foreign, stale, future or changed root completion against the independently computed parent plan. A five-minute fresh completion never substitutes for channel authentication or actual terminal teardown. */
export function requireRegistryClientCompletion(
  input: unknown,
  expected: { plan: RegistryClientPullPlan; owner: RegistryClientOwnership; now: string },
): RegistryClientCompletion {
  const receipt = RegistryClientCompletion.assert(structuredClone(input));
  Timestamp.assert(expected.now);
  const age = Date.parse(expected.now) - Date.parse(receipt.completedAt);
  if (age < 0 || age > 300000) throw new Error('Client completion is stale or future');
  const actual = createRegistryClientCompletion(expected.plan, expected.owner, receipt.completedAt);
  for (const key of Object.keys(actual)) {
    const name = RegistryClientCompletion.keyof().assert(key);
    if (receipt[name] !== actual[name])
      throw new Error('Client completion differs from the independently verified plan or owner');
  }
  return receipt;
}
