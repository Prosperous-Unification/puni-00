import { createHash } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

export type Provenance =
  | {
      readonly kind: 'tracked';
      readonly mode: '100644' | '100755' | '120000' | '160000';
      readonly objectId: string;
    }
  | { readonly kind: 'untracked' };
export type Entry =
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly bytes: Uint8Array;
      readonly sha256: string;
      readonly mode: bigint;
      readonly executable: boolean;
      readonly provenance: Provenance;
    }
  | {
      readonly kind: 'symlink';
      readonly path: string;
      readonly target: string;
      readonly mode: bigint;
      readonly provenance: Provenance;
    }
  | {
      readonly kind: 'gitlink';
      readonly path: string;
      readonly mode: bigint;
      readonly provenance: Provenance;
    };
export interface Workspace {
  readonly root: string;
  readonly entries: readonly Entry[];
}

function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    // Proof: c31c-workspace-filename-utf8; injected { fatal: true, ignoreBOM: true } → { fatal: false, ignoreBOM: true } failed `refuses an invalid UTF8 filename rather than capturing a replacement-character path`; restoration passed. Malformed filename is replaced and later lstat may refuse nonexistent replacement path; exact UTF8 boundary diagnostic, not independent admission.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    throw new Error('script workspace UTF8 is malformed: ' + context, { cause });
  }
}

function decodeRecords(bytes: Uint8Array, context: string): readonly string[] {
  if (bytes.length === 0) return [];
  const text = decodeUtf8(bytes, context);
  // Proof: c31c-workspace-record-framing; injected if (!text.endsWith('\0')) → if (false) failed `refuses controlled Git boundary untracked-framing instead of accepting a partial observation`; restoration passed. Proxy appends removable X to otherwise existing path; guard removal slices X and admits it.
  if (!text.endsWith('\0'))
    throw new Error('script workspace Git records lack NUL framing: ' + context);
  const records = text.slice(0, -1).split('\0');
  // Proof: c31c-workspace-record-empty; injected if (records.some((record) => record === '')) → if (false) failed `refuses controlled Git boundary empty-record instead of accepting a partial observation`; restoration passed. Diagnostic boundary: empty entry later encounters path-component validation. Do not call independent admission proof.
  if (records.some((record) => record === ''))
    throw new Error('script workspace Git records contain an empty entry: ' + context);
  return records;
}

function validatePath(path: string): void {
  // Proof: c31c-workspace-nested-boundary; injected if (path.endsWith('/')) → if (false) failed `refuses an unexpected untracked nested repository instead of treating it as covered`; restoration passed. Early unexpanded-directory diagnostic; later path component or physical-type guards remain.
  if (path.endsWith('/'))
    throw new Error('script workspace contains an unexpanded directory: ' + path);
  if (
    isAbsolute(path) ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
    throw new Error('script workspace Git path is outside the selected root: ' + path);
}

/** Descriptor observations detect changes during capture, without claiming an atomic repository snapshot. */
function isSameObservation(before: BigIntStats, after: BigIntStats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  );
}

