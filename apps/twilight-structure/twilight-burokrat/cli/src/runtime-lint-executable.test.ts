import { Buffer } from 'node:buffer';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterEach, beforeAll, expect, it } from 'bun:test';

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

function createFixture(validator: string) {
  const fixture = createInstalledLintFixture(launcher, validator);
  roots.push(fixture.root);
  return fixture;
}
function runFixture(
  fixture: ReturnType<typeof createFixture>,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    lookup: { directory: fixture.root, path: '/usr/bin:/bin' },
    activationRoot: fixture.archive,
    required: false,
    scratchDirectory: fixture.scratch,
    ...overrides,
  };
  const program = [
    'import{existsSync}from"node:fs";',
    'import{runInstalledLint}from ' +
      JSON.stringify(new URL('./runtime-facade.ts', import.meta.url).href) +
      ';',
    'import{createLaunch}from ' + JSON.stringify(import.meta.resolve('@shared/bun-startup')) + ';',
    'const context=' +
      JSON.stringify(configuration) +
      ';const request=' +
      JSON.stringify(fixture.invocation.request) +
      ';',
    'Bun.stdin.stream=()=>{throw new Error("typed executable must not read stdin");};process.argv=[process.execPath,"misleading-entry","unsupported-mode","--unknown"];',
    'const stage=' + JSON.stringify(join(fixture.root, 'stage.pid')) + ';',
    'const timer=context.cancelSignal===undefined?undefined:setInterval(()=>{if(existsSync(stage)){clearInterval(timer);process.kill(process.pid,context.cancelSignal);}},5);',
    'let status;try{status=await runInstalledLint(request,{...context,trustedNodeModules:undefined,launch:entrypoint=>createLaunch(process.execPath,entrypoint)});}finally{if(timer!==undefined)clearInterval(timer);}process.exit(status);',
  ].join('\n');
  const entrypoint = join(fixture.root, 'executable.ts');
  writeFileSync(entrypoint, program);
  return Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: Buffer.from('not a lint JSON transport'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
}

it('owns typed installed execution without stdin or argv re-entry and preserves binary verdict37', () => {
  const fixture = createFixture(
    'process.stdout.write(Buffer.from([0,255,65,10]));process.stderr.write(Buffer.from([0,254,66,10]));process.exitCode=37;',
  );
  const child = runFixture(fixture);
  expect(child.exitCode, child.stderr.toString()).toBe(37);
  expect(child.stdout).toEqual(Buffer.from([0, 255, 65, 10]));
  expect(child.stderr).toEqual(Buffer.from([0, 254, 66, 10]));
});
it('contains runtime construction failure through the executable bounded reporter', () => {
  const fixture = createFixture('throw new Error("must not execute validator");');
  const child = runFixture(fixture, {
    lookup: { directory: join(fixture.root, 'absent lookup'), path: '/usr/bin:/bin' },
  });
  expect(child.exitCode, child.stderr.toString()).toBe(1);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.toString()).toMatch(/^tool-wiki lint: .*\n$/u);
  expect(child.stderr.toString()).not.toContain('at runInstalledLint');
});
it('preserves required admission status78 through the typed executable owner', () => {
  const fixture = createFixture('process.stdout.write("uncertified report");');
  const child = runFixture(fixture, { required: true });
  expect(child.exitCode, child.stderr.toString()).toBe(78);
  expect(child.stdout.toString()).toBe('uncertified report');
});
it('reports optional inactivity only after installed preflight through the owned executable', () => {
  const fixture = createFixture('throw new Error("must not execute validator");');
  const child = runFixture(fixture, { activationRoot: undefined });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toBe(
    JSON.stringify({
      schemaVersion: 1,
      status: 'inactive',
      certified: false,
      reason: 'external activation root is not provisioned',
    }) + '\n',
  );
  expect(child.stderr.length).toBe(0);
});

