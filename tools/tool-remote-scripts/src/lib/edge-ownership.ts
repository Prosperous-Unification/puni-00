import { randomUUID } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import type { RunDocker } from './docker-deadline';
import type { DockerExec } from './docker-exec';
import { assertNoEdgeOwner, edgeStateDirectory } from './edge-admission';
import type { EnvLayout } from './env';
import { assertInheritedLock, withCanonicalLock } from './lock';
import { publishRecord, readRecord } from './managed-cohort';

/** Reviewed managed-fence scope only; never a complete participant or activation proof. */
export interface DependencyOwnerPlan {
  readonly sha: string;
  readonly layouts: readonly EnvLayout[];
}
const identity: unique symbol = Symbol('dependency-owner');
/** Live callback-scoped authority; retained records cannot recreate it. */
export interface DependencyOwner {
  readonly [identity]: true;
}
interface Ownership {
  directory: string;
  publication: string;
  locks: { path: string; descriptor: number }[];
  layouts: readonly EnvLayout[];
  sequence: number;
  sha: string;
}
const owners = new WeakMap<DependencyOwner, Ownership>();

async function requireDirectory(path: string): Promise<void> {
  // Proof: omitted canonical directory guard; noncanonical-layout-root publisher reached callback (exit 1).
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (await realpath(path)) !== path ||
    !(await lstat(path)).isDirectory()
  )
    throw new Error('dependency owner requires canonical existing directory');
  // Proof: without enumeration, execute/write-only state published pending before failing directory sync.
  await readdir(path);
}

/**
 * Acquires edge, optional dev poll/devsync, then prod/dev deploy locks once.
 * Publishes exclusive synced exact plan before invoking the live owner. Every exit
 * expires authority and retains all records; neither success nor failure reopens admission.
 */
export async function withDependencyOwner<T>(
  plan: DependencyOwnerPlan,
  action: (owner: DependencyOwner) => Promise<T>,
  directory = edgeStateDirectory(),
): Promise<T> {
  // Proof: omitted plan guard; invalid-SHA and empty-plan publisher negatives reached callback (exit 1).
  if (!/^[a-f0-9]{40}$/.test(plan.sha) || plan.layouts.length === 0)
    throw new Error('dependency owner requires full SHA and nonempty unique environments');
  const sha = plan.sha;
  const layouts = structuredClone([...plan.layouts]).sort((left, right) =>
    left.env === right.env ? 0 : left.env === 'prod' ? -1 : 1,
  );
  const environments = new Set<string>();
  await requireDirectory(directory);
  for (const layout of layouts) {
    // Proof: omitted uniqueness; distinct-state duplicate-environment publication negative reached callback (exit 1).
    if (environments.has(layout.env))
      throw new Error('dependency owner requires unique environments');
    environments.add(layout.env);
    await requireDirectory(layout.root);
    await requireDirectory(layout.stateDir);
  }
  // Proof: independently omitted edge, dev and deploy paths; real competitor flock assertions failed (exit 1 each).
  const paths = [join(directory, 'edge.lock')];
  const dev = layouts.find((layout) => layout.env === 'dev');
  if (dev !== undefined)
    paths.push(join(dev.stateDir, 'poll.lock'), join(dev.stateDir, 'devsync.lock'));
  paths.push(...layouts.map((layout) => join(layout.stateDir, 'deploy.lock')));
  // Proof: omitted overlap guard; overlapping-environment negative lost its refusal before nested flock (exit 1).
  if (new Set(paths).size !== paths.length) throw new Error('dependency owner lock paths overlap');
  const locks: Ownership['locks'] = [];
  async function acquire(index: number): Promise<T> {
    const path = paths.at(index);
    if (path !== undefined)
      // Proof: substituting legacy withLock truncates retained foreign symlink evidence before refusal (exit 1).
      return withCanonicalLock(path, async (descriptor) => {
        locks.push({ path, descriptor });
        try {
          return await acquire(index + 1);
        } finally {
          locks.pop();
        }
      });
    for (const lock of locks) assertInheritedLock(lock.path, lock.descriptor);
    // Proof: omitted admission; retained committed-owner negative reached callback (exit 1).
    await assertNoEdgeOwner(directory);
    const publication = `${JSON.stringify({ format: 'dependency-edge-owner', version: 1, attempt: randomUUID(), plan: { sha, layouts } })}\n`;
    // Proof: omitted publication; real callback could not read required pending marker (exit 1).
    await publishRecord(join(directory, 'edge-owner.pending'), publication);
    const owner: DependencyOwner = Object.freeze({ [identity]: true as const });
    owners.set(owner, { directory, publication, locks, layouts, sequence: 0, sha });
    try {
      return await action(owner);
    } finally {
      // Proof: omitted expiry; expired-owner negative lost its live-authority refusal (exit 1).
      owners.delete(owner);
    }
  }
  return acquire(0);
}

