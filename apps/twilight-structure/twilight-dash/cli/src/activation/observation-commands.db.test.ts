import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { type DashDependencies, runDashArguments } from '../cli';
import { openActivationController } from './controller';
import { ObservationStoreError, type ObservationStoreFailure } from './observation-commands';
import { readObservationStateConfig } from './observation-service';
import { initializeObservationState } from './observation-state';
import {
  type ObservationServiceConfiguration,
  writeObservationServiceConfiguration,
} from './testing/observation-service-configuration';

const FIXED_CLOCK = { read: () => 1_000_000 };
const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { force: true, recursive: true });
});

function service(createState = true): ObservationServiceConfiguration {
  const configuration = writeObservationServiceConfiguration(undefined, createState);
  scratch.push(configuration.root);
  return configuration;
}

function capturingDependencies(): { readonly deps: DashDependencies; readonly output: string[] } {
  const output: string[] = [];
  return {
    output,
    deps: {
      clock: FIXED_CLOCK,
      monotonic: { now: () => 0 },
      planEnrollment: () => Promise.reject(new Error('store commands never plan enrollment')),
      stdout: {
        write: (text: string) => {
          output.push(text);
        },
      },
    },
  };
}

async function refusalOf(argv: readonly string[]): Promise<{
  readonly refusal: Error;
  readonly output: readonly string[];
}> {
  const { deps, output } = capturingDependencies();
  try {
    await runDashArguments(argv, deps);
  } catch (cause) {
    if (cause instanceof Error) return { refusal: cause, output };
    throw new Error('Dash did not return an Error', { cause });
  }
  throw new Error(`Dash accepted ${argv[0]} and printed ${output.join('').trim()}`);
}

async function storeFailure(argv: readonly string[]): Promise<ObservationStoreFailure> {
  const { refusal, output } = await refusalOf(argv);
  expect(output).toEqual([]);
  if (!(refusal instanceof ObservationStoreError)) throw refusal;
  return refusal.failure;
}

function userVersion(databasePath: string): unknown {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.query('PRAGMA user_version').get();
  } finally {
    database.close();
  }
}

function createVersionEight(configuration: ObservationServiceConfiguration): void {
  const config = readObservationStateConfig(configuration.configurationPath, FIXED_CLOCK);
  openActivationController({
    databasePath: configuration.databasePath,
    bootstrapPath: config.bootstrapPath,
    pin: config.pin,
    clock: config.clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.reject(new Error('fixture has no provider read')),
    selectObligations: () => {
      throw new Error('fixture has no evaluation');
    },
  }).close();
  chmodSync(configuration.databasePath, 0o600);
}

test('bootstrap-observation creates a v10 store once and refuses the second time', async () => {
  const configuration = service();
  const first = capturingDependencies();
  await runDashArguments(['bootstrap-observation', configuration.configurationPath], first.deps);
  expect(first.output).toEqual([
    `${JSON.stringify({ path: configuration.databasePath, status: 'bootstrapped', version: 10 })}\n`,
  ]);
  expect(userVersion(configuration.databasePath)).toEqual({ user_version: 10 });
  const before = readFileSync(configuration.databasePath);
  expect(await storeFailure(['bootstrap-observation', configuration.configurationPath])).toBe(
    'exists',
  );
  expect(readFileSync(configuration.databasePath)).toEqual(before);
});

test('migrate-observation steps a v8 store through v9 to v10', async () => {
  const configuration = service();
  createVersionEight(configuration);
  const migrated = capturingDependencies();
  await runDashArguments(['migrate-observation', configuration.configurationPath], migrated.deps);
  expect(migrated.output).toEqual([
    `${JSON.stringify({ path: configuration.databasePath, status: 'migrated', from: 8, to: 10 })}\n`,
  ]);
  expect(userVersion(configuration.databasePath)).toEqual({ user_version: 10 });
});

test('migrate-observation steps a v9 store to v10', async () => {
  const configuration = service();
  expect(
    await initializeObservationState(
      readObservationStateConfig(configuration.configurationPath, FIXED_CLOCK),
    ),
  ).toBe('initialized');
  const migrated = capturingDependencies();
  await runDashArguments(['migrate-observation', configuration.configurationPath], migrated.deps);
  expect(migrated.output).toEqual([
    `${JSON.stringify({ path: configuration.databasePath, status: 'migrated', from: 9, to: 10 })}\n`,
  ]);
  expect(userVersion(configuration.databasePath)).toEqual({ user_version: 10 });
});

test('migrate-observation refuses a current store unchanged', async () => {
  const configuration = service();
  await runDashArguments(
    ['bootstrap-observation', configuration.configurationPath],
    capturingDependencies().deps,
  );
  const before = readFileSync(configuration.databasePath);
  expect(await storeFailure(['migrate-observation', configuration.configurationPath])).toBe(
    'current',
  );
  expect(readFileSync(configuration.databasePath)).toEqual(before);
});

