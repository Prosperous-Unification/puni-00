import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runNavigator } from '../cli';
import { readNavigatorInvocation, UsageRefusal } from '../cli-parser';

const ENTRYPOINT = join(import.meta.dir, '..', 'entrypoint.ts');

export interface TwinRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * {@link readNavigatorInvocation} and {@link runNavigator} in this process, reported as the
 * entrypoint would: exit 2 and one `error: ` line for a {@link UsageRefusal}, exit 1 for any
 * other failure. Cheaper than {@link runTwin}, which pays a multi-second module load per child;
 * the entrypoint mapping itself is proven there.
 */
export async function runTwinInProcess(argv: readonly string[]): Promise<TwinRun> {
  let stdout = '';
  try {
    const invocation = readNavigatorInvocation(argv, (text) => {
      stdout += text;
    });
    if (invocation.kind === 'command') stdout += `${await runNavigator(invocation.command)}\n`;
    return { exitCode: 0, stdout, stderr: '' };
  } catch (failure) {
    if (!(failure instanceof Error)) throw failure;
    if (failure instanceof UsageRefusal) {
      return { exitCode: 2, stdout, stderr: `error: ${failure.message}\n` };
    }
    return { exitCode: 1, stdout, stderr: failure.message };
  }
}

/** The real `twin` entrypoint run as a child process, with its exit code and both streams. */
export function runTwin(argv: readonly string[]): TwinRun {
  const child = Bun.spawnSync({
    cmd: [process.execPath, 'run', ENTRYPOINT, ...argv],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}

/** A fresh scratch directory and its removal, for one test. */
export function scratchDirectory(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'twin-'));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

/** Under uid 0 file modes do not deny reads, so a mode-based proof would pass vacuously. */
export function requireNonRoot(): void {
  if (process.getuid?.() === 0) {
    throw new Error('twilight-navigator:test needs a non-root runner for file-mode proofs');
  }
}
