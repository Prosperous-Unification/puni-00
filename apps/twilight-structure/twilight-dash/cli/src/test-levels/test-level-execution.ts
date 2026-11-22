import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { Monotonic } from '../clock';
import { createPerformanceProcessOwner } from './performance-processes';

/** Unknown numeric, EOF, native tree or release state retains every still-owned judge namespace. */
export class TestLevelCustodyFailure extends AggregateError {}

/** Explicit actual operation-resource release failure; ordinary killed-child refusals are not this outcome. */
export class TestLevelCleanupFailure extends AggregateError {}

/** Minted only by the actual execution's signal handler and recognized by exact per-owner identity. */
class TestLevelCancellation extends Error {}

/**
 * One actual native owner and first cancellation cover both independent judging and runtime children.
 * Every acquired observation is retained immediately. Judge scratch is created here and released only
 * after the native tree and all captured channels settle; callers cannot register arbitrary cleanup paths.
 */
export class TestLevelExecution {
  private readonly native: ReturnType<typeof createPerformanceProcessOwner>;
  private readonly observations: Promise<{ ok: true } | { ok: false; cause: unknown }>[] = [];
  private readonly judgeDirectories = new Set<string>();
  private stopping: Promise<void> | undefined;
  private isClosing = false;
  private hasUnobservedLaunch = false;
  private cancellationCleanup: Promise<{ ok: true } | { ok: false; cause: unknown }> | undefined;
  private readonly observationFailures: unknown[] = [];
  private cancellation: { signal: 'SIGINT' | 'SIGTERM'; cause: TestLevelCancellation } | undefined;
  private operationFailure: { cause: unknown } | undefined;
  private readonly children = new WeakSet<Bun.Subprocess>();
  private readonly onInterrupt = (): void => {
    this.cancel('SIGINT');
  };
  private readonly onTermination = (): void => {
    this.cancel('SIGTERM');
  };

  constructor(monotonic: Monotonic) {
    this.native = createPerformanceProcessOwner(monotonic);
    process.on('SIGINT', this.onInterrupt);
    process.on('SIGTERM', this.onTermination);
  }

  /** Return the same channel promise while retaining its exact success/failure for final cleanup. */
  capture<Value>(pending: Promise<Value>): Promise<Value> {
    this.observations.push(
      pending.then(
        (): { ok: true } => ({ ok: true }),
        (cause: unknown): { ok: false; cause: unknown } => ({ ok: false, cause }),
      ),
    );
    return pending;
  }

  /** The actual native owner registers the child before returning; a failed admission stays unknown. */
  spawn(
    argv: string[],
    cwd: string,
    environment: Record<string, string>,
    output?: { stdout: number | 'pipe'; stderr: number | 'pipe' },
  ): Bun.Subprocess {
    this.assertActive();
    try {
      const child = this.native.spawn(argv, cwd, environment, output);
      this.children.add(child);
      void this.capture(child.exited);
      return child;
    } catch (cause) {
      this.hasUnobservedLaunch = true;
      throw cause;
    }
  }

  /** Create only fresh owned judge scratch; no caller-supplied existing directory becomes disposable. */
  createJudgeDirectory(temporaryDirectory: string): string {
    this.assertActive();
    const directory = mkdtempSync(join(temporaryDirectory, 'puni-burokrat-cwd-'));
    this.judgeDirectories.add(directory);
    return directory;
  }

  /** Retain an actual observation-setup failure so cleanup cannot turn missing channels into known custody. */
  retainFailure(cause: unknown): void {
    this.observationFailures.push(cause);
  }

  /** Expected cancellation is only this owner's actual signal token, never an arbitrary later error. */
  isCancellation(cause: unknown): boolean {
    return this.cancellation !== undefined && Object.is(cause, this.cancellation.cause);
  }

  /** Record an unexpected operation failure when first observed, before resource cleanup can receive a later signal. */
  observeOperationFailure(cause: unknown): void {
    if (!this.isCancellation(cause)) this.operationFailure ??= { cause };
  }

  /** Observe an action before its enclosing lock/resource owner starts release. */
  observeOperation<Value>(pending: Promise<Value>): Promise<Value> {
    return pending.catch((cause: unknown) => {
      this.observeOperationFailure(cause);
      throw cause;
    });
  }

  /** A successful callback cannot erase a previously observed unexpected failure. */
  assertOperationSucceeded(): void {
    if (this.operationFailure !== undefined) throw this.operationFailure.cause;
  }

  /** Convert only an actual owned child killed by TERM/KILL after recorded cancellation, before payload decoding. */
  assertChildResult(child: Bun.Subprocess, exitCode: number): void {
    if (!this.children.has(child))
      throw new Error('test-level response is not from this execution');
    if (
      this.cancellation !== undefined &&
      exitCode !== 0 &&
      (child.signalCode === 'SIGTERM' || child.signalCode === 'SIGKILL')
    )
      throw this.cancellation.cause;
  }

