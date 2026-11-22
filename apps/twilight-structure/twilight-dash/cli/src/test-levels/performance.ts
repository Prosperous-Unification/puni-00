import { randomUUID } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
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
  decodePlaywrightReport,
  digestPerformanceDeclaration,
} from '@shared/test-evidence';
import { dlopen } from 'bun:ffi';

import {
  assertCandidateServiceDescriptors,
  decodeServiceDescriptors,
  type PerformanceServiceDescriptor,
  type PerformanceServiceDescriptors,
} from './performance-services';
import { retainTestLevelContext, type TestLevelContext } from './test-level-context';
import {
  assertPerformanceFindings,
  assertPreflight,
  decodeCandidateIdentity,
  readVerdict,
  xmlText,
} from './test-level-evidence';
import type { TestLevelExecution } from './test-level-execution';
import { runTestLevelExecution, TestLevelCleanupFailure } from './test-level-execution';

const lockLibrary =
  process.platform === 'linux'
    ? dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } })
    : undefined;

export interface FixtureService extends PerformanceServiceDescriptor {
  readonly bunArguments: readonly ['--eval', string];
}

type FixtureServices = readonly [FixtureService, FixtureService, FixtureService];

/** Actual owned Performance execution; all runtime, toolchain and judge authority is required and retained. */
export function createPerformanceRuntime(selection: TestLevelContext) {
  const context = retainTestLevelContext(selection);
  const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
  const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
  const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
  const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';
  const evidencePath = 'tmp/junit/wbs-fe-01.performance.evidence.json';
  const playwrightCli = context.assets.playwrightEntrypoint;
  const performanceCurrentPath = 'tmp/junit/wbs-fe-01.performance.current.json';
  const performanceBundleRoot = 'tmp/junit/performance';

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
    const completed = await (async () => await action())().then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      closeSync(descriptor);
    } catch (cleanup) {
      throw new TestLevelCleanupFailure(
        completed.ok ? [cleanup] : [completed.cause, cleanup],
        'Performance lock release failed',
        { cause: cleanup },
      );
    }
    if (!completed.ok) throw completed.cause;
    return completed.value;
  }

  /** Source-test construction only; the installed public operation never accepts an alternate plan or command string. */
  function retainFixtureServices(services: readonly FixtureService[]): FixtureServices {
    const kept = structuredClone(services);
    const hasEvalArguments = (argv: readonly unknown[]) =>
      argv.length === 2 && argv[0] === '--eval' && typeof argv[1] === 'string';
    if (kept.length !== 3 || kept.some((service) => !hasEvalArguments(service.bunArguments)))
      throw new Error('Performance source fixture requires three closed Bun eval services');
    // The fixed three-service cardinality and exact Bun operand shape were validated at this fixture boundary.
    return kept as [FixtureService, FixtureService, FixtureService];
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
        throw new AggregateError(
          closeFailures,
          'Performance descriptor ' + label + ' close failed',
        );
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
    owner: TestLevelExecution,
    selectionEnvironment: { CI: '1'; E2E_PORT_SHIFT: string },
  ): Promise<PerformanceServiceDescriptors> {
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
            context.runtime,
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
        owner.assertChildResult(child, exitCode);
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
      PATH: context.environment['PATH'] ?? '/usr/bin:/bin',
      HOME: context.environment['HOME'] ?? tmpdir(),
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
        // check changed refusal to the depth bound and failed its named assertion.
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
    execution: TestLevelExecution,
    child: Bun.Subprocess,
    deadlineMs: number,
    phase: string,
  ): Promise<number> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const exitCode = await Promise.race([
        child.exited,
        new Promise<never>((_accept, reject) => {
          // Proof: the hung-Playwright production-path negative reached its
          // 120-second execution deadline and retained failure diagnostics.
          timeout = setTimeout(() => {
            reject(new Error(`Performance ${phase} timed out`));
          }, deadlineMs);
        }),
      ]);
      execution.assertChildResult(child, exitCode);
      return exitCode;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async function awaitServiceReadiness(
    execution: TestLevelExecution,
    descriptors: readonly PerformanceServiceDescriptor[],
    children: readonly Bun.Subprocess[],
    deadlineMs: number,
  ): Promise<void> {
    const pending = new Set(descriptors.map((descriptor) => descriptor.url));
    const failures = new Map<string, string>();
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      // Proof: holding the supervisor's readiness response while all three ports were healthy
      // and sending SIGTERM failed the production cancellation test at its 15-second exit bound.
      execution.assertActive();
      if (pending.size === 0) return;
      if (Date.now() >= deadline) break;
      for (const [index, descriptor] of descriptors.entries()) {
        if (!pending.has(descriptor.url)) continue;
        const child = children.at(index);
        if (child === undefined) throw new Error('Performance readiness lacks a service child');
        if (child.exitCode !== null) {
          execution.assertChildResult(child, child.exitCode);
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
      if (pending.size > 0) await Bun.sleep(100);
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
    if (context.environment['PUNI_PERFORMANCE_DEBUG'] === '1') {
      process.stderr.write(`[performance] ${stage}\n`);
    }
  }

  function invoke(argv: string[], cwd: string): Invocation {
    tracePerformance(
      `start ${argv[0]} ${argv.includes('--list') ? 'list' : argv.includes('--reporter=json') ? 'run' : ''}`,
    );
    const call = Bun.spawnSync(argv, {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: context.environment,
    });
    tracePerformance(
      `end ${argv[0]} exit=${String(call.exitCode)} stdout=${String(call.stdout.length)} stderr=${String(call.stderr.length)}`,
    );
    return {
      exitCode: call.exitCode,
      stdout: call.stdout.toString(),
      stderr: call.stderr.toString(),
    };
  }

  async function invokePlaywright(
    argv: string[],
    cwd: string,
    reportFile: string,
    owner: TestLevelExecution,
    deadlineMs: number,
    selectionEnvironment: { CI: '1'; E2E_PORT_SHIFT: string },
    runDatabase: string,
  ): Promise<Invocation> {
    // Proof: inheriting context.environment made the scratch config consume injected PLAYWRIGHT_GREP;
    // the production fixture test then failed exact collection instead of measuring its case.
    const runtimeEnvironment: Record<string, string> = {
      PATH: context.environment['PATH'] ?? '/usr/bin:/bin',
      HOME: context.environment['HOME'] ?? cwd,
      TMPDIR: tmpdir(),
      LANG: 'C.UTF-8',
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      E2E_TEST_DATABASE: runDatabase,
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
        owner,
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
        throw new Error('Playwright Performance JSON reporter output is not valid UTF-8', {
          cause,
        });
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

  async function readIdentityIn(
    execution: TestLevelExecution,
    root: string,
    revision: string,
  ): Promise<string> {
    return decodeCandidateIdentity(
      await context.judge.identity(execution, root, revision),
      revision,
    );
  }

  async function readIdentity(root: string, revision: string): Promise<string> {
    return await runTestLevelExecution((execution) => readIdentityIn(execution, root, revision));
  }

  async function checkPerformance(
    execution: TestLevelExecution,
    root: string,
    revision: string,
    policyPath: string,
    evidence?: string,
  ): Promise<Invocation> {
    return await context.judge.performance(execution, root, revision, policyPath, evidence);
  }

  /** Clears stale outputs and executes only the reviewed, committed Performance selection. */
  async function runLockedPerformanceLevel(
    execution: TestLevelExecution,
    candidateRoot: string,
    rulePolicyPath?: string,
    fixtureServices?: FixtureServices,
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
      E2E_PORT_SHIFT: context.environment['E2E_PORT_SHIFT'],
    });
    const shift = Number(selectionEnvironment.E2E_PORT_SHIFT);
    await assertShiftedPortsFree(shift);
    const invocationId = randomUUID();
    const bundleRelative = `${performanceBundleRoot}/${invocationId}`;
    const bundle = join(candidateRoot, bundleRelative);
    const evidenceFile = join(bundle, 'evidence.json');
    await mkdir(join(candidateRoot, performanceBundleRoot), { recursive: true });
    await mkdir(bundle, { recursive: false });

    const revision = assertCleanCandidate(candidateRoot);
    const selectedPolicyPath =
      rulePolicyPath ?? context.environment['PUNI_PERFORMANCE_RULE_POLICY'];
    // Proof: disabling external-policy selection made the absent-policy scratch test
    // receive a generic resolve(undefined) TypeError instead of the named refusal.
    if (selectedPolicyPath === undefined || selectedPolicyPath === '') {
      throw new Error('Performance needs externally selected PUNI_PERFORMANCE_RULE_POLICY');
    }
    const policyPath = resolve(selectedPolicyPath);
    const policyBytes = await readFile(policyPath);
    const policyDigest = hashBytes(policyBytes);
    const candidate = await readIdentityIn(execution, candidateRoot, revision);
    const preflight = await checkPerformance(execution, candidateRoot, revision, policyPath);
    const preflightVerdict = readVerdict(preflight, 'preflight');
    assertPreflight(preflightVerdict, candidate);
    // Only an admitted run invalidates the last success. Proof: removing this
    // made the threshold-breach production test read a stale current-success
    // pointer instead of ENOENT. Proof: placing it above the policy refusal made
    // the absent-policy production test find its prior pointer erased.
    await rm(join(candidateRoot, performanceCurrentPath), { force: true });

    const archiveParent = await mkdtemp(join(tmpdir(), 'puni-performance-'));
    const checkoutRoot = join(archiveParent, 'candidate');
    let checkoutAdded = false;
    // Historical service-only cancellation observation from the former source helper:
    // Cancellation is a controlled exit: stop every owned process, then re-raise
    // so the caller still observes the signal. Listeners stay attached during
    // cleanup so a repeated signal cannot interrupt it. Proof: without these
    // listeners the cancelled-supervisor production test found shifted port 9100
    // still bound by an orphaned service.
    // Shared independent-judge ownership and combined cleanup failures require their own current controls.
    const owner = execution;
    const stopOwner = (active: TestLevelExecution): Promise<void> => active.stop();
    // Historical cancellation was already observed for service children in the old helper.
    // The shared execution now covers independent judge children from the first identity request.
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
      await symlink(context.assets.nodeModules, join(checkoutRoot, 'node_modules'), 'dir');
      const activeOwner = owner;
      const setup = activeOwner.spawn(
        [context.runtime, 'run', 'tools/dev/setup.ts'],
        checkoutRoot,
        executionEnvironment({}, selectionEnvironment),
      );
      const setupExit = await awaitChildWithin(execution, setup, 30_000, 'development setup');
      if (setupExit !== 0)
        throw new Error(`Performance development setup failed: ${String(setupExit)}`);
      // Proof: the disposable full-mount production Nx target reached BE readiness
      // but BE exited 1 because its per-invocation SQLite path had no tmp parent.
      await mkdir(join(checkoutRoot, 'tmp'), { recursive: true });
      const runDatabase = join(checkoutRoot, 'tmp', `e2e-performance-${randomUUID()}.db`);
      const descriptors =
        fixtureServices ??
        (await readCandidateServiceDescriptors(
          checkoutRoot,
          bundle,
          shift,
          runDatabase,
          activeOwner,
          selectionEnvironment,
        ));
      const expectedUrls = [
        `http://localhost:${String(3100 + shift)}/_ordinary/ready`,
        `http://localhost:${String(3200 + shift)}/health`,
        `http://localhost:${String(4200 + shift)}`,
      ];
      if (descriptors.some((descriptor, index) => descriptor.url !== expectedUrls[index]))
        throw new Error(
          'Performance service descriptors must name the three shifted ordinary URLs',
        );
      const normalizeDescriptor = (descriptor: PerformanceServiceDescriptor, index: 0 | 1 | 2) => {
        const cwd = resolve(checkoutRoot, descriptor.cwd);
        if (
          !cwd.startsWith(`${checkoutRoot}/`) ||
          descriptor.command.trim() === '' ||
          descriptor.env['PORT'] !== String([3100, 3200, 4200][index] + shift)
        )
          throw new Error('Performance service descriptor leaves the checked-out shifted stack');
        return { ...descriptor, cwd };
      };
      const normalizedDescriptors = [
        normalizeDescriptor(descriptors[0], 0),
        normalizeDescriptor(descriptors[1], 1),
        normalizeDescriptor(descriptors[2], 2),
      ] as const;
      // The committed descriptor text has already passed exact approved-stack admission.
      // Roles select closed Bun vectors; descriptor command text is never interpreted.
      const [backend, gateway, frontend] = normalizedDescriptors;
      const serviceChildren: Bun.Subprocess[] = [];
      const serviceDeadline = Date.now() + 120_000;
      if (fixtureServices === undefined) {
        const roles = [
          [backend, 'src/testing/ordinary-browser-server.ts'],
          [gateway, 'src/testing/ordinary-browser-gateway.ts'],
        ] as const;
        for (const [descriptor, entrypoint] of roles)
          serviceChildren.push(
            activeOwner.spawn([context.runtime, entrypoint], descriptor.cwd, {
              ...executionEnvironment(descriptor.env, selectionEnvironment),
              E2E_TEST_DATABASE: runDatabase,
            }),
          );
        const frontendEnvironment = {
          ...executionEnvironment(frontend.env, selectionEnvironment),
          E2E_TEST_DATABASE: runDatabase,
        };
        const build = activeOwner.spawn(
          [context.runtime, context.assets.viteEntrypoint, 'build', '--minify=false'],
          frontend.cwd,
          frontendEnvironment,
        );
        const buildExit = await awaitChildWithin(
          execution,
          build,
          Math.max(0, serviceDeadline - Date.now()),
          'frontend build',
        );
        if (buildExit !== 0)
          throw new Error('Performance frontend build failed: ' + String(buildExit));
        serviceChildren.push(
          activeOwner.spawn(
            [
              context.runtime,
              context.assets.viteEntrypoint,
              'preview',
              '--host',
              'localhost',
              '--port',
              String(4200 + shift),
              '--strictPort',
            ],
            frontend.cwd,
            frontendEnvironment,
          ),
        );
      } else {
        const roles = [
          [normalizedDescriptors[0], fixtureServices[0]],
          [normalizedDescriptors[1], fixtureServices[1]],
          [normalizedDescriptors[2], fixtureServices[2]],
        ] as const;
        for (const [descriptor, fixture] of roles) {
          serviceChildren.push(
            activeOwner.spawn([context.runtime, ...fixture.bunArguments], descriptor.cwd, {
              ...executionEnvironment(descriptor.env, selectionEnvironment),
              E2E_TEST_DATABASE: runDatabase,
            }),
          );
        }
      }
      await awaitServiceReadiness(
        execution,
        normalizedDescriptors,
        serviceChildren,
        Math.max(0, serviceDeadline - Date.now()),
      );
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
        [context.runtime, playwrightCli, ...listArguments],
        checkoutRoot,
        join(archiveParent, 'list.json'),
        activeOwner,
        20_000,
        selectionEnvironment,
        runDatabase,
      );
      await writeBundleArtifact(bundle, 'discovery.json', listedInvocation.stdout);
      // Proof: disabling this exit-status guard made the nonzero-discovery scratch target
      // continue into execution and miss its named discovery-failed refusal.
      if (listedInvocation.exitCode !== 0)
        throw new Error(
          `Playwright Performance discovery failed: ${listedInvocation.stderr.trim()}`,
        );
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
        [context.runtime, playwrightCli, ...runArguments],
        checkoutRoot,
        join(archiveParent, 'run.json'),
        activeOwner,
        120_000,
        selectionEnvironment,
        runDatabase,
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
          JSON.stringify(
            listed.cases.map((entry) => [entry.caseId, entry.fixture, entry.titlePath]),
          )
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
      const checked = await checkPerformance(
        execution,
        candidateRoot,
        revision,
        policyPath,
        evidenceFile,
      );
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
      execution.observeOperationFailure(cause);
      hasExecutionFailure = true;
      executionFailure = cause;
    } finally {
      {
        const cleanupFailures: unknown[] = [];
        let mayRemoveCheckout = true;
        try {
          // Proof: the threshold plus injected pidfd signal fault kept both
          // errors in failure.json; the combined orphan timeout reaped children.
          await stopOwner(owner);
        } catch (cause) {
          mayRemoveCheckout = false;
          owner.retainFailure(cause);
          cleanupFailures.push(cause);
        }
        try {
          await assertShiftedPortsFree(shift);
        } catch (cause) {
          mayRemoveCheckout = false;
          owner.retainFailure(cause);
          cleanupFailures.push(cause);
        }
        if (mayRemoveCheckout && checkoutAdded) {
          try {
            requireGit(
              candidateRoot,
              ['worktree', 'remove', '--force', checkoutRoot],
              'checkout cleanup',
            );
          } catch (cause) {
            mayRemoveCheckout = false;
            owner.retainFailure(cause);
            cleanupFailures.push(cause);
          }
        }
        // Failed process settlement or worktree removal preserves the actual owned namespace.
        // The retained path supplements the original cause; cleanup is never retried here.
        if (mayRemoveCheckout) {
          try {
            await rm(archiveParent, { recursive: true, force: true });
          } catch (cause) {
            owner.retainFailure(cause);
            cleanupFailures.push(cause);
          }
        } else {
          cleanupFailures.push(
            new Error('Performance retained unconfirmed checkout: ' + archiveParent),
          );
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
            owner.retainFailure(cause);
            cleanupFailures.push(cause);
          }
        }
        // Proof: the post-run inventory ambiguity and threshold-breach runner
        // negatives retained diagnostics and never published a current pointer.
        requirePerformanceSuccess(executionFailure, hasExecutionFailure, cleanupFailures);
        if (publish) {
          owner.assertPublicationAllowed();
          // Proof: the occupied-port and threshold negatives found no new pointer;
          // the sequential passing runner test published fresh invocation IDs.
          const pointer = `${JSON.stringify({ schemaVersion: 1, certifies: false, invocationId, bundle: bundleRelative })}\n`;
          const temporary = join(candidateRoot, 'tmp/junit', `${invocationId}.current.tmp`);
          await writeFile(temporary, pointer, { flag: 'wx' });
          owner.assertPublicationAllowed();
          await rename(temporary, join(candidateRoot, performanceCurrentPath));
        }
      }
    }
  }

  /** Runs one Performance invocation under a kernel-released exclusive target lock. */
  async function runPerformanceLevel(
    candidateRoot: string,
    rulePolicyPath?: string,
  ): Promise<void> {
    await runTestLevelExecution((execution) =>
      withPerformanceLock(candidateRoot, () =>
        execution.observeOperation(
          runLockedPerformanceLevel(execution, candidateRoot, rulePolicyPath),
        ),
      ),
    );
  }

  async function runPerformanceFixture(
    candidateRoot: string,
    rulePolicyPath: string | undefined,
    services: readonly FixtureService[],
  ): Promise<void> {
    const kept = retainFixtureServices(services);
    await runTestLevelExecution((execution) =>
      withPerformanceLock(candidateRoot, () =>
        execution.observeOperation(
          runLockedPerformanceLevel(execution, candidateRoot, rulePolicyPath, kept),
        ),
      ),
    );
  }
  return {
    runPerformanceLevel,
    runPerformanceFixture,
    readIdentity,
    decodeCandidateIdentity,
    assertPreflight,
    readVerdict,
    assertPerformanceFindings,
    xmlText,
  };
}
