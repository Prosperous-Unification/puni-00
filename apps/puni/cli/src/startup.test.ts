import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { createLaunch, createShebang } from './startup';

const roots: string[] = [];
const removed = ['BUN_OPTIONS', 'BUN_INSPECT_PRELOAD', 'NODE_OPTIONS', 'BUN_BE_BUN'] as const;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni-startup-'));
  roots.push(root);
  const candidate = join(root, 'candidate');
  const installed = join(root, 'installed PUNI');
  const binaries = join(root, 'selected Bun');
  for (const path of [candidate, installed, binaries]) mkdirSync(path);
  const runtime = join(binaries, 'bun');
  symlinkSync(process.execPath, runtime);
  const sentinel = join(root, 'preload-ran');
  const preload = join(candidate, 'preload.ts');
  writeFileSync(preload, `await Bun.write(${JSON.stringify(sentinel)}, 'executed');\n`);
  writeFileSync(join(candidate, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
  writeFileSync(join(candidate, '.env'), 'PUNI_DOTENV_SENTINEL=contaminated\n');
  const entrypoint = join(installed, 'puni.mjs');
  const keys = [...removed, 'PUNI_DOTENV_SENTINEL'];
  writeFileSync(
    entrypoint,
    createShebang() +
      '\n' +
      `process.stdout.write(JSON.stringify({ arguments: process.argv.slice(2), environment: Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, process.env[key] ?? null])) }));\n`,
  );
  chmodSync(entrypoint, 0o755);
  const environment = {
    ...process.env,
    PATH: binaries,
    BUN_OPTIONS: '--preload ' + preload,
    BUN_INSPECT_PRELOAD: preload,
    NODE_OPTIONS: '--require ' + preload,
    BUN_BE_BUN: '1',
  };
  return { root, candidate, runtime, entrypoint, sentinel, environment };
}

function readObservation(child: Bun.ReadableSyncSubprocess): unknown {
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stderr.toString()).toBe('');
  return JSON.parse(child.stdout.toString());
}

const expectedEnvironment = Object.fromEntries(
  [...removed, 'PUNI_DOTENV_SENTINEL'].map((key) => [key, null]),
);

describe('protected PUNI startup', () => {
  for (const mode of ['entrypoint', 'helper'] as const) {
    it(mode + ' excludes preloads and dotenv with only Bun on PATH', async () => {
      const fixture = createFixture();
      const args = ['dash', 'mcp', 'token', '--key-file', join(fixture.root, 'key with spaces')];
      const prefix =
        mode === 'entrypoint'
          ? [fixture.entrypoint]
          : createLaunch(fixture.runtime, fixture.entrypoint);
      const child = Bun.spawnSync([...prefix, ...args], {
        cwd: fixture.candidate,
        env: fixture.environment,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const observed = readObservation(child);
      expect(await Bun.file(fixture.sentinel).exists()).toBe(false);
      expect(observed).toEqual({ arguments: args, environment: expectedEnvironment });
    });

    for (const name of removed) {
      it(mode + ' erases ' + name + ' before application code observes it', () => {
        const fixture = createFixture();
        const environment: Record<string, string | undefined> = {
          ...process.env,
          PATH: fixture.environment.PATH,
        };
        for (const key of removed) environment[key] = undefined;
        environment[name] =
          name === 'BUN_BE_BUN' ? '1' : name === 'BUN_OPTIONS' ? '--smol' : 'PUNI_ERASURE_SENTINEL';
        const prefix =
          mode === 'entrypoint'
            ? [fixture.entrypoint]
            : createLaunch(fixture.runtime, fixture.entrypoint);
        const child = Bun.spawnSync([...prefix, 'dash'], {
          cwd: fixture.root,
          env: environment,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(readObservation(child)).toEqual({
          arguments: ['dash'],
          environment: expectedEnvironment,
        });
      });
    }
  }

  it('refuses a selected runtime path that env would parse as an assignment', () => {
    expect(() => createLaunch('/selected=Bun/bun', '/installed/puni.mjs')).toThrow(
      "selected Bun executable cannot contain '=' with the env launcher",
    );
  });

  it('retains an equals sign in the installed entrypoint path', () => {
    const fixture = createFixture();
    const entrypoint = join(fixture.root, 'installed=PUNI.mjs');
    writeFileSync(
      entrypoint,
      createShebang() +
        '\nprocess.stdout.write(JSON.stringify({ entered: true, arguments: process.argv.slice(2) }));\n',
    );
    chmodSync(entrypoint, 0o755);
    for (const prefix of [[entrypoint], createLaunch(fixture.runtime, entrypoint)]) {
      const child = Bun.spawnSync([...prefix, 'dash'], {
        cwd: fixture.candidate,
        env: fixture.environment,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(readObservation(child)).toEqual({ entered: true, arguments: ['dash'] });
    }
  });

  it('requires the selected runtime and installed entrypoint to be absolute', () => {
    expect(() => createLaunch('bun', '/installed/puni.mjs')).toThrow(
      'selected Bun executable must be absolute',
    );
    expect(() => createLaunch('/selected/bun', 'puni.mjs')).toThrow(
      'installed PUNI entrypoint must be absolute',
    );
  });
});
