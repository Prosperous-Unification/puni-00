import { closeSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function receipt(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid native observer receipt');
  return value as Record<string, unknown>;
}
for (const scenario of [
  'missing-callback',
  'numeric-reject',
  'numeric-reject-callback',
  'callback-after-numeric',
  'callback-invalid',
  'callback-error',
  'numeric-mismatch',
  'numeric-pending',
])
  it(
    'native authority observation ' + scenario,
    async () => {
      const name = 'native authority observation ' + scenario;
      if (process.env['PUNI_C34_NATIVE_OBSERVER_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '-t', '^' + name + '$'],
          {
            env: { ...process.env, PUNI_C34_NATIVE_OBSERVER_SUPERVISOR: '1' },
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
        root = mkdtempSync(join(tmpdir(), 'puni c34 native authority '));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let primary: { kind: 'healthy' } | { kind: 'failed'; cause: unknown } = { kind: 'healthy' };
      try {
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-native-observation.test.fixture.ts',
        );
        const controller = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            'controller',
            root,
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
        expect(await controller.exited, readFileSync(join(root, 'stderr'), 'utf8')).toBe(0);
        const observed = receipt(join(root, 'native-observation.json'));
        if (scenario === 'numeric-mismatch' || scenario === 'numeric-pending') {
          expect(observed['code']).toBe(125);
          expect(observed['status']).toBe('');
          expect(observed['actualNativeCallback']).toBe(true);
        }
        expect(observed['diagnosticCount']).toBe(scenario === 'callback-after-numeric' ? 0 : 1);
        expect(observed['diagnosticCanonical']).toBe(true);
        if (scenario === 'callback-after-numeric') {
          expect(observed['code']).toBe(37);
          expect(observed['status']).toBe('37\n');
        } else if (scenario !== 'numeric-mismatch' && scenario !== 'numeric-pending') {
          expect(observed['beforeDiagnosticCount']).toBe(1);
          expect(observed['pending']).toBe(true);
          expect(observed['status']).toBe('');
          if (scenario === 'numeric-reject-callback') {
            expect(observed['code']).toBe(125);
            expect(observed['actualNativeCallback']).toBe(true);
          } else {
            expect(observed['signal']).toBe('SIGKILL');
            expect(observed['nativeBefore']).toBe(
              scenario === 'missing-callback' || scenario.startsWith('callback-'),
            );
          }
        }
      } catch (cause) {
        primary = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_C34_NATIVE_OBSERVER_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true });
        cpSync(root, join(capture, scenario), { recursive: true });
      }
      if (cleanup.kind === 'failed')
        throw primary.kind === 'failed'
          ? new AggregateError([primary.cause, cleanup.cause], 'native oracle and reaping failed')
          : cleanup.cause;
      rmSync(root, { recursive: true, force: true });
      if (primary.kind === 'failed') throw primary.cause;
    },
    15000,
  );
