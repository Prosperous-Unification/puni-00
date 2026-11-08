import { createHash } from 'node:crypto';
import * as files from 'node:fs/promises';
import { chmod, link, mkdir, open, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';
import { expect, spyOn, test } from 'bun:test';

import { createRegistryLocalLockVersions } from './registry-backup-local.fixture';
import { requireRejection } from './registry-rejection.fixture';

async function fixture(
  run: (
    input: {
      repository: string;
      journalPath: string;
      descriptor: number;
      authorityUid: number;
      repositoryUid: number;
    },
    path: string,
  ) => Promise<void>,
) {
  const root = await scratchAsync('registry-backup-lock-versions-');
  await chmod(root, 0o700);
  const repository = join(root, 'repository');
  await mkdir(repository, { mode: 0o700 });
  await mkdir(join(repository, 'locks'), { mode: 0o700 });
  const bytes = Buffer.from(
    'modeled encrypted lock bytes; cryptographic decoding is a separate pinned-restic boundary',
  );
  const id = createHash('sha256').update(bytes).digest('hex');
  const path = join(repository, 'locks', id);
  await writeFile(path, bytes, { mode: 0o600 });
  const lock = await open(join(root, 'authority.lock'), 'wx', 0o600);
  const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  try {
    if (native.symbols.flock(lock.fd, 2 | 4) !== 0) throw new Error('Missing owned fixture flock');
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('Missing UID');
    await run(
      { repository, journalPath: root, descriptor: lock.fd, authorityUid: uid, repositoryUid: uid },
      path,
    );
  } finally {
    await lock.close();
    native.close();
  }
}

test('owned local provider hashes complete raw files and removes only the observed inode version', async () => {
  await fixture(async (input, path) => {
    const provider = await createRegistryLocalLockVersions(input);
    const versions = await provider.census();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      visible: true,
      kind: 'object',
      key: 'locks/' + String(path.split('/').at(-1)),
    });
    await provider.removeVersion(versions[0]);
    expect(await provider.census()).toEqual([]);
  });
});
for (const fault of ['unknown', 'corrupt', 'replaced', 'unheld'] as const) {
  test(`owned local provider refuses ${fault} raw/version evidence`, async () => {
    await fixture(async (input, path) => {
      const provider = await createRegistryLocalLockVersions(input);
      if (fault === 'unheld') {
        const other = await open(join(input.journalPath, 'authority.lock'), 'r');
        try {
          expect(
            (
              await requireRejection(
                createRegistryLocalLockVersions({ ...input, descriptor: other.fd }),
              )
            ).throwCause,
          ).toThrow('lock');
        } finally {
          await other.close();
        }
        return;
      }
      if (fault === 'replaced') {
        const observed = (await provider.census())[0];
        const replacement = path + '.replacement';
        await writeFile(replacement, await readFile(path), { mode: 0o600 });
        await rename(replacement, path);
        expect((await requireRejection(provider.removeVersion(observed))).throwCause).toThrow(
          'changed',
        );
      } else {
        if (fault === 'unknown')
          await writeFile(join(input.repository, 'locks', 'unknown'), 'unattributable', {
            mode: 0o600,
          });
        if (fault === 'corrupt') await writeFile(path, 'changed ciphertext');
        expect((await requireRejection(provider.census())).throwCause).toThrow();
      }
      expect(await readFile(path)).toBeInstanceOf(Buffer);
    });
  });
}

for (const fault of ['authorityUid', 'repositoryUid'] as const) {
  test(`local fixture refuses mismatched independent ${fault}`, async () => {
    await fixture(async (input) => {
      const selected = {
        ...input,
        authorityUid: input.authorityUid,
        repositoryUid: input.repositoryUid,
      };
      selected[fault]++;
      expect(
        (await requireRejection(createRegistryLocalLockVersions(selected))).throwCause,
      ).toThrow();
    });
  });
}

test('owned local provider accepts pinned restic readonly ciphertext objects', async () => {
  await fixture(async (input, path) => {
    await chmod(path, 0o400);
    const provider = await createRegistryLocalLockVersions(input);
    const versions = await provider.census();
    expect(versions).toHaveLength(1);
    await provider.removeVersion(versions[0]);
    expect(await provider.census()).toEqual([]);
  });
});

