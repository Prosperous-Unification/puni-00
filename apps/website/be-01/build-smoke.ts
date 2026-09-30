import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';

const directory = mkdtempSync(join(tmpdir(), 'puni-retention-build-'));
try {
  const bundle = join(directory, 'bundle');
  cpSync(join(import.meta.dir, 'dist'), bundle, { recursive: true });
  const databasePath = join(directory, 'website.sqlite');
  const store = new WebsiteStore(databasePath);
  store.createDraft('expired', 'private description', 'private claim', 1, 2);
  store.close();
  const command = Bun.spawnSync(
    ['bun', join(bundle, 'draft-retention-cli.js'), 'inspect', databasePath],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (command.exitCode !== 0) throw new Error(new TextDecoder().decode(command.stderr));
  const plan = JSON.parse(new TextDecoder().decode(command.stdout)) as {
    eligibleDrafts: number;
    fingerprint: string;
  };
  if (plan.eligibleDrafts !== 1 || !/^[a-f0-9]{64}$/.test(plan.fingerprint))
    throw new Error('Bundled retention command returned the wrong plan');
  const report = Bun.spawnSync(
    ['bun', join(bundle, 'request-retention-cli.js'), 'report', databasePath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (report.exitCode !== 0) throw new Error(new TextDecoder().decode(report.stderr));
  const counts = JSON.parse(new TextDecoder().decode(report.stdout)) as {
    deletion: string;
    activation: string;
  };
  if (counts.deletion !== 'disabled' || counts.activation !== 'ready')
    throw new Error('Bundled request retention report returned the wrong state');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
