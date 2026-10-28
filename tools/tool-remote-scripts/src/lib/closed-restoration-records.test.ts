import { ok } from 'node:assert/strict';
import { chmod, lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  captureEdgeRecord,
  captureOwnerOperationIntent,
  captureParticipantFence,
  type EdgeRecordSnapshot,
} from './edge-policy';

const fences = [
  { environment: 'dev', name: 'dependency-source-dev-intent.json' },
  { environment: 'dev', name: 'dependency-source-dev-complete.json' },
  { environment: 'prod', name: 'dependency-backend-fence.json' },
  { environment: 'prod', name: 'dependency-backend-intent.json' },
  { environment: 'prod', name: 'dependency-backend-complete.json' },
  { environment: 'prod', name: 'dependency-gateway-fence.json' },
  { environment: 'prod', name: 'dependency-gateway-intent.json' },
  { environment: 'prod', name: 'dependency-gateway-complete.json' },
] as const;

async function readFailure(operation: Promise<unknown>): Promise<Error> {
  const failure: unknown = await operation.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  ok(failure instanceof Error, 'the production reader must refuse');
  return failure;
}

async function writeRecord(directory: string, name: string, contents = 'private retained bytes\n') {
  const path = join(directory, name);
  await writeFile(path, contents, { mode: 0o600 });
  const named = await lstat(path, { bigint: true });
  const parent = await lstat(directory, { bigint: true });
  return {
    path,
    device: String(named.dev),
    inode: String(named.ino),
    parentDevice: String(parent.dev),
    parentInode: String(parent.ino),
    mode: 0o600,
    contents,
  } satisfies EdgeRecordSnapshot;
}

test('closed restoration records captures all eight participant fence snapshots', async () => {
  const root = scratchSync('participant-fence-capture-');
  const prod = join(root, 'prod');
  const dev = join(root, 'dev');
  await mkdir(prod, { mode: 0o700 });
  await mkdir(dev, { mode: 0o700 });
  for (const { environment, name } of fences) {
    const directory = environment === 'prod' ? prod : dev;
    const expected = await writeRecord(directory, name, `retained ${name}\n`);
    expect(await captureParticipantFence(directory, name)).toEqual(expected);
  }
});

test('closed restoration records captures ordinary owner intents at six and twelve digit bounds', async () => {
  const directory = scratchSync('owner-intent-capture-');
  for (const name of ['edge-owner-000001-intent.json', 'edge-owner-123456789012-intent.json']) {
    const contents =
      JSON.stringify({
        owner: 'private-fixture-owner',
        environment: 'prod',
        args: ['start', 'private-fixture-backend'],
      }) + '\n';
    const expected = await writeRecord(directory, name, contents);
    expect(await captureOwnerOperationIntent(directory, name)).toEqual(expected);
  }
});

test('closed restoration records leaves the legacy reader closed to both new families', async () => {
  const directory = scratchSync('legacy-record-domains-');
  for (const name of [
    ...fences.map((fence) => fence.name),
    'edge-owner-000001-intent.json',
    'edge-owner-123456789012-intent.json',
  ]) {
    await writeRecord(directory, name);
    const failure = await readFailure(captureEdgeRecord(directory, name, 65536));
    expect(failure.message).toBe('unsupported edge record path');
  }
});

test('closed restoration records refuses participant sibling and escaping names with readable bytes', async () => {
  for (const name of [
    'edge-policy.json',
    'edge-owner.pending',
    'edge-owner-000001-intent.json',
    'edge-owner-000001-solver-restore-intent.json',
    'edge-owner-000001-activation-participants.json',
    'dependency-worker-fence.json',
    'dependency-backend-ready.json',
    'dependency-source-dev-fence.json',
    '../dependency-source-dev-intent.json',
    './dependency-backend-fence.json',
  ]) {
    const root = scratchSync('participant-fence-closed-name-');
    const directory = join(root, 'state');
    await mkdir(directory, { mode: 0o700 });
    const expected = await writeRecord(directory, name);
    expect((await lstat(expected.path)).isFile()).toBe(true);
    await readFailure(captureParticipantFence(directory, name));
  }
});

test('closed restoration records refuses owner sibling and malformed numbered names with readable bytes', async () => {
  for (const name of [
    'dependency-backend-fence.json',
    'edge-policy.json',
    'edge-owner.pending',
    'edge-owner-000001-readback.json',
    'edge-owner-000001-solver-restore-intent.json',
    'edge-owner-000001-activation-intent.json',
    'edge-owner-000001-ingress-intent.json',
    'edge-owner-12345-intent.json',
    'edge-owner-1234567890123-intent.json',
    'edge-owner-12345x-intent.json',
    'edge-owner--123456-intent.json',
    'edge-owner-000001-intent.json.bak',
    '../edge-owner-000001-intent.json',
    './edge-owner-000001-intent.json',
  ]) {
    const root = scratchSync('owner-intent-closed-name-');
    const directory = join(root, 'state');
    await mkdir(directory, { mode: 0o700 });
    const expected = await writeRecord(directory, name);
    expect((await lstat(expected.path)).isFile()).toBe(true);
    await readFailure(captureOwnerOperationIntent(directory, name));
  }
});

const readers = [
  {
    family: 'participant fence',
    name: 'dependency-backend-fence.json',
    read: (directory: string) =>
      captureParticipantFence(directory, 'dependency-backend-fence.json'),
  },
  {
    family: 'owner intent',
    name: 'edge-owner-000001-intent.json',
    read: (directory: string) =>
      captureOwnerOperationIntent(directory, 'edge-owner-000001-intent.json'),
  },
];

for (const reader of readers) {
  for (const fault of [
    'absent',
    'unreadable',
    'public-mode',
    'oversized',
    'symlink',
    'empty',
    'invalid-utf8',
  ]) {
    test(`closed restoration records ${reader.family} refuses ${fault} through its bounded file path`, async () => {
      const directory = scratchSync('closed-record-file-fault-');
      const path = join(directory, reader.name);
      if (fault === 'symlink') {
        const target = join(directory, 'private-target');
        await writeFile(target, 'retained target\n', { mode: 0o600 });
        await symlink(target, path);
      } else if (fault !== 'absent') {
        const bytes =
          fault === 'oversized'
            ? 'x'.repeat(65537)
            : fault === 'empty'
              ? ''
              : fault === 'invalid-utf8'
                ? new Uint8Array([0xff])
                : 'retained bytes\n';
        await writeFile(path, bytes, { mode: 0o600 });
      }
      if (fault === 'unreadable') await chmod(path, 0);
      if (fault === 'public-mode') await chmod(path, 0o644);
      try {
        const failure = await readFailure(reader.read(directory));
        if (fault === 'absent' || fault === 'unreadable' || fault === 'symlink') {
          ok('code' in failure);
          expect(failure.code).toBe(
            fault === 'absent' ? 'ENOENT' : fault === 'unreadable' ? 'EACCES' : 'ELOOP',
          );
        } else if (fault === 'invalid-utf8') expect(failure).toBeInstanceOf(TypeError);
        else expect(failure.message).toBe('invalid edge policy file identity, type or size');
      } finally {
        if (fault === 'unreadable') await chmod(path, 0o600);
      }
    });
  }
}
