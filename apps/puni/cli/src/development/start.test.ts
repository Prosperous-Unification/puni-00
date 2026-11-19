import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { main } from '../entrypoint';
import type { Context } from '../execute-command';

const projects = '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01';
const emptyPorts = 'WBS_DEV_PORTS is set and empty: no dev port is being checked\n';
const nxStdout = Buffer.concat([
  new Uint8Array([0, 128, 255]),
  Buffer.from('\u001b[32mcontrolled Nx ready\u001b[39m\n'),
]);
const nxStderr = Buffer.from('\u001b[31mcontrolled Nx final stderr\u001b[39m\n');

/** Fixed local dependency emulation; no arbitrary command option is added to the public request. */
function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'puni full dev owner '));
  const repository = join(root, 'consumer checkout');
  const caller = join(root, 'independent caller');
  const directory = join(repository, 'node_modules/nx');
  mkdirSync(join(directory, 'dist/bin'), { recursive: true });
  mkdirSync(caller);
  writeFileSync(join(repository, 'package.json'), '{"private":true}\n');
  writeFileSync(join(repository, 'nx.json'), '{}\n');
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'nx',
      version: '0.0.0-controlled',
      type: 'commonjs',
      bin: { nx: './dist/bin/nx.js' },
    }) + '\n',
  );
  const entrypoint = join(directory, 'dist/bin/nx.js');
  const record = join(root, 'native-record.json');
  const launches = join(root, 'native-launches.jsonl');
  writeFileSync(
    entrypoint,
    [
      'const fs=require("node:fs");',
      'const record={phase:"ready",pid:process.pid,ppid:process.ppid,cwd:process.cwd(),argv:process.argv.slice(2)};',
      'fs.appendFileSync(process.env.PUNI_DEV_FIXTURE_LAUNCHES,JSON.stringify({pid:record.pid,ppid:record.ppid,cwd:record.cwd,argv:record.argv})+"\\n");',
      'const publish=()=>fs.writeFileSync(process.env.PUNI_DEV_FIXTURE_RECORD,JSON.stringify(record));publish();',
      'const deadline=setTimeout(()=>process.exit(72),4000);',
      'process.stdout.write(Buffer.from(' + JSON.stringify([...nxStdout]) + '),()=>{',
      'setTimeout(()=>process.stderr.write(Buffer.from(' +
        JSON.stringify([...nxStderr]) +
        '),()=>{',
      'record.phase="finished";publish();clearTimeout(deadline);process.exit(Number(process.env.PUNI_DEV_FIXTURE_STATUS));',
      '}),20);});',
    ].join('\n'),
  );
  return { root, repository, caller, entrypoint, record, launches };
}

/** Every owner first observes this real Bun child, its exact native PID, status and both streams. */
function assertNativePremise(fixture: ReturnType<typeof createWorkspace>, status: number) {
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      fixture.entrypoint,
      'run-many',
      '-t',
      'serve',
      projects,
    ],
    {
      cwd: fixture.repository,
      env: {
        PUNI_DEV_FIXTURE_RECORD: fixture.record,
        PUNI_DEV_FIXTURE_LAUNCHES: fixture.launches,
        PUNI_DEV_FIXTURE_STATUS: String(status),
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    },
  );
  expect(child.signalCode, child.stderr.toString()).toBeUndefined();
  expect(child.exitedDueToTimeout).toBe(false);
  expect(child.exitedDueToMaxBuffer).toBe(false);
  expect(child.exitCode, child.stderr.toString()).toBe(status);
  expect<Uint8Array>(child.stdout).toEqual(nxStdout);
  expect<Uint8Array>(child.stderr).toEqual(nxStderr);
  const recorded: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
  expect(recorded).toEqual({
    phase: 'finished',
    pid: child.pid,
    ppid: process.pid,
    cwd: fixture.repository,
    argv: ['run-many', '-t', 'serve', projects],
  });
  expect(readFileSync(fixture.launches, 'utf8')).toBe(
    JSON.stringify({
      pid: child.pid,
      ppid: process.pid,
      cwd: fixture.repository,
      argv: ['run-many', '-t', 'serve', projects],
    }) + '\n',
  );
  unlinkSync(fixture.record);
  unlinkSync(fixture.launches);
  expect(existsSync(fixture.record)).toBe(false);
  expect(existsSync(fixture.launches)).toBe(false);
}

