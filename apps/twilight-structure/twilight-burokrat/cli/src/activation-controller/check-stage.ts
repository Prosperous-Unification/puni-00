import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { CheckRuntimeDescriptor, CheckSandboxProfile } from './check-launch';
import type { ActivationRequest } from './request';

const Sha256 = /^[0-9a-f]{64}$/;
// Linux O_CLOEXEC is absent from Node's fs.constants type, but required for retained source FDs.
const O_CLOEXEC = 0o2000000;
const DirectoryEntry = type({
  path: 'string>=1',
  type: "'directory'",
  mode: '493',
}).onUndeclaredKey('reject');
const FileEntry = type({
  path: 'string>=1',
  type: "'file'",
  mode: '420|493',
  size: 'number.integer>=0',
  sha256: Sha256,
}).onUndeclaredKey('reject');
const TreeEntry = DirectoryEntry.or(FileEntry);
const CandidateTree = type({
  schemaVersion: '1',
  kind: "'candidate-snapshot'",
  requestIdentity: Sha256,
  headSha: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  entries: TreeEntry.array(),
}).onUndeclaredKey('reject');
const ExecutableTree = type({
  schemaVersion: '1',
  kind: "'executable-tree'",
  entries: TreeEntry.array(),
}).onUndeclaredKey('reject');
type Entry = typeof TreeEntry.infer;
interface Tree {
  readonly entries: readonly Entry[];
}

/** Trusted diagnostic events used to make descriptor races deterministic in mounted tests. */
export interface StageDiagnostics {
  readonly afterDirectoryOpened?: (
    kind: 'candidate' | 'runtime',
    absolutePath: string,
    descriptor: number,
  ) => void;
  readonly afterRootOpened?: (kind: 'candidate' | 'runtime', descriptor: number) => void;
  readonly afterFileOpened?: (
    kind: 'candidate' | 'runtime',
    path: string,
    descriptor: number,
  ) => void;
  readonly afterTreeCopied?: (kind: 'candidate' | 'runtime', pendingRoot: string) => void;
}

export interface TrustedTreeSource {
  readonly bytes: string;
  readonly root: string;
}

export interface StagedCheckTrees {
  readonly stageRoot: string;
  readonly candidateIdentity: string;
  readonly runtimeIdentity: string;
  /** Removes private staged bytes; this does not launch or authenticate a check. */
  dispose(): void;
}

function refuseSource(kind: 'candidate' | 'runtime', cause?: unknown): never {
  throw new Error(
    `check ${kind} tree source differs from manifest`,
    cause === undefined ? undefined : { cause },
  );
}

function validatePath(
  path: string,
  profile: CheckSandboxProfile,
  kind: 'candidate' | 'runtime',
): string[] {
  // Proof: omitting the path-byte limit let the mounted over-budget manifest stage.
  const segments = path.split('/');
  if (
    path.normalize('NFC') !== path ||
    Buffer.from(path, 'utf8').toString('utf8') !== path ||
    path.includes('\\') ||
    path.includes('\0') ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        Buffer.byteLength(segment, 'utf8') > 255,
    ) ||
    segments.length > profile.maxDepth ||
    Buffer.byteLength(path, 'utf8') > Math.min(profile.maxPathBytes, 4096)
  )
    throw new Error(`check ${kind} tree malformed`);
  return segments;
}

