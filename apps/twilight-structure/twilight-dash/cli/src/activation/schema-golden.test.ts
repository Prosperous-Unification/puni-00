import { chmodSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { runDashArguments } from '../cli';
import { ObservationStoreError } from './observation-commands';
import { readObservationStateConfig } from './observation-service';
import { withRecoveryObservation } from './observation-state';
import {
  type ObservationServiceInputs,
  writeObservationServiceConfiguration,
} from './testing/observation-service-configuration';

const FIXTURES = join(import.meta.dir, '..', '..', 'fixtures', 'activation');
const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { force: true, recursive: true });
});

/** The pre-relocation store's rows and the service inputs it was written under. */
interface RecordedStore extends ObservationServiceInputs {
  readonly attempts: unknown[];
  readonly recovery: { readonly next_attempt_at: number };
  readonly schedule: { readonly attempt_sequence: number };
  readonly version: unknown;
}

/** Statements with whitespace runs collapsed, so only a token change can differ. */
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/\s+/g, ' ').replace(/;$/, '').trim())
    .filter((statement) => statement.length > 0);
}

function dependencies(output: string[], now: number) {
  return {
    clock: { read: () => now },
    monotonic: { now: () => 0 },
    planEnrollment: () => Promise.reject(new Error('the golden never plans enrollment')),
    stdout: {
      write: (text: string) => {
        output.push(text);
      },
    },
  };
}

/** Writes a service configuration for `inputs` and loads `dump` as its store. */
function restore(inputs: ObservationServiceInputs, dump: string) {
  const configuration = writeObservationServiceConfiguration(inputs);
  scratch.push(configuration.root);
  const database = new Database(configuration.databasePath, { create: true, strict: true });
  try {
    database.run(dump);
  } finally {
    database.close();
  }
  chmodSync(configuration.databasePath, 0o600);
  return configuration;
}

test('the relocated schema equals the v10 golden text', async () => {
  const configuration = writeObservationServiceConfiguration();
  scratch.push(configuration.root);
  await runDashArguments(
    ['bootstrap-observation', configuration.configurationPath],
    dependencies([], 1_000_000),
  );
  const database = new Database(configuration.databasePath, { readonly: true });
  const schema = database
    .query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_schema WHERE substr(name, 1, 7) <> 'sqlite_' ORDER BY rowid",
    )
    .all()
    .map(({ sql }) => sql);
  const version = database
    .query<{ user_version: number }, []>('PRAGMA user_version')
    .all()
    .map(({ user_version }) => `PRAGMA user_version=${String(user_version)}`);
  database.close();
  // Proof: weakening `CHECK (sequence >= 1)` to `>= 0` in `AttemptDefinition` failed this
  // equality on the activation_observation_attempt statement, and made the Burokrat-written store
  // below refuse as `observation recovery table malformed: activation_observation_attempt`
  // (2026-10-12).
  expect(statements([...schema, ...version].join(';\n'))).toEqual(
    statements(readFileSync(join(FIXTURES, 'activation.v10.sqlite-dump'), 'utf8')),
  );
});

test('a Burokrat-written v10 store opens in Dash and continues its attempt sequence', async () => {
  const dump = readFileSync(join(FIXTURES, 'burokrat-written-v10.sqlite-dump'), 'utf8');
  // The fixture is the pre-relocation store's rows as JSON; the equalities below check every
  // field, so the cast only names the expected shape.
  const recorded = JSON.parse(
    readFileSync(join(FIXTURES, 'burokrat-written-v10.state.json'), 'utf8'),
  ) as RecordedStore;
  const configuration = restore(recorded, dump);
  const database = new Database(configuration.databasePath, { readonly: true });
  expect({
    attempts: database
      .query('SELECT * FROM activation_observation_attempt ORDER BY sequence')
      .all(),
    recovery: database.query('SELECT * FROM activation_observation_recovery').get(),
    schedule: database.query('SELECT * FROM activation_observation_schedule').get(),
    version: database.query('PRAGMA user_version').get(),
  }).toEqual({
    attempts: recorded.attempts,
    recovery: recorded.recovery,
    schedule: recorded.schedule,
    version: recorded.version,
  });
  database.close();

  let refusal: unknown;
  try {
    await runDashArguments(
      ['migrate-observation', configuration.configurationPath],
      dependencies([], recorded.recovery.next_attempt_at),
    );
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal instanceof ObservationStoreError ? refusal.failure : refusal).toBe('current');

  const config = readObservationStateConfig(configuration.configurationPath, {
    read: () => recorded.recovery.next_attempt_at + 800,
  });
  expect(
    await withRecoveryObservation(config, (attempt) =>
      Promise.resolve({ kind: 'complete' as const, sequence: attempt.sequence }),
    ),
  ).toEqual({
    kind: 'owned',
    terminalOutcome: 'complete',
    value: { kind: 'complete', sequence: recorded.schedule.attempt_sequence + 1 },
  });

  // The comparison is live: the same dump with one column renamed is refused before any attempt.
  const drifted = restore(
    recorded,
    dump.replace('classification TEXT,', 'classification_kind TEXT,'),
  );
  let attempted = false;
  let driftRefusal: unknown;
  try {
    await withRecoveryObservation(
      readObservationStateConfig(drifted.configurationPath, {
        read: () => recorded.recovery.next_attempt_at + 800,
      }),
      () => {
        attempted = true;
        return Promise.resolve({ kind: 'complete' as const });
      },
    );
  } catch (cause) {
    driftRefusal = cause;
  }
  expect(attempted).toBe(false);
  // Proof: removing the exact-definition comparison in `readRecovery` still refused before any
  // attempt, but later, in the row parser (`classification must be a string or null (was
  // missing)`), so this equality failed (2026-10-12).
  expect(driftRefusal instanceof Error ? driftRefusal.message : driftRefusal).toBe(
    'observation recovery table malformed: activation_observation_attempt',
  );
});
