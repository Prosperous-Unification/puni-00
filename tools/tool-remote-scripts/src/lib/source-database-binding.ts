import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, realpath } from 'node:fs/promises';
import { posix } from 'node:path';

import type { DatabaseIdentity } from './backend-cohort';
import { type DatabaseMount, resolveDatabaseHost } from './backend-config';
import { inspectBackendFenceUnderOwner } from './backend-exclusion';
import type { RunDocker } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import { parseDockerInspection } from './docker-inspection-json';
import { assertDependencyOwner, type DependencyOwner, ownerDockerHashed } from './edge-ownership';
import { assertSame, readBoolean, readFields, readIdentity, readString } from './managed-cohort';
import { verifyContainerNamespace } from './mount-audit';
import {
  assertSolverExclusionDeadline,
  type SolverExclusion,
  type SolverLayouts,
} from './solver-exclusion';
import { decodeSourceDev, identifySourceInventory } from './source-dev-cohort';
import {
  assertSourceDevExclusionDeadline,
  inspectExcludedSourceMember,
  inspectSourceDevExclusion,
  type SourceDevExclusion,
} from './source-dev-exclusion';
import {
  inspectSourceDevInputs,
  observeSourceDevInputs,
  type SourceDevInputObservation,
} from './source-dev-inputs';
import {
  assertSourceDeadline,
  decodeSourceDevPins,
  decodeSourceStartupManifest,
  type SourceDevPins,
} from './source-startup-manifest';

