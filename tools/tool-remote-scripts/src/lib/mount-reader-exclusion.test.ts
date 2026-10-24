import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createNamespaceFixture } from '../fixtures/namespace-audit';
import { verifyContainerNamespace, verifyContainerReaderExclusion } from './mount-audit';
import { CENSUS_PROGRAM } from './mount-exec-program';
const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;

test('strong native census admits initialized namespaces with complete cleanup', async () => {
  const proof = await createNamespaceFixture();
  try {
    await mkdir(join(proof.root, 'namespace/unrelated'));
    const mountinfo = join(proof.root, 'mountinfo');
    await writeFile(
      mountinfo,
      (await readFile(mountinfo, 'utf8')) + '\n90 1 0:4242 / /unrelated ro - ext4 fixture ro',
    );
    await verifyContainerReaderExclusion(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      undefined,
      (args, nonce, consume, signal) => {
        if (args.at(11) === CENSUS_PROGRAM) expect(args.at(12)).toBe('');
        return proof.exec(args, nonce, consume, signal);
      },
    );
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
test('strong native census rejects the readonly reader that ordinary writer fencing admits', async () => {
  const proof = await createNamespaceFixture('readonly-reader');
  try {
    await verifyContainerNamespace(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      null,
      undefined,
      proof.exec,
    );
    let refused = false;
    try {
      await verifyContainerReaderExclusion(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        undefined,
        proof.exec,
      );
    } catch (cause) {
      refused = true;
      expect(String(cause)).toContain('SQLite family hardlink');
    }
    expect(refused).toBe(true);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
test('strong native census rejects a downgraded writer scan missing a selected readonly root', async () => {
  const proof = await createNamespaceFixture('readonly-reader');
  try {
    let refused = false;
    try {
      await verifyContainerReaderExclusion(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        undefined,
        (args, nonce, consume, signal) =>
          proof.exec(
            args.at(11) === CENSUS_PROGRAM
              ? [
                  ...args.slice(0, 12),
                  '/data',
                  ...args.slice(13).filter((root) => root !== '/data'),
                ]
              : args,
            nonce,
            consume,
            signal,
          ),
      );
    } catch (cause) {
      refused = true;
      expect(String(cause)).toContain('selected root');
    }
    expect(refused).toBe(true);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});

for (const fault of [
  'healthy-ro',
  'hardlink:-wal',
  'hardlink:-shm',
  'hardlink:-journal',
  'all-ro-nested',
  'hidden-root',
  'symlink',
  'unreadable-hardlink',
] as const)
  test(`strong actual readonly namespace ${fault} preserves ordinary writer semantics`, async () => {
    const proof = await createNamespaceFixture(fault === 'healthy-ro' ? 'none' : fault);
    try {
      const mountinfo = join(proof.root, 'mountinfo');
      await writeFile(
        mountinfo,
        (await readFile(mountinfo, 'utf8'))
          .replaceAll('/data rw ', '/data ro ')
          .replaceAll('/data/nested rw ', '/data/nested ro ')
          .replaceAll('/hidden rw ', '/hidden ro '),
      );
      await verifyContainerNamespace(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        null,
        undefined,
        proof.exec,
      );
      let refused = false;
      try {
        await verifyContainerReaderExclusion(
          proof.container,
          proof.destinations,
          proof.database,
          image,
          proof.runDocker,
          undefined,
          proof.exec,
        );
      } catch (cause) {
        refused = true;
        if (fault === 'unreadable-hardlink')
          expect(String(cause)).toContain('actual scanner failed 80');
      }
      expect(refused).toBe(fault !== 'healthy-ro');
    } finally {
      if (fault === 'unreadable-hardlink')
        await chmod(join(proof.root, 'namespace/data/nested'), 0o700);
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });

for (const fault of [
  'mountinfo-race',
  'pid-race',
  'session-forged',
  'reap-absent',
  'group-residue',
  'entry-limit',
  'depth-limit',
  'stalled-start',
  'stalled-cleanup',
  'host-family-race',
] as const)
  test(`strong native protocol retains ${fault} refusal and bounded cleanup`, async () => {
    const proof = await createNamespaceFixture(fault);
    try {
      let refused = false;
      try {
        await verifyContainerReaderExclusion(
          proof.container,
          proof.destinations,
          proof.database,
          image,
          proof.runDocker,
          { totalMs: 200, cleanupMs: 50 },
          proof.exec,
        );
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    } finally {
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });
