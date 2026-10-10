import { randomUUID } from 'node:crypto';
import { closeSync, constants, mkdtempSync, openSync, rmSync } from 'node:fs';
import {
  type FileHandle,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  compareThreshold,
  decodePerformanceCases,
  decodePerformanceSelectionEnvironment,
  digestPerformanceDeclaration,
} from '@shared/test-evidence';
import { dlopen } from 'bun:ffi';

import { decodePlaywrightReport } from './performance-playwright';
import {
  createPerformanceProcessOwner,
  type PerformanceProcessOwner,
} from './performance-processes';

const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';
const evidencePath = 'tmp/junit/wbs-fe-01.performance.evidence.json';
const toolRoot = resolve(import.meta.dir, '../../..');
const burokratCli = join(toolRoot, 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts');
const playwrightCli = join(toolRoot, 'node_modules/playwright/cli.js');
const expectedBurokratVersion = '0.1.0';
const performanceCurrentPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const performanceBundleRoot = 'tmp/junit/performance';
const lockLibrary =
  process.platform === 'linux'
    ? dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } })
    : undefined;

async function withPerformanceLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await mkdir(join(root, 'tmp/junit'), { recursive: true });
  if (lockLibrary === undefined) throw new Error('Performance invocation lock requires Linux');
  const descriptor = openSync(
    join(root, 'tmp/junit/performance.lock'),
    constants.O_CREAT | constants.O_RDWR,
    0o600,
  );
  // Proof: disabling this flock refusal let the busy-lock production test
  // complete and replace its prior current pointer instead of refusing.
  if (lockLibrary.symbols.flock(descriptor, 2 | 4) !== 0) {
    closeSync(descriptor);
    throw new Error('Performance invocation lock is busy');
  }
  try {
    return await action();
  } finally {
    closeSync(descriptor);
  }
}

interface PerformanceServiceDescriptor {
  command: string;
  cwd: string;
  url: string;
  env: Record<string, string>;
}

/** Decodes the candidate WBS producer output before any command is launched. */
function decodeServiceDescriptors(source: string): PerformanceServiceDescriptor[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    // Proof: rethrowing the malformed candidate producer's SyntaxError made
    // the production runner test fail instead of naming invalid descriptor JSON.
    throw new Error('Performance service descriptor output is invalid JSON', { cause });
  }
  // Proof: disabling this guard made the production transport test fail at the
  // object-output fixture (0 pass/1 fail, 33 assertions).
  if (!Array.isArray(parsed) || parsed.length !== 3)
    throw new Error('Performance service descriptor output must contain three services');
  const entries: unknown[] = parsed;
  return entries.map((entry, index) => {
    // Proof: disabling this guard made the committed [null,null,null] producer
    // fail the transport test (0 pass/1 fail, 40 assertions).
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error(`Performance service descriptor ${String(index)} is malformed`);
    const command: unknown = Reflect.get(entry, 'command');
    const cwd: unknown = Reflect.get(entry, 'cwd');
    const url: unknown = Reflect.get(entry, 'url');
    const environment: unknown = Reflect.get(entry, 'env');
    // Proof: disabling this guard made the numeric-command/missing-fields
    // producer fail the transport test (0 pass/1 fail, 47 assertions).
    if (
      typeof command !== 'string' ||
      typeof cwd !== 'string' ||
      typeof url !== 'string' ||
      typeof environment !== 'object' ||
      environment === null ||
      Array.isArray(environment)
    )
      throw new Error(`Performance service descriptor ${String(index)} is malformed`);
    const environmentEntries: [string, string][] = [];
    for (const [key, value] of Object.entries(environment)) {
      // Proof: the candidate producer's numeric PORT reached this decoder and
      // the transport fault test observed the malformed-environment refusal.
      if (typeof value !== 'string')
        throw new Error(`Performance service descriptor ${String(index)} has invalid environment`);
      environmentEntries.push([key, value]);
    }
    // Proof: a candidate JSON environment with an own __proto__ key previously
    // lost that key during assignment; the production runner accepted it.
    const env: Record<string, string> = Object.fromEntries(environmentEntries);
    return { command, cwd, url, env };
  });
}

function assertCandidateServiceDescriptors(
  descriptors: readonly PerformanceServiceDescriptor[],
  checkoutRoot: string,
  shift: number,
  runDatabase: string,
): void {
  const bePort = String(3100 + shift);
  const gwPort = String(3200 + shift);
  const fePort = String(4200 + shift);
  const beUrl = `http://localhost:${bePort}`;
  const gwUrl = `http://localhost:${gwPort}`;
  const expected: readonly PerformanceServiceDescriptor[] = [
    {
      command: 'bun src/main.ts',
      cwd: join(checkoutRoot, 'apps/wbs/be-01'),
      url: `${beUrl}/health`,
      env: {
        APP_ORIGIN: `http://localhost:${fePort}`,
        PORT: bePort,
        GW_URL: gwUrl,
        DB_PATH: runDatabase,
        HOSTNAME: 'e2e000000000',
        MIGRATE_ON_STARTUP: 'true',
      },
    },
    {
      command: 'bun src/main.ts',
      cwd: join(checkoutRoot, 'apps/wbs/gw-01'),
      url: `${gwUrl}/health`,
      env: { PORT: gwPort, BE_URL: beUrl },
    },
    {
      command: 'bunx vite build --minify=false && bunx vite preview',
      cwd: join(checkoutRoot, 'apps/wbs/fe-01'),
      url: `http://localhost:${fePort}`,
      env: {
        PORT: fePort,
        VITE_BE_URL: beUrl,
        VITE_GW_URL: gwUrl,
        VITE_WS_URL: `ws://localhost:${gwPort}/ws`,
      },
    },
  ];
  const sameEnvironment = (left: Record<string, string>, right: Record<string, string>) =>
    JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
  // Proof: removing this guard let a foreign command reach service launch; the
  // production runner test failed on readiness instead of the approved-stack refusal.
  if (
    descriptors.length !== expected.length ||
    descriptors.some((descriptor, index) => {
      const required = expected.at(index);
      if (required === undefined) return true;
      return (
        descriptor.command !== required.command ||
        descriptor.cwd !== required.cwd ||
        descriptor.url !== required.url ||
        !sameEnvironment(descriptor.env, required.env)
      );
    })
  )
    throw new Error('Performance service descriptors differ from the approved shifted WBS stack');
}

function captureDescriptorStream(
  stream: ReadableStream<Uint8Array>,
  artifact: FileHandle,
  label: 'output' | 'stderr',
): { completion: Promise<void>; cancel: () => Promise<void> } {
  const reader = stream.getReader();
  let released = false;
  const completion = (async () => {
    let capturedBytes = 0;
    let readFailure: unknown;
    let failed = false;
    try {
      for (;;) {
        const reading = await reader.read();
        if (reading.done) break;
        const bytes = reading.value;
        const remaining = 64 * 1024 - capturedBytes;
        // Proof: a candidate producer wrote 65,537 bytes on either stream;
        // the production fault test retained at most 64 KiB and refused launch.
        if (bytes.length > remaining) {
          if (remaining > 0) await artifact.writeFile(bytes.subarray(0, remaining));
          throw new Error('Performance service descriptor ' + label + ' exceeds 64 KiB');
        }
        await artifact.writeFile(bytes);
        capturedBytes += bytes.length;
      }
    } catch (cause) {
      readFailure = cause;
      failed = true;
    }
    const closeFailures: unknown[] = [];
    try {
      reader.releaseLock();
      released = true;
    } catch (cause) {
      closeFailures.push(cause);
    }
    try {
      await artifact.close();
    } catch (cause) {
      closeFailures.push(cause);
    }
    // Proof: injected read and close faults both survive in failure.json.
    if (failed && closeFailures.length > 0)
      throw new AggregateError(
        [readFailure, ...closeFailures],
        'Performance descriptor ' + label + ' capture and close failed',
      );
    if (closeFailures.length > 0)
      throw new AggregateError(closeFailures, 'Performance descriptor ' + label + ' close failed');
    if (failed) throw readFailure;
  })();
  return { completion, cancel: () => (released ? Promise.resolve() : reader.cancel()) };
}

async function closeDescriptorArtifacts(artifacts: readonly FileHandle[]): Promise<void> {
  const settled = await Promise.allSettled(artifacts.map((artifact) => artifact.close()));
  const failures: unknown[] = [];
  for (const entry of settled) if (entry.status === 'rejected') failures.push(entry.reason);
  if (failures.length > 0)
    throw new AggregateError(failures, 'Performance descriptor artifact close failed');
}

async function removeDescriptorStages(paths: readonly string[]): Promise<void> {
  const settled = await Promise.allSettled(paths.map((path) => rm(path, { force: true })));
  const failures: unknown[] = [];
  for (const entry of settled) if (entry.status === 'rejected') failures.push(entry.reason);
  if (failures.length > 0)
    throw new AggregateError(failures, 'Performance descriptor staging cleanup failed');
}

async function awaitDescriptorPhase(
  child: Bun.Subprocess,
  captures: readonly Promise<void>[],
): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Proof: a producer descendant inherited both pipes after direct exit;
    // the production runner rejects at this whole-phase deadline.
    return await Promise.race([
      Promise.all([child.exited, ...captures]).then(([exitCode]) => exitCode),
      new Promise<never>((_accept, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Performance service descriptor producer timed out'));
        }, 10_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function settleDescriptorCaptures(captures: readonly Promise<void>[]): Promise<unknown[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = await Promise.race([
      Promise.allSettled(captures),
      new Promise<never>((_accept, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Performance descriptor capture cleanup timed out'));
        }, 1_000);
      }),
    ]);
    const failures: unknown[] = [];
    for (const entry of settled) if (entry.status === 'rejected') failures.push(entry.reason);
    return failures;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readCandidateServiceDescriptors(
  checkoutRoot: string,
  bundle: string,
  shift: number,
  runDatabase: string,
  owner: PerformanceProcessOwner,
  selectionEnvironment: { CI: '1'; E2E_PORT_SHIFT: string },
): Promise<PerformanceServiceDescriptor[]> {
  const outputPath = join(bundle, 'ordinary-services.json');
  const errorPath = join(bundle, 'ordinary-services.stderr');
  const outputStage = outputPath + '.' + randomUUID() + '.tmp';
  const errorStage = errorPath + '.' + randomUUID() + '.tmp';
  const stages = [outputStage, errorStage];
  let published = false;
  try {
    const stdout = await open(outputStage, 'wx');
    let stderr: FileHandle;
    try {
      stderr = await open(errorStage, 'wx');
    } catch (cause) {
      // Proof: the second-open fault verified the first handle is closed.
      try {
        await stdout.close();
      } catch (closeCause) {
        throw new AggregateError(
          [cause, closeCause],
          'Performance descriptor stderr open and stdout close failed',
          { cause: closeCause },
        );
      }
      throw cause;
    }
    let child: Bun.Subprocess;
    try {
      // Proof: omitting the committed producer yielded a named production
      // runner refusal before any service command could launch.
      child = owner.spawn(
        [
          process.execPath,
          join(checkoutRoot, 'apps/wbs/fe-01/ordinary-servers-cli.ts'),
          checkoutRoot,
          String(shift),
          runDatabase,
        ],
        checkoutRoot,
        executionEnvironment({}, selectionEnvironment),
        { stdout: 'pipe', stderr: 'pipe' },
      );
    } catch (cause) {
      try {
        await closeDescriptorArtifacts([stdout, stderr]);
      } catch (closeCause) {
        throw new AggregateError(
          [cause, closeCause],
          'Performance descriptor spawn and close failed',
          { cause: closeCause },
        );
      }
      throw cause;
    }
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) {
      child.kill('SIGKILL');
      await closeDescriptorArtifacts([stdout, stderr]);
      throw new Error('Performance service descriptor producer lacks piped output');
    }
    const outputCapture = captureDescriptorStream(child.stdout, stdout, 'output');
    const errorCapture = captureDescriptorStream(child.stderr, stderr, 'stderr');
    const captures = [outputCapture.completion, errorCapture.completion];
    let exitCode = 0;
    let phaseFailure: unknown;
    let phaseFailed = false;
    let capturesClosed = true;
    try {
      exitCode = await awaitDescriptorPhase(child, captures);
    } catch (cause) {
      phaseFailed = true;
      capturesClosed = false;
      const cleanupFailures: unknown[] = [];
      // Cancellation releases inherited pipes; the outer process owner reaps descendants.
      // Proof: injected reader.cancel rejection stayed in failure.json after
      // the whole-phase timeout; dropping this aggregation failed its test.
      // Observe cancellation before awaiting capture closure.
      const cancellationTask = settleDescriptorCaptures([
        outputCapture.cancel(),
        errorCapture.cancel(),
      ]).then(
        (failures) => failures,
        (failure: unknown) => [failure],
      );
      try {
        cleanupFailures.push(...(await settleDescriptorCaptures(captures)));
        capturesClosed = true;
      } catch (captureCause) {
        cleanupFailures.push(captureCause);
      }
      cleanupFailures.push(...(await cancellationTask));
      phaseFailure =
        cleanupFailures.length > 0
          ? new AggregateError(
              [cause, ...cleanupFailures],
              'Performance descriptor producer failed with cleanup errors: ' + String(cause),
            )
          : cause;
    }
    // Publish complete, bounded diagnostics even for a failed producer.
    if (!capturesClosed) throw phaseFailure;
    try {
      await rename(outputStage, outputPath);
      await rename(errorStage, errorPath);
    } catch (renameCause) {
      // Proof: combined overflow, close and second-rename faults retain all
      // three causes in failure.json and leave no final or staged stream.
      if (phaseFailed)
        throw new AggregateError(
          [phaseFailure, renameCause],
          'Performance descriptor producer and diagnostic publication failed',
          { cause: renameCause },
        );
      throw renameCause;
    }
    published = true;
    if (phaseFailed) throw phaseFailure;
    // Proof: disabling this guard made the exit-23 producer fail the transport
    // test (0 pass/1 fail, 68 assertions) instead of its named refusal.
    if (exitCode !== 0)
      throw new Error(
        'Performance service descriptor producer failed: ' +
          String(exitCode) +
          ': ' +
          (await readFile(errorPath, 'utf8')).trim(),
      );
    const bytes = await readFile(outputPath);
    let source: string;
    try {
      // Proof: candidate stdout containing 0xff made the transport fault test
      // observe this fatal UTF-8 refusal before the JSON decoder.
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new Error('Performance service descriptor output is invalid UTF-8', { cause });
    }
    const descriptors = decodeServiceDescriptors(source);
    assertCandidateServiceDescriptors(descriptors, checkoutRoot, shift, runDatabase);
    return descriptors;
  } catch (cause) {
    const cleanupFailures: unknown[] = [];
    try {
      await removeDescriptorStages(published ? stages : [...stages, outputPath, errorPath]);
    } catch (cleanupCause) {
      cleanupFailures.push(cleanupCause);
    }
    if (cleanupFailures.length > 0)
      throw new AggregateError(
        [cause, ...cleanupFailures],
        'Performance descriptor staging failed with cleanup errors',
        { cause },
      );
    throw cause;
  }
}

function executionEnvironment(
  extra: Record<string, string>,
  selectionEnvironment: { CI: '1'; E2E_PORT_SHIFT: string },
): Record<string, string> {
  return {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? tmpdir(),
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    ...extra,
    // Proof: moving descriptor extras after this exact pair made the child-observed
    // service phase receive CI=0 and shift=9999; the six-phase integration test failed.
    CI: selectionEnvironment.CI,
    E2E_PORT_SHIFT: selectionEnvironment.E2E_PORT_SHIFT,
  };
}

/** Renders every modeled nested failure within one bounded diagnostic field. */
function renderFailureChain(failure: unknown): string {
  const lines: string[] = [];
  const ancestors = new Set<object>();
  let bytes = 0;
  const appendFailure = (cause: unknown, depth: number): void => {
    // Proof: injected 17-level close cause failed artifact writing; removing
    // this depth check made its production negative accept the chain.
    if (depth > 16) throw new Error('Performance failure chain exceeds 16 levels');
    if (typeof cause === 'object' && cause !== null) {
      // Proof: injected self-cause failed artifact writing; removing this cycle
      // check made its production negative accept the chain.
      if (ancestors.has(cause)) throw new Error('Performance failure chain has a cycle');
      ancestors.add(cause);
    }
    try {
      const line =
        '  '.repeat(depth) +
        (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
      bytes += Buffer.byteLength(line, 'utf8') + (lines.length > 0 ? 1 : 0);
      // Proof: injected 65-entry and 300 KiB UTF-8 close causes failed artifact
      // writing; removing either corresponding guard failed its negative.
      if (lines.length >= 64 || bytes > 256 * 1024)
        throw new Error('Performance failure chain exceeds diagnostic bound');
      lines.push(line);
      if (cause instanceof AggregateError) {
        const errors: readonly unknown[] = cause.errors;
        for (const nested of errors) appendFailure(nested, depth + 1);
      }
      if (cause instanceof Error && Object.hasOwn(cause, 'cause'))
        appendFailure(cause.cause, depth + 1);
    } finally {
      if (typeof cause === 'object' && cause !== null) ancestors.delete(cause);
    }
  };
  appendFailure(failure, 0);
  return lines.join('\n');
}

function requirePerformanceSuccess(
  executionFailure: unknown,
  hasExecutionFailure: boolean,
  cleanupFailures: unknown[],
): void {
  // Proof: the post-run /proc ambiguity preload produced cleanupFailures and
  // the named runner test observed failure.json with no current pointer.
  if (cleanupFailures.length > 0)
    throw new AggregateError(
      hasExecutionFailure ? [executionFailure, ...cleanupFailures] : cleanupFailures,
      `Performance cleanup failed: ${cleanupFailures.map((failure) => String(failure)).join('; ')}${hasExecutionFailure ? `; execution failed: ${String(executionFailure)}` : ''}`,
    );
  // Proof: the 1500-cell full-mount Nx fault and scratch threshold negative
  // both emitted failing JUnit and exited nonzero without a success pointer.
  if (hasExecutionFailure) throw executionFailure;
}

/** Publishes one immutable invocation artifact only after its complete bytes are written. */
async function writeBundleArtifact(bundle: string, name: string, source: string): Promise<void> {
  const temporary = join(bundle, `.${name}.${randomUUID()}.tmp`);
  try {
    // Proof: an injected write failure left a truncated final evidence.json;
    // the watched production runner test now sees only a removed temp file.
    await writeFile(temporary, source, { flag: 'wx' });
    await rename(temporary, join(bundle, name));
  } catch (cause) {
    try {
      await rm(temporary, { force: true });
    } catch (cleanupCause) {
      throw new AggregateError(
        [cause, cleanupCause],
        `Performance bundle ${name} staging cleanup failed`,
        { cause: cleanupCause },
      );
    }
    throw cause;
  }
}

async function awaitChildWithin(
  child: Bun.Subprocess,
  deadlineMs: number,
  phase: string,
): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_accept, reject) => {
        // Proof: the hung-Playwright production-path negative reached its
        // 120-second execution deadline and retained failure diagnostics.
        timeout = setTimeout(() => {
          reject(new Error(`Performance ${phase} timed out`));
        }, deadlineMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function awaitServiceReadiness(
  descriptors: readonly PerformanceServiceDescriptor[],
  children: readonly Bun.Subprocess[],
  deadlineMs: number,
): Promise<void> {
  const pending = new Set(descriptors.map((descriptor) => descriptor.url));
  const failures = new Map<string, string>();
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    for (const [index, descriptor] of descriptors.entries()) {
      if (!pending.has(descriptor.url)) continue;
      const child = children.at(index);
      if (child === undefined) throw new Error('Performance readiness lacks a service child');
      if (child.exitCode !== null) {
        // Proof: the production GW readiness negative exited 23; without this
        // branch the unready service waited for startup deadline instead of refusing.
        throw new Error(
          `Performance readiness failed: ${descriptor.url} exited ${String(child.exitCode)}`,
        );
      }
      try {
        const response = await fetch(descriptor.url, {
          signal: AbortSignal.timeout(750),
          redirect: 'manual',
        });
        if (response.status >= 200 && response.status < 400) pending.delete(descriptor.url);
      } catch (cause) {
        // A refused connection during startup is retryable; the last cause is retained.
        failures.set(descriptor.url, String(cause));
      }
    }
    if (pending.size === 0) return;
    await Bun.sleep(100);
  }
  throw new Error(
    `Performance readiness timed out: ${[...pending].map((url) => `${url} (${failures.get(url) ?? 'non-2xx/3xx response'})`).join(', ')}`,
  );
}

async function assertShiftedPortsFree(shift: number): Promise<void> {
  for (const port of [3100 + shift, 3200 + shift, 4200 + shift]) {
    const listener = createServer();
    try {
      await new Promise<void>((accept, reject) => {
        listener.once('error', reject);
        listener.listen(port, '::', accept);
      });
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        Reflect.get(cause, 'code') === 'EADDRINUSE'
      ) {
        // Proof: the production scratch target bound shifted FE port 10200; disabling
        // this refusal let the invocation unexpectedly succeed while foreign owned it.
        throw new Error(`Performance shifted port ${String(port)} is occupied`, { cause });
      }
      throw new Error(`Performance shifted port ${String(port)} preflight failed`, { cause });
    } finally {
      if (listener.listening)
        await new Promise<void>((accept, reject) =>
          listener.close((error) => {
            if (error) reject(error);
            else accept();
          }),
        );
    }
  }
}

interface Invocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function tracePerformance(stage: string): void {
  if (process.env['PUNI_PERFORMANCE_DEBUG'] === '1') {
    process.stderr.write(`[performance] ${stage}\n`);
  }
}

function invoke(argv: string[], cwd: string): Invocation {
  tracePerformance(
    `start ${argv[0]} ${argv.includes('--list') ? 'list' : argv.includes('--reporter=json') ? 'run' : ''}`,
  );
  const call = Bun.spawnSync(argv, { cwd, stdout: 'pipe', stderr: 'pipe', env: process.env });
  tracePerformance(
    `end ${argv[0]} exit=${String(call.exitCode)} stdout=${String(call.stdout.length)} stderr=${String(call.stderr.length)}`,
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

function invokeBurokrat(argv: string[]): Invocation {
  const trustedCwd = mkdtempSync(join(tmpdir(), 'puni-burokrat-cwd-'));
  try {
    const call = Bun.spawnSync(argv, {
      // Proof: replacing this empty external directory with the candidate directory
      // made the scratch bunfig preload create its forbidden sentinel during Burokrat.
      cwd: trustedCwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        HOME: trustedCwd,
        TMPDIR: tmpdir(),
        LANG: 'C.UTF-8',
      },
    });
    return {
      exitCode: call.exitCode,
      stdout: call.stdout.toString(),
      stderr: call.stderr.toString(),
    };
  } finally {
    rmSync(trustedCwd, { recursive: true, force: true });
  }
}

async function invokePlaywright(
  argv: string[],
  cwd: string,
  reportFile: string,
  owner: PerformanceProcessOwner,
  deadlineMs: number,
  selectionEnvironment: { CI: '1'; E2E_PORT_SHIFT: string },
): Promise<Invocation> {
  // Proof: inheriting process.env made the scratch config consume injected PLAYWRIGHT_GREP;
  // the production fixture test then failed exact collection instead of measuring its case.
  const runtimeEnvironment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? cwd,
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
    CI: selectionEnvironment.CI,
    E2E_PORT_SHIFT: selectionEnvironment.E2E_PORT_SHIFT,
  };
  tracePerformance(`start playwright ${argv.includes('--list') ? 'list' : 'run'}`);
  const stdoutFile = await open(`${reportFile}.stdout`, 'w');
  const stderrFile = await open(`${reportFile}.stderr`, 'w');
  const child = owner.spawn(argv, cwd, runtimeEnvironment, {
    stdout: stdoutFile.fd,
    stderr: stderrFile.fd,
  });
  try {
    const exitCode = await awaitChildWithin(
      child,
      deadlineMs,
      `Playwright Performance ${argv.includes('--list') ? 'discovery' : 'execution'}`,
    );
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
    const [stdout, stderr] = await Promise.all([
      readFile(`${reportFile}.stdout`, 'utf8'),
      readFile(`${reportFile}.stderr`, 'utf8'),
    ]);
    const reportBytes = await readFile(reportFile).catch((cause: unknown) => {
      throw new Error(
        `Playwright Performance JSON reporter output is unavailable: ${stderr.trim()}`,
        { cause },
      );
    });
    let report: string;
    try {
      // Proof: disabling fatal decoding made the actual malformed-byte reporter test
      // receive a later JSON parse error instead of the named UTF-8 refusal.
      report = new TextDecoder('utf-8', { fatal: true }).decode(reportBytes);
    } catch (cause) {
      throw new Error('Playwright Performance JSON reporter output is not valid UTF-8', { cause });
    }
    tracePerformance(
      `end playwright exit=${String(exitCode)} json=${String(report.length)} stdout=${String(stdout.length)} stderr=${String(stderr.length)}`,
    );
    return { exitCode, stdout: report, stderr };
  } finally {
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }
}

function git(root: string, args: string[]): Invocation {
  return invoke(['git', '-C', root, ...args], root);
}

function requireGit(root: string, args: string[], purpose: string): string {
  const invocation = git(root, args);
  if (invocation.exitCode !== 0) {
    throw new Error(
      `Performance ${purpose} requires a committed Git candidate: ${invocation.stderr.trim()}`,
    );
  }
  return invocation.stdout.trim();
}

function assertUnflaggedIndex(root: string, phase: string): void {
  const entries = requireGit(root, ['ls-files', '-v', '-z'], `${phase} index`).split('\0');
  // Proof: with this guard removed, the assume-unchanged fixture scratch target
  // missed its named index-flags refusal and reached a later runner-exit refusal;
  // the skip-worktree fixture also reaches this production refusal.
  if (entries.some((entry) => entry !== '' && !entry.startsWith('H '))) {
    throw new Error(`Performance tracked input index flags changed ${phase}`);
  }
}

function assertCleanCandidate(root: string): string {
  const repository = requireGit(root, ['rev-parse', '--show-toplevel'], 'repository');
  // Proof: disabling root equality made the nested-candidate test reach the later
  // dirty-status refusal instead of rejecting the repository root mismatch.
  if (resolve(repository) !== resolve(root)) {
    throw new Error('Performance candidate root differs from its Git repository root');
  }
  const revision = requireGit(root, ['rev-parse', '--verify', 'HEAD^{commit}'], 'revision');
  const status = requireGit(
    root,
    ['status', '--porcelain', '--untracked-files=all'],
    'clean snapshot',
  );
  // Proof: disabling clean-candidate status made the dirty-root scratch target
  // unexpectedly succeed and emit a passing JUnit report.
  if (status !== '') throw new Error('Performance committed Git candidate is dirty');
  assertUnflaggedIndex(root, 'candidate snapshot');
  return revision;
}

async function assertPinnedCheckout(
  checkoutRoot: string,
  revision: string,
  declarationBytes: Buffer,
  configBytes: Buffer,
  phase: string,
): Promise<void> {
  // Proof: disabling pinned HEAD made the committed-checkout scratch test miss its
  // named revision refusal and reach a later Burokrat runner-exit refusal.
  if (requireGit(checkoutRoot, ['rev-parse', 'HEAD'], phase) !== revision) {
    throw new Error(`Performance checkout HEAD changed ${phase}`);
  }
  const status = requireGit(
    checkoutRoot,
    ['status', '--porcelain', '--untracked-files=all'],
    phase,
  );
  // Proof: disabling the status check made the dirty-run scratch target succeed and
  // emit a passing report despite an untracked file written during execution.
  if (status !== '') throw new Error(`Performance checkout changed ${phase}: ${status}`);
  const checkoutDeclaration = await readFile(join(checkoutRoot, declarationPath));
  const checkoutConfig = await readFile(join(checkoutRoot, configPath));
  // Proof: disabling byte equality made the content-masked config scratch test miss
  // its named input refusal and reach a later runner-exit refusal.
  if (!checkoutDeclaration.equals(declarationBytes) || !checkoutConfig.equals(configBytes)) {
    throw new Error(`Performance checkout inputs differ ${phase}`);
  }
  assertUnflaggedIndex(checkoutRoot, phase);
}

function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`malformed ${label} JSON`, { cause });
  }
}

