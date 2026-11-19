import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { resourceRuntimeEvent } from '@wbs/contracts';
import { resourceUseActorOf } from '@wbs/core/http/resource-use.routes';
import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';

import { runMigrations } from '../repository/migrate';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

interface CapturedEvent extends Record<string, unknown> {
  kind: string;
  eventId: string;
  useId: string;
  use: Record<string, unknown>;
  evidence: Record<string, unknown>;
}
interface TerminalCapture {
  runtime: { authorityId: string; credentialId: string; acknowledgment: CapturedEvent };
}
const directory = new URL(
  '../../../../../openspec/changes/wbs-work-packages/fixtures/',
  import.meta.url,
);
const compressed = readFileSync(new URL('legacy-resource-terminal1.sqlite.gz', directory));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
if (hash(compressed) !== 'd9ac76f5ffef076b57f2c1478ee573ad74431b7017bb62dd141123100f2db521')
  throw new Error('terminal database fixture changed');
const snapshot = gunzipSync(compressed);
if (hash(snapshot) !== '5296250dcb641f2b76158b9c772db1155d32c23c593a9d6e7485778936f01d54')
  throw new Error('terminal database bytes changed');
const captureBytes = readFileSync(new URL('legacy-resource-terminal1.txt', directory), 'utf8');
if (hash(captureBytes) !== 'ca9661a9746f3ff25ae5f27ccd29018a1cbd25d30fb3c2aab5dde6681ad71970')
  throw new Error('terminal capture changed');
