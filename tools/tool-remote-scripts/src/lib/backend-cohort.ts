import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { posix } from 'node:path';

import { type DatabaseMount, resolveDatabaseHost } from './backend-config';
import type { Color } from './deploy-contract';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import type { EnvLayout } from './env';
import { inspectGatewayFenceUnderLock } from './gateway-exclusion';
import {
  assertExcluded,
  assertSame,
  inspectManagedCohort,
  inspectManagedInventory,
  type ManagedCohort,
  type ManagedContainer,
  parseManagedCohort,
  readBoolean,
  readClosed,
  readFields,
  readIdentity,
  readNonempty,
  readRecord,
  readString,
} from './managed-cohort';
import { verifyContainerNamespace } from './mount-audit';

interface DatabaseIdentity {
  path: string;
  host: string;
  directoryIdentity: string;
  fileIdentity: string;
}
interface Backend extends ManagedContainer {
  database: DatabaseIdentity;
}
/** Exact managed backend members, each bound to one canonical SQLite family. */
export interface BackendCohort {
  blue: Backend | null;
  green: Backend | null;
}
const COLORS = ['blue', 'green'] as const;

/** Exact byte hashes of the gateway evidence retained by the preceding operation. */
export interface GatewayBinding {
  markerSha256: string;
  intentSha256: string;
  completionSha256: string;
}

/** Closed byte-hash binding grammar; these hashes grant no authority without fresh inventory. */
export function parseGatewayBinding(value: unknown): GatewayBinding {
  // Proof: malformed-gateway-binding and missing-gateway-binding are refused by retained-record inspection.
  const fields = readClosed(value, ['markerSha256', 'intentSha256', 'completionSha256']);
  const readHash = (entry: unknown): string => {
    const hash = readString(entry);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('backend fence gateway binding is malformed');
    return hash;
  };
  return {
    markerSha256: readHash(fields['markerSha256']),
    intentSha256: readHash(fields['intentSha256']),
    completionSha256: readHash(fields['completionSha256']),
  };
}

/** Re-read exact retained bytes with no-follow inode checks before hashing. */
export async function gatewayBinding(layout: EnvLayout): Promise<GatewayBinding> {
  const digest = async (name: string): Promise<string> =>
    createHash('sha256')
      .update(await readRecord(`${layout.stateDir}/dependency-gateway-${name}.json`))
      .digest('hex');
  return {
    markerSha256: await digest('fence'),
    intentSha256: await digest('intent'),
    completionSha256: await digest('complete'),
  };
}

function parseDatabase(value: unknown): DatabaseIdentity {
  const fields = readClosed(value, ['path', 'host', 'directoryIdentity', 'fileIdentity']);
  const path = readNonempty(fields['path']);
  const host = readNonempty(fields['host']);
  const directoryIdentity = readNonempty(fields['directoryIdentity']);
  const fileIdentity = readNonempty(fields['fileIdentity']);
  if (
    ![path, host].every((name) => name.startsWith('/') && posix.normalize(name) === name) ||
    ![directoryIdentity, fileIdentity].every((identity) => /^\d+:\d+$/.test(identity))
  )
    throw new Error('backend fence database identity is malformed');
  return { path, host, directoryIdentity, fileIdentity };
}

/** Closed durable backend cohort grammar, with shared process/image provenance validation. */
export function parseBackendCohort(value: unknown, layout: EnvLayout): BackendCohort {
  const fields = readClosed(value, ['blue', 'green']);
  const managed: Record<string, unknown> = {};
  const databases: Partial<Record<Color, DatabaseIdentity>> = {};
  for (const color of COLORS) {
    if (fields[color] === null) {
      managed[color] = null;
      continue;
    }
    const entry = readFields(fields[color]);
    const { database, ...container } = entry;
    managed[color] = container;
    databases[color] = parseDatabase(database);
  }
  const cohort = parseManagedCohort(managed, layout, 'be');
  const backends: BackendCohort = { blue: null, green: null };
  for (const color of COLORS) {
    const container = cohort[color];
    if (container === null) continue;
    const database = databases[color];
    if (database === undefined) throw new Error('backend fence missing database identity');
    backends[color] = { ...container, database };
  }
  // Proof: empty-backends refuses before marker publication; an empty cohort cannot identify a store.
  if (backends.blue === null && backends.green === null)
    throw new Error('backend fence requires a nonempty managed cohort');
  if (backends.blue !== null && backends.green !== null)
    // Proof: deleting equality admits foreign-database; its production-path negative fails (exit 1).
    assertSame(backends.blue.database, backends.green.database, 'backend database family');
  return backends;
}

