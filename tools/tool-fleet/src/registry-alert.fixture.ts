import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import {
  initialRegistryAlertSnapshot,
  parseRegistryAlertEnrollment,
  type RegistryAlertContext,
} from './registry-alert-store';

/** Ordinary local-only seam: real files/locks, modeled ext4 counters and exclusion identities. No installed ownership, root marker, mount, quota or TLS proof. */
export async function readRegistryAlertFixture(root: string): Promise<RegistryAlertContext> {
  const enrollment = parseRegistryAlertEnrollment(
    JSON.parse(await readFile(join(root, 'alert-enrollment.json'), 'utf8')),
  );
  return {
    enrollment,
    io: {
      filesystem: () =>
        Promise.resolve({
          type: 0xef53n,
          bsize: 4096n,
          blocks: 4096n,
          bfree: 4000n,
          bavail: 4000n,
          files: 4096n,
          ffree: 4000n,
        }),
      excludedDevices: () => Promise.resolve([-1]),
    },
  };
}
/** Explicit test enrollment only; runtime never calls this or reconstructs missing state. */
export async function initializeRegistryAlertFixture(root: string): Promise<RegistryAlertContext> {
  const directory = join(root, 'alerts');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'state.lock'), '', { mode: 0o600 });
  await writeFile(join(directory, 'send.lock'), '', { mode: 0o600 });
  const directoryStat = await lstat(directory),
    stateLock = await lstat(join(directory, 'state.lock')),
    sendLock = await lstat(join(directory, 'send.lock'));
  const enrollment = parseRegistryAlertEnrollment({
    schemaVersion: 1,
    enrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    registryId: 'proof',
    storageId: 'store',
    directory,
    device: directoryStat.dev,
    inode: directoryStat.ino,
    stateLockInode: stateLock.ino,
    sendLockInode: sendLock.ino,
    uid: directoryStat.uid,
    gid: directoryStat.gid,
    registryPath: '/registry',
    journalPath: join(root, 'journal'),
    destinationId: 'local-receiver',
    protocol: 'slack-incoming-webhook',
    credentialPath: '/run/credentials/puni-registry-alert-send.service/webhook',
    credentialSha256: 'a'.repeat(64),
  });
  await writeFile(join(root, 'alert-enrollment.json'), JSON.stringify(enrollment), { mode: 0o600 });
  await writeFile(
    join(directory, 'current.json'),
    JSON.stringify(initialRegistryAlertSnapshot(enrollment)),
    { mode: 0o600 },
  );
  return readRegistryAlertFixture(root);
}

if (import.meta.main) {
  const root = process.argv.at(2),
    mode = process.argv.at(3);
  if (root === undefined) throw new Error('Local alert fixture root required');
  if (mode === 'fail-before-enqueue') {
    const { createRegistryPressureFixture } = await import('./registry-pressure-report.fixture');
    const { executeRegistryCommand, runRegistryMaintenance } = await import('./registry-journal');
    const { withRegistryMaintenanceAlertCapture } = await import('./registry-maintenance-cli');
    const source = await createRegistryPressureFixture(root),
      context = await readRegistryAlertFixture(root);
    await withRegistryMaintenanceAlertCapture(
      { directory: source.directory, context },
      async () => {
        await executeRegistryCommand(
          source.directory,
          { command: 'upgrade-maintenance' },
          source.ports,
        );
        try {
          await runRegistryMaintenance(
            source.directory,
            { operationId: 'killed-backup', owner: 'owner', kind: 'backup', recover: false },
            source.ports,
            async () => {
              await writeFile(join(root, 'effect-count'), '1');
              throw new Error('ordinary producer failure');
            },
          );
        } catch (cause) {
          console.log('failure-persisted');
          await Bun.stdin.text();
          throw cause;
        }
      },
    );
  } else if (mode !== 'send') throw new Error('Unknown local alert fixture action');
  const { registryAlertSendMain } = await import('./registry-alert-send-cli');
  const context = await readRegistryAlertFixture(root);
  const receiver = type({ url: 'string', now: 'string?', '+': 'reject' }).assert(
    JSON.parse(await readFile(join(root, 'receiver.json'), 'utf8')),
  );
  await registryAlertSendMain(context, {
    now:
      receiver.now === undefined
        ? undefined
        : () =>
            receiver.now ??
            (() => {
              throw new Error('Missing modeled clock');
            })(),
    transport: {
      post: (payload, signal) =>
        fetch(receiver.url, { method: 'POST', body: payload, redirect: 'manual', signal }),
    },
  });
}