function hashBytes(bytes: Uint8Array | string): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

export function readIdentity(root: string, revision: string): string {
  const invocation = invokeBurokrat([
    process.execPath,
    'run',
    burokratCli,
    'candidate-identity',
    'committed',
    root,
    revision,
  ]);
  return decodeCandidateIdentity(invocation, revision);
}

/** Strict non-certifying Burokrat identity transport used before runner execution. */
export function decodeCandidateIdentity(invocation: Invocation, revision: string): string {
  // Proof: disabling the identity process-status check made the decoder accept an
  // exit-1 Burokrat identity body in the named unbound-identity test.
  if (invocation.exitCode !== 0)
    throw new Error(`Burokrat candidate identity unavailable: ${invocation.stderr.trim()}`);
  const record = parseJson(invocation.stdout, 'Burokrat candidate identity');
  if (
    typeof record !== 'object' ||
    record === null ||
    !('candidate' in record) ||
    !('certifies' in record) ||
    !('selection' in record)
  ) {
    throw new Error('Burokrat candidate identity is malformed');
  }
  const candidate = Reflect.get(record, 'candidate');
  const selection = Reflect.get(record, 'selection');
  // Proof: changing Burokrat's response version to 0.0.0 made the scratch production target
  // refuse before Playwright with this named tool-identity error.
  if (
    Reflect.get(record, 'tool') !== 'twilight-burokrat' ||
    Reflect.get(record, 'toolVersion') !== expectedBurokratVersion ||
    Reflect.get(record, 'schemaVersion') !== 1
  ) {
    throw new Error('Burokrat candidate identity tool version mismatch');
  }
  if (
    typeof candidate !== 'string' ||
    !/^[0-9a-f]{64}$/.test(candidate) ||
    Reflect.get(record, 'certifies') !== false ||
    typeof selection !== 'object' ||
    selection === null ||
    Reflect.get(selection, 'kind') !== 'committed' ||
    // Proof: disabling revision equality made the candidate-identity decoder accept
    // a different committed SHA in its named unbound-selection test.
    Reflect.get(selection, 'revision') !== revision
  ) {
    throw new Error('Burokrat candidate identity selection mismatch');
  }
  return candidate;
}

