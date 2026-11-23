import {
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

import { afterEach, expect, it } from 'bun:test';

const workspace = resolve(import.meta.dir, '../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

function createFixture(continueDeployment = false) {
  const root = mkdtempSync(join(tmpdir(), 'backend deployment caller '));
  roots.push(root);
  const tools = join(root, 'controlled tools');
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, 'bun'));
  const gitCalls = join(root, 'git-calls');
  const sshCalls = join(root, 'ssh-calls');
  const prelude = '#!' + process.execPath + '\nimport{appendFileSync}from"node:fs";';
  writeFileSync(
    join(tools, 'git'),
    prelude +
      'const args=process.argv.slice(2);appendFileSync(' +
      JSON.stringify(gitCalls) +
      ',JSON.stringify(args)+"\\n");if(args[0]==="rev-parse")process.stdout.write(args.includes("--abbrev-ref")?"main\\n":"1111111111111111111111111111111111111111\\n");else if(args[0]==="branch")process.stdout.write("origin/main\\n");else if(args[0]!=="diff"&&args[0]!=="ls-files")throw new Error("Unexpected controlled Git operation");\n',
    { mode: 0o700 },
  );
  writeFileSync(
    join(tools, 'ssh'),
    prelude +
      'appendFileSync(' +
      JSON.stringify(sshCalls) +
      ',"controlled SSH reached\\n");' +
      (continueDeployment
        ? 'const{readFileSync}=await import("node:fs");if(readFileSync(' +
          JSON.stringify(sshCalls) +
          ',"utf8").trim().split("\\n").length===1)process.stdout.write("0\\n");'
        : 'process.exit(75);') +
      '\n',
    { mode: 0o700 },
  );
  writeFileSync(
    join(tools, 'curl'),
    '#!' +
      process.execPath +
      '\nconst url=process.argv.at(-1);if(url==="https://dev.wbs.bulletpoints.club/")process.stdout.write("200");else if(url==="https://dev.wbs.bulletpoints.club/api/health"||url==="https://dev.wbs.bulletpoints.club/ws")process.stdout.write("404");else throw new Error("Unexpected controlled curl endpoint");\n',
    { mode: 0o700 },
  );
  return { root, tools, gitCalls, sshCalls };
}

function deploy(
  fixture: ReturnType<typeof createFixture>,
  selection?: string,
  supplied: Readonly<Record<string, string>> = {},
) {
  const environment: Record<string, string> = {
    ...supplied,
    PATH: fixture.tools + ':/usr/bin:/bin',
  };
  if (selection !== undefined) environment['PUNI_EXECUTABLE'] = selection;
  const bash = Bun.which('bash');
  if (bash === null)
    throw new Error('The legacy deployment caller control requires Bash until its port completes');
  return Bun.spawnSync([bash, join(workspace, 'bin/dev-deploy.sh')], {
    cwd: fixture.root,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
}

for (const selection of [undefined, 'relative-puni.mjs', '/absent reviewed PUNI/main.mjs']) {
  it(
    'manual deployment refuses PUNI selection ' + String(selection) + ' before deployment effects',
    () => {
      const fixture = createFixture();
      const child = deploy(fixture, selection);
      expect(child.signalCode, child.stderr.toString()).toBeUndefined();
      expect(child.exitedDueToTimeout).toBe(false);
      expect(existsSync(fixture.sshCalls)).toBe(false);
      expect(existsSync(fixture.gitCalls)).toBe(false);
      expect(child.exitCode).toBe(1);
      expect(child.stderr.toString()).toContain('backend probe caller:');
    },
  );
}

it('manual deployment enters its controlled existing path only after silent selected PUNI grammar preflight', () => {
  const fixture = createFixture();
  const selected = join(fixture.root, 'reviewed PUNI.mjs');
  const captured = join(fixture.root, 'preflight.json');
  writeFileSync(
    selected,
    'import{writeFileSync}from"node:fs";export function main(args,context){if(process.env.NODE_OPTIONS!==undefined)throw new Error("startup option reached selected PUNI");writeFileSync(' +
      JSON.stringify(captured) +
      ',JSON.stringify(args));context.stdout("suppressed help bytes");return {kind:"drain",status:0}}\n',
  );
  const child = deploy(fixture, selected, { NODE_OPTIONS: '--no-warnings' });
  expect(child.signalCode, child.stderr.toString()).toBeUndefined();
  expect(child.exitedDueToTimeout).toBe(false);
  expect(child.exitCode, child.stderr.toString()).toBe(75);
  expect(existsSync(captured)).toBe(true);
  expect(JSON.parse(readFileSync(captured, 'utf8'))).toEqual(['dash', 'dev-probe', 'be', '--help']);
  expect(child.stdout.toString()).not.toContain('suppressed help bytes');
  expect(existsSync(fixture.gitCalls)).toBe(true);
  expect(readFileSync(fixture.sshCalls, 'utf8')).toBe('controlled SSH reached\n');
});

for (const source of [
  'export const main=7;',
  'export function main(){return {kind:"wrong",status:0}}',
  'export function main(){return {kind:"drain",status:1}}',
]) {
  it(
    'manual deployment refuses unusable selected PUNI before deployment effects: ' + source,
    () => {
      const fixture = createFixture();
      const selected = join(fixture.root, 'unusable selected PUNI.mjs');
      writeFileSync(selected, source);
      const child = deploy(fixture, selected);
      expect(child.signalCode).toBeUndefined();
      expect(child.exitedDueToTimeout).toBe(false);
      expect(child.exitCode).toBe(1);
      expect(existsSync(fixture.gitCalls)).toBe(false);
      expect(existsSync(fixture.sshCalls)).toBe(false);
    },
  );
}

for (const healthStatus of [0, 1, 37]) {
  it(
    'manual deployment preserves selected backend health status ' +
      String(healthStatus) +
      ' through its final verdict',
    () => {
      const fixture = createFixture(true);
      const selected = join(fixture.root, 'selected PUNI.mjs'),
        captured = join(fixture.root, 'invocations.jsonl');
      writeFileSync(
        selected,
        'import{appendFileSync}from"node:fs";export function main(args){appendFileSync(' +
          JSON.stringify(captured) +
          ',JSON.stringify(args)+"\\n");return {kind:"drain",status:args.at(-1)==="--help"?0:' +
          String(healthStatus) +
          '}}',
      );
      const child = deploy(fixture, selected);
      expect(child.signalCode, child.stderr.toString()).toBeUndefined();
      expect(child.exitedDueToTimeout).toBe(false);
      expect(child.exitCode, child.stderr.toString()).toBe(healthStatus === 0 ? 0 : 1);
      expect(
        readFileSync(captured, 'utf8')
          .trim()
          .split('\n')
          .map((line) => {
            const invocation: unknown = JSON.parse(line);
            return invocation;
          }),
      ).toEqual([
        ['dash', 'dev-probe', 'be', '--help'],
        ['dash', 'dev-probe', 'be', 'https://dev.wbs.bulletpoints.club'],
      ]);
      expect(readFileSync(fixture.sshCalls, 'utf8').trim().split('\n')).toHaveLength(2);
      expect(child.stdout.toString() + child.stderr.toString()).toContain(
        healthStatus === 0 ? 'dev healthy at' : 'dev is NOT healthy at',
      );
    },
  );
}
