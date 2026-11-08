import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { exportArgv, type SqliteReport } from './cutover';
import { main, restoreJob } from './cutover-cli';
import {
  fixtureBackend,
  fixtureCutoverIdentity,
  fixtureDescriptorBytes,
  fixtureOldBackend,
} from './cutover-replay.fixture';
import { renderDescriptor, sealDescriptor } from './descriptor';
import { sha256Of } from './migration-capture';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const exported: SqliteReport = {
  replay: {
    ...fixtureCutoverIdentity(),
    version: 1,
    inventory: [],
    capabilities: [],
    exportSha256: 'c'.repeat(64),
  },
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
    const job = restoreJob(
      fixtureBackend,
      exported,
      'wbs-cutover-restore',
      fixtureCutoverIdentity(),
    );
    const text = JSON.stringify(job);
    expect(text).toContain('"puni.dev/writer":"true"');
    expect(text).toContain(`"PUNI_EXPORT_SHA256","value":"${'c'.repeat(64)}"`);
    expect(text).toContain('"backoffLimit":0');
  });

  it('refuses a restore report that does not match the export', async () => {
    const root = scratchSync('wbs-cutover-cli-');
    roots.push(root);
    writeFileSync(join(root, 'export-report.json'), JSON.stringify(exported));
    writeFileSync(join(root, 'descriptor.json'), fixtureDescriptorBytes);
    const restored = {
      ...exported,
      path: '/data/wbs.sqlite',
      ownerUid: 10001,
      counts: { project: 0 },
    };
    writeFileSync(join(root, 'logs'), `PUNI_SQLITE_REPORT ${JSON.stringify(restored)}\n`);
    const outcome = await main([
      'verify-restore',
      '--descriptor',
      join(root, 'descriptor.json'),
      '--descriptor-sha256',
      sha256Of(fixtureDescriptorBytes),
      '--old-image',
      fixtureOldBackend,
      '--image',
      fixtureBackend,
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

  it('refuses descriptor-only release records before first-start admission', async () => {
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
    const refusal = await main([
      'release-record',
      '--descriptor',
      join(root, 'descriptor.json'),
    ]).then(
      () => '',
      (cause: unknown) => String(cause),
    );
    expect(refusal).toContain('first-start');
  });
});

for (const fault of [
  'none',
  'legacy-export',
  'bad-version',
  'bad-inventory',
  'bad-row',
  'bad-unknown-kind',
  'bad-duplicate-kind',
  'bad-array',
  'bad-capabilities',
  'legacy-restore',
  'foreign-descriptor',
  'changed-export',
  'changed-replay',
] as const) {
  it(`requires matching descriptor and replay evidence for verify-restore: ${fault}`, async () => {
    const root = scratchSync('cutover-verify-replay-');
    roots.push(root);
    const before = { ...exported };
    const after = { ...exported, path: '/data/wbs.sqlite', ownerUid: 10001 };
    if (fault === 'legacy-export') delete before.replay;
    if (fault === 'bad-version') before.replay = { ...(exported.replay as object), version: 2 };
    if (fault === 'bad-row') before.replay = { ...(exported.replay as object), inventory: [null] };
    if (fault === 'bad-array') before.replay = { ...(exported.replay as object), inventory: {} };
    if (fault === 'bad-unknown-kind')
      before.replay = { ...(exported.replay as object), inventory: [{ kind: 'future', count: 1 }] };
    if (fault === 'bad-duplicate-kind')
      before.replay = {
        ...(exported.replay as object),
        capabilities: ['move_progress_v1'],
        inventory: [
          { kind: 'move_progress_v1', count: 1 },
          { kind: 'move_progress_v1', count: 1 },
        ],
      };
    if (fault === 'bad-inventory')
      before.replay = {
        ...(exported.replay as object),
        inventory: [{ kind: 'move_progress_v1', count: 0 }],
      };
    if (fault === 'bad-capabilities')
      before.replay = { ...(exported.replay as object), capabilities: [3] };
    if (fault === 'legacy-restore') delete after.replay;
    if (fault === 'changed-replay')
      after.replay = { ...(exported.replay as object), capabilities: ['replace_blockage'] };
    if (fault === 'changed-export') after.sha256 = 'd'.repeat(64);
    writeFileSync(join(root, 'export.json'), JSON.stringify(before));
    writeFileSync(join(root, 'restore.log'), `PUNI_SQLITE_REPORT ${JSON.stringify(after)}`);
    writeFileSync(join(root, 'descriptor.json'), fixtureDescriptorBytes);
    const outcome = await main([
      'verify-restore',
      '--export-report',
      join(root, 'export.json'),
      '--logs',
      join(root, 'restore.log'),
      '--descriptor',
      join(root, 'descriptor.json'),
      '--descriptor-sha256',
      fault === 'foreign-descriptor' ? 'f'.repeat(64) : sha256Of(fixtureDescriptorBytes),
      '--old-image',
      fixtureOldBackend,
      '--image',
      fixtureBackend,
    ]).then(
      (text) => text,
      (error: unknown) => String(error),
    );
    expect(outcome).toContain(
      fault === 'changed-replay'
        ? 'restored cutover replay evidence differs'
        : fault === 'bad-version'
          ? 'foreign version'
          : fault === 'bad-capabilities' || fault === 'bad-array'
            ? 'observation is malformed'
            : fault.startsWith('bad-')
              ? 'inventory is malformed'
              : fault === 'none'
                ? 'restore matches'
                : fault.startsWith('legacy')
                  ? 'legacy cutover report'
                  : fault === 'foreign-descriptor'
                    ? 'original SHA-256'
                    : 'does not match',
    );
  });
}

it('prepares every Deployment at zero and refuses manifests without the backend', async () => {
  const { prepareCutoverManifests } = await import('./cutover-cli');
  const rendered =
    'kind: Deployment\nmetadata:\n  name: wbs-backend\nspec:\n  replicas: 1\n---\nkind: Deployment\nmetadata:\n  name: wbs-gateway\nspec:\n  replicas: 1\n';
  const prepared = JSON.parse(prepareCutoverManifests(rendered)) as {
    items: { spec: { replicas: number } }[];
  };
  expect(prepared.items.map((entry) => entry.spec.replicas)).toEqual([0, 0]);
  expect(() =>
    prepareCutoverManifests(
      rendered + '---\nkind: Deployment\nmetadata:\n  name: wbs-backend\nspec:\n  replicas: 1\n',
    ),
  ).toThrow('one backend');
  expect(() => prepareCutoverManifests('foo: [')).toThrow('manifest is malformed');
  expect(() => prepareCutoverManifests('null')).toThrow('manifest is malformed');
  expect(() =>
    prepareCutoverManifests('kind: Deployment\nmetadata:\n  name: wbs-backend\n'),
  ).toThrow('no spec or metadata');
  expect(() => prepareCutoverManifests('kind: ConfigMap\nmetadata:\n  name: unrelated\n')).toThrow(
    'one backend',
  );
});

it('refuses legacy restore inputs before rendering a Job', () => {
  expect(() => restoreJob(fixtureBackend, exported)).toThrow('descriptor-bound');
  expect(() =>
    restoreJob(fixtureOldBackend, exported, 'foreign', fixtureCutoverIdentity()),
  ).toThrow('descriptor-bound');
  expect(() => exportArgv(fixtureOldBackend, '/data', 'wbs.db', '/export', [])).toThrow(
    'cutover identity is required',
  );
  expect(() =>
    exportArgv(fixtureBackend, '/data', 'wbs.db', '/export', [], fixtureCutoverIdentity()),
  ).toThrow('old backend');
  expect(() =>
    restoreJob(
      fixtureBackend,
      { ...exported, replay: undefined },
      'legacy',
      fixtureCutoverIdentity(),
    ),
  ).toThrow('legacy cutover report');
});

it('routes release-manifests through zero-replica cutover preparation', async () => {
  const root = scratchSync('cutover-preparation-cli-');
  roots.push(root);
  const descriptor = join(root, 'descriptor.json');
  writeFileSync(descriptor, fixtureDescriptorBytes);
  const kubectl = join(root, 'kubectl');
  const rendered = 'kind: Deployment\nmetadata:\n  name: wbs-backend\nspec:\n  replicas: 1\n';
  writeFileSync(kubectl, `#!/usr/bin/env bun\nconsole.log(${JSON.stringify(rendered)});\n`);
  chmodSync(kubectl, 0o755);
  const prepared = JSON.parse(
    await main([
      'release-manifests',
      '--descriptor',
      descriptor,
      '--environment',
      'prod',
      '--kubectl',
      kubectl,
    ]),
  ) as { items: { spec: { replicas: number } }[] };
  expect(prepared.items.map((deployment) => deployment.spec.replicas)).toEqual([0]);
});

for (const malformed of [
  { counts: null },
  { known: null },
  { counts: [] },
  { known: { row: 'yes' } },
  { migrations: [1] },
  { integrity: [1] },
  { foreignKeyViolations: -1 },
  { ownerUid: 1.5 },
  { sha256: 'not-a-digest' },
]) {
  it(`refuses malformed trusted SQLite report ${JSON.stringify(malformed)}`, async () => {
    const root = scratchSync('cutover-malformed-report-');
    roots.push(root);
    const report = { ...exported, ...malformed };
    writeFileSync(join(root, 'export.json'), JSON.stringify(report));
    writeFileSync(
      join(root, 'restore.log'),
      `PUNI_SQLITE_REPORT ${JSON.stringify({ ...report, ownerUid: 10001 })}`,
    );
    writeFileSync(join(root, 'descriptor.json'), fixtureDescriptorBytes);
    const outcome = await main([
      'verify-restore',
      '--export-report',
      join(root, 'export.json'),
      '--logs',
      join(root, 'restore.log'),
      '--descriptor',
      join(root, 'descriptor.json'),
      '--descriptor-sha256',
      sha256Of(fixtureDescriptorBytes),
      '--old-image',
      fixtureOldBackend,
      '--image',
      fixtureBackend,
    ]).then(
      (text) => text,
      (error: unknown) => String(error),
    );
    expect(outcome).toContain('malformed SQLite report');
  });
}
