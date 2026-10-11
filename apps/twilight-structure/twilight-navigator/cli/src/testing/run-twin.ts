import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runNavigator, UsageRefusal } from '../cli';

const ENTRYPOINT = join(import.meta.dir, '..', 'entrypoint.ts');

export interface TwinRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * {@link runNavigator} in this process, reported as the entrypoint would: exit 2 for a
 * {@link UsageRefusal}, exit 1 for any other failure. Cheaper than {@link runTwin}, which
 * pays a multi-second module load per child; the entrypoint mapping itself is proven there.
 */
export async function runTwinInProcess(argv: readonly string[]): Promise<TwinRun> {
  try {
    return { exitCode: 0, stdout: `${await runNavigator(argv)}\n`, stderr: '' };
  } catch (failure) {
    if (!(failure instanceof Error)) throw failure;
    return {
      exitCode: failure instanceof UsageRefusal ? 2 : 1,
      stdout: '',
      stderr: failure.message,
    };
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
