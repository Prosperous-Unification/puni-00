import { type } from 'arktype';
import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import {
  createRegistryClientAttempt,
  describeRegistryClientAttempt,
} from './registry-client-attempt';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { RegistryClientInstallation } from './registry-maintenance-installation';
import { requireRejection } from './registry-rejection.fixture';

const fault = type(
  "'none'|'missing-owner'|'plan'|'profile'|'token'|'cgroup'|'boot'|'machine'|'future'|'dirty-pool'",
).assert(process.argv.at(2));
const client = RegistryClientInstallation.assert({
  state: 'enrolled',
  ...Object.fromEntries(
    Object.entries({
      worker: '/usr/local/libexec/puni-registry-maintenance/client-worker.js',
      scope: '/usr/bin/systemd-run',
      control: '/usr/bin/systemctl',
      mount: '/usr/bin/mount',
      ip: '/usr/bin/ip',
    }).map(([name, path]) => [name, { path, sha256: 'a'.repeat(64) }]),
  ),
  scratch: {
    path: '/var/lib/puni-registry/pulls/contents',
    receiptPath: '/var/lib/puni-registry/journal/identities/pulls.receipt',
    storageId: '11111111-1111-4111-8111-111111111111',
    maximumBytes: 1024 ** 3,
    maximumInodes: 10000,
  },
});
if (client.state !== 'enrolled') throw new Error('Expected enrolled fixture client');
let plan: RegistryClientPullPlan = {
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
const token = '22222222-2222-4222-8222-222222222222';
const owner = {
  operationId: 'maintain',
  registryId: 'proof',
  snapshotId: 'a'.repeat(64),
  scope: 'current' as const,
};
const attempt = createRegistryClientAttempt({
  ...describeRegistryClientAttempt({ plan, owner, token, client }),
  pool: { device: '1', inode: '2' },
  guardian: {
    pid: 42,
    startTicks: '123',
    pidNamespace: 'pid:[1234]',
    bootId: '33333333-3333-4333-8333-333333333333',
    machineId: 'd'.repeat(32),
  },
  createdAt: new Date(Date.now() + (fault === 'future' ? 60000 : 0)).toISOString(),
});
if (fault === 'plan')
  plan = { ...plan, binding: { ...plan.binding, censusSha256: 'b'.repeat(64) } };
if (fault === 'profile') client.worker.sha256 = 'b'.repeat(64);
if (fault === 'token') attempt.tokenSha256 = 'b'.repeat(64);
const effects = { servers: 0, closed: false };
// Model privileged effects in this isolated child; execute the real worker body and validators.
await mock.module('./registry-client-pull', () => ({
  assertRegistryClientWorker: () => Promise.resolve(),
  createRegistryClientExecutor: () =>
    Promise.resolve(Object.assign(() => Promise.resolve(), { admit: () => Promise.resolve() })),
}));
await mock.module('./registry-authority-host', () => ({
  selectRegistryAuthorityStorage: () => ({
    path: '/source',
    storageId: 'source',
    maximumBytes: 50,
  }),
}));
await mock.module('./registry-client-attempt-store', () => ({
  openRegistryClientAttemptStore: () =>
    Promise.resolve({
      read: () => Promise.resolve(fault === 'missing-owner' ? null : attempt),
      assertEmpty: () =>
        invokeRegistryCallback(() => {
          if (fault === 'dirty-pool') throw new Error('Unresolved actual worker pool');
        }),
      close: () =>
        invokeRegistryCallback(() => {
          effects.closed = true;
        }),
    }),
}));
await mock.module('./registry-capacity', () => ({
  measureVerifiedFilesystem: () => Promise.resolve({ allocationUnitBytes: 4096 }),
}));
await mock.module('./registry-client-plan', () => ({
  planRegistryClientPulls: () => Promise.resolve(plan),
}));
await mock.module('node:fs/promises', () => ({
  readdir: () => Promise.resolve([]),
  readFile: (path: string) =>
    invokeRegistryCallback(() => {
      if (path === '/proc/self/cgroup')
        return fault === 'cgroup'
          ? '0::/foreign.scope\n'
          : '0::/system.slice/' + attempt.unit + '\n';
      if (path === '/proc/sys/kernel/random/boot_id')
        return (
          (fault === 'boot' ? '44444444-4444-4444-8444-444444444444' : attempt.guardian.bootId) +
          '\n'
        );
      if (path === '/etc/machine-id')
        return (fault === 'machine' ? 'a'.repeat(32) : attempt.guardian.machineId) + '\n';
      throw new Error('Unexpected kernel observation path');
    }),
}));
await mock.module('./registry-maintenance-server', () => ({
  runRegistryMaintenanceServer: async (input: {
    ready: () => Promise<void>;
    signal: AbortSignal;
  }) => {
    effects.servers++;
    await input.ready();
    input.signal.throwIfAborted();
  },
}));
const { verifyRegistryClientImages } = await import('./registry-client-verification');
const pending = verifyRegistryClientImages(
  // The isolated test models the already parsed host boundary: omitted fields are never consumed by this worker; canonical parsing is covered separately.
  {
    installed: {
      registryId: 'proof',
      journalPath: '/journal',
      ordinary: { path: '/source' },
      recovery: { state: 'unenrolled' },
      client,
    },
    journal: {
      fenced: true,
      maintenance: { operationId: 'maintain', token },
      maintenanceEvidence: { operationId: 'maintain', backup: { snapshotId: owner.snapshotId } },
    },
    scope: 'current',
    descriptor: 3,
    scratch: client.scratch,
  } as unknown as Parameters<typeof verifyRegistryClientImages>[0],
  new AbortController().signal,
);
if (fault === 'none') {
  const receipt = await pending;
  if (receipt.pullCount !== 0 || receipt.operationId !== 'maintain' || effects.servers !== 1)
    throw new Error('Valid worker failed to verify its exact empty plan');
} else {
  await requireRejection(pending);
  if (effects.servers !== 0) throw new Error('Unbound worker reached readonly server effects');
}
if (!effects.closed) throw new Error('Worker leaked attempt store descriptor');
console.log(JSON.stringify({ fault, refusedBeforeServer: fault !== 'none', closed: true }));
