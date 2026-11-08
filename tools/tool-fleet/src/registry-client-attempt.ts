import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { RegistryBackupGuardian } from './registry-backup-attempt';
import type { RegistryClientOwnership } from './registry-client-completion';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { selectRegistryClientArtifact } from './registry-client-software';
import type { RegistryClientInstallation } from './registry-maintenance-installation';

const Identity = type('0 < string <= 256');
const Hash = type(/^[a-f0-9]{64}$/);
const Uuid = type(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const Owner = type({
  operationId: Identity,
  registryId: Identity,
  snapshotId: Hash,
  scope: "'current'|'recovery'",
  journalRevision: 'number.safe >= 0',
  storageId: Identity,
  registryPath: Identity.narrow(isAbsolute),
  planSha256: Hash,
  profileSha256: Hash,
  tokenSha256: Hash,
  scratchStorageId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  pool: { device: /^(?:0|[1-9][0-9]{0,19})$/, inode: /^[1-9][0-9]{0,19}$/, '+': 'reject' },
  guardian: RegistryBackupGuardian,
  createdAt: Timestamp,
  '+': 'reject',
});
/** Root-private ownership record on the bounded scratch filesystem, atomically published and fsynced before launching its uniquely named scope. It contains no capability token or credentials. */
export const RegistryClientAttempt = Owner.merge({
  id: Uuid,
  unit: /^puni-registry-client-[0-9a-f-]{36}\.scope$/,
  '+': 'reject',
});
export type RegistryClientAttempt = typeof RegistryClientAttempt.infer;

/** Mint a fresh scope identity from validated canonical operation/plan/profile and the held scratch-pool inode. Callers cannot select its nonce. */
export function createRegistryClientAttempt(owner: typeof Owner.infer): RegistryClientAttempt {
  const checked = Owner.assert(structuredClone(owner));
  const id = randomUUID();
  return RegistryClientAttempt.assert({
    ...checked,
    id,
    unit: 'puni-registry-client-' + id + '.scope',
  });
}

const Facts = Owner.omit('pool', 'guardian', 'createdAt');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Root parent and worker independently derive identical nonsecret operation/physical-plan/tool-profile facts. The token itself is never persisted. */
export function describeRegistryClientAttempt(input: {
  plan: RegistryClientPullPlan;
  owner: RegistryClientOwnership;
  token: string;
  client: Extract<RegistryClientInstallation, { state: 'enrolled' }>;
}): typeof Facts.infer {
  Uuid.assert(input.token);
  const client = input.client;
  return Facts.assert({
    ...input.owner,
    journalRevision: input.plan.binding.journalRevision,
    storageId: input.plan.binding.storageId,
    registryPath: input.plan.binding.registryPath,
    planSha256: digest(input.plan),
    profileSha256: digest([
      ...[
        client.worker,
        client.scope,
        client.control,
        client.mount,
        client.ip,
        selectRegistryClientArtifact(),
      ].map((artifact) => [artifact.path, artifact.sha256]),
      [
        client.scratch.path,
        client.scratch.receiptPath,
        client.scratch.storageId,
        // Proof: profile-budget removal accepts the changed scratch limit in registry-client-attempt.test.ts.
        client.scratch.maximumBytes,
        client.scratch.maximumInodes,
      ],
    ]),
    tokenSha256: createHash('sha256').update(input.token).digest('hex'),
    scratchStorageId: client.scratch.storageId,
  });
}

/** A worker cannot reuse an old or foreign plan/profile/capability attempt, even when its fixed namespace and installation are otherwise valid. */
export function requireRegistryClientAttempt(
  attempt: RegistryClientAttempt,
  expected: typeof Facts.infer,
): void {
  RegistryClientAttempt.assert(attempt);
  Facts.assert(expected);
  // Proof: attempt-unit removal accepts a nonce/scope mismatch in registry-client-attempt.test.ts.
  if (attempt.unit !== 'puni-registry-client-' + attempt.id + '.scope')
    throw new Error('Client attempt scope differs from its nonce');
  for (const key of Object.keys(expected)) {
    const name = Facts.keyof().assert(key);
    // Proof: attempt-facts removal accepts foreign operation/plan/profile/token facts in registry-client-attempt.test.ts.
    if (attempt[name] !== expected[name])
      throw new Error('Client attempt differs from current operation, plan or installed profile');
  }
}

/** Validate fresh kernel observations supplied from fixed paths by the root worker. Recovery may read older attempts; executing a worker requires its exact cgroup, machine, boot and a nonfuture one-hour attempt window. */
export function requireRegistryClientAttemptContext(
  attempt: RegistryClientAttempt,
  observed: {
    cgroup: string;
    bootId: string;
    machineId: string;
    now: string;
  },
): void {
  RegistryClientAttempt.assert(attempt);
  // Proof: attempt-clock removal accepts the unknown-clock negative in registry-client-attempt.test.ts.
  Timestamp.assert(observed.now);
  const groups = observed.cgroup.trimEnd().split('\n');
  const age = Date.parse(observed.now) - Date.parse(attempt.createdAt);
  // Proof: attempt-context removal accepts wrong cgroup/boot/machine or expired/future attempts in registry-client-attempt.test.ts.
  if (
    groups.length !== 1 ||
    !groups[0].startsWith('0::/') ||
    groups[0].split('/').at(-1) !== attempt.unit ||
    observed.bootId !== attempt.guardian.bootId ||
    observed.machineId !== attempt.guardian.machineId ||
    age < 0 ||
    age > 3600000
  )
    throw new Error('Client attempt does not belong to this current bounded worker');
}
