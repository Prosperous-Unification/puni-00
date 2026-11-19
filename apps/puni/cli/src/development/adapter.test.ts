import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, expect, it } from 'bun:test';

const repository = resolve(import.meta.dir, '../../../../..');
const adapter = join(repository, 'bin/dev-ports.ts');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function createFixture(body = 'export function main(){return {kind:"drain",status:0}}') {
  const root = mkdtempSync(join(tmpdir(), 'puni dev-port adapter '));
  roots.push(root);
  const caller = join(root, 'caller cwd');
  mkdirSync(caller);
  const selected = join(root, 'selected PUNI.mjs');
  writeFileSync(selected, body);
  return { root, caller, selected };
}
function executeAdapter(fixture: ReturnType<typeof createFixture>) {
  const environment: Record<string, string> = {
    PATH: '/usr/bin:/bin',
    TMPDIR: fixture.root,
    WBS_DEV_PORTS: '',
  };
  environment['PUNI_EXECUTABLE'] = fixture.selected;
  return Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', adapter, 'check'],
    {
      cwd: fixture.caller,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    },
  );
}
const unexpected =
  'development ports: selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE\n';
const invalid =
  'development ports: selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact\n';

it('repository dev-port adapter captures the closed vector and independent caller context before delivered import', () => {
  const fixture = createFixture();
  const record = join(fixture.root, 'context.json');
  writeFileSync(
    fixture.selected,
    [
      'import{writeFileSync}from"node:fs";',
      'process.chdir(' +
        JSON.stringify(fixture.root) +
        ');process.env.WBS_DEV_PORTS="changed";process.argv=["changed"];',
      'export function main(args,context){writeFileSync(' +
        JSON.stringify(record) +
        ',JSON.stringify({args,...context,stdout:typeof context.stdout,stderr:typeof context.stderr}));context.stdout(Buffer.from([0,128,255]));context.stderr("selected diagnostic\\n");return {kind:"drain",status:37}}',
    ].join('\n'),
  );
  const child = executeAdapter(fixture);
  expect(child.signalCode, child.stderr.toString()).toBeUndefined();
  expect(child.exitCode).toBe(37);
  expect<Uint8Array>(child.stdout).toEqual(new Uint8Array([0, 128, 255]));
  expect(child.stderr.toString()).toBe('selected diagnostic\n');
  const captured: unknown = JSON.parse(readFileSync(record, 'utf8'));
  expect(captured).toEqual({
    args: ['dash', 'dev-ports', 'check', '--repository', repository],
    installation: { directory: fixture.root, entrypoint: fixture.selected },
    lookup: { directory: fixture.caller, path: '/usr/bin:/bin' },
    callerDirectory: fixture.caller,
    runtime: process.execPath,
    temporaryDirectory: fixture.root,
    environment: {
      PATH: '/usr/bin:/bin',
      TMPDIR: fixture.root,
      WBS_DEV_PORTS: '',
      PUNI_EXECUTABLE: fixture.selected,
    },
    stdout: 'function',
    stderr: 'function',
  });
});

it('repository dev-port executable honors exit completion with a retained module timer', () => {
  const fixture = createFixture(
    'export function main(){setInterval(()=>{},1000);return {kind:"exit",status:37}}',
  );
  const child = executeAdapter(fixture);
  expect(child.signalCode, child.stderr.toString()).toBeUndefined();
  expect(child.exitCode).toBe(37);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.length).toBe(0);
});

for (const boundary of [
  'missing-selection',
  'relative-selection',
  'missing-file',
  'unreadable-file',
] as const) {
  it('repository dev-port adapter refuses ' + boundary + ' without a fallback', () => {
    const fixture = createFixture();
    let selected: string | undefined = fixture.selected;
    if (boundary === 'missing-selection') selected = undefined;
    else if (boundary === 'relative-selection') selected = 'relative-puni.mjs';
    else if (boundary === 'missing-file') selected = join(fixture.root, 'absent.mjs');
    else chmodSync(fixture.selected, 0);
    const environment: Record<string, string> = { PATH: '/usr/bin:/bin' };
    if (selected !== undefined) environment['PUNI_EXECUTABLE'] = selected;
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', adapter, 'check'],
      {
        cwd: fixture.caller,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      },
    );
    expect(child.signalCode).toBeUndefined();
    expect(child.exitCode).toBe(1);
    expect(child.stdout.length).toBe(0);
    expect(child.stderr.toString()).toBe(
      boundary === 'missing-selection' || boundary === 'relative-selection'
        ? 'development ports: set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation\n'
        : unexpected,
    );
  });
}

