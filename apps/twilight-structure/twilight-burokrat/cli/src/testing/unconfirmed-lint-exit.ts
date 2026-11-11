import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLaunch } from '@shared/bun-startup';
import { dlopen, ptr, read } from 'bun:ffi';

import { buildLintLauncher } from '../policy/build-lint-launcher';
import { createLintFixture } from './lint-fixtures';

const selectedBun = process.execPath;
function launch(entrypoint: string): readonly string[] {
  return createLaunch(selectedBun, entrypoint);
}

const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');
function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (cause) {
    if (hasCode(cause, 'ESRCH')) return true;
    throw cause;
  }
}
function killOwned(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('invalid owned PID');
  try {
    process.kill(pid, 'SIGKILL');
  } catch (cause) {
    if (!hasCode(cause, 'ESRCH')) throw cause;
  }
}
async function waitOwned<T>(pending: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(label));
    }, milliseconds);
  });
  try {
    return await Promise.race([pending, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
export interface Configuration {
  entrypoint: string;
  candidate: string;
  scratch: string;
  stagePath: string;
  bornPath: string;
  args: readonly string[];
  environment: Readonly<Record<string, string>>;
  input: string;
}
function parentOf(pid: number): number {
  const match = /^PPid:\s+(\d+)$/m.exec(readFileSync('/proc/' + String(pid) + '/status', 'utf8'));
  if (match === null) throw new Error('owned stage PPid absent');
  return Number(match[1]);
}
function readPid(path: string): number {
  const pid = Number(readFileSync(path, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('owned stage PID invalid');
  return pid;
}

/** Runs only in its own process: no global Bun-test subreaper state and no waitpid(-1). */
async function superviseLauncher(configuration: Configuration): Promise<unknown> {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error(
      'native orphan cleanup fixture requires observed Linux x64 ABI; other platforms remain unqualified',
    );
  const libc = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'u64', 'u64', 'u64', 'u64'], returns: 'i32' },
    waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
    __errno_location: { args: [], returns: 'ptr' },
  });
  const readErrno = (): number => {
    const location = libc.symbols.__errno_location();
    if (location === null) throw new Error('native errno location absent');
    return read.i32(location, 0);
  };
  const state = new Int32Array(1),
    status = new Int32Array(1);
  let prior = 0,
    armed = false,
    child: ReturnType<typeof Bun.spawn> | undefined;
  let stagePid: number | undefined;
  const stdout: Uint8Array[] = [],
    stderr: Uint8Array[] = [];
  const streams: Promise<void>[] = [];
  let observation: Record<string, unknown> | undefined;
  let reaped = false,
    alreadyReaped = false,
    gone = false,
    priorRestored = false;
  let failure: { readonly kind: 'absent' } | { readonly kind: 'failed'; readonly cause: unknown } =
    { kind: 'absent' };
  async function drain(stream: ReadableStream<Uint8Array>, target: Uint8Array[]): Promise<void> {
    const reader = stream.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        target.push(chunk.value.slice());
      }
    } finally {
      reader.releaseLock();
    }
  }
  async function reapExact(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 500; attempt++) {
      const waited = libc.symbols.waitpid(pid, ptr(status), 1);
      if (waited === pid) {
        reaped = true;
        return;
      }
      if (waited === -1) {
        const code = readErrno();
        if (code === 4) continue;
        if (code === 10 && isGone(pid)) {
          alreadyReaped = true;
          return;
        }
        throw new Error('exact owned waitpid failed errno ' + String(code));
      }
      await Bun.sleep(10);
    }
    throw new Error('exact owned waitpid did not settle');
  }
  try {
    if (libc.symbols.prctl(37, BigInt(ptr(state)), 0n, 0n, 0n) !== 0)
      throw new Error('read subreaper failed');
    prior = state[0];
    if (libc.symbols.prctl(36, 1n, 0n, 0n, 0n) !== 0) throw new Error('arm subreaper failed');
    armed = true;
    if (libc.symbols.prctl(37, BigInt(ptr(state)), 0n, 0n, 0n) !== 0 || state[0] !== 1)
      throw new Error('subreaper was not armed');
    const owned = Bun.spawn([...launch(configuration.entrypoint), ...configuration.args], {
      cwd: configuration.candidate,
      env: configuration.environment,
      stdin: Buffer.from(configuration.input),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    child = owned;
    streams.push(drain(owned.stdout, stdout), drain(owned.stderr, stderr));
    for (const stream of streams) void stream.catch(() => undefined);
    for (let attempt = 0; !existsSync(configuration.stagePath); attempt++) {
      if (attempt === 1000) throw new Error('owned stage did not become ready');
      if (owned.exitCode !== null || owned.signalCode !== null)
        throw new Error('launcher exited before stage ready');
      await Bun.sleep(10);
    }
    stagePid = readPid(configuration.stagePath);
    if (readPid(configuration.bornPath) !== stagePid || parentOf(stagePid) !== owned.pid)
      throw new Error('stage ownership differs from recorded native spawn');
    await Bun.sleep(50);
    process.kill(owned.pid, 'SIGINT');
    let settledBeforeCleanup = false;
    try {
      await waitOwned(owned.exited, 5000, 'native exit observation deadline');
      settledBeforeCleanup = true;
    } catch (cause) {
      if (!(cause instanceof Error) || cause.message !== 'native exit observation deadline')
        throw cause;
    }
    // Flush stream reads already available, but never kill/reap before the observation is saved.
    if (settledBeforeCleanup)
      await waitOwned(Promise.all(streams), 2000, 'exited launcher streams did not settle');
    const stageAliveBeforeCleanup =
      !isGone(stagePid) &&
      !/^State:\s+Z/m.test(readFileSync('/proc/' + String(stagePid) + '/status', 'utf8'));
    const stageParentBeforeCleanup = isGone(stagePid) ? null : parentOf(stagePid);
    const retained = readdirSync(configuration.scratch);
    observation = {
      settledBeforeCleanup,
      launcherStatus: settledBeforeCleanup ? owned.exitCode : null,
      launcherSignal: owned.signalCode,
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString(),
      retainedScratch: retained.map((name) => join(configuration.scratch, name)),
      stageAliveBeforeCleanup,
      stageParentBeforeCleanup,
      supervisorPid: process.pid,
      launcherPid: owned.pid,
      stagePid,
    };
  } catch (cause) {
    failure = { kind: 'failed', cause };
  }
  const cleanupFailures: unknown[] = [];
  try {
    if (child !== undefined) {
      if (child.exitCode === null && child.signalCode === null) killOwned(child.pid);
      await waitOwned(child.exited, 5000, 'owned launcher cleanup did not settle');
    }
    // Native spawn records the PID synchronously, covering failure before stage script readiness.
    if (stagePid === undefined && existsSync(configuration.bornPath))
      stagePid = readPid(configuration.bornPath);
    if (stagePid !== undefined) {
      if (isGone(stagePid)) {
        alreadyReaped = true;
        gone = true;
      } else {
        if (parentOf(stagePid) !== process.pid)
          throw new Error('owned stage was not adopted; refusing unrelated waitpid');
        killOwned(stagePid);
        await reapExact(stagePid);
        gone = isGone(stagePid);
        if (!gone) throw new Error('owned stage remains after reaping');
      }
    }
    await waitOwned(Promise.all(streams), 2000, 'fixture output cleanup did not settle');
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (armed) {
      if (libc.symbols.prctl(36, BigInt(prior), 0n, 0n, 0n) !== 0)
        throw new Error('restore subreaper failed');
      if (libc.symbols.prctl(37, BigInt(ptr(state)), 0n, 0n, 0n) !== 0 || state[0] !== prior)
        throw new Error('restored subreaper differs');
      priorRestored = true;
    }
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    libc.close();
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  if (failure.kind === 'failed' || cleanupFailures.length > 0)
    throw new AggregateError(
      [...(failure.kind === 'failed' ? [failure.cause] : []), ...cleanupFailures],
      'isolated native-exit fixture failed',
    );
  if (observation === undefined) throw new Error('native-exit observation absent');
  return { ...observation, cleanup: { reaped, alreadyReaped, gone, priorRestored } };
}

/** Test adapter: real bundle, real activation, isolated orphan ownership, original test oracle. */
export async function runUnconfirmedExitFixture(removeNativeExit = false): Promise<unknown> {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('native-exit ownership proof requires Linux x64; no silent portable fallback');
  const fixture = createLintFixture(
    (root) =>
      'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));process.stdout.write("ready");setInterval(()=>undefined,1000);',
  );
  let hasCleaned = false;
  try {
    let bytes = Buffer.from(await buildLintLauncher()).toString();
    const originalHash = hashText(bytes);
    const guard = 'process.exit(await runLintExecutable(process.argv.slice(2)))';
    if (removeNativeExit) {
      if (bytes.split(guard).length !== 2)
        throw new Error('built native-exit mutation target not unique');
      bytes = bytes.replace(guard, 'await runLintExecutable(process.argv.slice(2))');
    }
    const selectedHash = hashText(bytes);
    const stagePath = join(fixture.root, 'stage.pid'),
      bornPath = join(fixture.root, 'stage-born.pid');
    const newline = bytes.indexOf('\n');
    if (newline < 0) throw new Error('built header absent');
    const instrument =
      'const fixtureFs=await import("node:fs");const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(pid<0&&fixtureFs.existsSync(' +
      JSON.stringify(stagePath) +
      ')&&-pid===Number(fixtureFs.readFileSync(' +
      JSON.stringify(stagePath) +
      ',"utf8")))return true;return nativeKill(pid,signal);};const fixtureSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{const owned=fixtureSpawn(argv,options);if(Array.isArray(argv)&&argv.includes("--puni-request-v1"))fixtureFs.writeFileSync(' +
      JSON.stringify(bornPath) +
      ',String(owned.pid));return owned;};\n';
    const entrypoint = join(fixture.root, 'unconfirmed.mjs');
    writeFileSync(entrypoint, bytes.slice(0, newline + 1) + instrument + bytes.slice(newline + 1));
    const configuration = {
      entrypoint,
      candidate: fixture.candidate,
      scratch: fixture.scratch,
      stagePath,
      bornPath,
      args: ['--puni-lint-v1'],
      environment: {
        PATH: '/usr/bin:/bin',
        TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
        TMPDIR: fixture.scratch,
      },
      input: JSON.stringify(fixture.invocation),
    };
    const observed = await runExitSupervisor(configuration, fixture.root);
    hasCleaned = true;
    return {
      observation: observed,
      bundle: {
        originalHash,
        selectedHash,
        instrumentedHash: hashText(readFileSync(entrypoint, 'utf8')),
        removeNativeExit,
      },
    };
  } finally {
    if (hasCleaned) rmSync(fixture.root, { recursive: true, force: true });
  }
}

/** Execute an isolated native ownership probe; fixture cleanup starts after its observation. */
export async function runExitSupervisor(
  configuration: Configuration,
  directory: string,
): Promise<unknown> {
  const configurationPath = join(directory, 'supervisor.json');
  writeFileSync(configurationPath, JSON.stringify(configuration));
  const child = Bun.spawn(
    [...launch(fileURLToPath(import.meta.url)), '--supervise', configurationPath],
    {
      cwd: configuration.candidate,
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const stdout = new Response(child.stdout).text(),
    stderr = new Response(child.stderr).text();
  const status = await child.exited,
    diagnostic = await stderr;
  if (status !== 0)
    throw new Error(
      'isolated supervisor failed; retained fixture ' + directory + ': ' + diagnostic,
    );
  const observed: unknown = JSON.parse(await stdout);
  return observed;
}

if (import.meta.main && process.argv[2] === '--supervise') {
  // This trusted test-owned configuration is produced immediately above, never a public transport.
  const configuration = JSON.parse(readFileSync(process.argv[3], 'utf8')) as Configuration;
  process.stdout.write(JSON.stringify(await superviseLauncher(configuration)));
} else if (import.meta.main) {
  const observed = await runUnconfirmedExitFixture(process.argv[2] === '--remove-native-exit');
  process.stdout.write(JSON.stringify(observed, null, 2) + '\n');
}