/** Checks live identity, exact selected layout, all kernel descriptions and retained bytes. */
export async function assertDependencyOwner(
  owner: DependencyOwner,
  layout: EnvLayout,
  sha?: string,
): Promise<void> {
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  // Proof: omitted SHA binding; wrong-SHA owner fence reached real fake-Docker cohort work (exit 1).
  if (sha !== undefined && sha !== ownership.sha) throw new Error('dependency owner SHA differs');
  // Proof: omitted layout binding; foreign-layout production Docker negative executed its effect (exit 1).
  if (!ownership.layouts.some((selected) => JSON.stringify(selected) === JSON.stringify(layout)))
    throw new Error('dependency owner does not own layout');
  // Proof: removed FD identity verification; replaced-lock-inode production Docker negative executed its effect (exit 1).
  for (const lock of ownership.locks) assertInheritedLock(lock.path, lock.descriptor);
  // Proof: removed byte equality; changed-pending production Docker negative executed its effect (exit 1).
  if ((await readRecord(join(ownership.directory, 'edge-owner.pending'))) !== ownership.publication)
    throw new Error('dependency owner publication changed');
}

/** Durable per-boundary intent and observed response; uncertain calls retain intent without readback. */
export function ownerDocker(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
): RunDocker {
  return async (args, signal) => {
    await assertDependencyOwner(owner, layout);
    const ownership = owners.get(owner);
    if (ownership === undefined) throw new Error('dependency owner is not live');
    const prefix = join(
      ownership.directory,
      `edge-owner-${String(++ownership.sequence).padStart(6, '0')}`,
    );
    // Proof: omitted durable intent publication; real boundary test failed ENOENT before the Docker effect (exit 1).
    await publishRecord(
      `${prefix}-intent.json`,
      `${JSON.stringify({ owner: ownership.publication, environment: layout.env, args })}\n`,
    );
    await assertDependencyOwner(owner, layout);
    // Proof: omitted cancellation; cancelled-boundary negative executed its effect (exit 1).
    if (signal?.aborted) throw new Error('dependency owner boundary cancelled');
    const response = await runDocker(args, signal);
    // Proof: omitted immediate readback fence; lost-marker negative published a fabricated successful readback (exit 1).
    await assertDependencyOwner(owner, layout);
    await publishRecord(`${prefix}-readback.json`, `${JSON.stringify({ response })}\n`);
    await assertDependencyOwner(owner, layout);
    return response;
  };
}

/** Owner-bound initialized exec session; retains actual DONE/REAPED protocol observations. */
export function ownerDockerExec(
  owner: DependencyOwner,
  layout: EnvLayout,
  execDocker: DockerExec,
): DockerExec {
  return async (args, nonce, consume, signal) => {
    await ownerDocker(owner, layout, async (_command, boundedSignal) => {
      const tokens: string[] = [];
      await execDocker(
        args,
        nonce,
        (token) => {
          // Proof: omitted protocol retention; composed owner acceptance lost DONE/REAPED evidence (exit 1).
          tokens.push(token);
          return consume(token);
        },
        boundedSignal,
      );
      return JSON.stringify({ nonce, tokens });
    })(args, signal);
  };
}

/**
 * Holds the canonical solver runtime description for the entire protected callback.
 * Acquisition proves exclusion only for guarded executables, never legacy live
 * solver drain. Every owner boundary inside the callback verifies this description.
 */
export async function withOwnerSolverRuntime<T>(
  owner: DependencyOwner,
  layout: EnvLayout,
  action: () => Promise<T>,
): Promise<T> {
  // Proof: omitting both entry owner checks reached protected callback after
  // marker replacement (solver-runtime-admission.test.ts, owner-entry mutation, exit 1).
  await assertDependencyOwner(owner, layout);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const path = join(ownership.directory, 'solver-runtime.lock');
  // Proof: substituting wrong-runtime.lock reached protected work during actual
  // paused CLI startup (solver-runtime-admission.proc.test.ts, owner-lock mutation, exit 1).
  return withCanonicalLock(path, async (descriptor) => {
    // Proof: omitting checked description lets replaced runtime inode pass an owner boundary (solver-runtime-admission.test.ts).
    const lock = { path, descriptor };
    ownership.locks.push(lock);
    try {
      await assertDependencyOwner(owner, layout);
      const value = await action();
      // Proof: omitting this check returned success after callback changed owner
      // bytes (solver-runtime-admission.test.ts, owner-post-check mutation, exit 1).
      await assertDependencyOwner(owner, layout);
      return value;
    } finally {
      ownership.locks.splice(ownership.locks.indexOf(lock), 1);
    }
  });
}