/** Fresh read-only identities under constituent scopes. No field grants activation authority. */
export interface SourceDatabaseBindings {
  readonly format: 'source-database-bindings';
  readonly version: 1;
  readonly activation: 'blocked';
  readonly prod: DatabaseIdentity;
  readonly dev: DatabaseIdentity;
  readonly sourceInputs: SourceDevInputObservation;
}
function refuse(): never {
  throw new Error('source database binding refused');
}
const hashContents = (contents: Uint8Array) => createHash('sha256').update(contents).digest('hex');
const identifyInode = (stats: BigIntStats) => `${String(stats.dev)}:${String(stats.ino)}`;
function identifyFile(stats: BigIntStats): string {
  return (
    stats.isDirectory()
      ? [stats.dev, stats.ino, stats.mode]
      : [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs]
  )
    .map(String)
    .join(':');
}
interface RetainedPath {
  path: string;
  descriptor: FileHandle;
  identity: string;
}
/** Opens the fixed private dotenv through retained canonical ancestor descriptors. */
async function retainConfiguration(path: string, deadline: number) {
  const retained: RetainedPath[] = [];
  try {
    let current = '/';
    let parent: FileHandle | undefined;
    const segments = path.split('/').filter((segment) => segment !== '');
    for (const [index, segment] of ['/', ...segments].entries()) {
      assertSourceDeadline(deadline);
      const isFile = index === segments.length;
      const named = parent === undefined ? '/' : `/proc/self/fd/${String(parent.fd)}/${segment}`;
      current = index === 0 ? '/' : posix.join(current, segment);
      const descriptor = await open(
        named,
        constants.O_RDONLY |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK |
          (isFile ? 0 : constants.O_DIRECTORY),
      );
      const entry = { path: current, descriptor, identity: '' };
      retained.push(entry);
      const stats = await descriptor.stat({ bigint: true });
      entry.identity = identifyFile(stats);
      if (
        isFile
          ? !stats.isFile() ||
            stats.nlink !== 1n ||
            (stats.mode & 0o7777n) !== 0o600n ||
            stats.size > 1048576n
          : !stats.isDirectory()
      )
        refuse();
      if (
        (await realpath(current)) !== current ||
        identifyFile(await lstat(current, { bigint: true })) !== identifyFile(stats)
      )
        refuse();
      parent = descriptor;
    }
    const file = retained.at(-1) ?? refuse();
    async function read(): Promise<Buffer> {
      const bytes: Buffer[] = [];
      let offset = 0;
      for (;;) {
        assertSourceDeadline(deadline);
        const buffer = Buffer.alloc(65536);
        const chunk = await file.descriptor.read(buffer, 0, buffer.length, offset);
        if (chunk.bytesRead === 0) break;
        offset += chunk.bytesRead;
        if (offset > 1048576) refuse();
        bytes.push(buffer.subarray(0, chunk.bytesRead));
      }
      // Proof: omitting retained identities admitted late same-byte dotenv replacement and ancestor hardlink swap; both negatives failed.
      for (const entry of retained) {
        assertSourceDeadline(deadline);
        if (
          identifyFile(await entry.descriptor.stat({ bigint: true })) !== entry.identity ||
          identifyFile(await lstat(entry.path, { bigint: true })) !== entry.identity ||
          (await realpath(entry.path)) !== entry.path
        )
          refuse();
      }
      return Buffer.concat(bytes);
    }
    return {
      read,
      close: async () => {
        for (const entry of [...retained].reverse()) await entry.descriptor.close();
      },
    };
  } catch {
    for (const entry of [...retained].reverse()) await entry.descriptor.close();
    return refuse();
  }
}
/** Closed literal profile; source producer separately validates all remaining dotenv controls. */
function readStoragePath(contents: string, environment: unknown): string {
  const storage = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const assignment = /^(?:export )?(DB_PATH|MIGRATE_ON_STARTUP)=(.*)$/.exec(line);
    if (assignment === null) continue;
    const name = assignment.at(1),
      value = assignment.at(2);
    if (name === undefined || value === undefined || storage.has(name)) refuse();
    storage.set(name, value);
  }
  const path = storage.get('DB_PATH');
  if (
    path === undefined ||
    !/^\/data\/[A-Za-z0-9_./-]+$/.test(path) ||
    path.endsWith('/') ||
    path.includes('//') ||
    path.split('/').some((segment) => segment === '.' || segment === '..') ||
    posix.normalize(path) !== path ||
    storage.get('MIGRATE_ON_STARTUP') !== 'false'
  )
    refuse();
  if (!Array.isArray(environment)) refuse();
  const inherited = new Map<string, string>();
  for (const raw of environment) {
    const assignment = readString(raw);
    const split = assignment.indexOf('=');
    if (split < 1) refuse();
    const name = assignment.slice(0, split);
    if (inherited.has(name)) refuse();
    inherited.set(name, assignment.slice(split + 1));
  }
  // Proof: inherited-agreement guard omitted; all five native-environment disagreement negatives admitted bindings and failed.
  if (
    (inherited.has('DB_PATH') && inherited.get('DB_PATH') !== path) ||
    (inherited.has('MIGRATE_ON_STARTUP') && inherited.get('MIGRATE_ON_STARTUP') !== 'false')
  )
    refuse();
  return path;
}
interface Family {
  database: DatabaseIdentity;
  files: readonly { suffix: string; identity: string }[];
}
async function inspectFamily(
  path: string,
  host: string,
  root: string,
  deadline: number,
): Promise<Family> {
  assertSourceDeadline(deadline);
  // Proof: canonical-root prefix omitted; actual fenced database outside prod/data was admitted and its negative failed.
  if (
    !host.startsWith(`${root}/data/`) ||
    (await realpath(`${root}/data`)) !== `${root}/data` ||
    (await realpath(host)) !== host
  )
    refuse();
  const directory = await lstat(posix.dirname(host), { bigint: true });
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o500n) !== 0o500n
  )
    refuse();
  const files: { suffix: string; identity: string }[] = [];
  let main: string | undefined;
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    assertSourceDeadline(deadline);
    let stats: BigIntStats;
    try {
      stats = await lstat(host + suffix, { bigint: true });
    } catch (cause) {
      if (suffix !== '' && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        continue;
      throw cause;
    }
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (stats.mode & 0o400n) === 0n ||
      (await realpath(host + suffix)) !== host + suffix
    )
      refuse();
    const descriptor = await open(
      host + suffix,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      if (identifyFile(await descriptor.stat({ bigint: true })) !== identifyFile(stats)) refuse();
    } finally {
      await descriptor.close();
    }
    files.push({ suffix, identity: identifyInode(stats) });
    if (suffix === '') main = identifyInode(stats);
  }
  if (main === undefined) refuse();
  assertSourceDeadline(deadline);
  return {
    database: { path, host, directoryIdentity: identifyInode(directory), fileIdentity: main },
    files,
  };
}
function assertDistinct(prod: Family, dev: Family): void {
  // Proof: cross-family guard omitted; actual main-hardlink and sidecar-hardlink negatives both admitted bindings and failed.
  const prodDirectory = posix.dirname(prod.database.host),
    devDirectory = posix.dirname(dev.database.host);
  if (
    prod.database.host === dev.database.host ||
    prod.database.fileIdentity === dev.database.fileIdentity ||
    prod.database.directoryIdentity === dev.database.directoryIdentity ||
    prodDirectory === devDirectory ||
    prodDirectory.startsWith(devDirectory + '/') ||
    devDirectory.startsWith(prodDirectory + '/') ||
    prod.files.some((file) => dev.files.some((other) => other.identity === file.identity))
  )
    refuse();
}
/**
 * Requires source and solver original scopes to share the exact same absolute operation deadline.
 * Constructs real source input evidence at that deadline and brackets
 * effective storage configuration, native inventory and actual production fence completion.
 * Never opens SQLite, changes a participant or turns returned observations into a grant.
 * All failures discard private configuration and transport causes.
 */