test('owned local provider refuses shared-readable ciphertext metadata', async () => {
  await fixture(async (input, path) => {
    await chmod(path, 0o644);
    const provider = await createRegistryLocalLockVersions(input);
    expect((await requireRejection(provider.census())).throwCause).toThrow(
      'Untrusted local backup lock object',
    );
    expect(await readFile(path)).toBeInstanceOf(Buffer);
  });
});

async function snapshotFixture(
  run: (
    input: Parameters<typeof createRegistryLocalLockVersions>[0],
    path: string,
    id: string,
  ) => Promise<void>,
) {
  await fixture(async (input) => {
    await mkdir(join(input.repository, 'snapshots'), { mode: 0o700 });
    const bytes = Buffer.from('controlled encrypted snapshot bytes');
    const id = createHash('sha256').update(bytes).digest('hex');
    const path = join(input.repository, 'snapshots', id);
    await writeFile(path, bytes, { mode: 0o400 });
    await run(input, path, id);
  });
}
test('local fixture snapshot observer hashes readonly ciphertext and records exact local identities without deletion', async () => {
  await snapshotFixture(async (input, path, id) => {
    const provider = await createRegistryLocalLockVersions(input);
    const observed = await provider.snapshotVersions(new AbortController().signal);
    expect(observed).toMatchObject([
      {
        snapshotId: id,
        kind: 'object',
        visible: true,

        bytes: 35,
      },
    ]);
    expect(observed[0]?.versionId).toMatch(/^\d+:\d+:\d+:\d+$/);
    expect(await readFile(path, 'utf8')).toBe('controlled encrypted snapshot bytes');
    const replacement = path + '.replacement';
    await writeFile(replacement, await readFile(path), { mode: 0o400 });
    await rename(replacement, path);
    expect((await provider.snapshotVersions(new AbortController().signal))[0]?.versionId).not.toBe(
      observed[0]?.versionId,
    );
  });
});
for (const fault of [
  'absent-signal',
  'invalid-signal',
  'abort',
  'absent-directory',
  'replaced-directory',
  'mode',
  'corrupt',
  'unknown',
  'symlink',
  'hardlink',
  'oversize',
  'unheld',
] as const) {
  test(`local fixture snapshot observer refuses ${fault} under ordinary owned authority`, async () => {
    await snapshotFixture(async (input, path) => {
      const provider = await createRegistryLocalLockVersions(input);
      const controller = new AbortController();
      if (fault === 'absent-signal' || fault === 'invalid-signal') {
        await refuse(
          provider.snapshotVersions(
            fault === 'absent-signal' ? (undefined as unknown as AbortSignal) : ({} as AbortSignal),
          ),
        );
        return;
      }
      if (fault === 'abort') controller.abort();
      if (fault === 'absent-directory')
        await rename(
          join(input.repository, 'snapshots'),
          join(input.repository, 'saved-snapshots'),
        );
      if (fault === 'replaced-directory') {
        await provider.snapshotVersions(controller.signal);
        await rename(
          join(input.repository, 'snapshots'),
          join(input.repository, 'saved-snapshots'),
        );
        await mkdir(join(input.repository, 'snapshots'), { mode: 0o700 });
      }
      if (fault === 'mode') await chmod(path, 0o600);
      if (fault === 'corrupt') {
        await chmod(path, 0o600);
        await writeFile(path, 'corrupt');
        await chmod(path, 0o400);
      }
      if (fault === 'unknown')
        await writeFile(join(input.repository, 'snapshots', 'unknown'), 'unknown', { mode: 0o400 });
      if (fault === 'symlink')
        await symlink(path, join(input.repository, 'snapshots', 'a'.repeat(64)));
      if (fault === 'hardlink') await link(path, join(input.repository, 'linked-snapshot'));
      if (fault === 'oversize') {
        await chmod(path, 0o600);
        const bytes = Buffer.alloc(1024 ** 2 + 1);
        await writeFile(path, bytes);
        await chmod(path, 0o400);
        const replacement = join(
          input.repository,
          'snapshots',
          createHash('sha256').update(bytes).digest('hex'),
        );
        await rename(path, replacement);
        path = replacement;
      }
      if (fault === 'unheld') {
        const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
        try {
          expect(native.symbols.flock(input.descriptor, 8)).toBe(0);
        } finally {
          native.close();
        }
      }
      await refuse(provider.snapshotVersions(controller.signal));
      if (!['absent-directory', 'replaced-directory'].includes(fault))
        expect(await readFile(path)).toBeInstanceOf(Buffer);
    });
  });
}

