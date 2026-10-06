import { statSync } from 'node:fs';
import { join } from 'node:path';

import { git } from './git';

/** What a nested checkout is asked to prove: its own checks, or its k3d rehearsal. */
export type NestedRun = 'check' | 'rehearse';

/** The commands each run executes inside `private/<repo>`, in order, stopping at the first failure. */
export const nestedCommands: Readonly<Record<NestedRun, readonly (readonly string[])[]>> = {
  check: [
    ['bun', 'install', '--frozen-lockfile'],
    ['bunx', 'nx', 'run-many', '-t', 'test', 'lint', 'typecheck', 'check'],
  ],
  rehearse: [
    ['bun', 'install', '--frozen-lockfile'],
    ['bunx', 'nx', 'run-many', '-t', 'rehearse'],
  ],
};

const skippedWork: Readonly<Record<NestedRun, string>> = { check: 'checks', rehearse: 'rehearsal' };

/**
 * The environment for the nested workspace: the caller's, without the `NX_*` task variables this
 * public Nx run sets, which would otherwise describe the outer task to the nested Nx.
 */
function nestedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined || key.startsWith('NX_') ? [] : [[key, value]],
    ),
  );
}

/**
 * Runs `commands` inside `private/<repo>` of the checkout containing `workspace` and returns the
 * first non-zero exit code, or 0.
 *
 * An absent checkout is the one modelled optional outcome: it prints
 * `private checkout absent: <repo> <work> skipped` and returns 0 without running anything, so a
 * public-only checkout stays usable. A path that exists but is not a directory, or cannot be
 * inspected, throws rather than reading as absent.
 */
export async function runNested(
  workspace: string,
  repo: string,
  run: NestedRun,
  commands: readonly (readonly string[])[] = nestedCommands[run],
): Promise<number> {
  const target = join(git(workspace, ['rev-parse', '--show-toplevel']), 'private', repo);
  let isDirectory: boolean;
  try {
    isDirectory = statSync(target).isDirectory();
  } catch (cause) {
    const absent =
      typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
    // Proof: with this rethrow removed, nested.test.ts `refuses a checkout it cannot inspect
    // rather than reading it as absent` failed (5 pass / 1 fail) on 2026-10-06.
    if (!absent) throw cause;
    console.log(`private checkout absent: ${repo} ${skippedWork[run]} skipped`);
    return 0;
  }
  if (!isDirectory) throw new Error(`${target} exists but is not a directory`);
  for (const command of commands) {
    console.log(`[${repo}] ${command.join(' ')}`);
    const child = Bun.spawn([...command], {
      cwd: target,
      env: nestedEnvironment(),
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await child.exited;
    // Proof: with this early return removed, nested.test.ts `propagates the first failing
    // command` failed (4 pass / 1 fail) on 2026-10-06.
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const [run, repo] = args;
  if (args.length !== 2 || (run !== 'check' && run !== 'rehearse')) {
    console.error('usage: bun run tools/tool-private/src/nested.ts check|rehearse <repo>');
    process.exit(1);
  }
  try {
    process.exit(await runNested(process.cwd(), repo, run));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