function decodeTree(
  bytes: unknown,
  identity: string,
  kind: 'candidate' | 'runtime',
  profile: CheckSandboxProfile,
  request: ActivationRequest,
): Tree {
  // Proof: omitting the manifest-byte bound let an over-budget manifest stage.
  if (typeof bytes !== 'string' || Buffer.byteLength(bytes, 'utf8') > profile.maxManifestBytes)
    throw new Error(`check ${kind} tree malformed`);
  let tree: Tree;
  try {
    const decoded: unknown = JSON.parse(bytes);
    tree =
      kind === 'candidate'
        ? parseOrThrow(CandidateTree, decoded)
        : parseOrThrow(ExecutableTree, decoded);
    if (serializeCanonical(tree) !== bytes) throw new Error('noncanonical tree manifest');
  } catch (cause) {
    throw new Error(`check ${kind} tree malformed`, { cause });
  }
  if (!Sha256.test(identity) || hashBytes(bytes) !== identity)
    throw new Error(`check ${kind} tree differs from frozen identity`);
  if (kind === 'candidate') {
    const candidate = parseOrThrow(CandidateTree, tree);
    if (
      candidate.requestIdentity !== request.requestIdentity ||
      candidate.headSha !== request.headSha
    )
      throw new Error('check candidate tree differs from current request');
  }
  // Proof: omitting maxEntries let a valid two-file inventory exceed its pinned budget.
  if (tree.entries.length > profile.maxEntries) throw new Error(`check ${kind} tree malformed`);
  const directories = new Set<string>(['']);
  let priorPath: string | undefined;
  let totalBytes = 0;
  for (const entry of tree.entries) {
    // Proof: omitting maxDepth let a valid nested inventory exceed its pinned budget.
    const segments = validatePath(entry.path, profile, kind);
    if (
      priorPath !== undefined &&
      Buffer.compare(Buffer.from(priorPath, 'utf8'), Buffer.from(entry.path, 'utf8')) >= 0
    )
      throw new Error(`check ${kind} tree malformed`);
    priorPath = entry.path;
    const parent = segments.slice(0, -1).join('/');
    if (!directories.has(parent)) throw new Error(`check ${kind} tree malformed`);
    if (entry.type === 'directory') {
      directories.add(entry.path);
    } else {
      if (!Number.isSafeInteger(entry.size) || entry.size > profile.maxFileBytes)
        throw new Error(`check ${kind} tree malformed`);
      totalBytes += entry.size;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > profile.maxTotalBytes)
        throw new Error(`check ${kind} tree malformed`);
    }
  }
  return tree;
}

function openChild(parent: number, basename: string, directory: boolean): number {
  // Proof: omitting O_NOFOLLOW let a same-byte symlink satisfy the mounted source manifest.
  const flags =
    constants.O_RDONLY |
    constants.O_NOFOLLOW |
    O_CLOEXEC |
    (directory ? constants.O_DIRECTORY : constants.O_NONBLOCK);
  return openSync(`/proc/self/fd/${String(parent)}/${basename}`, flags);
}

function openRoot(
  root: string,
  descriptors: number[],
  kind: 'candidate' | 'runtime',
  diagnostics: StageDiagnostics | undefined,
): number {
  if (!isAbsolute(root) || resolve(root) !== root) throw new Error('check tree root malformed');
  let parent = openSync('/', constants.O_RDONLY | constants.O_DIRECTORY | O_CLOEXEC);
  descriptors.push(parent);
  let ancestorPath = '';
  for (const basename of root.split('/').filter(Boolean)) {
    if (basename === '.' || basename === '..' || basename.includes('\\') || basename.includes('\0'))
      throw new Error('check tree root malformed');
    // Proof: reopening a renamed ancestor by pathname staged its replacement sentinel.
    parent = openChild(parent, basename, true);
    descriptors.push(parent);
    ancestorPath = `${ancestorPath}/${basename}`;
    diagnostics?.afterDirectoryOpened?.(kind, ancestorPath, parent);
  }
  return parent;
}

function verifyDirectoryEntries(
  descriptor: number,
  expected: ReadonlySet<string>,
  kind: 'candidate' | 'runtime',
): void {
  const observed = readdirSync(`/proc/self/fd/${String(descriptor)}`);
  if (observed.length !== expected.size || observed.some((name) => !expected.has(name)))
    refuseSource(kind);
}

