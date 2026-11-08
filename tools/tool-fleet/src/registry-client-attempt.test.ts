import { expect, test } from 'bun:test';

import {
  createRegistryClientAttempt,
  describeRegistryClientAttempt,
  requireRegistryClientAttempt,
  requireRegistryClientAttemptContext,
} from './registry-client-attempt';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { RegistryClientInstallation } from './registry-maintenance-installation';

function fixture() {
  const artifact = (path: string) => ({ path, sha256: 'a'.repeat(64) });
  const profile = RegistryClientInstallation.assert({
    state: 'enrolled',
    worker: artifact('/usr/local/libexec/puni-registry-maintenance/client-worker.js'),
    scope: artifact('/usr/bin/systemd-run'),
    control: artifact('/usr/bin/systemctl'),
    mount: artifact('/usr/bin/mount'),
    ip: artifact('/usr/bin/ip'),
    scratch: {
      path: '/var/lib/puni-registry/pulls/contents',
      receiptPath: '/var/lib/puni-registry/journal/identities/pulls.receipt',
      storageId: '11111111-1111-4111-8111-111111111111',
      maximumBytes: 1024 ** 3,
      maximumInodes: 10000,
    },
  });
  if (profile.state !== 'enrolled') throw new Error('Missing explicit fixture enrollment');
  const plan: RegistryClientPullPlan = {
    binding: {
      journalRevision: 7,
      storageId: 'source',
      registryPath: '/source',
      censusSha256: 'c'.repeat(64),
      filesystem: '1:2',
    },
    revisions: [],
    pulls: [],
  };
  const owner = {
    operationId: 'maintain',
    registryId: 'proof',
    snapshotId: 'a'.repeat(64),
    scope: 'current' as const,
  };
  const facts = describeRegistryClientAttempt({
    plan,
    owner,
    token: '22222222-2222-4222-8222-222222222222',
    client: profile,
  });
  const guardian = {
    pid: 42,
    startTicks: '123',
    pidNamespace: 'pid:[1234]',
    bootId: '33333333-3333-4333-8333-333333333333',
    machineId: 'd'.repeat(32),
  };
  const at = '2026-10-31T16:00:00.000Z';
  const attempt = createRegistryClientAttempt({
    ...facts,
    pool: { device: '1', inode: '2' },
    guardian,
    createdAt: at,
  });
  return { plan, owner, facts, attempt, profile, at };
}
test('attempt binds canonical operation, plan, installed tools and private token hash without recording the token', () => {
  const proof = fixture();
  expect(() => {
    requireRegistryClientAttempt(proof.attempt, proof.facts);
  }).not.toThrow();
  expect(proof.attempt.unit).toBe('puni-registry-client-' + proof.attempt.id + '.scope');
  expect(JSON.stringify(proof.attempt)).not.toContain('22222222-2222-4222-8222-222222222222');
});
for (const field of [
  'operationId',
  'registryId',
  'snapshotId',
  'scope',
  'journalRevision',
  'storageId',
  'registryPath',
  'planSha256',
  'profileSha256',
  'tokenSha256',
  'scratchStorageId',
  'unit',
] as const)
  test('worker refuses foreign durable attempt ' + field, () => {
    const proof = fixture(),
      changed = { ...proof.attempt };
    if (field === 'scope') changed.scope = 'recovery';
    else if (field === 'journalRevision') changed.journalRevision++;
    else if (field === 'registryPath') changed.registryPath = '/foreign';
    else if (field === 'scratchStorageId')
      changed.scratchStorageId = '44444444-4444-4444-8444-444444444444';
    else if (field === 'unit')
      changed.unit = 'puni-registry-client-44444444-4444-4444-8444-444444444444.scope';
    else changed[field] = 'b'.repeat(64);
    expect(() => {
      requireRegistryClientAttempt(changed, proof.facts);
    }).toThrow();
  });
for (const fault of [
  'scope',
  'multiple-cgroups',
  'boot',
  'machine',
  'expired',
  'future',
  'unknown-clock',
] as const)
  test('worker refuses durable attempt outside its observed context ' + fault, () => {
    const proof = fixture();
    const observed = {
      cgroup: '0::/system.slice/' + proof.attempt.unit + '\n',
      bootId: proof.attempt.guardian.bootId,
      machineId: proof.attempt.guardian.machineId,
      now: proof.at,
    };
    if (fault === 'scope') observed.cgroup = '0::/foreign.scope\n';
    if (fault === 'multiple-cgroups') observed.cgroup += '1::/foreign\n';
    if (fault === 'boot') observed.bootId = '44444444-4444-4444-8444-444444444444';
    if (fault === 'machine') observed.machineId = 'a'.repeat(32);
    if (fault === 'expired') observed.now = '2026-10-31T17:00:00.001Z';
    if (fault === 'future') observed.now = '2026-10-31T15:59:59.999Z';
    if (fault === 'unknown-clock') observed.now = 'unknown';
    expect(() => {
      requireRegistryClientAttemptContext(proof.attempt, observed);
    }).toThrow();
  });
test('worker accepts only its actual unit, machine and boot within the attempt window', () => {
  const proof = fixture();
  expect(() => {
    requireRegistryClientAttemptContext(proof.attempt, {
      cgroup: '0::/system.slice/' + proof.attempt.unit + '\n',
      bootId: proof.attempt.guardian.bootId,
      machineId: proof.attempt.guardian.machineId,
      now: proof.at,
    });
  }).not.toThrow();
});

for (const fault of [
  'worker',
  'scope',
  'control',
  'mount',
  'ip',
  'scratch-limit',
  'token',
  'physical-plan',
] as const)
  test('independent attempt facts invalidate changed executable/budget/input ' + fault, () => {
    const proof = fixture();
    let token = '22222222-2222-4222-8222-222222222222';
    if (['worker', 'scope', 'control', 'mount', 'ip'].includes(fault)) {
      if (fault !== 'scratch-limit' && fault !== 'token' && fault !== 'physical-plan')
        proof.profile[fault].sha256 = 'b'.repeat(64);
    }
    if (fault === 'scratch-limit') proof.profile.scratch.maximumBytes++;
    if (fault === 'token') token = '44444444-4444-4444-8444-444444444444';
    if (fault === 'physical-plan')
      proof.plan = {
        ...proof.plan,
        binding: { ...proof.plan.binding, censusSha256: 'b'.repeat(64) },
      };
    const fresh = describeRegistryClientAttempt({
      plan: proof.plan,
      owner: proof.owner,
      token,
      client: proof.profile,
    });
    expect(() => {
      requireRegistryClientAttempt(proof.attempt, fresh);
    }).toThrow();
  });
