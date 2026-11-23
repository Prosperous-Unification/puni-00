import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { holdLock } from '@shared/heavy-lock';
import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function readTokenBytes(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw cause;
  }
}
function decodeIdentity(bytes: string) {
  const fields =
      /^([1-9][0-9]*) ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) (0|[1-9][0-9]*)\n$/u.exec(
        bytes,
      ),
    pid = fields?.at(1),
    boot = fields?.at(2),
    start = fields?.at(3);
  if (pid === undefined || boot === undefined || start === undefined)
    throw new Error('native fixture identity bytes malformed');
  const number = Number(pid);
  if (!Number.isSafeInteger(number) || number > 2147483647)
    throw new Error('native fixture PID outside native range');
  return { pid: number, boot, start };
}
function readHold(path: string) {
  const bytes = readTokenBytes(path);
  return bytes === undefined ? undefined : { path, bytes, identity: decodeIdentity(bytes) };
}
function readDecision(path: string) {
  const bytes = readTokenBytes(path);
  if (bytes === undefined) return undefined;
  const separator = bytes.indexOf(' '),
    kind = bytes.slice(0, separator);
  if (kind !== 'ready' && kind !== 'cancelled' && kind !== 'retired')
    throw new Error('native fixture decision tag malformed');
  return { path, bytes, kind, identity: decodeIdentity(bytes.slice(separator + 1)) };
}
const cases = [
  'overlap-ready-cleanup',
  'overlap-cancel-cleanup',
  'overlap-retired-cleanup',
  'ready-log-unlink-failure',
  'cancel-log-unlink-failure',
  'crash-after-log',
  'retired',
  'fast-retired',
  'ready-decision-mutation',
  'hold',
  'cancel-before',
  'queued-cancel',
  'hold-abort',
  'acquire-then-exit',
  'exit-after-queue',
  'fast-refusal',
  'unconfirmed-ready',
  'unconfirmed-pid',
  'forged-live-birth',
  'reject-wait',
  'missing-callback',
  'false-status',
  'pending-status',
  'callback-error',
  'diagnostics-loss',
  'exit-before-holder-start',
  'timeout-then-abort',
  'fast-refusal-report-failure',
  'fast-refusal-replaced-log',
  'fast-refusal-wrong-boot',
  'fast-refusal-foreign-decision',
  'ready-report-failure',
] as const;
for (const mode of cases)
  it(
    'native host lock ' + mode + ' under an isolated Linux supervisor',
    async () => {
      const name = 'native host lock ' + mode + ' under an isolated Linux supervisor';
      if (process.env['PUNI_HOST_LOCK_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '--test-name-pattern', name],
          {
            cwd: process.cwd(),
            env: { ...process.env, PUNI_HOST_LOCK_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 24000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni native host lock ')),
        path = join(root, 'mutex');
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const frontend = resolve(
        import.meta.dir,
        '../../../apps/twilight-structure/twilight-dash/cli/src/resources/host-lock.test.fixture.ts',
      );
      let failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      async function until(test: () => boolean): Promise<void> {
        const end = performance.now() + 7000;
        while (!test()) {
          if (performance.now() >= end)
            throw new Error('supervised host lock observation did not converge');
          await Bun.sleep(10);
        }
      }
      async function errors(child: Bun.Subprocess): Promise<string> {
        if (!(child.stderr instanceof ReadableStream))
          throw new Error('fixture stderr stream missing');
        return await new Response(child.stderr).text();
      }
      function helperEnded(): boolean {
        const decision = readDecision(join(root, 'hold.ready'));
        if (decision === undefined) throw new Error('retained decision witness missing');
        const identity =
          decision.kind === 'cancelled'
            ? readHold(join(root, 'hold'))?.identity
            : decision.identity;
        if (identity === undefined) throw new Error('retained helper identity missing');
        const tasks = '/proc/' + String(identity.pid) + '/task';
        try {
          return readdirSync(tasks).every((tid) => {
            try {
              const stat = readFileSync(tasks + '/' + tid + '/stat', 'utf8');
              return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ');
            } catch (cause) {
              if (
                cause instanceof Error &&
                'code' in cause &&
                (cause.code === 'ENOENT' || cause.code === 'ESRCH')
              )
                return true;
              throw cause;
            }
          });
        } catch (cause) {
          if (
            cause instanceof Error &&
            'code' in cause &&
            (cause.code === 'ENOENT' || cause.code === 'ESRCH')
          )
            return true;
          throw cause;
        }
      }
      function phase(): string | undefined {
        if (!existsSync(join(root, 'receipt'))) return undefined;
        const receipt: unknown = JSON.parse(readFileSync(join(root, 'receipt'), 'utf8'));
        if (
          typeof receipt !== 'object' ||
          receipt === null ||
          !('phase' in receipt) ||
          typeof receipt.phase !== 'string'
        )
          throw new Error('fixture receipt malformed');
        return receipt.phase;
      }
      const blocker = Promise.withResolvers<undefined>(),
        blocked = Promise.withResolvers<undefined>();
      let earlier: Promise<{ kind: string }> | undefined;
      try {
        if (
          mode === 'overlap-cancel-cleanup' ||
          mode === 'overlap-retired-cleanup' ||
          mode === 'cancel-log-unlink-failure' ||
          mode === 'retired' ||
          mode === 'fast-retired' ||
          mode === 'queued-cancel' ||
          mode === 'exit-after-queue' ||
          mode.startsWith('fast-refusal') ||
          mode === 'missing-callback'
        ) {
          earlier = holdLock(path, async () => {
            blocked.resolve(undefined);
            await blocker.promise;
          });
          await blocked.promise;
        }
        const child = owner.spawn(
          [process.execPath, '--no-env-file', '--config=/dev/null', frontend, mode, root],
          root,
          environment,
          { stdout: 'pipe', stderr: 'pipe' },
        );
        if (mode === 'retired' || mode === 'fast-retired' || mode === 'overlap-retired-cleanup') {
          if (mode === 'retired' || mode === 'overlap-retired-cleanup') {
            await until(
              () =>
                existsSync(path + '.queue') &&
                readdirSync(path + '.queue').some((name) => /^[0-9]{19}-[1-9][0-9]*$/u.test(name)),
            );
            const token = readHold(join(root, 'hold'));
            if (token === undefined) throw new Error('queued helper absent');
            if (mode === 'overlap-retired-cleanup') process.kill(token.identity.pid, 'SIGSTOP');
            writeFileSync(join(root, 'retire'), 'ledger-authorized');
            if (mode === 'overlap-retired-cleanup') {
              await until(() => existsSync(join(root, 'parent-observed-decision')));
              process.kill(token.identity.pid, 'SIGCONT');
            }
          }
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('refused');
          const refusal: unknown = JSON.parse(readFileSync(join(root, 'refusal'), 'utf8'));
          expect(refusal).toEqual({
            kind: 'refused',
            exitCode: 75,
            reason: 'durable holder retired before handoff',
          });
          if (mode === 'fast-retired') {
            expect(existsSync(join(root, 'ended-before-parent-observation'))).toBe(true);
            expect(existsSync(join(root, 'retired-restored-at-native-callback'))).toBe(true);
          }
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (
          mode === 'queued-cancel' ||
          mode === 'cancel-log-unlink-failure' ||
          mode === 'overlap-cancel-cleanup'
        ) {
          await until(
            () =>
              existsSync(path + '.queue') &&
              readdirSync(path + '.queue').some((name) => /^[0-9]{19}-[1-9][0-9]*$/u.test(name)),
          );
          writeFileSync(join(root, 'abort'), 'abort');
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe(
            mode === 'cancel-log-unlink-failure' ? 'cleanup-failed' : 'cancelled',
          );
          if (mode === 'cancel-log-unlink-failure') {
            expect(readDecision(join(root, 'hold.ready'))).toBeDefined();
            expect(readHold(join(root, 'hold'))).toBeDefined();
            await until(helperEnded);
            expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('cancelled');
            expect(readHold(join(root, 'hold'))).toBeDefined();
            expect(existsSync(join(root, 'hold.log'))).toBe(true);
          }
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          expect(
            readdirSync(path + '.queue').filter((name) => /^[0-9]{19}-[1-9][0-9]*$/u.test(name)),
          ).toEqual([]);
        } else if (
          [
            'fast-refusal-replaced-log',
            'fast-refusal-wrong-boot',
            'fast-refusal-foreign-decision',
          ].includes(mode)
        ) {
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('generation-refused');
          expect(existsSync(join(root, 'ended-before-parent-observation'))).toBe(true);
          expect(existsSync(join(root, 'hold'))).toBe(true);
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
          if (mode === 'fast-refusal-replaced-log')
            expect(readFileSync(join(root, 'generation-failure'), 'utf8')).toContain(
              'log pathname was replaced',
            );
          if (mode === 'fast-refusal-foreign-decision')
            expect(existsSync(join(root, 'hold.ready'))).toBe(true);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (mode === 'timeout-then-abort') {
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('refused');
          expect(readFileSync(join(root, 'refusal'), 'utf8')).toContain('claim budget');
          expect(existsSync(path)).toBe(false);
        } else if (mode === 'ready-report-failure') {
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('reporting-failed');
          expect(existsSync(join(root, 'native-observed'))).toBe(true);
          expect(existsSync(join(root, 'authorized-release'))).toBe(true);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('owned');
        } else if (mode === 'fast-refusal-report-failure') {
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('reporting-failed');
          expect(existsSync(join(root, 'native-observed'))).toBe(true);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (mode === 'fast-refusal') {
          await until(() => child.exitCode !== null);
          expect(existsSync(join(root, 'ended-before-parent-observation'))).toBe(true);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('refused');
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (mode === 'reject-wait') {
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('refused');
          expect(readFileSync(join(root, 'refusal'), 'utf8')).toContain('ownership retained');
          await until(() => existsSync(join(root, 'hold.ready')));
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          expect(existsSync(join(root, 'hold'))).toBe(true);
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
          unlinkSync(join(root, 'hold'));
          await until(helperEnded);
          expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('ready');
        } else if (mode === 'missing-callback') {
          await until(() => child.exitCode !== null);
          expect(existsSync(join(root, 'hold'))).toBe(true);
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
          expect(await child.exited, await errors(child)).toBe(0);
          expect(phase()).toBe('refused');
          expect(readFileSync(join(root, 'refusal'), 'utf8')).toContain('callback missing');
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (mode === 'forged-live-birth') {
          await until(() => child.exitCode !== null || phase() === 'held');
          expect(phase()).toBe('generation-refused');
          expect(await child.exited, await errors(child)).toBe(0);
          expect(readFileSync(join(root, 'generation-failure'), 'utf8')).toContain('birth');
          const original = readHold(join(root, 'actual-birth')),
            forged = readHold(join(root, 'hold'));
          if (original === undefined || forged === undefined)
            throw new Error('forged-birth fixture witnesses absent');
          expect(forged.identity.pid).toBe(original.identity.pid);
          expect(forged.identity.boot).toBe(original.identity.boot);
          expect(forged.identity.start).not.toBe(original.identity.start);
          expect(readDecision(join(root, 'hold.ready'))?.identity).toEqual(forged.identity);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        } else if (mode === 'unconfirmed-ready' || mode === 'unconfirmed-pid') {
          await until(() => child.exitCode !== null || phase() === 'held');
          expect(phase()).toBe('refused');
          expect(await child.exited).toBe(0);
          expect(readFileSync(join(root, 'refusal'), 'utf8')).toContain('uncorroborated');
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          expect(existsSync(join(root, 'hold'))).toBe(true);
          expect(existsSync(join(root, 'hold.ready'))).toBe(true);
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
          unlinkSync(join(root, 'hold'));
          await until(helperEnded);
          expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('ready');
        } else if (mode === 'cancel-before') {
          await until(() => child.exitCode !== null);
          expect(await child.exited).toBe(0);
          expect(phase()).toBe('cancelled');
          expect(existsSync(path)).toBe(false);
        } else {
          if (mode === 'exit-before-holder-start') {
            await until(() => child.exitCode !== null);
            expect(await child.exited, await errors(child)).toBe(0);
            expect(phase()).toBe('startup-exit');
            expect(existsSync(join(root, 'hold'))).toBe(false);
            expect(existsSync(join(root, 'hold.log'))).toBe(true);
            writeFileSync(join(root, 'start-gate'), 'start');
            await until(() => existsSync(join(root, 'hold.ready')));
          } else if (mode === 'exit-after-queue') {
            await until(() => child.exitCode !== null);
            expect(await child.exited).toBe(0);
            expect(phase()).toBe('queued-exit');
            blocker.resolve(undefined);
            await earlier;
            await until(() => existsSync(join(root, 'hold.ready')));
          } else await until(() => phase() === 'held' || child.exitCode !== null);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          expect(existsSync(join(root, 'hold.ready'))).toBe(true);
          if (mode === 'hold') {
            const ready = readDecision(join(root, 'hold.ready'));
            if (ready === undefined) throw new Error('ready absent');
            expect(readFileSync(join(root, 'ready-retirement-refused'), 'utf8')).toBe('exclusive');
            expect(readDecision(ready.path)).toEqual(ready);
          }
          if (mode === 'hold')
            expect(readFileSync(join(root, 'reported'), 'utf8')).toContain('heavy lock: waited');
          if (mode === 'diagnostics-loss') {
            chmodSync(join(root, 'hold.log'), 0);
            writeFileSync(join(root, 'probe'), 'probe');
            await until(() => phase() === 'diagnostics-unavailable' || child.exitCode !== null);
            expect(phase(), child.exitCode === null ? '' : await errors(child)).toBe(
              'diagnostics-unavailable',
            );
            expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
            chmodSync(join(root, 'hold.log'), 0o600);
          }
          if (mode === 'hold-abort') {
            writeFileSync(join(root, 'abort'), 'abort');
            await until(() => phase() === 'aborted-held');
            await Bun.sleep(100);
            expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
            expect(child.exitCode).toBe(null);
          }
          if (
            mode === 'acquire-then-exit' ||
            mode === 'exit-after-queue' ||
            mode === 'exit-before-holder-start'
          ) {
            await until(() => child.exitCode !== null);
            expect(await child.exited).toBe(0);
            unlinkSync(join(root, 'hold'));
            await until(helperEnded);
            expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('ready');
          } else {
            writeFileSync(join(root, 'release'), 'release');
            await until(() => child.exitCode !== null);
            expect(await child.exited, await errors(child)).toBe(0);
            if (mode === 'ready-log-unlink-failure' || mode === 'crash-after-log') {
              expect(readDecision(join(root, 'hold.ready'))).toBeDefined();
              await until(helperEnded);
              expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('ready');
              expect(existsSync(join(root, 'hold.log'))).toBe(mode === 'ready-log-unlink-failure');
              if (mode === 'ready-log-unlink-failure') expect(phase()).toBe('cleanup-failed');
            } else if (
              [
                'false-status',
                'pending-status',
                'callback-error',
                'ready-decision-mutation',
              ].includes(mode)
            ) {
              if (mode === 'callback-error') expect(existsSync(join(root, 'hold.log'))).toBe(true);
              expect(phase()).toBe('observation-failed');
              expect(readFileSync(join(root, 'observation-failure'), 'utf8')).toContain(
                mode === 'ready-decision-mutation'
                  ? 'no longer matches'
                  : mode === 'callback-error'
                    ? 'unconfirmed'
                    : 'disagree or failed',
              );
            } else expect(phase()).toBe('finished');
          }
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('owned');
        }
        if (
          ![
            'ready-log-unlink-failure',
            'cancel-log-unlink-failure',
            'crash-after-log',
            'acquire-then-exit',
            'exit-after-queue',
            'exit-before-holder-start',
            'unconfirmed-ready',
            'unconfirmed-pid',
            'reject-wait',
            'missing-callback',
            'callback-error',
            'ready-decision-mutation',
            'fast-refusal-replaced-log',
            'fast-refusal-wrong-boot',
            'fast-refusal-foreign-decision',
            'forged-live-birth',
          ].includes(mode)
        )
          for (const suffix of ['', '.ready', '.log'])
            expect(existsSync(join(root, 'hold' + suffix))).toBe(false);
        if (mode.startsWith('overlap-')) {
          expect(readFileSync(join(root, 'native-observed'), 'utf8')).toBe('confirmed');
          expect(readFileSync(join(root, 'reconciled'), 'utf8')).toBe(
            'log-first, final witness last',
          );
          expect(existsSync(join(root, 'parent-observed-decision'))).toBe(true);
        }
        if (mode === 'ready-decision-mutation')
          expect(existsSync(join(root, 'hold.log'))).toBe(true);
        if (mode === 'ready-decision-mutation')
          expect(readDecision(join(root, 'hold.ready'))?.kind).toBe('retired');
      } catch (cause) {
        failure = { kind: 'failed', cause };
      }
      blocker.resolve(undefined);
      await earlier;
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      if (cleanup.kind === 'failed') {
        if (failure.kind === 'failed')
          throw new AggregateError(
            [failure.cause, cleanup.cause],
            'native host lock assertion and owned cleanup failed',
          );
        throw cleanup.cause;
      }
      rmSync(root, { recursive: true, force: true });
      if (failure.kind === 'failed') throw failure.cause;
    },
    30000,
  );
