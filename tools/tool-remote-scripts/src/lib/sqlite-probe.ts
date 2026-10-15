/**
 * Run an independent stored-state command against a private SQLite family copy.
 * Call only after every writer is proved stopped: a main file and retained WAL
 * copied while writing are not a coherent snapshot. The production mount remains
 * read-only; SQLite may create scratch SHM or recover WAL without changing it.
 * Proof: omitting WAL copying lost the committed SS relationship in both retained-WAL fixtures.
 * Source SHM is deliberately excluded because it is disposable coordination state.
 */
export function storedSnapshotCommand(command: string[]): string[] {
  // Proof: bypassing this wrapper made the exact production relationships command fail
  // with SQLITE_READONLY_DIRECTORY 1544 after clean WAL close and with retained WAL.
  return [
    'bun',
    '-e',
    `import { copyFileSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const source = process.env.DB_PATH;
if (!source) throw new Error('DB_PATH must be set');
const scratch = mkdtempSync(join(tmpdir(), 'wbs-stored-probe-'));
const destination = join(scratch, 'wbs.db');
try {
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  for (const suffix of ['-wal', '-journal']) {
    try { copyFileSync(source + suffix, destination + suffix, constants.COPYFILE_EXCL); }
    catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
    }
  }
  const command = process.argv.slice(1);
  const child = Bun.spawnSync(command, { env: { ...process.env, DB_PATH: destination }, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) throw new Error('stored snapshot command failed: ' + new TextDecoder().decode(child.stderr));
  process.stdout.write(child.stdout);
} finally { rmSync(scratch, { recursive: true }); }`,
    ...command,
  ];
}
