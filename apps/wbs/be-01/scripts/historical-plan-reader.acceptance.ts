import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { connectedTransferFixture } from '../src/testing/connected-transfer-fixture';
import { OrganizationHarness } from '../src/testing/organization-harness';

const HISTORICAL_READER = '937da8cb59cec1edbcd7a9eb22fe420f6ff8e264';
const REPOSITORY = resolve(import.meta.dir, '../../../..');

let harness: OrganizationHarness | undefined;
let archiveDirectory: string | undefined;
afterEach(async () => {
  await harness?.closeComposed();
  harness = undefined;
  if (archiveDirectory !== undefined) rmSync(archiveDirectory, { recursive: true });
  archiveDirectory = undefined;
});

function runCommand(command: string[], cwd: string) {
  const child = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0)
    throw new Error(`${command.join(' ')} failed: ${child.stderr.toString()}`);
  return child.stdout.toString();
}

/**
 * Exercises the actual pre-v11 reader with its own contracts and path aliases.
 * Proof: admitting v11 through the archived reader's version fence failed both
 * cases: invalid_typed_dependency for connected content and invalid_body for
 * malformed workItems replaced the required unsupported_version refusal.
 */
test.each([false, true])(
  'pinned pre-v11 reader refuses downloaded v11 (malformed: %s) without writes',
  async (malformed) => {
    harness = OrganizationHarness.openComposedWith({});
    const { source } = await connectedTransferFixture(harness);
    const downloaded = await harness.call(
      'ada',
      'GET',
      `/api/projects/${source.projectId}/export?format=json`,
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.body).toMatchObject({
      document: { version: 11 },
      connected: { kind: 'connected' },
    });

    archiveDirectory = mkdtempSync(join(tmpdir(), 'wbs-historical-reader-'));
    const archivePath = join(archiveDirectory, 'reader.tar');
    runCommand(
      ['git', 'archive', '--format=tar', `--output=${archivePath}`, HISTORICAL_READER],
      REPOSITORY,
    );
    runCommand(['tar', '-xf', archivePath, '-C', archiveDirectory], REPOSITORY);
    // A shared install is valid only for the exact historical dependency identities.
    expect(await Bun.file(join(archiveDirectory, 'bun.lock')).text()).toBe(
      await Bun.file(join(REPOSITORY, 'bun.lock')).text(),
    );
    symlinkSync(join(REPOSITORY, 'node_modules'), join(archiveDirectory, 'node_modules'));
    const artifactPath = join(archiveDirectory, 'downloaded-v11.json');
    await Bun.write(artifactPath, JSON.stringify(downloaded.body));
    const workerPath = 'apps/wbs/be-01/src/testing/historical-plan-reader.worker.ts';
    copyFileSync(join(REPOSITORY, workerPath), join(archiveDirectory, workerPath));
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        join(archiveDirectory, workerPath),
        artifactPath,
        malformed ? 'malformed' : 'valid',
      ],
      {
        cwd: dirname(join(archiveDirectory, 'apps/wbs/be-01/project.json')),
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(45_000),
      },
    );
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
    expect(stdout).toContain(
      'historical reader: v10 imported; v11 refused without writes or pushes',
    );
  },
  60_000,
);
