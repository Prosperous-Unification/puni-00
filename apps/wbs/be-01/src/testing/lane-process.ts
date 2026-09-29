/** What a lane process left behind once it exited. */
export interface LaneExit {
  readonly code: number;
  /** Stdout after the last line {@link LaneProcess.expectLine} consumed. */
  readonly answer: string;
  readonly errors: string;
}

/**
 * One child Bun process in a cross-process race test, synchronized by the lines it prints.
 *
 * The child announces each phase (for example `ready`) as its own stdout line,
 * and {@link LaneProcess.expectLine} waits for that line instead of polling a
 * marker file on a fixed budget. A fixed budget measured the machine: on a
 * loaded 4-vCPU CI runner two cold children took more than the 5 s the old
 * polls allowed, and the race under test never ran.
 *
 * The wait has no deadline of its own. The test runner's per-test `--timeout`
 * bounds it, and {@link LaneProcess.stopAll} in `afterEach` kills the children
 * of a test the runner abandoned. A child that exits, or prints anything else,
 * before the expected line fails the wait at once with its exit code and
 * stderr.
 */
export class LaneProcess {
  static readonly #running = new Set<LaneProcess>();

  readonly #child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  readonly #errors: Promise<string>;
  readonly #drained: Promise<void>;
  #printed = '';
  #closed = false;
  #readFailure: Error | undefined;
  #wake: (() => void) | undefined;

  private constructor(argv: readonly string[]) {
    this.#child = Bun.spawn([...argv], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    this.#errors = new Response(this.#child.stderr).text();
    this.#drained = this.#drain();
    LaneProcess.#running.add(this);
  }

  /** Starts `argv` with piped stdout and stderr. */
  static spawn(argv: readonly string[]): LaneProcess {
    return new LaneProcess(argv);
  }

  /** Kills every lane process still running; call it from `afterEach`. */
  static async stopAll(): Promise<void> {
    const running = [...LaneProcess.#running];
    LaneProcess.#running.clear();
    for (const lane of running) lane.#child.kill();
    await Promise.all(running.map((lane) => lane.#child.exited));
  }

  /**
   * Consumes the next stdout line and resolves when it equals `line`.
   *
   * @throws when the child printed a different line, or closed stdout first;
   *   the error carries the child's exit code and stderr.
   */
  async expectLine(line: string): Promise<void> {
    for (;;) {
      const end = this.#printed.indexOf('\n');
      if (end !== -1) {
        const printed = this.#printed.slice(0, end);
        this.#printed = this.#printed.slice(end + 1);
        if (printed === line) return;
        throw await this.#fail(`printed ${JSON.stringify(printed)} instead of ${line}`);
      }
      if (this.#closed) throw await this.#fail(`closed stdout before printing ${line}`);
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  /** Waits for the child to exit and returns what it left. */
  async finish(): Promise<LaneExit> {
    const [code, errors] = await Promise.all([this.#child.exited, this.#errors, this.#drained]);
    if (this.#readFailure !== undefined) throw this.#readFailure;
    LaneProcess.#running.delete(this);
    return { code, answer: this.#printed, errors };
  }

  async #drain(): Promise<void> {
    const decoder = new TextDecoder();
    const reader = this.#child.stdout.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.#printed += decoder.decode(chunk.value, { stream: true });
        this.#wake?.();
      }
      this.#printed += decoder.decode();
    } catch (error) {
      // Thrown by expectLine and finish, which own the test's failure.
      this.#readFailure = new Error('lane process stdout could not be read', { cause: error });
    } finally {
      this.#closed = true;
      this.#wake?.();
    }
  }

  async #fail(reason: string): Promise<Error> {
    if (this.#readFailure !== undefined) return this.#readFailure;
    this.#child.kill();
    const [code, errors] = await Promise.all([this.#child.exited, this.#errors]);
    LaneProcess.#running.delete(this);
    return new Error(`lane process ${reason}; exit ${String(code)}; stderr: ${errors}`);
  }
}
