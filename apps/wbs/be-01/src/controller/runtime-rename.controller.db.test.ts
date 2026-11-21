import { createHash } from 'node:crypto';

import { parseStoredRuntimeAcceptance } from '@wbs/core/ports/runtime-command-records';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
let workPackageId: string;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin', ['org-admin']);
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/work-packages', { name: 'Runtime rename' });
  expect(created.status).toBe(200);
  const stored = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE name=?')
    .get('Runtime rename');
  if (stored === null) throw new Error('runtime work package absent');
  workPackageId = stored.id;
  h.sqlite.run("INSERT INTO person (id,name) VALUES ('person','Person')");
  h.sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('person','org-a','Person')",
  );
});
afterEach(async () => {
  await h.closeComposed();
});
function readLedger() {
  const found = h.sqlite
    .query<{ ledger_id: string; receipt_count: number }, []>(
      'SELECT ledger_id,receipt_count FROM runtime_ledger WHERE id=1',
    )
    .get();
  if (found === null) throw new Error('runtime ledger absent');
  return found;
}
test('mounted current runtime state2 emits renamed scope with no retained writes', async () => {
  const before = readLedger();
  const response = await h.call(
    'ada',
    'GET',
    '/api/work-packages/' + workPackageId + '/runtime-state?personId=person',
  );
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    schemaVersion: 2,
    scope: { organizationId: 'org-a', workPackageId, personId: 'person' },
    authority: { kind: 'uninitialized' },
    claims: [],
  });
  expect(readLedger()).toEqual(before);
});
test('mounted current runtime authority writes canonical acceptance and receipt2 while body stays1', async () => {
  const before = readLedger();
  const response = await h.call(
    'ada',
    'POST',
    '/api/work-packages/' + workPackageId + '/runtime-authority',
    {
      schemaVersion: 1,
      commandId: 'authority-new',
      personId: 'person',
      expectedLedgerId: before.ledger_id,
      ownerId: 'owner',
      expectedGeneration: null,
    },
  );
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    schemaVersion: 2,
    commandId: 'authority-new',
    scope: { organizationId: 'org-a', workPackageId, personId: 'person' },
  });
  const raw = h.sqlite
    .query<{ accepted: string }, [string]>(
      'SELECT accepted FROM runtime_command_receipt WHERE command_id=?',
    )
    .get('authority-new');
  if (raw === null) throw new Error('new runtime acceptance absent');
  const accepted = parseStoredRuntimeAcceptance(JSON.parse(raw.accepted));
  expect(accepted.schemaVersion).toBe(2);
  expect(accepted.receipt.schemaVersion).toBe(2);
  const canonical: unknown = JSON.parse(accepted.canonicalRequest);
  expect(canonical).toMatchObject({
    schemaVersion: 2,
    scope: { organizationId: 'org-a', workPackageId, personId: 'person' },
  });
  expect(createHash('sha256').update(accepted.canonicalRequest).digest('hex')).toBe(
    accepted.requestDigest,
  );
  expect(readLedger().receipt_count).toBe(before.receipt_count + 1);
});

import { clientFromShapes, fetchTransport, runtimeCommandShapes } from '@wbs/contracts';

test('mounted current claim and write persist only runtime2 then replay without new rows', async () => {
  const client = clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://localhost', (url, init) => h.app.handle(new Request(url, init))),
  );
  const headers = {
    authorization: 'Bearer ' + h.token('ada'),
    origin: 'http://localhost',
    'X-WBS-Expected-Organization': 'org-a',
  };
  const params = { id: workPackageId };
  const installed = readLedger();
  const authority = await client.acquireRuntimeAuthority({
    params,
    headers,
    body: {
      schemaVersion: 1,
      commandId: 'authority-flow',
      personId: 'person',
      expectedLedgerId: installed.ledger_id,
      ownerId: 'owner',
      expectedGeneration: null,
    },
  });
  expect(authority.kind).toBe('success');
  if (authority.kind !== 'success' || authority.body.schemaVersion !== 2)
    throw new Error('current authority2 required');
  const first = h.sqlite
    .query<{ position: number }, [string]>(
      'SELECT position FROM step WHERE work_package_id=? ORDER BY position LIMIT 1',
    )
    .get(workPackageId);
  if (first === null) throw new Error('default workflow missing');
  expect(first.position).toBeGreaterThan(0);
  h.sqlite
    .query(
      "INSERT INTO step(id,work_package_id,name,position,code) VALUES ('dev',?,'Runtime',0,'runtime-test')",
    )
    .run(workPackageId);
  h.sqlite
    .query(
      "INSERT INTO work_item(id,work_package_id,position,name,readiness) VALUES ('leaf',?,10,'Leaf','ready')",
    )
    .run(workPackageId);
  const state = await client.readRuntimeState({
    params,
    headers,
    query: { personId: 'person', expectedLedgerId: installed.ledger_id },
  });
  expect(state.kind).toBe('success');
  if (state.kind !== 'success') throw new Error('current state required');
  const claimRequest = {
    schemaVersion: 1 as const,
    commandId: 'claim-current',
    personId: 'person',
    expectedLedgerId: installed.ledger_id,
    authority: authority.body.acceptance.authority,
    expectedBasis: state.body.basis,
    action: {
      kind: 'claim' as const,
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
    },
  };
  const claimed = await client.applyRuntimeCommands({ params, headers, body: claimRequest });
  expect(claimed.kind).toBe('success');
  if (
    claimed.kind !== 'success' ||
    claimed.body.schemaVersion !== 2 ||
    claimed.body.acceptance.kind !== 'claim'
  )
    throw new Error('current claim2 required');
  expect(claimed.body.actorId).toBe(h.userId('ada'));
  const writeRequest = {
    ...claimRequest,
    commandId: 'write-current',
    expectedBasis: claimed.body.acceptance.basisAfter,
    action: {
      kind: 'write' as const,
      claim: claimed.body.acceptance.claim,
      commands: [
        { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
      ],
    },
  };
  const written = await client.applyRuntimeCommands({ params, headers, body: writeRequest });
  expect(written.kind).toBe('success');
  if (
    written.kind !== 'success' ||
    written.body.schemaVersion !== 2 ||
    written.body.acceptance.kind !== 'write'
  )
    throw new Error('current write2 required');
  expect(written.body.actorId).toBe(h.userId('ada'));
  const rows = () =>
    h.sqlite
      .query<{ accepted: string }, []>(
        'SELECT accepted FROM runtime_command_receipt ORDER BY command_id',
      )
      .all();
  const before = rows();
  expect(before).toHaveLength(3);
  for (const row of before) {
    const accepted = parseStoredRuntimeAcceptance(JSON.parse(row.accepted));
    expect(accepted.schemaVersion).toBe(2);
    expect(accepted.receipt.schemaVersion).toBe(2);
    const canonical: unknown = JSON.parse(accepted.canonicalRequest);
    expect(canonical).toMatchObject({
      schemaVersion: 2,
      scope: { organizationId: 'org-a', workPackageId, personId: 'person' },
    });
    expect(createHash('sha256').update(accepted.canonicalRequest).digest('hex')).toBe(
      accepted.requestDigest,
    );
  }
  expect(await client.applyRuntimeCommands({ params, headers, body: claimRequest })).toEqual(
    claimed,
  );
  expect(await client.applyRuntimeCommands({ params, headers, body: writeRequest })).toEqual(
    written,
  );
  expect(rows()).toEqual(before);
  expect(readLedger().receipt_count).toBe(3);
});