  /** Memoize even a failed cleanup; no native pidfd close or uncertain resource release is retried. */
  stop(): Promise<void> {
    return (this.stopping ??= this.finish());
  }

  /**
   * Release only after the enclosing operation has awaited stop and finished its own artifact cleanup.
   * A known cancellation re-raises the first native signal; failed cleanup remains a thrown failure.
   */
  async dispose(): Promise<void> {
    try {
      await this.stop();
      if (this.observationFailures.length !== 0)
        throw new TestLevelCleanupFailure(
          [...this.observationFailures],
          'Test-level release failed after native cleanup',
        );
      if (this.cancellation !== undefined) {
        const cleanup = this.cancellationCleanup;
        if (cleanup === undefined)
          throw new Error('test-level cancellation lacks its owned cleanup observation');
        const settlement = await cleanup;
        if (!settlement.ok) throw settlement.cause;
      }
    } finally {
      this.detach();
    }
    if (this.cancellation !== undefined && this.operationFailure === undefined)
      process.kill(process.pid, this.cancellation.signal);
  }

  /** Reject a publication not yet issued when the command has observed its first cancellation. */
  assertPublicationAllowed(): void {
    if (this.cancellation !== undefined) throw this.cancellation.cause;
  }

  /** Preserve owned cancellation before continuing work, even while child cleanup is pending. */
  assertActive(): void {
    if (this.cancellation !== undefined) throw this.cancellation.cause;
    if (this.isClosing) throw new Error('test-level execution is closing');
  }

  private detach(): void {
    process.off('SIGINT', this.onInterrupt);
    process.off('SIGTERM', this.onTermination);
  }

  private cancel(signal: 'SIGINT' | 'SIGTERM'): void {
    if (this.cancellation !== undefined) return;
    this.cancellation = {
      signal,
      cause: new TestLevelCancellation('test-level execution was cancelled by ' + signal),
    };
    // The enclosing operation awaits this exact retained stop promise. No competing handler
    // terminates the caller before its artifact cleanup and the shared child tree have settled.
    this.cancellationCleanup = this.stop().then(
      (): { ok: true } => ({ ok: true }),
      (cause: unknown): { ok: false; cause: unknown } => ({ ok: false, cause }),
    );
  }

  private async finish(): Promise<void> {
    this.isClosing = true;
    const failures: unknown[] = [];
    const hasFailures = (): boolean => failures.length !== 0;
    const remember = (cause: unknown): void => {
      if (!failures.some((previous) => Object.is(previous, cause))) failures.push(cause);
    };
    try {
      await this.native.stop();
    } catch (cause) {
      remember(cause);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const settled = await Promise.race([
        Promise.all(this.observations),
        new Promise<never>((_accept, reject) => {
          timer = setTimeout(() => {
            reject(new Error('test-level numeric exit or output EOF did not settle'));
          }, 8_000);
        }),
      ]);
      for (const observation of settled) if (!observation.ok) remember(observation.cause);
    } catch (cause) {
      remember(cause);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    for (const cause of this.observationFailures) remember(cause);
    if (this.hasUnobservedLaunch)
      remember(new Error('test-level launch observation is incomplete'));
    if (hasFailures())
      throw new TestLevelCustodyFailure(
        failures,
        'Test-level custody unconfirmed; retained judge directories: ' +
          [...this.judgeDirectories].join(', '),
      );
    for (const directory of this.judgeDirectories) {
      try {
        await rm(directory, { recursive: true });
        this.judgeDirectories.delete(directory);
      } catch (cause) {
        remember(cause);
      }
    }
    if (hasFailures())
      throw new TestLevelCustodyFailure(
        failures,
        'Test-level judge directory release failed; retained: ' +
          [...this.judgeDirectories].join(', '),
      );
  }
}

/** Keep original operation and every cleanup cause, including failures before the operation creates its checkout. */
export async function runTestLevelExecution<Value>(
  monotonic: Monotonic,
  execute: (execution: TestLevelExecution) => Promise<Value>,
): Promise<Value> {
  const execution = new TestLevelExecution(monotonic);
  const completed = await (async () => await execute(execution))().then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  if (!completed.ok) {
    execution.observeOperationFailure(completed.cause);
    if (completed.cause instanceof TestLevelCleanupFailure)
      execution.retainFailure(completed.cause);
  }
  const cleanup: unknown[] = [];
  const remember = (cause: unknown): void => {
    if (!cleanup.some((previous) => Object.is(previous, cause))) cleanup.push(cause);
  };
  try {
    await execution.stop();
  } catch (cause) {
    remember(cause);
  }
  try {
    await execution.dispose();
  } catch (cause) {
    remember(cause);
  }
  if (cleanup.length !== 0)
    throw new AggregateError(
      completed.ok ? cleanup : [completed.cause, ...cleanup],
      'Test-level execution cleanup failed: ' +
        cleanup.map(String).join('; ') +
        (completed.ok ? '' : '; operation failed: ' + String(completed.cause)),
    );
  if (!completed.ok) throw completed.cause;
  execution.assertOperationSucceeded();
  return completed.value;
}
