import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterEach, expect, it } from 'bun:test';

const adapter = resolve(import.meta.dir, '../../../bin/dev-be-probe.ts');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function createFixture(source = 'export function main(){return {kind:"drain",status:0}}') {
  const root = mkdtempSync(join(tmpdir(), 'backend probe adapter '));
  roots.push(root);
  const caller = join(root, 'caller with spaces'),
    tools = join(root, 'trusted tools');
  mkdirSync(caller);
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, 'bun'));
  const selected = join(root, 'selected PUNI.mjs');
  writeFileSync(selected, source);
  return { root, caller, tools, selected };
}
function invoke(
  fixture: ReturnType<typeof createFixture>,
  args: string[] = ['https://example.invalid'],
  environment: Record<string, string> = {},
) {
  return Bun.spawnSync([...createLaunch(join(fixture.tools, 'bun'), adapter), ...args], {
    cwd: fixture.caller,
    env: {
      PATH: fixture.tools + ':/usr/bin:/bin',
      TMPDIR: fixture.root,
      PUNI_EXECUTABLE: fixture.selected,
      ...environment,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
}
function requireNormalChild(child: ReturnType<typeof invoke>, status: number) {
  expect(child.signalCode, child.stderr.toString()).toBeUndefined();
  expect(child.exitedDueToTimeout).toBe(false);
  expect(child.exitedDueToMaxBuffer).toBe(false);
  expect(child.exitCode, child.stderr.toString()).toBe(status);
}

it('backend probe adapter uses the exact shared protected startup line', () => {
  expect(readFileSync(adapter, 'utf8').split('\n').at(0)).toBe(createShebang());
});

it('backend probe adapter import performs no ambient dispatch or status assignment', () => {
  const fixture = createFixture();
  const marker = join(fixture.root, 'dispatched');
  writeFileSync(
    fixture.selected,
    'import{writeFileSync}from"node:fs";export function main(){writeFileSync(' +
      JSON.stringify(marker) +
      ',"dispatched");return {kind:"drain",status:37}}',
  );
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      '--eval',
      'await import(' +
        JSON.stringify(pathToFileURL(adapter).href) +
        ');process.stdout.write("import only\\n");',
    ],
    {
      cwd: fixture.caller,
      env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: fixture.selected },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    },
  );
  requireNormalChild(child, 0);
  expect(child.stdout.toString()).toBe('import only\n');
  expect(existsSync(marker)).toBe(false);
});

it('backend probe adapter retains the fixed vector and caller authority before selected import', () => {
  const fixture = createFixture();
  const capture = join(fixture.root, 'captured.json');
  const origin = 'https://example.invalid/a b?value=$(touch nope)&literal=one;two';
  writeFileSync(
    fixture.selected,
    'import{writeFileSync}from"node:fs";process.chdir(' +
      JSON.stringify(fixture.root) +
      ');process.env.PUNI_EXECUTABLE="changed";process.argv=["changed"];export function main(args,context){writeFileSync(' +
      JSON.stringify(capture) +
      ',JSON.stringify({args,...context,stdout:typeof context.stdout,stderr:typeof context.stderr}));context.stdout(Buffer.from([0,128,255]));context.stderr("selected diagnostic\\n");return {kind:"drain",status:37}}',
  );
  const child = invoke(fixture, [origin]);
  requireNormalChild(child, 37);
  expect([...child.stdout]).toEqual([0, 128, 255]);
  expect(child.stderr.toString()).toBe('selected diagnostic\n');
  expect(JSON.parse(readFileSync(capture, 'utf8'))).toEqual({
    args: ['dash', 'dev-probe', 'be', origin],
    installation: { directory: fixture.root, entrypoint: fixture.selected },
    lookup: { directory: fixture.caller, path: fixture.tools + ':/usr/bin:/bin' },
    callerDirectory: fixture.caller,
    runtime: process.execPath,
    temporaryDirectory: fixture.root,
    environment: {
      PATH: fixture.tools + ':/usr/bin:/bin',
      TMPDIR: fixture.root,
      PUNI_EXECUTABLE: fixture.selected,
    },
    stdout: 'function',
    stderr: 'function',
  });
  expect(existsSync(join(fixture.caller, 'nope'))).toBe(false);
});