function readMounts(container: Record<string, unknown>): DatabaseMount[] {
  const mounts = container['Mounts'];
  if (!Array.isArray(mounts))
    throw new Error('backend fence Docker mounts are missing or malformed');
  return mounts.map((raw: unknown) => {
    const mount = readFields(raw);
    const type = readNonempty(mount['Type']);
    const source = readString(mount['Source']);
    const target = readNonempty(mount['Destination']);
    const writable = readBoolean(mount['RW']);
    if (
      !['bind', 'volume', 'tmpfs', 'npipe', 'cluster', 'image'].includes(type) ||
      !target.startsWith('/') ||
      (type !== 'tmpfs' && !source.startsWith('/'))
    )
      throw new Error('backend fence Docker mount paths/type are unsupported');
    return { type, source, target, writable };
  });
}

async function inspectDatabase(container: Record<string, unknown>): Promise<DatabaseIdentity> {
  const environment = readFields(container['Config'])['Env'];
  if (
    !Array.isArray(environment) ||
    environment.some((entry: unknown) => typeof entry !== 'string')
  )
    throw new Error('backend fence environment is malformed');
  const declarations = environment.filter(
    (entry: unknown): entry is string => typeof entry === 'string' && entry.startsWith('DB_PATH='),
  );
  // Proof: deleting cardinality admits duplicate-db-path through completion; its negative fails (exit 1).
  if (declarations.length !== 1) throw new Error('backend fence requires exactly one DB_PATH');
  const declaration = declarations.at(0);
  if (declaration === undefined) throw new Error('backend fence lost DB_PATH');
  const path = declaration.slice(8);
  const host = await resolveDatabaseHost(path, readMounts(container), realpath);
  const directory = await lstat(posix.dirname(host), { bigint: true });
  const file = await lstat(host, { bigint: true });
  if (!directory.isDirectory() || !file.isFile())
    throw new Error('backend fence database is not an ordinary directory/file family');
  return {
    path,
    host,
    directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
    fileIdentity: `${String(file.dev)}:${String(file.ino)}`,
  };
}

/**
 * Refuse known host-path/inode overlap, then require initialized actual namespace admission for
 * every unmanaged persistent mount, including Docker-read-only mounts and opaque host sources.
 * No host-source success, EACCES or ENOENT establishes exclusion. Shares the fence deadline and
 * exact candidate image; unsupported/stopped/unreadable/unclean sessions refuse without stopping writers.
 */
