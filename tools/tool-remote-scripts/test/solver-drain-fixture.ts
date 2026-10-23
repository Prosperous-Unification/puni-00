import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withSolverRuntimeAdmission } from '../src/lib/solver-runtime-admission';
import { boundedCommand } from './solver-drain-transport';

/** Disposable creator: no supervisor listener, adoption or global orphan sweep. */
async function runCreator(): Promise<void> {
  const argument = process.argv.at(2);
  if (!argument?.startsWith('--config=/')) throw new Error('fixture config required');
  const root = dirname(argument.slice('--config='.length));
  const manifest: unknown = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('createDuringStop' in manifest) ||
    !Array.isArray(manifest.createDuringStop) ||
    !manifest.createDuringStop.every((part: unknown) => typeof part === 'string')
  )
    throw new Error('fixture manifest malformed');
  const createDuringStop = manifest.createDuringStop;
  await withSolverRuntimeAdmission(async () => {
    const descendant = Bun.spawn(['/bin/sleep', '300'], { stdout: 'ignore', stderr: 'ignore' });
    let stopping = false;
    await new Promise<void>((resolve, reject) => {
      process.on('SIGTERM', () => {
        if (stopping) return;
        stopping = true;
        void (async () => {
          const id = await boundedCommand(createDuringStop, 10000);
          await writeFile(join(root, 'during-stop.id'), id, { mode: 0o600, flag: 'wx' });
          if (descendant.exitCode === null) descendant.kill('SIGKILL');
          await descendant.exited;
          resolve();
        })().catch(reject);
      });
      void writeFile(
        join(root, 'ready.json'),
        JSON.stringify({ pid: process.pid, descendant: descendant.pid }),
        { mode: 0o600, flag: 'wx' },
      ).catch(reject);
    });
  });
}

if (import.meta.main) {
  try {
    await runCreator();
  } catch (cause) {
    const argument = process.argv.at(2);
    if (!argument?.startsWith('--config=/')) throw cause;
    await writeFile(
      join(dirname(argument.slice('--config='.length)), 'refused.json'),
      JSON.stringify({ pid: process.pid, error: String(cause) }),
      { mode: 0o600 },
    );
    process.exit(78);
  }
}
