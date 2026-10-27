import {
  clientFromShapes,
  fetchTransport,
  type RuntimeClaimRequest,
  runtimeCommandShapes,
  type RuntimeState,
} from '@wbs/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let projectId: string;
beforeEach(async () => {
  harness = OrganizationHarness.openComposed();
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'admin');
  harness.bind('ada', 'org-a');
  harness.activate();
  const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Runtime cap' });
  expect(created.status).toBe(200);
  projectId = (created.body as { project: { id: string } }).project.id;
  harness.sqlite.run("INSERT INTO person (id,name,kind) VALUES ('person','Agent','agent')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('person','org-a','Agent')",
  );
  harness.sqlite.run(
    "INSERT INTO step (id,project_id,name,position,code) VALUES ('dev',?,'Runtime cap dev',100,'runtime-cap-dev')",
    [projectId],
  );
  for (const id of ['leaf', 'other'])
    harness.sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,readiness) VALUES (?,?,? ,?,'ready')",
      [id, projectId, id === 'leaf' ? 10 : 20, id],
    );
});
afterEach(async () => {
  await harness.closeComposed();
});
function createClient() {
  return clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://localhost', (url, init) => harness.app.handle(new Request(url, init))),
  );
}
function createHeaders() {
  return {
    authorization: `Bearer ${harness.token('ada')}`,
    origin: 'http://localhost',
    'X-WBS-Expected-Organization': 'org-a',
  };
}
async function readState(): Promise<RuntimeState> {
  const answer = await createClient().readRuntimeState({
    params: { id: projectId },
    query: { personId: 'person' },
    headers: createHeaders(),
  });
  if (answer.kind !== 'success') throw new Error(`state refused ${JSON.stringify(answer)}`);
  return answer.body;
}
async function createRequest(): Promise<RuntimeClaimRequest & { personId: string }> {
  const observed = await readState();
  const granted = await createClient().acquireRuntimeAuthority({
    params: { id: projectId },
    body: {
      schemaVersion: 1,
      commandId: 'grant',
      personId: 'person',
      expectedLedgerId: observed.ledgerId,
      ownerId: 'owner',
      expectedGeneration: null,
    },
    headers: createHeaders(),
  });
  if (granted.kind !== 'success') throw new Error(`grant refused ${JSON.stringify(granted)}`);
  return {
    schemaVersion: 1,
    commandId: 'claim',
    personId: 'person',
    expectedLedgerId: observed.ledgerId,
    authority: granted.body.acceptance.authority,
    expectedBasis: (await readState()).basis,
    action: {
      kind: 'claim',
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
    },
  };
}
function capClaims(cap: number): void {
  harness.sqlite.run(
    `INSERT INTO organization_limits
    (organization_id,max_agent_persons,max_concurrent_claims,max_capacity_units_per_resource,created_at)
    VALUES ('org-a',50,?,10000,1) ON CONFLICT (organization_id)
    DO UPDATE SET max_concurrent_claims=excluded.max_concurrent_claims`,
    [cap],
  );
}
function readEffects() {
  return {
    claims: harness.sqlite.query('SELECT * FROM claim ORDER BY id').all(),
    occupancy: harness.sqlite
      .query('SELECT * FROM claim_occupancy ORDER BY claim_id,resource_id')
      .all(),
    bindings: harness.sqlite.query('SELECT * FROM runtime_claim_binding ORDER BY rowid').all(),
    receipts: harness.sqlite.query('SELECT * FROM runtime_command_receipt ORDER BY rowid').all(),
    journal: harness.sqlite.query('SELECT * FROM command_journal ORDER BY id').all(),
    ledger: harness.sqlite.query('SELECT * FROM runtime_ledger ORDER BY id').all(),
    authority: harness.sqlite.query('SELECT * FROM runtime_authority ORDER BY rowid').all(),
    workItems: harness.sqlite.query('SELECT * FROM work_item ORDER BY id').all(),
    progress: harness.sqlite.query('SELECT * FROM step_progress ORDER BY rowid').all(),
    events: harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all(),
    sequences: harness.sqlite.query('SELECT * FROM event_sequencer ORDER BY rowid').all(),
    audit: harness.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all(),
  };
}
function submit(request: RuntimeClaimRequest & { personId: string }) {
  return createClient().applyRuntimeCommands({
    params: { id: projectId },
    body: request,
    headers: createHeaders(),
  });
}
test('mounted runtime cap refusal preserves every claim, binding, receipt, journal and ledger row', async () => {
  capClaims(0);
  const request = await createRequest();
  const before = readEffects();
  const refused = await submit(request);
  expect(refused).toMatchObject({ kind: 'refusal', status: 409 });
  if (refused.kind !== 'refusal')
    throw new Error(`expected cap refusal ${JSON.stringify(refused)}`);
  expect(refused.body).toEqual({
    error: 'claim_limit',
    cap: 0,
    current: 0,
    at: 0,
    kind: 'claimWorkItem',
  });
  expect(readEffects()).toEqual(before);
});
test('mounted below-cap claim commits once and exact replay survives a lower cap under current authorization', async () => {
  capClaims(1);
  const request = await createRequest();
  const before = readEffects();
  const accepted = await submit(request);
  expect(accepted.kind).toBe('success');
  if (accepted.kind !== 'success') throw new Error(`claim refused ${JSON.stringify(accepted)}`);
  expect(accepted.body.acceptance).toMatchObject({
    kind: 'claim',
    authority: request.authority,
    claim: {
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: request.action.execution,
    },
    basisAfter: (await readState()).basis,
  });
  const committed = readEffects();
  expect(committed.claims).toHaveLength(1);
  expect(committed.bindings).toHaveLength(1);
  expect(committed.receipts).toHaveLength(before.receipts.length + 1);
  expect(committed.journal).toHaveLength(before.journal.length + 1);
  expect(committed.authority).toEqual(before.authority);
  expect(committed.ledger).toMatchObject([
    { binding_count: 1, receipt_count: 2, authority_count: 1 },
  ]);
  capClaims(0);
  expect(await submit(request)).toEqual(accepted);
  expect(readEffects()).toEqual(committed);
  harness.sqlite.run(
    "UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a'",
  );
  expect(await submit(request)).toMatchObject({
    kind: 'refusal',
    status: 403,
    body: { error: 'forbidden' },
  });
  expect(readEffects()).toEqual(committed);
});
