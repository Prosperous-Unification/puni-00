import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import type { SqliteReport } from './cutover';
import { main, restoreJob } from './cutover-cli';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const exported: SqliteReport = {
  path: '/export/wbs-export.sqlite',
  integrity: ['ok'],
  foreignKeyViolations: 0,
  migrations: ['m1'],
  counts: { project: 1 },
  known: { 'known-row': true },
  sha256: 'c'.repeat(64),
  ownerUid: 0,
};

describe('cutover-cli', () => {
  it('renders the fenced production site from the real template', async () => {
    const site = await main([
      'fenced-site',
      '--site',
      'wbs.bulletpoints.club',
      '--backend',
      'be-01-blue:3100',
      '--frontend',
      'fe-01-blue:80',
    ]);
    expect(site).toStartWith('wbs.bulletpoints.club {');
    expect(site).toContain('respond @write "WBS is moving; writes are closed" 503');
    expect(site).toContain('import access-log');
  });

  it('builds a writer-labelled restore Job bound to the export digest', () => {
    const job = restoreJob('registry.example/wbs-be-01@sha256:' + '1'.repeat(64), exported);
    const text = JSON.stringify(job);
    expect(text).toContain('"puni.dev/writer":"true"');
    expect(text).toContain(`"PUNI_EXPORT_SHA256","value":"${'c'.repeat(64)}"`);
    expect(text).toContain('"backoffLimit":0');
  });

  it('refuses a restore report that does not match the export', async () => {
    const root = scratchSync('wbs-cutover-cli-');
    roots.push(root);
    writeFileSync(join(root, 'export-report.json'), JSON.stringify(exported));
    const restored = {
      ...exported,
      path: '/data/wbs.sqlite',
      ownerUid: 10001,
      counts: { project: 0 },
    };
    writeFileSync(join(root, 'logs'), `PUNI_SQLITE_REPORT ${JSON.stringify(restored)}\n`);
    const outcome = await main([
      'verify-restore',
      '--export-report',
      join(root, 'export-report.json'),
      '--logs',
      join(root, 'logs'),
    ]).then(
      (text) => text,
      (e: unknown) => String(e),
    );
    expect(outcome).toContain('row counts');
  });
});
