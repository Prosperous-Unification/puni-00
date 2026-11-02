import { lstatSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import type { WallClock } from '../clock';
import { readObservationStateConfig } from './observation-service';
import {
  initializeObservationState,
  migrateObservationRecoveryState,
  migrateObservationState,
  type ObservationStateConfig,
} from './observation-state';

/** The store version every current reader requires; `bootstrap-observation` creates it. */
export const OBSERVATION_STORE_VERSION = 10;

/** Why a store command refused; each kind is a different operator decision. */
export type ObservationStoreFailure =
  'absent' | 'unreadable' | 'exists' | 'current' | 'unsupported-version';

/**
 * A typed refusal of `bootstrap-observation` or `migrate-observation`, raised before the command
 * takes the observation lock. `unreadable` carries the filesystem or SQLite code and is never
 * treated as absent.
 */
export class ObservationStoreError extends Error {
  readonly failure: ObservationStoreFailure;

  constructor(failure: ObservationStoreFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ObservationStoreError';
    this.failure = failure;
  }
}

/** What a store command reaches besides its arguments. */
export interface ObservationCommandDependencies {
  readonly clock: WallClock;
  readonly write: (text: string) => void;
}

export const bootstrapUsage = 'usage: twilight-dash bootstrap-observation <service.json>';
export const migrateUsage = 'usage: twilight-dash migrate-observation <service.json>';

/** Each step moves the store from `from` to `from + 1` under the observation lock. */
const migrationSteps = [
  { from: 8, run: migrateObservationState },
  { from: 9, run: migrateObservationRecoveryState },
] as const;

function serviceArgument(argv: readonly string[], usage: string): string {
  const [configurationPath] = argv;
  // Proof: loosening this to `argv.length === 0` made `store commands refuse grammar faults before
  // any state` observe Dash accept `bootstrap-observation <service.json> extra` and print
  // `"status":"bootstrapped"`; dropping the `--` test made `bootstrap-observation --force` reach
  // the configuration read (`observation service configuration unavailable`) (2026-10-12).
  if (argv.length !== 1 || configurationPath.startsWith('--')) throw new Error(usage);
  return configurationPath;
}

function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
}

/** `true` when the store file exists; ENOENT is `false`, any other failure is `unreadable`. */
function isStorePresent(databasePath: string): boolean {
  try {
    lstatSync(databasePath);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    // Proof: mapping every lstat failure to absence made `a search-denied state directory is
    // unreadable, not absent` see bootstrap reach the lock and refuse `observation protected path
    // malformed` instead of `unreadable` with EACCES (2026-10-12).
    throw new ObservationStoreError(
      'unreadable',
      `observation store unreadable: ${databasePath}: ${errorCode(error)}`,
      { cause: error },
    );
  }
}

/**
 * Reads `user_version` through a read-only handle that never creates the file.
 *
 * @throws ObservationStoreError `unreadable` when SQLite cannot read the file, and
 * `unsupported-version` for a version other than 8, 9 or 10 or a file without the controller's
 * `activation_request` table.
 */
function readStoreVersion(databasePath: string): number {
  let version: number;
  let hasActivationTables: boolean;
  try {
    // Read-only never creates; alone its removal is masked by the presence check above.
    const database = new Database(databasePath, { readonly: true, strict: true });
    try {
      const raw: unknown = database.query('PRAGMA user_version').get();
      version = parseOrThrow(type({ user_version: 'number.integer>=0' }), raw).user_version;
      hasActivationTables =
        database
          .query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'activation_request'")
          .get() !== null;
    } finally {
      database.close();
    }
  } catch (error) {
    throw new ObservationStoreError(
      'unreadable',
      `observation store unreadable: ${databasePath}: ${errorCode(error)}`,
      { cause: error },
    );
  }
  // Proof: deleting this check made `migrate-observation refuses unsupported versions and foreign
  // stores unchanged` receive the untyped `observation state partial: activation_request`
  // (2026-10-12).
  if (!hasActivationTables) {
    throw new ObservationStoreError(
      'unsupported-version',
      `observation store has no activation tables: ${databasePath}`,
    );
  }
  // Proof: deleting this check made the same test receive the untyped `observation migration
  // requires version 8` for a version-7 store (2026-10-12).
  if (version !== 8 && version !== 9 && version !== OBSERVATION_STORE_VERSION) {
    throw new ObservationStoreError(
      'unsupported-version',
      `observation store version unsupported: ${databasePath}: ${String(version)}`,
    );
  }
  return version;
}