// These casts describe the exact genuine outgoing artifact; actual routes validate every replay input.
const capture = JSON.parse(captureBytes) as TerminalCapture;
const migrations = new URL('../../drizzle', import.meta.url).pathname;
let opened: OrganizationHarness | undefined;
let machineGrants: HarnessMachineGrants;
let runtimeKey: string;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
function requireHarness() {
  if (opened === undefined) throw new Error('terminal fixture owner absent');
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
      'resource_cleanup_request',
      'runtime_ledger',
    ].map((table) => [table, h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
beforeEach(async () => {
  opened = undefined;
  opened = OrganizationHarness.openComposedWith({
    machineGrants,
    migrate: (path) => {
      writeFileSync(path, snapshot, { flag: 'wx' });
      runMigrations(path, migrations);
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
  deepStrictEqual(readHistory(), before);
});
afterEach(async () => {
  if (opened !== undefined) {
    await opened.closeComposed();
    opened = undefined;
  }
});
function readAcknowledgment() {
  const original = capture.runtime.acknowledgment;
  return {
    ...original,
    use: Object.fromEntries(
      Object.entries(original.use).map(([key, value]) => [
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
test('genuine old terminal evidence acknowledges a pending request without replacing original identity strings', async () => {
  const h = requireHarness();
  const original = readHistory();
  const request = readAcknowledgment();
  const retainedDeclaration = h.sqlite
    .query<{ declaration: string }, [string]>(
      'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
    )
    .get(request.useId);
  const retainedRegistration = h.sqlite
    .query<{ registration_response: string }, [string]>(
      'SELECT registration_response FROM resource_use WHERE id=?',
    )
    .get(request.useId);
  if (retainedDeclaration === null || retainedRegistration === null)
    throw new Error('terminal original identity absent');
  expect((await publishEvent(request)).status).toBe(200);
  const after = readHistory();
  deepStrictEqual(after['runtime_ledger'], original['runtime_ledger']);
  expect(
    h.sqlite
      .query<{ declaration: string; revision: number }, [string]>(
        'SELECT declaration,revision FROM resource_runtime_use WHERE use_id=?',
      )
      .get(request.useId),
  ).toEqual({ declaration: retainedDeclaration.declaration, revision: 4 });
  const priorEvents = original['resource_runtime_event'];
  deepStrictEqual(after['resource_runtime_event'].slice(0, priorEvents.length), priorEvents);
  const row = h.sqlite
    .query<{ fingerprint: string }, [string]>(
      'SELECT fingerprint FROM resource_runtime_event WHERE event_id=?',
    )
    .get(request.eventId);
  if (row === null) throw new Error('terminal acknowledgment not retained');
  expect(JSON.parse(row.fingerprint)).toEqual({ schemaVersion: 2, event: request });
  const changed = h.sqlite
    .query<{ snapshot: string; registration_response: string }, [string]>(
      'SELECT snapshot,registration_response FROM resource_use WHERE id=?',
    )
    .get(request.useId);
  if (changed === null) throw new Error('terminal projection absent');
  expect(changed.registration_response).toBe(retainedRegistration.registration_response);
  expect(JSON.parse(changed.snapshot)).toMatchObject({
    state: 'release_verified',
    runtimeRevision: 4,
    pendingCleanupRequest: false,
  });
  const beforeReplay = readHistory();
  expect((await publishEvent(request)).status).toBe(200);
  deepStrictEqual(readHistory(), beforeReplay);
});
test('genuine old terminal evidence refuses changed proof before acknowledgment effects', async () => {
  const request = readAcknowledgment();
  const before = readHistory();
  expect(
    (
      await publishEvent({
        ...request,
        evidence: { ...request.evidence, disposition: 'not_created' },
      })
    ).status,
  ).toBe(409);
  deepStrictEqual(readHistory(), before);
});

for (const format of ['legacy', 'tagged'] as const) {
  for (const corruption of [
    'kind',
    'missing-proof',
    'digest',
    'locator',
    'disposition',
    'host-job',
  ] as const) {
    test(
      'refuses corrupt ' +
        format +
        ' terminal ' +
        corruption +
        ' as trusted failure before acknowledgment',
      async () => {
        const h = requireHarness();
        const request = readAcknowledgment();
        const retained = h.sqlite
          .query<{ event_id: string; fingerprint: string }, [string]>(
            "SELECT r.event_id,r.fingerprint FROM resource_runtime_event r JOIN resource_use_event e ON e.id=r.event_id WHERE e.use_id=? AND json_extract(e.snapshot,'$.kind')='release_verified' ORDER BY e.revision DESC LIMIT 1",
          )
          .get(request.useId);
        if (retained === null) throw new Error('captured terminal event absent');
        // The pinned outgoing fixture supplies this exact original event; production parses the corrupt stored identity.
        const original = JSON.parse(retained.fingerprint) as CapturedEvent;
        const changed = { ...original, evidence: { ...original.evidence } };
        if (corruption === 'kind') changed.kind = 'cleanup_pending';
        if (corruption === 'host-job') {
          changed.use = {
            kind: 'host_job',
            type: 'gate',
            label: 'foreign terminal host job',
            host: 'h2puni',
            launcherSha: null,
            reservations: [],
          };
          changed.evidence['disposition'] = 'not_created';
        }
        if (corruption === 'missing-proof') delete (changed as Record<string, unknown>)['evidence'];
        if (corruption === 'digest') changed.evidence['digest'] = 'not-a-digest';
        if (corruption === 'locator') changed.evidence['locator'] = ' ';
        if (corruption === 'disposition') changed.evidence['disposition'] = 'returned';
        const encoded =
          format === 'legacy'
            ? changed
            : {
                schemaVersion: 2,
                event: {
                  ...changed,
                  use: Object.fromEntries(
                    Object.entries(changed.use).map(([key, value]) => [
                      key === 'projectId' ? 'workPackageId' : key,
                      value,
                    ]),
                  ),
                },
              };
        h.sqlite
          .query('UPDATE resource_runtime_event SET fingerprint=? WHERE event_id=?')
          .run(JSON.stringify(encoded), retained.event_id);
        const before = readHistory();
        expect((await publishEvent(request)).status).toBe(500);
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
              resourceRuntimeEvent.assert(request),
              Date.now(),
            );
        } catch (cause) {
          failure = cause;
        }
        expect(failure).toBeInstanceOf(Error);
        expect(failure).toMatchObject({
          message: 'stored terminal resource evidence is invalid for event ' + retained.event_id,
        });
        deepStrictEqual(readHistory(), before);
      },
    );
  }
}
test('missing incoming terminal proof stays a modeled request refusal without effects', async () => {
  const request = readAcknowledgment();
  const { evidence, ...withoutProof } = request;
  expect(evidence).toBeDefined();
  const before = readHistory();
  expect((await publishEvent(withoutProof)).status).toBe(400);
  deepStrictEqual(readHistory(), before);
});

for (const format of ['legacy', 'tagged'] as const) {
  test(
    'refuses malformed ' + format + ' original terminal event shape before acknowledgment',
    async () => {
      const h = requireHarness();
      const request = readAcknowledgment();
      const retained = h.sqlite
        .query<{ event_id: string; fingerprint: string }, [string]>(
          "SELECT r.event_id,r.fingerprint FROM resource_runtime_event r JOIN resource_use_event e ON e.id=r.event_id WHERE e.use_id=? AND json_extract(e.snapshot,'$.kind')='release_verified' ORDER BY e.revision DESC LIMIT 1",
        )
        .get(request.useId);
      if (retained === null) throw new Error('captured terminal event absent');
      // Only the sequence field of this exact pinned outgoing event is deliberately malformed.
      const original = JSON.parse(retained.fingerprint) as CapturedEvent;
      const changed = { ...original, sequence: 0 };
      const encoded =
        format === 'legacy'
          ? changed
          : {
              schemaVersion: 2,
              event: {
                ...changed,
                use: Object.fromEntries(
                  Object.entries(changed.use).map(([key, value]) => [
                    key === 'projectId' ? 'workPackageId' : key,
                    value,
                  ]),
                ),
              },
            };
      h.sqlite
        .query('UPDATE resource_runtime_event SET fingerprint=? WHERE event_id=?')
        .run(JSON.stringify(encoded), retained.event_id);
      const before = readHistory();
      expect((await publishEvent(request)).status).toBe(500);
      deepStrictEqual(readHistory(), before);
    },
  );
}
