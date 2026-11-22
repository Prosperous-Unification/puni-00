import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { resourceRuntimeEvent } from '@wbs/contracts';
import { resourceUseActorOf } from '@wbs/core/http/resource-use.routes';
import { openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';

import { grantCredential } from '../testing/machine-credential-fixture';
import { callForwarded as forward, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { migrateRenamedRuntimeCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

interface CapturedRequest extends Record<string, unknown> {
  eventId: string;
  useId: string;
  use: Record<string, unknown>;
}
interface Capture {
  scope: { organizationId: string; projectId: string; workItemId: string; resourceId: string };
  ownerId: string;
  manual: {
    request: Record<string, unknown>;
    eventRequest: Record<string, unknown>;
    eventResponse: { body: { use: Record<string, unknown> } };
    response: {
      body: { use: { id: string; projectName: string; createdBy: string; updatedBy: string } };
    };
  };
  runtime: {
    authorityId: string;
    credentialId: string;
    personId: string;
    admissions: {
      name: string;
      request: CapturedRequest;
      response: unknown;
      publication: CapturedRequest;
    }[];
    registered: { request: CapturedRequest; response: unknown };
    hostJobs: { linked: boolean; request: CapturedRequest; response: unknown }[];
  };
}
const fixtureRoot = new URL(
  '../../../../../openspec/changes/wbs-work-packages/fixtures/',
  import.meta.url,
);
const compressed = readFileSync(new URL('legacy-resource-database1.sqlite.gz', fixtureRoot));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
if (hash(compressed) !== '2f7b2f5d842f5c260a7481a61472deb50a540d841e11d70c5a0723b384dacd2d')
  throw new Error('original resource database fixture changed');
const originalSnapshot = gunzipSync(compressed);
if (hash(originalSnapshot) !== '18b7ce2e8b51d409c295631a56a6e0e2d7836731574a0a7c11160868a8b46b7c')
  throw new Error('original resource snapshot changed');
const captureBytes = readFileSync(new URL('legacy-resource-database1.txt', fixtureRoot), 'utf8');
if (hash(captureBytes) !== '3a747bbee51fba8131a66df82e135cfda5f0911bdf369abc552d8c907dad31a6')
  throw new Error('original resource capture changed');
// The exact captured source/output hashes pin this test fixture; actual current routes validate all requests.
const capture = JSON.parse(captureBytes) as Capture;
const cleanup = JSON.parse(
  readFileSync(new URL('legacy-resource-cleaned-capture.json', fixtureRoot), 'utf8'),
) as {
  originalSha256: string;
  snapshotSha256: string;
  compressedSha256: string;
  credentialOverlapUntil: number;
  runtime: {
    operation: string;
    useId: string;
    eventId: string;
    sequence: number;
    revision: number;
  }[];
  tables: { table: string; fields: string[]; rows: number; sha256: string }[];
};
const cleaned = readFileSync(new URL('legacy-resource-cleaned1.sqlite.gz', fixtureRoot));
const snapshot = gunzipSync(cleaned);
if (
  hash(originalSnapshot) !== cleanup.originalSha256 ||
  hash(cleaned) !== cleanup.compressedSha256 ||
  hash(snapshot) !== cleanup.snapshotSha256 ||
  !Number.isSafeInteger(cleanup.credentialOverlapUntil)
)
  throw new Error('outgoing resource cleanup capture changed');
const replayNow = () => Math.max(Date.now(), cleanup.credentialOverlapUntil + 1);
function callForwarded(
  harness: OrganizationHarness,
  key: string,
  method: string,
  path: string,
  body?: unknown,
) {
  return forward(harness, key, method, path, body, { now: replayNow() });
}
const firstSequence = Math.max(...cleanup.runtime.map((event) => event.sequence)) + 1;
let machineGrants: HarnessMachineGrants;
let opened: OrganizationHarness | undefined;
let runtimeKey: string;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
function requireHarness() {
  if (opened === undefined) throw new Error('resource fixture owner unavailable');
  return opened;
}
function readHistory() {
  const h = requireHarness();
  return Object.fromEntries(
    [
      'resource_use',
      'resource_use_event',
      'resource_authority',
      'resource_runtime_use',
      'resource_runtime_event',
      'resource_host_job',
      'resource_cleanup_request',
      'runtime_ledger',
    ].map((table) => [table, h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
beforeEach(async () => {
  opened = undefined;
  opened = OrganizationHarness.openComposedWith({
    machineGrants,
    now: replayNow,
    migrate: (path) => {
      writeFileSync(path, snapshot, { flag: 'wx' });
      migrateRenamedRuntimeCatalogueFixture(path);
    },
  });
  const h = requireHarness();
  await h.register('current-admin');
  h.member('org-a', 'current-admin', 'admin', ['org-admin']);
  h.bind('current-admin', 'org-a');
  const before = readHistory();
  const rotated = await h.call(
    'current-admin',
    'POST',
    '/api/organization/machine-credentials/' + capture.runtime.credentialId + '/rotate',
  );
  expect(rotated.status).toBe(201);
  expect(rotated.body).toMatchObject({ id: capture.runtime.credentialId });
  runtimeKey = (rotated.body as { key: string }).key;
  expect(typeof runtimeKey).toBe('string');
  // Rotation is legitimate current setup; its secret/audit effects are outside the replay no-effects baseline.
  deepStrictEqual(readHistory(), before);
});
afterEach(async () => {
  if (opened !== undefined) {
    await opened.closeComposed();
    opened = undefined;
  }
});
function readCurrentRequest(request: CapturedRequest) {
  return {
    ...request,
    use: Object.fromEntries(
      Object.entries(request.use).map(([key, value]) => [
        key === 'projectId' ? 'workPackageId' : key,
        value,
      ]),
    ),
  };
}
function publishEvent(request: unknown) {
  return callForwarded(
    requireHarness(),
    runtimeKey,
    'PUT',
    '/api/resource-authorities/' + capture.runtime.authorityId + '/events',
    request,
  );
}
test('migrated resource fixture keeps exact authority identity after real same-credential rotation', async () => {
  const before = readHistory();
  const answer = await callForwarded(
    requireHarness(),
    runtimeKey,
    'GET',
    '/api/resource-authorities/' + capture.runtime.authorityId + '/cleanup-requests',
  );
  expect(answer.status).toBe(200);
  deepStrictEqual(readHistory(), before);
});
test('migrated reported resource projection preserves original attribution under current owner names', async () => {
  const original = capture.manual.response.body.use;
  const answer = await requireHarness().call(
    'current-admin',
    'GET',
    '/api/work-packages/' + capture.scope.projectId + '/resource-uses',
  );
  expect(answer.status).toBe(200);
  const found = (answer.body as { uses: Record<string, unknown>[] }).uses.find(
    (use) => use['id'] === original.id,
  );
  expect(found).toMatchObject({
    id: original.id,
    workPackageId: capture.scope.projectId,
    workPackageName: original.projectName,
    createdBy: original.createdBy,
    updatedBy: original.updatedBy,
    state: 'cleanup_pending',
    revision: 2,
  });
  expect(found).not.toHaveProperty('projectId');
  expect(found).not.toHaveProperty('projectName');
});
test('migrated resource admission replay retains original identity without projection writes', async () => {
  const entry = capture.runtime.admissions.at(0);
  if (entry === undefined) throw new Error('original provisional admission absent');
  const before = readHistory();
  const answer = await callForwarded(
    requireHarness(),
    runtimeKey,
    'PUT',
    '/api/resource-authorities/' + capture.runtime.authorityId + '/admissions',
    readCurrentRequest(entry.request),
  );
  deepStrictEqual(answer, entry.response);
  deepStrictEqual(readHistory(), before);
});
test('migrated registered resource replay compares old ordered owner spelling and returns original receipt', async () => {
  const before = readHistory();
  deepStrictEqual(
    await publishEvent(readCurrentRequest(capture.runtime.registered.request)),
    capture.runtime.registered.response,
  );
  deepStrictEqual(readHistory(), before);
});
for (const linked of [false, true]) {
  test(
    'migrated ' + (linked ? 'linked' : 'unlinked') + ' host-job replay retains untagged identity',
    async () => {
      const entry = capture.runtime.hostJobs.find((job) => job.linked === linked);
      if (entry === undefined) throw new Error('original host-job witness absent');
      const before = readHistory();
      deepStrictEqual(await publishEvent(readCurrentRequest(entry.request)), entry.response);
      deepStrictEqual(readHistory(), before);
    },
  );
}
test('new resource runtime identity has explicit format2 even without an optional planning owner', async () => {
  const entry = capture.runtime.hostJobs.find((job) => !job.linked);
  if (entry === undefined) throw new Error('original unlinked host-job witness absent');
  const request = {
    ...readCurrentRequest(entry.request),
    eventId: 'current-event',
    sequence: firstSequence,
    useId: 'current-job',
    incarnation: 'current-incarnation',
  };
  expect((await publishEvent(request)).status).toBe(200);
  const fingerprint = requireHarness()
    .sqlite.query<{ fingerprint: string }, []>(
      "SELECT fingerprint FROM resource_runtime_event WHERE event_id='current-event'",
    )
    .get();
  if (fingerprint === null) throw new Error('new event was not retained');
  const retained = JSON.parse(fingerprint.fingerprint) as {
    schemaVersion?: number;
    event?: unknown;
  };
  expect(retained.schemaVersion).toBe(2);
  expect(retained.event).toEqual(request);
  const declaration = requireHarness()
    .sqlite.query<{ declaration: string }, [string]>(
      'SELECT declaration FROM resource_host_job WHERE use_id=?',
    )
    .get('current-job');
  if (declaration === null) throw new Error('current host-job declaration absent');
  expect(JSON.parse(declaration.declaration)).toEqual({ schemaVersion: 2, use: request.use });
  const host = request.use['host'];
  if (typeof host !== 'string') throw new Error('current host-job host absent');
  const returned = {
    ...request,
    eventId: 'current-job-return',
    sequence: firstSequence + 1,
    revision: 2,
    kind: 'release_verified',
    evidence: {
      digest: 'a'.repeat(64),
      locator: 'dash-host-job-run://' + host + '/current-job',
      disposition: 'returned',
      reclaimedBytes: null,
    },
  };
  const beforeChangedDeclaration = readHistory();
  expect(
    (
      await publishEvent({
        ...returned,
        use: { ...returned.use, label: 'changed-current-declaration-label' },
      })
    ).status,
  ).toBe(409);
  deepStrictEqual(readHistory(), beforeChangedDeclaration);
  expect((await publishEvent(returned)).status).toBe(200);
  expect(
    requireHarness()
      .sqlite.query<{ declaration: string }, [string]>(
        'SELECT declaration FROM resource_host_job WHERE use_id=?',
      )
      .get('current-job')?.declaration,
  ).toBe(declaration.declaration);
  const beforeChangedEvent = readHistory();
  expect((await publishEvent({ ...request, reason: 'changed-current-event-reason' })).status).toBe(
    409,
  );
  deepStrictEqual(readHistory(), beforeChangedEvent);
});
test('physical rename retains resource fingerprints, declarations and projections from the authorized cleanup capture', () => {
  const h = requireHarness();
  expect(cleanup.tables.map(({ table }) => table)).toEqual([
    'resource_use',
    'resource_use_event',
    'resource_runtime_use',
    'resource_runtime_event',
    'resource_host_job',
  ]);
  for (const { table, fields, rows, sha256 } of cleanup.tables) {
    const current = h.sqlite
      .query('SELECT ' + fields.join(',') + ' FROM ' + table + ' ORDER BY rowid')
      .all();
    expect(current).toHaveLength(rows);
    expect(hash(JSON.stringify(current))).toBe(sha256);
  }
});

test('current location migration refuses the untouched active resource capture atomically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-location-refusal-'));
  try {
    const path = join(directory, 'original.db');
    writeFileSync(path, originalSnapshot, { flag: 'wx' });
    let refusal: unknown;
    try {
      migrateRenamedRuntimeCatalogueFixture(path);
    } catch (error) {
      refusal = error;
    }
    if (!(refusal instanceof Error) || !(refusal.cause instanceof Error))
      throw new Error('actual location migration did not refuse the active snapshot', {
        cause: refusal,
      });
    expect(refusal.cause.message).toContain('unprovable lifecycle continuity');
    expect(refusal.cause.message).toContain(capture.runtime.admissions[0].request.useId);
    const database = openReadOnlyDatabase(path);
    try {
      expect(
        database.query("SELECT count(*) AS count FROM resource_use WHERE state='active'").get(),
      ).toEqual({ count: 3 });
      expect(
        database.query("SELECT name FROM sqlite_master WHERE name='resource_use_location'").get(),
      ).toBeNull();
      expect(
        database.query('SELECT name FROM __drizzle_migrations ORDER BY id DESC LIMIT 1').get(),
      ).toEqual({ name: '20261115130000_add_step_catalogue' });
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

for (const fault of [
  'whitespace',
  'duplicate',
  'unknown_tag',
  'null_tag',
  'mixed_owner',
] as const) {
  test(
    'migrated runtime identity refuses trusted ' + fault + ' bytes before replay effects',
    async () => {
      const h = requireHarness();
      const eventId = capture.runtime.registered.request.eventId;
      const row = h.sqlite
        .query<{ fingerprint: string }, [string]>(
          'SELECT fingerprint FROM resource_runtime_event WHERE event_id=?',
        )
        .get(eventId);
      if (row === null) throw new Error('captured runtime identity absent');
      const original = JSON.parse(row.fingerprint) as CapturedRequest;
      const fingerprint =
        fault === 'whitespace'
          ? row.fingerprint + '\n'
          : fault === 'duplicate'
            ? row.fingerprint.replace('{"eventId":', '{"eventId":"shadow","eventId":')
            : fault === 'unknown_tag'
              ? JSON.stringify({ schemaVersion: 999, event: readCurrentRequest(original) })
              : fault === 'null_tag'
                ? JSON.stringify({ schemaVersion: null, event: readCurrentRequest(original) })
                : JSON.stringify({
                    ...original,
                    use: { ...original.use, workPackageId: capture.scope.projectId },
                  });
      expect(fingerprint).not.toBe(row.fingerprint);
      h.sqlite
        .query('UPDATE resource_runtime_event SET fingerprint=? WHERE event_id=?')
        .run(fingerprint, eventId);
      const before = readHistory();
      expect(
        (await publishEvent(readCurrentRequest(capture.runtime.registered.request))).status,
      ).toBe(500);
      deepStrictEqual(readHistory(), before);
    },
  );
}

async function signInOriginalOwner() {
  const h = requireHarness();
  await h.signIn('owner');
  expect(h.userId('owner')).toBe(capture.ownerId);
  h.bind('owner', 'org-a');
}
function expectObservedUse(current: Record<string, unknown>, original: Record<string, unknown>) {
  for (const [key, value] of Object.entries(original))
    expect(
      current[
        key === 'projectId' ? 'workPackageId' : key === 'projectName' ? 'workPackageName' : key
      ],
    ).toEqual(value);
  expect(current).not.toHaveProperty('projectId');
  expect(current).not.toHaveProperty('projectName');
}
test('original manual actor retries return original registration and event observations after live name changes', async () => {
  await signInOriginalOwner();
  const h = requireHarness();
  h.sqlite
    .query('UPDATE work_package SET name=? WHERE id=?')
    .run('Different current live name', capture.scope.projectId);
  const before = readHistory();
  const path = '/api/work-packages/' + capture.scope.projectId + '/resource-uses';
  const registered = await h.call('owner', 'POST', path, capture.manual.request);
  expect(registered.status).toBe(201);
  expectObservedUse(
    (registered.body as { use: Record<string, unknown> }).use,
    capture.manual.response.body.use,
  );
  const replayed = await h.call(
    'owner',
    'POST',
    path + '/' + capture.manual.response.body.use.id + '/events',
    capture.manual.eventRequest,
  );
  expect(replayed.status).toBe(200);
  expectObservedUse(
    (replayed.body as { use: Record<string, unknown> }).use,
    capture.manual.eventResponse.body.use,
  );
  deepStrictEqual(readHistory(), before);
});
async function removePlanningRows() {
  const h = requireHarness();
  expect(
    (
      await h.call(
        'current-admin',
        'POST',
        '/api/work-packages/' + capture.scope.projectId + '/commands',
        { commands: [{ kind: 'deleteWorkItem', workItemId: capture.scope.workItemId }] },
      )
    ).status,
  ).toBe(200);
  h.sqlite
    .query('DELETE FROM work_package_access WHERE work_package_id=?')
    .run(capture.scope.projectId);
  h.sqlite
    .query('DELETE FROM work_package_step WHERE work_package_id=?')
    .run(capture.scope.projectId);
  h.sqlite.query('DELETE FROM work_package WHERE id=?').run(capture.scope.projectId);
}
for (const deleted of [false, true]) {
  test(
    'old provisional confirmation replay preserves ' +
      (deleted ? 'deleted' : 'live') +
      ' observations and newer cleanup without grant or planning lookup',
    async () => {
      const h = requireHarness();
      const entry = capture.runtime.admissions.at(deleted ? 1 : 0);
      if (entry === undefined) throw new Error('provisional witness absent');
      const prior = cleanup.runtime.find(
        (event) =>
          event.operation === 'confirmed' &&
          event.eventId === entry.publication.eventId &&
          event.useId === entry.request.useId,
      );
      if (prior === undefined) throw new Error('captured confirmation sequence absent');
      const retained = h.sqlite
        .query<{ revision: number }, [string]>('SELECT revision FROM resource_use WHERE id=?')
        .get(entry.request.useId);
      if (retained === null) throw new Error('retained resource use absent');
      const path =
        '/api/work-packages/' +
        capture.scope.projectId +
        '/resource-uses/' +
        entry.request.useId +
        '/events';
      expect(
        (
          await h.call('current-admin', 'POST', path, {
            eventId: 'operator-before-confirmation',
            kind: 'cleanup_requested',
            expectedRevision: retained.revision,
            reason: 'Newer operator intent',
          })
        ).status,
      ).toBe(200);
      if (deleted) {
        await removePlanningRows();
        const orphan = await h.call(
          'current-admin',
          'GET',
          '/api/work-packages/' + capture.scope.projectId + '/resource-uses',
        );
        expect(orphan.status).toBe(200);
        expect(
          (orphan.body as { uses: Record<string, unknown>[] }).uses.some(
            (use) => use['id'] === capture.manual.response.body.use.id,
          ),
        ).toBe(true);
      }
      const row = h.sqlite
        .query<{ snapshot: string; registration_response: string }, [string]>(
          'SELECT snapshot,registration_response FROM resource_use WHERE id=?',
        )
        .get(entry.request.useId);
      if (row === null) throw new Error('provisional projection absent');
      const observed = JSON.parse(row.snapshot) as Record<string, unknown>;
      const originalFingerprints = h.sqlite
        .query('SELECT id,fingerprint FROM resource_use_event WHERE use_id=? ORDER BY rowid')
        .all(entry.request.useId);
      h.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_access_grant');
      h.sqlite.run('ALTER TABLE work_package RENAME TO unavailable_work_package');
      const confirmation = { ...readCurrentRequest(entry.publication), sequence: prior.sequence };
      try {
        expect((await publishEvent(confirmation)).status).toBe(200);
      } finally {
        try {
          h.sqlite.run('ALTER TABLE unavailable_work_package RENAME TO work_package');
        } finally {
          h.sqlite.run('ALTER TABLE unavailable_access_grant RENAME TO access_grant');
        }
      }
      const changed = h.sqlite
        .query<{ snapshot: string; registration_response: string }, [string]>(
          'SELECT snapshot,registration_response FROM resource_use WHERE id=?',
        )
        .get(entry.request.useId);
      if (changed === null) throw new Error('confirmed projection absent');
      expect(changed).toEqual(row);
      const projected = JSON.parse(changed.snapshot) as Record<string, unknown>;
      expect(projected).toMatchObject({
        state: observed['state'],
        revision: observed['revision'],
        updatedBy: observed['updatedBy'],
        pendingCleanupRequest: true,
        runtimeRevision: 2,
      });
      deepStrictEqual(
        h.sqlite
          .query('SELECT id,fingerprint FROM resource_use_event WHERE use_id=? ORDER BY rowid')
          .all(entry.request.useId),
        originalFingerprints,
      );
      const stored = h.sqlite
        .query<{ declaration: string }, [string]>(
          'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
        )
        .get(entry.request.useId);
      if (stored === null) throw new Error('confirmed declaration absent');
      const beforeReplay = readHistory();
      expect((await publishEvent(confirmation)).status).toBe(200);
      deepStrictEqual(readHistory(), beforeReplay);
      expect(
        (
          await publishEvent({
            ...confirmation,
            eventId: 'following-current-declaration',
            sequence: firstSequence,
            revision: 3,
            kind: 'cleanup_pending',
          })
        ).status,
      ).toBe(200);
      expect(
        h.sqlite
          .query<{ declaration: string }, [string]>(
            'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
          )
          .get(entry.request.useId)?.declaration,
      ).toBe(stored.declaration);
    },
  );
  test(
    'old ' +
      (deleted ? 'deleted' : 'live') +
      ' runtime declaration accepts followup without rewriting original strings',
    async () => {
      const h = requireHarness();
      if (deleted) await removePlanningRows();
      const request = readCurrentRequest(capture.runtime.registered.request);
      const before = h.sqlite
        .query<{ declaration: string }, [string]>(
          'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
        )
        .get(request.useId);
      if (before === null) throw new Error('old declaration absent');
      const fingerprints = h.sqlite
        .query('SELECT event_id,fingerprint FROM resource_runtime_event ORDER BY rowid')
        .all();
      const followup = {
        ...request,
        eventId: 'legacy-followup',
        sequence: firstSequence,
        revision: 3,
        kind: 'cleanup_pending',
      };
      if (deleted) h.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_access_grant');
      try {
        expect((await publishEvent(followup)).status).toBe(200);
      } finally {
        if (deleted) h.sqlite.run('ALTER TABLE unavailable_access_grant RENAME TO access_grant');
      }
      expect(
        h.sqlite
          .query<{ declaration: string }, [string]>(
            'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
          )
          .get(request.useId)?.declaration,
      ).toBe(before.declaration);
      const after = h.sqlite
        .query('SELECT event_id,fingerprint FROM resource_runtime_event ORDER BY rowid')
        .all();
      deepStrictEqual(after.slice(0, fingerprints.length), fingerprints);
    },
  );
}
test('old live declaration still requires the actual credential grant before followup', async () => {
  const h = requireHarness();
  h.sqlite
    .query("DELETE FROM access_grant WHERE subject_kind='machine_credential' AND subject_id=?")
    .run(capture.runtime.credentialId);
  grantCredential(
    h.sqlite,
    'org-a',
    capture.runtime.credentialId,
    'package-viewer',
    'work_package',
    capture.scope.projectId,
  );
  const before = readHistory();
  const reply = await publishEvent({
    ...readCurrentRequest(capture.runtime.registered.request),
    eventId: 'forbidden-live-followup',
    sequence: firstSequence,
    revision: 3,
    kind: 'cleanup_pending',
  });
  expect(reply.status).toBe(403);
  expect(reply.body).toMatchObject({ error: 'forbidden', permission: 'package.write' });
  deepStrictEqual(readHistory(), before);
});
for (const scope of [
  'root_order',
  'use_order',
  'linked_owner_absent',
  'unlinked_owner_present',
] as const) {
  test(
    'old runtime replay preserves exact ' + scope + ' identity and refuses changed bytes',
    async () => {
      let request: ReturnType<typeof readCurrentRequest>;
      if (scope === 'root_order')
        request = Object.fromEntries(
          Object.entries(readCurrentRequest(capture.runtime.registered.request)).reverse(),
        ) as ReturnType<typeof readCurrentRequest>;
      else if (scope === 'use_order') {
        const original = readCurrentRequest(capture.runtime.registered.request);
        request = { ...original, use: Object.fromEntries(Object.entries(original.use).reverse()) };
      } else {
        const entry = capture.runtime.hostJobs.find(
          (job) => job.linked === (scope === 'linked_owner_absent'),
        );
        if (entry === undefined) throw new Error('host-job witness absent');
        const original = readCurrentRequest(entry.request);
        request = {
          ...original,
          use:
            scope === 'linked_owner_absent'
              ? Object.fromEntries(
                  Object.entries(original.use).filter(([key]) => key !== 'workPackageId'),
                )
              : { ...original.use, workPackageId: capture.scope.projectId },
        };
      }
      const before = readHistory();
      expect((await publishEvent(request)).status).toBe(409);
      deepStrictEqual(readHistory(), before);
    },
  );
}
test('new admission2 replays exactly and preserves its original current projection', async () => {
  const h = requireHarness();
  const entry = capture.runtime.admissions.at(0);
  if (entry === undefined) throw new Error('admission witness absent');
  const request = {
    ...readCurrentRequest(entry.request),
    eventId: 'new-admission',
    useId: 'new-admission-use',
    incarnation: 'new-admission-incarnation',
  };
  const path = '/api/resource-authorities/' + capture.runtime.authorityId + '/admissions';
  expect((await callForwarded(h, runtimeKey, 'PUT', path, request)).status).toBe(200);
  const saved = h.sqlite
    .query<{ fingerprint: string }, [string]>(
      'SELECT fingerprint FROM resource_use_event WHERE use_id=?',
    )
    .get(request.useId);
  if (saved === null) throw new Error('new admission identity absent');
  expect(JSON.parse(saved.fingerprint)).toEqual({
    schemaVersion: 2,
    authorityId: capture.runtime.authorityId,
    admission: request,
  });
  const before = readHistory();
  expect((await callForwarded(h, runtimeKey, 'PUT', path, request)).status).toBe(200);
  deepStrictEqual(readHistory(), before);
  expect(
    (
      await callForwarded(h, runtimeKey, 'PUT', path, {
        ...request,
        use: { ...request.use, locator: '/changed-current-admission-locator' },
      })
    ).status,
  ).toBe(409);
  deepStrictEqual(readHistory(), before);
});

/** Corrupts only this fixture's immutable fingerprint, restoring the exact SQL guard before production is invoked. */
function corruptAdmissionIdentity(useId: string, fingerprint: string) {
  const h = requireHarness();
  const trigger = h.sqlite
    .query<{ sql: string }, [string]>('SELECT sql FROM sqlite_master WHERE name=?')
    .get('resource_use_event_immutable_update');
  if (trigger === null) throw new Error('immutable history fixture guard absent');
  h.sqlite.run('DROP TRIGGER resource_use_event_immutable_update');
  try {
    h.sqlite
      .query('UPDATE resource_use_event SET fingerprint=? WHERE use_id=? AND revision=1')
      .run(fingerprint, useId);
  } finally {
    h.sqlite.run(trigger.sql);
  }
  expect(
    h.sqlite
      .query<{ sql: string }, [string]>('SELECT sql FROM sqlite_master WHERE name=?')
      .get('resource_use_event_immutable_update'),
  ).toEqual(trigger);
}
for (const tagged of [false, true]) {
  test(
    'resource admission rejects malformed ' +
      (tagged ? 'tagged2' : 'untagged1') +
      ' identity before original replay',
    async () => {
      const h = requireHarness();
      const entry = capture.runtime.admissions.at(0);
      if (entry === undefined) throw new Error('old admission witness absent');
      const row = h.sqlite
        .query<{ fingerprint: string }, [string]>(
          'SELECT fingerprint FROM resource_use_event WHERE use_id=? AND revision=1',
        )
        .get(entry.request.useId);
      if (row === null) throw new Error('old admission identity absent');
      const original = JSON.parse(row.fingerprint) as Record<string, unknown>;
      const invalid = tagged
        ? {
            schemaVersion: 999,
            authorityId: capture.runtime.authorityId,
            admission: readCurrentRequest(entry.request),
          }
        : { ...original, authorityId: null };
      corruptAdmissionIdentity(entry.request.useId, JSON.stringify(invalid));
      const before = readHistory();
      expect(
        (
          await callForwarded(
            h,
            runtimeKey,
            'PUT',
            '/api/resource-authorities/' + capture.runtime.authorityId + '/admissions',
            readCurrentRequest(entry.request),
          )
        ).status,
      ).toBe(500);
      deepStrictEqual(readHistory(), before);
    },
  );
  test(
    'resource declaration rejects malformed ' +
      (tagged ? 'tagged2' : 'untagged1') +
      ' identity before followup effects',
    async () => {
      const h = requireHarness();
      const request = readCurrentRequest(capture.runtime.registered.request);
      const row = h.sqlite
        .query<{ declaration: string }, [string]>(
          'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
        )
        .get(request.useId);
      if (row === null) throw new Error('old declaration absent');
      const original = JSON.parse(row.declaration) as Record<string, unknown>;
      const invalid = tagged
        ? { schemaVersion: 999, use: request.use }
        : { ...original, projectId: null };
      h.sqlite
        .query('UPDATE resource_runtime_use SET declaration=? WHERE use_id=?')
        .run(JSON.stringify(invalid), request.useId);
      const before = readHistory();
      expect(
        (
          await publishEvent({
            ...request,
            eventId: 'malformed-declaration-followup',
            sequence: firstSequence,
            revision: 3,
            kind: 'cleanup_pending',
          })
        ).status,
      ).toBe(500);
      deepStrictEqual(readHistory(), before);
    },
  );
}
for (const current of [false, true]) {
  test(
    'resource append refuses malformed ' +
      (current ? 'current' : 'historical') +
      ' projection before committing transition',
    async () => {
      const h = requireHarness();
      let useId: string;
      let expectedRevision: number;
      if (current) {
        const created = await h.call(
          'current-admin',
          'POST',
          '/api/work-packages/' + capture.scope.projectId + '/resource-uses',
          { ...capture.manual.request, requestId: 'current-invalid-projection' },
        );
        expect(created.status).toBe(201);
        useId = (created.body as { use: { id: string } }).use.id;
        expectedRevision = 1;
      } else {
        useId = capture.manual.response.body.use.id;
        expectedRevision = 2;
      }
      const row = h.sqlite
        .query<{ snapshot: string }, [string]>('SELECT snapshot FROM resource_use WHERE id=?')
        .get(useId);
      if (row === null) throw new Error('projection witness absent');
      const observed = JSON.parse(row.snapshot) as Record<string, unknown>;
      if (current) delete observed['workPackageName'];
      else observed['workPackageId'] = 'mixed-untrusted-owner';
      h.sqlite
        .query('UPDATE resource_use SET snapshot=? WHERE id=?')
        .run(JSON.stringify(observed), useId);
      const before = readHistory();
      expect(
        (
          await h.call(
            'current-admin',
            'POST',
            '/api/work-packages/' + capture.scope.projectId + '/resource-uses/' + useId + '/events',
            {
              eventId: 'invalid-projection-transition',
              kind: current ? 'cleanup_requested' : 'cleanup_blocked',
              expectedRevision,
              reason: 'Valid transition of malformed stored observation',
            },
          )
        ).status,
      ).toBe(500);
      deepStrictEqual(readHistory(), before);
    },
  );
}
for (const linked of [false, true]) {
  test(
    'old ' +
      (linked ? 'linked' : 'unlinked') +
      ' host-job declaration settles without grant or planning lookup',
    async () => {
      const h = requireHarness();
      const entry = capture.runtime.hostJobs.find((job) => job.linked === linked);
      if (entry === undefined) throw new Error('old host-job declaration witness absent');
      const request = readCurrentRequest(entry.request);
      const host = request.use['host'];
      if (typeof host !== 'string') throw new Error('old host-job host absent');
      const declaration = h.sqlite
        .query<{ declaration: string }, [string]>(
          'SELECT declaration FROM resource_host_job WHERE use_id=?',
        )
        .get(request.useId);
      if (declaration === null) throw new Error('old host-job declaration absent');
      const returned = {
        ...request,
        eventId: 'return-old-' + (linked ? 'linked' : 'unlinked') + '-job',
        sequence: firstSequence,
        revision: 2,
        kind: 'release_verified',
        evidence: {
          digest: 'a'.repeat(64),
          locator: 'dash-host-job-run://' + host + '/' + request.useId,
          disposition: 'returned',
          reclaimedBytes: null,
        },
      };
      h.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_access_grant');
      h.sqlite.run('ALTER TABLE work_package RENAME TO unavailable_work_package');
      try {
        expect((await publishEvent(returned)).status).toBe(200);
      } finally {
        try {
          h.sqlite.run('ALTER TABLE unavailable_work_package RENAME TO work_package');
        } finally {
          h.sqlite.run('ALTER TABLE unavailable_access_grant RENAME TO access_grant');
        }
      }
      expect(
        h.sqlite
          .query<{ declaration: string; state: string; revision: number }, [string]>(
            'SELECT declaration,state,revision FROM resource_host_job WHERE use_id=?',
          )
          .get(request.useId),
      ).toEqual({ declaration: declaration.declaration, state: 'release_verified', revision: 2 });
    },
  );
}
test('resource identity rejects nontext native bytes before replay effects', async () => {
  const h = requireHarness();
  const event = capture.runtime.registered.request;
  h.sqlite
    .query(
      'UPDATE resource_runtime_event SET fingerprint=CAST(fingerprint AS BLOB) WHERE event_id=?',
    )
    .run(event.eventId);
  expect(
    h.sqlite
      .query<{ storage: string }, [string]>(
        'SELECT typeof(fingerprint) AS storage FROM resource_runtime_event WHERE event_id=?',
      )
      .get(event.eventId),
  ).toEqual({ storage: 'blob' });
  const before = readHistory();
  expect((await publishEvent(readCurrentRequest(event))).status).toBe(500);
  deepStrictEqual(readHistory(), before);
  const principal = await h.authenticatedMachinePrincipal(runtimeKey);
  if (principal.authentication?.kind !== 'machine')
    throw new Error('fixture machine principal absent');
  const actor = {
    ...resourceUseActorOf(principal, {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, cap: null },
      principal,
    }),
    credentialId: principal.authentication.credentialId,
  };
  let failure: unknown;
  try {
    await h
      .resourceRuntime()
      .ingest(
        capture.runtime.authorityId,
        actor,
        resourceRuntimeEvent.assert(readCurrentRequest(event)),
        Date.now(),
      );
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: 'resource runtime identity is not text' });
  deepStrictEqual(readHistory(), before);
});

test('old admission rejects changed locator without accepting another historical identity', async () => {
  const entry = capture.runtime.admissions.at(0);
  if (entry === undefined) throw new Error('old admission witness absent');
  const request = readCurrentRequest(entry.request);
  const before = readHistory();
  const reply = await callForwarded(
    requireHarness(),
    runtimeKey,
    'PUT',
    '/api/resource-authorities/' + capture.runtime.authorityId + '/admissions',
    { ...request, use: { ...request.use, locator: '/changed-admission-locator' } },
  );
  expect(reply.status).toBe(409);
  deepStrictEqual(readHistory(), before);
});
test('old provisional confirmation rejects changed locator before source or projection effects', async () => {
  const entry = capture.runtime.admissions.at(0);
  if (entry === undefined) throw new Error('old provisional witness absent');
  const request = readCurrentRequest(entry.publication);
  const before = readHistory();
  expect(
    (
      await publishEvent({
        ...request,
        sequence: 4,
        use: { ...request.use, locator: '/changed-confirmation-locator' },
      })
    ).status,
  ).toBe(409);
  deepStrictEqual(readHistory(), before);
});
test('old planning declaration rejects changed locator before live followup effects', async () => {
  const request = readCurrentRequest(capture.runtime.registered.request);
  const before = readHistory();
  expect(
    (
      await publishEvent({
        ...request,
        eventId: 'changed-legacy-declaration',
        sequence: 4,
        revision: 2,
        kind: 'cleanup_pending',
        use: { ...request.use, locator: '/changed-planning-declaration' },
      })
    ).status,
  ).toBe(409);
  deepStrictEqual(readHistory(), before);
});
test('old host-job declaration rejects changed label before settlement effects', async () => {
  const entry = capture.runtime.hostJobs.find((job) => !job.linked);
  if (entry === undefined) throw new Error('old unlinked job absent');
  const request = readCurrentRequest(entry.request);
  const host = request.use['host'];
  if (typeof host !== 'string') throw new Error('old host absent');
  const before = readHistory();
  const reply = await publishEvent({
    ...request,
    eventId: 'changed-host-label',
    sequence: 4,
    revision: 2,
    kind: 'release_verified',
    use: { ...request.use, label: 'Changed retained job label' },
    evidence: {
      digest: 'a'.repeat(64),
      locator: 'dash-host-job-run://' + host + '/' + request.useId,
      disposition: 'returned',
      reclaimedBytes: null,
    },
  });
  expect(reply.status).toBe(409);
  deepStrictEqual(readHistory(), before);
});
