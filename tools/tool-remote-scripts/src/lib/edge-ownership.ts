import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, readFileSync, writeFileSync } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import type {
  ActivationRecordByLabel,
  ActivationRecordLabel,
} from './dependency-activation-records';
import { openDirectoryFile, renameDirectoryFile } from './directory-file';
import type { RunDocker } from './docker-deadline';
import type { DockerExec } from './docker-exec';
import { assertNoEdgeOwner, edgeStateDirectory } from './edge-admission';
import {
  captureEdgePolicy,
  captureEdgeRecord,
  decodeOrdinaryEdgePolicy,
  type EdgePolicySnapshot,
  type RestoringEdgePolicy,
} from './edge-policy';
import type { EnvLayout } from './env';
import { assertInheritedLock, withCanonicalLock } from './lock';
import { publishRecord, readClosed, readRecord, readString } from './managed-cohort';
import type { RunSolverHost } from './solver-host';
import {
  assertRetainedSolverRestoration,
  type RetainedSolverRestoration,
  solverRestorationReference,
} from './solver-restoration';

/** Reviewed managed-fence scope only; never a complete participant or activation proof. */
export interface DependencyOwnerPlan {
  readonly sha: string;
  readonly layouts: readonly EnvLayout[];
}
export interface DependencyOwnerPublication {
  readonly format: 'dependency-edge-owner';
  readonly version: 1;
  readonly attempt: string;
  readonly plan: DependencyOwnerPlan;
}

/** Decodes the existing publication grammar for solver restoration without reconstructing live authority. */
export function decodeDependencyOwnerPublication(value: unknown): DependencyOwnerPublication {
  // Proof: pending-closed omission admitted extra authority fields through runtime owner-extra; test failed (exit 1).
  const publication = readClosed(value, ['format', 'version', 'attempt', 'plan']);
  const plan = readClosed(publication['plan'], ['sha', 'layouts']);
  const sha = readString(plan['sha']);
  const attempt = readString(publication['attempt']);
  if (
    publication['format'] !== 'dependency-edge-owner' ||
    publication['version'] !== 1 ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attempt) ||
    !Array.isArray(plan['layouts']) ||
    plan['layouts'].length !== 2
  )
    throw new Error('solver restoration requires exact joint owner publication');
  const layouts: EnvLayout[] = [];
  for (const raw of plan['layouts']) {
    const layout = readClosed(raw, [
      'env',
      'root',
      'network',
      'containerPrefix',
      'sharedEnvPath',
      'oidcEnvPath',
      'stateDir',
      'siteCaddyPath',
      'siteAddress',
    ]);
    const env = layout['env'];
    if ((env !== 'prod' && env !== 'dev') || layouts.some((prior) => prior.env === env))
      throw new Error('solver restoration owner layouts are duplicate or unknown');
    // Proof: coherent reversed pending/intent hashes entered the runtime callback before this publisher-order guard (owner-order test, exit 1).
    if (env !== (layouts.length === 0 ? 'prod' : 'dev'))
      throw new Error('solver restoration owner layouts are not in publisher prod/dev order');
    const paths = ['root', 'sharedEnvPath', 'stateDir', 'siteCaddyPath'] as const;
    for (const key of paths) {
      const path = readString(layout[key]);
      if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
        throw new Error('solver restoration owner path is not canonical');
    }
    const oidcEnvPath = layout['oidcEnvPath'] === null ? null : readString(layout['oidcEnvPath']);
    if (oidcEnvPath !== null && (!isAbsolute(oidcEnvPath) || resolve(oidcEnvPath) !== oidcEnvPath))
      throw new Error('solver restoration owner OIDC path is not canonical');
    layouts.push({
      env,
      root: readString(layout['root']),
      network: readString(layout['network']),
      containerPrefix: readString(layout['containerPrefix']),
      sharedEnvPath: readString(layout['sharedEnvPath']),
      oidcEnvPath,
      stateDir: readString(layout['stateDir']),
      siteCaddyPath: readString(layout['siteCaddyPath']),
      siteAddress: readString(layout['siteAddress']),
    });
  }
  return { format: 'dependency-edge-owner', version: 1, attempt, plan: { sha, layouts } };
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
  return ownerDockerBoundary(owner, layout, runDocker, false);
}