it('backend probe adapter routes exact silent preflight through the selected grammar', () => {
  const fixture = createFixture();
  const capture = join(fixture.root, 'captured.json');
  writeFileSync(
    fixture.selected,
    'import{writeFileSync}from"node:fs";export function main(args,context){writeFileSync(' +
      JSON.stringify(capture) +
      ',JSON.stringify(args));context.stdout("discovery must be silent");return {kind:"drain",status:0}}',
  );
  const child = invoke(fixture, ['--preflight']);
  requireNormalChild(child, 0);
  expect([...child.stdout]).toEqual([]);
  expect([...child.stderr]).toEqual([]);
  expect(JSON.parse(readFileSync(capture, 'utf8'))).toEqual(['dash', 'dev-probe', 'be', '--help']);
});

it('backend probe adapter refuses a selected grammar that lacks the operation', () => {
  const fixture = createFixture(
    'export function main(){setInterval(()=>{},1000);return {kind:"drain",status:1}}',
  );
  const child = invoke(fixture, ['--preflight']);
  requireNormalChild(child, 1);
  expect(child.stderr.toString()).toContain(
    'selected PUNI does not accept the backend probe operation',
  );
});

it('backend probe adapter refuses an existing relative selection instead of importing from caller cwd', () => {
  const fixture = createFixture();
  writeFileSync(
    join(fixture.caller, 'relative-PUNI.mjs'),
    'export function main(){return {kind:"drain",status:0}}',
  );
  const child = invoke(fixture, ['--preflight'], { PUNI_EXECUTABLE: 'relative-PUNI.mjs' });
  requireNormalChild(child, 1);
  expect(child.stderr.toString()).toContain('set PUNI_EXECUTABLE to the absolute entrypoint');
});

for (const boundary of ['unreadable', 'directory'] as const) {
  it('backend probe adapter refuses a selected ' + boundary + ' entrypoint', () => {
    const fixture = createFixture();
    let selected = fixture.selected;
    if (boundary === 'unreadable') chmodSync(selected, 0);
    else {
      selected = join(fixture.root, 'selected directory');
      mkdirSync(selected);
      writeFileSync(
        join(selected, 'index.mjs'),
        'export function main(){return {kind:"drain",status:0}}',
      );
    }
    const child = invoke(fixture, ['--preflight'], { PUNI_EXECUTABLE: selected });
    requireNormalChild(child, 1);
    expect(child.stderr.toString()).toContain(
      'selected PUNI entrypoint must be a readable regular file',
    );
  });
}

it('backend probe adapter refuses a noncallable main with its provisioning instruction', () => {
  const fixture = createFixture('export const main=7;');
  const child = invoke(fixture);
  requireNormalChild(child, 1);
  expect(child.stderr.toString()).toContain('selected PUNI must export callable main');
});

for (const completion of [
  'null',
  '{kind:"wrong",status:0}',
  '{kind:"drain",status:256}',
  '{kind:"drain",status:-1}',
  '{kind:"drain",status:0.5}',
  '{kind:"drain",status:"0"}',
]) {
  it('backend probe adapter refuses invalid completion ' + completion, () => {
    const fixture = createFixture('export function main(){return ' + completion + '}');
    const child = invoke(fixture);
    requireNormalChild(child, 1);
    expect(child.stderr.toString()).toContain('selected PUNI returned an invalid completion');
  });
}

for (const boundary of ['import', 'completion'] as const) {
  it('backend probe adapter exits after ' + boundary + ' failure despite a retained timer', () => {
    const fixture = createFixture();
    const ready = join(fixture.root, 'ready');
    const retain =
      'setInterval(()=>{},1000);writeFileSync(' +
      JSON.stringify(ready) +
      ',"retained timer reached");';
    writeFileSync(
      fixture.selected,
      'import{writeFileSync}from"node:fs";' +
        (boundary === 'import'
          ? retain + 'throw new Error("private selected failure");'
          : 'export function main(){' + retain + 'return {kind:"wrong",status:0}}'),
    );
    const child = invoke(fixture);
    requireNormalChild(child, 1);
    expect(readFileSync(ready, 'utf8')).toBe('retained timer reached');
    expect(child.stderr.toString()).toStartWith('backend probe caller:');
    expect(child.stderr.toString()).not.toContain('private selected failure');
  });
}

