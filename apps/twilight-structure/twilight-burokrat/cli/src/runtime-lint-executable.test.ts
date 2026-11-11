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