test('migrate-observation refuses unsupported versions and foreign stores unchanged', async () => {
  const seven = service();
  createVersionEight(seven);
  const database = new Database(seven.databasePath, { strict: true });
  database.run('PRAGMA user_version = 7');
  database.close();
  const sevenBytes = readFileSync(seven.databasePath);
  expect(await storeFailure(['migrate-observation', seven.configurationPath])).toBe(
    'unsupported-version',
  );
  expect(readFileSync(seven.databasePath)).toEqual(sevenBytes);

  const foreign = service();
  const other = new Database(foreign.databasePath, { create: true, strict: true });
  other.run('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
  other.run('PRAGMA user_version = 9');
  other.close();
  chmodSync(foreign.databasePath, 0o600);
  const foreignBytes = readFileSync(foreign.databasePath);
  expect(await storeFailure(['migrate-observation', foreign.configurationPath])).toBe(
    'unsupported-version',
  );
  expect(readFileSync(foreign.databasePath)).toEqual(foreignBytes);
});

test('a store SQLite cannot read is unreadable, not absent or unsupported', async () => {
  const configuration = service();
  writeFileSync(configuration.databasePath, 'not a database, sixteen bytes or more', {
    mode: 0o600,
  });
  const { refusal } = await refusalOf(['migrate-observation', configuration.configurationPath]);
  expect(refusal).toBeInstanceOf(ObservationStoreError);
  expect(refusal instanceof ObservationStoreError ? refusal.failure : undefined).toBe('unreadable');
  expect(refusal.message).toBe(
    `observation store unreadable: ${configuration.databasePath}: SQLITE_NOTADB`,
  );
});

test('a search-denied state directory is unreadable, not absent', async () => {
  if (process.getuid?.() === 0) throw new Error('unreadable-store proofs require a non-root uid');
  for (const command of ['bootstrap-observation', 'migrate-observation']) {
    const configuration = service();
    chmodSync(configuration.stateDirectory, 0o600);
    try {
      const { refusal } = await refusalOf([command, configuration.configurationPath]);
      expect(refusal instanceof ObservationStoreError ? refusal.failure : refusal, command).toBe(
        'unreadable',
      );
      expect(refusal.message, command).toBe(
        `observation store unreadable: ${configuration.databasePath}: EACCES`,
      );
    } finally {
      chmodSync(configuration.stateDirectory, 0o700);
    }
    expect(readdirSync(configuration.stateDirectory), command).toEqual([]);
  }
});

test('refused store commands create nothing', async () => {
  const absentStore = service();
  const absentStoreFailure = await storeFailure([
    'migrate-observation',
    absentStore.configurationPath,
  ]);
  expect(readdirSync(absentStore.stateDirectory)).toEqual([]);
  expect(absentStoreFailure).toBe('absent');

  const absentDirectory = service(false);
  const absentDirectoryFailure = await storeFailure([
    'migrate-observation',
    absentDirectory.configurationPath,
  ]);
  expect(existsSync(absentDirectory.stateDirectory)).toBe(false);
  expect(absentDirectoryFailure).toBe('absent');
  const { refusal, output } = await refusalOf([
    'bootstrap-observation',
    absentDirectory.configurationPath,
  ]);
  expect(output).toEqual([]);
  expect(refusal.message).toBe(
    `observation protected path absent: ${absentDirectory.stateDirectory}`,
  );
  expect(existsSync(absentDirectory.stateDirectory)).toBe(false);

  const established = service();
  await runDashArguments(
    ['bootstrap-observation', established.configurationPath],
    capturingDependencies().deps,
  );
  const listing = readdirSync(established.stateDirectory).sort();
  expect(listing).toEqual(['activation.sqlite', 'observation.lock']);
  expect(await storeFailure(['bootstrap-observation', established.configurationPath])).toBe(
    'exists',
  );
  expect(await storeFailure(['migrate-observation', established.configurationPath])).toBe(
    'current',
  );
  expect(readdirSync(established.stateDirectory).sort()).toEqual(listing);
});

test('store commands refuse grammar faults before any state', async () => {
  const configuration = service();
  const cases: readonly (readonly string[])[] = [
    ['bootstrap-observation'],
    ['bootstrap-observation', configuration.configurationPath, 'extra'],
    ['bootstrap-observation', '--force'],
    ['migrate-observation'],
    ['migrate-observation', configuration.configurationPath, 'extra'],
    ['migrate-observation', '--to', '10'],
  ];
  for (const argv of cases) {
    const { refusal, output } = await refusalOf(argv);
    expect(refusal.message, argv.join(' ')).toBe(`usage: twilight-dash ${argv[0]} <service.json>`);
    expect(output, argv.join(' ')).toEqual([]);
    expect(readdirSync(configuration.stateDirectory), argv.join(' ')).toEqual([]);
  }
});
