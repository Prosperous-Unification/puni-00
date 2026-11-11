import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { holdLock } from '@shared/heavy-lock';
import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

for (const fault of ['reject-wait', 'missing-callback'] as const) {
  const name =
    fault === 'reject-wait'
      ? 'keeps foreground ownership after rejected wait until real native completion in an isolated Linux supervisor'
      : 'retains native foreground authority without ambient references after a missing callback in an isolated Linux supervisor';
  it(
    name,
    async () => {
      if (process.env['PUNI_FOREGROUND_SUPERVISOR_TEST'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '--test-name-pattern', name],
          {
            cwd: process.cwd(),
            env: { ...process.env, PUNI_FOREGROUND_SUPERVISOR_TEST: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 25000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni foreground supervisor '));
      const path = join(root, 'mutex'),
        record = join(root, 'admission'),
        payload = join(root, 'payload.ts'),
        ready = join(root, 'ready'),
        release = join(root, 'release'),
        done = join(root, 'done');
      const helper = resolve(
        import.meta.dir,
        '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/foreground.test.fixture.ts',
      );
      writeFileSync(
        payload,
        [
          'import{existsSync,writeFileSync}from"node:fs";',
          'writeFileSync(process.argv[2],String(process.pid));',
          'const end=performance.now()+10000;while(!existsSync(process.argv[3])){if(performance.now()>=end)throw new Error("payload release missing");await Bun.sleep(10);}',
          'writeFileSync(process.argv[4],"done");',
        ].join(String.fromCharCode(10)),
      );
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      environment['PUNI_FOREGROUND_FAULT'] = fault;
      let failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      async function until(observe: () => boolean) {
        const end = performance.now() + 4000;
        while (!observe()) {
          if (performance.now() >= end)
            throw new Error('supervised foreground observation did not converge');
          await Bun.sleep(10);
        }
      }
      try {
        const child = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            helper,
            path,
            root,
            record,
            process.execPath,
            payload,
            ready,
            release,
            done,
          ],
          root,
          environment,
          { stdout: 'pipe', stderr: 'pipe' },
        );
        await until(() => child.exitCode !== null || existsSync(ready));
        expect(existsSync(ready)).toBe(true);
        expect(existsSync(record + '.outcome')).toBe(false);
        expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        writeFileSync(release, 'release');
        if (fault === 'reject-wait') {
          await until(() => child.exitCode !== null);
          expect(await child.exited).toBe(70);
          expect(existsSync(done)).toBe(true);
          const pid = readFileSync(ready, 'utf8');
          expect(pid).toMatch(/^[1-9][0-9]*$/u);
          expect(existsSync('/proc/' + pid)).toBe(false);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('owned');
        } else {
          await until(
            () =>
              child.exitCode !== null ||
              (existsSync(done) && readFileSync(record, 'utf8').includes('unconfirmed')),
          );
          const observed = await Promise.race([
            child.exited.then((status) => ({ kind: 'exited' as const, status })),
            Bun.sleep(100).then(() => ({ kind: 'pending' as const })),
          ]);
          expect(observed.kind).toBe('pending');
          expect(existsSync(done)).toBe(true);
          expect(existsSync(record + '.outcome')).toBe(false);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
        }
      } catch (cause) {
        failure = { kind: 'failed', cause };
      }
      writeFileSync(release, 'release');
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      if (cleanup.kind === 'failed') {
        if (failure.kind === 'failed')
          throw new AggregateError(
            [failure.cause, cleanup.cause],
            'foreground assertion and owned cleanup failed',
          );
        throw cleanup.cause;
      }
      rmSync(root, { recursive: true, force: true });
      if (failure.kind === 'failed') throw failure.cause;
    },
    30000,
  );
}
