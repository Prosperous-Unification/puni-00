import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';
import { createLintFixture } from './testing/lint-fixtures';

let installation: string;
let executable: string;
const roots: string[] = [];
beforeAll(async () => {
  installation = mkdtempSync(join(tmpdir(), 'puni-lint-output-bin-'));
  executable = join(installation, 'launcher.mjs');
  await Bun.write(executable, await buildLintLauncher());
});
afterAll(() => {
  rmSync(installation, { recursive: true, force: true });
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function waitExit(
  child: { readonly exited: Promise<number> },
  milliseconds = 5000,
): Promise<number> {
  const timeout = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    timeout.reject(new Error('owned lint executable did not settle'));
  }, milliseconds);
  try {
    return await Promise.race([child.exited, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}
function killGroup(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 1) throw new Error('invalid owned fixture group');
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}
function assertGroupGone(pid: number): void {
  try {
    process.kill(-pid, 0);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
  throw new Error('owned lint stage group survived output failure');
}

describe('actual lint executable output ownership', () => {
  for (const channel of ['stdout', 'stderr'] as const) {
    it(
      'cleans its live stage after a closed ' + channel + ' consumer',
      async () => {
        const fixture = createLintFixture(
          (root) =>
            'import{writeFileSync}from"node:fs";writeFileSync(' +
            JSON.stringify(join(root, 'stage.pid')) +
            ',String(process.pid));process.' +
            channel +
            '.write(Buffer.alloc(1024*1024,65));setInterval(()=>undefined,1000);',
        );
        roots.push(fixture.root);
        const fifo = join(fixture.root, 'closed-' + channel);
        const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
        expect(created.exitCode, created.stderr.toString()).toBe(0);
        const reader = Bun.spawn(['head', '-c', '1', fifo], {
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'pipe',
        });
        const options = {
          cwd: fixture.candidate,
          env: {
            PATH: '/usr/bin:/bin',
            TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
            TMPDIR: fixture.scratch,
          },
          stdin: Buffer.from(JSON.stringify(fixture.invocation)),
        };
        const argv = [...createLaunch(process.execPath, executable), '--puni-lint-v1'];
        const child =
          channel === 'stdout'
            ? Bun.spawn(argv, { ...options, stdout: Bun.file(fifo), stderr: 'pipe' })
            : Bun.spawn(argv, { ...options, stdout: 'pipe', stderr: Bun.file(fifo) });
        const capture = channel === 'stdout' ? child.stderr : child.stdout;
        if (typeof capture === 'number') throw new Error('owned executable capture missing');
        const captured = new Response(capture).text();
        try {
          expect(await waitExit(reader)).toBe(0);
          expect(await waitExit(child)).toBe(1);
          expect(child.signalCode).toBeNull();
          const pid = Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8'));
          assertGroupGone(pid);
          await captured;
        } finally {
          const path = join(fixture.root, 'stage.pid');
          if (existsSync(path)) killGroup(Number(readFileSync(path, 'utf8')));
          if (child.exitCode === null) child.kill('SIGKILL');
          if (reader.exitCode === null) reader.kill('SIGKILL');
          await Promise.allSettled([child.exited, reader.exited, captured]);
        }
      },
      15000,
    );
  }
});

async function waitPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('owned helper did not become ready: ' + path);
}

for (const repeated of [false, true]) {
  it(
    'settles a stalled stdout consumer with ' + (repeated ? 'repeated' : 'first') + ' cancellation',
    async () => {
      const fixture = createLintFixture(
        (root) =>
          'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);process.on("SIGTERM",()=>undefined);writeFileSync(' +
          JSON.stringify(join(root, 'stage.pid')) +
          ',String(process.pid));process.stdout.write(Buffer.alloc(8*1024*1024,65));setInterval(()=>undefined,1000);',
      );
      roots.push(fixture.root);
      const fifo = join(fixture.root, 'stalled');
      const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
      expect(created.exitCode, created.stderr.toString()).toBe(0);
      const ready = join(fixture.root, 'reader.ready');
      const helper = join(fixture.root, 'reader.mjs');
      await Bun.write(
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
      let child: Bun.Subprocess<Uint8Array, Bun.BunFile, 'pipe'> | undefined;
      let captured: Promise<string> | undefined;
      try {
        await waitPath(ready);
        child = Bun.spawn([...createLaunch(process.execPath, executable), '--puni-lint-v1'], {
          cwd: fixture.candidate,
          env: {
            PATH: '/usr/bin:/bin',
            TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
            TMPDIR: fixture.scratch,
          },
          stdin: Buffer.from(JSON.stringify(fixture.invocation)),
          stdout: Bun.file(fifo),
          stderr: 'pipe',
        });
        captured = new Response(child.stderr).text();
        await waitPath(join(fixture.root, 'stage.pid'));
        await Bun.sleep(100);
        expect(child.exitCode).toBeNull();
        const began = performance.now();
        process.kill(child.pid, repeated ? 'SIGINT' : 'SIGTERM');
        if (repeated) {
          await Bun.sleep(75);
          process.kill(child.pid, 'SIGTERM');
        }
        expect(await waitExit(child)).toBe(repeated ? 130 : 143);
        expect(child.signalCode).toBeNull();
        if (repeated) expect(performance.now() - began).toBeLessThan(900);
        assertGroupGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
        expect(readdirSync(fixture.scratch)).toEqual([]);
        expect(await captured).toBe('');
      } finally {
        const path = join(fixture.root, 'stage.pid');
        if (existsSync(path)) killGroup(Number(readFileSync(path, 'utf8')));
        if (child?.exitCode === null) child.kill('SIGKILL');
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

it('flushes complete binary stdout and stderr before returning the validator verdict', async () => {
  const fixture = createLintFixture(
    'const bytes=Uint8Array.from({length:1024*1024},(_,index)=>index%256);process.stdout.write(bytes);process.stderr.write(bytes);process.exitCode=37;',
  );
  roots.push(fixture.root);
  const child = Bun.spawn([...createLaunch(process.execPath, executable), '--puni-lint-v1'], {
    cwd: fixture.candidate,
    env: {
      PATH: '/usr/bin:/bin',
      TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
      TMPDIR: fixture.scratch,
    },
    stdin: Buffer.from(JSON.stringify(fixture.invocation)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).arrayBuffer();
  const stderr = new Response(child.stderr).arrayBuffer();
  try {
    expect(await waitExit(child)).toBe(37);
    const expected = Uint8Array.from({ length: 1024 * 1024 }, (_, index) => index % 256);
    expect(new Uint8Array(await stdout)).toEqual(expected);
    expect(new Uint8Array(await stderr)).toEqual(expected);
    expect(child.signalCode).toBeNull();
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
}, 15000);

it('releases a stalled stdout API when the stderr consumer fails', async () => {
  const fixture = createLintFixture(
    (root) =>
      'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));process.stdout.write(Buffer.alloc(8*1024*1024,65));process.stderr.write(Buffer.alloc(1024*1024,66));setInterval(()=>undefined,1000);',
  );
  roots.push(fixture.root);
  const stdout = join(fixture.root, 'stall');
  const stderr = join(fixture.root, 'close');
  for (const fifo of [stdout, stderr]) {
    const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
    expect(created.exitCode, created.stderr.toString()).toBe(0);
  }
  const ready = join(fixture.root, 'reader.ready');
  const helper = join(fixture.root, 'reader.mjs');
  await Bun.write(
    helper,
    'import{constants,openSync,writeFileSync}from"node:fs";openSync(' +
      JSON.stringify(stdout) +
      ',constants.O_RDONLY|constants.O_NONBLOCK);writeFileSync(' +
      JSON.stringify(ready) +
      ',"ready");setInterval(()=>undefined,1000);',
  );
  const holder = Bun.spawn([...createLaunch(process.execPath, helper)], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const reader = Bun.spawn(['head', '-c', '1', stderr], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let child: Bun.Subprocess<Uint8Array, Bun.BunFile, Bun.BunFile> | undefined;
  try {
    await waitPath(ready);
    child = Bun.spawn([...createLaunch(process.execPath, executable), '--puni-lint-v1'], {
      cwd: fixture.candidate,
      env: {
        PATH: '/usr/bin:/bin',
        TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
        TMPDIR: fixture.scratch,
      },
      stdin: Buffer.from(JSON.stringify(fixture.invocation)),
      stdout: Bun.file(stdout),
      stderr: Bun.file(stderr),
    });
    expect(await waitExit(reader)).toBe(0);
    expect(await waitExit(child)).toBe(1);
    expect(child.signalCode).toBeNull();
    assertGroupGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    const path = join(fixture.root, 'stage.pid');
    if (existsSync(path)) killGroup(Number(readFileSync(path, 'utf8')));
    if (child?.exitCode === null) child.kill('SIGKILL');
    for (const helper of [holder, reader]) if (helper.exitCode === null) helper.kill('SIGKILL');
    await Promise.allSettled([
      holder.exited,
      reader.exited,
      ...(child === undefined ? [] : [child.exited]),
    ]);
  }
}, 15000);

it('exits after unconfirmed group cleanup with PID diagnostics and retained scratch', async () => {
  const fixture = createLintFixture(
    (root) =>
      'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));process.stdout.write("ready");setInterval(()=>undefined,1000);',
  );
  roots.push(fixture.root);
  const pidPath = join(fixture.root, 'stage.pid');
  const bytes = Buffer.from(await buildLintLauncher()).toString();
  const newline = bytes.indexOf('\n');
  if (newline < 0) throw new Error('built launcher header absent');
  const instrument =
    'const fixtureFs=await import("node:fs");const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(pid<0&&fixtureFs.existsSync(' +
    JSON.stringify(pidPath) +
    ')&&-pid===Number(fixtureFs.readFileSync(' +
    JSON.stringify(pidPath) +
    ',"utf8")))return true;return nativeKill(pid,signal);};\n';
  const entrypoint = join(fixture.root, 'unconfirmed.mjs');
  await Bun.write(entrypoint, bytes.slice(0, newline + 1) + instrument + bytes.slice(newline + 1));
  const child = Bun.spawn([...createLaunch(process.execPath, entrypoint), '--puni-lint-v1'], {
    cwd: fixture.candidate,
    env: {
      PATH: '/usr/bin:/bin',
      TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
      TMPDIR: fixture.scratch,
    },
    stdin: Buffer.from(JSON.stringify(fixture.invocation)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    await waitPath(pidPath);
    await Bun.sleep(50);
    process.kill(child.pid, 'SIGINT');
    expect(await waitExit(child)).toBe(1);
    expect(child.signalCode).toBeNull();
    const pid = Number(readFileSync(pidPath, 'utf8'));
    expect(await stdout).toBe('ready');
    const diagnostic = await stderr;
    expect(diagnostic).toContain('process group ' + String(pid));
    const retained = readdirSync(fixture.scratch);
    expect(retained).toHaveLength(1);
    expect(diagnostic).toContain('retained scratch: ' + join(fixture.scratch, retained[0]));
  } finally {
    if (existsSync(pidPath)) killGroup(Number(readFileSync(pidPath, 'utf8')));
    if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
}, 15000);

for (const mode of ['inactive', 'refusal'] as const) {
  it(
    'fails a closed ' + mode + ' output without starting a stage',
    async () => {
      const fixture = createLintFixture('throw new Error("must not execute");');
      roots.push(fixture.root);
      const ready = join(fixture.root, 'main.ready');
      const proceed = join(fixture.root, 'main.proceed');
      const wrapper = join(fixture.root, 'no-stage.ts');
      await Bun.write(
        wrapper,
        'import{existsSync,writeFileSync}from"node:fs";import{runLintExecutable}from ' +
          JSON.stringify(join(import.meta.dir, 'lint-cli.ts')) +
          ';writeFileSync(' +
          JSON.stringify(ready) +
          ',"ready");for(let attempt=0;!existsSync(' +
          JSON.stringify(proceed) +
          ');attempt++){if(attempt===1000)throw new Error("parent did not release executable");await Bun.sleep(5);}process.exit(await runLintExecutable(' +
          JSON.stringify(mode === 'inactive' ? ['--puni-lint-v1'] : []) +
          '));',
      );
      const built = await Bun.build({
        entrypoints: [wrapper],
        target: 'bun',
        format: 'esm',
        define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version) },
      });
      expect(built.success).toBe(true);
      expect(built.outputs).toHaveLength(1);
      const entrypoint = join(fixture.root, 'no-stage.mjs');
      await Bun.write(entrypoint, await built.outputs[0].text());
      const child = Bun.spawn([...createLaunch(process.execPath, entrypoint)], {
        cwd: fixture.candidate,
        env: { PATH: '/usr/bin:/bin', TMPDIR: fixture.scratch },
        stdin: Buffer.from(JSON.stringify(fixture.invocation)),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const capture = mode === 'inactive' ? child.stderr : child.stdout;
      const captured = new Response(capture).text();
      try {
        await waitPath(ready);
        await (mode === 'inactive' ? child.stdout : child.stderr).cancel();
        await Bun.write(proceed, 'go');
        expect(await waitExit(child)).toBe(1);
        expect(child.signalCode).toBeNull();
        expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
        expect(readdirSync(fixture.scratch)).toEqual([]);
        await captured;
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        await Promise.allSettled([child.exited, captured]);
      }
    },
    15000,
  );
}

it('bounds the terminal diagnostic when native stderr is already full', async () => {
  const fixture = createLintFixture('throw new Error("must not execute");');
  roots.push(fixture.root);
  const fifo = join(fixture.root, 'full-stderr');
  const ready = join(fixture.root, 'filled.ready');
  const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
  expect(created.exitCode, created.stderr.toString()).toBe(0);
  const helper = join(fixture.root, 'fill.mjs');
  await Bun.write(
    helper,
    'import{constants,openSync,writeSync,writeFileSync}from"node:fs";const fd=openSync(' +
      JSON.stringify(fifo) +
      ',constants.O_RDWR|constants.O_NONBLOCK);let isFull=false;for(let attempt=0;attempt<10000;attempt++){try{writeSync(fd,Buffer.alloc(4096));}catch(cause){if(!(cause instanceof Error&&"code"in cause&&cause.code==="EAGAIN"))throw cause;isFull=true;break;}}if(!isFull)throw new Error("FIFO did not fill");writeFileSync(' +
      JSON.stringify(ready) +
      ',"ready");setInterval(()=>undefined,1000);',
  );
  const holder = Bun.spawn([...createLaunch(process.execPath, helper)], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let child: Bun.Subprocess<'ignore', 'pipe', Bun.BunFile> | undefined;
  let captured: Promise<string> | undefined;
  try {
    await waitPath(ready);
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'lint-cli.ts')],
      target: 'bun',
      format: 'esm',
      define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify('0.0.0') },
    });
    expect(built.success).toBe(true);
    expect(built.outputs).toHaveLength(1);
    const entrypoint = join(fixture.root, 'bad-pin.mjs');
    await Bun.write(entrypoint, await built.outputs[0].text());
    child = Bun.spawn([...createLaunch(process.execPath, entrypoint)], {
      cwd: fixture.candidate,
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: Bun.file(fifo),
    });
    captured = new Response(child.stdout).text();
    expect(await waitExit(child)).toBe(1);
    expect(child.signalCode).toBeNull();
    expect(await captured).toBe('');
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL');
    if (holder.exitCode === null) holder.kill('SIGKILL');
    await Promise.allSettled([
      holder.exited,
      ...(child === undefined ? [] : [child.exited]),
      ...(captured === undefined ? [] : [captured]),
    ]);
  }
}, 15000);
