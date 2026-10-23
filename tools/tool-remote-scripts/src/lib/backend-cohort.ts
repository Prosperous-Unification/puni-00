import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { posix } from 'node:path';

import { type DatabaseMount, resolveDatabaseHost } from './backend-config';
import type { RunDocker } from './docker-deadline';
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
  const databases: Partial<Record<'blue' | 'green', DatabaseIdentity>> = {};
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
    return {
      type: readNonempty(mount['Type']),
      source: readNonempty(mount['Source']),
      target: readNonempty(mount['Destination']),
      writable: readBoolean(mount['RW']),
    };
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
  const directory = await lstat(posix.dirname(host));
  const file = await lstat(host);
  if (!directory.isDirectory() || !file.isFile())
    throw new Error('backend fence database is not an ordinary directory/file family');
  return {
    path,
    host,
    directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
    fileIdentity: `${String(file.dev)}:${String(file.ino)}`,
  };
}

async function refuseUnmanagedWriters(
  containers: readonly unknown[],
  cohort: ManagedCohort,
  database: DatabaseIdentity,
): Promise<void> {
  const managed = COLORS.flatMap((color) => (cohort[color] === null ? [] : [cohort[color].id]));
  const familyDirectory = posix.dirname(database.host);
  for (const raw of containers) {
    const container = readFields(raw);
    const id = readIdentity(container['Id']);
    if (managed.includes(id)) continue;
    for (const mount of readMounts(container)) {
      if (!mount.writable) continue;
      // Directory overlap is deliberately conservative: stopped/restartable foreign writers and
      // named-volume sources are refused too. Host processes and administrator actions remain outside this proof.
      const source = await realpath(mount.source);
      if (
        source === familyDirectory ||
        source.startsWith(`${familyDirectory}/`) ||
        familyDirectory.startsWith(`${source.replace(/\/$/, '')}/`)
      )
        throw new Error('backend fence found an unmanaged writable database-family mount');
    }
  }
}

/**
 * One complete Docker inventory proves both managed cohorts jointly. Caller owns deploy.lock.
 * The fresh gateway prerequisite and evidence binding are repeated at every backend observation.
 * DB family resolution validates the main/WAL/SHM/journal path ownership; dev/inode binds the main file
 * and directory while sidecar presence may legitimately change as the writers stop.
 */
export async function inspectBackendCohort(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
  binding: GatewayBinding,
): Promise<BackendCohort> {
  const gateway = await inspectGatewayFenceUnderLock(layout, runDocker, deadline);
  // Proof: deleting byte binding accepts changed gateway-completion whitespace; read-only-inspection negative fails (exit 1).
  assertSame(binding, await gatewayBinding(layout), 'gateway evidence bytes');
  const observations: BackendCohort[] = [];
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
    observations.push(backends);
    const database = backends.blue?.database ?? backends.green?.database;
    if (database === undefined) throw new Error('backend fence requires a database family');
    // Proof: deleting this audit admits the unmanaged-writer mount and effects; its negative fails (exit 1).
    await refuseUnmanagedWriters(containers, cohort, database);
  });
  const cohort = observations.at(0);
  if (cohort === undefined) throw new Error('backend fence inventory did not complete');
  return cohort;
}