function ownerDockerBoundary(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
  hashResponse: boolean,
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
    // Proof: retaining raw responses at hashed boundaries leaked PRIVATE_SENTINEL; source private evidence test failed.
    const observation = hashResponse
      ? { responseSha256: createHash('sha256').update(response).digest('hex') }
      : { response };
    await publishRecord(`${prefix}-readback.json`, `${JSON.stringify(observation)}\n`);
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
  const directory = await open(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parentIdentity = await directory.stat({ bigint: true });
    const namedParent = await lstat(parent, { bigint: true });
    if (
      !parentIdentity.isDirectory() ||
      !namedParent.isDirectory() ||
      parentIdentity.dev !== namedParent.dev ||
      parentIdentity.ino !== namedParent.ino ||
      (await realpath(parent)) !== parent
    )
      throw new Error('owner site publication parent is not canonical');
    // Proof: omitted original equality guards; changed-original publication replaced unknown bytes.
    if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
      throw new Error('owner site original file changed');
    const sibling = `.${basename(original.path)}.dependency-${randomUUID()}`;
    const parentBinding = {
      path: parent,
      device: String(parentIdentity.dev),
      inode: String(parentIdentity.ino),
    };
    // Proof: omitted original/intent publication; actual rename refused absent private durable evidence.
    await retainIngressRecord(owner, layout, 'original', original);
    await retainIngressRecord(owner, layout, 'intent', {
      original,
      contents,
      sibling,
      directory: parentBinding,
    });
    // Both names resolve against this retained directory, never the asynchronously mutable pathname.
    // Proof: following sibling creation overwrote the foreign symlink target in owner-site-publication.test.ts.
    const descriptor = openDirectoryFile(
      directory.fd,
      sibling,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    );
    let published: OwnedSiteFile;
    try {
      // Proof: omitted mode admission; public-mode injection passed secret bytes to the later rename boundary.
      if ((fstatSync(descriptor).mode & 0o777) !== 0o600)
        throw new Error('owner site private creation mode differs');
      writeFileSync(descriptor, contents, 'utf8');
      // Proof: omitted staged fsync; actual rename boundary refused the unsynchronized source.
      fsyncSync(descriptor);
      await assertDependencyOwner(owner, layout);
      if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
        throw new Error('owner site original changed before publication');
      const currentParent = await lstat(parent, { bigint: true });
      if (
        currentParent.dev !== parentIdentity.dev ||
        currentParent.ino !== parentIdentity.ino ||
        !currentParent.isDirectory() ||
        (await realpath(parent)) !== parent
      )
        throw new Error('owner site parent changed before publication');
      const created = fstatSync(descriptor, { bigint: true });
      await retainIngressRecord(owner, layout, 'intent', {
        original,
        contents,
        sibling,
        directory: parentBinding,
        created: { device: String(created.dev), inode: String(created.ino) },
      });
      await assertDependencyOwner(owner, layout);
      renameDirectoryFile(directory.fd, sibling, basename(original.path));
      // Proof: omitted directory fsync; successful-publication acceptance lacked its durability observation.
      fsyncSync(directory.fd);
      const readback = openDirectoryFile(
        directory.fd,
        basename(original.path),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const observed = fstatSync(readback, { bigint: true });
        const retained = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          readFileSync(readback),
        );
        // Proof: omitted identity/byte readback; zero-exit no-op rename returned success.
        if (
          !observed.isFile() ||
          observed.dev !== created.dev ||
          observed.ino !== created.ino ||
          retained !== contents
        )
          throw new Error('owner site publication readback differs');
        published = {
          path: original.path,
          device: String(observed.dev),
          inode: String(observed.ino),
          mode: Number(observed.mode & 0o777n),
          contents: retained,
        };
      } finally {
        closeSync(readback);
      }
      const finalParent = await lstat(parent, { bigint: true });
      if (
        !finalParent.isDirectory() ||
        finalParent.dev !== parentIdentity.dev ||
        finalParent.ino !== parentIdentity.ino ||
        (await realpath(parent)) !== parent
      )
        throw new Error(
          'owner site parent changed after publication; retained directory evidence required',
        );
    } finally {
      closeSync(descriptor);
    }
    await assertDependencyOwner(owner, layout);
    await retainIngressRecord(owner, layout, 'complete', { site: published });
    return published;
  } finally {
    await directory.close();
  }
}