function copyFile(
  source: number,
  destination: string,
  entry: Extract<Entry, { type: 'file' }>,
  profile: CheckSandboxProfile,
  kind: 'candidate' | 'runtime',
  diagnostics: StageDiagnostics | undefined,
): void {
  const before = fstatSync(source);
  if (
    !before.isFile() ||
    // Proof: omitting nlink=1 accepted the mounted hardlinked source file.
    before.nlink !== 1 ||
    (before.mode & 0o777) !== entry.mode ||
    before.size !== entry.size
  )
    refuseSource(kind);
  diagnostics?.afterFileOpened?.(kind, entry.path, source);
  const opened = fstatSync(source);
  if (opened.dev !== before.dev || opened.ino !== before.ino || !opened.isFile())
    refuseSource(kind);
  const output = openSync(
    destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | O_CLOEXEC,
    0o600,
  );
  try {
    const digest = createHash('sha256');
    const chunk = Buffer.allocUnsafe(65_536);
    let copied = 0;
    for (;;) {
      const count = readSync(source, chunk, 0, chunk.length, null);
      if (count === 0) break;
      copied += count;
      // Proof: breaking this bound changed a mounted refusal before copy completed;
      // final staged verification independently prevents publishing wrong bytes.
      if (copied > entry.size || copied > profile.maxFileBytes) refuseSource(kind);
      digest.update(chunk.subarray(0, count));
      let written = 0;
      while (written < count) written += writeSync(output, chunk, written, count - written);
    }
    const after = fstatSync(source);
    if (
      copied !== entry.size ||
      // Proof: omitting the streaming hash passed the early-refusal assertion;
      // the final staged hash still refused authority in the same test.
      digest.digest('hex') !== entry.sha256 ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      (after.mode & 0o777) !== entry.mode
    )
      refuseSource(kind);
    fchmodSync(output, entry.mode);
  } finally {
    closeSync(output);
  }
}

function stageTree(
  tree: Tree,
  sourceRoot: string,
  destinationRoot: string,
  profile: CheckSandboxProfile,
  kind: 'candidate' | 'runtime',
  diagnostics: StageDiagnostics | undefined,
): void {
  const descriptors: number[] = [];
  const opened = new Map<string, number>();
  const expected = new Map<string, Set<string>>([['', new Set()]]);
  for (const entry of tree.entries) {
    const components = entry.path.split('/');
    const parent = components.slice(0, -1).join('/');
    expected.get(parent)?.add(components.at(-1) ?? '');
    if (entry.type === 'directory') expected.set(entry.path, new Set());
  }
  try {
    const root = openRoot(sourceRoot, descriptors, kind, diagnostics);
    opened.set('', root);
    diagnostics?.afterRootOpened?.(kind, root);
    const rootStat = fstatSync(root);
    if (!rootStat.isDirectory()) refuseSource(kind);
    mkdirSync(destinationRoot, { mode: 0o700 });
    for (const entry of tree.entries) {
      const components = entry.path.split('/');
      const parentPath = components.slice(0, -1).join('/');
      const parent = opened.get(parentPath);
      if (parent === undefined) throw new Error('check tree manifest malformed');
      const basename = components.at(-1);
      if (basename === undefined) throw new Error('check tree manifest malformed');
      const destination = join(destinationRoot, entry.path);
      let descriptor: number;
      try {
        descriptor = openChild(parent, basename, entry.type === 'directory');
      } catch (cause) {
        refuseSource(kind, cause);
      }
      descriptors.push(descriptor);
      if (entry.type === 'directory') {
        const stat = fstatSync(descriptor);
        if (!stat.isDirectory() || (stat.mode & 0o777) !== entry.mode) refuseSource(kind);
        opened.set(entry.path, descriptor);
        mkdirSync(destination, { mode: entry.mode });
        chmodSync(destination, entry.mode);
      } else {
        copyFile(descriptor, destination, entry, profile, kind, diagnostics);
      }
    }
    for (const [path, descriptor] of opened) {
      // Proof: omitting exact inventory accepted an unlisted source file.
      verifyDirectoryEntries(descriptor, expected.get(path) ?? new Set(), kind);
    }
    diagnostics?.afterTreeCopied?.(kind, destinationRoot);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('source differs from manifest'))
      throw cause;
    refuseSource(kind, cause);
  } finally {
    for (const descriptor of descriptors.reverse()) closeSync(descriptor);
  }
}