interface PerformanceFinding {
  ruleId: 'PERF-THRESHOLD';
  path: string;
  message: string;
  effect: 'debt' | 'refusal';
}

interface PerformanceVerdict {
  candidate: string;
  findings: PerformanceFinding[];
  unevaluated: { ruleId: 'PERF-THRESHOLD'; reason: string }[];
  allowed: boolean;
}

/** Requires the selected candidate and exactly one missing-run PERF obligation. */
export function assertPreflight(verdict: PerformanceVerdict, candidate: string): void {
  // Proof: disabling candidate equality made the selected-preflight test accept an
  // otherwise valid PERF obligation for a different candidate SHA.
  // Proof: disabling the missing-run reason made the preflight test accept a
  // different PERF refusal as authorization to start Playwright.
  if (
    verdict.candidate !== candidate ||
    verdict.findings.length !== 0 ||
    verdict.unevaluated.length !== 1 ||
    !verdict.unevaluated[0].reason.includes('run evidence is not supplied')
  ) {
    throw new Error(
      'Burokrat Performance preflight did not select the expected candidate and rule',
    );
  }
}

/** Strict transport boundary for the one selected Burokrat Performance rule. */
export function readVerdict(
  invocation: Invocation,
  phase: 'preflight' | 'run',
): PerformanceVerdict {
  // Proof: disabling this empty-output guard made the decoder return a generic JSON
  // parse refusal instead of the named unavailable Burokrat preflight result.
  if (invocation.stdout.trim() === '')
    throw new Error(`Burokrat Performance ${phase} unavailable: ${invocation.stderr.trim()}`);
  const verdict = parseJson(invocation.stdout, `Burokrat Performance ${phase}`);
  // Proof: disabling the record-shape guard made the empty-object decoder negative
  // fail at the later selected-rule shape check instead of its named malformed refusal.
  if (
    typeof verdict !== 'object' ||
    verdict === null ||
    !('candidate' in verdict) ||
    !('findings' in verdict) ||
    !('unevaluated' in verdict) ||
    !('allowed' in verdict) ||
    !('certifies' in verdict) ||
    !('ruleIds' in verdict) ||
    !('policy' in verdict) ||
    !('schemaVersion' in verdict)
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict is malformed`);
  }
  const candidate = Reflect.get(verdict, 'candidate');
  const findings = Reflect.get(verdict, 'findings');
  const unevaluated = Reflect.get(verdict, 'unevaluated');
  const allowed = Reflect.get(verdict, 'allowed');
  const certifies = Reflect.get(verdict, 'certifies');
  const ruleIds = Reflect.get(verdict, 'ruleIds');
  if (
    typeof candidate !== 'string' ||
    !/^[0-9a-f]{64}$/.test(candidate) ||
    !Array.isArray(findings) ||
    !Array.isArray(unevaluated) ||
    typeof allowed !== 'boolean' ||
    certifies !== false ||
    // Proof: disabling schema-version equality made the malformed-verdict decoder test
    // accept schemaVersion 2 as a selected Performance verdict.
    verdict.schemaVersion !== 1 ||
    typeof verdict.policy !== 'string' ||
    verdict.policy === '' ||
    !Array.isArray(ruleIds) ||
    ruleIds.length !== 1 ||
    // Proof: disabling selected-rule identity made the malformed-verdict test accept
    // a MOD-INDEX result as the Performance verdict.
    ruleIds[0] !== 'PERF-THRESHOLD'
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict shape is malformed`);
  }
  const selectedFindings: PerformanceFinding[] = findings.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Burokrat Performance ${phase} finding is malformed`);
    }
    const ruleId: unknown = Reflect.get(entry, 'ruleId');
    const path: unknown = Reflect.get(entry, 'path');
    const message: unknown = Reflect.get(entry, 'message');
    const effect: unknown = Reflect.get(entry, 'effect');
    // Proof: disabling finding shape/identity made the foreign MOD-INDEX finding
    // reach only a later exit-consistency refusal in the malformed-verdict test.
    if (
      ruleId !== 'PERF-THRESHOLD' ||
      typeof path !== 'string' ||
      path === '' ||
      typeof message !== 'string' ||
      message === '' ||
      (effect !== 'debt' && effect !== 'refusal')
    ) {
      throw new Error(`Burokrat Performance ${phase} finding is malformed`);
    }
    return { ruleId, path, message, effect };
  });
  const selectedUnevaluated: PerformanceVerdict['unevaluated'] = unevaluated.map(
    (entry: unknown) => {
      // Proof: disabling unevaluated-rule identity made a MOD-INDEX record reach only
      // the later exit-consistency refusal in the malformed-verdict test.
      const reason: unknown =
        typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'reason') : undefined;
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry) ||
        Reflect.get(entry, 'ruleId') !== 'PERF-THRESHOLD' ||
        typeof reason !== 'string' ||
        reason === ''
      ) {
        throw new Error(`Burokrat Performance ${phase} unevaluated rule is malformed`);
      }
      return { ruleId: 'PERF-THRESHOLD', reason };
    },
  );
  const expectedAllowed =
    selectedUnevaluated.length === 0 &&
    !selectedFindings.some((finding) => finding.effect === 'refusal');
  // Proof: disabling allowed/exit coherence made the malformed-verdict test accept
  // allowed:false with no refusal or unevaluated rule and process exit 0.
  if (
    allowed !== expectedAllowed ||
    (invocation.exitCode === 0) !== allowed ||
    (invocation.exitCode !== 0 && invocation.exitCode !== 1)
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict and exit status disagree`);
  }
  return { candidate, findings: selectedFindings, unevaluated: selectedUnevaluated, allowed };
}

