import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function receipt(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('invalid observer receipt');
  return parsed as Record<string, unknown>;
}
async function waitFile(path: string): Promise<void> {
  const deadline = performance.now() + 10000;
  while (!existsSync(path)) {
    if (performance.now() >= deadline) throw new Error('observer receipt unavailable ' + path);
    await Bun.sleep(5);
  }
}
for (const scenario of [
  'leader-error',
  'fd4-delayed',
  'fd4-unconfirmed',
  'fd4-empty',
  'fd4-partial',
  'fd4-duplicate',
  'fd4-malformed',
  'fd4-read-error',
  'fd4-close-before-end',
  'control-kill-ordering',
  'control-kill-callback',
  'control-kill-callback-leader-error',
  'control-kill-before-delivery',
  'control-start-callback',
  'control-end-callback',
  'control-start-callback-after-status',
])
  it(
    'gated job observation ' + scenario,
    async () => {
      const name = 'gated job observation ' + scenario;
      if (process.env['PUNI_C34_OBSERVATION_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '-t', '^' + name + '$'],
          {
            env: { ...process.env, PUNI_C34_OBSERVATION_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 12000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni-c34-job-observation-'));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let pool:
        | { base: string; config: string; checkout: string; bin: string; payload: string }
        | undefined;
      let primary: { kind: 'healthy' } | { kind: 'failed'; cause: unknown } = { kind: 'healthy' };
      try {
        // Never-issued fixture key, minted only at the owning test boundary; no caller private values.
        writeFileSync(
          join(root, 'setup-input.json'),
          JSON.stringify({ credential: 'wbs_mk_' + crypto.randomUUID() + '.' + 'k'.repeat(43) }),
          { mode: 0o600 },
        );
        const setup = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-observation-pool.test.fixture.ts',
        );
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        );
        const prepared = owner.spawn(
          [process.execPath, '--no-env-file', '--config=/dev/null', setup, root, scenario],
          root,
          { ...env, TMPDIR: root },
          { stdout, stderr },
        );
        expect(await prepared.exited, readFileSync(join(root, 'stderr'), 'utf8')).toBe(0);
        const descriptor = receipt(join(root, 'pool.json'));
        const { base, config, checkout, bin, payload } = descriptor;
        if (
          typeof base !== 'string' ||
          typeof config !== 'string' ||
          typeof checkout !== 'string' ||
          typeof bin !== 'string' ||
          typeof payload !== 'string'
        )
          throw new Error('invalid pool descriptor');
        pool = { base, config, checkout, bin, payload };
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-job-observation.test.fixture.ts',
        );
        const runner = owner.spawn(
          [
            'unshare',
            '--user',
            '--map-current-user',
            '--pid',
            '--fork',
            '--mount-proc',
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            pool.base,
            pool.config,
            checkout,
            join(pool.base, 'cgroup'),
            bin + ':' + (process.env['PATH'] ?? ''),
            payload,
            scenario,
          ],
          pool.base,
          Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
          { stdout, stderr },
        );
        closeSync(stdout);
        closeSync(stderr);
        if (scenario.startsWith('control-')) {
          if (scenario !== 'control-kill-ordering')
            await waitFile(join(pool.base, 'control-callback-injected'));
          if (scenario === 'control-kill-before-delivery') {
            await waitFile(join(pool.base, 'kill-pending.json'));
            expect(receipt(join(pool.base, 'kill-pending.json'))).toEqual({
              finished: false,
              nativeEnded: false,
              fd4Hex: '',
            });
            writeFileSync(join(pool.base, 'release-leader-payload'), 'release');
          }
        } else if (scenario === 'leader-error') {
          await waitFile(join(pool.base, 'leader-observation.json'));
          expect(receipt(join(pool.base, 'leader-observation.json'))).toEqual({ finished: false });
          writeFileSync(join(pool.base, 'release-leader-payload'), 'release');
        } else {
          await waitFile(join(pool.base, 'fd4-held.json'));
          const held = receipt(join(pool.base, 'fd4-held.json'));
          const expected =
            new Map([
              ['fd4-empty', ''],
              ['fd4-partial', '33'],
              ['fd4-duplicate', '330a330a'],
              ['fd4-malformed', '30330a'],
            ]).get(scenario) ?? '330a';
          expect(held['hex']).toBe(expected);
          expect(held['fd4Ended']).toBe(true);
          expect(held['signal']).toBe('SIGKILL');
          await waitFile(join(pool.base, 'fd4-pending.json'));
          const pending = receipt(join(pool.base, 'fd4-pending.json'));
          if (scenario === 'fd4-unconfirmed') {
            expect(pending['finished']).toBe(false);
            expect(pending['reports']).toEqual(
              expect.arrayContaining([
                expect.stringContaining('FD4 observation remains unconfirmed'),
              ]),
            );
          }
          writeFileSync(join(pool.base, 'release-fd4'), 'release');
        }
        expect(await runner.exited, readFileSync(join(root, 'stderr'), 'utf8')).toBe(0);
        const observed = receipt(join(pool.base, 'job-observation-outcome.json'));
        const preserved = scenario === 'fd4-delayed' || scenario === 'fd4-unconfirmed';
        expect(observed['outcome']).toMatchObject(
          scenario === 'control-kill-ordering'
            ? { kind: 'status', status: 124 }
            : preserved
              ? { kind: 'status', status: 3 }
              : { kind: 'failed', code: 70 },
        );
        if (scenario === 'control-kill-ordering') {
          expect(observed['fd4Hex']).toBe('3133370a');
          expect(observed['fd4Ended']).toBe(true);
          const trace: unknown = observed['trace'];
          if (!Array.isArray(trace) || !trace.every((entry) => typeof entry === 'string'))
            throw new Error('invalid ordering trace');
          expect(trace.indexOf('native-exit:137:null')).toBeGreaterThanOrEqual(0);
          expect(trace.indexOf('leftover-kill-announced')).toBeGreaterThan(
            trace.indexOf('native-exit:137:null'),
          );
          expect(observed['jobs']).toMatchObject([{ state: 'released' }]);
          expect(observed['runs']).toMatchObject([
            {
              exitCode: 124,
              signal: 'SIGKILL',
              leftoverProcesses: { count: 1, endedWith: 'SIGKILL' },
            },
          ]);
          expect(existsSync(join(pool.base, 'keeper-native-joined'))).toBe(true);
          expect(existsSync(join(pool.base, 'kill-before-keeper'))).toBe(false);
        }
        if (scenario.startsWith('control-kill-') && scenario !== 'control-kill-ordering') {
          const afterDelivery = scenario !== 'control-kill-before-delivery';
          expect(observed['fd4Hex']).toBe(afterDelivery ? '3133370a' : '330a');
          expect(observed['fd4Ended']).toBe(true);
          expect(observed['outcome']).toMatchObject({
            causeIdentity: {
              kill: true,
              leader: scenario === 'control-kill-callback-leader-error',
              count: scenario === 'control-kill-callback-leader-error' ? 2 : 1,
            },
          });
          const failureMatcher: unknown = expect.stringContaining(
            'private payload kill delivery failed:',
          );
          expect(observed['runs']).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                exitCode: 124,
                signal: afterDelivery ? 'SIGKILL' : null,
                attributionIncomplete: true,
                telemetryFailure: failureMatcher,
              }),
            ]),
          );
          expect(observed['jobs']).toEqual(
            expect.arrayContaining([expect.objectContaining({ state: 'released', exitCode: 124 })]),
          );
          expect(observed['trace']).toEqual(
            expect.arrayContaining([
              'native-control-finished',
              afterDelivery ? 'native-exit:137:null' : 'native-exit:3:null',
            ]),
          );
        }
        if (preserved) {
          const runs: unknown = observed['runs'];
          if (!Array.isArray(runs) || runs.length !== 1)
            throw new Error('missing single actual run record');
          const run: unknown = runs[0];
          if (
            typeof run !== 'object' ||
            run === null ||
            !('exitCode' in run) ||
            !('attributionIncomplete' in run) ||
            !('telemetryFailure' in run) ||
            typeof run.telemetryFailure !== 'string'
          )
            throw new Error('malformed actual run outcome');
          expect(run.exitCode).toBe(3);
          expect(run.attributionIncomplete).toBe(true);
          expect(run.telemetryFailure).toContain('private helper ended by SIGKILL');
        }
        if (scenario === 'fd4-read-error' || scenario === 'fd4-close-before-end') {
          const outcome: unknown = observed['outcome'];
          if (
            typeof outcome !== 'object' ||
            outcome === null ||
            !('message' in outcome) ||
            typeof outcome.message !== 'string'
          )
            throw new Error('missing actual refusal message');
          expect(outcome.message).toContain('not qualified');
        }
      } catch (cause) {
        primary = { kind: 'failed', cause };
      } finally {
        if (pool !== undefined) {
          writeFileSync(join(pool.base, 'release-leader-payload'), 'release');
          writeFileSync(join(pool.base, 'release-fd4'), 'release');
        }
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_C34_OBSERVATION_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true });
        cpSync(root, join(capture, scenario), { recursive: true });
      }
      if (cleanup.kind === 'failed')
        throw primary.kind === 'failed'
          ? new AggregateError([primary.cause, cleanup.cause], 'observer and owned reaping failed')
          : cleanup.cause;
      rmSync(root, { recursive: true, force: true });
      if (primary.kind === 'failed') throw primary.cause;
    },
    15000,
  );
