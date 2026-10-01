const HOLDER = new URL(
  '../../../../../../apps/wbs/be-01/src/testing/saved-plan-lock-holder.ts',
  import.meta.url,
).pathname;

/**
 * How long the holder keeps the lock after {@link WriteLockHolder.go}: half of
 * the 5 s `busy_timeout` every ordinary connection carries (`db.ts`).
 *
 * The number is what makes a refusal test discriminating without a stopwatch.
 * A save that *waited* for the lock instead of refusing would still be waiting
 * when the holder commits, well inside its own 5 s, and would then succeed; so
 * the outcome alone tells a refusal from a wait. The other half is the room a
 * correct save has, on a loaded host, to get from `go` to its `BEGIN`.
 */
const RELEASE_AFTER_MS = 2_500;

/**
 * The per-case budget of a test that starts a holder, set by the rule in
 * `docs/test-budgets.md`. Nearly all of a case is the holder's cold start: a
 * few seconds on a quiet host, and 19 to 34 s at load average 98 to 137 on 24
 * cores on 2026-09-29, where the target's 30 s budget cut several cases short
 * before the holder printed `held`. Twice the budget it overran is 60 s.
 */
export const HOLDER_CASE_BUDGET_MS = 60_000;

/**
 * The rival process in a saved-plan write-lock test: a real
 * `SavedPlanRepository.write` in another Bun process, stopped inside its
 * `BEGIN IMMEDIATE` until this side lets it commit.
 *
 * Every wait is on a line the holder prints or on its exit, never on a fixed
 * budget: a cold Bun start took 2.6 s idle and more than 16 s beside 24
 * busy loops on a 24-core host, so a deadline here would measure the machine.
 * The test runner's per-test `--timeout` bounds the wait, and a holder that
 * dies first fails it at once with its stderr.
 */
export class WriteLockHolder {
  static readonly #running = new Set<WriteLockHolder>();

  readonly #child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;

  private constructor(child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>) {
    this.#child = child;
    WriteLockHolder.#running.add(this);
  }

  /**
   * Starts the holder on project `p1` of `path` and resolves once it holds the write lock.
   *
   * @throws when the holder closes stdout or prints anything before `held`; the
   *   error carries its exit code and stderr.
   */
  static async hold(path: string, planId: string): Promise<WriteLockHolder> {
    const child = Bun.spawn({
      cmd: [process.execPath, HOLDER, path, 'p1', planId, String(RELEASE_AFTER_MS)],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const holder = new WriteLockHolder(child);
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let printed = '';
    while (!printed.includes('\n')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      printed += decoder.decode(chunk.value, { stream: true });
    }
    reader.releaseLock();
    if (printed !== 'held\n') {
      child.kill();
      WriteLockHolder.#running.delete(holder);
      const [code, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      throw new Error(
        `the holder printed ${JSON.stringify(printed)} instead of held; exit ${String(code)}; stderr: ${errors}`,
      );
    }
    return holder;
  }

  /** Kills every holder a failed test left running; call it from `afterEach`. */
  static async stopAll(): Promise<void> {
    const running = [...WriteLockHolder.#running];
    WriteLockHolder.#running.clear();
    for (const holder of running) holder.#child.kill();
    await Promise.all(running.map((holder) => holder.#child.exited));
  }

  /** Starts the holder's {@link RELEASE_AFTER_MS} countdown to its commit. */
  async go(): Promise<void> {
    await this.#instruct('go');
  }

  /** Lets the holder commit now. */
  async release(): Promise<void> {
    await this.#instruct('release');
  }

  /** Closes the holder's stdin, which commits if nothing else has, and returns its exit code. */
  async finish(): Promise<number> {
    await this.#child.stdin.end();
    const code = await this.#child.exited;
    WriteLockHolder.#running.delete(this);
    return code;
  }

  async #instruct(line: 'go' | 'release'): Promise<void> {
    await this.#child.stdin.write(`${line}\n`);
    await this.#child.stdin.flush();
  }
}
