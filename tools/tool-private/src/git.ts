/** The captured outcome of one git invocation. */
export interface GitOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs git with captured output and never throws on a non-zero exit; callers model it. */
export function tryGit(cwd: string, args: readonly string[]): GitOutcome {
  const spawned = Bun.spawnSync(['git', '-C', cwd, ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: spawned.exitCode,
    stdout: spawned.stdout.toString(),
    stderr: spawned.stderr.toString(),
  };
}

/** Runs git and returns its trimmed stdout, throwing with git's own stderr on a non-zero exit. */
export function git(cwd: string, args: readonly string[]): string {
  const outcome = tryGit(cwd, args);
  if (outcome.exitCode !== 0) {
    throw new Error(
      `git ${args.join(' ')} in ${cwd} exited ${String(outcome.exitCode)}: ${outcome.stderr.trim()}`,
    );
  }
  return outcome.stdout.trim();
}
