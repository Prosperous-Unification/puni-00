import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { holdLock } from '@shared/heavy-lock';
import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('owned residual receipt is not an object');
  // The JSON boundary has been checked as an object; every property remains unknown until asserted.
  return value as Record<string, unknown>;
}
function readReceipt(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return requireRecord(value);
}

const modes = [
  'resolve-capture',
  'invalid-resolve-prefix',
  'invalid-acquire-prefix',
  'invalid-budget',
  'invalid-label',
  'invalid-grace',
  'acquire-capture',
  'preexisting-token',
  'reservation-race',
  'post-spawn-failures',
  'post-diagnostic-replacement',
  'ended-fallback-foreign-birth',
  'withdrawal-bound',
] as const;
for (const mode of modes)
  it(
    'parent residual ' + mode + ' through its owned production boundary',
    async () => {
      const name = 'parent residual ' + mode + ' through its owned production boundary';
      if (process.env['PUNI_PARENT_RESIDUAL_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '--test-name-pattern', name],
          {
            cwd: process.cwd(),
            env: { ...process.env, PUNI_PARENT_RESIDUAL_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 18000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni parent residual '));
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const fixture = resolve(
        import.meta.dir,
        mode === 'ended-fallback-foreign-birth'
          ? '../../../apps/twilight-structure/twilight-dash/cli/src/resources/host-lock.test.fixture.ts'
          : '../../../apps/twilight-structure/twilight-dash/cli/src/resources/host-lock-residual.test.fixture.ts',
      );
      const blocker = Promise.withResolvers<undefined>(),
        blocked = Promise.withResolvers<undefined>();
      let earlier: Promise<unknown> | undefined;
      let failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      try {
        if (mode === 'ended-fallback-foreign-birth') {
          environment['PUNI_PARENT_RESIDUAL_END_BIRTH_GATE'] = '1';
          earlier = holdLock(join(root, 'mutex'), async () => {
            blocked.resolve(undefined);
            await blocker.promise;
          });
          await blocked.promise;
        }
        const frontend = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            mode === 'ended-fallback-foreign-birth' ? 'fast-refusal-wrong-boot' : mode,
            root,
          ],
          root,
          environment,
          { stdout: 'pipe', stderr: 'pipe' },
        );
        if (!(frontend.stderr instanceof ReadableStream)) throw new Error('residual stderr absent');
        const stderr = new Response(frontend.stderr).text();
        if (mode === 'withdrawal-bound') {
          const deadline = performance.now() + 2500;
          while (
            !existsSync(join(root, 'hold.ready')) ||
            !existsSync(join(root, 'start-gate.spawned'))
          ) {
            if (performance.now() >= deadline)
              throw new Error('withdrawal did not reach controlled native startup');
            await Bun.sleep(10);
          }
          const decision = readFileSync(join(root, 'hold.ready'), 'utf8');
          expect(decision.startsWith('cancelled ')).toBe(true);
          const observation = await Promise.race([
            frontend.exited.then((status) => ({ kind: 'ended' as const, status })),
            Bun.sleep(5600).then(() => ({ kind: 'pending' as const })),
          ]);
          const launched = readReceipt(join(root, 'spawned-input.json'));
          const pid = launched['pid'];
          if (typeof pid !== 'number') throw new Error('withdrawal helper PID is absent');
          writeFileSync(
            join(root, 'withdrawal-observation.json'),
            JSON.stringify(
              {
                observation,
                frontendExitCode: frontend.exitCode,
                helperPid: pid,
                helperStat: readFileSync('/proc/' + String(pid) + '/stat', 'utf8'),
                decision,
                logExists: existsSync(join(root, 'hold.log')),
                startupReleased: existsSync(join(root, 'start-gate')),
              },
              null,
              2,
            ),
          );
          expect(observation.kind).toBe('ended');
          expect(frontend.exitCode, await stderr).toBe(0);
          const receipt = readReceipt(join(root, 'receipt.json'));
          expect(receipt['phase']).toBe('refused');
          expect(requireRecord(receipt['refusal'])['reason']).toContain('withdrawal unconfirmed');
          expect(receipt['logExists']).toBe(true);
        } else if (mode === 'ended-fallback-foreign-birth') {
          await frontend.exited;
          writeFileSync(
            join(root, 'fallback-observation.json'),
            JSON.stringify(
              {
                holdExists: existsSync(join(root, 'hold')),
                logExists: existsSync(join(root, 'hold.log')),
                frontendExitCode: frontend.exitCode,
              },
              null,
              2,
            ),
          );
          expect(existsSync(join(root, 'hold'))).toBe(true);
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
          expect(frontend.exitCode, await stderr).toBe(0);
          expect(readReceipt(join(root, 'receipt'))['phase']).toBe('generation-refused');
        } else {
          await frontend.exited;
          expect(frontend.exitCode, await stderr).toBe(0);
          const receipt = readReceipt(join(root, 'receipt.json'));
          if (mode === 'resolve-capture') {
            expect(receipt['prefix']).toEqual(['selected-protected-bun', 'selected-entrypoint']);
            expect(receipt['wall']).toBe(1234);
            expect(receipt['monotonic']).toBe(5678);
          } else if (mode.startsWith('invalid-')) {
            expect(receipt['launches'] ?? 0).toBe(0);
            expect(receipt['phase']).toBe('failed');
          } else if (mode === 'acquire-capture') {
            expect(receipt['phase']).toBe('held');
            const child = readReceipt(join(root, 'owner-child-input.json'));
            expect(child['captureValue']).toBe('captured-parent-environment');
            expect(existsSync(join(root, 'hold.log'))).toBe(false);
          } else if (mode === 'preexisting-token') {
            expect(receipt['reservations']).toBe(0);
            expect(receipt['launches']).toBe(0);
            expect(receipt['phase']).toBe('failed');
            expect(receipt['tokenExists']).toBe(true);
          } else if (mode === 'reservation-race') {
            expect(receipt['launches']).toBe(0);
            expect(receipt['reservations']).toBe(1);
            expect(receipt['phase']).toBe('failed');
            expect(receipt['logExists']).toBe(false);
            expect(receipt['tokenExists']).toBe(true);
            expect(readReceipt(join(root, 'race-input.json'))['logExists']).toBe(true);
          } else if (mode === 'post-spawn-failures') {
            expect(receipt['unrefAttempted']).toBe(true);
            expect(receipt['descriptorClosed']).toBe(true);
            expect(receipt['phase']).toBe('failed');
            expect(requireRecord(receipt['cause'])['errors']).toEqual([
              { message: 'controlled post-spawn observation getter failure' },
              { message: 'controlled post-spawn unref failure' },
              { message: 'controlled post-spawn close failure' },
            ]);
            expect(receipt['logExists']).toBe(true);
            expect((await holdLock(join(root, 'mutex'), () => Promise.resolve())).kind).toBe(
              'busy',
            );
          } else {
            expect(receipt['phase']).toBe('failed');
            expect(requireRecord(receipt['cause'])['message']).toContain('no longer matches');
            const replacement = readReceipt(join(root, 'replacement-input.json'));
            expect(replacement['sameBytes']).toBe(true);
            expect(replacement['beforeInode']).not.toBe(replacement['afterInode']);
            expect((await holdLock(join(root, 'mutex'), () => Promise.resolve())).kind).toBe(
              'busy',
            );
          }
        }
      } catch (cause) {
        failure = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      blocker.resolve(undefined);
      await earlier;
      const capture = process.env['PUNI_PARENT_RESIDUAL_CAPTURE'];
      if (capture !== undefined) {
        for (const name of readdirSync(root))
          if (name.endsWith('.json')) cpSync(join(root, name), join(capture, name));
      }
      if (cleanup.kind === 'failed') {
        if (failure.kind === 'failed')
          throw new AggregateError(
            [failure.cause, cleanup.cause],
            'residual assertion and process cleanup failed',
          );
        throw cleanup.cause;
      }
      rmSync(root, { recursive: true, force: true });
      if (failure.kind === 'failed') throw failure.cause;
    },
    24000,
  );
