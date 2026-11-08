import { mock } from 'bun:test';

import { createRegistryInstallation } from './registry-installation.fixture';
import {
  parseRegistryMaintenanceInstallation,
  RegistryClientInstallation,
} from './registry-maintenance-installation';
import { requireRejection } from './registry-rejection.fixture';

const fault = process.argv.at(2);
if (fault === undefined) throw new Error('Installation fixture fault is required');
const artifact = (path: string) => ({ path, sha256: 'a'.repeat(64) });
const client = RegistryClientInstallation.assert({
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
    maximumBytes: 67108864,
    maximumInodes: 1024,
  },
});
if (client.state !== 'enrolled') throw new Error('Expected enrolled client fixture');
const candidate = createRegistryInstallation();
const recovery =
  fault.startsWith('recovery-') || fault === 'none-recovery'
    ? {
        ...candidate.ordinary,
        state: 'enrolled',
        path: '/var/lib/puni-registry/recovery/registry/contents',
        identityReceipt: '/var/lib/puni-registry/journal/identities/recovery-registry.receipt',
        storageId: '22222222-2222-4222-8222-222222222222',
        pvc: { ...candidate.ordinary.pvc, name: 'registry-recovery' },
        configuration: artifact('/etc/puni/registry-maintenance-recovery.yaml'),
        deletionConfiguration: artifact('/etc/puni/registry-maintenance-recovery-deletion.yaml'),
        stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
        stagedJournalIdentityReceipt:
          '/var/lib/puni-registry/journal/identities/recovery-journal.receipt',
        stagedJournalStorageId: '33333333-3333-4333-8333-333333333333',
        stagedJournalMaximumBytes: 1073741824,
      }
    : candidate.recovery;
const installed = parseRegistryMaintenanceInstallation({ ...candidate, client, recovery });
if (fault === 'unenrolled') installed.client = { state: 'unenrolled' };
if (fault === 'absent') delete installed.client;
const checked: string[] = [];
// Model only artifact/kernel IO in this separate child. Execute the real installation validator;
// the root native rehearsal independently exercises those ports with actual mounted filesystems.
const enrollment = await import('./registry-maintenance-installation');
await mock.module('./registry-maintenance-installation', () => ({
  ...enrollment,
  verifyRegistryHostArtifact: (selected: { path: string }) => {
    checked.push(selected.path);
    const names: Record<string, string> = {
      worker: client.worker.path,
      scope: client.scope.path,
      control: client.control.path,
      mount: client.mount.path,
      ip: client.ip.path,
      crane: '/usr/local/libexec/puni-registry-maintenance/crane',
      bun: '/usr/local/libexec/puni-registry-authority/bun',
      unshare: '/usr/bin/unshare',
    };
    const selectedName = Object.entries(names).find(([, path]) => path === selected.path);
    if (selectedName !== undefined && fault === 'artifact-' + selectedName[0])
      return Promise.reject(new Error('Fixture artifact changed or unreadable'));
    return Promise.resolve(Buffer.alloc(0));
  },
}));
let admitted = 0;
await mock.module('./registry-capacity', () => ({
  admitBuilderScratch: (input: {
    path: string;
    receiptPath: string;
    envelope: { bytes: number; inodes: number };
    excludedPaths: string[];
  }) => {
    if (
      input.path !== client.scratch.path ||
      input.receiptPath !== client.scratch.receiptPath ||
      JSON.stringify(input.excludedPaths) !==
        JSON.stringify([
          installed.journalPath,
          installed.ordinary.path,
          ...(installed.recovery.state === 'enrolled'
            ? [installed.recovery.path, installed.recovery.stagedJournalPath]
            : []),
        ])
    )
      throw new Error('Installer changed read-only profile measurement contract');
    admitted++;
    if (input.envelope.bytes > 0 || input.envelope.inodes > 0)
      return Promise.reject(new Error('Full owned pool has no download capacity'));
    if (fault === 'scratch-read')
      return Promise.reject(new Error('Fixture scratch receipt missing'));
    return Promise.resolve({
      identity: fault === 'scratch-id' ? 'foreign' : client.scratch.storageId,
      maximumBytes: fault === 'scratch-bytes' ? 1 : client.scratch.maximumBytes,
      totalInodes: fault === 'scratch-inodes' ? client.scratch.maximumInodes + 1 : 1024,
      availableBytes: 0,
      availableInodes: 0,
    });
  },
  measureVerifiedFilesystem: (path: string, receipt: string) => {
    const stores = [
      {
        name: 'journal',
        path: installed.journalPath,
        receipt: installed.journalIdentityReceipt,
        maximumBytes: installed.journalMaximumBytes,
        identity: installed.ordinary.storageId,
      },
      {
        name: 'registry',
        path: installed.ordinary.path,
        receipt: installed.ordinary.identityReceipt,
        maximumBytes: installed.ordinary.maximumBytes,
        identity: installed.ordinary.storageId,
      },
      ...(installed.recovery.state === 'enrolled'
        ? [
            {
              name: 'recovery',
              path: installed.recovery.path,
              receipt: installed.recovery.identityReceipt,
              maximumBytes: installed.recovery.maximumBytes,
              identity: installed.recovery.storageId,
            },
            {
              name: 'recovery-journal',
              path: installed.recovery.stagedJournalPath,
              receipt: installed.recovery.stagedJournalIdentityReceipt,
              maximumBytes: installed.recovery.stagedJournalMaximumBytes,
              identity: installed.recovery.stagedJournalStorageId,
            },
          ]
        : []),
    ];
    const storage = stores.find((storage) => storage.path === path);
    if (storage?.receipt !== receipt) throw new Error('Unexpected canonical storage path/receipt');
    if (fault === storage.name + '-read')
      return Promise.reject(new Error('Fixture canonical mount missing'));
    return Promise.resolve({
      maximumBytes: fault === storage.name + '-bytes' ? 1 : storage.maximumBytes,
      identity: fault === storage.name + '-id' ? 'foreign' : storage.identity,
    });
  },
}));
await mock.module('node:fs/promises', () => ({
  lstat: () =>
    Promise.resolve({
      uid: fault === 'pool-uid' ? 59001 : 0,
      gid: fault === 'pool-gid' ? 59001 : 0,
      mode: fault === 'pool-mode' ? 0o777 : 0o711,
      isDirectory: () => fault !== 'pool-kind',
    }),
}));
const { verifyRegistryClientInstallation } = await import('./registry-client-installation');
const pending = verifyRegistryClientInstallation(installed);
if (fault === 'none' || fault === 'none-recovery') {
  await pending;
  const expected = [
    client.worker.path,
    client.scope.path,
    client.control.path,
    client.mount.path,
    client.ip.path,
    '/usr/local/libexec/puni-registry-maintenance/crane',
    '/usr/local/libexec/puni-registry-authority/bun',
    '/usr/bin/unshare',
  ].sort();
  if (JSON.stringify(checked.sort()) !== JSON.stringify(expected) || admitted !== 1)
    throw new Error('Installer omitted a fixed dependency or repeated scratch admission');
} else await requireRejection(pending);
console.log(JSON.stringify({ fault, verified: fault === 'none' || fault === 'none-recovery' }));
