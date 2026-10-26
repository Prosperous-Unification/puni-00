import { createHash } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  fsync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  rmdir,
  symlink,
  unlink,
} from 'node:fs/promises';

import { scanMigrationArtifact } from '../src/lib/dependency-migration-artifact-scanner';
import { envLayout } from '../src/lib/env';
import {
  inspectSourceArtifacts,
  readSourceArtifactChunk,
  recheckSourceArtifacts,
  type SourceArtifactMember,
  type SourceArtifacts,
} from './source-stageb-artifacts';
import {
  assertSourceInputArtifact,
  inspectSourceInputs,
  type SourceInputs,
} from './source-stageb-inputs';
import {
  appendSourceIntent,
  dispatchSourceIntent,
  inspectSourceJournal,
  type RecordedResource,
  recordSourceObservation,
  recordSourceUncertainty,
  type SourceDispatch,
  type SourceJournal,
} from './source-stageb-journal';

declare const stagingBrand: unique symbol;
/** Original verified-input-staging ownership under sole-writer coordinator custody. Authority installation and writer build provenance remain not-established; no B2/provider/preparation authority. */
export interface SourceStaging {
  readonly [stagingBrand]: true;
}
interface Member {
  readonly path: string;
  readonly kind: 'directory' | 'file' | 'symlink';
  identity?: BigIntStats;
  target?: string;
  bytes?: number;
  sha256?: string;
}
interface LeafReference {
  readonly file: FileHandle;
  readonly descriptor: number;
  identity?: BigIntStats;
  closing?: Promise<void>;
}
interface Lifetime {
  readonly inputs: SourceInputs;
  readonly artifacts: SourceArtifacts;
  readonly journal: SourceJournal;
  readonly parent: FileHandle;
  readonly parentFd: number;
  readonly parentIdentity: BigIntStats;
  readonly parentFlags: number;
  readonly parentName: string;
  readonly deadline: number;
  hasChild: boolean;
  child?: number;
  childIdentity?: BigIntStats;
  resource?: RecordedResource;
  dispatch?: SourceDispatch;
  readonly members: Member[];
  readonly leaves: LeafReference[];
  isLive: boolean;
  closing?: Promise<void>;
}
const lifetimes = new WeakMap<SourceStaging, Lifetime>();
const childName = 'source-stageb-staging';
const activeInputs = new WeakSet<SourceInputs>();
const failedStaging = new Set<Lifetime>();
const failedParentReferences = new Set<FileHandle>();
function refuseStaging(reason: string): never {
  throw new Error(`source staging ${reason}`);
}
function hashBytes(bytes: string | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
function assertSameNode(actual: BigIntStats, expected: BigIntStats) {
  if (
    actual.dev !== expected.dev ||
    actual.ino !== expected.ino ||
    actual.mode !== expected.mode ||
    actual.uid !== expected.uid ||
    actual.gid !== expected.gid
  )
    refuseStaging('object identity differs');
}
function getDescriptorPath(fd: number, suffix = '') {
  if (!Number.isSafeInteger(fd) || fd < 0) refuseStaging('descriptor absent');
  return `/proc/self/fd/${String(fd)}${suffix === '' ? '' : '/' + suffix}`;
}
function getChildPath(lifetime: Lifetime, suffix = '') {
  if (lifetime.child === undefined) refuseStaging('child absent');
  return getDescriptorPath(lifetime.child, suffix);
}
function assertLive(lifetime: Lifetime) {
  if (!lifetime.isLive) refuseStaging('closed lifetime');
  const inspection = inspectSourceInputs(lifetime.inputs);
  if (performance.now() >= lifetime.deadline || inspection.originalDeadline !== lifetime.deadline)
    refuseStaging('deadline differs');
}
function assertParent(lifetime: Lifetime) {
  if (lifetime.parent.fd !== lifetime.parentFd) refuseStaging('parent descriptor changed');
  assertSameNode(fstatSync(lifetime.parentFd, { bigint: true }), lifetime.parentIdentity);
  if (
    parseParentFlags(readFileSync(`/proc/self/fdinfo/${String(lifetime.parentFd)}`, 'utf8')) !==
    lifetime.parentFlags
  )
    refuseStaging('owned parent flags changed');
  assertSameNode(lstatSync(lifetime.parentName, { bigint: true }), lifetime.parentIdentity);
}
function assertBinding(lifetime: Lifetime) {
  assertParent(lifetime);
  if (lifetime.child === undefined || lifetime.childIdentity === undefined)
    refuseStaging('child identity absent');
  assertSameNode(fstatSync(lifetime.child, { bigint: true }), lifetime.childIdentity);
  assertSameNode(
    lstatSync(getDescriptorPath(lifetime.parentFd, childName), { bigint: true }),
    lifetime.childIdentity,
  );
}
async function syncDescriptor(fd: number) {
  await new Promise<void>((resolve, reject) => {
    fsync(fd, (failure) => {
      if (failure === null) resolve();
      else reject(failure);
    });
  });
}
function getLifetime(token: SourceStaging) {
  const lifetime = lifetimes.get(token);
  if (lifetime === undefined) refuseStaging('original token refused');
  return lifetime;
}
async function recordPopulation(lifetime: Lifetime, dispatch: SourceDispatch, bytes: string) {
  assertLive(lifetime);
  assertBinding(lifetime);
  await recordSourceObservation(lifetime.journal, dispatch, {
    observationSha256: hashBytes(bytes),
  });
  assertLive(lifetime);
  assertBinding(lifetime);
}
async function createDirectory(lifetime: Lifetime, relative: string, mode: number) {
  assertLive(lifetime);
  assertBinding(lifetime);
  await mkdir(getChildPath(lifetime, relative), { mode, recursive: false });
  const member: Member = { path: relative, kind: 'directory' };
  lifetime.members.push(member);
  member.identity = await lstat(getChildPath(lifetime, relative), { bigint: true });
  if (!member.identity.isDirectory() || Number(member.identity.mode & 0o7777n) !== mode)
    refuseStaging('created directory mode differs');
  assertBinding(lifetime);
  assertLive(lifetime);
}
function retainLeaf(lifetime: Lifetime, file: FileHandle): LeafReference {
  const leaf: LeafReference = { file, descriptor: file.fd };
  // Proof: leaf-immediate-ledger omission lost failed reopened-reader cleanup evidence; wave1 reader-close consumer RED.
  lifetime.leaves.push(leaf);
  leaf.identity = fstatSync(leaf.descriptor, { bigint: true });
  return leaf;
}
function settleLeaf(leaf: LeafReference): Promise<void> {
  // Proof: leaf-close-memoization omission retried a failed actual close; wave1 writer-primary-close count consumer RED.
  if (leaf.closing !== undefined) return leaf.closing;
  leaf.closing = (async () => {
    if (leaf.file.fd !== leaf.descriptor || leaf.identity === undefined)
      refuseStaging('leaf close ownership unproved');
    // Proof: leaf-reader/writer-close-identity omissions closed the actual recycled replacement sentinels; both wave1 consumers RED.
    assertSameNode(fstatSync(leaf.descriptor, { bigint: true }), leaf.identity);
    // Proof: leaf-close-effect omission leaked actual owned leaf references; actual J-owned staging consumer RED.
    await leaf.file.close();
  })();
  return leaf.closing;
}
async function finishLeaf(leaf: LeafReference, primary?: { cause: unknown }): Promise<void> {
  let cleanup: { cause: unknown } | undefined;
  try {
    await settleLeaf(leaf);
  } catch (cause) {
    cleanup = { cause };
  }
  if (cleanup !== undefined) {
    // Proof: leaf-reader/writer-primary-preservation omissions lost each original operation failure under a close failure; both wave1 consumers RED.
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup.cause],
        'source leaf operation and cleanup failed',
        { cause: primary.cause },
      );
    throw cleanup.cause;
  }
  if (primary !== undefined) throw primary.cause;
}
async function writeMember(
  lifetime: Lifetime,
  member: SourceArtifactMember | { path: string; mode: number; bytes: Uint8Array },
  consumed?: { hash: ReturnType<typeof createHash>; bytes: number },
) {
  assertLive(lifetime);
  assertBinding(lifetime);
  const location = getChildPath(lifetime, member.path);
  const file = await open(
    location,
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  const created: Member = { path: member.path, kind: 'file' };
  lifetime.members.push(created);
  const leaf = retainLeaf(lifetime, file);
  let primary: { cause: unknown } | undefined;
  try {
    created.identity = await file.stat({ bigint: true });
    if (!created.identity.isFile() || created.identity.nlink !== 1n)
      refuseStaging('created file differs');
    assertSameNode(await lstat(location, { bigint: true }), created.identity);
    const expectedBytes = typeof member.bytes === 'number' ? member.bytes : member.bytes.length;
    const expectedHash = 'sha256' in member ? member.sha256 : hashBytes(member.bytes);
    created.bytes = expectedBytes;
    created.sha256 = expectedHash;
    const hash = createHash('sha256');
    for (let offset = 0; offset < expectedBytes;) {
      assertLive(lifetime);
      assertBinding(lifetime);
      assertSameNode(await file.stat({ bigint: true }), created.identity);
      assertSameNode(await lstat(location, { bigint: true }), created.identity);
      const chunk =
        'slot' in member
          ? await readSourceArtifactChunk(
              lifetime.inputs,
              lifetime.artifacts,
              member.slot,
              member.offset + offset,
              Math.min(65536, expectedBytes - offset),
            )
          : member.bytes.subarray(offset, offset + 65536);
      hash.update(chunk);
      if (consumed !== undefined && 'offset' in member) {
        if (consumed.bytes !== member.offset + offset) refuseStaging('consumed stream order');
        consumed.hash.update(chunk);
        consumed.bytes += chunk.length;
      }
      let written = 0;
      while (written < chunk.length) {
        const write = await file.write(chunk, written, chunk.length - written, offset + written);
        if (write.bytesWritten < 1 || write.bytesWritten > chunk.length - written)
          refuseStaging('short write');
        written += write.bytesWritten;
        assertLive(lifetime);
      }
      offset += chunk.length;
    }
    if (hash.digest('hex') !== expectedHash) refuseStaging('population member hash differs');
    await file.chmod(member.mode);
    const changedIdentity = await file.stat({ bigint: true });
    const acquiredIdentity = leaf.identity ?? refuseStaging('acquired leaf identity absent');
    // Proof: post-chmod-original-identity omission rebased close authority and closed the actual distinct-inode sentinel; wave2 consumer RED with sentinelSurvived:false, exact restoration GREEN.
    if (
      changedIdentity.dev !== acquiredIdentity.dev ||
      changedIdentity.ino !== acquiredIdentity.ino ||
      changedIdentity.uid !== acquiredIdentity.uid ||
      changedIdentity.gid !== acquiredIdentity.gid ||
      (changedIdentity.mode & 0o170000n) !== (acquiredIdentity.mode & 0o170000n) ||
      !changedIdentity.isFile()
    )
      refuseStaging('post-chmod identity differs');
    created.identity = changedIdentity;
    leaf.identity = changedIdentity;
    assertSameNode(await lstat(location, { bigint: true }), created.identity);
    await file.sync();
    assertLive(lifetime);
    assertBinding(lifetime);
    const readback = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let offset = 0;
    for (;;) {
      assertLive(lifetime);
      const read = await file.read(
        buffer,
        0,
        Math.min(buffer.length, expectedBytes - offset + 1),
        offset,
      );
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
      if (offset > expectedBytes) refuseStaging('readback extra bytes');
      readback.update(buffer.subarray(0, read.bytesRead));
    }
    if (
      offset !== expectedBytes ||
      readback.digest('hex') !== expectedHash ||
      Number(created.identity.mode & 0o7777n) !== member.mode
    )
      refuseStaging('readback differs');
    assertSameNode(await file.stat({ bigint: true }), created.identity);
    assertSameNode(await lstat(location, { bigint: true }), created.identity);
  } catch (cause) {
    primary = { cause };
  }
  await finishLeaf(leaf, primary);
}
async function checkMembership(lifetime: Lifetime) {
  assertBinding(lifetime);
  const expected = new Map(lifetime.members.map((member) => [member.path, member]));
  const actual = new Set<string>();
  async function verifyDirectory(relative: string) {
    for (const name of await readdir(getChildPath(lifetime, relative))) {
      const memberPath = relative === '' ? name : relative + '/' + name;
      const member = expected.get(memberPath);
      if (member?.identity === undefined) refuseStaging('extra membership');
      const identity = await lstat(getChildPath(lifetime, memberPath), { bigint: true });
      assertSameNode(identity, member.identity);
      actual.add(memberPath);
      if (member.kind === 'directory') await verifyDirectory(memberPath);
      else if (member.kind === 'file') {
        if (member.bytes === undefined || member.sha256 === undefined)
          refuseStaging('file expectation absent');
        const file = await open(
          getChildPath(lifetime, memberPath),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const leaf = retainLeaf(lifetime, file);
        let primary: { cause: unknown } | undefined;
        try {
          const before = await file.stat({ bigint: true });
          assertSameNode(before, member.identity);
          // Proof: staged-file-metadata-continuity saved fault made the actual consumer RED; exact restoration replayed GREEN.
          if (
            before.nlink !== 1n ||
            before.size !== BigInt(member.bytes) ||
            before.mtimeNs !== member.identity.mtimeNs ||
            before.ctimeNs !== member.identity.ctimeNs
          )
            refuseStaging('final file metadata differs');
          const hash = createHash('sha256');
          const buffer = Buffer.alloc(65536);
          let bytes = 0;
          for (;;) {
            assertLive(lifetime);
            const read = await file.read(
              buffer,
              0,
              Math.min(buffer.length, member.bytes - bytes + 1),
              bytes,
            );
            if (read.bytesRead === 0) break;
            bytes += read.bytesRead;
            if (bytes > member.bytes) refuseStaging('final file grew');
            hash.update(buffer.subarray(0, read.bytesRead));
          }
          // Proof: final-member-readback omission admitted corrupted actual final-read buffers with metadata/input joins intact; independent output-readback consumer RED.
          if (bytes !== member.bytes || hash.digest('hex') !== member.sha256)
            refuseStaging('final file bytes differ');
          const after = await file.stat({ bigint: true });
          assertSameNode(after, before);
          assertSameNode(await lstat(getChildPath(lifetime, memberPath), { bigint: true }), before);
          if (after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs)
            refuseStaging('final file changed during read');
        } catch (cause) {
          primary = { cause };
        }
        await finishLeaf(leaf, primary);
      } else if ((await readlink(getChildPath(lifetime, memberPath))) !== member.target)
        refuseStaging('symlink changed');
    }
  }
  await verifyDirectory('');
  if (actual.size !== expected.size) refuseStaging('missing membership');
  assertBinding(lifetime);
}
async function populateStaging(lifetime: Lifetime) {
  const projection = inspectSourceArtifacts(lifetime.artifacts);
  const directoryModes = new Map<string, number>([
    ['source', 0o755],
    ['source/.git', 0o755],
    ['source/node_modules', 0o755],
    ['authority', 0o700],
    ['solver', 0o700],
    ['caddy', 0o700],
    ['migration', 0o700],
    ['migration/drizzle', 0o755],
  ]);
  const getSourcePath = (root: string, relative: string) =>
    root === 'source'
      ? `source/${relative}`
      : root === 'git'
        ? `source/.git/${relative}`
        : `source/node_modules/${relative}`;
  for (const entry of projection.manifest.entries)
    if (entry.kind === 'directory')
      directoryModes.set(getSourcePath(entry.root, entry.path), entry.mode);
  for (const row of projection.migrations.migrations)
    directoryModes.set(`migration/drizzle/${row.name}`, 0o755);
  for (const [relative, mode] of [...directoryModes].sort(
    ([left], [right]) =>
      left.split('/').length - right.split('/').length ||
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
  ))
    await createDirectory(lifetime, relative, mode);
  const consumed = new Map(
    projection.frames.map((frame) => [
      frame.slot,
      { hash: createHash('sha256').update(frame.bytes), bytes: frame.bytes.length },
    ]),
  );
  for (const member of projection.members)
    await writeMember(
      lifetime,
      member,
      consumed.get(member.slot) ?? refuseStaging('consumed role absent'),
    );
  for (const [slot, stream] of consumed)
    // Proof: isolated-consumed-stream omitted only this join; an actual digest-observation fault admitted staging and its consumer RED, with member/readback/rehash guards intact.
    assertSourceInputArtifact(lifetime.inputs, slot, stream.bytes, stream.hash.digest('hex'));
  const configPaths = { backend: 'be-01', gateway: 'gw-01', mcp: 'mcp-01', frontend: 'fe-01' };
  for (const slot of ['backend', 'gateway', 'mcp', 'frontend'] as const)
    await writeMember(lifetime, {
      path: `source/apps/wbs/${configPaths[slot]}/.env`,
      mode: 0o600,
      bytes: Buffer.from(projection.configuration.sourceFiles[slot]),
    });
  for (const slot of ['root', 'redaction', 'prod', 'dev'] as const)
    await writeMember(lifetime, {
      path: `caddy/${slot}`,
      mode: 0o600,
      bytes: Buffer.from(projection.configuration.caddyFiles[slot]),
    });
  for (const member of projection.members)
    if (member.path.startsWith('source/apps/wbs/be-01/drizzle/'))
      await writeMember(lifetime, {
        ...member,
        path: 'migration/drizzle/' + member.path.slice('source/apps/wbs/be-01/drizzle/'.length),
      });
  await writeMember(lifetime, {
    path: 'migration/manifest.json',
    mode: 0o600,
    bytes: projection.migrationManifestBytes,
  });
  // Payloads are validated and read back before any declared symlink is created; no later write traverses a symlink.
  for (const entry of projection.manifest.entries)
    if (entry.kind === 'symlink') {
      assertLive(lifetime);
      assertBinding(lifetime);
      const relative = getSourcePath(entry.root, entry.path);
      await symlink(entry.target, getChildPath(lifetime, relative));
      const member: Member = { path: relative, kind: 'symlink', target: entry.target };
      lifetime.members.push(member);
      member.identity = await lstat(getChildPath(lifetime, relative), { bigint: true });
      if (!member.identity.isSymbolicLink()) refuseStaging('created symlink differs');
    }
  assertBinding(lifetime);
  const physicalChild = readlinkSync(
    getDescriptorPath(lifetime.child ?? refuseStaging('child absent')),
  );
  const scan = await scanMigrationArtifact(`${physicalChild}/migration/drizzle`, lifetime.deadline);
  if (JSON.stringify(scan.migrations) !== JSON.stringify(projection.migrations.migrations))
    refuseStaging('migration actual scan differs');
  await checkMembership(lifetime);
  await recheckSourceArtifacts(lifetime.inputs, lifetime.artifacts);
  await syncDescriptor(lifetime.child ?? refuseStaging('child absent'));
  await lifetime.parent.sync();
  assertLive(lifetime);
  assertBinding(lifetime);
}
async function removeStaging(lifetime: Lifetime): Promise<void> {
  const failures: unknown[] = [];
  let removal: SourceDispatch | undefined;
  let hasBinding = false;
  for (const leaf of lifetime.leaves)
    try {
      await settleLeaf(leaf);
    } catch (failure) {
      failures.push(failure);
    }
  try {
    if (lifetime.hasChild) {
      if (lifetime.childIdentity !== undefined) assertBinding(lifetime);
      else assertParent(lifetime);
      hasBinding = true;
    }
  } catch (failure) {
    failures.push(failure);
  }
  if (lifetime.hasChild && hasBinding) {
    if (lifetime.resource !== undefined)
      try {
        const intent = await appendSourceIntent(lifetime.journal, {
          operation: 'remove',
          resource: lifetime.resource,
        });
        removal = await dispatchSourceIntent(lifetime.journal, intent);
      } catch (failure) {
        failures.push(failure);
      }
    // Proof: published-remove-intent/dispatch-order omissions caused witnessed unlink/rmdir after failed durable publication; both wave1 consumers RED.
    if (lifetime.resource === undefined || removal !== undefined) {
      for (const member of [...lifetime.members].reverse())
        try {
          assertBinding(lifetime);
          if (member.identity === undefined) refuseStaging('member cleanup identity unproved');
          assertSameNode(
            await lstat(getChildPath(lifetime, member.path), { bigint: true }),
            member.identity,
          );
          if (member.kind === 'directory') await rmdir(getChildPath(lifetime, member.path));
          else await unlink(getChildPath(lifetime, member.path));
        } catch (failure) {
          failures.push(failure);
        }
      try {
        if (lifetime.childIdentity !== undefined) assertBinding(lifetime);
        else assertParent(lifetime);
        await rmdir(getDescriptorPath(lifetime.parentFd, childName));
        await lifetime.parent.sync();
        if (removal !== undefined)
          await recordSourceObservation(lifetime.journal, removal, {
            observationSha256: hashBytes('original staging membership absent'),
          });
      } catch (failure) {
        failures.push(failure);
        if (removal !== undefined)
          try {
            await recordSourceUncertainty(lifetime.journal, removal, 'readback-failed');
          } catch (uncertainty) {
            failures.push(uncertainty);
          }
      }
    }
  }
  if (lifetime.child !== undefined)
    try {
      if (lifetime.childIdentity !== undefined)
        assertSameNode(fstatSync(lifetime.child, { bigint: true }), lifetime.childIdentity); // Boundary: before first stat, this is the raw FD synchronously acquired and registered under sole FD custody; no borrowed FD is accepted.
      // Proof: raw-child-close-effect saved fault made the actual consumer RED; exact restoration replayed GREEN.
      closeSync(lifetime.child);
      lifetime.child = undefined;
    } catch (failure) {
      failures.push(failure);
    }
  try {
    if (lifetime.parent.fd !== lifetime.parentFd) refuseStaging('parent close descriptor differs');
    assertSameNode(fstatSync(lifetime.parentFd, { bigint: true }), lifetime.parentIdentity);
    if (
      parseParentFlags(readFileSync(`/proc/self/fdinfo/${String(lifetime.parentFd)}`, 'utf8')) !==
      lifetime.parentFlags
    )
      refuseStaging('owned parent flags changed');
    // Proof: owned-parent-close-effect saved fault made the actual consumer RED; exact restoration replayed GREEN.
    await lifetime.parent.close();
  } catch (failure) {
    failures.push(failure);
  }
  if (failures.length > 0) {
    failedStaging.add(lifetime);
    throw new AggregateError(failures, 'source staging cleanup unproved');
  }
  activeInputs.delete(lifetime.inputs);
}
interface BorrowedParent {
  descriptor: number;
  identity: BigIntStats;
  name: string;
  flags: number;
}
function parseParentFlags(contents: string) {
  const encoded = /^flags:\s+([0-7]+)$/m.exec(contents)?.at(1);
  if (encoded === undefined) refuseStaging('parent flags absent');
  const flags = Number.parseInt(encoded, 8);
  // Proof: parent-access saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if ((flags & 3) !== 0 || (flags & 0x200000) !== 0)
    refuseStaging('parent read-only access required');
  return flags;
}
async function readParentFlags(descriptor: number) {
  return parseParentFlags(await readFile(`/proc/self/fdinfo/${String(descriptor)}`, 'utf8'));
}
async function assertBorrowedParent(inputs: SourceInputs, borrowed: BorrowedParent) {
  inspectSourceInputs(inputs);
  assertSameNode(fstatSync(borrowed.descriptor, { bigint: true }), borrowed.identity);
  if (
    readlinkSync(getDescriptorPath(borrowed.descriptor)) !== borrowed.name ||
    (await readParentFlags(borrowed.descriptor)) !== borrowed.flags
  )
    refuseStaging('borrowed parent changed');
  inspectSourceInputs(inputs);
}
/** Borrows stable parent number until this Promise settles, acquiring only B's own procfd directory reference. Original caller descriptor is never closed. */
export async function stageSourceArtifacts(
  inputs: SourceInputs,
  artifacts: SourceArtifacts,
  journal: SourceJournal,
  parentDescriptor: number,
): Promise<SourceStaging> {
  const inspection = inspectSourceInputs(inputs);
  inspectSourceArtifacts(artifacts);
  if (activeInputs.has(inputs)) refuseStaging('overlapping staging lifetime');
  if (
    !Number.isSafeInteger(parentDescriptor) ||
    parentDescriptor < 0 ||
    parentDescriptor === 8 ||
    parentDescriptor > 2147483647
  )
    refuseStaging('borrowed parent descriptor refused');
  activeInputs.add(inputs);
  let acquisition: { file: FileHandle; descriptor: number; identity?: BigIntStats } | undefined;
  let isDelegated = false;
  try {
    // Proof: required-verification-before-parent deferral reproduced actual unhandled rejection and parent acquisition before the required failure joined; wave1 consumer RED.
    await recheckSourceArtifacts(inputs, artifacts);
    const identity = fstatSync(parentDescriptor, { bigint: true });
    if (
      process.geteuid === undefined ||
      process.getegid === undefined ||
      !identity.isDirectory() ||
      identity.uid !== BigInt(process.geteuid()) ||
      identity.gid !== BigInt(process.getegid()) ||
      (identity.mode & 0o7777n) !== 0o700n
    )
      refuseStaging('borrowed parent custody refused');
    const borrowed: BorrowedParent = {
      descriptor: parentDescriptor,
      identity,
      name: readlinkSync(getDescriptorPath(parentDescriptor)),
      flags: await readParentFlags(parentDescriptor),
    };
    await assertBorrowedParent(inputs, borrowed);
    const file = await open(
      getDescriptorPath(parentDescriptor),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NONBLOCK,
    );
    // Proof: late-parent-ledger saved fault made the actual consumer RED; exact restoration replayed GREEN.
    acquisition = { file, descriptor: file.fd };
    acquisition.identity = fstatSync(file.fd, { bigint: true });
    inspectSourceInputs(inputs);
    if (file.fd === parentDescriptor) refuseStaging('parent descriptor collision');
    assertSameNode(acquisition.identity, identity);
    const ownFlags = await readParentFlags(file.fd);
    await assertBorrowedParent(inputs, borrowed);
    isDelegated = true;
    return await stageOwnedArtifacts(
      inputs,
      artifacts,
      journal,
      file,
      ownFlags,
      borrowed,
      inspection,
    );
  } catch (primary) {
    if (isDelegated) throw primary;
    const failures: unknown[] = [primary];
    if (acquisition !== undefined)
      try {
        if (acquisition.file.fd !== acquisition.descriptor)
          refuseStaging('owned parent descriptor changed');
        if (acquisition.identity !== undefined)
          assertSameNode(fstatSync(acquisition.descriptor, { bigint: true }), acquisition.identity);
        await acquisition.file.close();
      } catch (failure) {
        failedParentReferences.add(acquisition.file);
        failures.push(failure);
      }
    if (failures.length === 1) activeInputs.delete(inputs);
    else
      throw new AggregateError(failures, 'source parent acquisition and cleanup failed', {
        cause: primary,
      });
    throw primary;
  }
}
/** Actual fixed-child staging under sole-writer custody; synchronous acquisition excludes cooperative yields, not external syscall races. */
async function stageOwnedArtifacts(
  inputs: SourceInputs,
  artifacts: SourceArtifacts,
  journal: SourceJournal,
  parent: FileHandle,
  parentFlags: number,
  borrowed: BorrowedParent,
  inspection: ReturnType<typeof inspectSourceInputs>,
): Promise<SourceStaging> {
  const parentIdentity = borrowed.identity;
  const parentName = borrowed.name;
  const lifetime: Lifetime = {
    inputs,
    artifacts,
    journal,
    parent,
    parentFd: parent.fd,
    parentIdentity,
    parentFlags,
    parentName,
    deadline: inspection.originalDeadline,
    hasChild: false,
    members: [],
    leaves: [],
    isLive: true,
  };
  try {
    if (process.geteuid === undefined || process.getegid === undefined)
      refuseStaging('UID observation unavailable');
    if (
      !parentIdentity.isDirectory() ||
      parentIdentity.uid !== BigInt(process.geteuid()) ||
      parentIdentity.gid !== BigInt(process.getegid()) ||
      (parentIdentity.mode & 0o7777n) !== 0o700n ||
      (String(parentIdentity.dev) === inspection.review.registry.device &&
        String(parentIdentity.ino) === inspection.review.registry.inode) ||
      [envLayout('prod').root, envLayout('dev').root].some(
        (root) => parentName === root || parentName.startsWith(root + '/'),
      )
    )
      refuseStaging('parent custody refused');
    assertParent(lifetime);
    const snapshot = await inspectSourceJournal(journal);
    // Proof: backing-parent-exclusion omission changed and invalidated actual original J; wave1 no-effect/usability consumer RED.
    if (
      snapshot.journalDirectoryIdentity.device === String(parentIdentity.dev) &&
      snapshot.journalDirectoryIdentity.inode === String(parentIdentity.ino)
    )
      refuseStaging('journal backing parent alias');
    // Proof: recorded-parent-exclusion omission created a child and changed actual J records; wave1 no-effect consumer RED.
    if (
      snapshot.resources.some(
        (resource) =>
          // Proof: only-live-resource-exclusion omission refused the actual absence-recorded parent control; wave1 eligibility consumer RED.
          resource.status === 'recorded' &&
          resource.identity['kind'] === 'directory' &&
          resource.identity['device'] === String(parentIdentity.dev) &&
          resource.identity['inode'] === String(parentIdentity.ino),
      )
    )
      refuseStaging('journal resource parent alias');
    const claim = {
      format: 'source-stageb-journal',
      version: 1,
      nonce: inspection.review.nonce,
      implementationSha: inspection.review.implementationSha,
      workflowSha: inspection.review.workflowSha,
      sourceSha: inspection.review.sourceSha,
      inputManifestSha256: inspection.review.inputManifestSha256,
    };
    const first = snapshot.records.at(0);
    if (
      typeof first !== 'object' ||
      first === null ||
      Array.isArray(first) ||
      !('payload' in first) ||
      JSON.stringify(first['payload']) !== JSON.stringify({ kind: 'claim', claim })
    )
      refuseStaging('journal I join differs');
    try {
      await lstat(getDescriptorPath(parent.fd, childName));
      // Proof: preexisting-before-intent-barrier saved fault made the ordering barrier RED; exact restoration replayed GREEN.
      refuseStaging('preexisting child');
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT'))
        throw failure;
    }
    const intent = await appendSourceIntent(journal, {
      operation: 'create',
      resourceClass: 'directory',
      purpose: 'inputs',
    });
    // Proof: durable-J-dispatch-before-mkdir saved fault made the actual consumer RED; exact restoration replayed GREEN.
    lifetime.dispatch = await dispatchSourceIntent(journal, intent);
    assertLive(lifetime);
    assertParent(lifetime);
    // Sole-writer custody is required: these syscalls are contiguous but are not atomic against another process.
    mkdirSync(getDescriptorPath(parent.fd, childName), { mode: 0o700, recursive: false });
    lifetime.hasChild = true;
    // Proof: acquisition-no-yield inserted an await here; actual cooperative acquisition ordering consumer RED.
    lifetime.child = openSync(
      getDescriptorPath(parent.fd, childName),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    lifetime.childIdentity = fstatSync(lifetime.child, { bigint: true });
    assertBinding(lifetime);
    if (
      !lifetime.childIdentity.isDirectory() ||
      (lifetime.childIdentity.mode & 0o7777n) !== 0o700n ||
      lifetime.childIdentity.uid !== parentIdentity.uid ||
      lifetime.childIdentity.gid !== parentIdentity.gid
    )
      refuseStaging('child custody differs');
    await syncDescriptor(lifetime.child);
    await parent.sync();
    assertLive(lifetime);
    assertBinding(lifetime);
    lifetime.resource = await recordSourceObservation(journal, lifetime.dispatch, {
      identity: {
        kind: 'directory',
        device: String(lifetime.childIdentity.dev),
        inode: String(lifetime.childIdentity.ino),
        uid: Number(lifetime.childIdentity.uid),
        gid: Number(lifetime.childIdentity.gid),
        mode: 0o700,
      },
      observationSha256: hashBytes('original exclusive staging directory observed'),
    });
    lifetime.dispatch = undefined;
    if (lifetime.resource === undefined) refuseStaging('creation resource absent');
    const write = await appendSourceIntent(journal, {
      operation: 'write',
      resource: lifetime.resource,
    });
    lifetime.dispatch = await dispatchSourceIntent(journal, write);
    await populateStaging(lifetime);
    await recordPopulation(
      lifetime,
      lifetime.dispatch,
      JSON.stringify(inspectSourceArtifacts(artifacts).members),
    );
    lifetime.dispatch = undefined;
    await assertBorrowedParent(inputs, borrowed);
    assertLive(lifetime);
    const token = Object.freeze({});
    lifetimes.set(token as SourceStaging, lifetime);
    return token as SourceStaging; // Boundary: only this acquired and populated lifetime is registered; the brand never establishes authority.
  } catch (primary) {
    lifetime.isLive = false;
    const failures: unknown[] = [primary];
    if (lifetime.dispatch !== undefined)
      try {
        await recordSourceUncertainty(journal, lifetime.dispatch, 'readback-failed');
      } catch (failure) {
        failures.push(failure);
      }
    try {
      await removeStaging(lifetime);
    } catch (failure) {
      failures.push(failure);
    }
    if (failures.length > 1)
      throw new AggregateError(failures, 'source staging failed and cleanup unproved', {
        cause: primary,
      });
    throw primary;
  }
}
/** Original-token-only exact membership cleanup; memoizes settlement and preserves unproved cleanup. Parent and siblings are never deletion members. */
export function closeSourceStaging(token: SourceStaging): Promise<void> {
  let lifetime: Lifetime;
  try {
    lifetime = getLifetime(token);
  } catch (failure) {
    return Promise.reject(
      failure instanceof Error
        ? failure
        : new Error('source staging token refused', { cause: failure }),
    );
  }
  // Proof: staging-close-memoization saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (lifetime.closing !== undefined) return lifetime.closing;
  lifetime.isLive = false;
  lifetime.closing = removeStaging(lifetime);
  return lifetime.closing;
}