function readRegular(path: string, observed: BigIntStats): Uint8Array {
  let descriptor: number;
  try {
    // Proof: c31c-workspace-nonblocking; injected constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK → constants.O_RDONLY | constants.O_NOFOLLOW failed `refuses a readerless FIFO swapped after leaf observation before open can block`; restoration passed. Actual reader-side FIFO opener is killed by bounded parent; ordinary child137 assertion, no Bun test timeout.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    throw new Error('script workspace file is unreadable: ' + path, { cause });
  }
  let capture:
    | { readonly kind: 'read'; readonly bytes: Uint8Array }
    | { readonly kind: 'failed'; readonly cause: unknown };
  try {
    const before = fstatSync(descriptor, { bigint: true });
    // Proof: c31c-workspace-descriptor-regular; injected if (!before.isFile()) → if (false) failed `refuses a readerless FIFO swapped after leaf observation before open can block`; restoration passed. Diagnostic/order only: later lstat-to-fstat comparison refuses the swapped FIFO even without explicit descriptor regularity check; native child reports nonmatching diagnostic.
    if (!before.isFile())
      throw new Error('script workspace entry must remain a regular file: ' + path);
    // Proof: c31c-workspace-capture-before; injected if (!isSameObservation(observed, before)) → if (false) failed `refuses an actual execute-mode change between lstat and descriptor capture`; restoration passed. Grouped pre-open observation guard; actual chmod changes mode and ctime together, not independent per-field proofs.
    if (!isSameObservation(observed, before))
      throw new Error('script workspace file changed before capture: ' + path);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(descriptor);
    } catch (cause) {
      throw new Error('script workspace file is unreadable: ' + path, { cause });
    }
    const after = fstatSync(descriptor, { bigint: true });
    // Proof: c31c-workspace-capture-after; injected !isSameObservation(before, after) || BigInt(bytes.length) !== after.size → false failed `refuses an actual file change during its owned descriptor capture`; restoration passed. One compound post-read guard fault removes both metadata and length checks; actual append changes both, so do not claim either alone independently proved.
    // Proof: c31c-workspace-capture-length; injected || BigInt(bytes.length) !== after.size →  failed `refuses a short descriptor read even when the native file metadata remains stable`; restoration passed. Short-read dependency fault with native metadata stable isolates byte-count guard.
    if (!isSameObservation(before, after) || BigInt(bytes.length) !== after.size)
      throw new Error('script workspace file changed during capture: ' + path);
    capture = { kind: 'read', bytes };
  } catch (cause) {
    capture = { kind: 'failed', cause };
  }
  let release: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause) {
    release = { cause };
  }
  if (capture.kind === 'failed') {
    if (release !== undefined)
      throw new AggregateError(
        // Proof: c31c-workspace-paired-causes; injected [capture.cause, release.cause] → [capture.cause] failed `preserves capture and real-close-then-throw failures without returning a partial workspace`; restoration passed. Real descriptor close then throw; preserve both causes and original nested read cause.
        [capture.cause, release.cause],
        'script workspace capture and close failed',
      );
    // Proof: c31c-workspace-original-read-failure; injected throw capture.cause; → throw new Error("discarded original read cause"); failed `preserves an actual descriptor read failure after closing instead of replacing its cause`; restoration passed. Actual read fault after descriptor acquisition retains nested original cause after normal close.
    throw capture.cause;
  }
  // Proof: c31c-workspace-close-only; injected if (release !== undefined) throw release.cause; → if (false) throw release?.cause; failed `propagates a capture close-only failure after closing the real descriptor`; restoration passed. Real close occurs before injected failure; proves exact failure identity, not release after a genuinely failed close.
  if (release !== undefined) throw release.cause;
  // Proof: c31c-workspace-current-bytes; injected return capture.bytes; → return capture.bytes.subarray(0, 0); failed `captures tracked current bytes and nested new unknown extensions without consulting declarations`; restoration passed. Actual current captured text changes; does not independently prove SHA256 binding.
  return capture.bytes;
}

function readObservedEntry(root: string, path: string, provenance: Provenance): Entry {
  const absolute = join(root, path);
  let observed: BigIntStats;
  try {
    observed = lstatSync(absolute, { bigint: true });
  } catch (cause) {
    throw new Error('script workspace trusted entry is missing or unreadable: ' + path, { cause });
  }
  // Proof: c31c-workspace-gitlink-directory; injected if (provenance.kind === 'tracked' && provenance.mode === '160000') { if (!observed.isDirectory()) th → if (provenance.kind === 'tracked' && provenance.mode === '160000') { if (false) throw new Error( failed `refuses a gitlink whose physical directory was replaced by a symlink`; restoration passed. Actual indexed gitlink replaced by physical symlink cannot be admitted as an unexpanded directory.
  if (provenance.kind === 'tracked' && provenance.mode === '160000') {
    if (!observed.isDirectory())
      throw new Error(
        'script workspace gitlink must remain an unexpanded physical directory: ' + path,
      );
    return { kind: 'gitlink', path, provenance, mode: observed.mode };
  }
  if (observed.isSymbolicLink()) {
    const bytes = readlinkSync(absolute, { encoding: 'buffer' }),
      target = decodeUtf8(bytes, path);
    if (
      // Proof: c31c-workspace-symlink-observation; injected !isSameObservation(observed, lstatSync(absolute, { bigint: true })) || BigInt(bytes.length) !== obse → false failed `refuses observed symlink text replacement before returning a mixed link observation`; restoration passed. Exact symlink observation diagnostic/order only; ancestor postcheck still refuses the namespace change.
      !isSameObservation(observed, lstatSync(absolute, { bigint: true })) ||
      BigInt(bytes.length) !== observed.size
    )
      throw new Error('script workspace symlink changed during capture: ' + path);
    return { kind: 'symlink', path, target, provenance, mode: observed.mode };
  }
  // Proof: c31c-workspace-observed-regular; injected !observed.isFile() → false failed `refuses observed nonregular leaves before opening a descriptor`; restoration passed. Early acquisition ordering only: descriptor regularity still refuses the directory, but it must never have been opened.
  if (!observed.isFile())
    throw new Error(
      'script workspace entry must be a regular file or explicit link boundary: ' + path,
    );
  const bytes = readRegular(absolute, observed);
  return {
    kind: 'file',
    path,
    bytes,
    // Proof: c31c-workspace-content-digest; injected createHash('sha256').update(bytes).digest('hex') → '0'.repeat(64) failed `refuses changed captured program bytes even when the invoking command body is unchanged`; restoration passed. Existing real-Git inventory integration binds changed current program bytes to discovery identity. Constant valid SHA256 must cause expected changed-source refusal to disappear; a separate known digest assertion would additionally pin the algorithm, not merely content sensitivity.
    // Proof: c31c-workspace-known-sha256; injected createHash('sha256').update(bytes).digest('hex') → createHash('sha512').update(bytes).digest('hex') failed `captures tracked current bytes and nested new unknown extensions without consulting declarations`; restoration passed. Known current-byte SHA256 vector pins algorithm identity, supplementing changed-program sensitivity.
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mode: observed.mode,
    // Proof: c31c-workspace-current-executable; injected executable: (observed.mode & 0o111n) !== 0n, → executable: false, failed `captures current executable mode independently of the older tracked index mode`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
    executable: (observed.mode & 0o111n) !== 0n,
    provenance,
  };
}

