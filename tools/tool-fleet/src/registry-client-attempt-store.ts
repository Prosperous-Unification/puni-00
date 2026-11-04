import { constants } from 'node:fs';
import { type FileHandle, open, readdir, realpath, unlink } from 'node:fs/promises';

import { dlopen, ptr, read as memory } from 'bun:ffi';

import { RegistryClientAttempt } from './registry-client-attempt';
import { recoverRegistryClientWorkspace } from './registry-client-workspace';
import { completeRegistryOperation } from './registry-operation-completion';

const record = '.client-attempt.json';
const job = /^pull-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function publishAnonymous(descriptor: number, directory: number): void {
  const native = dlopen('libc.so.6', {
    linkat: { args: ['i32', 'ptr', 'i32', 'ptr', 'i32'], returns: 'i32' },
    __errno_location: { args: [], returns: 'ptr' },
  });
  try {
    const source = Buffer.from('/proc/self/fd/' + String(descriptor) + '\0');
    const destination = Buffer.from(record + '\0');
    // Linux amd64 AT_FDCWD/AT_SYMLINK_FOLLOW; both owned buffers remain live through this synchronous call.
    if (native.symbols.linkat(-100, ptr(source), directory, ptr(destination), 0x400) !== 0) {
      const address = native.symbols.__errno_location();
      if (address === null) throw new Error('Missing client attempt link errno');
      throw new Error('Cannot publish client attempt: errno ' + String(memory.i32(address)));
    }
  } finally {
    native.close();
  }
}

/**
 * One root-owned record in the dedicated bounded0711 scratch pool. The outside root launcher
 * holds the canonical authority for this entire lifetime and admits metadata allocation first.
 * O_TMPFILE + fsync + linkat + directory fsync exposes only a complete record; a killed writer's
 * unnamed prepublication inode is reclaimed by the kernel. No fallback to named partial files.
 * Recovery never infers ownership from filenames alone: a valid matching record and confirmed
 * dead exact scope precede auditing/removing known job roots. Missing record with any contents,
 * corrupt/private metadata, foreign owner or unsafe entries refuse and preserve uncertain state.
 * See https://man7.org/linux/man-pages/man2/open.2.html for the pinned Linux publication contract.
 */