test('local snapshot count refuses oversized directory producer before opening objects (broken readdir producer)', async () => {
  await snapshotFixture(async (input, _path, id) => {
    const provider = await createRegistryLocalLockVersions(input);
    const list = spyOn(files, 'readdir').mockResolvedValue(
      Array.from({ length: 8193 }, () => id) as unknown as Awaited<
        ReturnType<typeof files.readdir>
      >,
    );
    try {
      await refuse(provider.snapshotVersions(new AbortController().signal), 'count bound');
    } finally {
      list.mockRestore();
    }
  });
}, 30000);
test('local snapshot observation refuses cumulative ciphertext beyond its read bound', async () => {
  await snapshotFixture(async (input) => {
    for (let index = 0; index < 65; index++) {
      const bytes = Buffer.alloc(1024 ** 2, index);
      const id = createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(input.repository, 'snapshots', id), bytes, { mode: 0o400 });
    }
    const provider = await createRegistryLocalLockVersions(input);
    await refuse(provider.snapshotVersions(new AbortController().signal), 'ciphertext byte bound');
  });
});
test('local snapshot observation carries cancellation through directory enumeration', async () => {
  await snapshotFixture(async (input) => {
    const provider = await createRegistryLocalLockVersions(input);
    const controller = new AbortController();
    const readNames = files.readdir;
    const list = spyOn(files, 'readdir').mockImplementationOnce(((
      ...args: Parameters<typeof files.readdir>
    ) => {
      controller.abort();
      return readNames(...args);
    }) as typeof files.readdir);
    try {
      await refuse(provider.snapshotVersions(controller.signal));
    } finally {
      list.mockRestore();
    }
  });
});

async function refuse(operation: Promise<unknown>, message?: string) {
  const rejected = await requireRejection(operation);
  expect(rejected.throwCause).toThrow(message);
}

test('local snapshot observation permits an owned empty directory', async () => {
  await snapshotFixture(async (input, path) => {
    await rename(path, join(input.repository, 'saved-snapshot'));
    const provider = await createRegistryLocalLockVersions(input);
    expect(await provider.snapshotVersions(new AbortController().signal)).toEqual([]);
  });
});
test('local snapshot observation refuses directory replacement during enumeration', async () => {
  await snapshotFixture(async (input, path, id) => {
    const provider = await createRegistryLocalLockVersions(input);
    const bytes = await readFile(path);
    const readNames = files.readdir;
    const list = spyOn(files, 'readdir').mockImplementationOnce((async (
      ...args: Parameters<typeof files.readdir>
    ) => {
      const names = await readNames(...args);
      await rename(join(input.repository, 'snapshots'), join(input.repository, 'saved-snapshots'));
      await mkdir(join(input.repository, 'snapshots'), { mode: 0o700 });
      await writeFile(join(input.repository, 'snapshots', id), bytes, { mode: 0o400 });
      return names;
    }) as typeof files.readdir);
    try {
      await refuse(
        provider.snapshotVersions(new AbortController().signal),
        'changed during observation',
      );
    } finally {
      list.mockRestore();
    }
  });
});

test('local snapshot observation distinguishes unreadable directory metadata from absence', async () => {
  await snapshotFixture(async (input) => {
    const provider = await createRegistryLocalLockVersions(input);
    const path = join(input.repository, 'snapshots');
    await chmod(path, 0o000);
    try {
      await refuse(
        provider.snapshotVersions(new AbortController().signal),
        'Untrusted owned local lock repository',
      );
    } finally {
      await chmod(path, 0o700);
    }
  });
});