function checkPerformance(
  root: string,
  revision: string,
  policyPath: string,
  evidence?: string,
): Invocation {
  return invokeBurokrat([
    process.execPath,
    'run',
    burokratCli,
    'check',
    'committed',
    root,
    revision,
    policyPath,
    '--rule',
    'PERF-THRESHOLD',
    ...(evidence === undefined ? [] : ['--performance-evidence', evidence]),
  ]);
}

/** Exact case-level reconciliation between measured failures and Burokrat findings. */
export function assertPerformanceFindings(
  findings: readonly PerformanceFinding[],
  expectedFindings: readonly { path: string; message: string }[],
): void {
  const unmatched = [...expectedFindings];
  for (const finding of findings) {
    const position = unmatched.findIndex(
      (expected) => finding.path === expected.path && finding.message === expected.message,
    );
    // Proof: the old membership-only check accepted returned [A,A] for expected [A,B];
    // the two-case finding test failed until this one-to-one consumption was added.
    if (position < 0) {
      throw new Error('Burokrat Performance findings differ from measured failures');
    }
    unmatched.splice(position, 1);
  }
  // Proof: disabling this remaining-set check made the missing-finding decoder
  // negative accept a measured threshold failure with no Burokrat finding.
  if (unmatched.length !== 0) {
    throw new Error('Burokrat Performance findings differ from measured failures');
  }
}

export function xmlText(value: string): string {
  for (const character of value) {
    // String iteration yields one nonempty Unicode scalar or one lone surrogate.
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined)
      throw new Error('Performance JUnit identity contains an empty character');
    // Proof: disabling the XML 1.0 character guard made the measured bad-title target
    // unexpectedly succeed and emit a report containing U+0001.
    if (
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    ) {
      throw new Error('Performance JUnit identity contains an XML-forbidden character');
    }
  }
  return (
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
      // Proof: removing tab entity encoding made the measured whitespace-title XML
      // parser return a space instead of the title's tab; the round-trip test failed.
      .replaceAll('\t', '&#9;')
      .replaceAll('\n', '&#10;')
      .replaceAll('\r', '&#13;')
  );
}

