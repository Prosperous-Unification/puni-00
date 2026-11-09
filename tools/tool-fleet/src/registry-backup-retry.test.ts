import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { createRegistryBackupProfile } from './registry-backup-store';
import { readRegistryBytes } from './registry-stream';

const binary = process.env['PUNI_TEST_RESTIC_BINARY'];

/** Closed receipt from the owned HTTPS receiver, after process and socket closure. */
async function observeOwnedRetryProfile() {
  if (binary === undefined) throw new Error('Missing requested ordinary Restic binary');
  const child = Bun.spawn(
    [
      '/usr/bin/python3',
      join(import.meta.dir, 'registry-backup-retry.fixture.py'),
      process.execPath,
      binary,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  const stdout = await readOwnedResponse(child);
  const observed = type({
    snapshotVerified: 'boolean',
    committedVersions: 'number.safe >= 0',
    identicalEncryptedBodies: 'boolean',
    outerSaveRetries: 'number.safe >= 0',
    successAfterTwoRetries: 'boolean',
    receiverClosed: 'boolean',
    descendantsAbsent: 'boolean',
    '+': 'reject',
  }).assert(JSON.parse(new TextDecoder().decode(stdout)));
  console.log(JSON.stringify(observed));
  return observed;
}

test.skipIf(binary === undefined)(
  'S3 store delegates each lost committed PUT to its outer Save retry',
  async () => {
    const observed = await observeOwnedRetryProfile();
    expect(observed.snapshotVerified).toBe(true);
    expect(observed.committedVersions).toBe(3);
    expect(observed.identicalEncryptedBodies).toBe(true);
    expect(observed.outerSaveRetries).toBe(2);
    expect(observed.successAfterTwoRetries).toBe(true);
    expect(observed.receiverClosed).toBe(true);
    expect(observed.descendantsAbsent).toBe(true);
  },
  120000,
);

for (const [repository, profile] of [
  [
    's3:https://fixture.invalid/owned-prefix',
    {
      name: 'restic/s3-single-attempt/locked-commands/v2',
      arguments: ['--no-cache', '-o', 's3.retries=1'],
    },
  ],
  [
    '/owned-local-repository',
    {
      name: 'restic/no-cache/locked-commands/v1',
      arguments: ['--no-cache'],
    },
  ],
] as const) {
  test(
    'root action persists actual fixed profile and refuses drift for ' + repository,
    async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'registry-backup-retry.fixture.ts'),
          'profile',
          repository,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      );
      const stdout = await readOwnedResponse(child);
      const observed = type({
        profileSha256: 'string',
        driftRefused: 'boolean',
        historyUnchanged: 'boolean',
        '+': 'reject',
      }).assert(JSON.parse(new TextDecoder().decode(stdout)));
      const expected = createHash('sha256')
        .update(
          JSON.stringify({
            binary: {
              path: '/root/.puni/tools/restic-0.19.1',
              sha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
            },
            configuration: 'b'.repeat(64),
            profile,
          }),
        )
        .digest('hex');
      expect(observed.profileSha256).toBe(expected);
      expect(observed.driftRefused).toBe(true);
      expect(observed.historyUnchanged).toBe(true);
      const selected = createRegistryBackupProfile(repository);
      expect(selected).toEqual(profile);
      expect(Object.isFrozen(selected)).toBe(true);
      expect(Object.isFrozen(selected.arguments)).toBe(true);
    },
  );
}

/** Output faults terminate only the owned fixture; Python closes/reaps its exclusive worker group before exiting. */
async function readOwnedResponse(child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>) {
  const watchdog = setTimeout(() => {
    child.kill('SIGTERM');
  }, 110000);
  const bounded = async (stream: ReadableStream<Uint8Array>, label: string) => {
    try {
      return await readRegistryBytes(stream, 65536, label);
    } catch (cause) {
      child.kill('SIGTERM');
      throw cause;
    }
  };
  try {
    const settled = await Promise.allSettled([
      child.exited,
      bounded(child.stdout, 'Owned receipt'),
      bounded(child.stderr, 'Owned diagnostics'),
    ]);
    for (const outcome of settled) if (outcome.status === 'rejected') throw outcome.reason;
    const [exit, stdout, stderr] = settled;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new Error('Missing owned fixture completion');
    if (exit.value !== 0) throw new Error(new TextDecoder().decode(stderr.value));
    if (stderr.value.byteLength > 0) console.log(new TextDecoder().decode(stderr.value).trim());
    return stdout.value;
  } finally {
    clearTimeout(watchdog);
  }
}
