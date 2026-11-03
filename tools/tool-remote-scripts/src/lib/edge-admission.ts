import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { assertInheritedLock, withLock } from './lock';

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
  if (inherited !== undefined) {
    // Proof: removing token syntax validation failed the bogus inherited-descriptor CLI negative.
    if (!/^[0-9]+$/.test(inherited)) throw new Error('invalid inherited shared edge descriptor');
    // Proof: skipping descriptor identity and flock failed forged numeric FD and independent-open CLI negatives (3 failures).
    assertInheritedLock(lockPath, Number(inherited));
    await assertNoEdgeOwner(stateDirectory);
    return action();
  }
  // Proof: removed this outer lock; the concurrent swap CLI negative reached argument validation.
  return withLock(lockPath, async (descriptor) => {
    await assertNoEdgeOwner(stateDirectory);
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
