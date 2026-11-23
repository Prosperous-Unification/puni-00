import { createHash } from 'node:crypto';
import { closeSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function receipt(root: string, name: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(join(root, name), 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid native API receipt');
  return value as Record<string, unknown>;
}
for (const scenario of [
  'admit',
  'nonsocket',
  'missing',
  'unsupported',
  'read-abort',
  'read-error',
  'overlap',
  'active-close',
  'repeat-close',
  'ambiguous-close',
  'write-abort',
  'write-deadline',
  'write-zero',
  'write-error',
  'write-pressure',
])
  it(
    'gated native API ' + scenario,
    async () => {
      const title = 'gated native API ' + scenario;
      if (process.env['PUNI_C34_NATIVE_API_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '-t', '^' + title + '$'],
          {
            env: { ...process.env, PUNI_C34_NATIVE_API_SUPERVISOR: '1' },
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
        root = mkdtempSync(join(tmpdir(), 'puni c34 native API '));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let primary: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      try {
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-native-api.test.fixture.ts',
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
        const observed = receipt(root, 'native-api.json'),
          ending = receipt(root, 'native-api-controller.json');
        const refused = ['nonsocket', 'missing', 'unsupported'].includes(scenario);
        expect(observed['admission'], 'native descriptor admission classification').toBe(
          refused ? 'refused' : 'opened',
        );
        expect(ending['code']).toBe(0);
        expect(ending['signal']).toBe(null);
        if (scenario === 'read-abort' || scenario === 'overlap' || scenario === 'active-close')
          expect(observed['readKind'], 'native read cancellation is not EOF').toBe('aborted');
        if (scenario === 'read-error') {
          expect(observed['readErrorInjected']).toBe(true);
          expect(observed['readKind'], 'nonretryable native read must fail without EOF').toBe(
            'failed',
          );
        }
        if (scenario === 'overlap')
          expect(observed['overlapRefused'], 'exclusive native reader must reject overlap').toBe(
            true,
          );
        if (scenario === 'active-close')
          expect(observed['closeRefused'], 'active native reader must reject close').toBe(true);
        if (scenario === 'repeat-close' || scenario === 'ambiguous-close') {
          expect(observed['closeAttempts'], 'native descriptor close must have one attempt').toBe(
            1,
          );
          expect(observed['firstCloseRefused']).toBe(scenario === 'ambiguous-close');
          expect(observed['repeatRefused']).toBe(true);
        }
        if (
          scenario === 'write-abort' ||
          scenario === 'write-deadline' ||
          scenario === 'write-zero' ||
          scenario === 'write-error'
        )
          expect(observed['write'], 'native status write must refuse required failure').toEqual({
            kind: 'refused',
          });
        if (scenario === 'write-error') expect(observed['writeErrorInjected']).toBe(true);
        if (scenario === 'write-pressure') {
          expect(observed['write'], 'actual native retry must preserve the write').toMatchObject({
            kind: 'written',
          });
          expect(ending['length'], 'actual native write must preserve all bytes').toBe(2097152);
          expect(ending['sha256']).toBe(
            createHash('sha256').update(Buffer.alloc(2097152, 0x62)).digest('hex'),
          );
          const write: unknown = observed['write'];
          if (
            typeof write !== 'object' ||
            write === null ||
            !('pressure' in write) ||
            typeof write.pressure !== 'number'
          )
            throw new Error('native pressure observation absent');
          expect(write.pressure).toBeGreaterThan(0);
        } else expect(ending['length']).toBe(0);
      } catch (cause) {
        primary = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_C34_NATIVE_API_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true });
        cpSync(root, join(capture, scenario), { recursive: true });
      }
      if (cleanup.kind === 'failed')
        throw primary.kind === 'failed'
          ? new AggregateError(
              [primary.cause, cleanup.cause],
              'native API oracle and reaping failed',
            )
          : cleanup.cause;
      rmSync(root, { recursive: true, force: true });
      if (primary.kind === 'failed') throw primary.cause;
    },
    15000,
  );
