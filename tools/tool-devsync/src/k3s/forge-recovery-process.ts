import { readFile } from 'node:fs/promises';

export interface RecoveryCommand {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly environment: Record<string, string | undefined>;
  readonly stdout: string;
  readonly stderr: string;
  readonly timeoutMs: number;
}
export interface CommandReceipt {
  readonly exitCode: number;
  readonly output: string;
  readonly timedOut: boolean;
}

/**
 * One command owns a new process group. Its finite deadline kills that group with SIGKILL,
 * including local CLI descendants. Direct exit also kills remaining group members.
 * Killing docker exec's client does not kill its remote process: future node samplers must
 * additionally have a separately verified remote hard deadline. Automatic samplers are disabled.
 */
export async function runRecoveryCommand(request: RecoveryCommand): Promise<CommandReceipt> {
  // Proof: zero, negative, NaN and infinite deadline fixtures refuse before any process/output file.
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
    throw new Error('positive command deadline required');
  const child = Bun.spawn([...request.command], {
    cwd: request.cwd,
    env: request.environment,
    stdout: Bun.file(request.stdout),
    stderr: Bun.file(request.stderr),
    detached: true,
  });
  const killGroup = () => {
    // Proof: the real TERM-ignoring child/descendant fixture fails with TERM-only escalation.
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH'))
        throw failure;
    }
  };
  let timedOut = false;
  let escalationFailure: unknown;
  const deadline = setTimeout(() => {
    timedOut = true;
    try {
      killGroup();
    } catch (failure) {
      escalationFailure = failure;
    }
  }, request.timeoutMs);
  const ceiling = new Promise<never>((_, reject) => {
    const expiry = setTimeout(() => {
      reject(new Error('process group did not exit after hard kill'));
    }, request.timeoutMs + 1000);
    void child.exited.then(() => {
      clearTimeout(expiry);
    });
  });
  try {
    const exitCode = await Promise.race([child.exited, ceiling]);
    if (escalationFailure !== undefined)
      throw new Error('process group hard kill failed', { cause: escalationFailure });
    const output = `${await readFile(request.stdout, 'utf8')}\n${await readFile(request.stderr, 'utf8')}`;
    return { exitCode, output, timedOut };
  } finally {
    clearTimeout(deadline);
    // Proof: omitting this cleanup leaves the direct-exit fixture descendant running.
    killGroup();
  }
}