export async function auditUnmanagedMounts(
  containers: readonly unknown[],
  cohort: ManagedCohort,
  database: DatabaseIdentity,
  image: string,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
  resolveSource: (path: string) => Promise<string> = realpath,
): Promise<void> {
  const managed = COLORS.flatMap((color) => (cohort[color] === null ? [] : [cohort[color].id]));
  const familyDirectory = posix.dirname(database.host);
  const fileIdentities = new Set([database.fileIdentity]);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try {
      const file = await lstat(`${database.host}${suffix}`, { bigint: true });
      // Proof: removing file-kind validation admits directory sidecars; all three SQLite-sidecar negatives fail (exit 1).
      if (!file.isFile()) throw new Error('backend fence SQLite sidecar is not an ordinary file');
      fileIdentities.add(`${String(file.dev)}:${String(file.ino)}`);
    } catch (cause) {
      // Absent sidecars are expected SQLite lifecycle state; all other metadata failures refuse.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
  }
  for (const raw of containers) {
    const container = readFields(raw);
    const id = readIdentity(container['Id']);
    if (managed.includes(id)) continue;
    const mounts = readMounts(container);
    for (const mount of mounts) {
      if (!mount.writable || mount.type === 'tmpfs') continue;
      try {
        const source = await resolveSource(mount.source);
        const identity = await lstat(source, { bigint: true });
        // Proof: each direct file-hardlink negative refuses before namespace inspection;
        // removing this early check makes forbidden namespace admission observable despite its later refusal.
        if (fileIdentities.has(`${String(identity.dev)}:${String(identity.ino)}`))
          throw new Error('backend fence found an unmanaged writable database-family inode alias');
        if (
          source === familyDirectory ||
          source.startsWith(`${familyDirectory}/`) ||
          familyDirectory.startsWith(`${source.replace(/\/$/, '')}/`)
        )
          throw new Error('backend fence found an unmanaged writable database-family mount');
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          !('code' in cause) ||
          !['EACCES', 'ENOENT'].includes(String(cause.code))
        )
          throw cause;
        // Host absence/unreadability supplies no exclusion evidence. Mandatory namespace admission below owns recovery.
      }
    }
    if (mounts.length === 0) continue;
    await auditNamespace(
      container,
      mounts.map((mount) => mount.target),
      database,
      image,
      runDocker,
      deadline,
      namespaceProof,
      null,
    );
  }
}

/**
 * One complete Docker inventory proves both managed cohorts jointly. Caller owns deploy.lock.
 * The fresh gateway prerequisite and evidence binding are repeated at every backend observation.
 * DB family resolution validates the main/WAL/SHM/journal path ownership; dev/inode binds the main file
 * and directory while sidecar presence may legitimately change as the writers stop.
 */
async function observeBackendCohort(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
  binding: GatewayBinding,
  namespaceProof: typeof verifyContainerNamespace,
  performAudit: boolean,
): Promise<{ cohort: BackendCohort; inventory: unknown }> {
  const gateway = await inspectGatewayFenceUnderLock(layout, runDocker, deadline);
  // Proof: deleting byte binding accepts changed gateway-completion whitespace; read-only-inspection negative fails (exit 1).
  assertSame(binding, await gatewayBinding(layout), 'gateway evidence bytes');
  const observations: { cohort: BackendCohort; inventory: unknown }[] = [];
  await inspectManagedCohort(layout, runDocker, deadline, 'be', async (containers, cohort) => {
    const jointGateway = await inspectManagedInventory(
      layout,
      runDocker,
      deadline,
      containers.map((raw) => readIdentity(readFields(raw)['Id'])),
      containers,
      'gw',
    );
    assertSame(gateway.cohort, jointGateway, 'joint gateway cohort');
    assertExcluded(jointGateway);
    const combined: Record<string, unknown> = { blue: null, green: null };
    for (const color of COLORS) {
      const member = cohort[color];
      if (member === null) continue;
      const raw = containers.find((entry) => readFields(entry)['Id'] === member.id);
      combined[color] = { ...member, database: await inspectDatabase(readFields(raw)) };
    }
    const backends = parseBackendCohort(combined, layout);

    const database = backends.blue?.database ?? backends.green?.database;
    if (database === undefined) throw new Error('backend fence requires a database family');
    // Proof: deleting this audit admits the unmanaged-writer mount and effects; its negative fails (exit 1).
    const image = backends.blue?.imageRef ?? backends.green?.imageRef;
    if (image === undefined) throw new Error('backend fence lost pinned audit image');
    const inventory = inventoryIdentity(containers);
    if (performAudit) {
      await auditUnmanagedMounts(
        containers,
        cohort,
        database,
        image,
        runDocker,
        deadline,
        namespaceProof,
      );
      for (const color of COLORS) {
        const backend = backends[color];
        if (backend === null) continue;
        const raw = containers.find((entry) => readFields(entry)['Id'] === backend.id);
        // Proof: omitting managed census admits rebound Source and split-colour families; all three rebound lifecycle negatives fail (exit 1).
        await auditManagedMounts(
          raw,
          backend.database,
          backend.imageRef,
          runDocker,
          deadline,
          namespaceProof,
        );
      }
    }
    observations.push({ cohort: backends, inventory });
  });
  const cohort = observations.at(0);
  if (cohort === undefined) throw new Error('backend fence inventory did not complete');
  return cohort;
}

