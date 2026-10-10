import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { S3StandIn, WebsiteStore } from '@website/store-sqlite';

const directory = mkdtempSync(join(tmpdir(), 'puni-retention-build-'));
try {
  const bundle = join(directory, 'bundle');
  cpSync(join(import.meta.dir, 'dist'), bundle, { recursive: true });
  const databasePath = join(directory, 'website.sqlite');
  const store = new WebsiteStore(databasePath);
  store.createDraft('expired', 'private description', 'private claim', 1, 2, 'source-test');
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
  const capabilities: unknown = JSON.parse(readFileSync(join(bundle, 'capabilities.json'), 'utf8'));
  if (JSON.stringify(capabilities) !== JSON.stringify(['retention-journal/1']))
    throw new Error('Bundled capabilities.json lacks retention-journal/1');
  // The bundled journal commands against a local S3 stand-in (dummy credentials, loopback only).
  const standIn = new S3StandIn('journal-smoke');
  try {
    const journalEnvironment = {
      ...process.env,
      S3_ENDPOINT: standIn.endpoint,
      S3_REGION: 'local',
      S3_ACCESS_KEY_ID: 'smoke-access-key',
      S3_SECRET_ACCESS_KEY: 'smoke-secret-key',
      RETENTION_JOURNAL_BUCKET: 'journal-smoke',
      RETENTION_JOURNAL_PREFIX: 'retention-journal/website-smoke/',
      RETENTION_WRITER_RELEASE: 'build-smoke',
      RETENTION_WRITER_REVISION: 'build-smoke',
    };
    const journal = async (...arguments_: string[]) => {
      const child = Bun.spawn(['bun', join(bundle, 'request-retention-cli.js'), ...arguments_], {
        env: journalEnvironment,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const exitCode = await child.exited;
      if (exitCode !== 0) throw new Error(await new Response(child.stderr).text());
      return JSON.parse(await new Response(child.stdout).text()) as Record<string, unknown>;
    };
    const { journalId } = await journal('journal-init', databasePath);
    if (typeof journalId !== 'string') throw new Error('journal-init printed no journal id');
    Object.assign(journalEnvironment, { RETENTION_JOURNAL: 's3', RETENTION_JOURNAL_ID: journalId });
    const status = await journal('journal-status', databasePath);
    if (status['state'] !== 'attached' || status['headSequence'] !== 0)
      throw new Error('Bundled journal-status returned the wrong position');
  } finally {
    await standIn.stop();
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