/** Clears stale outputs and executes only the reviewed, committed Performance selection. */
async function runLockedPerformanceLevel(
  candidateRoot: string,
  rulePolicyPath?: string,
  injectedDescriptors?: readonly PerformanceServiceDescriptor[],
): Promise<void> {
  const report = join(candidateRoot, reportPath);
  const binding = join(candidateRoot, bindingPath);
  await mkdir(join(candidateRoot, 'tmp/junit'), { recursive: true });
  // Proof: omitting this removal left the stale passing XML readable after no-cases refusal.
  await rm(report, { force: true });
  // Proof: omitting this removal left stale passing provenance readable after no-cases refusal.
  await rm(binding, { force: true });
  await rm(join(candidateRoot, evidencePath), { force: true });

  const declarationBytes = await readFile(join(candidateRoot, declarationPath));
  let source: string;
  try {
    // Proof: turning off fatal decoding made the invalid-byte production test receive a JSON
    // error containing U+FFFD instead of the named UTF-8 refusal.
    source = new TextDecoder('utf-8', { fatal: true }).decode(declarationBytes);
  } catch (error) {
    throw new Error('Performance declaration is not valid UTF-8', { cause: error });
  }
  const declaration = decodePerformanceCases(parseJson(source, 'Performance declaration'));
  // Proof: disabling this match made the changed-config production test fail with a later error.
  if (declaration.config !== configPath) {
    throw new Error(`Performance config identity mismatch: ${declaration.config}`);
  }
  const configBytes = await readFile(join(candidateRoot, configPath));
  // Proof: disabling this match made the changed-project production test fail with a later error.
  if (declaration.project !== 'chromium') {
    throw new Error(`Performance project identity mismatch: ${declaration.project}`);
  }
  // Proof: replacing this predicate with false made the empty-selection test miss no-cases.
  if (declaration.cases.length === 0) {
    throw new Error('no-cases: no performance fixtures declare thresholds');
  }

  const selectionEnvironment = decodePerformanceSelectionEnvironment({
    CI: '1',
    E2E_PORT_SHIFT: process.env['E2E_PORT_SHIFT'],
  });
  const shift = Number(selectionEnvironment.E2E_PORT_SHIFT);
  await assertShiftedPortsFree(shift);
  const invocationId = randomUUID();
  const bundleRelative = `${performanceBundleRoot}/${invocationId}`;
  const bundle = join(candidateRoot, bundleRelative);
  const evidenceFile = join(bundle, 'evidence.json');
  // Proof: removing this admitted-run invalidation made the threshold-breach
  // production test read a stale current-success pointer instead of ENOENT.
  await rm(join(candidateRoot, performanceCurrentPath), { force: true });
  await mkdir(join(candidateRoot, performanceBundleRoot), { recursive: true });
  await mkdir(bundle, { recursive: false });

  const revision = assertCleanCandidate(candidateRoot);
  const selectedPolicyPath = rulePolicyPath ?? process.env['PUNI_PERFORMANCE_RULE_POLICY'];
  // Proof: disabling external-policy selection made the absent-policy scratch test
  // receive a generic resolve(undefined) TypeError instead of the named refusal.
  if (selectedPolicyPath === undefined || selectedPolicyPath === '') {
    throw new Error('Performance needs externally selected PUNI_PERFORMANCE_RULE_POLICY');
  }
  const policyPath = resolve(selectedPolicyPath);
  const policyBytes = await readFile(policyPath);
  const policyDigest = hashBytes(policyBytes);
  const candidate = readIdentity(candidateRoot, revision);
  const preflight = checkPerformance(candidateRoot, revision, policyPath);
  const preflightVerdict = readVerdict(preflight, 'preflight');
  assertPreflight(preflightVerdict, candidate);

  const archiveParent = await mkdtemp(join(tmpdir(), 'puni-performance-'));
  const checkoutRoot = join(archiveParent, 'candidate');
  let checkoutAdded = false;
  let owner: PerformanceProcessOwner | undefined;
  let publish = false;
  let hasExecutionFailure = false;
  let executionFailure: unknown;
  try {
    requireGit(
      candidateRoot,
      ['worktree', 'add', '--detach', checkoutRoot, revision],
      'immutable checkout',
    );
    checkoutAdded = true;
    await symlink(join(toolRoot, 'node_modules'), join(checkoutRoot, 'node_modules'), 'dir');
    owner = createPerformanceProcessOwner();
    const activeOwner = owner;
    const setup = activeOwner.spawn(
      [process.execPath, 'run', 'tools/dev/setup.ts'],
      checkoutRoot,
      executionEnvironment({}, selectionEnvironment),
    );
    const setupExit = await awaitChildWithin(setup, 30_000, 'development setup');
    if (setupExit !== 0)
      throw new Error(`Performance development setup failed: ${String(setupExit)}`);
    // Proof: the disposable full-mount production Nx target reached BE readiness
    // but BE exited 1 because its per-invocation SQLite path had no tmp parent.
    await mkdir(join(checkoutRoot, 'tmp'), { recursive: true });
    const runDatabase = join(checkoutRoot, 'tmp', `e2e-performance-${randomUUID()}.db`);
    const descriptors =
      injectedDescriptors ??
      (await readCandidateServiceDescriptors(
        checkoutRoot,
        bundle,
        shift,
        runDatabase,
        activeOwner,
        selectionEnvironment,
      ));
    const expectedUrls = [
      `http://localhost:${String(3100 + shift)}/health`,
      `http://localhost:${String(3200 + shift)}/health`,
      `http://localhost:${String(4200 + shift)}`,
    ];
    if (
      descriptors.length !== 3 ||
      descriptors.some((descriptor, index) => descriptor.url !== expectedUrls[index])
    )
      throw new Error('Performance service descriptors must name the three shifted ordinary URLs');
    const normalizedDescriptors = descriptors.map((descriptor, index) => {
      const cwd = resolve(checkoutRoot, descriptor.cwd);
      if (
        !cwd.startsWith(`${checkoutRoot}/`) ||
        descriptor.command.trim() === '' ||
        descriptor.env['PORT'] !== String([3100, 3200, 4200][index] + shift)
      )
        throw new Error('Performance service descriptor leaves the checked-out shifted stack');
      return { ...descriptor, cwd };
    });
    const serviceChildren = normalizedDescriptors.map((descriptor) =>
      activeOwner.spawn(
        ['sh', '-c', descriptor.command],
        descriptor.cwd,
        executionEnvironment(descriptor.env, selectionEnvironment),
      ),
    );
    await awaitServiceReadiness(normalizedDescriptors, serviceChildren, 120_000);
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'before discovery',
    );
    const listArguments = [
      'test',
      '--config',
      declaration.config,
      '--project',
      declaration.project,
      '--list',
      '--reporter=json',
    ];
    const runArguments = [
      'test',
      '--config',
      declaration.config,
      '--project',
      declaration.project,
      '--reporter=json',
    ];
    const listedInvocation = await invokePlaywright(
      ['node', playwrightCli, ...listArguments],
      checkoutRoot,
      join(archiveParent, 'list.json'),
      activeOwner,
      20_000,
      selectionEnvironment,
    );
    await writeBundleArtifact(bundle, 'discovery.json', listedInvocation.stdout);
    // Proof: disabling this exit-status guard made the nonzero-discovery scratch target
    // continue into execution and miss its named discovery-failed refusal.
    if (listedInvocation.exitCode !== 0)
      throw new Error(`Playwright Performance discovery failed: ${listedInvocation.stderr.trim()}`);
    // Proof: disabling this empty-output guard made the zero-byte-reporter scratch
    // target fail at JSON parsing instead of its named no-JSON refusal.
    if (listedInvocation.stdout.trim() === '') {
      throw new Error(
        `Playwright Performance discovery emitted no JSON: ${listedInvocation.stderr.trim()}`,
      );
    }
    const listed = decodePlaywrightReport(
      parseJson(listedInvocation.stdout, 'Playwright discovery'),
      checkoutRoot,
      declaration,
      'list',
      0,
    );
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'after discovery',
    );
    // Proof: disabling this revision check made the discovery-commit scratch target
    // miss its named after-discovery candidate revision refusal.
    if (requireGit(candidateRoot, ['rev-parse', 'HEAD'], 'after discovery') !== revision) {
      throw new Error('Performance candidate revision changed after discovery');
    }
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'before execution',
    );
    const runInvocation = await invokePlaywright(
      ['node', playwrightCli, ...runArguments],
      checkoutRoot,
      join(archiveParent, 'run.json'),
      activeOwner,
      120_000,
      selectionEnvironment,
    );
    await writeBundleArtifact(bundle, 'run.json', runInvocation.stdout);
    const executed = decodePlaywrightReport(
      parseJson(runInvocation.stdout, 'Playwright execution'),
      checkoutRoot,
      declaration,
      'run',
      runInvocation.exitCode,
    );
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'after execution',
    );
    // Proof: disabling this comparison made a run-version mutation produce a passing
    // target even though discovery used a different runner version.
    if (
      executed.version !== listed.version ||
      JSON.stringify(
        executed.cases.map((entry) => [entry.caseId, entry.fixture, entry.titlePath]),
      ) !==
        JSON.stringify(listed.cases.map((entry) => [entry.caseId, entry.fixture, entry.titlePath]))
    ) {
      throw new Error('Playwright discovery and execution selection changed');
    }
    // Proof: disabling the post-run candidate revision check made the committed-source
    // scratch test reach a later runner-exit refusal instead of its named revision error.
    if (requireGit(candidateRoot, ['rev-parse', 'HEAD'], 'post-run revision') !== revision) {
      throw new Error('Performance candidate revision changed during Playwright execution');
    }
    const evidence = {
      schemaVersion: 1,
      candidate,
      policyDigest,
      declarationDigest: digestPerformanceDeclaration(declaration),
      selection: {
        declarationPath,
        config: declaration.config,
        project: declaration.project,
        configDigest: hashBytes(configBytes),
        runnerVersion: listed.version,
        listArguments,
        runArguments,
        selectionEnvironment,
      },
      run: executed.execution,
    };
    const evidenceSource = `${JSON.stringify(evidence)}\n`;
    await writeBundleArtifact(bundle, 'evidence.json', evidenceSource);
    const checked = checkPerformance(candidateRoot, revision, policyPath, evidenceFile);
    const verdict = readVerdict(checked, 'run');
    // readVerdict already enforces the only permitted exit statuses and their
    // coherence with allowed/refusal, so the selected identity is checked here.
    // Proof: disabling candidate equality made the scratch altered-verdict target
    // unexpectedly succeed for a foreign candidate SHA.
    // Proof: disabling unevaluated refusal made the scratch altered-verdict target
    // unexpectedly succeed for an unmeasured PERF obligation.
    if (verdict.candidate !== candidate || verdict.unevaluated.length !== 0) {
      throw new Error(
        `Burokrat Performance judge refused the measured run: ${checked.stdout.trim()} ${checked.stderr.trim()}`,
      );
    }
    const failedCases = new Set<string>();
    const casesXml = declaration.cases
      .map((performanceCase) => {
        const execution = executed.execution.cases.find(
          (entry) => entry.caseId === performanceCase.caseId,
        );
        const observation = execution?.observations.find(
          (entry) => entry.measurement === performanceCase.measurement,
        );
        // The strict run parser binds one execution and observation per declared case.
        // Proof: removing its attachment cardinality guard made the actual
        // missing-measurement target reach `invalid Playwright JSON observation
        // attachment` instead of its named one-observation refusal.
        if (execution === undefined || observation === undefined)
          throw new Error(
            `Performance report case ${performanceCase.caseId} lacks execution evidence`,
          );
        const passed =
          execution.status === 'passed' &&
          compareThreshold({
            operator: performanceCase.operator,
            threshold: performanceCase.threshold,
            observation: observation.value,
          });
        if (!passed) failedCases.add(performanceCase.caseId);
        const failure = passed
          ? ''
          : `\n    <failure message="Performance case ${xmlText(performanceCase.caseId)} did not meet its reviewed threshold"/>\n  `;
        return `  <testcase classname="${xmlText(performanceCase.fixture)}" name="${xmlText(performanceCase.titlePath.join(' › '))}" file="${xmlText(performanceCase.fixture)}">${failure}</testcase>`;
      })
      .join('\n');
    const expectedFindings = declaration.cases
      .filter((performanceCase) => failedCases.has(performanceCase.caseId))
      .map((performanceCase) => ({
        path: performanceCase.fixture,
        message: `Performance case ${performanceCase.caseId} did not meet its reviewed threshold`,
      }));
    assertPerformanceFindings(verdict.findings, expectedFindings);
    const reportSource = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="wbs-fe-01.performance" tests="${String(declaration.cases.length)}" failures="${String(failedCases.size)}" errors="0" skipped="0">\n${casesXml}\n</testsuite>\n`;
    await writeBundleArtifact(bundle, 'report.xml', reportSource);
    await writeBundleArtifact(
      bundle,
      'manifest.json',
      `${JSON.stringify({
        schemaVersion: 1,
        certifies: false,
        invocationId,
        candidate,
        revision,
        policyDigest,
        declarationDigest: evidence.declarationDigest,
        configDigest: evidence.selection.configDigest,
        selection: evidence.selection,
        collected: listed.cases.map(({ caseId, fixture, titlePath }) => ({
          caseId,
          fixture,
          titlePath,
        })),
        discovery: { path: 'discovery.json', digest: hashBytes(listedInvocation.stdout) },
        run: { path: 'run.json', digest: hashBytes(runInvocation.stdout) },
        evidence: { path: 'evidence.json', digest: hashBytes(evidenceSource) },
        report: { path: 'report.xml', digest: hashBytes(reportSource) },
      })}\n`,
    );
    // Proof: before this branch emitted a failing report, the scratch threshold-breach test
    // found no JUnit at all; removing the nonzero exit would make the target accept that breach.
    if (failedCases.size > 0)
      throw new Error(`Performance threshold failure: ${[...failedCases].join(', ')}`);
    publish = true;
  } catch (cause) {
    hasExecutionFailure = true;
    executionFailure = cause;
  } finally {
    const cleanupFailures: unknown[] = [];
    if (owner !== undefined) {
      try {
        // Proof: the threshold plus injected pidfd signal fault kept both
        // errors in failure.json; the combined orphan timeout reaped children.
        await owner.stop();
      } catch (cause) {
        cleanupFailures.push(cause);
      }
      try {
        await assertShiftedPortsFree(shift);
      } catch (cause) {
        cleanupFailures.push(cause);
      }
    }
    if (checkoutAdded) {
      try {
        requireGit(
          candidateRoot,
          ['worktree', 'remove', '--force', checkoutRoot],
          'checkout cleanup',
        );
      } catch (cause) {
        cleanupFailures.push(cause);
      }
    }
    try {
      await rm(archiveParent, { recursive: true, force: true });
    } catch (cause) {
      cleanupFailures.push(cause);
    }
    if (hasExecutionFailure || cleanupFailures.length > 0) {
      try {
        // Proof: the production threshold plus injected pidfd signal fault
        // formerly left failure.json with only the threshold error.
        // Proof: dropping recursive rendering made the combined capture/close
        // negative save only the outer AggregateError in failure.json.
        const executionDiagnostic = hasExecutionFailure
          ? renderFailureChain(executionFailure)
          : null;
        const cleanupDiagnostics = cleanupFailures.map(renderFailureChain);
        await writeBundleArtifact(
          bundle,
          'failure.json',
          `${JSON.stringify({
            schemaVersion: 1,
            invocationId,
            message: executionDiagnostic ?? 'Performance cleanup failed',
            executionFailure: executionDiagnostic,
            cleanupFailures: cleanupDiagnostics,
          })}\n`,
        );
      } catch (cause) {
        cleanupFailures.push(cause);
      }
    }
    // Proof: the post-run inventory ambiguity and threshold-breach runner
    // negatives retained diagnostics and never published a current pointer.
    requirePerformanceSuccess(executionFailure, hasExecutionFailure, cleanupFailures);
    if (publish) {
      // Proof: the occupied-port and threshold negatives found no new pointer;
      // the sequential passing runner test published fresh invocation IDs.
      const pointer = `${JSON.stringify({ schemaVersion: 1, certifies: false, invocationId, bundle: bundleRelative })}\n`;
      const temporary = join(candidateRoot, 'tmp/junit', `${invocationId}.current.tmp`);
      await writeFile(temporary, pointer, { flag: 'wx' });
      await rename(temporary, join(candidateRoot, performanceCurrentPath));
    }
  }
}

/** Runs one Performance invocation under a kernel-released exclusive target lock. */
export async function runPerformanceLevel(
  candidateRoot: string,
  rulePolicyPath?: string,
  injectedDescriptors?: readonly PerformanceServiceDescriptor[],
): Promise<void> {
  return withPerformanceLock(candidateRoot, () =>
    runLockedPerformanceLevel(candidateRoot, rulePolicyPath, injectedDescriptors),
  );
}

if (import.meta.main) {
  // Proof: the CLI alternate-service negative supplies --services=synthetic and
  // observes this named refusal before any target admission.
  if (process.argv.length !== 2)
    throw new Error('Performance CLI does not accept alternate service arguments');
  await runPerformanceLevel(process.cwd());
}