function storePath(config: ObservationStateConfig): string {
  return join(config.stateDirectory, 'activation.sqlite');
}

function requireOwned(outcome: 'initialized' | 'migrated' | 'busy', databasePath: string): void {
  if (outcome === 'busy') {
    throw new Error(`observation store busy: another process holds the lock for ${databasePath}`);
  }
}

/**
 * Creates the v10 observation store named by the service configuration and prints its path. It is
 * the existing initialization (v9 under the lock) followed by the existing recovery migration
 * (v10 under the lock); a crash between them leaves a v9 store that `migrate-observation`
 * finishes.
 *
 * @throws Error with the usage line before any read when the grammar is wrong;
 * ObservationStoreError `exists` or `unreadable` before the lock is taken.
 */
export async function bootstrapObservationCommand(
  argv: readonly string[],
  { clock, write }: ObservationCommandDependencies,
): Promise<void> {
  const config = readObservationStateConfig(serviceArgument(argv, bootstrapUsage), clock);
  const databasePath = storePath(config);
  // Proof: deleting this check made `bootstrap-observation creates a v10 store once and refuses
  // the second time` receive the untyped `observation state already exists` (2026-10-12).
  if (isStorePresent(databasePath)) {
    throw new ObservationStoreError('exists', `observation store already exists: ${databasePath}`);
  }
  requireOwned(await initializeObservationState(config), databasePath);
  requireOwned(await migrateObservationRecoveryState(config), databasePath);
  write(
    `${JSON.stringify({ path: databasePath, status: 'bootstrapped', version: OBSERVATION_STORE_VERSION })}\n`,
  );
}

/**
 * Steps the observation store from version 8 or 9 to 10 with the existing migrations, each under
 * the lock, and prints `migrated` with both versions.
 *
 * @throws Error with the usage line before any read when the grammar is wrong;
 * ObservationStoreError `absent`, `unreadable`, `current` or `unsupported-version` before the lock
 * is taken.
 */
export async function migrateObservationCommand(
  argv: readonly string[],
  { clock, write }: ObservationCommandDependencies,
): Promise<void> {
  const config = readObservationStateConfig(serviceArgument(argv, migrateUsage), clock);
  const databasePath = storePath(config);
  // Proof: deleting this presence check made `refused store commands create nothing` receive
  // `unreadable` instead of `absent`; deleting it and the read-only flag below together left
  // `activation.sqlite` in the state directory (2026-10-12).
  if (!isStorePresent(databasePath)) {
    throw new ObservationStoreError(
      'absent',
      `observation store absent: ${databasePath}; run \`twilight-dash bootstrap-observation <service.json>\` to create it`,
    );
  }
  const from = readStoreVersion(databasePath);
  // Proof: deleting this check made `migrate-observation refuses a current store unchanged` fail
  // with `Dash accepted migrate-observation and printed {"path":…,"status":"migrated","from":10,
  // "to":10}` (2026-10-12).
  if (from === OBSERVATION_STORE_VERSION) {
    throw new ObservationStoreError(
      'current',
      `observation store already current at version ${String(OBSERVATION_STORE_VERSION)}: ${databasePath}`,
    );
  }
  for (const step of migrationSteps) {
    if (step.from >= from) requireOwned(await step.run(config), databasePath);
  }
  write(
    `${JSON.stringify({ path: databasePath, status: 'migrated', from, to: OBSERVATION_STORE_VERSION })}\n`,
  );
}
