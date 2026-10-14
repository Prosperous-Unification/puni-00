import { lstat } from 'node:fs/promises';
import { posix } from 'node:path';

import { containerName, NETWORK } from './docker';
import type { Color } from './state';

/** Host bind identity and container destination at the Docker/Compose boundary. */
export interface DatabaseMount {
  type: string;
  source: string;
  target: string;
  writable: boolean;
}

/** Effective database identity of the fully merged candidate configuration. */
export interface BackendConfig {
  databasePath: string;
  databaseHostPath: string;
}

function readRecord(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${description} is malformed`);
  const entries: [string, unknown][] = Object.keys(value).map((key) => [
    key,
    Reflect.get(value, key),
  ]);
  return Object.fromEntries(entries);
}

/**
 * Prove one ordinary directory bind owns the complete SQLite family. File binds,
 * shadowed sidecars and basename symlinks cannot establish the same WAL identity
 * as the fixed read-only probe mount, even when the main file resolves identically.
 */
export async function resolveDatabaseHost(
  databasePath: string,
  mounts: readonly DatabaseMount[],
  resolvePath: (path: string) => Promise<string>,
): Promise<string> {
  if (!/^\/[A-Za-z0-9_./-]+$/.test(databasePath) || posix.normalize(databasePath) !== databasePath)
    throw new Error('database path is not an absolute normalized file path');
  const matching = mounts.filter(
    (mount) =>
      databasePath === mount.target ||
      databasePath.startsWith(`${mount.target.replace(/\/$/, '')}/`),
  );
  // Proof: omitting specificity ordering admitted a candidate file-bind override and failed both resolution negatives.
  matching.sort((left, right) => right.target.length - left.target.length);
  const selected = matching.at(0);
  if (selected?.type !== 'bind' || !selected.writable)
    throw new Error('database path is not owned by a writable host bind');
  if (matching.at(1)?.target === selected.target)
    throw new Error('database path has ambiguous bind destinations');
  if (!selected.source.startsWith('/') || !selected.target.startsWith('/'))
    throw new Error('database bind paths are not absolute');
  const directory = posix.dirname(databasePath);
  const basename = posix.basename(databasePath);
  // Proof: removing family mount equality admitted main/WAL/SHM/journal file shadows;
  // all four production resolver negatives failed before writer stop.
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const familyPath = `${databasePath}${suffix}`;
    const ownership = mounts.filter(
      (mount) =>
        familyPath === mount.target || familyPath.startsWith(`${mount.target.replace(/\/$/, '')}/`),
    );
    ownership.sort((left, right) => right.target.length - left.target.length);
    if (
      selected.target === databasePath ||
      ownership.at(0) !== selected ||
      ownership.at(1)?.target === selected.target
    )
      throw new Error('database family has a file bind or shadowed sidecar');
  }
  const hostDirectory = await resolvePath(
    posix.join(selected.source, posix.relative(selected.target, directory)),
  );
  const hostFile = posix.join(hostDirectory, basename);
  // Proof: omitting canonical family equality admitted renamed main-file aliases and redirected WAL; both negatives failed.
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const expected = `${hostFile}${suffix}`;
    let actual: string;
    try {
      actual = await resolvePath(expected);
    } catch (cause) {
      if (suffix !== '' && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
        // Proof: accepting every realpath ENOENT admitted a dangling WAL symlink; the production resolver negative failed.
        try {
          await lstat(expected);
        } catch (absence) {
          if (absence instanceof Error && 'code' in absence && absence.code === 'ENOENT') continue;
          throw absence;
        }
        throw new Error('database family has an unresolved sidecar', { cause });
      }
      throw cause;
    }
    if (actual !== expected) throw new Error('database family has an aliased file');
  }
  return hostFile;
}

/**
 * Prove the candidate's effective merged configuration before any container start.
 * Only its own network identity is admitted; published ports, dependencies and
 * inherited exposure aliases cannot be carried into a restarted idle colour.
 */
export async function inspectBackendConfig(
  output: string,
  color: Color,
  image: string,
  resolvePath: (path: string) => Promise<string>,
): Promise<BackendConfig> {
  const parsed: unknown = JSON.parse(output);
  const config = readRecord(parsed, 'merged Compose configuration');
  const services = readRecord(config['services'], 'merged Compose services');
  const name = containerName('be', color);
  const service = readRecord(services[name], 'merged backend service');
  const unsafe = (detail: string): never => {
    throw new Error(`unsafe candidate Compose configuration: ${detail}`);
  };
  if (service['container_name'] !== name || service['image'] !== image)
    unsafe('identity or image differs');
  // Proof: omitting ports/dependencies failed four effective-config refusal tests before startup.
  for (const key of [
    'ports',
    'depends_on',
    'links',
    'external_links',
    'volumes_from',
    'env_file',
  ]) {
    const value = service[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      key === 'depends_on' &&
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).length === 0
    )
      continue;
    unsafe(`${key} can expose or start another service`);
  }
  if (service['network_mode'] !== undefined) unsafe('network_mode bypasses the managed network');
  const networks = readRecord(service['networks'], 'candidate networks');
  if (Object.keys(networks).length !== 1 || networks[NETWORK] === undefined)
    unsafe('unexpected networks');
  const attachment = readRecord(networks[NETWORK], 'candidate network attachment');
  // Proof: omitting alias membership admitted be-01.internal in the merged config; both direct and preparation negatives failed.
  const aliases = attachment['aliases'];
  if (
    aliases !== undefined &&
    (!Array.isArray(aliases) || aliases.some((alias: unknown) => alias !== name))
  )
    unsafe('unexpected network alias');
  const environment = readRecord(service['environment'], 'candidate environment');
  const databasePath = environment['DB_PATH'];
  if (typeof databasePath !== 'string')
    throw new Error('candidate DB_PATH is missing or malformed');
  const volumes = service['volumes'];
  if (!Array.isArray(volumes)) throw new Error('candidate bind volumes are missing or malformed');
  const mounts = volumes.map((volume: unknown): DatabaseMount => {
    const mount = readRecord(volume, 'candidate volume');
    const type = mount['type'];
    const source = mount['source'];
    const target = mount['target'];
    const readonly = mount['read_only'];
    if (
      typeof type !== 'string' ||
      typeof source !== 'string' ||
      typeof target !== 'string' ||
      (readonly !== undefined && typeof readonly !== 'boolean')
    )
      throw new Error('candidate volume is malformed');
    return { type, source, target, writable: readonly !== true };
  });
  return {
    databasePath,
    databaseHostPath: await resolveDatabaseHost(databasePath, mounts, resolvePath),
  };
}

/** Force a new container from the proven snapshot without starting dependencies or pulling after the outage. */
export function backendStartArgs(
  snapshotPath: string,
  serviceName: string,
  projectDirectory: string,
): string[] {
  return [
    'compose',
    '--project-directory',
    projectDirectory,
    '-f',
    snapshotPath,
    'up',
    '-d',
    // Proof: removing this flag reused the stopped idle ID in the disposable Docker regression (exit1, cleanup verified).
    '--force-recreate',
    // Proof: removing this flag started the fixture dependency in the disposable Docker regression (exit1, cleanup verified).
    '--no-deps',
    '--pull',
    'never',
    serviceName,
  ];
}