it('backend probe adapter honors explicit exit completion with a retained module timer', () => {
  const fixture = createFixture(
    'setInterval(()=>{},1000);export function main(){return {kind:"exit",status:37}}',
  );
  const child = invoke(fixture);
  requireNormalChild(child, 37);
});

it('backend probe adapter retains its native failure reporter before selected import', () => {
  const fixture = createFixture();
  const ready = join(fixture.root, 'replaced'),
    replacement = join(fixture.root, 'wrong reporter');
  writeFileSync(
    fixture.selected,
    'import{writeFileSync}from"node:fs";const stderr={writer(){writeFileSync(' +
      JSON.stringify(replacement) +
      ',"replacement reached");throw new Error("wrong factory")}};Object.defineProperty(Bun,"stderr",{value:stderr});if(Bun.stderr!==stderr)throw new Error("fixture replacement failed");writeFileSync(' +
      JSON.stringify(ready) +
      ',"replaced");throw new Error("private failure");',
  );
  const child = invoke(fixture);
  requireNormalChild(child, 1);
  expect(readFileSync(ready, 'utf8')).toBe('replaced');
  expect(existsSync(replacement)).toBe(false);
  expect(child.stderr.toString()).toContain(
    'backend probe caller: selected installed PUNI could not complete',
  );
});

for (const boundary of ['configuration', 'dotenv'] as const) {
  it('backend probe adapter blocks candidate ' + boundary + ' startup', () => {
    const fixture = createFixture();
    const marker = join(fixture.root, 'candidate startup'),
      capture = join(fixture.root, 'environment.json');
    writeFileSync(
      join(fixture.caller, 'preload.mjs'),
      'import{writeFileSync}from"node:fs";writeFileSync(' +
        JSON.stringify(marker) +
        ',"candidate preload");process.exit(73);',
    );
    writeFileSync(join(fixture.caller, 'bunfig.toml'), 'preload=["./preload.mjs"]\n');
    writeFileSync(join(fixture.caller, '.env'), 'PUNI_CANDIDATE_SETTING=must-not-load\n');
    writeFileSync(
      fixture.selected,
      'import{writeFileSync}from"node:fs";export function main(args,context){writeFileSync(' +
        JSON.stringify(capture) +
        ',JSON.stringify(context.environment));return {kind:"drain",status:0}}',
    );
    const child = invoke(fixture, ['--preflight']);
    requireNormalChild(child, 0);
    expect(existsSync(marker)).toBe(false);
    expect(JSON.parse(readFileSync(capture, 'utf8'))).not.toHaveProperty('PUNI_CANDIDATE_SETTING');
  });
}

for (const setting of ['BUN_OPTIONS', 'BUN_INSPECT_PRELOAD', 'NODE_OPTIONS', 'BUN_BE_BUN']) {
  it('backend probe adapter erases startup setting ' + setting + ' before code', () => {
    const fixture = createFixture();
    const marker = join(fixture.root, 'startup executed'),
      capture = join(fixture.root, 'environment.json');
    const preloadDirectory = mkdtempSync('/tmp/puni-backend-preload-v124-');
    roots.push(preloadDirectory);
    const preload = join(preloadDirectory, 'preload.mjs');
    writeFileSync(
      preload,
      'import{writeFileSync}from"node:fs";writeFileSync(' +
        JSON.stringify(marker) +
        ',"executed");process.exit(73);',
    );
    writeFileSync(
      fixture.selected,
      'import{writeFileSync}from"node:fs";export function main(args,context){writeFileSync(' +
        JSON.stringify(capture) +
        ',JSON.stringify(context.environment));return {kind:"drain",status:0}}',
    );
    const value =
      setting === 'BUN_OPTIONS'
        ? '--preload=' + preload
        : setting === 'BUN_BE_BUN'
          ? '1'
          : setting === 'NODE_OPTIONS'
            ? '--require=' + preload
            : preload;
    const child = invoke(fixture, ['--preflight'], { [setting]: value });
    expect(existsSync(marker)).toBe(false);
    requireNormalChild(child, 0);
    expect(JSON.parse(readFileSync(capture, 'utf8'))).not.toHaveProperty(setting);
  });
}