function createContext(fixture: ReturnType<typeof createWorkspace>, status: number, log?: string) {
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  const environment: Record<string, string> = {
    PUNI_DEV_FIXTURE_RECORD: fixture.record,
    PUNI_DEV_FIXTURE_LAUNCHES: fixture.launches,
    PUNI_DEV_FIXTURE_STATUS: String(status),
    WBS_DEV_PORTS: '',
  };
  if (log !== undefined) environment['WBS_DEV_LOG'] = log;
  const context: Context = {
    installation: {
      directory: join(fixture.root, 'absent installation'),
      entrypoint: join(fixture.root, 'absent installation/puni.mjs'),
    },
    lookup: { directory: fixture.caller, path: process.env['PATH'] },
    callerDirectory: fixture.caller,
    runtime: process.execPath,
    temporaryDirectory: fixture.root,
    environment,
    stdout: (bytes) => {
      stdout.push(Buffer.from(bytes));
    },
    stderr: (bytes) => {
      stderr.push(Buffer.from(bytes));
    },
  };
  return { context, stdout, stderr };
}

/** The whole append-only launch file must name exactly the PID retained by the finished record. */
function assertSingleLaunch(
  fixture: ReturnType<typeof createWorkspace>,
  target: 'serve' | 'serve-local-solver',
) {
  const recorded: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
  if (
    recorded === null ||
    typeof recorded !== 'object' ||
    !('pid' in recorded) ||
    typeof recorded.pid !== 'number' ||
    !Number.isSafeInteger(recorded.pid) ||
    recorded.pid <= 0
  )
    throw new Error('finished controlled Nx record lacks a positive native PID');
  expect(readFileSync(fixture.launches, 'utf8')).toBe(
    JSON.stringify({
      pid: recorded.pid,
      ppid: process.pid,
      cwd: fixture.repository,
      argv: ['run-many', '-t', target, projects],
    }) + '\n',
  );
}

