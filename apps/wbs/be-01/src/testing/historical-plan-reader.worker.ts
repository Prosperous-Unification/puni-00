import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_DOCUMENT_VERSION } from '@wbs/contracts';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';

import { OrganizationHarness } from './organization-harness';

const artifactPath = process.argv.at(2);
if (artifactPath === undefined) throw new Error('downloaded plan artifact path is required');
const downloaded: unknown = await Bun.file(artifactPath).json();
assert.equal(PLAN_DOCUMENT_VERSION, 10);
const archiveRoot = resolve(import.meta.dir, '../../../../..');
for (const alias of ['@wbs/contracts', '@wbs/core/testing/plan-document-fixture']) {
  assert.ok(fileURLToPath(import.meta.resolve(alias)).startsWith(`${archiveRoot}/libs/`));
}
const pushes: unknown[] = [];
const harness = OrganizationHarness.openComposedWith({
  pushFetch: (_url, request) => {
    pushes.push(request?.body);
    return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
  },
});

/** Includes every authored, history, event, sequence and directory table, including WITHOUT ROWID. */
function snapshotStore() {
  return harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: harness.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}

try {
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  const legacy = planDocumentFixture();
  const imported = await harness.call('ada', 'POST', '/api/projects/import', legacy);
  assert.equal(imported.status, 201, JSON.stringify(imported));
  assert.ok(typeof imported.body === 'object' && imported.body !== null);
  const projectId: unknown = Reflect.get(imported.body, 'projectId');
  assert.equal(typeof projectId, 'string');
  const exported = await harness.call(
    'ada',
    'GET',
    `/api/projects/${String(projectId)}/export?format=json`,
  );
  assert.equal(exported.status, 200);
  assert.ok(typeof exported.body === 'object' && exported.body !== null);
  const header: unknown = Reflect.get(exported.body, 'document');
  assert.ok(typeof header === 'object' && header !== null);
  assert.equal(Reflect.get(header, 'version'), 10);
  const reimported = await harness.call('ada', 'POST', '/api/projects/import', exported.body);
  assert.equal(reimported.status, 201, JSON.stringify(reimported));
  assert.equal(harness.sqlite.query('SELECT id FROM project').all().length, 2);
  const content = process.argv.at(3);
  assert.ok(content === 'valid' || content === 'malformed');
  {
    const document: unknown = structuredClone(downloaded);
    if (content === 'malformed') {
      assert.ok(typeof document === 'object' && document !== null);
      Reflect.set(document, 'workItems', 'invalid-future-content');
    }
    const before = snapshotStore();
    const beforePushes = structuredClone(pushes);
    const refused = await harness.call('ada', 'POST', '/api/projects/import', document);
    assert.deepEqual(refused, {
      status: 400,
      body: { error: 'unsupported_version', path: 'document.version', detail: null },
    });
    assert.deepEqual(snapshotStore(), before);
    assert.deepEqual(pushes, beforePushes);
  }
  console.log('historical reader: v10 imported; v11 refused without writes or pushes');
} finally {
  await harness.closeComposed();
}
