import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'bun:test';

import {
  createTestInstallation,
  readScopeAvailability,
} from './gated-test-installation.test.fixture';
import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

const installation = createTestInstallation();
beforeAll(async () => {
  const selected = await installation;
  process.stderr.write(
    'gated payload test artifact: ' + selected.kind + ' ' + selected.sha256 + '\n',
  );
});
afterAll(async () => {
  const disposal = await (await installation).dispose();
  if (disposal.kind === 'retained')
    process.stderr.write('gated payload test artifact retained: ' + disposal.directory + '\n');
});
const scope = readScopeAvailability();
if (scope.kind === 'unavailable')
  process.stderr.write('gated payload real-systemd lane skipped: ' + scope.reason + '\n');

function receipt(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid receipt');
  return value as Record<string, unknown>;
}
for (const scenario of [
  'healthy',
  'cancel',
  'early-done',
  'duplicate-start',
  'bad-control',
  'bad-env-duplicate',
  'bad-env-utf8',
  'bad-env-json',
  'bad-env-version',
  'bad-env-oversize',
  'bad-env-trailing',
  'bad-env-partial',
  'pre-signal',
  'group-TERM',
  'group-INT',
  'group-HUP',
  'wrapper-TERM',
  'controller-eof',
  'absent-specials',
  'empty-specials',
  'systemd',
  'payload-preload',
  'queued-before-transition',
  'missing-fds',
  'missing-program',
  'nonexecutable',
  'environment-close-fault',
])
  (process.platform !== 'linux' || (scenario === 'systemd' && scope.kind === 'unavailable')
    ? it.skip
    : it)(
    'native gated payload ' + scenario,
    async () => {
      const name = 'native gated payload ' + scenario;
      const selected = await installation;
      if (process.env['PUNI_C34_PAYLOAD_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', name], {
          env: {
            ...process.env,
            PUNI_C34_PAYLOAD_SUPERVISOR: '1',
            PUNI_C34_PAYLOAD_BUNDLE: selected.entrypoint,
            PUNI_C34_PAYLOAD_BUNDLE_SHA256: selected.sha256,
            PUNI_C34_TEST_ARTIFACT_KIND: selected.kind,
          },
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'pipe',
        });
        const observed = await awaitPerformanceSupervisor(supervisor, 12000);
        if (observed.exitCode !== 0) selected.retain();
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni c34 payload '));
      writeFileSync(join(root, 'stdin'), new Uint8Array([0, 2, 255, 48]));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      try {
        const bundle = selected.entrypoint;
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-payload.test.fixture.ts',
        );
        const controller = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            'controller',
            root,
            bundle,
            scenario,
          ],
          root,
          Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
          { stdout, stderr },
        );
        closeSync(stdout);
        closeSync(stderr);
        const settled = await Promise.race([
          controller.exited.then((code) => ({ kind: 'ended' as const, code })),
          Bun.sleep(8000).then(() => ({ kind: 'pending' as const })),
        ]);
        expect(settled.kind, readFileSync(join(root, 'stderr'), 'utf8')).toBe('ended');
        expect(controller.exitCode, readFileSync(join(root, 'stderr'), 'utf8')).toBe(0);
        const observed = receipt(join(root, 'receipt.json'));
        if (scenario === 'healthy') expect(Number(observed['afterStatusMs'])).toBeLessThan(500);
        const startupRefusal =
          scenario === 'cancel' ||
          scenario.startsWith('bad-env-') ||
          scenario === 'bad-control' ||
          scenario === 'pre-signal' ||
          scenario === 'missing-fds';
        const protocolFault =
          startupRefusal ||
          scenario === 'early-done' ||
          scenario === 'duplicate-start' ||
          scenario === 'queued-before-transition';
        const expected =
          scenario === 'missing-program'
            ? 127
            : scenario === 'nonexecutable'
              ? 126
              : scenario === 'group-TERM'
                ? 143
                : scenario === 'group-INT'
                  ? 130
                  : scenario === 'group-HUP'
                    ? 129
                    : 37;
        expect(observed['code']).toBe(
          scenario === 'environment-close-fault' ? null : protocolFault ? 125 : expected,
        );
        if (scenario === 'environment-close-fault') expect(observed['signal']).toBe('SIGKILL');
        expect(observed['reported']).toBe(
          (protocolFault && scenario !== 'queued-before-transition') ||
            scenario === 'environment-close-fault'
            ? ''
            : String(expected) + '\n',
        );
        if (
          startupRefusal ||
          scenario === 'missing-program' ||
          scenario === 'nonexecutable' ||
          scenario === 'environment-close-fault'
        )
          expect(existsSync(join(root, 'payload.json'))).toBe(false);
        else {
          const payload = receipt(join(root, 'payload.json'));
          expect(payload['helperExecutable']).toBe(realpathSync(process.execPath));
          expect(payload['privateInHelperArgv']).toBe(false);
          if (scenario !== 'queued-before-transition')
            expect(payload['helperArgv']).toContain(bundle);
          expect(payload['inherited']).toEqual([]);
          const specials =
            scenario === 'absent-specials'
              ? { PWD: null, SHLVL: null, _: null }
              : scenario === 'empty-specials'
                ? { PWD: '', SHLVL: '', _: '' }
                : { PWD: '', SHLVL: 'custom-level', _: 'exact-underscore' };
          expect(payload['selected']).toEqual({
            ...specials,
            ['__proto__']: 'exact-proto',
            constructor: 'exact-constructor',
          });
          expect(payload['secretHash']).toBe(observed['secretHash']);
          expect(payload['largeCount']).toBe(48);
          if (scenario === 'payload-preload') {
            expect(existsSync(join(root, 'candidate-preloaded'))).toBe(false);
            expect(payload['pid']).toBe(
              Number(readFileSync(join(root, 'payload-preloaded'), 'utf8')),
            );
            expect(payload['startup']).toEqual({
              BUN_OPTIONS: '--preload ' + JSON.stringify(join(root, 'payload-preload.mjs')),
              BUN_INSPECT_PRELOAD: join(root, 'payload-preload.mjs'),
              NODE_OPTIONS: '--no-warnings',
              BUN_BE_BUN: '1',
            });
          }
          expect(payload['argv']).toEqual(['', 'literal ; $()']);
          expect(readFileSync(join(root, 'stdout')).toString('hex')).toBe('0002ff30');
        }
      } catch (cause) {
        failure = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_C34_PAYLOAD_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true });
        cpSync(root, join(capture, scenario), { recursive: true });
      }
      if (cleanup.kind === 'failed') {
        selected.retain();
        throw failure.kind === 'failed'
          ? new AggregateError(
              [failure.cause, cleanup.cause],
              'payload test and owned cleanup failed',
            )
          : cleanup.cause;
      }
      rmSync(root, { recursive: true, force: true });
      if (failure.kind === 'failed') throw failure.cause;
    },
    15000,
  );
