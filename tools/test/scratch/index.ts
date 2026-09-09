import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll } from 'bun:test';

let processRoot: string | undefined;

function removeProcessRoot(): void {
  if (processRoot === undefined) return;
  try {
    rmSync(processRoot, { recursive: true, force: true });
  } catch {
    // Best effort by design: cleanup must not replace the test's real verdict.
  }
  processRoot = undefined;
}

// Bun test workers do not run process exit hooks when the runner tears them
// down, so clean at the test-runner boundary as well.
afterAll(removeProcessRoot);

/**
 * One lazily-created scratch root for this test process.
 *
 * Every child directory is removed on ordinary exit, including an uncaught
 * test failure. Signal handlers remove the root and then re-raise the same
 * signal so cancellation keeps its original process status.
 */
export function scratchRoot(): string {
  if (processRoot !== undefined) return processRoot;
  processRoot = mkdtempSync(join(tmpdir(), `wbs-test-${process.pid}-`));
  process.on('exit', removeProcessRoot);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, () => {
      removeProcessRoot();
      process.kill(process.pid, signal);
    });
  }
  return processRoot;
}

export function scratchSync(prefix: string): string {
  return mkdtempSync(join(scratchRoot(), prefix));
}

export async function scratchAsync(prefix: string): Promise<string> {
  return await mkdtemp(join(scratchRoot(), prefix));
}
