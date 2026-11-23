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
  'running',
  'late',
  'early-before-start',
  'early-before-environment',
  'duplicate-running',
  'duplicate-late',
  'after-done',
  'prefix-kill',
  'prefix-truncated',
  'prefix-other',
])
  it(
    'private retained-child kill ' + scenario,
    async () => {
      const name = 'private retained-child kill ' + scenario;
      if (process.env['PUNI_DASH_KILL_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '-t', '^' + name + '$'],
          {
            env: { ...process.env, PUNI_DASH_KILL_SUPERVISOR: '1' },
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
        root = mkdtempSync(join(tmpdir(), 'puni dash kill '));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let primary: { kind: 'healthy' } | { kind: 'failed'; cause: unknown } = { kind: 'healthy' };
      try {
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-kill.test.fixture.ts',
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
        const observed = receipt(join(root, 'kill-observation.json'));
        const early = scenario.startsWith('early-');
        const refused =
          early ||
          scenario.startsWith('duplicate-') ||
          scenario === 'after-done' ||
          scenario === 'prefix-truncated' ||
          scenario === 'prefix-other';
        expect(observed['signal']).toBe(null);
        expect(observed['code']).toBe(refused ? 125 : scenario === 'running' ? 137 : 37);
        expect(observed['acquired']).toBe(!early);
        expect(observed['kills']).toBe(
          scenario === 'running' || scenario === 'duplicate-running' ? 'SIGKILL\n' : '',
        );
        if (early) {
          expect(observed['status']).toBe('');
          expect(observed['native']).toBe(null);
          expect(observed['numeric']).toBe(null);
        } else {
          const killed = scenario === 'running' || scenario === 'duplicate-running';
          expect(observed['native']).toMatchObject(
            killed
              ? { code: null, signal: 'SIGKILL', hadCause: false }
              : { code: 37, signal: null, hadCause: false },
          );
          expect(observed['numeric']).toBe(killed ? '137' : '37');
          if (!refused || scenario !== 'duplicate-running')
            expect(observed['status']).toBe(killed ? '137\n' : '37\n');
          else expect(observed['status']).toBe('');
        }
      } catch (cause) {
        primary = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_DASH_KILL_CAPTURE'];
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