/** Durable host-wide boundary; both selected environments must remain owned before and after effects. */
export function ownerHostCommand(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  runHost: RunSolverHost,
): RunSolverHost {
  return async (command, signal) => {
    await assertDependencyOwner(owner, layouts.prod);
    await assertDependencyOwner(owner, layouts.dev);
    // Proof: raw host-response retention leaked PRIVATE_HOST_SENTINEL in the composed host-private refusal test (exit 1).
    return ownerDockerHashed(owner, layouts.prod, async (_args, boundedSignal) => {
      await assertDependencyOwner(owner, layouts.dev);
      const response = await runHost(command, boundedSignal);
      await assertDependencyOwner(owner, layouts.dev);
      return response;
    })(['solver-host', command.kind], signal);
  };
}

/** Retains solver observations as private numbered owner evidence; bytes from installed executables/config stay out. */
export async function retainSolverRecord(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: 'installed' | 'stop' | 'drained' | 'complete' | 'restore-intent' | 'restore-complete',
  record: object,
): Promise<{ path: string; contents: string }> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const path = join(
    ownership.directory,
    `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-solver-${label}.json`,
  );
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  await publishRecord(path, contents);
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  return { path, contents };
}

/** Reads attribution from the exact pending publication while retaining original live lock authority. */
export async function inspectDependencyOwnerPublication(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
): Promise<DependencyOwnerPublication> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const pending = await captureEdgeRecord(ownership.directory, 'edge-owner.pending', 65536);
  const publication = decodeDependencyOwnerPublication(JSON.parse(pending.contents));
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  return publication;
}

/** Retains fixed-label activation evidence exclusively; publication never creates a live activation grant. */
export async function retainActivationRecord<Label extends ActivationRecordLabel>(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: Label,
  record: ActivationRecordByLabel[Label],
): Promise<{ path: string; contents: string }> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const statePath = ownership.directory;
  const name = `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-activation-${label}.json`;
  const path = join(ownership.directory, name);
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  const directory = await open(
    ownership.directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parent = await directory.stat({ bigint: true });
    async function assertDirectory() {
      const named = await lstat(statePath, { bigint: true });
      if (
        !parent.isDirectory() ||
        !named.isDirectory() ||
        parent.dev !== named.dev ||
        parent.ino !== named.ino ||
        (await realpath(statePath)) !== statePath
      )
        throw new Error('activation owner evidence parent changed');
    }
    await assertDirectory();
    await publishRecord(`/proc/self/fd/${String(directory.fd)}/${name}`, contents);
    await assertDirectory();
    // Proof: replacing private capture with raw readback admitted mode0644 evidence; public-readback publication negative failed.
    const published = await captureEdgeRecord(statePath, name, 65536);
    if (published.contents !== contents)
      throw new Error('activation owner evidence readback differs');
    await assertDependencyOwner(owner, layouts.prod);
    await assertDependencyOwner(owner, layouts.dev);
    await assertDirectory();
    return { path, contents };
  } finally {
    await directory.close();
  }
}

/** Binds an effective participant namespace to the directory actually holding this live owner's markers and locks. */
export async function assertDependencyOwnerDirectory(
  owner: DependencyOwner,
  layout: EnvLayout,
  directory: string,
): Promise<void> {
  await assertDependencyOwner(owner, layout);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  if (ownership.directory !== directory)
    throw new Error('dependency owner state namespace differs from effective solver admission');
}

/** Retain only a response hash at credential-bearing Docker inspection boundaries. */
export function ownerDockerHashed(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
): RunDocker {
  return ownerDockerBoundary(owner, layout, runDocker, true);
}

