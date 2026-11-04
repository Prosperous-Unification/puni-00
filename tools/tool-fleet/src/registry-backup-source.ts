import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, opendir, readlink, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';
import { dlopen, ptr } from 'bun:ffi';

import type { RegistryBackupSource } from './registry-backup-store';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';

/**
 * Computational ceilings only: 1 PiB logical bytes, one million entries/fanout,
 * depth 128 and 256 MiB accounted metadata cap arithmetic, recursion and retained
 * directory/owner collections. Every caller supplies smaller explicit limits as
 * appropriate; these finite parser caps are neither defaults nor physical budgets.
 */
export const RegistryBackupRootLimits = type({
  maximumLogicalBytes: '0 < number.safe <= 1125899906842624',
  maximumEntries: '0 < number.safe <= 1000000',
  maximumDepth: '0 < number.safe <= 128',
  maximumMetadataBytes: '0 < number.safe <= 268435456',
  maximumFanout: '0 < number.safe <= 1000000',
  '+': 'reject',
});
/** Explicit independent root ceilings avoid transferring spare traversal allowance between contents roots. */
export const RegistryBackupSourceLimits = type({
  registry: RegistryBackupRootLimits,
  journal: RegistryBackupRootLimits,
  '+': 'reject',
});
export type RegistryBackupSourceLimits = typeof RegistryBackupSourceLimits.infer;

export interface RegistryBackupRootObservation {
  identity: { device: string; inode: string };
  logicalBytes: number;
  paths: number;
  regularFiles: number;
  nonemptyFiles: number;
  directories: number;
  symlinks: number;
  /** Upper bound for fresh chunking at the pinned 512 KiB minimum; inherited parent references require separate repository evidence. */
  freshChunkReferences: number;
  maximumFileLength: number;
  maximumDepth: number;
  maximumFanout: number;
  filenameBytes: number;
  pathBytes: number;
  symlinkTargetBytes: number;
  xattrs: number;
  xattrNameBytes: number;
  xattrValueBytes: number;
  fixedStatBytes: number;
  metadataBytes: number;
  maximumUid: number;
  maximumGid: number;
  uids: number[];
  gids: number[];
  maximumFilenameLength: number;
  maximumPathLength: number;
  maximumSymlinkTargetLength: number;
  maximumEntryXattrs: number;
  maximumXattrNameLength: number;
  maximumXattrValueLength: number;
  maximumEntryXattrBytes: number;
  sha256: string;
}
/**
 * Source contents metadata only, under independently established writer exclusion.
 * listxattr can omit inaccessible namespaces: full xattr visibility/read-context
 * evidence remains separate and required before any complete encoded/physical admission.
 * Ordinary-user tests establish only caller-visible attributes, including empty lists.
 * Commits exact raw names, link targets, complete caller-visible Linux xattrs and fixed stat fields;
 * hardlink paths receive no dedup credit and logical lengths include sparse holes.
 * This excludes synthetic ancestor trees, NSS strings, encoded trees, repositories,
 * retries, workspace and physical/provider envelopes. UID/GID sets identify accounts
 * requiring a separate immutable name-resolution profile; maxima do not bound names.
 * metadataBytes charges raw names twice (queued and visited), absolute paths, canonical
 * stat JSON and complete xattr list/value bytes. It is a traversal ceiling, not an
 * encoded-tree size or process-memory estimate. Registry bodies are never read;
 * only the bounded canonical authority journal is read to bind revision and hash.
 */
export interface RegistryBackupSourceObservation {
  scope: 'contents-metadata-only';
  xattrScope: 'caller-visible-only';
  operationId: string;
  registryId: string;
  storageId: string;
  registryPath: string;
  journalPath: string;
  journalRevision: number;
  censusSha256: string;
  journalSha256: string;
  registry: RegistryBackupRootObservation;
  journal: RegistryBackupRootObservation;
  sha256: string;
}

