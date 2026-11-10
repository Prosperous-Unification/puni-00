import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(live = false) {
  const fixture = createInstalledLintFixture(
    launcher,
    (root) =>
      'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));' +
      (live
        ? 'process.on("SIGTERM",()=>undefined);setInterval(()=>undefined,1000);'
        : 'process.stdout.write("stage");'),
  );
  roots.push(fixture.root);
  return fixture;
}
async function waitExit(child: { exited: Promise<number> }, milliseconds = 5000): Promise<number> {
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new Error('owned control child did not settle'));
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
  throw new Error('owned stage group remains');
}
function spawnFixture(
  fixture: ReturnType<typeof createFixture>,
  ipc = true,
  extra: readonly string[] = [],
  preload?: string,
) {
  const notices: unknown[] = [];
  const ready = Promise.withResolvers<undefined>();
  const entrypoint = join(fixture.toolkit, 'launcher.mjs');
  const launch = fixture.context.launch(entrypoint);
  const argv =
    preload === undefined ? launch : [...launch.slice(0, -1), '--preload', preload, entrypoint];
  const child = Bun.spawn([...argv, '--puni-lint-parent-v1', ...extra], {
    cwd: fixture.toolkit,
    env: {
      ...fixture.context.runtime.environment,

      TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
      TOOL_WIKI_REQUIRE_CERTIFIED: '0',
      TMPDIR: fixture.scratch,
    },
    stdin: Buffer.from(JSON.stringify(fixture.invocation)),
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
    ...(ipc
      ? {
          ipc(message: unknown) {
            notices.push(message);
            if (message === 'puni-lint-ready-v1') ready.resolve(undefined);
          },
        }
      : {}),
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  async function waitReady(): Promise<void> {
    await Promise.race([
      ready.promise,
      child.exited.then(() => {
        throw new Error('launcher exited before ready');
      }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('launcher did not become ready'));
        }, 2000);
        timer.unref();
      }),
    ]);
  }
  async function dispose(): Promise<void> {
    const stage = join(fixture.root, 'stage.pid');
    if (existsSync(stage)) {
      killGroup(Number(readFileSync(stage, 'utf8')));
      await Bun.sleep(50);
    }
    if (child.exitCode === null) killGroup(child.pid);
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
  return { child, notices, stdout, stderr, waitReady, dispose };
}

describe('actual installed launcher ordered parent control', () => {
  it('requires real IPC when private parent control is requested', async () => {
    const fixture = createFixture();
    const owned = spawnFixture(fixture, false);
    try {
      expect(await waitExit(owned.child)).toBe(1);
      expect(await owned.stderr).toContain('requires an IPC channel');
      expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
    } finally {
      await owned.dispose();
    }
  });
  it('does not launch a stage before start and reports finished after lifecycle settlement', async () => {
    const fixture = createFixture();
    const owned = spawnFixture(fixture);
    try {
      await owned.waitReady();
      await Bun.sleep(30);
      expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
      owned.child.send('puni-lint-start-v1');
      expect(await waitExit(owned.child)).toBe(0);
      expect(await owned.stdout).toBe('stage');
      expect(await owned.stderr).toBe('');
      expect(owned.notices).toEqual(['puni-lint-ready-v1', 'puni-lint-finished-v1']);
      expect(readdirSync(fixture.scratch)).toEqual([]);
    } finally {
      await owned.dispose();
    }
  });
  for (const signals of [
    ['SIGINT', 'SIGTERM'],
    ['SIGTERM', 'SIGINT'],
    ['SIGINT', 'SIGINT'],
  ] as const) {
    it(
      'applies queued ' + signals.join('/') + ' before start while preserving first reason',
      async () => {
        const fixture = createFixture();
        const owned = spawnFixture(fixture);
        try {
          await owned.waitReady();
          for (const signal of signals) owned.child.send('puni-lint-' + signal + '-v1');
          owned.child.send('puni-lint-start-v1');
          expect(await waitExit(owned.child)).toBe(signals[0] === 'SIGINT' ? 130 : 143);
          expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
          expect(await owned.stdout).toBe('');
          expect(await owned.stderr).toBe('');
          expect(owned.notices).toEqual(['puni-lint-ready-v1', 'puni-lint-finished-v1']);
          expect(readdirSync(fixture.scratch)).toEqual([]);
        } finally {
          await owned.dispose();
        }
      },
    );
  }
  it('refuses parent disconnect before start without running a stage', async () => {
    const fixture = createFixture();
    const owned = spawnFixture(fixture);
    try {
      await owned.waitReady();
      owned.child.disconnect();
      expect(await waitExit(owned.child)).toBe(1);
      expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
      expect(await owned.stderr).toContain('parent control channel closed');
      expect(await owned.stdout).toBe('');
    } finally {
      await owned.dispose();
    }
  });
  it('rejects unknown control without echoing its payload or starting a stage', async () => {
    const fixture = createFixture();
    const owned = spawnFixture(fixture);
    try {
      await owned.waitReady();
      owned.child.send({ secret: 'control-secret-must-not-echo' });
      expect(await waitExit(owned.child)).toBe(1);
      const stderr = await owned.stderr;
      expect(stderr).toContain('invalid parent control');
      expect(stderr).not.toContain('control-secret-must-not-echo');
      expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
    } finally {
      await owned.dispose();
    }
  });
  for (const fault of ['disconnect', 'duplicate-start'] as const) {
    it('cleans its actual live stage after ' + fault, async () => {
      const fixture = createFixture(true);
      const owned = spawnFixture(fixture);
      try {
        await owned.waitReady();
        owned.child.send('puni-lint-start-v1');
        const stage = join(fixture.root, 'stage.pid');
        for (let attempt = 0; attempt < 500 && !existsSync(stage); attempt++) await Bun.sleep(5);
        expect(existsSync(stage)).toBe(true);
        if (fault === 'disconnect') owned.child.disconnect();
        else owned.child.send('puni-lint-start-v1');
        expect(await waitExit(owned.child)).toBe(1);
        assertGone(Number(readFileSync(stage, 'utf8')));
        expect(readdirSync(fixture.scratch)).toEqual([]);
        expect(await owned.stderr).toContain(
          fault === 'disconnect' ? 'parent control channel closed' : 'duplicate parent start',
        );
      } finally {
        await owned.dispose();
      }
    });
  }
});

