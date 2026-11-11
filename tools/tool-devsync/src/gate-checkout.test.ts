import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';
const gitExecutable = realpathSync('/usr/bin/git');
function git(tree: string, ...argv: string[]) {
  const child = Bun.spawnSync([gitExecutable, '-C', tree, ...argv], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
async function until(ready: () => boolean) {
  const end = performance.now() + 6000;
  while (!ready()) {
    if (performance.now() >= end) throw Error('gate native observation did not converge');
    await Bun.sleep(10);
  }
}
async function expectEnded(child: Pick<Bun.Subprocess, 'exited'>): Promise<void> {
  const observed = await Promise.race([
    child.exited.then((status) => ({ kind: 'ended' as const, status })),
    Bun.sleep(500).then(() => ({ kind: 'pending' as const })),
  ]);
  expect(observed.kind).toBe('ended');
  if (observed.kind === 'ended') expect(observed.status).toBe(0);
  await child.exited;
}
for (const mode of [
  'queued',
  'return-early',
  'cleanup-signal',
  'term-signal',
  'restore-signal',
  'checkout-signal',
  'finish-signal',
  'final-signal',
  'final-error-signal',
  'nonzero-signal',
  'restore-error-signal',
  'pending-admission',
  'pending-head',
  'pending-work',
  'pending-failure',
  'pending-cleanup',
  'unknown',
  'unknown-identity',
  'missing-callback',
  'observer-throw',
  'false-status',
  'false-failure',
  'kind-change',
] as const)
  it(
    'owned gate checkout ' + mode + ' under isolated Linux supervision',
    async () => {
      const name = 'owned gate checkout ' + mode + ' under isolated Linux supervision';
      if (process.env['PUNI_GATE_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '--test-name-pattern', name],
          {
            env: { ...process.env, PUNI_GATE_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 16000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni gate native ')),
        tree = join(root, 'tree'),
        path = join(root, 'mutex'),
        record = join(root, 'record');
      mkdirSync(tree);
      git(tree, 'init', '-qb', 'original');
      git(tree, 'config', 'user.name', 'Gate');
      git(tree, 'config', 'user.email', 'gate@example.test');
      writeFileSync(join(tree, 'tracked'), 'old');
      git(tree, 'add', '.');
      git(tree, 'commit', '-qm', 'old');
      const original = git(tree, 'rev-parse', 'HEAD');
      writeFileSync(join(tree, 'tracked'), 'new');
      git(tree, 'commit', '-qam', 'new');
      const commit = git(tree, 'rev-parse', 'HEAD');
      git(tree, 'update-ref', 'refs/heads/requested-moved', commit);
      git(tree, 'checkout', '-q', '-B', 'original', original);
      const release = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>();
      const { holdLock } = await import('@shared/heavy-lock');
      const blocking =
        mode === 'queued'
          ? holdLock(path, async () => {
              entered.resolve(undefined);
              await release.promise;
            })
          : Promise.resolve();
      if (mode === 'queued') await entered.promise;
      let failure: unknown;
      try {
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gate-checkout.test.fixture.ts',
        );
        const environment: Record<string, string> = Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
        let selectedGit = gitExecutable;
        if (mode === 'restore-signal' || mode === 'checkout-signal' || mode === 'finish-signal') {
          selectedGit = join(root, 'delayed-git');
          writeFileSync(
            selectedGit,
            '#!' +
              process.execPath +
              '\nimport{existsSync,writeFileSync}from"node:fs";const argv=process.argv.slice(2);if(' +
              (mode === 'finish-signal'
                ? 'argv.includes("rev-parse")&&argv.at(-1)==="HEAD^{commit}"&&existsSync(' +
                  JSON.stringify(record + '.child-end') +
                  ')'
                : 'argv.includes("checkout")&&argv.at(-1)===' +
                  JSON.stringify(mode === 'checkout-signal' ? commit : original)) +
              '){writeFileSync(' +
              JSON.stringify(record + '.git-wait') +
              ',"waiting");while(!existsSync(' +
              JSON.stringify(record + '.release') +
              '))await Bun.sleep(10);}const child=Bun.spawnSync(["/usr/bin/git",...argv],{env:process.env,stdin:"ignore",stdout:"inherit",stderr:"inherit"});process.exit(child.exitCode);',
            { mode: 0o755 },
          );
        }
        const capture = process.env['PUNI_GATE_R5_CAPTURE'];
        if (capture !== undefined) {
          const name = randomUUID();
          cpSync(root, join(capture, name), { recursive: true, verbatimSymlinks: true });
          writeFileSync(
            join(capture, name + '.json'),
            JSON.stringify({
              tree,
              path,
              record,
              mode,
              commit,
              original,
              gitExecutable: selectedGit,
              fixture,
            }),
          );
        }
        const child = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            tree,
            commit,
            path,
            record,
            mode,
            selectedGit,
          ],
          root,
          environment,
        );
        if (mode === 'kind-change') {
          await until(() => existsSync(record + '.outcome') || child.exitCode !== null);
          expect(existsSync(record + '.work')).toBe(false);
          expect(JSON.parse(readFileSync(record + '.outcome', 'utf8'))).not.toMatchObject({
            value: { status: 0 },
          });
          await expectEnded(child);
        } else if (mode.startsWith('pending-')) {
          await until(() => existsSync(record + '.pending') || child.exitCode !== null);
          expect(existsSync(record + '.pending')).toBe(true);
          const lifetime = await Promise.race([
            child.exited.then((status) => ({ kind: 'ended' as const, status })),
            Bun.sleep(150).then(() => ({ kind: 'pending' as const })),
          ]);
          expect(lifetime.kind).toBe('pending');
          const expectedHead =
            mode === 'pending-admission' || mode === 'pending-failure' ? original : commit;
          expect(git(tree, 'rev-parse', 'HEAD')).toBe(expectedHead);
          expect((await holdLock(path, () => Promise.resolve(undefined))).kind).toBe(
            mode === 'pending-cleanup' ? 'owned' : 'busy',
          );
          if (mode === 'pending-cleanup') child.kill('SIGINT');
          child.kill('SIGUSR2');
          await until(() => existsSync(record + '.outcome') || child.exitCode !== null);
          expect(JSON.parse(readFileSync(record + '.outcome', 'utf8'))).toMatchObject({
            kind: 'completed',
            value: {
              status: mode === 'pending-cleanup' ? 70 : mode === 'pending-failure' ? 37 : 0,
            },
            interruption:
              mode === 'pending-cleanup' ? { kind: 'native', signal: 'SIGINT' } : { kind: 'none' },
          });
          expect(git(tree, 'rev-parse', 'HEAD')).toBe(
            mode === 'pending-cleanup' ? commit : original,
          );
          await expectEnded(child);
        } else {
          if (mode === 'queued') {
            await until(() => existsSync(path + '.queue') || child.exitCode !== null);
            expect(child.exitCode).toBe(null);
            expect(git(tree, 'rev-parse', 'HEAD')).toBe(original);
            expect(existsSync(record + '.work')).toBe(false);
            git(tree, 'update-ref', 'refs/heads/requested-moved', original);
            release.resolve(undefined);
            await blocking;
          }
          await until(
            () =>
              existsSync(record + '.payload') ||
              (mode === 'checkout-signal' && existsSync(record + '.git-wait')) ||
              existsSync(record + '.outcome') ||
              child.exitCode !== null,
          );
          if (mode === 'unknown' || mode === 'missing-callback' || mode === 'unknown-identity') {
            if (mode === 'missing-callback') {
              await until(
                () => existsSync(record + '.child-end') || existsSync(record + '.outcome'),
              );
              await Bun.sleep(1200);
              expect(existsSync(record + '.unconfirmed')).toBe(true);
            } else
              await until(
                () => existsSync(record + '.unconfirmed') || existsSync(record + '.outcome'),
              );
            expect(existsSync(record + '.child-end')).toBe(true);
            const lifetime = await Promise.race([
              child.exited.then((status) => ({ kind: 'ended' as const, status })),
              Bun.sleep(150).then(() => ({ kind: 'pending' as const })),
            ]);
            expect(lifetime.kind).toBe('pending');
            expect(existsSync(record + '.outcome')).toBe(false);
            expect(git(tree, 'rev-parse', 'HEAD')).toBe(commit);
            expect((await holdLock(path, () => Promise.resolve(undefined))).kind).toBe('busy');
          } else if (
            mode === 'observer-throw' ||
            mode === 'false-status' ||
            mode === 'false-failure'
          ) {
            await until(() => existsSync(record + '.child-end') || existsSync(record + '.outcome'));
            expect(existsSync(record + '.child-end')).toBe(true);
            await until(() => existsSync(record + '.outcome'));
            expect(JSON.parse(readFileSync(record + '.outcome', 'utf8'))).toMatchObject({
              value: { status: 70 },
            });
            expect(git(tree, 'rev-parse', 'HEAD')).toBe(original);
          } else {
            if (mode === 'return-early') {
              expect(existsSync(record + '.outcome')).toBe(false);
              expect(git(tree, 'rev-parse', 'HEAD')).toBe(commit);

              expect((await holdLock(path, () => Promise.resolve(undefined))).kind).toBe('busy');
            }
            if (
              mode === 'cleanup-signal' ||
              mode === 'term-signal' ||
              mode === 'restore-signal' ||
              mode === 'checkout-signal' ||
              mode === 'finish-signal' ||
              mode === 'final-signal' ||
              mode === 'final-error-signal' ||
              mode === 'nonzero-signal' ||
              mode === 'restore-error-signal'
            ) {
              await until(() =>
                existsSync(
                  record +
                    (mode === 'cleanup-signal' ||
                    mode === 'term-signal' ||
                    mode === 'nonzero-signal' ||
                    mode === 'restore-error-signal'
                      ? '.cleanup'
                      : '.git-wait'),
                ),
              );
              child.kill(mode === 'term-signal' ? 'SIGTERM' : 'SIGINT');
              await Bun.sleep(30);
              expect(child.exitCode).toBe(null);
              expect(git(tree, 'rev-parse', 'HEAD')).toBe(
                mode === 'checkout-signal' ? original : commit,
              );
              if (mode === 'cleanup-signal') {
                child.kill('SIGTERM');
                await Bun.sleep(20);
              }
              expect((await holdLock(path, () => Promise.resolve(undefined))).kind).toBe('busy');
              writeFileSync(record + '.release', 'released');
            }
            await until(() => existsSync(record + '.outcome') || child.exitCode !== null);
            expect(JSON.parse(readFileSync(record + '.outcome', 'utf8'))).toMatchObject({
              value: {
                status:
                  mode === 'restore-error-signal' || mode === 'final-error-signal'
                    ? 74
                    : mode === 'nonzero-signal'
                      ? 37
                      : mode === 'term-signal'
                        ? 143
                        : mode.endsWith('signal')
                          ? 130
                          : 0,
              },
              interruption: mode.endsWith('signal')
                ? { kind: 'native', signal: mode === 'term-signal' ? 'SIGTERM' : 'SIGINT' }
                : { kind: 'none' },
            });
            expect(readFileSync(record + '.head', 'utf8')).toBe(commit);
            if (mode === 'checkout-signal') expect(existsSync(record + '.work')).toBe(false);
            expect(existsSync(record + '.child-end')).toBe(mode !== 'checkout-signal');
            expect(git(tree, 'rev-parse', 'HEAD')).toBe(original);
            if (mode === 'final-signal')
              expect(git(tree, 'symbolic-ref', 'HEAD')).toBe('refs/heads/original');
            await expectEnded(child);
          }
        }
      } catch (cause) {
        failure = cause;
      } finally {
        release.resolve(undefined);
        await blocking;
        try {
          await owner.stop();
        } catch (cause) {
          failure =
            failure === undefined
              ? cause
              : new AggregateError([failure, cause], 'gate fixture and native cleanup failed');
        }
        if (failure === undefined) rmSync(root, { recursive: true });
      }
      if (failure !== undefined)
        throw failure instanceof Error
          ? failure
          : new Error('native checkout fixture failed', { cause: failure });
    },
    20000,
  );