function addBytes(current: number, addition: number, maximum: number, label: string): number {
  const total = current + addition;
  // Proof: separate logical/entry/metadata cap bypasses in disposable copies made real store refusal consumers resolve and create snapshots.
  if (
    !Number.isSafeInteger(addition) ||
    addition < 0 ||
    !Number.isSafeInteger(total) ||
    total > maximum
  )
    throw new Error(`Backup source ${label} ceiling exceeded`);
  return total;
}
/** Require complete, finite native fields before any identity or metadata coercion. */
function requireStatus(status: BigIntStats): bigint[] {
  // Proof: matching absent/null ctimeNs and malformed uid from both stat APIs previously produced a real store snapshot.
  const fields = [
    status.dev,
    status.ino,
    status.mode,
    status.nlink,
    status.uid,
    status.gid,
    status.rdev,
    status.size,
    status.blksize,
    status.blocks,
    status.mtimeNs,
    status.ctimeNs,
    status.birthtimeNs,
  ];
  // Linux stat identities/counts are at most uint64; signed timespec seconds plus nanoseconds have this finite range.
  // Proof: matching inode 2^80 and timestamp 2^128 producers returned observations before these pre-encoding width checks.
  const maximumUnsigned = (1n << 64n) - 1n;
  const timestampMagnitude = (1n << 63n) * 1000000000n;
  if (
    fields.some((field) => typeof field !== 'bigint') ||
    fields.slice(0, 10).some((field) => field < 0n || field > maximumUnsigned) ||
    fields.slice(10).some((field) => field < -timestampMagnitude || field >= timestampMagnitude) ||
    status.mode > 4294967295n ||
    status.uid > 4294967295n ||
    status.gid > 4294967295n
  )
    throw new Error('Malformed required Linux backup source stat fields');
  return fields;
}
function encodeStatus(status: BigIntStats): Buffer {
  // atime changes from ordinary observation/restic are ignored; backup does not use --with-atime.
  return Buffer.from(JSON.stringify(requireStatus(status).map(String)));
}
function requireSameStatus(before: BigIntStats, after: BigIntStats): void {
  // Proof: disabling this comparison admitted the controlled matching-path/fd-size discrepancy through the actual store consumer.
  if (!encodeStatus(before).equals(encodeStatus(after)))
    throw new Error('Backup source metadata changed');
}
function terminate(bytes: Uint8Array): Buffer {
  return Buffer.concat([bytes, Buffer.from([0])]);
}

/**
 * Linux ordinary metadata reader. libc resources are per observation and directory/file
 * cleanup is awaited; primary and cleanup faults are preserved together. Cooperative
 * deadlines bound work between syscalls, not a blocked kernel call or process RSS.
 */