/** Refuse observed ancestor links; parent namespaces must stay trusted during capture. */
function readEntry(root: string, path: string, provenance: Provenance): Entry {
  const parts = path.split('/'),
    ancestors: { readonly path: string; readonly observed: BigIntStats }[] = [];
  for (let depth = 0; depth < parts.length; depth++) {
    const ancestor = join(root, ...parts.slice(0, depth));
    let observed: BigIntStats;
    try {
      observed = lstatSync(ancestor, { bigint: true });
    } catch (cause) {
      throw new Error('script workspace ancestor is unreadable: ' + ancestor, { cause });
    }
    // Proof: c31c-workspace-ancestor-physical; injected if (!observed.isDirectory()) throw new Error('script workspace ancestor → if (false) throw new Error('script workspace ancestor failed `refuses a tracked descendant whose parent was replaced by an external symlink`; restoration passed. Actual static tracked-directory symlink substitution; mutant can read external bytes. Stable trusted ancestor namespace still required.
    if (!observed.isDirectory())
      throw new Error('script workspace ancestor must remain a physical directory: ' + ancestor);
    ancestors.push({ path: ancestor, observed });
  }
  const entry = readObservedEntry(root, path, provenance);
  for (const ancestor of ancestors) {
    // Proof: c31c-workspace-ancestor-rebind; injected if (!isSameObservation(ancestor.observed, lstatSync(ancestor.path, { bigint: true }))) → if (false) failed `refuses an observed ancestor rebind after reading instead of returning a stale path association`; restoration passed. Actual ancestor rename/rebind after descriptor read; no atomic whole-tree claim.
    if (!isSameObservation(ancestor.observed, lstatSync(ancestor.path, { bigint: true })))
      throw new Error('script workspace ancestor changed during capture: ' + ancestor.path);
  }
  return entry;
}

/**
 * Capture the selected Git worktree independently of inventory declarations. Tracked index modes
 * and current filesystem observations stay distinct. Only repository .gitignore files exclude
 * new paths; ambient global/info excludes cannot hide first-party programs. Explicit consumer
 * references into omitted paths must remain unresolved boundaries in the later collector.
 * Symlinks expose link text and gitlinks expose pinned index identity; neither is traversed.
 * This captures per-file observations, not an atomic revision. Final acceptance must recheck the
 * discovered universe and captured identities; collectors resolve only against these entries.
 * @throws for required Git failures/warnings, redirected roots, unmerged/unknown index records,
 * missing/unreadable/malformed trusted state, unexpanded directories or an observed changing read.
 */