function inventoryIdentity(containers: readonly unknown[]): unknown {
  return containers
    .map((raw) => {
      const container = readFields(raw);
      const state = readFields(container['State']);
      return {
        id: readIdentity(container['Id']),
        name: container['Name'],
        image: container['Image'],
        config: container['Config'],
        host: container['HostConfig'],
        mounts: container['Mounts'],
        networks: readFields(container['NetworkSettings'])['Networks'],
        restarts: container['RestartCount'],
        process: {
          running: state['Running'],
          paused: state['Paused'],
          restarting: state['Restarting'],
          dead: state['Dead'],
          pid: state['Pid'],
          startedAt: state['StartedAt'],
        },
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Caller holds deploy.lock. Namespace audits never replace a fresh complete joint inventory readback. */
export async function inspectBackendCohort(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
  binding: GatewayBinding,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
): Promise<BackendCohort> {
  const before = await observeBackendCohort(
    layout,
    runDocker,
    deadline,
    binding,
    namespaceProof,
    true,
  );
  const after = await observeBackendCohort(
    layout,
    runDocker,
    deadline,
    binding,
    namespaceProof,
    false,
  );
  // Proof: removing fresh full-inventory equality admits new/missing members and mount/PID/start/restart drift; six production-path negatives fail.
  assertSame(
    before.inventory,
    after.inventory,
    'complete inventory identity after namespace audit',
  );
  assertSame(before.cohort, after.cohort, 'backend database/cohort after namespace audit');
  return after.cohort;
}

async function auditNamespace(
  container: unknown,
  destinations: readonly string[],
  database: DatabaseIdentity,
  image: string,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace,
  databasePath: string | null,
): Promise<void> {
  const id = readIdentity(readFields(container)['Id']);
  await assertCapturedDatabase(database);
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('backend fence namespace audit deadline exceeded');
  // Proof: opaque-source/hidden-RW/rebound-source production adapter cases require real initialized namespace receipts;
  // suppressing this invocation admits aliases and is caught by those negatives and the positive ACK count.
  try {
    await runDockerBefore(
      [],
      async () => {
        await namespaceProof(
          container,
          destinations,
          database.host,
          image,
          runDocker,
          databasePath,
          { totalMs: remaining, cleanupMs: Math.min(20000, remaining / 2) },
        );
        return '';
      },
      deadline,
    );
  } catch (cause) {
    throw new Error(
      `backend fence actual namespace audit refused for container ${id}; attended maintenance or a dedicated daemon required; no unrelated container was stopped: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  await assertCapturedDatabase(database);
}

async function assertCapturedDatabase(database: DatabaseIdentity): Promise<void> {
  const directory = await lstat(posix.dirname(database.host), { bigint: true });
  const file = await lstat(database.host, { bigint: true });
  if (!directory.isDirectory() || !file.isFile())
    throw new Error('backend fence captured database family is not regular');
  // Proof: removing the captured-family anchor admits before/after-census replacements; both managed identity negatives fail (exit 1).
  assertSame(
    { directory: database.directoryIdentity, file: database.fileIdentity },
    {
      directory: `${String(directory.dev)}:${String(directory.ino)}`,
      file: `${String(file.dev)}:${String(file.ino)}`,
    },
    'captured database family identity',
  );
}

/** Prove a running managed member's actual mounted family against the captured host inode, before/after census. */
export async function auditManagedMounts(
  container: unknown,
  database: DatabaseIdentity,
  image: string,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
): Promise<void> {
  await auditNamespace(
    container,
    readMounts(readFields(container)).map((mount) => mount.target),
    database,
    image,
    runDocker,
    deadline,
    namespaceProof,
    // Proof: null mode admits the blue-only rebound Source lifecycle negative (exit 1).
    database.path,
  );
}