export async function observeRegistryBackupSource(
  requestedSource: RegistryBackupSource,
  requestedLimits: RegistryBackupSourceLimits,
  authority: { authorityDescriptor: number },
  signal: AbortSignal,
  authorityUid = process.getuid?.(),
): Promise<RegistryBackupSourceObservation> {
  const source = Object.freeze({ ...requestedSource });
  const limits = RegistryBackupSourceLimits.assert(structuredClone(requestedLimits));
  Object.freeze(limits.registry);
  Object.freeze(limits.journal);
  Object.freeze(limits);
  if (process.platform !== 'linux')
    throw new Error('Backup source observation requires Linux metadata APIs');
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const assertAuthority = async () => {
    deadline.throwIfAborted();
    await assertRegistryMaintenanceLock(
      source.journalPath,
      authority.authorityDescriptor,
      authorityUid,
    );
  };
  await assertAuthority();
  if (
    !Number.isSafeInteger(source.journalRevision) ||
    source.journalRevision < 0 ||
    !/^[a-f0-9]{64}$/.test(source.censusSha256)
  )
    throw new Error('Invalid backup source authority binding');
  for (const path of [source.registryPath, source.journalPath]) {
    if (!isAbsolute(path) || (await realpath(path)) !== path || !(await lstat(path)).isDirectory())
      throw new Error('Backup source requires canonical independent contents roots');
  }
  if (
    source.registryPath === source.journalPath ||
    source.registryPath.startsWith(source.journalPath + '/') ||
    source.journalPath.startsWith(source.registryPath + '/')
  )
    throw new Error('Backup source roots are not independent');
  const native = dlopen('libc.so.6', {
    flistxattr: { args: ['i32', 'ptr', 'usize'], returns: 'i64' },
    fgetxattr: { args: ['i32', 'ptr', 'ptr', 'usize'], returns: 'i64' },
    llistxattr: { args: ['ptr', 'ptr', 'usize'], returns: 'i64' },
    lgetxattr: { args: ['ptr', 'ptr', 'ptr', 'usize'], returns: 'i64' },
  });
  const cleanup = async <T>(effect: () => Promise<T>, close: () => Promise<void>): Promise<T> => {
    const outcome = await effect().then(
      (value) => ({ ok: true, value }) as const,
      (cause: unknown) => ({ ok: false, cause }) as const,
    );
    try {
      await close();
    } catch (cause) {
      if (!outcome.ok)
        throw new AggregateError([outcome.cause, cause], 'Backup source and cleanup failed', {
          cause,
        });
      throw cause;
    }
    if (!outcome.ok) throw outcome.cause;
    return outcome.value;
  };
  return cleanup(
    async () => {
      const observeRoot = async (
        root: string,
        ceiling: typeof RegistryBackupRootLimits.infer,
      ): Promise<RegistryBackupRootObservation> => {
        const rootStatus = await lstat(root, { bigint: true });
        // Proof: initial-root object and inode 2^80 producers were String-coerced before later refusal; actual store tests require no coercion or second root sample.
        requireStatus(rootStatus);
        const digest = createHash('sha256');
        const uids = new Set<number>();
        const gids = new Set<number>();
        const observed: RegistryBackupRootObservation = {
          identity: { device: String(rootStatus.dev), inode: String(rootStatus.ino) },
          logicalBytes: 0,
          paths: 0,
          regularFiles: 0,
          nonemptyFiles: 0,
          directories: 0,
          symlinks: 0,
          freshChunkReferences: 0,
          maximumFileLength: 0,
          maximumDepth: 0,
          maximumFanout: 0,
          filenameBytes: 0,
          pathBytes: 0,
          symlinkTargetBytes: 0,
          xattrs: 0,
          xattrNameBytes: 0,
          xattrValueBytes: 0,
          fixedStatBytes: 0,
          metadataBytes: 0,
          uids: [],
          gids: [],
          maximumFilenameLength: 0,
          maximumPathLength: 0,
          maximumSymlinkTargetLength: 0,
          maximumEntryXattrs: 0,
          maximumXattrNameLength: 0,
          maximumXattrValueLength: 0,
          maximumEntryXattrBytes: 0,
          maximumUid: 0,
          maximumGid: 0,
          sha256: '',
        };
        const account = (bytes: number) => {
          observed.metadataBytes = addBytes(
            observed.metadataBytes,
            bytes,
            ceiling.maximumMetadataBytes,
            'metadata',
          );
        };
        const commit = (bytes: Buffer) => {
          digest.update(String(bytes.length));
          digest.update(':');
          digest.update(bytes);
        };
        // Boundary: every FFI pointer addresses a live zero-terminated path/name or size-checked Buffer for this synchronous call; libc retains no pointer.
        const attrs = (path: Buffer, file: FileHandle | undefined) => {
          const cpath = terminate(path);
          const list = (buffer: Buffer | null) =>
            Number(
              file === undefined
                ? native.symbols.llistxattr(
                    ptr(cpath),
                    buffer === null ? null : ptr(buffer),
                    buffer?.length ?? 0,
                  )
                : native.symbols.flistxattr(
                    file.fd,
                    buffer === null ? null : ptr(buffer),
                    buffer?.length ?? 0,
                  ),
            );
          // Proof: controlled negative flistxattr output refused in the actual store consumer; oversize/list-change producers refuse in the source consumer.
          const size = list(null);
          if (!Number.isSafeInteger(size) || size < 0 || size > 65536)
            throw new Error('Unreadable or unsupported caller-visible Linux xattr list');
          account(size);
          const names = Buffer.alloc(size);
          if (size > 0 && list(names) !== size)
            throw new Error('Linux xattr names changed or unreadable');
          const ordered: Buffer[] = [];
          let start = 0;
          let entryXattrBytes = 0;
          for (let offset = 0; offset < names.length; offset++) {
            if (names[offset] !== 0) continue;
            if (offset === start) throw new Error('Malformed Linux xattr name');
            ordered.push(names.subarray(start, offset));
            start = offset + 1;
          }
          if (start !== names.length) throw new Error('Unterminated Linux xattr list');
          ordered.sort((left, right) => Buffer.compare(left, right));
          commit(Buffer.from(`xattrs:${String(ordered.length)}`));
          observed.maximumEntryXattrs = Math.max(observed.maximumEntryXattrs, ordered.length);
          for (let index = 0; index < ordered.length; index++) {
            const name = ordered.at(index);
            if (name === undefined || (index > 0 && name.equals(ordered[index - 1])))
              throw new Error('Duplicate or absent Linux xattr name');
            deadline.throwIfAborted();
            const cname = terminate(name);
            const get = (buffer: Buffer | null) =>
              Number(
                file === undefined
                  ? native.symbols.lgetxattr(
                      ptr(cpath),
                      ptr(cname),
                      buffer === null ? null : ptr(buffer),
                      buffer?.length ?? 0,
                    )
                  : native.symbols.fgetxattr(
                      file.fd,
                      ptr(cname),
                      buffer === null ? null : ptr(buffer),
                      buffer?.length ?? 0,
                    ),
              );
            // Proof: controlled fgetxattr failure refused before actual backup; changed/oversize values refuse in source consumers.
            const length = get(null);
            if (!Number.isSafeInteger(length) || length < 0 || length > 65536)
              throw new Error('Unreadable or unsupported Linux xattr value');
            account(length);
            entryXattrBytes = addBytes(
              entryXattrBytes,
              name.length + length,
              Number.MAX_SAFE_INTEGER,
              'entry attributes',
            );
            observed.maximumXattrNameLength = Math.max(
              observed.maximumXattrNameLength,
              name.length,
            );
            observed.maximumXattrValueLength = Math.max(observed.maximumXattrValueLength, length);
            // A non-null one-byte buffer distinguishes a real empty value read from the preceding size query.
            const value = Buffer.alloc(Math.max(1, length));
            if (get(value) !== length) throw new Error('Linux xattr value changed or unreadable');
            observed.xattrs = addBytes(
              observed.xattrs,
              1,
              Number.MAX_SAFE_INTEGER,
              'attribute count',
            );
            observed.xattrNameBytes = addBytes(
              observed.xattrNameBytes,
              name.length,
              Number.MAX_SAFE_INTEGER,
              'attribute names',
            );
            observed.xattrValueBytes = addBytes(
              observed.xattrValueBytes,
              length,
              Number.MAX_SAFE_INTEGER,
              'attribute values',
            );
            commit(name);
            commit(value.subarray(0, length));
          }
          observed.maximumEntryXattrBytes = Math.max(
            observed.maximumEntryXattrBytes,
            entryXattrBytes,
          );
          if (list(null) !== size) throw new Error('Linux xattr list changed');
        };
        const visit = async (
          path: Buffer,
          relative: Buffer,
          filename: Buffer,
          depth: number,
        ): Promise<void> => {
          deadline.throwIfAborted();
          // Proof: removing this guard made the actual store depth negative create backup content in a disposable copy.
          if (depth > ceiling.maximumDepth) throw new Error('Backup source depth ceiling exceeded');
          observed.paths = addBytes(observed.paths, 1, ceiling.maximumEntries, 'entries');
          observed.maximumDepth = Math.max(observed.maximumDepth, depth);
          observed.filenameBytes = addBytes(
            observed.filenameBytes,
            filename.length,
            Number.MAX_SAFE_INTEGER,
            'filename bytes',
          );
          observed.pathBytes = addBytes(
            observed.pathBytes,
            path.length,
            Number.MAX_SAFE_INTEGER,
            'path bytes',
          );
          account(filename.length + path.length);
          observed.maximumFilenameLength = Math.max(
            observed.maximumFilenameLength,
            filename.length,
          );
          observed.maximumPathLength = Math.max(observed.maximumPathLength, path.length);
          const before = await lstat(path, { bigint: true });
          // Proof: removing this guard admitted a matching lstat/fstat foreign-device producer through actual backup in a disposable copy.
          if (before.dev !== rootStatus.dev)
            throw new Error('Backup source crossed its filesystem');
          if (!(before.isFile() || before.isDirectory() || before.isSymbolicLink()))
            throw new Error('Unsupported backup source node kind');
          const encoded = encodeStatus(before);
          account(encoded.length);
          observed.fixedStatBytes = addBytes(
            observed.fixedStatBytes,
            encoded.length,
            Number.MAX_SAFE_INTEGER,
            'stat bytes',
          );
          uids.add(Number(before.uid));
          gids.add(Number(before.gid));
          observed.maximumUid = Math.max(observed.maximumUid, Number(before.uid));
          observed.maximumGid = Math.max(observed.maximumGid, Number(before.gid));
          commit(relative);
          commit(encoded);
          if (before.isSymbolicLink()) {
            observed.symlinks++;
            const targetLength = Number(before.size);
            account(targetLength);
            const target = await readlink(path, { encoding: 'buffer' });
            if (target.length !== targetLength)
              throw new Error('Backup source symlink target changed');
            observed.maximumSymlinkTargetLength = Math.max(
              observed.maximumSymlinkTargetLength,
              target.length,
            );
            observed.symlinkTargetBytes = addBytes(
              observed.symlinkTargetBytes,
              target.length,
              Number.MAX_SAFE_INTEGER,
              'symlink bytes',
            );
            commit(target);
            attrs(path, undefined);
          } else {
            const file = await open(
              path,
              constants.O_RDONLY |
                constants.O_NOFOLLOW |
                (before.isDirectory() ? constants.O_DIRECTORY : 0),
            );
            await cleanup(
              async () => {
                requireSameStatus(before, await file.stat({ bigint: true }));
                attrs(path, file);
                if (before.isFile()) {
                  const size = Number(before.size);
                  observed.logicalBytes = addBytes(
                    observed.logicalBytes,
                    size,
                    ceiling.maximumLogicalBytes,
                    'logical bytes',
                  );
                  observed.regularFiles++;
                  if (size > 0) observed.nonemptyFiles++;
                  observed.maximumFileLength = Math.max(observed.maximumFileLength, size);
                  observed.freshChunkReferences = addBytes(
                    observed.freshChunkReferences,
                    Math.ceil(size / 524288),
                    Number.MAX_SAFE_INTEGER,
                    'chunk references',
                  );
                } else {
                  observed.directories++;
                  // Boundary: Node declarations omit the runtime encoding:buffer option; Bun's ordinary raw-name fixture proves its byte-preserving response.
                  const directory = await opendir(path, {
                    encoding: 'buffer' as BufferEncoding,
                    bufferSize: 1,
                  });
                  await cleanup(
                    async () => {
                      const children: Buffer[] = [];
                      for (;;) {
                        deadline.throwIfAborted();
                        // Boundary: Bun 1.4 returns a raw Buffer for encoding:buffer; Node returns Dirent<Buffer>.
                        // Validate both representations and refuse everything else, including an absent name.
                        const entry: unknown = await directory.read();
                        if (entry === null) break;
                        const name = Buffer.isBuffer(entry)
                          ? entry
                          : typeof entry === 'object' &&
                              'name' in entry &&
                              Buffer.isBuffer(entry.name)
                            ? entry.name
                            : undefined;
                        if (
                          name === undefined ||
                          name.length === 0 ||
                          name.includes(0) ||
                          name.includes(47) ||
                          name.equals(Buffer.from('.')) ||
                          name.equals(Buffer.from('..'))
                        )
                          throw new Error('Invalid raw source filename boundary');
                        if (
                          children.length >= ceiling.maximumFanout ||
                          children.length >= ceiling.maximumEntries - observed.paths
                        )
                          throw new Error('Backup source fanout or entries ceiling exceeded');
                        // Reserve each queued raw name before retaining it; visit later accounts full paths and stat fields.
                        account(name.length);
                        children.push(name);
                      }
                      observed.maximumFanout = Math.max(observed.maximumFanout, children.length);
                      children.sort((left, right) => Buffer.compare(left, right));
                      for (let index = 0; index < children.length; index++) {
                        const name = children.at(index);
                        if (name === undefined || (index > 0 && name.equals(children[index - 1])))
                          throw new Error('Duplicate or absent raw source entry');
                        await visit(
                          Buffer.concat([path, Buffer.from('/'), name]),
                          Buffer.concat([relative, Buffer.from('/'), name]),
                          name,
                          depth + 1,
                        );
                      }
                    },
                    () => directory.close(),
                  );
                }
                requireSameStatus(before, await file.stat({ bigint: true }));
              },
              () => file.close(),
            );
          }
          requireSameStatus(before, await lstat(path, { bigint: true }));
        };
        await visit(Buffer.from(root), Buffer.alloc(0), Buffer.alloc(0), 0);
        requireSameStatus(rootStatus, await lstat(root, { bigint: true }));
        observed.uids = [...uids].sort((left, right) => left - right);
        observed.gids = [...gids].sort((left, right) => left - right);
        observed.sha256 = digest.digest('hex');
        return observed;
      };
      const registry = await observeRoot(source.registryPath, limits.registry);
      const journal = await observeRoot(source.journalPath, limits.journal);
      const path = join(source.journalPath, 'journal.json');
      const before = await lstat(path, { bigint: true });
      if (!before.isFile() || before.size > 16n * 1024n ** 2n)
        throw new Error('Invalid bounded backup source journal');
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const bytes = await cleanup(
        async () => {
          requireSameStatus(before, await file.stat({ bigint: true }));
          const buffer = Buffer.alloc(Number(before.size));
          let offset = 0;
          while (offset < buffer.length) {
            deadline.throwIfAborted();
            const remaining = buffer.length - offset;
            const { bytesRead } = await file.read(buffer, offset, remaining, offset);
            // Proof: actual reads with NaN/absent progress created verified snapshots before this guard; exact-diagnostic and one-read consumers prevent secondary-error masking.
            if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0 || bytesRead > remaining)
              throw new Error('Malformed backup source journal read progress');
            offset += bytesRead;
          }
          requireSameStatus(before, await file.stat({ bigint: true }));
          requireSameStatus(before, await lstat(path, { bigint: true }));
          return buffer;
        },
        () => file.close(),
      );
      // Proof: bypassing revision equality returned an observation for revision 8 under the revision-7 source consumer.
      if (
        type({ revision: 'number.safe >= 0' }).assert(JSON.parse(bytes.toString('utf8')))
          .revision !== source.journalRevision
      )
        throw new Error('Backup source journal revision differs from canonical census');
      const journalSha256 = createHash('sha256').update(bytes).digest('hex');
      // Proof: removing this bookend admitted the controlled authority failure before snapshot admission through actual backup.
      await assertAuthority();
      const binding = {
        scope: 'contents-metadata-only' as const,
        xattrScope: 'caller-visible-only' as const,
        operationId: source.operationId,
        registryId: source.registryId,
        storageId: source.storageId,
        registryPath: source.registryPath,
        journalPath: source.journalPath,
        journalRevision: source.journalRevision,
        censusSha256: source.censusSha256,
        journalSha256,
        registry,
        journal,
      };
      return {
        ...binding,
        sha256: createHash('sha256').update(JSON.stringify(binding)).digest('hex'),
      };
    },
    () => {
      native.close();
      return Promise.resolve();
    },
  );
}