async function withWorkspace(use: (fixture: ReturnType<typeof createWorkspace>) => Promise<void>) {
  const fixture = createWorkspace();
  let primary: { readonly cause: unknown } | undefined;
  try {
    await use(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  let cleanup: { readonly cause: unknown } | undefined;
  try {
    rmSync(fixture.root, { recursive: true });
  } catch (cause: unknown) {
    cleanup = { cause };
  }
  if (primary !== undefined && cleanup !== undefined)
    throw new AggregateError(
      [primary.cause, cleanup.cause],
      'full dev owner and fixture removal failed',
      { cause: primary.cause },
    );
  if (primary !== undefined) throw primary.cause;
  if (cleanup !== undefined)
    throw new Error('full dev fixture removal failed', { cause: cleanup.cause });
}

for (const namespace of ['dash', 'd']) {
  it(
    namespace + ' runs the full foreground development purpose with one local Bun Nx child',
    async () => {
      await withWorkspace(async (fixture) => {
        assertNativePremise(fixture, 0);
        const { context, stdout, stderr } = createContext(fixture, 0);
        const completion = await main(
          [namespace, 'dev', '--repository', fixture.repository],
          context,
        );
        expect(completion.status, Buffer.concat(stderr).toString()).toBe(0);
        expect(completion.kind).toBe('exit');
        const recorded: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
        const pidMatcher: unknown = expect.any(Number);
        expect(recorded).toEqual({
          phase: 'finished',
          pid: pidMatcher,
          ppid: process.pid,
          cwd: fixture.repository,
          argv: ['run-many', '-t', 'serve', projects],
        });
        assertSingleLaunch(fixture, 'serve');
        expect<Uint8Array>(Buffer.concat(stdout)).toEqual(nxStdout);
        expect<Uint8Array>(Buffer.concat(stderr)).toEqual(
          Buffer.concat([Buffer.from(emptyPorts), nxStderr]),
        );
        expect(existsSync(join(fixture.repository, 'dev.log'))).toBe(false);
      });
    },
    20000,
  );
}

it('full development local-solver uses one complete namespaced run-many vector', async () => {
  await withWorkspace(async (fixture) => {
    assertNativePremise(fixture, 0);
    const { context, stderr } = createContext(fixture, 0);
    const completion = await main(
      ['dash', 'dev', '--repository', fixture.repository, '--local-solver'],
      context,
    );
    expect(completion.status, Buffer.concat(stderr).toString()).toBe(0);
    expect(completion.kind).toBe('exit');
    const recorded: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
    const pidMatcher: unknown = expect.any(Number);
    expect(recorded).toEqual({
      phase: 'finished',
      pid: pidMatcher,
      ppid: process.pid,
      cwd: fixture.repository,
      argv: ['run-many', '-t', 'serve-local-solver', projects],
    });
    assertSingleLaunch(fixture, 'serve-local-solver');
  });
}, 20000);

it('full development capture drains both streams and strips CSI while preserving the Nx failure', async () => {
  await withWorkspace(async (fixture) => {
    assertNativePremise(fixture, 3);
    const log = join(fixture.root, 'new capture directory', 'development.log');
    const { context, stdout, stderr } = createContext(fixture, 3, log);
    const completion = await main(['dash', 'dev', '--repository', fixture.repository], context);
    expect(completion.status, Buffer.concat(stderr).toString()).toBe(3);
    expect(completion.kind).toBe('exit');
    assertSingleLaunch(fixture, 'serve');
    const captured = readFileSync(log);
    expect(captured.includes(Buffer.from([0, 128, 255]))).toBe(true);
    expect(captured.includes(Buffer.from('controlled Nx ready\n'))).toBe(true);
    expect(captured.includes(Buffer.from('controlled Nx final stderr\n'))).toBe(true);
    expect(captured.includes(Buffer.from([27]))).toBe(false);
    const terminal = Buffer.concat(stdout);
    expect(terminal.includes(nxStdout)).toBe(true);
    expect(terminal.includes(nxStderr)).toBe(true);
    expect(Buffer.concat(stderr).toString()).toBe(emptyPorts);
    const recorded: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
    expect(recorded).toMatchObject({
      phase: 'finished',
      argv: ['run-many', '-t', 'serve', projects],
    });
  });
}, 20000);

it('full development refuses a real occupied IPv4 port before the local Nx child starts', async () => {
  await withWorkspace(async (fixture) => {
    assertNativePremise(fixture, 0);
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response('full-dev listener'),
    });
    let primary: { readonly cause: unknown } | undefined;
    try {
      expect(await (await fetch('http://127.0.0.1:' + String(server.port))).text()).toBe(
        'full-dev listener',
      );
      const { context, stderr } = createContext(fixture, 0);
      const completion = await main(['dash', 'dev', '--repository', fixture.repository], {
        ...context,
        environment: { ...context.environment, WBS_DEV_PORTS: 'fe-01:' + String(server.port) },
      });
      expect(Buffer.concat(stderr).toString()).toContain(
        'fe-01 cannot start: port ' + String(server.port) + ' is already being served\n',
      );
      expect(completion.status).toBe(1);
      expect(existsSync(fixture.record)).toBe(false);
      expect(existsSync(fixture.launches)).toBe(false);
      expect(await (await fetch('http://127.0.0.1:' + String(server.port))).text()).toBe(
        'full-dev listener',
      );
    } catch (cause: unknown) {
      primary = { cause };
    }
    let cleanup: { readonly cause: unknown } | undefined;
    try {
      await server.stop(true);
    } catch (cause: unknown) {
      cleanup = { cause };
    }
    if (primary !== undefined && cleanup !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup.cause],
        'full dev preflight and listener stop failed',
        { cause: primary.cause },
      );
    if (primary !== undefined) throw primary.cause;
    if (cleanup !== undefined)
      throw new Error('full dev listener stop failed', { cause: cleanup.cause });
  });
}, 20000);
