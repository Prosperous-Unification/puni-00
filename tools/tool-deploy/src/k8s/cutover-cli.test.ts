import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import type { SqliteReport } from './cutover';
import { main, restoreJob } from './cutover-cli';
import { renderDescriptor, sealDescriptor } from './descriptor';
import { releaseIdOf } from './release';

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

  it('prints the release record the first F8 release will start from', async () => {
    const root = scratchSync('wbs-cutover-cli-');
    roots.push(root);
    const sourceSha = 'a'.repeat(40);
    const images = {
      backend: `registry.example/wbs-be-01@sha256:${'1'.repeat(64)}`,
      gateway: `registry.example/wbs-gw-01@sha256:${'2'.repeat(64)}`,
      frontend: `registry.example/wbs-fe-01@sha256:${'3'.repeat(64)}`,
      mcp: `registry.example/wbs-mcp-01@sha256:${'4'.repeat(64)}`,
    };
    const descriptor = sealDescriptor(
      { schemaVersion: 1, sourceSha, images, gateRunId: 7 },
      {
        schemaVersion: 1,
        sourceSha,
        package: {
          name: 'twilight-burokrat',
          version: '0.1.0',
          integrity: `sha512-${'c'.repeat(86)}==`,
          toolkitIdentity: 'd'.repeat(64),
        },
        activation: { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) },
      },
      {
        id: 7,
        head_sha: sourceSha,
        path: '.github/workflows/ci.yml',
        event: 'push',
        head_branch: 'main',
        status: 'completed',
        conclusion: 'success',
        jobs: [
          { name: 'gate', conclusion: 'success' },
          { name: 'pixels', conclusion: 'success' },
        ],
      },
    );
    writeFileSync(join(root, 'descriptor.json'), renderDescriptor(descriptor));
    const record = JSON.parse(
      await main(['release-record', '--descriptor', join(root, 'descriptor.json')]),
    ) as { metadata: { name: string; namespace: string }; data: Record<string, string> };
    expect(record.metadata).toEqual({ name: 'wbs-release', namespace: 'wbs-solver' });
    expect(record.data['releaseId']).toBe(releaseIdOf({ sourceSha, images }));
    expect(record.data['sourceSha']).toBe(sourceSha);
    expect(JSON.parse(record.data['images'])).toEqual(images);
  });
});
