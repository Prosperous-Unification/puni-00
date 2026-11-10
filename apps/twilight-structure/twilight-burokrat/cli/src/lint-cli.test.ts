import { Buffer } from 'node:buffer';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';

let root: string;
let executable: string;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'puni-lint-main-'));
  executable = join(root, 'launcher.mjs');
  writeFileSync(executable, await buildLintLauncher());
  chmodSync(executable, 0o755);
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function invoke(argv: string[], bytes: Uint8Array, environment: Record<string, string> = {}) {
  return Bun.spawnSync([...createLaunch(process.execPath, executable), ...argv], {
    cwd: root,
    env: { PATH: dirname(process.execPath) + ':/usr/bin:/bin', ...environment },
    stdin: bytes,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('standalone Bun lint boundary', () => {
  for (const argv of [[], ['--puni-lint-v1', 'extra'], ['working']]) {
    it('refuses unsupported argv ' + JSON.stringify(argv) + ' as usage', () => {
      const child = invoke(argv, new Uint8Array());
      expect(child.exitCode).toBe(64);
      expect(child.stdout).toHaveLength(0);
      expect(child.stderr.toString()).toContain('expected --puni-lint-v1');
    });
  }
  it('does not expose malformed request bytes in usage diagnostics', () => {
    const child = invoke(['--puni-lint-v1'], Buffer.from('{secret-token-phrase'));
    expect(child.exitCode).toBe(64);
    expect(child.stderr.toString()).toBe('tool-wiki lint: invalid installed lint request\n');
    expect(child.stdout).toHaveLength(0);
  });
  for (const required of ['', 'true', '2']) {
    it('refuses invalid required-admission configuration ' + JSON.stringify(required), () => {
      const child = invoke(
        ['--puni-lint-v1'],
        Buffer.from(
          JSON.stringify({
            version: 1,
            callerDirectory: root,
            request: { command: 'lint', kind: 'working', repository: root, revision: 'HEAD' },
          }),
        ),
        { TOOL_WIKI_REQUIRE_CERTIFIED: required },
      );
      expect(child.exitCode).toBe(64);
      expect(child.stderr.toString()).toContain('TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1');
    });
  }
  it('runs optional inactive selection only after actual Git preflight', () => {
    const candidate = join(root, 'candidate');
    mkdirSync(candidate);
    const initialized = Bun.spawnSync(['git', 'init', '-q', candidate], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(initialized.exitCode).toBe(0);
    const child = invoke(
      ['--puni-lint-v1'],
      Buffer.from(
        JSON.stringify({
          version: 1,
          callerDirectory: root,
          request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
        }),
      ),
    );
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual({
      schemaVersion: 1,
      status: 'inactive',
      certified: false,
      reason: 'external activation root is not provisioned',
    });
    expect(child.stderr).toHaveLength(0);
  });
  it('cancels the executable boundary while stdin remains open', async () => {
    const wrapper = join(root, 'stdin-wrapper.ts');
    writeFileSync(
      wrapper,
      'import { runLintExecutable } from ' +
        JSON.stringify(join(import.meta.dir, 'lint-cli.ts')) +
        '; const pending = runLintExecutable(["--puni-lint-v1"]); process.stdout.write("ready"); process.exitCode = await pending;',
    );
    const built = await Bun.build({
      entrypoints: [wrapper],
      target: 'bun',
      format: 'esm',
      define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version) },
    });
    expect(built.success).toBe(true);
    expect(built.outputs).toHaveLength(1);
    const wrapped = join(root, 'stdin-wrapper.mjs');
    writeFileSync(wrapped, await built.outputs[0].text());
    const child = Bun.spawn([...createLaunch(process.execPath, wrapped)], {
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      const reader = child.stdout.getReader();
      const first = await reader.read();
      expect(Buffer.from(first.value ?? new Uint8Array()).toString()).toBe('ready');
      reader.releaseLock();
      process.kill(child.pid, 'SIGTERM');
      expect(
        await Promise.race([
          child.exited,
          Bun.sleep(3000).then(() => {
            throw new Error('stdin cancellation did not settle');
          }),
        ]),
      ).toBe(143);
      expect(await new Response(child.stderr).text()).toBe('');
    } finally {
      await child.stdin.end();
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
    }
  }, 10000);
});

for (const [pin, diagnostic] of [
  [undefined, 'lint launcher has no build runtime pin'],
  ['0.0.0', 'lint launcher was built with another Bun'],
] as const) {
  it('refuses an unpinned or mismatched standalone runtime ' + String(pin), async () => {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'lint-cli.ts')],
      target: 'bun',
      format: 'esm',
      define: pin === undefined ? {} : { __PUNI_LINT_BUN_VERSION__: JSON.stringify(pin) },
    });
    expect(built.success).toBe(true);
    expect(built.outputs).toHaveLength(1);
    const entrypoint = join(root, 'runtime-' + String(pin) + '.mjs');
    writeFileSync(entrypoint, await built.outputs[0].text());
    const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint), '--puni-lint-v1'], {
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
      stdin: new Uint8Array(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(1);
    expect(child.stdout).toHaveLength(0);
    expect(child.stderr.toString()).toContain(diagnostic);
  });
}