/** Fixed-path owner-only policy replacement after all exclusion finalizers; never retires retained admission. */
export async function publishRestoringEdgePolicy(
  owner: DependencyOwner,
  original: EdgePolicySnapshot,
  intent: RetainedSolverRestoration,
): Promise<void> {
  const envelope = await assertRetainedSolverRestoration(owner, intent);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const prod = ownership.layouts.find((layout) => layout.env === 'prod');
  const dev = ownership.layouts.find((layout) => layout.env === 'dev');
  if (prod === undefined || dev === undefined || ownership.layouts.length !== 2)
    throw new Error('restoring policy requires joint prod/dev owner');
  const layouts = { prod, dev };
  const path = join(ownership.directory, 'edge-policy.json');
  const reference = solverRestorationReference(intent);
  // Proof: publication-scope omission lost the exact fixed-path refusal; owner publisher test failed (exit 1).
  if (
    original.path !== path ||
    intent.path !== join(ownership.directory, reference.name) ||
    !/^edge-owner-[0-9]{6,12}-solver-restore-intent\.json$/.test(reference.name) ||
    envelope.owner !== ownership.publication ||
    original.policy.phase !== 'ordinary'
  )
    throw new Error('restoring policy scope or owner binding differs');
  decodeOrdinaryEdgePolicy(original.policy, ownership.directory);
  await assertNoCommittedDependencyOwner(ownership.directory);
  const retained = await captureEdgeRecord(ownership.directory, reference.name, 65536);
  if (retained.contents !== intent.contents) throw new Error('restoration intent bytes changed');
  const policy: RestoringEdgePolicy = {
    format: 'dependency-edge-policy',
    version: 1,
    phase: 'restoring',
    edgeState: ownership.directory,
    ownerPublicationSha256: createHash('sha256').update(ownership.publication).digest('hex'),
    restorationIntent: reference,
  };
  const contents = `${JSON.stringify(policy)}\n`;
  const directory = await open(
    ownership.directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parent = await directory.stat({ bigint: true });
    const assertOriginal = async () => {
      await assertDependencyOwner(owner, prod);
      await assertDependencyOwner(owner, dev);
      await assertNoCommittedDependencyOwner(ownership.directory);
      // Proof: publication-original omission replaced changed ordinary bytes; changed-original fault test failed (exit 1).
      if (
        JSON.stringify(await captureEdgePolicy(ownership.directory)) !== JSON.stringify(original) ||
        String(parent.dev) !== original.parentDevice ||
        String(parent.ino) !== original.parentInode ||
        JSON.stringify(await captureEdgeRecord(ownership.directory, reference.name, 65536)) !==
          JSON.stringify(retained)
      )
        throw new Error('restoring policy original, parent or intent changed');
    };
    await assertOriginal();
    const sibling = `.edge-policy.json.dependency-${randomUUID()}`;
    await retainSolverRecord(owner, layouts, 'restore-complete', {
      phase: 'policy-publication-intent',
      reference,
      originalSha256: createHash('sha256').update(original.contents).digest('hex'),
      sibling,
    });
    const descriptor = openDirectoryFile(
      directory.fd,
      sibling,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    );
    try {
      const created = fstatSync(descriptor, { bigint: true });
      // Proof: publication-private omission crossed the public-mode publication boundary; public-mode fault test failed (exit 1).
      if ((created.mode & 0o777n) !== 0o600n)
        throw new Error('restoring policy creation mode is not private');
      writeFileSync(descriptor, contents, 'utf8');
      // Proof: publication-file-sync omission ignored injected fsync failure; file-sync fault test failed (exit 1).
      fsyncSync(descriptor);
      await assertOriginal();
      renameDirectoryFile(directory.fd, sibling, 'edge-policy.json');
      // Proof: publication-directory-sync omission ignored injected fsync failure; directory-sync fault test failed (exit 1).
      fsyncSync(directory.fd);
      const published = await captureEdgePolicy(ownership.directory);
      // Proof: publication-readback omission accepted no-op rename; noop-rename fault test failed (exit 1).
      if (
        published.device !== String(created.dev) ||
        published.inode !== String(created.ino) ||
        published.parentDevice !== String(parent.dev) ||
        published.parentInode !== String(parent.ino) ||
        published.contents !== contents ||
        published.mode !== 0o600
      )
        throw new Error('restoring policy publication readback differs');
    } finally {
      closeSync(descriptor);
    }
    await assertDependencyOwner(owner, prod);
    await assertDependencyOwner(owner, dev);
    await assertNoCommittedDependencyOwner(ownership.directory);
    await retainSolverRecord(owner, layouts, 'restore-complete', {
      phase: 'policy-published',
      reference,
    });
  } finally {
    await directory.close();
  }
}

/** A pending P2a owner never grants a committed owner transition. */
export async function assertNoCommittedDependencyOwner(directory: string): Promise<void> {
  try {
    await lstat(join(directory, 'edge-owner.json'));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  // Proof: committed-marker omission admitted a committed marker; runtime committed test failed (exit 1).
  throw new Error('solver-only restoration refuses a committed dependency owner');
}
