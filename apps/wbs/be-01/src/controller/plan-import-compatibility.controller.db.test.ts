import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, expect, test } from 'bun:test';

import { connectedTransferFixture, transferSnapshot } from '../testing/connected-transfer-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function openHarness() {
  harness = OrganizationHarness.openComposedWith({});
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', [
    'organization.create_project',
    'organization.manage_directory',
  ]);
  harness.bind('ada', 'org-a');
  harness.activate();
}

function readAddress(workPackageId: string) {
  const stored = harness.sqlite
    .query<{ abbreviation: string; namespace: string }, [string]>(
      'SELECT abbreviation,namespace FROM work_package_abbreviation WHERE work_package_id=?',
    )
    .get(workPackageId);
  if (stored === null) throw new Error('work package abbreviation missing');
  return stored;
}

async function exportDocument(workPackageId: string) {
  const exported = await harness.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackageId}/export?format=json`,
  );
  expect(exported.status).toBe(200);
  return exported.body as Record<string, unknown>;
}

/** Proof: ignoring occupied abbreviations made this mounted import refuse with 409. */
test('outgoing-only downloaded v12 imports with a distinct destination abbreviation', async () => {
  harness = OrganizationHarness.openComposedWith({});
  const { source, downstream } = await connectedTransferFixture(harness);
  harness.sqlite
    .query('DELETE FROM external_dependency WHERE successor_work_package_id=?')
    .run(source.workPackageId);
  const original = readAddress(source.workPackageId);
  const downloaded = await exportDocument(source.workPackageId);
  const outgoing: unknown = expect.arrayContaining([
    expect.objectContaining({ id: 'outgoing', workPackageId: downstream.workPackageId }),
  ]);
  expect(downloaded).toMatchObject({
    document: { version: 12 },
    workPackage: { id: source.workPackageId, abbreviation: original.abbreviation },
    connected: {
      relationships: outgoing,
    },
  });
  expect(downloaded['typedDependencies']).toHaveLength(1);
  const external = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  const imported = await harness.call('ada', 'POST', '/api/work-packages/import', downloaded);
  expect(imported.status).toBe(201);
  const summary = imported.body as { workPackageId: string; rows: number };
  expect(summary.rows).toBe(3);
  expect(summary.workPackageId).not.toBe(source.workPackageId);
  expect(readAddress(source.workPackageId)).toEqual(original);
  expect(readAddress(summary.workPackageId).namespace).toBe('org:org-a');
  expect(readAddress(summary.workPackageId).abbreviation).not.toBe(original.abbreviation);
  expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
    external,
  );
  const reexported = await exportDocument(summary.workPackageId);
  expect(reexported).toMatchObject({ settings: { name: 'Source' } });
  expect(reexported['typedDependencies']).toHaveLength(1);
});

/** Proof: bypassing the version fence admitted the unsupported next version and misclassified its malformed variant. */
test.each([false, true])(
  'unsupported v13 (malformed content: %s) refuses exactly without writes',
  async (malformed) => {
    await openHarness();
    const seeded = await harness.call(
      'ada',
      'POST',
      '/api/work-packages/import',
      planDocumentFixture(),
    );
    expect(seeded.status).toBe(201);
    const summary = seeded.body as { workPackageId: string };
    const downloaded = (await exportDocument(summary.workPackageId)) as {
      document: { version: number };
      workItems: Record<string, unknown>[];
    };
    downloaded.document.version = 13;
    if (malformed) Reflect.set(downloaded.workItems[0] ?? {}, 'priority', 'invalid-future-value');
    const before = transferSnapshot(harness);
    const refused = await harness.call('ada', 'POST', '/api/work-packages/import', downloaded);
    expect(refused).toEqual({
      status: 400,
      body: { error: 'unsupported_version', path: 'document.version', detail: null },
    });
    expect(transferSnapshot(harness)).toEqual(before);
  },
);

/** Proof: forcing imported depReach to whole-item failed the anchor-slice stored assertion. */
test.each([1, 2, 3])(
  'legacy v%i retains reach through mounted import and re-export',
  async (version) => {
    await openHarness();
    const downloaded = planDocumentFixture();
    downloaded.document.version = version;
    downloaded.settings.depReach = 'anchor-slice';
    if (version === 1)
      for (const step of downloaded.steps) Reflect.deleteProperty(step, 'allowancePercent');
    const imported = await harness.call('ada', 'POST', '/api/work-packages/import', downloaded);
    expect(imported.status).toBe(201);
    const summary = imported.body as { workPackageId: string };
    const stored = harness.sqlite
      .query<{ dep_reach: string }, [string]>('SELECT dep_reach FROM work_package WHERE id=?')
      .get(summary.workPackageId);
    expect(stored).toEqual({ dep_reach: 'anchor-slice' });
    expect(await exportDocument(summary.workPackageId)).toMatchObject({
      settings: { depReach: 'anchor-slice' },
    });
  },
);
