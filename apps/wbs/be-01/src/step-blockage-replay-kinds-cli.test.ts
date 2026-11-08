import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

test('reports replay capabilities without loading the application barrel', () => {
  const directory = mkdtempSync(join(tmpdir(), 'replay-capabilities-'));
  try {
    copyFileSync(
      join(import.meta.dir, 'step-blockage-replay-kinds-cli.ts'),
      join(directory, 'cli.ts'),
    );
    writeFileSync(
      join(directory, 'barrel.ts'),
      "export const STEP_BLOCKAGE_REPLAY_CAPABILITIES = []; throw new Error('application barrel loaded');\n",
    );
    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@wbs/core': ['./barrel.ts'],
            '@wbs/core/*': [
              resolve(import.meta.dir, '../../../../libs/wbs/application/core/src/*'),
            ],
          },
        },
      }),
    );
    const execution = Bun.spawnSync([process.execPath, 'run', 'cli.ts'], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(execution.stderr.toString()).toBe('');
    expect(execution.exitCode).toBe(0);
    // Proof: deleting delete_state_v1 from the production leaf fails this subprocess output check.
    expect(JSON.parse(execution.stdout.toString())).toEqual([
      'replace_blockage',
      'move_progress_v1',
      'delete_state_v1',
      'step_blockage_activation_v1',
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