it('refuses extra private parent argv before handshake or request IO', async () => {
  const fixture = createFixture();
  const owned = spawnFixture(fixture, true, ['extra']);
  try {
    expect(await waitExit(owned.child)).toBe(64);
    expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
    expect(owned.notices).toEqual([]);
    expect(await owned.stderr).toContain('expected --puni-lint-v1');
  } finally {
    await owned.dispose();
  }
});

for (const fault of [
  'registration',
  'release',
  'finished-late',
  'release-finished-late',
  'disconnect-finished-late',
  'broker-dispose-late',
  'subscription-release',
  'registration-release',
  'missing-sender',
] as const) {
  it(
    'contains actual child ' + fault + ' failures within its owned executable boundary',
    async () => {
      const fixture = createFixture();
      const preload = join(fixture.root, 'control-' + fault + '.mjs');
      const counts = join(fixture.root, 'control-listeners.json');
      const late = join(fixture.root, 'late-control-contained');
      const setup = [
        'import{writeFileSync}from"node:fs";',
        'const nativeOn=process.on.bind(process),nativeOff=process.off.bind(process),nativeSend=process.send.bind(process);',
        'const initial={message:process.listenerCount("message"),disconnect:process.listenerCount("disconnect")};',
        'nativeOn("exit",()=>writeFileSync(' +
          JSON.stringify(counts) +
          ',JSON.stringify({message:process.listenerCount("message")-initial.message,disconnect:process.listenerCount("disconnect")-initial.disconnect})));',
      ];
      if (fault === 'registration' || fault === 'registration-release')
        setup.push(
          'process.on=(event,listener)=>{if(event==="disconnect")throw new Error("controlled listener registration failure");return nativeOn(event,listener);};',
        );
      if (
        fault === 'release' ||
        fault === 'release-finished-late' ||
        fault === 'registration-release'
      )
        setup.push(
          'let hasFailed=false;process.off=(event,listener)=>{if(event==="message"&&!hasFailed){hasFailed=true;throw new Error("controlled listener release failure");}return nativeOff(event,listener);};',
        );
      if (fault === 'finished-late' || fault === 'release-finished-late')
        setup.push(
          'process.send=message=>{if(message==="puni-lint-finished-v1"){queueMicrotask(()=>{process.emit("message","puni-lint-SIGINT-v1");writeFileSync(' +
            JSON.stringify(late) +
            ',"contained");});throw new Error("controlled finished send failure");}return nativeSend(message);};',
        );
      if (fault === 'disconnect-finished-late') {
        setup.push(
          'let hasFailed=false;process.off=(event,listener)=>{if(event==="disconnect"&&!hasFailed){hasFailed=true;throw new Error("controlled disconnect release failure");}return nativeOff(event,listener);};',
        );
        setup.push(
          'process.send=message=>{if(message==="puni-lint-finished-v1"){queueMicrotask(()=>{process.emit("disconnect");writeFileSync(' +
            JSON.stringify(late) +
            ',"contained");});throw new Error("controlled finished send failure");}return nativeSend(message);};',
        );
      }
      if (fault === 'broker-dispose-late')
        setup.push(
          'let hasFailed=false;process.off=(event,listener)=>{if(event==="SIGINT"&&!hasFailed){hasFailed=true;queueMicrotask(()=>{process.emit("message","puni-lint-SIGINT-v1");writeFileSync(' +
            JSON.stringify(late) +
            ',"contained");});throw new Error("controlled broker disposal failure");}return nativeOff(event,listener);};',
        );
      if (fault === 'subscription-release')
        setup.push(
          'let disconnectListener,armed=false;process.on=(event,listener)=>{if(event==="disconnect")disconnectListener=listener;return nativeOn(event,listener);};process.off=(event,listener)=>{const returned=nativeOff(event,listener);if(event==="disconnect"&&listener===disconnectListener)armed=true;return returned;};const nativeDelete=Set.prototype.delete;Set.prototype.delete=function(value){if(armed){armed=false;throw new Error("controlled subscription release failure");}return nativeDelete.call(this,value);};',
        );
      if (fault === 'missing-sender') setup.push('process.send=undefined;');
      writeFileSync(preload, setup.join('\n'));
      const owned = spawnFixture(fixture, true, [], preload);
      try {
        if (
          fault !== 'registration' &&
          fault !== 'registration-release' &&
          fault !== 'missing-sender'
        ) {
          await owned.waitReady();
          owned.child.send('puni-lint-start-v1');
        }
        expect(await waitExit(owned.child)).toBe(1);
        const stderr = await owned.stderr;
        expect(stderr).not.toContain('error:');
        expect(stderr).not.toContain('at recordInterrupt');
        if (fault === 'registration') {
          expect(stderr).toContain('controlled listener registration failure');
          expect(JSON.parse(readFileSync(counts, 'utf8'))).toEqual({ message: 0, disconnect: 0 });
          expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
        }
        if (
          fault === 'release' ||
          fault === 'release-finished-late' ||
          fault === 'subscription-release'
        ) {
          expect(JSON.parse(readFileSync(counts, 'utf8'))).toMatchObject({ disconnect: 0 });
          expect(stderr).toContain('cannot release installed parent control');
        }
        if (
          fault === 'finished-late' ||
          fault === 'release-finished-late' ||
          fault === 'disconnect-finished-late' ||
          fault === 'broker-dispose-late'
        )
          expect(readFileSync(late, 'utf8')).toBe('contained');
        if (fault === 'finished-late' || fault === 'broker-dispose-late') expect(stderr).toBe('');
        if (fault === 'disconnect-finished-late')
          expect(stderr).toContain('cannot release installed parent control');
        if (fault === 'registration-release')
          expect(stderr).toContain('cannot initialize installed parent control');
        if (fault === 'missing-sender') {
          expect(stderr).toContain('requires an IPC sender');
          expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
          expect(JSON.parse(readFileSync(counts, 'utf8'))).toEqual({ message: 0, disconnect: 0 });
        }
      } finally {
        await owned.dispose();
      }
    },
  );
}
for (const control of ['cancel', 'invalid'] as const) {
  it('does not read the typed request after pre-start ' + control, async () => {
    const fixture = createFixture();
    const preload = join(fixture.root, 'observe-request.mjs');
    const marker = join(fixture.root, 'request-stream-opened');
    writeFileSync(
      preload,
      'import{writeFileSync}from"node:fs";const input=Bun.stdin;const stream=input.stream.bind(input);input.stream=(...args)=>{writeFileSync(' +
        JSON.stringify(marker) +
        ',"read");return stream(...args);};',
    );
    const owned = spawnFixture(fixture, true, [], preload);
    try {
      await owned.waitReady();
      owned.child.send(
        control === 'cancel' ? 'puni-lint-SIGINT-v1' : { invalid: 'closed-control' },
      );
      expect(await waitExit(owned.child)).toBe(control === 'cancel' ? 130 : 1);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
    } finally {
      await owned.dispose();
    }
  });
}
it('preserves the first control failure while another invalid control arrives during cleanup', async () => {
  const fixture = createFixture(true);
  const owned = spawnFixture(fixture);
  try {
    await owned.waitReady();
    owned.child.send('puni-lint-start-v1');
    const stage = join(fixture.root, 'stage.pid');
    for (let attempt = 0; attempt < 500 && !existsSync(stage); attempt++) await Bun.sleep(5);
    expect(existsSync(stage)).toBe(true);
    owned.child.send('puni-lint-start-v1');
    owned.child.send({ invalid: 'later-failure' });
    expect(await waitExit(owned.child)).toBe(1);
    const stderr = await owned.stderr;
    expect(stderr).toContain('duplicate parent start');
    expect(stderr).not.toContain('invalid parent control');
    assertGone(Number(readFileSync(stage, 'utf8')));
  } finally {
    await owned.dispose();
  }
});
