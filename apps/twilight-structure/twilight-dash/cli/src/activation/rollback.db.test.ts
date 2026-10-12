import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { runDash } from '../cli';
import { GitHubReadFailure } from './github-reader';
import { readObservationStateConfig } from './observation-service';
import { type ObservationStateConfig, withRecoveryObservation } from './observation-state';
import { writeObservationServiceConfiguration } from './testing/observation-service-configuration';

/**
 * The pre-relocation activation controller, vendored:
 * `fixtures/activation/pre-relocation-activation.tar` is the exact
 * `git archive --format=tar 802c26bd8579f61134545ef4832d759c151bf9fa -- <33 paths>` output (the
 * paths and command are in that directory's README). It holds the old
 * `activation-controller/{observation-state,controller}.ts` with their whole relative import
 * closure, which reaches `judge-facade.ts` and everything it re-exports, plus `@shared/validation`
 * at the same commit. Only `arktype`, `typescript`, `yaml` and Bun's built-ins resolve from the
 * workspace. `802c26bd8` is slice S0's split, the last commit whose Burokrat package held the
 * observation store.
 */
const PRE_RELOCATION_SHA = '802c26bd8579f61134545ef4832d759c151bf9fa';
const PRE_RELOCATION_ARCHIVE = join(
  import.meta.dir,
  '..',
  '..',
  'fixtures',
  'activation',
  'pre-relocation-activation.tar',
);
const PRE_RELOCATION_ARCHIVE_SHA256 =
  '3c0ee3fecd16a45e47b97b190db3debce02b40d3bed8ad894848c424501a3c2d';
const WORKSPACE_ROOT = join(import.meta.dir, '..', '..', '..', '..', '..', '..');

const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { force: true, recursive: true });
});

type RecoveryResult =
  | { readonly kind: 'busy' }
  | { readonly kind: 'deferred' }
  | { readonly kind: 'owned'; readonly value: unknown; readonly terminalOutcome: string };

interface PreRelocationActivation {
  readonly openActivationController: (options: {
    readonly databasePath: string;
    readonly bootstrapPath: string;
    readonly pin: ObservationStateConfig['pin'];
    readonly clock: () => number;
    readonly readyCandidates: () => Promise<readonly unknown[]>;
    readonly currentCandidate: () => Promise<never>;
    readonly selectObligations: () => never;
  }) => { listRequests(): readonly unknown[]; close(): void };
  readonly withRecoveryObservation: (
    config: ObservationStateConfig,
    work: (attempt: { readonly sequence: number }) => Promise<{
      readonly kind: 'complete';
      readonly sequence: number;
    }>,
  ) => Promise<RecoveryResult>;
}

/**
 * Verifies the vendored archive's digest, extracts it into scratch and loads its observation
 * modules.
 *
 * @throws Error naming the archive when it is missing, unreadable or its digest differs.
 */
