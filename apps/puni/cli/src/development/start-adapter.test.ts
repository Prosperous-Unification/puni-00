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
const adapter = join(repository, 'bin/dev.ts');
interface FixtureCustody {
  isConfirmed: boolean;
  failure: { readonly cause: unknown } | undefined;
}
const roots: { readonly root: string; readonly custody: FixtureCustody }[] = [];
afterEach(() => {
  const failures: unknown[] = [];
  for (const fixture of roots.splice(0)) {
    if (!fixture.custody.isConfirmed) {
      failures.push(
        new Error(
          'direct sync-child settlement unconfirmed; fixture retained: ' + fixture.root,
          fixture.custody.failure === undefined
            ? undefined
            : { cause: fixture.custody.failure.cause },
        ),
      );
    } else {
      try {
        rmSync(fixture.root, { recursive: true });
      } catch (cause: unknown) {
        failures.push(cause);
      }
    }
  }
  if (failures.length > 0)
    throw new AggregateError(failures, 'development adapter fixture custody/cleanup failed');
});
function createFixture(body = 'export function main(){return {kind:"drain",status:0}}') {
  const root = mkdtempSync(join(tmpdir(), 'puni development adapter '));
  const custody: FixtureCustody = { isConfirmed: true, failure: undefined };
  roots.push({ root, custody });
  const caller = join(root, 'caller cwd');
  mkdirSync(caller);
  const selected = join(root, 'selected PUNI.mjs');
  writeFileSync(selected, body);
  return { root, caller, selected, custody };
}
function observeSpawn<
  Child extends {
    readonly signalCode?: unknown;
    readonly exitedDueToTimeout?: boolean;
    readonly exitedDueToMaxBuffer?: boolean;
  },
>(fixture: ReturnType<typeof createFixture>, spawn: () => Child): Child {
  fixture.custody.isConfirmed = false;
  fixture.custody.failure = undefined;
  try {
    const child = spawn();
    fixture.custody.isConfirmed =
      child.signalCode === undefined &&
      child.exitedDueToTimeout !== true &&
      child.exitedDueToMaxBuffer !== true;
    return child;
  } catch (cause: unknown) {
    fixture.custody.failure = { cause };
    throw cause;
  }
}
function executeAdapter(fixture: ReturnType<typeof createFixture>) {
  const environment: Record<string, string> = {
    PATH: '/usr/bin:/bin',
    TMPDIR: fixture.root,
    WBS_DEV_PORTS: '',
  };
  environment['PUNI_EXECUTABLE'] = fixture.selected;
  return observeSpawn(fixture, () =>
    Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', adapter], {
      cwd: fixture.caller,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    }),
  );
}
const unexpected =
  'development: selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE\n';
const invalid =
  'development: selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact\n';

it('repository development adapter captures the closed vector and independent caller context before delivered import', () => {
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
    args: ['dash', 'dev', '--repository', repository],
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
    developmentIO: { stdin: 0, stdout: 1, stderr: 2 },
  });
});

it('repository development executable honors exit completion with a retained module timer', () => {
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
  it('repository development adapter refuses ' + boundary + ' without a fallback', () => {
    const fixture = createFixture();
    let selected: string | undefined = fixture.selected;
    if (boundary === 'missing-selection') selected = undefined;
    else if (boundary === 'relative-selection') selected = 'relative-puni.mjs';
    else if (boundary === 'missing-file') selected = join(fixture.root, 'absent.mjs');
    else chmodSync(fixture.selected, 0);
    const environment: Record<string, string> = { PATH: '/usr/bin:/bin' };
    if (selected !== undefined) environment['PUNI_EXECUTABLE'] = selected;
    const child = observeSpawn(fixture, () =>
      Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', adapter], {
        cwd: fixture.caller,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      }),
    );
    expect(child.signalCode).toBeUndefined();
    expect(child.exitCode).toBe(1);
    expect(child.stdout.length).toBe(0);
    expect(child.stderr.toString()).toBe(
      boundary === 'missing-selection' || boundary === 'relative-selection'
        ? 'development: set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation\n'
        : unexpected,
    );
  });
}

it('repository development adapter refuses a noncallable selected main export', () => {
  const fixture = createFixture('export const main=7;');
  const child = executeAdapter(fixture);
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toBe(
    'development: selected PUNI must export callable main; provision the reviewed current PUNI artifact\n',
  );
});

for (const boundary of ['import', 'completion'] as const) {
  it(
    'repository development executable terminates retained timer after ' + boundary + ' failure',
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
    'repository development executable retains native diagnostic stderr after ' +
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

it('reusable repository development invocation preserves an exact unknown import failure', () => {
  const fixture = createFixture('throw undefined;');
  const program =
    'const{runRepositoryDevelopment}=await import(' +
    JSON.stringify(pathToFileURL(adapter).href) +
    ');let observed={caught:false,isUndefined:false};try{await runRepositoryDevelopment([])}catch(cause){observed={caught:true,isUndefined:cause===undefined}}process.stdout.write(JSON.stringify(observed));';
  const child = observeSpawn(fixture, () =>
    Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program], {
      cwd: fixture.caller,
      env: { PUNI_EXECUTABLE: fixture.selected, PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    }),
  );
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({ caught: true, isUndefined: true });
});

it('repository development adapter supplies its pre-import native IO factories and diagnostic state', () => {
  const fixture = createFixture();
  const ready = join(fixture.root, 'replaced'),
    replacement = join(fixture.root, 'replacement');
  const captured = join(fixture.root, 'io-state.json');
  writeFileSync(
    fixture.selected,
    [
      'import{appendFileSync,writeFileSync}from"node:fs";',
      'const factory=channel=>({writer(){appendFileSync(' +
        JSON.stringify(replacement) +
        ',channel+"\\n");return{write(bytes){return bytes.byteLength},flush(){return 0},unref(){return undefined}}}});',
      'const out=factory("stdout"),err=factory("stderr");Object.defineProperty(Bun,"stdout",{value:out});Object.defineProperty(Bun,"stderr",{value:err});if(Bun.stdout!==out||Bun.stderr!==err)throw new Error("replacement fixture failed");writeFileSync(' +
        JSON.stringify(ready) +
        ',"replaced");',
      'export async function main(args,context){const io=context.developmentIO;const cause=new Error("controlled delivered diagnostic");io.recordDiagnosticAttempt(cause,{kind:"reported"});const attempt=io.readDiagnosticAttempt();writeFileSync(' +
        JSON.stringify(captured) +
        ',JSON.stringify({stdio:[io.stdin,io.stdout,io.stderr],same:attempt.cause===cause,kind:attempt.outcome.kind}));const stdout=io.openStdout(),stderr=io.openStderr();try{await stdout.write(new Uint8Array([0,128,255]));await stdout.flush();await stderr.write(Buffer.from("DEV-NATIVE-IO\\n"));await stderr.flush()}finally{try{stdout.unref()}finally{stderr.unref()}}return{kind:"exit",status:37}}',
    ].join('\n'),
  );
  const child = executeAdapter(fixture);
  expect(readFileSync(ready, 'utf8')).toBe('replaced');
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode, child.stderr.toString()).toBe(37);
  expect<Uint8Array>(child.stdout).toEqual(new Uint8Array([0, 128, 255]));
  expect(child.stderr.toString()).toBe('DEV-NATIVE-IO\n');
  expect(existsSync(replacement)).toBe(false);
  const observed: unknown = JSON.parse(readFileSync(captured, 'utf8'));
  expect(observed).toEqual({ stdio: [0, 1, 2], same: true, kind: 'reported' });
});
