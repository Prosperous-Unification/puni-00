import { lstat, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { assertInheritedLock, withExistingCanonicalLock } from './lock';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
} from './solver-supervisor-install-contract';

/** Canonical host-wide state; dev and prod share the same Caddy process. */
export function edgeStateDirectory(): string {
  return process.env['WBS_EDGE_STATE'] ?? '/home/puni1/wbs/state';
}

class RetainedEdgeOwnerRefusal extends Error {
  readonly reason = 'retained-edge-owner';
}

/** Recognizes only the refusal produced after a successful retained-marker observation. */
export function isRetainedEdgeOwnerRefusal(cause: unknown): cause is RetainedEdgeOwnerRefusal {
  // Proof: widening to generic Error made the real CLI callback fault exit 78 in solver-runtime-admission.proc.test.ts (1 failure).
  return cause instanceof RetainedEdgeOwnerRefusal;
}

/**
 * Refuses every retained owner publication, including incomplete or unreadable
 * publications. Absence means legacy deployment, never activation permission.
 * Marker contents cannot reopen admission. Only ENOENT is ordinary absence;
 * dangling links and directories close admission as well.
 */
export async function assertNoEdgeOwner(stateDirectory = edgeStateDirectory()): Promise<void> {
  for (const name of ['edge-owner.json', 'edge-owner.pending']) {
    const path = join(stateDirectory, name);
    try {
      // Proof: omitted lstat classified absent markers as controlled refusal; real CLI tests failed 19 cases.
      await lstat(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    // Proof: omitted this refusal; both retained-marker swap and devsync CLI negatives reached later preflight.
    // Proof: replacing this typed refusal with Error broke 12 real CLI marker cases in solver-runtime-admission.proc.test.ts.
    throw new RetainedEdgeOwnerRefusal(
      `shared edge owner admission closed: ${path}; retained marker; no activation`,
    );
  }
}

/**
 * Lock order is edge.lock, optional poll.lock, optional devsync.lock, then the
 * selected deploy.lock. The publisher must use the
 * same lock and retain its marker before releasing it; this is admission only.
 */
export async function withEdgeAdmission<T>(action: () => Promise<T>): Promise<T> {
  const stateDirectory = edgeStateDirectory();
  const lockPath = join(stateDirectory, 'edge.lock');
  const inherited = process.env['WBS_EDGE_LOCK_FD'];
  const { assertOrdinaryControllerAdmission } = await import('./edge-policy');
  if (inherited !== undefined) {
    if (!/^[0-9]+$/.test(inherited)) throw new Error('invalid inherited shared edge descriptor');
    await requireInheritedEdgeLock();
    await assertOrdinaryControllerAdmission(stateDirectory, 'legacy');
    return action();
  }
  return withExistingCanonicalLock(lockPath, async (descriptor) => {
    await assertOrdinaryControllerAdmission(stateDirectory, 'legacy');
    process.env['WBS_EDGE_LOCK_FD'] = String(descriptor);
    try {
      return await action();
    } finally {
      delete process.env['WBS_EDGE_LOCK_FD'];
    }
  });
}

/**
 * Requires a local inherited open description before launching a solver child.
 * State must use an absolute normalized spelling before filesystem inspection.
 * The caller owns its lifetime; the child receives the same description, never
 * a reopened lock file. This grants no installation or activation authority.
 */
export async function requireInheritedEdgeLock(): Promise<{
  descriptor: number;
  stateDirectory: string;
}> {
  const stateDirectory = edgeStateDirectory();
  // Proof: omitting this guard let / and /. symlink-state spellings return success in separate real-runner negatives.
  if (!isAbsolute(stateDirectory) || resolve(stateDirectory) !== stateDirectory) {
    throw new Error('canonical edge state must be an absolute normalized path');
  }
  const lockPath = join(stateDirectory, 'edge.lock');
  const inherited = process.env['WBS_EDGE_LOCK_FD'];
  // Proof: omitting token validation changed the required-descriptor refusal for missing and malformed tokens.
  if (inherited === undefined || !/^[0-9]+$/.test(inherited)) {
    throw new Error('solver child requires an inherited shared edge descriptor');
  }
  const descriptor = Number(inherited);
  // Proof: omitting this range guard changed the unsafe-integer refusal to EBADF in the real launcher.
  if (!Number.isSafeInteger(descriptor) || descriptor < 3) {
    throw new Error('invalid inherited shared edge descriptor');
  }
  const state = await lstat(stateDirectory);
  // Proof: omitting this guard admitted a symlink canonical state in solver-binding-command.test.ts.
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new Error('invalid canonical edge state: expected a real directory');
  }
  // Proof: omitting readdir launched a child through execute-only (0111) trusted state.
  await readdir(stateDirectory);
  const lock = await lstat(lockPath);
  // Proof: omitting this guard admitted a symlink canonical lock in the real solver child path.
  if (!lock.isFile() || lock.isSymbolicLink()) {
    throw new Error('invalid canonical edge lock: expected a regular nonsymlink file');
  }
  // Proof: omitting verification launched a child for a foreign or independently opened FD.
  assertInheritedLock(lockPath, descriptor);
  // Proof: omitting this admission launched the child for retained JSON/pending markers.
  await assertNoEdgeOwner(stateDirectory);
  return { descriptor, stateDirectory };
}

/** Converts only an observed retained-owner restoration admission failure; raw trusted-file diagnostics stay private. */
export function throwRetainedSolverRefusal(retained: unknown, cause: unknown): never {
  // Proof: terminal-observed-owner omission changed missing-policy startup from exit 1 to 78; actual CLI test failed (exit 1).
  if (!isRetainedEdgeOwnerRefusal(retained)) throw cause;
  const fixed = new Set([
    'solver restoration requires private restoring policy',
    'solver restoration policy phase changed',
    'solver restoration policy hash binding differs',
    'solver restoration pending owner bytes differ',
    'solver restoration executing identity differs from fixed installed entrypoint',
    'solver-only restoration refuses a committed dependency owner',
    'solver restoration record JSON is malformed',
    'solver installed tuple differs from independent pins',
    'solver restoration configured image coverage is absent',
    'solver restoration immutable image identity is malformed',
    'invalid edge policy JSON or UTF-8',
    'invalid restoring edge policy',
    ...[
      'exact owner layout',
      'configured image coverage',
      'executing tuple readback',
      'policy readback',
      'intent readback',
      'pending readback',
    ].map((binding) => `managed cohort solver restoration ${binding} changed or was not excluded`),
  ]);
  const message = cause instanceof Error ? cause.message : undefined;
  // Proof: terminal-private-cause omission exposed PRIVATE_CONFIG_SENTINEL; actual built restoring CLI test failed (exit 1).
  const reason =
    message !== undefined && fixed.has(message)
      ? message
      : 'solver restoration admission verifier refused';
  throw new RetainedEdgeOwnerRefusal(
    `shared edge owner admission closed: ${reason}; retained marker; no activation`,
    { cause: new Error(reason) },
  );
}

/** Retains fixed artifact/parent observations and makes required captures fatal even in conditional shell contexts. */
export function buildInstalledControllerAdmission(
  mode: 'legacy' | 'required',
  descriptor: 3 | 8 | 9,
): string {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return `set -eu
controller_bun=${quote(SOLVER_SUPERVISOR_BUN)}
controller_program=${quote(SOLVER_SUPERVISOR_BUNDLE.remote)}
for controller_reader in "$controller_bun" "$controller_program"; do
  if [ ! -f "$controller_reader" ] || [ -L "$controller_reader" ] || [ ! -r "$controller_reader" ] || [ ! -x "$controller_reader" ]; then
    echo 'fixed installed controller reader unavailable; reader preparation or explicit old-reader transition required' >&2
    exit 1
  fi
  controller_file_mode=$(stat -Lc %a -- "$controller_reader") || exit 1
  controller_file_uid=$(stat -Lc %u -- "$controller_reader") || exit 1
  controller_file_gid=$(stat -Lc %g -- "$controller_reader") || exit 1
  controller_file_path=$(realpath -- "$controller_reader") || exit 1
  if [ "$controller_file_mode" != 755 ] || [ "$controller_file_uid" != 1000 ] || [ "$controller_file_gid" != 1000 ] || [ "$controller_file_path" != "$controller_reader" ]; then
    echo 'fixed installed controller reader unavailable; reader preparation required' >&2
    exit 1
  fi
done
controller_bun_parent=$(dirname -- "$controller_bun") || exit 1
controller_program_parent=$(dirname -- "$controller_program") || exit 1
for controller_directory in "$controller_bun_parent" "$controller_program_parent"; do
  test -d "$controller_directory" || exit 1
  test ! -L "$controller_directory" || exit 1
  controller_directory_path=$(realpath -- "$controller_directory") || exit 1
  test "$controller_directory_path" = "$controller_directory" || exit 1
  ls -A -- "$controller_directory" >/dev/null || exit 1
done
controller_bun_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_bun_parent") || exit 1
controller_program_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_program_parent") || exit 1
controller_bun_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_bun") || exit 1
controller_program_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_program") || exit 1
controller_bun_hash=$(sha256sum -- "$controller_bun") || exit 1
controller_program_hash=$(sha256sum -- "$controller_program") || exit 1
for controller_observation in "$controller_bun_parent_identity" "$controller_program_parent_identity" "$controller_bun_identity" "$controller_program_identity" "$controller_bun_hash" "$controller_program_hash"; do
  if [ -z "$controller_observation" ]; then echo 'required installed controller observation was empty' >&2; exit 1; fi
done
WBS_EDGE_LOCK_FD=${String(descriptor)}; export WBS_EDGE_LOCK_FD
"$controller_bun" "$controller_program" --check-controller-admission-inherited=${mode} || exit 1
for controller_reader in "$controller_bun" "$controller_program"; do
  if [ ! -f "$controller_reader" ] || [ -L "$controller_reader" ] || [ ! -r "$controller_reader" ] || [ ! -x "$controller_reader" ]; then
    echo 'fixed installed controller reader changed during admission' >&2
    exit 1
  fi
  controller_file_path=$(realpath -- "$controller_reader") || exit 1
  test "$controller_file_path" = "$controller_reader" || exit 1
done
for controller_directory in "$controller_bun_parent" "$controller_program_parent"; do
  test -d "$controller_directory" || exit 1
  test ! -L "$controller_directory" || exit 1
  controller_directory_path=$(realpath -- "$controller_directory") || exit 1
  test "$controller_directory_path" = "$controller_directory" || exit 1
  ls -A -- "$controller_directory" >/dev/null || exit 1
done
controller_current_bun_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_bun_parent") || exit 1
controller_current_program_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_program_parent") || exit 1
controller_current_bun_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_bun") || exit 1
controller_current_program_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_program") || exit 1
controller_current_bun_hash=$(sha256sum -- "$controller_bun") || exit 1
controller_current_program_hash=$(sha256sum -- "$controller_program") || exit 1
if [ "$controller_current_bun_parent_identity" != "$controller_bun_parent_identity" ] || [ "$controller_current_program_parent_identity" != "$controller_program_parent_identity" ] || [ "$controller_current_bun_identity" != "$controller_bun_identity" ] || [ "$controller_current_program_identity" != "$controller_program_identity" ] || [ "$controller_current_bun_hash" != "$controller_bun_hash" ] || [ "$controller_current_program_hash" != "$controller_program_hash" ]; then
  echo 'fixed installed controller reader changed during admission' >&2
  exit 1
fi`;
}

/** Unknown original wait/read never unwinds the surrounding admission interval. */
export async function retainUnknownControllerObservation(): Promise<never> {
  console.error(
    'controller HOLD: original child/read/EOF remains unknown; retain original edge interval; no retry or cleanup',
  );
  for (;;) await Bun.sleep(1000);
}

/** Checks actual fixed installed files on the caller's original inherited description before candidate execution. */
export async function assertInstalledControllerAdmission(
  mode: 'legacy' | 'required',
): Promise<void> {
  const admission = await requireInheritedEdgeLock();
  const { captureSolverReaderArtifact } = await import('./solver-reader-preparation');
  const parents = [];
  for (const path of new Set([
    dirname(SOLVER_SUPERVISOR_BUN),
    dirname(SOLVER_SUPERVISOR_BUNDLE.remote),
  ])) {
    try {
      const opened = await lstat(path, { bigint: true });
      if (!opened.isDirectory() || (await realpath(path)) !== path)
        throw new Error('invalid fixed installed controller reader parent');
      await readdir(path);
      parents.push({ path, opened });
    } catch (cause) {
      throw new Error(
        'fixed installed controller reader parent unavailable; reader preparation required',
        { cause },
      );
    }
  }
  const openings = [];
  for (const path of [SOLVER_SUPERVISOR_BUN, SOLVER_SUPERVISOR_BUNDLE.remote]) {
    let opening;
    try {
      opening = await captureSolverReaderArtifact(path);
    } catch (cause) {
      throw new Error(
        'fixed installed controller reader unavailable; reader preparation required',
        { cause },
      );
    }
    if (
      opening.uid !== '1000' ||
      opening.gid !== '1000' ||
      opening.mode !== 0o755 ||
      (await realpath(path)) !== path
    )
      throw new Error('invalid fixed installed controller reader; reader preparation required');
    openings.push(opening);
  }
  const child = Bun.spawn(
    [
      SOLVER_SUPERVISOR_BUN,
      SOLVER_SUPERVISOR_BUNDLE.remote,
      `--check-controller-admission-inherited=${mode}`,
    ],
    {
      env: { ...process.env, WBS_EDGE_STATE: admission.stateDirectory, WBS_EDGE_LOCK_FD: '3' },
      stdio: ['ignore', 'pipe', 'pipe', admission.descriptor],
    },
  );
  const [stdout, stderr, wait] = await Promise.allSettled([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled' || wait.status !== 'fulfilled')
    return retainUnknownControllerObservation();
  if (wait.value !== 0 || child.signalCode !== null)
    throw new Error(`fixed installed controller reader refused: ${stderr.value}`);
  for (const { path, opened } of parents) {
    const closing = await lstat(path, { bigint: true });
    if (
      (await realpath(path)) !== path ||
      opened.dev !== closing.dev ||
      opened.ino !== closing.ino ||
      opened.mode !== closing.mode ||
      opened.uid !== closing.uid ||
      opened.gid !== closing.gid
    )
      throw new Error(
        'fixed installed controller reader changed parent before candidate execution',
      );
    await readdir(path);
  }
  for (const opening of openings) {
    if (
      (await realpath(opening.artifact.path)) !== opening.artifact.path ||
      JSON.stringify(await captureSolverReaderArtifact(opening.artifact.path)) !==
        JSON.stringify(opening)
    )
      throw new Error('fixed installed controller reader changed before candidate execution');
  }
}