export async function openRegistryClientAttemptStore(pool: string) {
  if (
    process.platform !== 'linux' ||
    process.arch !== 'x64' ||
    process.getuid?.() !== 0 ||
    process.geteuid?.() !== 0 ||
    process.getgid?.() !== 0 ||
    process.getegid?.() !== 0
  )
    throw new Error('Expected root-owned client attempt authority on Linux amd64');
  if ((await realpath(pool)) !== pool) throw new Error('Noncanonical client attempt pool');
  const descriptor = await open(
    pool,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const initial = await descriptor.stat({ bigint: true });
    const identity = { device: initial.dev.toString(), inode: initial.ino.toString() };
    const at = (name?: string) =>
      '/proc/self/fd/' + String(descriptor.fd) + (name === undefined ? '' : '/' + name);
    const requirePool = async () => {
      const metadata = await descriptor.stat({ bigint: true });
      // Proof: pool-metadata removal accepts the real chmod0777 pool in registry-client-attempt-store.fixture.ts.
      if (
        !metadata.isDirectory() ||
        metadata.uid !== 0n ||
        metadata.gid !== 0n ||
        (metadata.mode & 0o777n) !== 0o711n ||
        metadata.dev !== initial.dev ||
        metadata.ino !== initial.ino
      )
        throw new Error('Untrusted root-owned client attempt pool');
    };
    await requirePool();
    const read = async (): Promise<RegistryClientAttempt | null> => {
      await requirePool();
      let held: FileHandle;
      try {
        held = await open(
          at(record),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        // Proof: orphan-record removal adopts the real abandoned job without a record in registry-client-attempt-store.fixture.ts.
        if ((await readdir(at())).length !== 0)
          throw new Error('Client scratch has entries without durable attempt ownership', {
            cause,
          });
        return null;
      }
      return completeRegistryOperation(
        async () => {
          const before = await held.stat({ bigint: true });
          // Proof: record-metadata removal accepts the real oversized record in registry-client-attempt-store.fixture.ts.
          if (
            !before.isFile() ||
            before.uid !== 0n ||
            before.gid !== 0n ||
            before.nlink !== 1n ||
            before.dev !== initial.dev ||
            (before.mode & 0o777n) !== 0o600n ||
            before.size > 8192n
          )
            throw new Error('Untrusted root-private client attempt record');
          const bytes = await held.readFile();
          const after = await held.stat({ bigint: true });
          if (
            BigInt(bytes.length) !== before.size ||
            after.ctimeNs !== before.ctimeNs ||
            after.mtimeNs !== before.mtimeNs
          )
            throw new Error('Client attempt record changed while reading');
          const attempt = RegistryClientAttempt.assert(
            JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)),
          );
          // Proof: record-binding removal accepts a foreign recorded pool or derived unit in registry-client-attempt-store.fixture.ts.
          if (
            attempt.unit !== 'puni-registry-client-' + attempt.id + '.scope' ||
            attempt.pool.device !== identity.device ||
            attempt.pool.inode !== identity.inode
          )
            throw new Error('Client attempt differs from held pool or derived scope');
          return attempt;
        },
        () => held.close(),
      );
    };
    const requireOwner = async (expected: RegistryClientAttempt) => {
      RegistryClientAttempt.assert(expected);
      const current = await read();
      // Proof: exact-owner removal recovers the real job for a foreign operation in registry-client-attempt-store.fixture.ts.
      if (current === null || JSON.stringify(current) !== JSON.stringify(expected))
        throw new Error('Client attempt no longer has exact durable ownership');
    };
    const assertEmpty = async (expected: RegistryClientAttempt) => {
      await requireOwner(expected);
      // Proof: success-empty removal acknowledges success with a real unresolved job in registry-client-attempt-store.fixture.ts.
      if ((await readdir(at())).some((name) => name !== record))
        throw new Error('Client attempt has unresolved workspaces');
    };
    const remove = async (expected: RegistryClientAttempt) => {
      await assertEmpty(expected);
      await unlink(at(record));
      await descriptor.sync();
    };
    return {
      identity,
      read,
      assertEmpty,
      async publish(input: RegistryClientAttempt) {
        const attempt = RegistryClientAttempt.assert(structuredClone(input));
        // Proof: publish-binding removal allocates named foreign ownership before refusing in registry-client-attempt-store.fixture.ts.
        if (
          attempt.pool.device !== identity.device ||
          attempt.pool.inode !== identity.inode ||
          attempt.unit !== 'puni-registry-client-' + attempt.id + '.scope'
        )
          throw new Error('Cannot publish foreign client pool or scope');
        if ((await read()) !== null)
          throw new Error('Client attempt already has durable ownership');
        const bytes = Buffer.from(JSON.stringify(attempt));
        if (bytes.length > 8192) throw new Error('Client attempt exceeds record bound');
        // Linux amd64 O_TMPFILE|O_RDWR: Node constants omit O_TMPFILE. Verified against asm-generic/fcntl.h.
        const anonymous = await open(at(), 0x410002, 0o600);
        await completeRegistryOperation(
          async () => {
            await anonymous.chmod(0o600);
            await anonymous.writeFile(bytes);
            await anonymous.sync();
            publishAnonymous(anonymous.fd, descriptor.fd);
            await descriptor.sync();
          },
          () => anonymous.close(),
        );
        await requireOwner(attempt);
      },
      async finish(
        expected: RegistryClientAttempt,
        assertInactive: (unit: string) => Promise<void>,
      ) {
        await requireOwner(expected);
        // Proof: dead-scope removal deletes the real pending job despite a rejected live-scope observer in registry-client-attempt-store.fixture.ts.
        await assertInactive(expected.unit);
        await remove(expected);
      },
      async recover(
        expected: RegistryClientAttempt,
        assertInactive: (unit: string) => Promise<void>,
      ) {
        await requireOwner(expected);
        // Proof: dead-scope removal deletes the real pending job despite a rejected live-scope observer in registry-client-attempt-store.fixture.ts.
        await assertInactive(expected.unit);
        const names = (await readdir(at())).filter((name) => name !== record);
        if (names.some((name) => !job.test(name)))
          throw new Error('Unknown client attempt scratch entry');
        const signal = AbortSignal.timeout(60000);
        for (const name of names) {
          signal.throwIfAborted();
          await recoverRegistryClientWorkspace(descriptor, name, identity, signal);
        }
        await remove(expected);
      },
      close: () => descriptor.close(),
    };
  } catch (cause) {
    return completeRegistryOperation(
      () => {
        throw cause;
      },
      () => descriptor.close(),
    );
  }
}
