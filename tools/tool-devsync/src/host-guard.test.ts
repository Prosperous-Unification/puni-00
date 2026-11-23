import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { holdLock } from '@shared/heavy-lock';
import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

for (const mode of [
  'stop-queued',
  'stop-ready',
  'preledger-ready',
  'queued-restart',
  'replace-charged',
] as const)
  it(
    'guard ' + mode + ' settles handoff before closing the ledger in an isolated Linux supervisor',
    async () => {
      const name =
        'guard ' +
        mode +
        ' settles handoff before closing the ledger in an isolated Linux supervisor';
      if (process.env['PUNI_GUARD_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '--test-name-pattern', name],
          {
            cwd: process.cwd(),
            env: { ...process.env, PUNI_GUARD_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 30000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni guard supervisor ')),
        path = join(root, 'mutex'),
        file = join(root, 'managed', '.dash', 'legacy-holds', 'dash-singleton');
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const credential = `wbs_mk_${crypto.randomUUID()}.${'k'.repeat(43)}`;
      const helper = resolve(
        import.meta.dir,
        '../../../apps/twilight-structure/twilight-dash/cli/src/resources/testing/singleton-guard.test.fixture.ts',
      );
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      let earlier: Promise<unknown> | undefined,
        failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
      async function until(test: () => boolean): Promise<void> {
        const end = performance.now() + 9000;
        while (!test()) {
          if (performance.now() >= end)
            throw new Error('supervised guard observation did not converge');
          await Bun.sleep(10);
        }
      }
      async function errors(child: Bun.Subprocess): Promise<string> {
        if (!(child.stderr instanceof ReadableStream))
          throw new Error('guard fixture stderr stream missing');
        return await new Response(child.stderr).text();
      }
      try {
        if (mode === 'stop-queued' || mode === 'queued-restart') {
          earlier = holdLock(path, async () => {
            entered.resolve(undefined);
            await release.promise;
          });
          await entered.promise;
        }
        const child = owner.spawn(
          [process.execPath, '--no-env-file', '--config=/dev/null', helper, mode, root, credential],
          root,
          environment,
          { stdout: 'pipe', stderr: 'pipe' },
        );
        if (mode === 'replace-charged') {
          const phase = () =>
            existsSync(join(root, 'receipt')) ? readFileSync(join(root, 'receipt'), 'utf8') : '';
          await until(() => phase().includes('"phase":"charged"') || child.exitCode !== null);
          expect(child.exitCode, child.exitCode === null ? '' : await errors(child)).toBe(null);
          writeFileSync(join(root, 'kill'), 'kill');
          await until(() => phase().includes('"phase":"replaced"') || child.exitCode !== null);
          expect(child.exitCode, child.exitCode === null ? '' : await errors(child)).toBe(null);
          const receipt: unknown = JSON.parse(phase());
          expect(receipt).toHaveProperty('guardLost');
          expect(receipt).toMatchObject({ phase: 'replaced', compute: 'held' });
          if (
            typeof receipt !== 'object' ||
            receipt === null ||
            !('oldPid' in receipt) ||
            !('pid' in receipt) ||
            !('oldBirth' in receipt) ||
            !('birth' in receipt) ||
            !('guardLost' in receipt) ||
            !('reservedBefore' in receipt) ||
            !('reservedAfter' in receipt)
          )
            throw new Error('charged replacement receipt malformed');
          expect(receipt.birth).not.toEqual(receipt.oldBirth);
          expect(receipt.guardLost).toMatchObject({ holderPid: receipt.oldPid });
          expect(receipt.reservedAfter).toEqual(receipt.reservedBefore);
          expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          writeFileSync(join(root, 'stop'), 'stop');
          await until(() => child.exitCode !== null);
          expect(await child.exited, await errors(child)).toBe(0);
        } else {
          let frontend = child;
          if (mode === 'stop-queued' || mode === 'queued-restart')
            await until(
              () =>
                existsSync(path + '.queue') &&
                readdirSync(path + '.queue').some((name) => /^[0-9]{19}-[1-9][0-9]*$/u.test(name)),
            );
          else
            await until(
              () => existsSync(file + '.ready') && existsSync(join(root, 'suppressed-output')),
            );
          if (mode === 'preledger-ready' || mode === 'queued-restart') {
            const originalBirth = readFileSync(file, 'utf8');
            const ledger = new Database(join(root, 'managed', '.dash', 'resources.sqlite'), {
              readonly: true,
            });
            try {
              expect(
                ledger
                  .query<{ guard_holder: string | null }, []>(
                    'SELECT guard_holder FROM host_pool WHERE id=1',
                  )
                  .get()?.guard_holder,
              ).toBe(null);
            } finally {
              ledger.close();
            }
            child.kill('SIGKILL');
            expect(await child.exited).toBe(137);
            frontend = owner.spawn(
              [
                process.execPath,
                '--no-env-file',
                '--config=/dev/null',
                helper,
                'adopt',
                root,
                credential,
              ],
              root,
              environment,
              { stdout: 'pipe', stderr: 'pipe' },
            );
            if (mode === 'queued-restart') {
              await until(
                () =>
                  readFileSync(join(root, 'receipt'), 'utf8').includes('"phase":"adopting"') ||
                  frontend.exitCode !== null,
              );
              expect(
                frontend.exitCode,
                frontend.exitCode === null ? '' : await errors(frontend),
              ).toBe(null);
              expect(readFileSync(file, 'utf8')).toBe(originalBirth);
              expect(existsSync(file + '.ready')).toBe(false);
              release.resolve(undefined);
              await earlier;
            }
            await until(
              () =>
                readFileSync(join(root, 'receipt'), 'utf8').includes('"phase":"adopted"') ||
                frontend.exitCode !== null,
            );
            expect(readFileSync(file, 'utf8')).toBe(originalBirth);
            expect(
              frontend.exitCode,
              frontend.exitCode === null ? '' : await errors(frontend),
            ).toBe(null);
          }
          writeFileSync(join(root, 'stop'), 'stop');
          await until(() => frontend.exitCode !== null);
          expect(await frontend.exited, await errors(frontend)).toBe(0);
          if (mode === 'stop-queued') {
            expect(existsSync(file)).toBe(false);
            expect(existsSync(file + '.ready')).toBe(false);
            expect(existsSync(file + '.log')).toBe(false);
            expect(readdirSync(path + '.queue')).toEqual([]);
            expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
          } else {
            const ledger = new Database(join(root, 'managed', '.dash', 'resources.sqlite'), {
              readonly: true,
            });
            let encoded: string | null;
            try {
              const row = ledger
                .query<{ guard_holder: string | null }, []>(
                  'SELECT guard_holder FROM host_pool WHERE id=1',
                )
                .get();
              if (row === null) throw new Error('guard fixture ledger row missing');
              encoded = row.guard_holder;
            } finally {
              ledger.close();
            }
            expect(encoded).not.toBe(null);
            expect(encoded).toContain('lockPath');
            if (encoded === null) throw new Error('guard adoption did not record a holder');
            const birth = readFileSync(file, 'utf8').trim().split(' ');
            expect(birth.length).toBe(3);
            expect(JSON.parse(encoded)).toMatchObject({
              pid: Number(birth[0]),
              boot: birth[1],
              start: birth[2],
              lockPath: path,
            });
            expect((await holdLock(path, () => Promise.resolve())).kind).toBe('busy');
            expect(existsSync(file)).toBe(true);
            expect(existsSync(file + '.ready')).toBe(true);
            const restart = owner.spawn(
              [
                process.execPath,
                '--no-env-file',
                '--config=/dev/null',
                helper,
                'drain',
                root,
                credential,
              ],
              root,
              environment,
              { stdout: 'pipe', stderr: 'pipe' },
            );
            await until(() => restart.exitCode !== null);
            expect(await restart.exited, await errors(restart)).toBe(0);
            expect(readFileSync(join(root, 'receipt'), 'utf8')).toContain('drained');
            for (const suffix of ['', '.ready', '.log'])
              expect(existsSync(file + suffix)).toBe(false);
            expect((await holdLock(path, () => Promise.resolve())).kind).toBe('owned');
          }
        }
      } catch (cause) {
        failure = { kind: 'failed', cause };
      }
      release.resolve(undefined);
      await earlier;
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      if (cleanup.kind === 'failed') {
        if (failure.kind === 'failed')
          throw new AggregateError(
            [failure.cause, cleanup.cause],
            'guard assertion and cleanup failed',
          );
        throw cleanup.cause;
      }
      rmSync(root, { recursive: true, force: true });
      if (failure.kind === 'failed') throw failure.cause;
    },
    35000,
  );
