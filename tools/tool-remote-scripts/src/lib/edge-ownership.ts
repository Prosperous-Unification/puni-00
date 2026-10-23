import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, rename } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

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

/** Exact trusted UTF-8 config file observation; identities are strings to retain full inode precision. */
export interface OwnedSiteFile {
  path: string;
  device: string;
  inode: string;
  mode: number;
  contents: string;
}

/** Opens without following links and binds exact bytes to an existing canonical regular inode. */
// Proof: replacing this boundary with a following reader admitted the actual symlink-site production negative (exit 1).
export async function captureOwnedSiteFile(path: string): Promise<OwnedSiteFile> {
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || (await realpath(path)) !== path)
    throw new Error('ingress configuration requires canonical regular files');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino)
      throw new Error('ingress configuration inode changed while opening');
    const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.readFile(),
    );
    const final = await lstat(path, { bigint: true });
    if (final.dev !== opened.dev || final.ino !== opened.ino || !final.isFile())
      throw new Error('ingress configuration inode changed while reading');
    return {
      path,
      device: String(opened.dev),
      inode: String(opened.ino),
      mode: Number(opened.mode & 0o777n),
      contents,
    };
  } finally {
    await file.close();
  }
}

/** Retains private ingress evidence under the exact live owner; never a reconstructed authority. */
export async function retainIngressRecord(
  owner: DependencyOwner,
  layout: EnvLayout,
  label: 'original' | 'intent' | 'complete',
  record: object,
): Promise<{ path: string; contents: string }> {
  await assertDependencyOwner(owner, layout);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const path = join(
    ownership.directory,
    `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-ingress-${label}.json`,
  );
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  await publishRecord(path, contents);
  await assertDependencyOwner(owner, layout);
  return { path, contents };
}

/**
 * Replaces only this owner's selected canonical site file. Retains original bytes
 * and write intent first; exclusive private UUID sibling, file/directory fsync and
 * exact inode/byte readback establish persistence. Failure retains sibling/current
 * files and evidence; never restores an old file or removes owner state.
 */
export async function publishOwnedSiteFile(
  owner: DependencyOwner,
  layout: EnvLayout,
  original: OwnedSiteFile,
  contents: string,
): Promise<OwnedSiteFile> {
  await assertDependencyOwner(owner, layout);
  // Proof: omitted selected path validation; a genuine captured registry file was overwritten (exit 1).
  if (
    original.path !== layout.siteCaddyPath ||
    basename(original.path) !== (layout.env === 'prod' ? 'site.caddy' : 'site-dev.caddy')
  )
    throw new Error('owner site publication path is outside selected scope');
  const parent = dirname(original.path);
  const parentIdentity = await lstat(parent, { bigint: true });
  if (!parentIdentity.isDirectory() || (await realpath(parent)) !== parent)
    throw new Error('owner site publication parent is not canonical');
  // Proof: omitted original equality guards; changed-original publication replaced unknown bytes (exit 1).
  if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
    throw new Error('owner site original file changed');
  const sibling = join(parent, `.${basename(original.path)}.dependency-${randomUUID()}`);
  // Proof: omitted original/intent publications; actual rename port refused absent private durable evidence (exit 1).
  await retainIngressRecord(owner, layout, 'original', original);
  await retainIngressRecord(owner, layout, 'intent', { original, contents, sibling });
  // Proof: replacing exclusive no-follow creation with following creation admitted the injected sibling symlink (exit 1).
  const file = await open(
    sibling,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  let published: OwnedSiteFile;
  try {
    await file.writeFile(contents);
    // Proof: omitted staged fsync; actual rename port refused unsynced source (exit 1).
    await file.sync();
    await assertDependencyOwner(owner, layout);
    if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
      throw new Error('owner site original changed before publication');
    const currentParent = await lstat(parent, { bigint: true });
    if (
      currentParent.dev !== parentIdentity.dev ||
      currentParent.ino !== parentIdentity.ino ||
      (await realpath(parent)) !== parent
    )
      throw new Error('owner site parent changed before publication');
    const created = await file.stat({ bigint: true });
    await retainIngressRecord(owner, layout, 'intent', {
      original,
      contents,
      sibling,
      created: { device: String(created.dev), inode: String(created.ino) },
    });
    await assertDependencyOwner(owner, layout);
    await rename(sibling, original.path);
    const directory = await open(parent, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      // Proof: omitted directory fsync; successful-publication effect test failed its persistence observation (exit 1).
      await directory.sync();
    } finally {
      await directory.close();
    }
    published = await captureOwnedSiteFile(original.path);
    // Proof: omitted readback equality; zero-exit no-op rename returned success and failed the refusal assertion (exit 1).
    if (
      published.device !== String(created.dev) ||
      published.inode !== String(created.ino) ||
      published.contents !== contents
    )
      throw new Error('owner site publication readback differs');
  } finally {
    await file.close();
  }
  await assertDependencyOwner(owner, layout);
  await retainIngressRecord(owner, layout, 'complete', { site: published });
  return published;
}
