import { createHash } from 'node:crypto';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

let h: OrganizationHarness;
let workPackageId: string;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin', ['org-admin']);
  h.bind('ada', 'org-a');
  h.activate();
  workPackageId = await createFixturePackage(h, 'ada', 'Runtime');
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('person', 'Person')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('person', 'org-a', 'Person')",
  );
});
afterEach(async () => {
  await h.closeComposed();
});
test('mounts a real coherent runtime state and retained authority receipt', async () => {
  const state = await h.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackageId}/runtime-state?personId=person`,
  );
  expect(state.status).toBe(200);
  expect(state.body).toMatchObject({
    schemaVersion: 2,
    authority: { kind: 'uninitialized' },
    scope: { organizationId: 'org-a', workPackageId, personId: 'person' },
    claims: [],
  });
});

import {
  canonicalRuntimeRequest,
  clientFromShapes,
  fetchTransport,
  matchesRuntimeReceipt,
  type RuntimeClaimRequest,
  runtimeCommandShapes,
  type RuntimeReceipt,
  type RuntimeState,
} from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';

import { buildApp } from '../app';
import { bootBe01, type RunningBe } from '../boot';
import { TEST_JWT_KEY } from '../testing/auth-fixture';

async function readState(): Promise<RuntimeState> {
  const answer = await h.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackageId}/runtime-state?personId=person`,
  );
  expect(answer.status).toBe(200);
  return answer.body as RuntimeState;
}
function createClient(
  send: (request: Request) => Promise<Response> = (request) => h.app.handle(request),
) {
  return clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://localhost', (url, init) => send(new Request(url, init))),
  );
}
function createHeaders() {
  return {
    authorization: `Bearer ${h.token('ada')}`,
    origin: 'http://localhost',
    'X-WBS-Expected-Organization': 'org-a',
  };
}
async function acquireAuthority() {
  const observation = await readState();
  const request = {
    schemaVersion: 1 as const,
    commandId: 'grant',
    personId: 'person',
    expectedLedgerId: observation.ledgerId,
    ownerId: 'old',
    expectedGeneration: null,
  };
  const accepted = await createClient().acquireRuntimeAuthority({
    params: { id: workPackageId },
    body: request,
    headers: createHeaders(),
  });
  if (accepted.kind !== 'success') throw new Error(`grant failed ${JSON.stringify(accepted)}`);
  return {
    observation,
    request,
    grant: accepted.body.acceptance.authority,
    receipt: accepted.body,
  };
}
async function createClaimRequest(): Promise<RuntimeClaimRequest & { personId: string }> {
  const { observation, grant } = await acquireAuthority();
  // Pin/cap/receipt fixtures require an unstarted first step before the work package's default Dev/QA.
  const fixture = await readFixturePackage(h, 'ada', workPackageId);
  const first = fixture.steps.at(0);
  if (first === undefined) throw new Error('fixture default workflow steps missing');
  expect(first.position).toBeGreaterThan(0);
  await h.publicWrites().uow.run(async ({ stores }) => {
    const bound = await stores.stepCatalogue.defineAndBindStep(
      'org-a',
      {
        id: 'dev',
        code: 'runtime-test',
        name: 'Runtime test',
        position: 0,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      {
        bindingId: 'runtime-test-binding',
        scopeKind: 'project',
        scopeId: fixture.workPackage.projectId,
        workItemTypeId: null,
        position: 0,
      },
      { at: 1, by: h.userId('ada') },
    );
    if (!bound.ok) throw new Error('fixture runtime step binding refused: ' + bound.reason);
    return { commit: true, value: undefined };
  });
  expect((await readFixturePackage(h, 'ada', workPackageId)).steps.at(0)?.id).toBe('dev');
  h.sqlite.run(
    "INSERT INTO work_item (id, work_package_id, position, name, readiness) VALUES ('leaf', ?, 10, 'Leaf', 'ready')",
    [workPackageId],
  );
  return {
    schemaVersion: 1,
    commandId: 'claim',
    personId: 'person',
    expectedLedgerId: observation.ledgerId,
    authority: grant,
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
function readJournal() {
  return h.sqlite.query('SELECT * FROM command_journal ORDER BY id').all();
}
test('validates full wire input before context projection and requires pins everywhere but discovery', async () => {
  const { request } = await acquireAuthority();
  for (const changed of [
    { ...request, extra: 1 },
    { ...request, schemaVersion: 2 },
    { ...request, expectedLedgerId: '' },
    { ...request, expectedLedgerId: undefined },
    { ...request, expectedGeneration: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    expect(
      (
        await h.call(
          'ada',
          'POST',
          `/api/work-packages/${workPackageId}/runtime-authority`,
          changed,
        )
      ).status,
    ).toBe(400);
  }
  const valid = await createClaimRequestAfterAuthority(request.expectedLedgerId);
  for (const changed of [
    { ...valid, extra: 1 },
    { ...valid, expectedBasis: 'bad' },
    { ...valid, authority: { ownerId: 'old' } },
    { ...valid, action: { ...valid.action, extra: 1 } },
  ]) {
    expect(
      (await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-commands`, changed))
        .status,
    ).toBe(400);
  }
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackageId}/runtime-commands/claim?personId=person`,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackageId}/runtime-state?personId=person&expectedLedgerId=`,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackageId}/runtime-state?personId=person&personId=person`,
      )
    ).status,
  ).toBe(400);
});
async function createClaimRequestAfterAuthority(ledgerId: string) {
  return {
    schemaVersion: 1,
    commandId: 'pending',
    personId: 'person',
    expectedLedgerId: ledgerId,
    authority: { ownerId: 'old', generation: 1 },
    expectedBasis: (await readState()).basis,
    action: {
      kind: 'claim',
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: { storeId: 's', runId: 'r', attemptId: 'a', sessionId: 'session' },
    },
  };
}
test('current grant and person binding refuse before historical replay, and foreign work packages match absence', async () => {
  const { request, observation } = await acquireAuthority();
  expect(
    h.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='org-a' AND subject_kind='user' AND subject_id=? AND origin='creation' AND (scope_kind='project' OR scope_kind='work_package')",
      [h.userId('ada')],
    ).changes,
  ).toBe(2);
  h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
    h.userId('ada'),
  ]);
  h.sqlite.run(
    "UPDATE access_grant SET role_id='org-viewer' WHERE organization_id='org-a' AND scope_kind='organization' AND scope_id='org-a' AND subject_kind='user' AND subject_id=?",
    [h.userId('ada')],
  );
  expect(
    await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-authority`, request),
  ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'package.write' } });
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackageId}/runtime-commands/grant?personId=person&expectedLedgerId=${observation.ledgerId}`,
      )
    ).status,
  ).toBe(403);
  h.sqlite.run("UPDATE organization_membership SET role = 'member' WHERE user_id = ?", [
    h.userId('ada'),
  ]);
  h.sqlite.run(
    "UPDATE access_grant SET role_id='project-contributor' WHERE organization_id='org-a' AND scope_kind='organization' AND scope_id='org-a' AND subject_kind='user' AND subject_id=?",
    [h.userId('ada')],
  );
  expect(
    await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-authority`, request),
  ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'package.claim_for_others' } });
  h.organization('org-b');
  h.member('org-b', 'ada', 'admin', ['org-admin']);
  h.bind('ada', 'org-b');
  const foreign = await h.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackageId}/runtime-state?personId=person`,
  );
  expect(foreign).toEqual(
    await h.call('ada', 'GET', '/api/work-packages/absent/runtime-state?personId=person'),
  );
  expect(foreign.status).toBe(404);
});
test('legacy runtime access refuses while ordinary APIs remain available', async () => {
  await h.closeComposed();
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  workPackageId = await createFixturePackage(h, 'ada', 'Legacy');
  expect(
    await h.call('ada', 'GET', `/api/work-packages/${workPackageId}/runtime-state?personId=person`),
  ).toEqual({ status: 403, body: { error: 'runtime_scope_unavailable' } });
  expect((await h.call('ada', 'GET', '/api/work-packages')).status).toBe(200);
});
test('commit then lose only reply, reopen and lookup or replay the exact immutable acceptance', async () => {
  const claim = await createClaimRequest();
  const claimed = await createClient().applyRuntimeCommands({
    params: { id: workPackageId },
    body: claim,
    headers: createHeaders(),
  });
  if (claimed.kind !== 'success' || claimed.body.acceptance.kind !== 'claim')
    throw new Error(`claim failed ${JSON.stringify(claimed)}`);
  const write = {
    ...claim,
    commandId: 'write',
    expectedBasis: claimed.body.acceptance.basisAfter,
    action: {
      kind: 'write' as const,
      claim: claimed.body.acceptance.claim,
      commands: [
        { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
      ],
    },
  };
  let committed: RuntimeReceipt | undefined;
  const lost = await createClient(async (request) => {
    const response = await h.app.handle(request);
    expect(response.status).toBe(200);
    committed = (await response.json()) as RuntimeReceipt;
    throw new TypeError('transport lost reply after committed application response');
  }).applyRuntimeCommands({ params: { id: workPackageId }, body: write, headers: createHeaders() });
  expect(lost.kind).toBe('failure');
  expect(committed?.acceptance.kind).toBe('write');
  const journal = readJournal();
  const before = await readState();
  const credentials = createHeaders();
  const dbPath = h.databasePath();
  const actorId = h.userId('ada');
  await h.stopForRecovery();
  let reopened: RunningBe | undefined;
  let app: ReturnType<typeof buildApp> | undefined;
  let source: ReturnType<typeof openSqliteSource> | undefined;
  try {
    reopened = await bootBe01(
      {
        dbPath,
        port: 0,
        appOrigin: 'http://localhost',
        logger: createLogger({ service: 'be-01', level: 'error' }),
        jwtKey: TEST_JWT_KEY,
        gwUrl: 'http://gw.invalid',
        internalAuthSecret: 's'.repeat(32),
        browserSessionAuthority: 'disabled',
        organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
        mcpService: TEST_MCP_SERVICE_SETTINGS,
      },
      {
        openSource: (options) => {
          source = openSqliteSource(options);
          return source;
        },
        makeApp: (options) => {
          if (source === undefined) throw new Error('source missing');
          const mounted = buildApp({
            ...options,
            workPackageObservation: source.createWorkPackageObservation({
              activeOrganizationOf: () =>
                userBoundOrganizationOf((userId) =>
                  Promise.resolve(userId === actorId ? 'org-a' : null),
                ),
              now: Date.now,
            }),
            organizations: new SqliteOrganizationAccess(
              source.db,
              userBoundOrganizationOf((userId) =>
                Promise.resolve(userId === actorId ? 'org-a' : null),
              ),
              Date.now,
            ),
          });
          mounted.stop = () => Promise.resolve(mounted);
          app = mounted;
          return mounted;
        },
        startListener: (_app, _port, ready) => {
          ready();
        },
      },
    );
    const recovered = createClient((request) => {
      if (app === undefined) throw new Error('app missing');
      return app.handle(request);
    });
    const lookup = await recovered.lookupRuntimeReceipt({
      params: { id: workPackageId, commandId: 'write' },
      query: { personId: 'person', expectedLedgerId: write.expectedLedgerId },
      headers: credentials,
    });
    expect(lookup).toMatchObject({ kind: 'success', body: committed });
    expect(
      await recovered.applyRuntimeCommands({
        params: { id: workPackageId },
        body: write,
        headers: credentials,
      }),
    ).toMatchObject({ kind: 'success', body: committed });
    if (source === undefined) throw new Error('source missing');
    expect(source.db.all('SELECT * FROM command_journal ORDER BY id')).toEqual(journal);
    const latest = await recovered.readRuntimeState({
      params: { id: workPackageId },
      query: { personId: 'person', expectedLedgerId: write.expectedLedgerId },
      headers: credentials,
    });
    expect(latest).toMatchObject({ kind: 'success', body: before });
  } finally {
    await reopened?.stop();
  }
});
test('absence before fence is inconclusive and delayed old dispatch refuses after takeover', async () => {
  const request = await createClaimRequest();
  const original = createClient();
  const absent = () =>
    original.lookupRuntimeReceipt({
      params: { id: workPackageId, commandId: request.commandId },
      query: { personId: 'person', expectedLedgerId: request.expectedLedgerId },
      headers: createHeaders(),
    });
  expect(await absent()).toMatchObject({
    kind: 'refusal',
    status: 404,
    body: { error: 'runtime_receipt_not_found' },
  });
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const pending = createClient(async (wire) => {
    entered.resolve(undefined);
    await held.promise;
    return h.app.handle(wire);
  }).applyRuntimeCommands({
    params: { id: workPackageId },
    body: request,
    headers: createHeaders(),
  });
  await entered.promise;
  try {
    expect(
      await original.acquireRuntimeAuthority({
        params: { id: workPackageId },
        body: {
          schemaVersion: 1,
          commandId: 'takeover',
          personId: 'person',
          expectedLedgerId: request.expectedLedgerId,
          ownerId: 'new',
          expectedGeneration: 1,
        },
        headers: createHeaders(),
      }),
    ).toMatchObject({ kind: 'success', body: { acceptance: { authority: { generation: 2 } } } });
  } finally {
    held.resolve(undefined);
  }
  expect(await pending).toMatchObject({
    kind: 'refusal',
    status: 409,
    body: { error: 'runtime_authority_stale' },
  });
  expect(await absent()).toMatchObject({
    kind: 'refusal',
    status: 404,
    body: { error: 'runtime_receipt_not_found' },
  });
  expect((await readState()).claims).toEqual([]);
  expect(readJournal()).toEqual([]);
});

import { reconstructRuntimeInstallation } from '../testing/runtime-installation-fixture';

test('explicit current-schema reconstruction changes the pin before replay or absence', async () => {
  const old = await readState();
  reconstructRuntimeInstallation(h.databasePath());
  const replacement = await readState();
  expect(replacement.ledgerId).not.toBe(old.ledgerId);
  const pinned = createClient();
  expect(
    await pinned.readRuntimeState({
      params: { id: workPackageId },
      query: { personId: 'person', expectedLedgerId: old.ledgerId },
      headers: createHeaders(),
    }),
  ).toMatchObject({ kind: 'refusal', status: 409, body: { error: 'runtime_ledger_mismatch' } });
  expect(
    await pinned.lookupRuntimeReceipt({
      params: { id: workPackageId, commandId: 'absent' },
      query: { personId: 'person', expectedLedgerId: old.ledgerId },
      headers: createHeaders(),
    }),
  ).toMatchObject({ kind: 'refusal', status: 409, body: { error: 'runtime_ledger_mismatch' } });
  expect(
    await pinned.acquireRuntimeAuthority({
      params: { id: workPackageId },
      body: {
        schemaVersion: 1,
        commandId: 'never',
        personId: 'person',
        expectedLedgerId: old.ledgerId,
        ownerId: 'old',
        expectedGeneration: null,
      },
      headers: createHeaders(),
    }),
  ).toMatchObject({ kind: 'refusal', status: 409, body: { error: 'runtime_ledger_mismatch' } });
});
for (const fault of ['missing', 'corrupt'] as const) {
  test(`mounted ${fault} ledger is a server fault and never receipt absence`, async () => {
    const observation = await readState();
    const errors = spyOn(h.app.decorator.logger, 'error').mockImplementation(() => undefined);
    try {
      h.sqlite.run(
        fault === 'missing'
          ? 'DROP TABLE runtime_ledger'
          : 'UPDATE runtime_ledger SET receipt_count = 1',
      );
      expect(
        await createClient().lookupRuntimeReceipt({
          params: { id: workPackageId, commandId: 'never' },
          query: { personId: 'person', expectedLedgerId: observation.ledgerId },
          headers: createHeaders(),
        }),
      ).toMatchObject({ kind: 'failure' });
      expect(
        (
          await h.call(
            'ada',
            'GET',
            `/api/work-packages/${workPackageId}/runtime-state?personId=person`,
          )
        ).status,
      ).toBe(500);
      expect(errors).toHaveBeenCalledTimes(2);
    } finally {
      errors.mockRestore();
    }
  });
}
test('mounted runtime refusals preserve ordinary holder and resource details', async () => {
  const request = await createClaimRequest();
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('other', 'Root Other')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('other', 'org-a', 'Scoped Other')",
  );
  expect(
    (
      await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
        commands: [
          {
            kind: 'claimWorkItem',
            workItemId: 'leaf',
            personId: 'other',
            steps: ['dev'],
            runId: 'other-session',
          },
        ],
      })
    ).status,
  ).toBe(200);
  const refused = await createClient().applyRuntimeCommands({
    params: { id: workPackageId },
    body: { ...request, expectedBasis: (await readState()).basis },
    headers: createHeaders(),
  });
  expect(refused).toMatchObject({
    kind: 'refusal',
    status: 409,
    body: {
      error: 'already_claimed',
      at: 0,
      kind: 'claimWorkItem',
      holders: [{ personId: 'other', name: 'Scoped Other', runId: 'other-session' }],
    },
  });
  expect(
    (
      await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
        commands: [
          { kind: 'releaseWorkItem', workItemId: 'leaf', personId: 'other', steps: ['dev'] },
        ],
      })
    ).status,
  ).toBe(200);
  const created = await h.call('ada', 'POST', '/api/directory/commands', {
    commands: [{ kind: 'createResource', name: 'RAM', resourceKind: 'divisible', unitLabel: 'GB' }],
  });
  const resourceId = (created.body as { results: { id: string }[] }).results.at(0)?.id;
  if (resourceId === undefined) throw new Error('resource not created');
  expect(
    (
      await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
        commands: [
          { kind: 'setResourceCapacity', resourceId, units: 0 },
          { kind: 'setDemand', resourceId, workItemId: 'leaf', units: 1 },
        ],
      })
    ).status,
  ).toBe(200);
  expect(
    await createClient().applyRuntimeCommands({
      params: { id: workPackageId },
      body: { ...request, expectedBasis: (await readState()).basis },
      headers: createHeaders(),
    }),
  ).toMatchObject({
    kind: 'refusal',
    status: 409,
    body: {
      error: 'resources_exhausted',
      at: 0,
      kind: 'claimWorkItem',
      resourceId,
      asked: 1,
      free: 0,
      holders: [],
    },
  });
});
test('semantic parser refusals remain typed 400 and exact claimed writes include applied order', async () => {
  const request = await createClaimRequest();
  const claimed = await createClient().applyRuntimeCommands({
    params: { id: workPackageId },
    body: request,
    headers: createHeaders(),
  });
  if (claimed.kind !== 'success' || claimed.body.acceptance.kind !== 'claim')
    throw new Error('claim refused');
  const write = {
    ...request,
    commandId: 'write',
    expectedBasis: claimed.body.acceptance.basisAfter,
    action: {
      kind: 'write' as const,
      claim: claimed.body.acceptance.claim,
      commands: [
        {
          kind: 'patchWorkItem' as const,
          workItemId: 'leaf',
          patch: { externalRefs: [{ systemId: '', url: '' }] },
        },
      ],
    },
  };
  expect(
    await createClient().applyRuntimeCommands({
      params: { id: workPackageId },
      body: write,
      headers: createHeaders(),
    }),
  ).toMatchObject({
    kind: 'refusal',
    status: 400,
    body: { error: 'externalRefs_entry_needs_a_systemId', at: 0, kind: 'patchWorkItem' },
  });
  const accepted = await createClient().applyRuntimeCommands({
    params: { id: workPackageId },
    body: {
      ...write,
      action: {
        ...write.action,
        commands: [
          {
            kind: 'setMeasure',
            workItemId: 'leaf',
            stepId: 'dev',
            metric: 'token_actual',
            value: 7,
          },
          { kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' },
          { kind: 'releaseWorkItem', workItemId: 'leaf', personId: 'person', steps: ['dev'] },
        ],
      },
    },
    headers: createHeaders(),
  });
  expect(accepted).toMatchObject({
    kind: 'success',
    body: {
      acceptance: {
        kind: 'write',
        applied: [
          { index: 0, kind: 'setMeasure' },
          { index: 1, kind: 'setProgress' },
          { index: 2, kind: 'releaseWorkItem' },
        ],
      },
    },
  });
  expect((await readState()).claims).toEqual([]);
});

test('fully reconstructed valid runtime tables never inherit an accepted command pin', async () => {
  const { request, observation } = await acquireAuthority();
  reconstructRuntimeInstallation(h.databasePath());
  const replacement = await readState();
  expect(replacement.ledgerId).not.toBe(observation.ledgerId);
  expect(replacement.authority).toEqual({ kind: 'uninitialized' });
  expect(
    await createClient().lookupRuntimeReceipt({
      params: { id: workPackageId, commandId: request.commandId },
      query: { personId: 'person', expectedLedgerId: request.expectedLedgerId },
      headers: createHeaders(),
    }),
  ).toMatchObject({ kind: 'refusal', status: 409, body: { error: 'runtime_ledger_mismatch' } });
  expect(
    await createClient().acquireRuntimeAuthority({
      params: { id: workPackageId },
      body: request,
      headers: createHeaders(),
    }),
  ).toMatchObject({ kind: 'refusal', status: 409, body: { error: 'runtime_ledger_mismatch' } });
});
test('all four runtime routes enforce authentication before revealing scope or replay', async () => {
  const marker = h.sqlite
    .query<{ ledgerId: string }, []>('SELECT ledger_id AS ledgerId FROM runtime_ledger')
    .get();
  if (marker === null) throw new Error('fixture ledger missing');
  const observation = { ledgerId: marker.ledgerId, basis: `rb1:${'0'.repeat(64)}` };
  const request = {
    schemaVersion: 1 as const,
    commandId: 'grant',
    personId: 'person',
    expectedLedgerId: marker.ledgerId,
    ownerId: 'old',
    expectedGeneration: null,
  };
  expect(
    (await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-authority`, request))
      .status,
  ).toBe(200);
  const anonymous = createClient();
  expect(
    await anonymous.readRuntimeState({
      params: { id: workPackageId },
      query: { personId: 'person' },
    }),
  ).toMatchObject({ kind: 'refusal', status: 401, body: { error: 'unauthenticated' } });
  expect(
    await anonymous.lookupRuntimeReceipt({
      params: { id: workPackageId, commandId: 'grant' },
      query: { personId: 'person', expectedLedgerId: observation.ledgerId },
    }),
  ).toMatchObject({ kind: 'refusal', status: 401 });
  expect(
    await anonymous.acquireRuntimeAuthority({ params: { id: workPackageId }, body: request }),
  ).toMatchObject({ kind: 'refusal', status: 401 });
  expect(
    await anonymous.applyRuntimeCommands({
      params: { id: workPackageId },
      body: {
        schemaVersion: 1,
        commandId: 'claim',
        personId: 'person',
        expectedLedgerId: observation.ledgerId,
        authority: { ownerId: 'old', generation: 1 },
        expectedBasis: observation.basis,
        action: {
          kind: 'claim',
          workItemId: 'leaf',
          stepId: 'dev',
          parentClaimId: null,
          execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
        },
      },
    }),
  ).toMatchObject({ kind: 'refusal', status: 401 });
});

import { PlanCommandRunner } from '@wbs/core/module/plan-commands/plan-commands.feature';
import * as normalizers from '@wbs/core/service/command-normalizers';

import { TEST_MCP_SERVICE_SETTINGS } from '../testing/machine-grant-fixture';

test('malformed trusted command refusal throws its producer diagnostic', async () => {
  const request = await createClaimRequest();
  const errors = spyOn(h.app.decorator.logger, 'error').mockImplementation(() => undefined);
  const broken = spyOn(PlanCommandRunner.prototype, 'claimRuntime').mockImplementation(() =>
    Promise.resolve({
      ok: false,
      reason: 'resources_exhausted',
      at: 0,
      kind: 'claimWorkItem',
      detail: { resourceId: 'r', asked: 1, free: 0 },
    } as never),
  );
  try {
    expect(
      (await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-commands`, request))
        .status,
    ).toBe(500);
    expect(JSON.stringify(errors.mock.calls)).toContain('invalid runtime command refusal producer');
  } finally {
    broken.mockRestore();
    errors.mockRestore();
  }
});
test('unregistered trusted parser refusal throws its producer diagnostic', async () => {
  const request = await createClaimRequest();
  const claimed = await createClient().applyRuntimeCommands({
    params: { id: workPackageId },
    body: request,
    headers: createHeaders(),
  });
  if (claimed.kind !== 'success' || claimed.body.acceptance.kind !== 'claim')
    throw new Error('claim refused');
  const errors = spyOn(h.app.decorator.logger, 'error').mockImplementation(() => undefined);
  const broken = spyOn(normalizers, 'normalizeCommand').mockImplementation(() => {
    throw new normalizers.CommandNormalizationError('unregistered_parser_fault');
  });
  try {
    const write = {
      ...request,
      commandId: 'bad-producer',
      expectedBasis: claimed.body.acceptance.basisAfter,
      action: {
        kind: 'write',
        claim: claimed.body.acceptance.claim,
        commands: [{ kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' }],
      },
    };
    expect(
      (await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/runtime-commands`, write))
        .status,
    ).toBe(500);
    expect(JSON.stringify(errors.mock.calls)).toContain('invalid runtime parser refusal');
  } finally {
    broken.mockRestore();
    errors.mockRestore();
  }
});

test('receipt query rejects duplicate person and pin keys', async () => {
  const observation = await readState();
  const base = `/api/work-packages/${workPackageId}/runtime-commands/absent?personId=person&expectedLedgerId=${observation.ledgerId}`;
  for (const suffix of ['&personId=person', `&expectedLedgerId=${observation.ledgerId}`]) {
    expect(await h.call('ada', 'GET', base + suffix)).toEqual({
      status: 400,
      body: { error: 'invalid_query' },
    });
  }
});

test.each(['authority', 'claim', 'write'] as const)(
  'public codec identifies the real mounted %s receipt',
  async (kind) => {
    if (kind === 'authority') {
      const { observation, request, receipt } = await acquireAuthority();
      const { personId: _personId, ...operation } = request;
      expect(observation.scope).toEqual({
        organizationId: 'org-a',
        workPackageId,
        personId: 'person',
      });
      expect(receipt.scope).toEqual(observation.scope);
      expect(receipt.actorId).toBe(h.userId('ada'));
      expect(receipt.requestDigest).toBe(
        createHash('sha256')
          .update(
            canonicalRuntimeRequest(observation.scope, { ...operation, kind: 'authority' }),
            'utf8',
          )
          .digest('hex'),
      );
      expect(
        matchesRuntimeReceipt(
          observation.scope,
          { ...operation, kind: 'authority' },
          createHash('sha256')
            .update(
              canonicalRuntimeRequest(observation.scope, { ...operation, kind: 'authority' }),
              'utf8',
            )
            .digest('hex'),
          receipt,
        ),
      ).toBe(true);
      return;
    }
    const request = await createClaimRequest();
    const observation = await readState();
    expect(observation.scope).toEqual({
      organizationId: 'org-a',
      workPackageId,
      personId: 'person',
    });
    expect(request.action.execution).toEqual({
      storeId: 'store',
      runId: 'run',
      attemptId: 'attempt',
      sessionId: 'session',
    });
    const claimed = await createClient().applyRuntimeCommands({
      params: { id: workPackageId },
      body: request,
      headers: createHeaders(),
    });
    if (claimed.kind !== 'success' || claimed.body.acceptance.kind !== 'claim')
      throw new Error('claim refused');
    if (kind === 'claim') {
      const { personId: _personId, ...operation } = request;
      expect(claimed.body.scope).toEqual(observation.scope);
      expect(claimed.body.actorId).toBe(h.userId('ada'));
      expect(claimed.body.requestDigest).toBe(
        createHash('sha256')
          .update(canonicalRuntimeRequest(observation.scope, operation), 'utf8')
          .digest('hex'),
      );
      expect(
        matchesRuntimeReceipt(
          observation.scope,
          operation,
          createHash('sha256')
            .update(canonicalRuntimeRequest(observation.scope, operation), 'utf8')
            .digest('hex'),
          claimed.body,
        ),
      ).toBe(true);
      return;
    }
    const write = {
      ...request,
      commandId: 'write',
      expectedBasis: claimed.body.acceptance.basisAfter,
      action: {
        kind: 'write' as const,
        claim: claimed.body.acceptance.claim,
        commands: [
          {
            kind: 'setMeasure' as const,
            workItemId: 'leaf',
            stepId: 'dev',
            metric: 'token_actual' as const,
            value: 0,
          },
          {
            kind: 'setProgress' as const,
            workItemId: 'leaf',
            stepId: 'dev',
            state: 'done' as const,
          },
        ],
      },
    };
    const accepted = await createClient().applyRuntimeCommands({
      params: { id: workPackageId },
      body: write,
      headers: createHeaders(),
    });
    if (accepted.kind !== 'success' || accepted.body.acceptance.kind !== 'write')
      throw new Error('write refused');
    const { personId: _personId, ...operation } = write;
    expect(accepted.body.scope).toEqual(observation.scope);
    expect(accepted.body.actorId).toBe(h.userId('ada'));
    expect(accepted.body.acceptance.applied).toEqual([
      { index: 0, kind: 'setMeasure' },
      { index: 1, kind: 'setProgress' },
    ]);
    expect(accepted.body.requestDigest).toBe(
      createHash('sha256')
        .update(canonicalRuntimeRequest(observation.scope, operation), 'utf8')
        .digest('hex'),
    );
    expect(
      matchesRuntimeReceipt(
        observation.scope,
        operation,
        createHash('sha256')
          .update(canonicalRuntimeRequest(observation.scope, operation), 'utf8')
          .digest('hex'),
        accepted.body,
      ),
    ).toBe(true);
  },
);