it('repository dev-port adapter refuses a noncallable selected main export', () => {
  const fixture = createFixture('export const main=7;');
  const child = executeAdapter(fixture);
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toBe(
    'development ports: selected PUNI must export callable main; provision the reviewed current PUNI artifact\n',
  );
});

for (const boundary of ['import', 'completion'] as const) {
  it(
    'repository dev-port executable terminates retained timer after ' + boundary + ' failure',
    () => {
      const fixture = createFixture();
      const ready = join(fixture.root, 'ready');
      const retain =
        'setInterval(()=>{},1000);writeFileSync(' + JSON.stringify(ready) + ',"ready");';
      writeFileSync(
        fixture.selected,
        'import{writeFileSync}from"node:fs";' +
          (boundary === 'import'
            ? retain + 'throw new Error("fixture import failure");'
            : 'export function main(){' + retain + 'return {kind:"wrong",status:0}}'),
      );
      const child = executeAdapter(fixture);
      expect(readFileSync(ready, 'utf8')).toBe('ready');
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(1);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toBe(boundary === 'import' ? unexpected : invalid);
    },
  );
  it(
    'repository dev-port executable retains native diagnostic stderr after ' +
      boundary +
      ' output replacement',
    () => {
      const fixture = createFixture();
      const ready = join(fixture.root, 'ready'),
        replacement = join(fixture.root, 'replacement');
      const poison =
        'import{appendFileSync,writeFileSync}from"node:fs";' +
        'const factory=channel=>({writer(){appendFileSync(' +
        JSON.stringify(replacement) +
        ',channel+" writer\\n");return {write(bytes){appendFileSync(' +
        JSON.stringify(replacement) +
        ',channel+" write "+Buffer.from(bytes).toString("hex")+"\\n");return bytes.byteLength},flush(){return 0},unref(){}}}});' +
        'const stdout=factory("stdout"),stderr=factory("stderr");Object.defineProperty(Bun,"stdout",{value:stdout});Object.defineProperty(Bun,"stderr",{value:stderr});if(Bun.stdout!==stdout||Bun.stderr!==stderr)throw new Error("fixture replacement failed");';
      const witness = 'writeFileSync(' + JSON.stringify(ready) + ',"actually replaced");';
      writeFileSync(
        fixture.selected,
        poison +
          (boundary === 'import'
            ? witness + 'throw new Error("fixture failure");'
            : 'export function main(){' + witness + 'return {kind:"drain",status:256}}'),
      );
      const child = executeAdapter(fixture);
      expect(readFileSync(ready, 'utf8')).toBe('actually replaced');
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(1);
      expect({
        stdout: [...child.stdout],
        stderr: [...child.stderr],
        replacement: existsSync(replacement) ? readFileSync(replacement, 'utf8') : null,
      }).toEqual({
        stdout: [],
        stderr: [...Buffer.from(boundary === 'import' ? unexpected : invalid)],
        replacement: null,
      });
    },
  );
}

it('reusable repository dev-port invocation preserves an exact unknown import failure', () => {
  const fixture = createFixture('throw undefined;');
  const program =
    'const{runRepositoryPorts}=await import(' +
    JSON.stringify(pathToFileURL(adapter).href) +
    ');let observed={caught:false,isUndefined:false};try{await runRepositoryPorts(["check"])}catch(cause){observed={caught:true,isUndefined:cause===undefined}}process.stdout.write(JSON.stringify(observed));';
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: fixture.caller,
      env: { PUNI_EXECUTABLE: fixture.selected, PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    },
  );
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({ caught: true, isUndefined: true });
});
