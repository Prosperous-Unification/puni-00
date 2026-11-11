import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { parseOrThrow, type } from '@shared/validation';
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';
import { writeInstalledLintProbe } from './testing/installed-lint-probe';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function waitPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('owned native output fixture absent: ' + path);
}
async function waitExit(child: { exited: Promise<number> }, milliseconds = 7000): Promise<number> {
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new Error('owned installed parent did not settle'));
  }, milliseconds);
  try {
    return await Promise.race([child.exited, expiry.promise]);
  } finally {
    clearTimeout(timer);
  }
}
function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}
function assertGone(pid: number): void {
  try {
    process.kill(-pid, 0);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
  throw new Error('owned native fixture group remains');
}
async function cleanupGraph(root: string): Promise<void> {
  for (const name of ['stage.pid', 'launcher.pid']) {
    const path = join(root, name);
    if (existsSync(path)) {
      killGroup(Number(readFileSync(path, 'utf8')));
      await Bun.sleep(75);
    }
  }
}
function createFixture(channel: 'stdout' | 'stderr') {
  const fixture = createInstalledLintFixture(
    launcher,
    (root) =>
      'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);process.on("SIGTERM",()=>undefined);writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));process.' +
      channel +
      '.write(Buffer.alloc(8*1024*1024,65));setInterval(()=>undefined,1000);',
  );
  roots.push(fixture.root);
  return fixture;
}

describe('actual installed parent native output ownership', () => {
  for (const channel of ['stdout', 'stderr'] as const) {
    it(
      'cleans nested stages when the real parent ' + channel + ' consumer closes',
      async () => {
        const fixture = createFixture(channel);
        const fifo = join(fixture.root, 'closed-' + channel);
        const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
        expect(created.exitCode, created.stderr.toString()).toBe(0);
        const reader = Bun.spawn(['head', '-c', '1', fifo], {
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const consumed = new Response(reader.stdout).arrayBuffer();
        const argv = createLaunch(process.execPath, writeInstalledLintProbe(fixture, channel));
        const options = {
          cwd: import.meta.dir,
          env: { PATH: '/usr/bin:/bin' },
          stdin: 'ignore' as const,
          detached: true,
        };
        const child =
          channel === 'stdout'
            ? Bun.spawn([...argv], { ...options, stdout: Bun.file(fifo), stderr: 'pipe' })
            : Bun.spawn([...argv], { ...options, stdout: 'pipe', stderr: Bun.file(fifo) });
        const stream = channel === 'stdout' ? child.stderr : child.stdout;
        if (typeof stream === 'number') throw new Error('native output capture missing');
        const captured = new Response(stream).text();
        try {
          expect(await waitExit(reader)).toBe(0);
          expect(Buffer.from(await consumed)).toEqual(Buffer.from([65]));
          expect(await waitExit(child)).toBe(1);
          expect(child.signalCode).toBeNull();
          await waitPath(join(fixture.root, 'stage.pid'));
          assertGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
          assertGone(Number(readFileSync(join(fixture.root, 'launcher.pid'), 'utf8')));
          expect(readdirSync(fixture.scratch)).toEqual([]);
          await captured;
        } finally {
          await cleanupGraph(fixture.root);
          if (child.exitCode === null) killGroup(child.pid);
          if (reader.exitCode === null) reader.kill('SIGKILL');
          await Promise.allSettled([child.exited, reader.exited, captured, consumed]);
        }
      },
      15000,
    );
  }
  for (const repeated of [false, true]) {
    it(
      'settles a real stalled parent FileSink with ' +
        (repeated ? 'repeated' : 'first') +
        ' cancellation',
      async () => {
        const fixture = createFixture('stdout');
        const fifo = join(fixture.root, 'stalled-stdout');
        const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
        expect(created.exitCode, created.stderr.toString()).toBe(0);
        const ready = join(fixture.root, 'reader.ready');
        const helper = join(fixture.root, 'hold-reader.mjs');
        writeFileSync(
          helper,
          'import{constants,openSync,writeFileSync}from"node:fs";openSync(' +
            JSON.stringify(fifo) +
            ',constants.O_RDONLY|constants.O_NONBLOCK);writeFileSync(' +
            JSON.stringify(ready) +
            ',"ready");setInterval(()=>undefined,1000);',
        );
        const reader = Bun.spawn([...createLaunch(process.execPath, helper)], {
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'pipe',
        });
        let child: Bun.Subprocess<'ignore', Bun.BunFile, 'pipe'> | undefined;
        let captured: Promise<string> | undefined;
        try {
          await waitPath(ready);
          child = Bun.spawn(
            [...createLaunch(process.execPath, writeInstalledLintProbe(fixture, 'stdout'))],
            {
              cwd: import.meta.dir,
              env: { PATH: '/usr/bin:/bin' },
              stdin: 'ignore',
              stdout: Bun.file(fifo),
              stderr: 'pipe',
              detached: true,
            },
          );
          captured = new Response(child.stderr).text();
          await waitPath(join(fixture.root, 'stage.pid'));
          const progress = join(fixture.root, 'parent-write.json');
          await waitPath(progress);
          await Bun.sleep(100);
          const observation = parseOrThrow(
            type({ started: 'number.integer>=1', finished: 'number.integer>=0' }),
            JSON.parse(readFileSync(progress, 'utf8')),
          );
          expect(observation.started).toBeGreaterThan(observation.finished);
          expect(child.exitCode).toBeNull();
          const began = performance.now();
          process.kill(child.pid, repeated ? 'SIGINT' : 'SIGTERM');
          if (repeated) {
            await Bun.sleep(75);
            process.kill(child.pid, 'SIGTERM');
          }
          expect(await waitExit(child)).toBe(repeated ? 130 : 143);
          if (repeated) expect(performance.now() - began).toBeLessThan(900);
          expect(child.signalCode).toBeNull();
          assertGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
          assertGone(Number(readFileSync(join(fixture.root, 'launcher.pid'), 'utf8')));
          expect(readdirSync(fixture.scratch)).toEqual([]);
          expect(await captured).toBe('');
        } finally {
          await cleanupGraph(fixture.root);
          if (child?.exitCode === null) killGroup(child.pid);
          if (reader.exitCode === null) reader.kill('SIGKILL');
          await Promise.allSettled([
            reader.exited,
            ...(child === undefined ? [] : [child.exited]),
            ...(captured === undefined ? [] : [captured]),
          ]);
        }
      },
      15000,
    );
  }
});