export async function observeSourceDatabaseBindings(
  owner: DependencyOwner,
  layouts: SolverLayouts,
  source: SourceDevExclusion,
  solver: SolverExclusion,
  suppliedPins: SourceDevPins,
  manifestContents: string,
  runDocker: RunDocker,
  deadline: number,
  execDocker: DockerExec = runDockerExec,
): Promise<SourceDatabaseBindings> {
  let configuration: Awaited<ReturnType<typeof retainConfiguration>> | undefined;
  try {
    assertSourceDeadline(deadline);
    // Proof: entry deadline-guard omission allowed nested queries for mismatched budgets; exact shared-deadline test failed.
    assertSolverExclusionDeadline(owner, solver, deadline);
    // Proof: entry source-guard omission ran nested queries with a shorter original source budget; zero-query mismatch negative failed.
    assertSourceDevExclusionDeadline(owner, source, deadline);
    layouts = structuredClone(layouts);
    const pins = decodeSourceDevPins(suppliedPins);
    const manifest = decodeSourceStartupManifest(manifestContents, pins);
    if (layouts.prod.env !== 'prod' || layouts.dev.env !== 'dev') refuse();
    await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
    await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
    const sourceInputs = await observeSourceDevInputs(
      owner,
      layouts,
      source,
      pins,
      manifestContents,
      runDocker,
      deadline,
    );
    const prodBefore = await inspectBackendFenceUnderOwner(
      owner,
      layouts.prod,
      pins.sourceSha,
      runDocker,
      deadline,
      source,
      verifyContainerNamespace,
      execDocker,
      solver,
    );
    const selected = prodBefore.cohort.blue?.database ?? prodBefore.cohort.green?.database;
    if (selected === undefined) refuse();
    const prod = await inspectFamily(selected.path, selected.host, layouts.prod.root, deadline);
    assertSame(selected, prod.database, 'production database identity');
    const docker = ownerDockerHashed(owner, layouts.prod, runDocker);
    async function readDocker(args: string[]): Promise<string> {
      assertSourceDeadline(deadline);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, deadline - performance.now());
      try {
        const response = await docker(args, controller.signal);
        assertSourceDeadline(deadline);
        return response;
      } finally {
        clearTimeout(timer);
      }
    }
    async function inspectInventory() {
      const listed = (await readDocker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'])).trim();
      const ids = listed === '' ? [] : listed.split('\n');
      if (ids.length === 0 || new Set(ids).size !== ids.length) refuse();
      ids.forEach(readIdentity);
      const inventory: unknown = parseDockerInspection(await readDocker(['inspect', ...ids]));
      if (!Array.isArray(inventory) || inventory.length !== ids.length) refuse();
      assertSame(
        [...ids].sort(),
        inventory.map((raw: unknown) => readIdentity(readFields(raw)['Id'])).sort(),
        'source binding complete inventory',
      );
      const raw = await inspectExcludedSourceMember(
        owner,
        layouts.prod,
        source,
        inventory,
        deadline,
      );
      return {
        member: decodeSourceDev(raw, layouts.dev),
        identity: identifySourceInventory(inventory, raw),
      };
    }
    const initial = await inspectInventory();
    await inspectSourceDevInputs(owner, sourceInputs);
    configuration = await retainConfiguration(
      `${layouts.dev.root}/src/apps/wbs/be-01/.env`,
      deadline,
    );
    const configPin = manifest.configuration.find((pin) => pin.slot === 'backend') ?? refuse();
    async function inspectDev(member: typeof initial.member): Promise<Family> {
      if (configuration === undefined) refuse();
      const bytes = await configuration.read();
      if (bytes.length !== configPin.size || hashContents(bytes) !== configPin.sha256) refuse();
      const path = readStoragePath(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        member.config['Env'],
      );
      const mounts: DatabaseMount[] = member.mounts.map((raw) => {
        const mount = readFields(raw);
        return {
          type: readString(mount['Type']),
          source: readString(mount['Source']),
          target: readString(mount['Destination']),
          writable: readBoolean(mount['RW']),
        };
      });
      assertSourceDeadline(deadline);
      const host = await resolveDatabaseHost(path, mounts, realpath);
      return inspectFamily(path, host, layouts.dev.root, deadline);
    }
    const dev = await inspectDev(initial.member);
    assertDistinct(prod, dev);
    await inspectSourceDevInputs(owner, sourceInputs);
    const final = await inspectInventory();
    assertSame(initial.identity, final.identity, 'source binding stable complete inventory');
    const finalDev = await inspectDev(final.member);
    assertSame(dev, finalDev, 'source database family');
    const prodAfter = await inspectBackendFenceUnderOwner(
      owner,
      layouts.prod,
      pins.sourceSha,
      runDocker,
      deadline,
      source,
      verifyContainerNamespace,
      execDocker,
      solver,
    );
    assertSame(prodBefore, prodAfter, 'production fence completion');
    const finalProd = await inspectFamily(
      selected.path,
      selected.host,
      layouts.prod.root,
      deadline,
    );
    assertSame(prod, finalProd, 'production database family');
    assertDistinct(finalProd, finalDev);
    await inspectSourceDevInputs(owner, sourceInputs);
    await inspectSourceDevExclusion(owner, source, deadline);
    await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
    await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
    // Proof: final family block omitted after last tree readback; late prod/dev main replacement and new dev WAL negatives all failed.
    const lastDev = await inspectDev(final.member);
    assertSame(dev, lastDev, 'final source database family');
    const lastProd = await inspectFamily(selected.path, selected.host, layouts.prod.root, deadline);
    assertSame(prod, lastProd, 'final production database family');
    assertDistinct(lastProd, lastDev);
    // Include asynchronous descriptor cleanup before the final deadline and lifecycle checks.
    await configuration.close();
    configuration = undefined;
    await inspectSourceDevExclusion(owner, source, deadline);
    assertSolverExclusionDeadline(owner, solver, deadline);
    assertSourceDevExclusionDeadline(owner, source, deadline);
    assertSourceDeadline(deadline);
    return Object.freeze({
      format: 'source-database-bindings',
      version: 1,
      activation: 'blocked',
      prod: Object.freeze({ ...prod.database }),
      dev: Object.freeze({ ...dev.database }),
      sourceInputs,
    });
  } catch {
    return refuse();
  } finally {
    if (configuration !== undefined) {
      try {
        await configuration.close();
      } catch {
        refuse();
      }
    }
  }
}