for (const fault of ['unsuccessful', 'empty', 'multiple'] as const) {
  it('refuses a launcher build that is ' + fault, async () => {
    const original = Bun.build.bind(Bun);
    const actual = await original({
      entrypoints: [join(import.meta.dir, 'lint-cli.ts')],
      target: 'bun',
      format: 'esm',
      define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version) },
    });
    expect(actual.success).toBe(true);
    expect(actual.outputs).toHaveLength(1);
    const build = spyOn(Bun, 'build').mockResolvedValue({
      ...actual,
      success: fault !== 'unsuccessful',
      outputs:
        fault === 'empty'
          ? []
          : fault === 'multiple'
            ? [...actual.outputs, ...actual.outputs]
            : actual.outputs,
    });
    try {
      const failure: unknown = await buildLintLauncher().then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw failure;
      expect(failure.message).toBe('cannot build standalone Bun lint launcher');
    } finally {
      build.mockRestore();
    }
  });
}

it('runs the actual generated shebang with candidate startup preload erased', () => {
  const marker = join(root, 'preload.executed');
  const preload = join(root, 'preload.mjs');
  writeFileSync(
    preload,
    'import { writeFileSync } from "node:fs"; writeFileSync(' +
      JSON.stringify(marker) +
      ',"executed");',
  );
  const child = Bun.spawnSync([executable], {
    cwd: root,
    env: {
      PATH: dirname(process.execPath) + ':/usr/bin:/bin',
      BUN_OPTIONS: '--preload=' + preload,
    },
    stdin: new Uint8Array(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(64);
  expect(existsSync(marker)).toBe(false);
});
it('preserves required activation absence as a standalone status78', () => {
  const candidate = join(root, 'required-candidate');
  mkdirSync(candidate);
  const initialized = Bun.spawnSync(['git', 'init', '-q', candidate], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  const child = invoke(
    ['--puni-lint-v1'],
    Buffer.from(
      JSON.stringify({
        version: 1,
        callerDirectory: root,
        request: { command: 'lint', kind: 'committed', repository: candidate, revision: 'HEAD' },
      }),
    ),
    { TOOL_WIKI_REQUIRE_CERTIFIED: '1' },
  );
  expect(child.exitCode).toBe(78);
  expect(child.stdout).toHaveLength(0);
  expect(child.stderr.toString()).toContain('required admission has no external activation root');
});
it('refuses a missing explicit PATH before optional activation can return', () => {
  const input = Buffer.from(
    JSON.stringify({
      version: 1,
      callerDirectory: root,
      request: { command: 'lint', kind: 'working', repository: root, revision: 'HEAD' },
    }),
  );
  const child = Bun.spawnSync([...createLaunch(process.execPath, executable), '--puni-lint-v1'], {
    cwd: root,
    env: {},
    stdin: input,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).toBe(1);
  expect(child.stdout).toHaveLength(0);
  expect(child.stderr.toString()).toContain('lint launcher requires an explicit PATH');
});

for (const phase of ['reporting', 'disposal'] as const) {
  it('contains terminal ' + phase + ' failures without Bun automatic reporting', async () => {
    const wrapper = join(root, 'terminal-' + phase + '.ts');
    writeFileSync(
      wrapper,
      'import{runLintExecutable}from ' +
        JSON.stringify(join(import.meta.dir, 'lint-cli.ts')) +
        ';Bun.stderr.writer=()=>({write(){' +
        'return 0;' +
        '},flush(){return 0;},unref(){throw new Error("injected unref failure");}});const status=await runLintExecutable([]);process.stdout.write(String(status));process.exit(status);',
    );
    const built = await Bun.build({
      entrypoints: [wrapper],
      target: 'bun',
      format: 'esm',
      define: {
        __PUNI_LINT_BUN_VERSION__: JSON.stringify(phase === 'reporting' ? '0.0.0' : Bun.version),
      },
    });
    expect(built.success).toBe(true);
    expect(built.outputs).toHaveLength(1);
    const entrypoint = join(root, 'terminal-' + phase + '.mjs');
    writeFileSync(entrypoint, await built.outputs[0].text());
    const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('1');
    expect(child.stderr.toString()).toBe('');
  });
}

it('preserves cancellation while awaiting a modeled usage refusal write', async () => {
  const wrapper = join(root, 'cancel-refusal.ts');
  writeFileSync(
    wrapper,
    'import{runLintMain}from ' +
      JSON.stringify(join(import.meta.dir, 'lint-cli.ts')) +
      ';const status=await runLintMain([],{outputs:{stdout:()=>Promise.resolve({kind:"written"}),stderr:()=>Promise.resolve({kind:"cancelled",signal:"SIGINT"})},subscribeInterrupts:()=>()=>undefined});process.exit(status);',
  );
  const built = await Bun.build({
    entrypoints: [wrapper],
    target: 'bun',
    format: 'esm',
    define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version) },
  });
  expect(built.success).toBe(true);
  expect(built.outputs).toHaveLength(1);
  const entrypoint = join(root, 'cancel-refusal.mjs');
  writeFileSync(entrypoint, await built.outputs[0].text());
  const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).toBe(130);
  expect(child.stderr).toHaveLength(0);
});