async function loadPreRelocationActivation(
  archivePath = PRE_RELOCATION_ARCHIVE,
): Promise<PreRelocationActivation> {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(archivePath);
  } catch (cause) {
    throw new Error(`pre-relocation activation archive is unreadable: ${archivePath}`, { cause });
  }
  const digest = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  if (digest !== PRE_RELOCATION_ARCHIVE_SHA256) {
    throw new Error(
      `pre-relocation activation archive digest ${digest} differs from ${PRE_RELOCATION_ARCHIVE_SHA256} (source ${PRE_RELOCATION_SHA})`,
    );
  }
  const root = mkdtempSync(join(tmpdir(), 'dash-activation-rollback-'));
  scratch.push(root);
  const extract = Bun.spawnSync(['tar', '-x', '-C', root], { stderr: 'pipe', stdin: bytes });
  if (extract.exitCode !== 0) throw new Error(extract.stderr.toString('utf8'));
  writeFileSync(
    join(root, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        paths: { '@shared/validation': [join(root, 'libs/shared/domain/validation/src/index.ts')] },
      },
    })}\n`,
  );
  symlinkSync(join(WORKSPACE_ROOT, 'node_modules'), join(root, 'node_modules'));
  const controllerDirectory = join(
    root,
    'apps/twilight-structure/twilight-burokrat/cli/src/activation-controller',
  );
  // The pinned modules are loaded by path; their exports are typed by the interface above, which
  // the assertions below exercise call by call.
  const [controller, state] = (await Promise.all([
    import(join(controllerDirectory, 'controller.ts')),
    import(join(controllerDirectory, 'observation-state.ts')),
  ])) as [
    Pick<PreRelocationActivation, 'openActivationController'>,
    Pick<PreRelocationActivation, 'withRecoveryObservation'>,
  ];
  return {
    openActivationController: controller.openActivationController,
    withRecoveryObservation: state.withRecoveryObservation,
  };
}

async function refusalOf(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('resolved without a refusal');
}

/** The store's observation rows and version, as both codes persist them. */
function observationRows(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return {
      attempts: database
        .query('SELECT * FROM activation_observation_attempt ORDER BY sequence')
        .all(),
      recovery: database.query('SELECT * FROM activation_observation_recovery').get(),
      schedule: database.query('SELECT * FROM activation_observation_schedule').get(),
      version: database.query('PRAGMA user_version').get(),
    };
  } finally {
    database.close();
  }
}

test('the vendored pre-relocation activation archive is refused when missing or altered', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dash-activation-rollback-altered-'));
  scratch.push(directory);
  const altered = join(directory, 'altered.tar');
  const bytes = readFileSync(PRE_RELOCATION_ARCHIVE);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(altered, bytes);
  // Proof: disabling the digest comparison let the altered archive load and this case fail on
  // `resolved without a refusal`; removing the read guard surfaced a bare ENOENT (2026-10-12).
  expect(await refusalOf(loadPreRelocationActivation(altered))).toContain(
    'pre-relocation activation archive digest',
  );
  expect(await refusalOf(loadPreRelocationActivation(join(directory, 'missing.tar')))).toContain(
    'pre-relocation activation archive is unreadable',
  );
});

test('the pre-relocation controller opens a Dash-written v10 store and continues its attempt sequence', async () => {
  const configuration = writeObservationServiceConfiguration();
  scratch.push(configuration.root);
  let now = 1_000_000;
  const clock = { read: () => now };
  const output: string[] = [];
  await runDash(['bootstrap-observation', configuration.configurationPath], {
    clock,
    monotonic: { now: () => 0 },
    planEnrollment: () => Promise.reject(new Error('the rollback never plans enrollment')),
    stdout: {
      write: (text: string) => {
        output.push(text);
      },
    },
  });
  expect(JSON.parse(output.join(''))).toMatchObject({ status: 'bootstrapped', version: 10 });
  const config = readObservationStateConfig(configuration.configurationPath, clock);
  now = 1_001_000;
  expect(
    await withRecoveryObservation(config, () => Promise.resolve({ kind: 'complete' as const })),
  ).toEqual({ kind: 'owned', terminalOutcome: 'complete', value: { kind: 'complete' } });
  now = 1_002_000;
  expect(
    await refusalOf(
      withRecoveryObservation(config, () =>
        Promise.reject(new GitHubReadFailure('unavailable', 'fixture provider unavailable', 503)),
      ),
    ),
  ).toBe('fixture provider unavailable');
  const dashRows = observationRows(configuration.databasePath);
  expect(dashRows.version).toEqual({ user_version: 10 });
  expect(dashRows.attempts.length).toBe(2);
  const recovery = dashRows.recovery as { readonly next_attempt_at: number };

  const old = await loadPreRelocationActivation();
  const controller = old.openActivationController({
    databasePath: configuration.databasePath,
    bootstrapPath: config.bootstrapPath,
    pin: config.pin,
    clock: config.clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.reject(new Error('the rollback has no provider read')),
    selectObligations: () => {
      throw new Error('the rollback has no evaluation');
    },
  });
  expect(controller.listRequests()).toEqual([]);
  controller.close();
  expect(observationRows(configuration.databasePath)).toEqual(dashRows);

  now = recovery.next_attempt_at + 800;
  expect(
    await old.withRecoveryObservation(config, (attempt) =>
      Promise.resolve({ kind: 'complete' as const, sequence: attempt.sequence }),
    ),
  ).toEqual({
    kind: 'owned',
    terminalOutcome: 'complete',
    value: { kind: 'complete', sequence: dashRows.attempts.length + 1 },
  });
  const rolledBack = observationRows(configuration.databasePath);
  expect(rolledBack.attempts.slice(0, 2)).toEqual(dashRows.attempts);
  expect(rolledBack.attempts[2]).toMatchObject({ sequence: 3, outcome: 'complete' });

  // The comparison is live: one persisted status byte flipped behind both codes' backs makes the
  // pre-relocation recovery open refuse the store before any attempt (its `PRAGMA quick_check`
  // reports the violated CHECK). The old controller open reads no observation row, so it is not
  // the refusing open.
  // Proof: with the flip line removed the same old call returned an owned attempt and this case
  // failed on `resolved without a refusal` (2026-10-12).
  const database = new Database(configuration.databasePath);
  database.run('PRAGMA ignore_check_constraints = ON');
  database.run("UPDATE activation_observation_recovery SET health = 'healthz'");
  database.close();
  now += 1_000;
  let attempted = false;
  expect(
    await refusalOf(
      old.withRecoveryObservation(config, () => {
        attempted = true;
        return Promise.resolve({ kind: 'complete' as const, sequence: 0 });
      }),
    ),
  ).toBe('observation state corrupt');
  expect(attempted).toBe(false);
}, 60_000);