it('freezes relative Git lookup at the independently captured origin instead of provider directories', () => {
  const fixture = createFixture('process.stdout.write("typed verdict");');
  const trusted = join(fixture.root, 'trusted lookup'),
    trustedMarker = join(fixture.root, 'trusted-git'),
    providerMarker = join(fixture.root, 'provider-git');
  function writeGit(directory: string, marker: string) {
    const bin = join(directory, 'relative-bin');
    mkdirSync(bin, { recursive: true });
    symlinkSync(process.execPath, join(bin, 'bun'));
    const path = join(bin, 'git');
    writeFileSync(
      path,
      createShebang() +
        '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
        JSON.stringify(marker) +
        ',"git\\n");const child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});if(child.signalCode!==undefined)throw new Error("owned Git wrapper was signaled");process.exit(child.exitCode);\n',
    );
    chmodSync(path, 0o755);
  }
  writeGit(trusted, trustedMarker);
  writeGit(fixture.installedDirectory, providerMarker);
  writeGit(fixture.toolkit, providerMarker);
  const child = runFixture(fixture, {
    lookup: { directory: trusted, path: 'relative-bin:/usr/bin:/bin' },
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toBe('typed verdict');
  expect(existsSync(trustedMarker)).toBe(true);
  expect(existsSync(providerMarker)).toBe(false);
});

it('delivers actual native cancellation through the typed owner and removes its live stage', () => {
  // The role exits on its own after three seconds even under a missing-subscription fault.
  const actual = createInstalledLintFixture(
    launcher,
    (root) =>
      'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));await Bun.sleep(3000);',
  );
  roots.push(actual.root);
  const child = runFixture(actual, { cancelSignal: 'SIGINT' });
  expect(child.exitCode, child.stderr.toString()).toBe(130);
  expect(child.stderr.length).toBe(0);
  expect(readdirSync(actual.scratch)).toEqual([]);
  const pid = Number(readFileSync(join(actual.root, 'stage.pid'), 'utf8'));
  let absence: unknown;
  try {
    process.kill(-pid, 0);
  } catch (cause) {
    absence = cause;
  }
  expect(absence).toMatchObject({ code: 'ESRCH' });
});

for (const entry of [
  { required: undefined, status: 0 },
  { required: '0', status: 0 },
  { required: false, status: 0 },
  { required: '1', status: 78 },
  { required: true, status: 78 },
] as const) {
  it(
    'normalizes executable required setting ' +
      JSON.stringify(entry.required) +
      ' without changing its admission verdict',
    () => {
      const fixture = createFixture('process.stdout.write("uncertified boundary report");');
      const child = runFixture(fixture, { required: entry.required });
      expect(child.exitCode, child.stderr.toString()).toBe(entry.status);
      expect(child.stdout.toString()).toBe('uncertified boundary report');
      expect(child.stderr).toEqual(
        Buffer.from(
          entry.status === 78
            ? 'tool-wiki lint: required admission did not return certified enforce output\n'
            : '',
        ),
      );
      expect(readdirSync(fixture.scratch)).toEqual([]);
    },
  );
}

for (const required of ['', 'true', 'false', '2', ' 1 ']) {
  it(
    'refuses raw executable required setting ' +
      JSON.stringify(required) +
      ' with one owned usage diagnostic',
    () => {
      const fixture = createFixture(
        'throw new Error("invalid required setting reached validator");',
      );
      const child = runFixture(fixture, { required });
      expect(child.exitCode, child.stderr.toString()).toBe(64);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr).toEqual(
        Buffer.from('tool-wiki lint: TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1\n'),
      );
      expect(readdirSync(fixture.scratch)).toEqual([]);
    },
  );
}

it('refuses a malformed required setting before runtime lookup or candidate IO', () => {
  const fixture = createFixture('throw new Error("invalid required setting reached validator");');
  const child = runFixture(fixture, {
    required: 'true',
    lookup: { directory: join(fixture.root, 'absent lookup'), path: undefined },
  });
  expect(child.exitCode, child.stderr.toString()).toBe(64);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr).toEqual(
    Buffer.from('tool-wiki lint: TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1\n'),
  );
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

/** Isolated child reuses the real owner/broker and existing FileSink seam; no parent writer changes. */
function runRequiredDiagnosticCancellation(
  fixture: ReturnType<typeof createFixture>,
  signal: 'SIGINT' | 'SIGTERM',
) {
  const observations = join(fixture.root, 'required-diagnostic.json');
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    lookup: { directory: join(fixture.root, 'absent lookup'), path: undefined },
    activationRoot: fixture.archive,
    trustedNodeModules: undefined,
    required: 'true',
    scratchDirectory: fixture.scratch,
  };
  const program = [
    'import{writeFileSync}from"node:fs";',
    'import{runInstalledLint}from ' +
      JSON.stringify(new URL('./runtime-facade.ts', import.meta.url).href) +
      ';',
    'import{createLaunch}from ' + JSON.stringify(import.meta.resolve('@shared/bun-startup')) + ';',
    'const blocked=Promise.withResolvers();let diagnostic="",writes=0,flushes=0,unrefs=0;',
    'Bun.stderr.writer=()=>({write(bytes){writes++;diagnostic+=Buffer.from(bytes).toString();process.emit(' +
      JSON.stringify(signal) +
      ');return blocked.promise;},flush(){flushes++;return 0;},unref(){unrefs++;}});',
    'const status=await runInstalledLint(' +
      JSON.stringify(fixture.invocation.request) +
      ',{...' +
      JSON.stringify(configuration) +
      ',launch:entrypoint=>createLaunch(process.execPath,entrypoint)});',
    'writeFileSync(' +
      JSON.stringify(observations) +
      ',JSON.stringify({status,diagnostic,writes,flushes,unrefs}));process.stdout.write(String(status));process.exit(status);',
  ].join('\n');
  const entrypoint = join(fixture.root, 'required-diagnostic.ts');
  writeFileSync(entrypoint, program);
  const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  return { child, observations };
}

for (const [signal, status] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  it(
    'preserves modeled ' + signal + ' cancellation while awaiting the invalid-setting diagnostic',
    () => {
      const fixture = createFixture('throw new Error("usage refusal must not execute validator");');
      const { child, observations } = runRequiredDiagnosticCancellation(fixture, signal);
      expect(child.exitCode, child.stderr.toString()).toBe(status);
      expect(child.stdout.toString()).toBe(String(status));
      expect(child.stderr.length).toBe(0);
      const observed: unknown = JSON.parse(readFileSync(observations, 'utf8'));
      expect(observed).toEqual({
        status,
        diagnostic: 'tool-wiki lint: TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1\n',
        writes: 1,
        flushes: 0,
        unrefs: 1,
      });
      expect(readdirSync(fixture.scratch)).toEqual([]);
    },
  );
}

it('preserves an unexpected undefined required accessor failure through the existing executable owner', () => {
  const fixture = createFixture(
    'throw new Error("unexpected required accessor must not execute validator");',
  );
  const observations = join(fixture.root, 'required-accessor.json');
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    lookup: { directory: fixture.root, path: '/usr/bin:/bin' },
    activationRoot: fixture.archive,
    trustedNodeModules: undefined,
    required: false,
    scratchDirectory: fixture.scratch,
  };
  const program = [
    'import{writeFileSync}from"node:fs";',
    'import{runInstalledLint}from ' +
      JSON.stringify(new URL('./runtime-facade.ts', import.meta.url).href) +
      ';',
    'import{createLaunch}from ' + JSON.stringify(import.meta.resolve('@shared/bun-startup')) + ';',
    'const context={...' +
      JSON.stringify(configuration) +
      ',launch:entrypoint=>createLaunch(process.execPath,entrypoint)};let reads=0;',
    'Object.defineProperty(context,"required",{get(){reads++;throw undefined;}});',
    'const status=await runInstalledLint(' +
      JSON.stringify(fixture.invocation.request) +
      ',context);',
    'writeFileSync(' +
      JSON.stringify(observations) +
      ',JSON.stringify({reads}));process.exit(status);',
  ].join('\n');
  const entrypoint = join(fixture.root, 'required-accessor.ts');
  writeFileSync(entrypoint, program);
  const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(1);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.toString()).toBe('tool-wiki lint: undefined\n');
  const observed: unknown = JSON.parse(readFileSync(observations, 'utf8'));
  expect(observed).toEqual({ reads: 1 });
  expect(readdirSync(fixture.scratch)).toEqual([]);
});