function verifyStagedTree(tree: Tree, root: string): void {
  const expected = new Set<string>(tree.entries.map((entry) => entry.path));
  const observed = new Set<string>();
  const walk = (directory: string, relative: string): void => {
    for (const basename of readdirSync(directory)) {
      const path = relative === '' ? basename : `${relative}/${basename}`;
      observed.add(path);
      const absolute = join(directory, basename);
      if (lstatSync(absolute).isDirectory()) walk(absolute, path);
    }
  };
  walk(root, '');
  if (observed.size !== expected.size || [...observed].some((path) => !expected.has(path)))
    throw new Error('staged check tree differs from manifest');
  for (const entry of tree.entries) {
    const absolute = join(root, entry.path);
    const stat = lstatSync(absolute);
    if ((stat.mode & 0o777) !== entry.mode)
      throw new Error('staged check tree differs from manifest');
    if (entry.type === 'directory') {
      if (!stat.isDirectory()) throw new Error('staged check tree differs from manifest');
    } else if (
      !stat.isFile() ||
      stat.size !== entry.size ||
      // Proof: omitting this final digest exposed a corrupted private staged file.
      hashBytes(readFileSync(absolute)) !== entry.sha256
    ) {
      throw new Error('staged check tree differs from manifest');
    }
  }
}

/** Copies exact trusted candidate and runtime trees into private inert staging. */
export function stageCheckTrees(input: {
  readonly request: ActivationRequest;
  readonly snapshotIdentity: string;
  readonly runtime: CheckRuntimeDescriptor;
  readonly profile: CheckSandboxProfile;
  readonly candidate: TrustedTreeSource;
  readonly executable: TrustedTreeSource;
  readonly stageBase: string;
  readonly diagnostics?: StageDiagnostics;
}): StagedCheckTrees {
  if (process.platform !== 'linux') throw new Error('check tree staging requires Linux');
  const candidate = decodeTree(
    input.candidate.bytes,
    input.snapshotIdentity,
    'candidate',
    input.profile,
    input.request,
  );
  const runtime = decodeTree(
    input.executable.bytes,
    input.runtime.executableTreeIdentity,
    'runtime',
    input.profile,
    input.request,
  );
  for (const executable of input.runtime.executables) {
    const entry = runtime.entries.find((candidate) => candidate.path === executable);
    if (entry?.type !== 'file' || entry.mode !== 493)
      throw new Error('check runtime tree executable absent');
  }
  const base = lstatSync(input.stageBase);
  if (!base.isDirectory() || (base.mode & 0o777) !== 0o700)
    throw new Error('check private stage base unavailable');
  const pending = mkdtempSync(join(input.stageBase, '.pending-'));
  try {
    stageTree(
      candidate,
      input.candidate.root,
      join(pending, 'candidate'),
      input.profile,
      'candidate',
      input.diagnostics,
    );
    stageTree(
      runtime,
      input.executable.root,
      join(pending, 'runtime'),
      input.profile,
      'runtime',
      input.diagnostics,
    );
    verifyStagedTree(candidate, join(pending, 'candidate'));
    verifyStagedTree(runtime, join(pending, 'runtime'));
    const ready = join(
      input.stageBase,
      `ready-${pending.split('/').at(-1)?.slice('.pending-'.length) ?? ''}`,
    );
    // Proof: bypassing pending→ready naming exposed a tree before final verification.
    renameSync(pending, ready);
    return {
      stageRoot: ready,
      candidateIdentity: input.snapshotIdentity,
      runtimeIdentity: input.runtime.executableTreeIdentity,
      dispose: () => {
        rmSync(ready, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    // Proof: omitting cleanup retained a failed private stage in the mounted source fault.
    rmSync(pending, { recursive: true, force: true });
    throw cause;
  }
}