export function readWorkspace(requestedRoot: string): Workspace {
  // Proof: c31c-workspace-native-root; injected realpathSync.native(requestedRoot) → realpathSync(requestedRoot) failed `selects the native alias-parent repository when both native and lexical roots are valid`; restoration passed. Dual valid native/lexical repository selection; no generic hostile-filesystem claim.
  const root = realpathSync.native(requestedRoot),
    executable = Bun.which('git');
  // Proof: c31c-workspace-required-git; injected if (executable === null) throw new Error('script workspace requires Git'); → if (false) throw new Error("disabled Git diagnostic"); failed `requires the Git executable before attempting to observe a repository`; restoration passed. Explicit missing-tool diagnostic: downstream argv/spawn validation may also refuse null.
  if (executable === null) throw new Error('script workspace requires Git');
  const gitExecutable: string = executable;
  const environment: Record<string, string | undefined> = Object.fromEntries(
    // Proof: c31c-workspace-git-environment; injected .filter(([key]) => !key.startsWith('GIT_')) → .filter(() => true) failed `ignores inherited Git redirection and reads the explicitly selected worktree`; restoration passed. Required selected-repository behavior. Later root validation may still reject redirected Git rather than admit the wrong repository.
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  // Proof: c31c-workspace-git-system; injected environment['GIT_CONFIG_NOSYSTEM'] = '1'; → // controlled missing NOSYSTEM fence failed `suppresses a controlled native system configuration pathname at the Git tool boundary`; restoration passed. Real Git proxy overrides SYSTEM pathname only; proves NOSYSTEM suppresses that selected native configuration, not actual /etc/gitconfig or independent SYSTEM=/dev/null necessity.
  environment['GIT_CONFIG_NOSYSTEM'] = '1';
  environment['GIT_CONFIG_SYSTEM'] = '/dev/null';
  // Proof: c31c-workspace-git-global; injected environment['GIT_CONFIG_GLOBAL'] = '/dev/null'; → // controlled missing global configuration fence failed `isolates an actual malformed XDG global Git configuration from the selected worktree`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
  environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
  environment['GIT_OPTIONAL_LOCKS'] = '0';
  function runGit(arguments_: readonly [string, ...string[]]): Uint8Array {
    const child = Bun.spawnSync(
      [
        gitExecutable,
        '--no-optional-locks',
        // Proof: c31c-workspace-git-fsmonitor; injected '-c', 'core.fsmonitor=false', →  failed `suppresses an actual repository-configured Git fsmonitor program during census`; restoration passed. Actual repository hook marker must be reached by the mutant; inspect first failure for any earlier Git warning/status refusal.
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.untrackedCache=false',
        // Proof: c31c-workspace-git-case; injected '-c', 'core.ignoreCase=false', →  failed `captures distinct case-sensitive paths despite repository core.ignoreCase`; restoration passed. Actual case-distinct Linux filesystem fixture; not case-insensitive filesystem qualification.
        '-c',
        'core.ignoreCase=false',
        '-C',
        root,
        ...arguments_,
      ],
      {
        cwd: root,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        // Proof: c31c-workspace-git-deadline; injected timeout: 10000, → timeout: 0, failed `bounds an actual stalled Git worker before it can return a valid delayed root observation`; restoration passed. Controlled child returns a valid observation after 12 seconds; disabled 10-second native deadline must fail expected refusal, not outer test timeout. Selector has 25-second test budget.
        timeout: 10000,
      },
    );
    // Proof: c31c-workspace-git-status; injected child.exitCode !== 0 || child.stderr.length !== 0 → child.stderr.length !== 0 failed `refuses controlled Git boundary status instead of accepting a partial observation`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
    // Proof: c31c-workspace-git-warning; injected child.exitCode !== 0 || child.stderr.length !== 0 → child.exitCode !== 0 failed `refuses controlled Git boundary warning instead of accepting a partial observation`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
    // Proof: V112's exact copied status/warning omissions each fail their owning required-rejection case outside the restricted sandbox. The same mutants falsely pass inside on earlier rev-parse EPERM; observed diagnostics and both environments are retained in verification-native-output-environment-20261121.json.
    if (child.exitCode !== 0 || child.stderr.length !== 0)
      throw new Error(
        'script workspace Git observation failed: ' +
          arguments_[0] +
          ': ' +
          decodeUtf8(child.stderr, 'Git diagnostics'),
      );
    return child.stdout;
  }
  const topLevel = decodeUtf8(runGit(['rev-parse', '--show-toplevel']), 'Git root');
  // Proof: c31c-workspace-root-framing; injected !topLevel.endsWith('\n') || →  failed `refuses controlled Git boundary root-framing instead of accepting a partial observation`; restoration passed. Proxy supplies actual CR in place of LF, with otherwise valid root; isolates framing admission.
  // Proof: c31c-workspace-root-exact; injected realpathSync.native(topLevel.slice(0, -1)) !== root → false failed `refuses a requested child directory instead of silently widening the selected root`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
  if (!topLevel.endsWith('\n') || realpathSync.native(topLevel.slice(0, -1)) !== root)
    throw new Error('script workspace requested root must be the selected Git worktree root');
  const paths = new Map<string, Provenance>();
  for (const record of decodeRecords(
    // Proof: c31c-workspace-discover-tracked; injected runGit(['ls-files', '--stage', '--cached', '-z']) → new Uint8Array() failed `captures tracked current bytes and nested new unknown extensions without consulting declarations`; restoration passed. Omission fault removes tracked census contribution; untracked Git query does not rediscover indexed files.
    runGit(['ls-files', '--stage', '--cached', '-z']),
    'Git index',
  )) {
    const match = /^([0-9]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/u.exec(record);
    // Proof: c31c-workspace-index-syntax; injected if (match === null) throw new Error('script workspace Git index record is malformed'); → if (false) throw new Error("disabled index syntax diagnostic"); failed `refuses controlled Git boundary index-syntax instead of accepting a partial observation`; restoration passed. Explicit parser diagnostic; unguarded match.at on null still fails.
    if (match === null) throw new Error('script workspace Git index record is malformed');
    const mode = match.at(1),
      objectId = match.at(2),
      stage = match.at(3),
      path = match.at(4);
    if (
      // Proof: c31c-workspace-index-mode; injected (mode !== '100644' && mode !== '100755' && mode !== '120000' && mode !== '160000') || →  failed `refuses controlled Git boundary index-mode instead of accepting a partial observation`; restoration passed. Native proxy supplies otherwise valid record with mode100600; removes roster check only.
      (mode !== '100644' && mode !== '100755' && mode !== '120000' && mode !== '160000') ||
      objectId === undefined ||
      path === undefined
    )
      throw new Error('script workspace Git index fields are absent or unsupported');
    // Proof: c31c-workspace-index-stage; injected if (stage !== '0') throw new Error('script workspace Git index is unmerged: ' + path); → void stage; failed `refuses unmerged index stages before returning a partial workspace`; restoration passed. Early classification: later duplicate-path guard also refuses the multi-stage fixture; require named unmerged diagnostic.
    if (stage !== '0') throw new Error('script workspace Git index is unmerged: ' + path);
    validatePath(path);
    // Proof: c31c-workspace-index-duplicate; injected if (paths.has(path)) throw new Error('script workspace Git path is duplicated: ' + path); paths.set( → paths.set(path, { kind: 'tracked', mode, objectId }); failed `refuses controlled Git boundary duplicate-index instead of accepting a partial observation`; restoration passed. Draft only: require a reached named assertion failure and restored pass; qualify the actual first assertion before credit.
    if (paths.has(path)) throw new Error('script workspace Git path is duplicated: ' + path);
    paths.set(path, { kind: 'tracked', mode, objectId });
  }
  for (const path of decodeRecords(
    // Proof: c31c-workspace-repository-ignore-only; injected '--exclude-per-directory=.gitignore' → '--exclude-standard' failed `does not trust global excludes or git info excludes to hide new programs`; restoration passed. Actual info/local-config excludes hide new programs under mutant; no claim every separate environment exclusion guard is independently necessary.
    // Proof: c31c-workspace-discover-untracked; injected runGit(['ls-files', '--others', '--exclude-per-directory=.gitignore', '-z']) → new Uint8Array() failed `captures tracked current bytes and nested new unknown extensions without consulting declarations`; restoration passed. Omission fault removes independently discovered new unknown-extension program.
    runGit(['ls-files', '--others', '--exclude-per-directory=.gitignore', '-z']),
    'Git untracked paths',
  )) {
    validatePath(path);
    if (paths.has(path)) throw new Error('script workspace Git path is duplicated: ' + path);
    paths.set(path, { kind: 'untracked' });
  }
  return {
    root,
    entries: [...paths]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, provenance]) => readEntry(root, path, provenance)),
  };
}
