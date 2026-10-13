import { closeSync, constants, openSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { openConnection } from '@wbs/store-sqlite/db';
import { readSharedPeopleBackup } from '@wbs/store-sqlite/shared-people-backup';
import { diagnoseSharedPeopleRestore } from '@wbs/store-sqlite/shared-people-restore-diagnostics';
import { restoreSharedPeople } from '@wbs/store-sqlite/shared-people-rollback';
import { dlopen } from 'bun:ffi';

const { symbols } = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', {
  flock: { args: ['i32', 'i32'], returns: 'i32' },
});

export interface HostRestoreRequest {
  backup: string;
  operationId?: string;
  approvalIds: readonly string[];
}
export interface HostRestorePaths {
  database: string;
  lock: string;
  docker: string;
}
interface Mount {
  source: string;
  destination: string;
  writable: boolean;
}
interface Container {
  id: string;
  name: string;
  stopped: boolean;
  environment: readonly string[];
  mounts: readonly Mount[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseContainer(value: unknown): Container {
  // Proof: removing the shape boundary changed named malformed-container refusals to later errors.
  if (
    !isRecord(value) ||
    typeof value['Id'] !== 'string' ||
    typeof value['Name'] !== 'string' ||
    !isRecord(value['State']) ||
    !isRecord(value['Config']) ||
    !Array.isArray(value['Mounts'])
  )
    throw new Error('invalid Docker container inspection');
  const state = value['State'];
  const environment: unknown = value['Config']['Env'];
  // Proof: removing this state/environment boundary failed the invalid-state and null-Env inventory cases.
  if (
    typeof state['Running'] !== 'boolean' ||
    typeof state['Paused'] !== 'boolean' ||
    typeof state['Restarting'] !== 'boolean' ||
    typeof state['Status'] !== 'string' ||
    !Array.isArray(environment) ||
    !environment.every((entry: unknown): entry is string => typeof entry === 'string')
  )
    throw new Error('invalid Docker container state/environment');
  const mounts = value['Mounts'].map((mount: unknown): Mount => {
    // Proof: removing mount validation lost the named invalid-mount refusal in the inspected-inventory case.
    if (
      !isRecord(mount) ||
      typeof mount['Source'] !== 'string' ||
      !isAbsolute(mount['Source']) ||
      typeof mount['Destination'] !== 'string' ||
      !isAbsolute(mount['Destination']) ||
      typeof mount['RW'] !== 'boolean' ||
      (mount['Type'] !== 'bind' && mount['Type'] !== 'volume')
    )
      throw new Error('invalid Docker mount inspection');
    return { source: mount['Source'], destination: mount['Destination'], writable: mount['RW'] };
  });
  return {
    id: value['Id'],
    name: value['Name'],
    stopped:
      !state['Running'] &&
      !state['Paused'] &&
      !state['Restarting'] &&
      ['created', 'exited', 'dead'].includes(state['Status']),
    environment,
    mounts,
  };
}
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..' + '/') && path !== '..' && !isAbsolute(path));
}
async function queryDocker(docker: string, args: string[]): Promise<string> {
  const child = Bun.spawn([docker, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  // Proof: bypassing the exit check lost the named docker-ps refusal for the exit-17 inspector.
  if (exit !== 0) throw new Error(`docker ${args[0]} failed (${String(exit)}): ${stderr}`);
  return stdout;
}

/** Refuses incomplete inspection, foreign database identity and every active writable mount over it. */
async function fenceContainers(paths: HostRestorePaths): Promise<void> {
  const database = await realpath(paths.database);
  const identity = await stat(database);
  // Proof: bypassing the file check lost the directory-database refusal before Docker admission.
  if (!identity.isFile()) throw new Error('host restore database is not a file');
  const ids = (await queryDocker(paths.docker, ['ps', '--all', '--quiet', '--no-trunc']))
    .trim()
    .split(/\s+/)
    .filter((id) => id !== '');
  // Proof: bypassing empty/duplicate IDs lost their inventory refusal before inspect.
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    throw new Error('Docker inventory is empty or duplicated');
  const inspection: unknown = JSON.parse(await queryDocker(paths.docker, ['inspect', ...ids]));
  // Proof: bypassing array validation changed the named object-inspection refusal into a map error.
  if (!Array.isArray(inspection)) throw new Error('invalid Docker inventory inspection');
  const containers = inspection.map((entry: unknown) => parseContainer(entry));
  // Proof: bypassing inventory equality admitted empty/duplicated inspections in the named inventory negatives.
  if (
    containers.length !== ids.length ||
    new Set(containers.map((container) => container.id)).size !== ids.length ||
    new Set(containers.map((container) => container.name)).size !== ids.length ||
    containers.some((container) => !ids.includes(container.id))
  )
    throw new Error('Docker inventory inspection is incomplete');
  for (const name of ['/be-01-blue', '/be-01-green']) {
    const colour = containers.find((container) => container.name === name);
    // Proof: bypassing colour existence lost the named missing-green refusal in the boundary case.
    if (colour === undefined) throw new Error(`required colour is absent: ${name}`);
    const configured = colour.environment.filter((entry) => entry.startsWith('DB_PATH='));
    const databasePath = configured.at(0)?.slice('DB_PATH='.length);
    // Proof: accepting /data/../data/test.db failed the noncanonical DB_PATH negative.
    if (
      configured.length !== 1 ||
      databasePath === undefined ||
      !isAbsolute(databasePath) ||
      resolve(databasePath) !== databasePath
    )
      throw new Error(`invalid DB_PATH for ${name}`);
    const mounts = colour.mounts.filter((mount) => contains(mount.destination, databasePath));
    // Nested mounts obscure a parent; one unambiguous writable mapping is required.
    mounts.sort((left, right) => right.destination.length - left.destination.length);
    const mount = mounts.at(0);
    // Proof: separately bypassing writable/ambiguous mapping admitted readonly and duplicate mount fixtures.
    if (mount === undefined || !mount.writable || mounts.at(1)?.destination === mount.destination)
      throw new Error(`database writable mount missing or ambiguous: ${name}`);
    const mounted = await stat(
      await realpath(resolve(mount.source, relative(mount.destination, databasePath))),
    );
    // Proof: bypassing physical identity restored through green's distinct existing database inode.
    if (!mounted.isFile() || mounted.dev !== identity.dev || mounted.ino !== identity.ino)
      throw new Error(`database identity differs: ${name}`);
    // Proof: bypassing this shutdown guard admitted the running-green hardlink negative before the writer opener.
    if (!colour.stopped) throw new Error(`writable container is not stopped: ${name}`);
  }
  for (const container of containers) {
    // Both named colours have already passed unconditional shutdown and physical identity checks.
    if (container.name === '/be-01-blue' || container.name === '/be-01-green') continue;
    for (const mount of container.mounts) {
      if (!mount.writable) continue;
      const source = await realpath(mount.source);
      const mounted = await stat(source);
      const covers =
        contains(source, database) ||
        // Proof: removing same-device directory exclusion admitted the mounted third-writer hardlink negative with both colours stopped.
        (mounted.isDirectory() && mounted.dev === identity.dev) ||
        (mounted.dev === identity.dev && mounted.ino === identity.ino);
      // Proof: bypassing active-writer refusal admitted the third mounted writer before the restore transaction.
      if (covers && !container.stopped)
        throw new Error(`writable container is not stopped: ${container.name}`);
    }
  }
}

/**
 * Owns one nonblocking host flock through backup read, Docker fencing and the SQLite restore.
 * No child writes or rereads the backup. SIGKILL closes this process's lock and SQLite writer.
 * Shared backups still refuse through the release capability guard after read-only diagnostics.
 */
export async function restoreSharedPeopleOnHost(
  request: HostRestoreRequest,
  paths: HostRestorePaths,
) {
  const descriptor = openSync(paths.lock, constants.O_RDWR | constants.O_CREAT, 0o644);
  try {
    // Proof: bypassing flock admitted the rival while the actual SQLite restore process held its writer.
    if (symbols.flock(descriptor, 2 | 4) !== 0)
      throw new Error(`deploy lock held or unavailable: ${paths.lock}`);
    const backup: unknown = JSON.parse(await readFile(request.backup, 'utf8'));
    // Proof: rereading at the writer failed when the inspection subprocess replaced this pathname with malformed JSON.
    const saved = readSharedPeopleBackup(backup);
    await fenceContainers(paths);
    diagnoseSharedPeopleRestore(paths.database, request, saved);
    // Proof: bypassing this pre-opener refusal changed DELETE to WAL in the valid-consent shared negative.
    if (saved.organizations.some((organization) => organization.mode === 'shared'))
      throw new Error('unsupported capacity mode shared; restore requires a compatible release');
    const connection = openConnection(paths.database);
    try {
      return restoreSharedPeople(connection.db, saved, Date.now());
    } finally {
      connection.close();
    }
  } finally {
    closeSync(descriptor);
  }
}
