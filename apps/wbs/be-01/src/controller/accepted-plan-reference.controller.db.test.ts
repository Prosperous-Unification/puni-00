import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestWithout } from '@shared/plan-reference';
import { JwksTokenVerifier } from '@wbs/auth';
import {
  acceptedReferenceArtifacts,
  type ActivePlanReference,
  compileOrdinaryPlanReference,
  decodeOrdinaryPlanDocument,
  registerAcceptedPlanReference,
  type RegisterPlanReference,
  requestSchema,
  validateSchema,
  type VerifiedOrganizationCredential,
} from '@wbs/contracts';
import { installAcceptedPlanReference } from '@wbs/core/module/accepted-plan-reference/check';
import { PlanDocumentService } from '@wbs/core/module/plan-document/plan-document.resource';
import type { PlanReferencePolicy } from '@wbs/core/ports/accepted-plan-reference-store';
import { clockOf } from '@wbs/core/ports/clock';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { decodeJwt, generateKeyPair } from 'jose';

import { LocalOidcIssuers } from '../testing/local-oidc-issuer';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type ComposedHarnessOptions, OrganizationHarness } from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

const organizationId = 'org-a';
const repository = 'https://github.com/Prosperous-Unification/puni-00';
const change = 'progress-receipt-authority';
const planningCommit = '1'.repeat(40);
const sourceBaseCommit = '2'.repeat(40);
const requirementsBytes = Buffer.from('## Requirements\r\n\r\nPreserve café.\r\n', 'utf8');
const navigator = fileURLToPath(
  new URL(
    '../../../../twilight-structure/twilight-navigator/cli/src/entrypoint.ts',
    import.meta.url,
  ),
);
const browserHeaders = { origin: 'http://localhost', 'content-type': 'application/json' };
const harnesses = new Set<OrganizationHarness>();
const directories = new Set<string>();

afterEach(async () => {
  for (const harness of harnesses) await harness.closeComposed();
  harnesses.clear();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

function scratchDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'accepted-plan-reference-'));
  directories.add(directory);
  return directory;
}

async function selectOrganization(
  harness: OrganizationHarness,
  token: string,
  org = organizationId,
) {
  const headers = { ...browserHeaders, authorization: `Bearer ${token}` };
  const selection = await harness.request('/api/organization/active', {
    method: 'POST',
    headers,
    body: JSON.stringify({ organizationId: org }),
  });
  expect(selection.status, await selection.clone().text()).toBe(200);
  const cookie = selection.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('organization selection returned no cookie');
  return { ...headers, cookie, 'X-WBS-Expected-Organization': org };
}

function withHeaders(harness: OrganizationHarness, headers: HeadersInit) {
  return (method: string, path: string, body?: unknown) =>
    harness.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

type MountedRequest = ReturnType<typeof withHeaders>;

async function createProject(harness: OrganizationHarness, request: MountedRequest, name: string) {
  expect((await request('POST', '/api/projects', { name })).status).toBe(200);
  const project = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM project WHERE name = ?')
    .get(name);
  if (project === null) throw new Error('fixture project is absent');
  const path = `/api/projects/${project.id}`;
  const created = await request('POST', `${path}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Install' }],
  });
  expect(created.status, await created.clone().text()).toBe(200);
  const leaf = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id = ?')
    .get(project.id);
  if (leaf === null) throw new Error('fixture leaf is absent');
  return { projectId: project.id, leafId: leaf.id, path };
}

async function open(options: ComposedHarnessOptions = {}) {
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  let observeQueue: (() => void) | undefined;
  const messages: string[] = [];
  const harness = OrganizationHarness.openComposedWith({
    ...options,
    sessionBinding: true,
    now,
    onBorrowedUnitOfWork: () => observeQueue?.(),
    logDestination: {
      write(chunk) {
        messages.push(chunk);
      },
    },
  });
  harnesses.add(harness);
  await harness.register('ada');
  harness.organization(organizationId);
  harness.member(organizationId, 'ada', 'super_admin');
  harness.activate();

  const signIn = await harness.request('/api/auth/login', {
    method: 'POST',
    headers: browserHeaders,
    body: JSON.stringify({ username: 'ada', password: 'correct-horse' }),
  });
  expect(signIn.status).toBe(200);
  const login: unknown = await signIn.json();
  if (
    typeof login !== 'object' ||
    login === null ||
    !('token' in login) ||
    typeof login.token !== 'string'
  )
    throw new Error('password login returned no token');
  const token = login.token;
  const headers = await selectOrganization(harness, token);
  const request = withHeaders(harness, headers);
  const project = await createProject(harness, request, 'Plan');
  const { projectId, path } = project;
  const scope = { organizationId, projectId, repository, change };
  const accountId = harness.userId('ada');
  const grant = {
    scope,
    operation: 'accept_reference',
    subject: { kind: 'first_party', accountId },
  } satisfies PlanReferencePolicy['grants'][number];
  const collection = `${path}/accepted-plan-references`;
  return {
    harness,
    request,
    headers,
    token,
    collection,
    scope,
    accountId,
    now,
    grant,
    messages,
    ...project,
    advance: () => {
      clockOffset += 60_000;
    },
    onQueued: (observer: (() => void) | undefined) => {
      observeQueue = observer;
    },
  };
}

type Fixture = Awaited<ReturnType<typeof open>>;
type Grant = PlanReferencePolicy['grants'][number];

function setPolicy(fixture: Fixture, grants: readonly Grant[]) {
  expect(
    fixture.harness.sqlite.run(
      'UPDATE accepted_plan_reference_policy SET revision = revision + 1, grants = ? WHERE singleton = 1',
      [JSON.stringify(grants)],
    ).changes,
  ).toBe(1);
}

async function exportPlan(request: MountedRequest, path: string) {
  const exported = await request('GET', `${path}/export?format=json`);
  expect(exported.status, await exported.clone().text()).toBe(200);
  return Buffer.from(await exported.arrayBuffer());
}

async function navigatorArtifacts(directory: string, exportBytes: Buffer) {
  const exportPath = join(directory, 'export.json');
  const requirementsPath = join(directory, 'requirements.md');
  writeFileSync(exportPath, exportBytes);
  writeFileSync(requirementsPath, requirementsBytes);
  const compiled = Bun.spawnSync({
    cmd: [
      process.execPath,
      'run',
      navigator,
      'plan-reference',
      '--export',
      exportPath,
      '--repository',
      repository,
      '--change',
      change,
      '--planning-commit',
      planningCommit,
      '--source-base',
      sourceBaseCommit,
      '--requirements',
      requirementsPath,
      '--output',
      directory,
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(compiled.exitCode, compiled.stderr.toString()).toBe(0);
  const rawReference: unknown = JSON.parse(
    readFileSync(join(directory, 'plan-reference.json'), 'utf8'),
  );
  const rawTasks: unknown = JSON.parse(readFileSync(join(directory, 'tasks.json'), 'utf8'));
  const checkedReference = await validateSchema(
    requestSchema(acceptedReferenceArtifacts.get('reference')),
    rawReference,
  );
  if (checkedReference.issues !== undefined)
    throw new Error(
      `invalid Navigator plan-reference.json: ${JSON.stringify(checkedReference.issues)}`,
    );
  const checkedTasks = await validateSchema(
    requestSchema(acceptedReferenceArtifacts.get('tasks')),
    rawTasks,
  );
  if (checkedTasks.issues !== undefined)
    throw new Error(`invalid Navigator tasks.json: ${JSON.stringify(checkedTasks.issues)}`);
  const { value: reference } = checkedReference;
  const { value: tasks } = checkedTasks;
  expect(reference.referenceDigest).toBe(compiled.stdout.toString().trim());
  return { reference, tasks };
}

function offer(
  exportBytes: Buffer,
  coordinates = { planningCommit, sourceBaseCommit },
): RegisterPlanReference {
  const { tasks, reference } = compileOrdinaryPlanReference({
    exportBytes,
    requirementsBytes,
    repository,
    change,
    ...coordinates,
  });
  return {
    repository,
    change,
    ...coordinates,
    tasks,
    reference,
    expected: { kind: 'absent' },
    exportBytes: exportBytes.toString('base64'),
    requirementsBytes: requirementsBytes.toString('base64'),
  };
}

async function expectRegisteredResponse(response: Response): Promise<ActivePlanReference> {
  expect(response.status, await response.clone().text()).toBe(201);
  const body: unknown = await response.json();
  const checked = await validateSchema(registerAcceptedPlanReference.responses[0].schema, body);
  if (checked.issues !== undefined)
    throw new Error(`invalid registration response: ${JSON.stringify(checked.issues)}`);
  return checked.value;
}

async function expectRegistration(fixture: Fixture, candidate: RegisterPlanReference) {
  return expectRegisteredResponse(await fixture.request('POST', fixture.collection, candidate));
}

function post(fixture: Fixture, candidate: RegisterPlanReference) {
  return fixture.request('POST', fixture.collection, candidate);
}

async function expectRefusal(response: Response, status: number, error: string) {
  const body: unknown = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  expect(body).toEqual({ error });
}

function countAccepted(fixture: Fixture) {
  const rows = fixture.harness.sqlite
    .query<{ history: number }, []>('SELECT count(*) AS history FROM accepted_plan_reference')
    .get();
  if (rows === null) throw new Error('fixture history count is missing');
  return rows.history;
}

function historicalPath(
  fixture: Fixture,
  version: number,
  referenceDigest: string,
  scope = { repository, change },
) {
  const query = new URLSearchParams({ ...scope, version: String(version), referenceDigest });
  return `${fixture.collection}?${query}`;
}

test('registers a scoped ordinary reference and retrieves the immutable artifacts', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const exportBytes = await exportPlan(fixture.request, fixture.path);
  const { reference, tasks } = await navigatorArtifacts(scratchDirectory(), exportBytes);
  const { referenceDigest } = reference;
  expect(reference).toMatchObject({
    planDocumentVersion: 11,
    exportDigest: createHash('sha256').update(exportBytes).digest('hex'),
    planRef: {
      plan: fixture.projectId,
      planningCommit,
      sourceBaseCommit,
      requirementsDigest: createHash('sha256').update(requirementsBytes).digest('hex'),
    },
  });
  expect(tasks).toMatchObject({ schemaVersion: 2, tasks: [{ name: 'Install' }] });

  fixture.advance();
  const artifacts = {
    exportBytes: exportBytes.toString('base64'),
    requirementsBytes: requirementsBytes.toString('base64'),
    reference,
    tasks,
  };
  const beforeAcceptance = fixture.now();
  const accepted = await expectRegistration(fixture, {
    expected: { kind: 'absent' },
    repository,
    change,
    planningCommit,
    sourceBaseCommit,
    ...artifacts,
  });
  const afterAcceptance = fixture.now();
  const lock = { ...fixture.scope, version: 1, referenceDigest };
  expect(accepted).toMatchObject({ lock });
  expect(typeof accepted.writeBasis).toBe('string');
  expect(accepted.writeBasis).not.toBe('');
  const retained = readReferenceRow(fixture, [
    lock.organizationId,
    lock.projectId,
    lock.repository,
    lock.change,
    lock.version,
    lock.referenceDigest,
  ]);
  if (retained === null) throw new Error('accepted reference was not retained');
  expect(JSON.parse(retained.subject)).toEqual(fixture.grant.subject);
  expect(retained.accepted_at).toBeGreaterThanOrEqual(beforeAcceptance);
  expect(retained.accepted_at).toBeLessThanOrEqual(afterAcceptance);

  fixture.advance();
  const activeQuery = new URLSearchParams({ repository, change });
  const active = await fixture.request('GET', `${fixture.collection}?${activeQuery}`);
  expect(active.status).toBe(200);
  expect(await active.json()).toEqual({ lock, writeBasis: accepted.writeBasis });
  const restored = await fixture.request('GET', historicalPath(fixture, 1, referenceDigest));
  expect(restored.status, await restored.clone().text()).toBe(200);
  expect(await restored.json()).toMatchObject({ lock, ...artifacts });
  expect(readReferenceRow(fixture, rowAddress(retained))).toEqual(retained);
});

test.each([
  'no grant',
  'wrong organization',
  'wrong project',
  'wrong repository',
  'wrong change',
  'wrong operation',
  'wrong subject',
] as const)('refuses an operator when the readable policy has %s', async (fault) => {
  const fixture = await open();
  const { grant } = fixture;
  switch (fault) {
    case 'no grant':
      break;
    case 'wrong operation':
      setPolicy(fixture, [{ ...grant, operation: 'submit_assertion' }]);
      break;
    case 'wrong subject':
      setPolicy(fixture, [{ ...grant, subject: { ...grant.subject, accountId: 'someone-else' } }]);
      break;
    case 'wrong organization':
      setPolicy(fixture, [{ ...grant, scope: { ...grant.scope, organizationId: 'org-b' } }]);
      break;
    case 'wrong project':
      setPolicy(fixture, [{ ...grant, scope: { ...grant.scope, projectId: 'foreign' } }]);
      break;
    case 'wrong repository':
      setPolicy(fixture, [
        { ...grant, scope: { ...grant.scope, repository: 'https://example.test/foreign' } },
      ]);
      break;
    case 'wrong change':
      setPolicy(fixture, [{ ...grant, scope: { ...grant.scope, change: 'another-change' } }]);
      break;
  }
  await expectRefusal(
    await post(fixture, offer(await exportPlan(fixture.request, fixture.path))),
    403,
    'forbidden',
  );
  expect(countAccepted(fixture)).toBe(0);
});

test.each([
  ['missing', 'DELETE FROM accepted_plan_reference_policy'],
  [
    'unreadable',
    'ALTER TABLE accepted_plan_reference_policy RENAME TO parked_acceptance_policy; CREATE VIEW accepted_plan_reference_policy AS SELECT singleton, revision, grants FROM unavailable_acceptance_policy',
  ],
  ['malformed', "UPDATE accepted_plan_reference_policy SET grants = '{broken' WHERE singleton = 1"],
] as const)('fails when trusted operator policy is %s', async (fault, inject) => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  fixture.harness.sqlite.run(inject);
  const response = await post(fixture, candidate);
  expect(response.status, await response.clone().text()).toBe(500);
  expect(fixture.messages.join('')).toContain(`accepted plan reference policy is ${fault}`);
  expect(countAccepted(fixture)).toBe(0);
});

test.each([
  'requirements',
  'export',
  'tasks',
  'planning commit',
  'source base commit',
  'reference',
] as const)(
  'refuses independently substituted %s under the offered v11 reference',
  async (fault) => {
    const fixture = await open();
    setPolicy(fixture, [fixture.grant]);
    const bytes = await exportPlan(fixture.request, fixture.path);
    const candidate = offer(bytes);
    switch (fault) {
      case 'requirements':
        candidate.requirementsBytes = Buffer.from('Different requirements.\n').toString('base64');
        break;
      case 'export':
        candidate.exportBytes = Buffer.concat([bytes, Buffer.from('\n')]).toString('base64');
        break;
      case 'tasks':
        candidate.tasks = {
          ...candidate.tasks,
          tasks: candidate.tasks.tasks.map((task) => ({ ...task, name: 'Altered' })),
        };
        break;
      case 'planning commit':
        candidate.planningCommit = 'd'.repeat(40);
        break;
      case 'source base commit':
        candidate.sourceBaseCommit = 'e'.repeat(40);
        break;
      case 'reference':
        candidate.reference = { ...candidate.reference, taskCount: 2 };
        break;
    }
    await expectRefusal(await post(fixture, candidate), 400, 'invalid_plan_artifacts');
    expect(countAccepted(fixture)).toBe(0);
  },
);

test('refuses a complete reference from a different WBS project', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const other = await createProject(fixture.harness, fixture.request, 'Other');
  const candidate = offer(await exportPlan(fixture.request, other.path));
  await expectRefusal(await post(fixture, candidate), 400, 'invalid_plan_artifacts');
  expect(countAccepted(fixture)).toBe(0);
});

test('conceals a foreign project on both register and historical lookup', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const accepted = await expectRegistration(fixture, candidate);
  fixture.harness.organization('org-b');
  fixture.harness.member('org-b', 'ada', 'super_admin');
  const headers = await selectOrganization(fixture.harness, fixture.token, 'org-b');
  const foreign = withHeaders(fixture.harness, headers);
  await expectRefusal(await foreign('POST', fixture.collection, candidate), 404, 'not_found');
  await expectRefusal(
    await foreign('GET', historicalPath(fixture, 1, accepted.lock.referenceDigest)),
    404,
    'not_found',
  );
  expect(countAccepted(fixture)).toBe(1);
});

async function duringWriterQueue<Value>(
  fixture: Fixture,
  request: () => Promise<Value>,
  intervene: () => void,
) {
  const turn = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const held = fixture.harness.holdWriteTurn(turn.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const queued = Promise.withResolvers<undefined>();
  fixture.onQueued(() => {
    queued.resolve(undefined);
  });
  const pending = request();
  try {
    await Promise.race([
      queued.promise,
      pending.then(async (response) => {
        const reply =
          response instanceof Response
            ? `${String(response.status)} ${await response.clone().text()}`
            : JSON.stringify(response);
        throw new Error(`request answered before reaching the writer: ${reply}`);
      }),
    ]);
    intervene();
  } finally {
    fixture.onQueued(undefined);
    turn.resolve(undefined);
    await held;
  }
  return pending;
}

test.each(['browser credential', 'project access', 'protected grant'] as const)(
  'rechecks queued %s changes inside the writer',
  async (changed) => {
    const fixture = await open();
    const { harness, accountId } = fixture;
    setPolicy(fixture, [fixture.grant]);
    const candidate = offer(await exportPlan(fixture.request, fixture.path));
    const pending = await duringWriterQueue(
      fixture,
      () => post(fixture, candidate),
      () => {
        switch (changed) {
          case 'browser credential': {
            revokeNativeBinding(harness, {
              kind: 'native',
              userId: accountId,
              digest: createHash('sha256').update(fixture.token).digest('hex'),
              expiresAt: nativeExpiry(fixture.token),
            });
            break;
          }
          case 'project access':
            harness.sqlite.run(
              "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = ? AND user_id = ?",
              [organizationId, accountId],
            );
            break;
          case 'protected grant':
            setPolicy(fixture, []);
            break;
        }
      },
    );
    await expectRefusal(
      pending,
      403,
      changed === 'browser credential' ? 'no_active_organization' : 'forbidden',
    );
    expect(countAccepted(fixture)).toBe(0);
  },
);

test('refuses a stale live ordinary export after a work item edit', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const edited = await fixture.request('POST', `${fixture.path}/commands`, {
    commands: [{ kind: 'patchWorkItem', workItemId: fixture.leafId, patch: { name: 'Edited' } }],
  });
  expect(edited.status, await edited.clone().text()).toBe(200);
  await expectRefusal(await post(fixture, candidate), 409, 'live_plan_changed');
  expect(countAccepted(fixture)).toBe(0);
});

test('compares a referenced directory rename outside the project revision', async () => {
  const fixture = await open();
  const { harness, request, path, projectId, leafId } = fixture;
  setPolicy(fixture, [fixture.grant]);
  const created = await request('POST', '/api/directory/commands', {
    commands: [{ kind: 'createTag', name: 'Original' }],
  });
  expect(created.status, await created.clone().text()).toBe(200);
  const tag = harness.sqlite
    .query<{ resource_id: string }, []>(
      "SELECT resource_id FROM tag_organization WHERE name = 'Original'",
    )
    .get();
  if (tag === null) throw new Error('fixture tag is absent');
  const linked = await request('POST', `${path}/commands`, {
    commands: [{ kind: 'patchWorkItem', workItemId: leafId, patch: { tagIds: [tag.resource_id] } }],
  });
  expect(linked.status, await linked.clone().text()).toBe(200);
  const bytes = await exportPlan(request, path);
  expect(JSON.parse(bytes.toString('utf8'))).toMatchObject({
    directory: { tags: [{ name: 'Original' }] },
  });
  const candidate = offer(bytes);
  const revision = harness.sqlite.query<{ revision: number }, [string]>(
    'SELECT revision FROM project WHERE id = ?',
  );
  const before = revision.get(projectId);
  const refused = await duringWriterQueue(
    fixture,
    () => post(fixture, candidate),
    () => {
      expect(
        harness.sqlite.run(
          "UPDATE tag_organization SET name = 'Edited' WHERE resource_id = ? AND organization_id = ?",
          [tag.resource_id, organizationId],
        ).changes,
      ).toBe(1);
      expect(revision.get(projectId)).toEqual(before);
    },
  );
  await expectRefusal(refused, 409, 'live_plan_changed');
  expect(countAccepted(fixture)).toBe(0);
});

async function connect(fixture: Fixture) {
  const { harness, request, projectId, leafId } = fixture;
  const other = await createProject(harness, request, 'Predecessor');
  seedDependencyAuthority(harness.databasePath());
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('remote-fs', ?, ?, ?, ?, ?, 'whole', 'whole', 'FS')",
    [organizationId, other.projectId, projectId, other.leafId, leafId],
  );
}

test.each(['actual v12 wire input', 'valid v11 input after connection'] as const)(
  'refuses %s',
  async (fault) => {
    const fixture = await open();
    setPolicy(fixture, [fixture.grant]);
    const candidate = offer(await exportPlan(fixture.request, fixture.path));
    await connect(fixture);
    const connected = await exportPlan(fixture.request, fixture.path);
    expect(JSON.parse(connected.toString('utf8'))).toMatchObject({ document: { version: 12 } });
    if (fault === 'actual v12 wire input') {
      await expectRefusal(
        await post(fixture, { ...candidate, exportBytes: connected.toString('base64') }),
        400,
        'unsupported_plan_version',
      );
    } else {
      await expectRefusal(await post(fixture, candidate), 409, 'connected_plan');
    }
    expect(countAccepted(fixture)).toBe(0);
  },
);

test.each(['absent', 'version'] as const)(
  'serializes competing writes expecting %s',
  async (kind) => {
    const fixture = await open();
    setPolicy(fixture, [fixture.grant]);
    const bytes = await exportPlan(fixture.request, fixture.path);
    const initial = offer(bytes);
    const expected: RegisterPlanReference['expected'] =
      kind === 'absent'
        ? { kind }
        : {
            kind,
            version: 1,
            referenceDigest: (await expectRegistration(fixture, initial)).lock.referenceDigest,
          };
    const a = { ...offer(bytes, { planningCommit: 'a'.repeat(40), sourceBaseCommit }), expected };
    const b = { ...offer(bytes, { planningCommit: 'b'.repeat(40), sourceBaseCommit }), expected };
    const competed = await Promise.all([post(fixture, a), post(fixture, b)]);
    expect(competed.map(({ status }) => status).sort()).toEqual([201, 409]);
    const refused = competed.find(({ status }) => status === 409);
    if (refused === undefined) throw new Error('fixture has no competing refusal');
    await expectRefusal(refused, 409, 'reference_changed');
    await expectRefusal(await post(fixture, a), 409, 'reference_changed');
    expect(countAccepted(fixture)).toBe(kind === 'absent' ? 1 : 2);
  },
);

test('requires both the exact prior version and the complete reference digest', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  await expectRefusal(
    await post(fixture, {
      ...candidate,
      expected: {
        kind: 'version',
        version: 1,
        referenceDigest: candidate.reference.referenceDigest,
      },
    }),
    409,
    'reference_changed',
  );
  const first = await expectRegistration(fixture, candidate);
  const { version, referenceDigest } = first.lock;
  for (const expected of [
    { kind: 'version', version: version + 1, referenceDigest },
    { kind: 'version', version, referenceDigest: '0'.repeat(64) },
  ] as const) {
    await expectRefusal(await post(fixture, { ...candidate, expected }), 409, 'reference_changed');
  }
  expect(countAccepted(fixture)).toBe(1);
});

test('retains distinct versions for A to B to A and authorizes history after restart', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const bytes = await exportPlan(fixture.request, fixture.path);
  const a = offer(bytes);
  const baseB = offer(bytes, { planningCommit: 'b'.repeat(40), sourceBaseCommit });
  const first = await expectRegistration(fixture, a);
  const second = await expectRegistration(fixture, {
    ...baseB,
    expected: {
      kind: 'version',
      version: first.lock.version,
      referenceDigest: first.lock.referenceDigest,
    },
  });
  const third = await expectRegistration(fixture, {
    ...a,
    expected: {
      kind: 'version',
      version: second.lock.version,
      referenceDigest: second.lock.referenceDigest,
    },
  });
  expect(third.lock).toEqual({ ...first.lock, version: 3 });
  expect(new Set([first.writeBasis, second.writeBasis, third.writeBasis]).size).toBe(3);

  const edited = await fixture.request('POST', `${fixture.path}/commands`, {
    commands: [
      { kind: 'patchWorkItem', workItemId: fixture.leafId, patch: { name: 'After acceptance' } },
    ],
  });
  expect(edited.status, await edited.clone().text()).toBe(200);
  const backup = join(scratchDirectory(), 'retained.db');
  fixture.harness.sqlite.run('VACUUM INTO ?', [backup]);
  await fixture.harness.closeComposed();
  harnesses.delete(fixture.harness);
  const restarted = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    migrate: (path) => {
      copyFileSync(backup, path);
    },
  });
  harnesses.add(restarted);
  const read = withHeaders(restarted, fixture.headers);
  const historical = historicalPath(fixture, 1, first.lock.referenceDigest);
  const restored = await read('GET', historical);
  expect(restored.status, await restored.clone().text()).toBe(200);
  expect(await restored.json()).toEqual({
    lock: first.lock,
    exportBytes: a.exportBytes,
    requirementsBytes: a.requirementsBytes,
    tasks: a.tasks,
    reference: a.reference,
  });
  await expectRefusal(
    await read('GET', historicalPath(fixture, 1, second.lock.referenceDigest)),
    404,
    'not_found',
  );
  await expectRefusal(
    await read('GET', historicalPath(fixture, 2, first.lock.referenceDigest)),
    404,
    'not_found',
  );
  await expectRefusal(
    await read(
      'GET',
      historicalPath(fixture, 1, first.lock.referenceDigest, {
        repository: 'https://example.test/other',
        change,
      }),
    ),
    404,
    'not_found',
  );
  await expectRefusal(
    await read(
      'GET',
      historicalPath(fixture, 1, first.lock.referenceDigest, {
        repository,
        change: 'other-change',
      }),
    ),
    404,
    'not_found',
  );

  restarted.sqlite.run(
    'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
    [organizationId, fixture.accountId],
  );
  await expectRefusal(await read('GET', historical), 403, 'not_a_member');
});

test('refuses a scoped local identity without direct sign-in verifier evidence', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const backup = join(scratchDirectory(), 'authority.db');
  fixture.harness.sqlite.run('VACUUM INTO ?', [backup]);
  const local = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    migrate: (path) => {
      copyFileSync(backup, path);
    },
    localIdentity: { id: fixture.accountId, username: 'ada', scopes: ['read', 'write'] },
  });
  harnesses.add(local);
  const request = withHeaders(local, fixture.headers);
  expect((await request('GET', fixture.path)).status).toBe(200);
  await expectRefusal(await request('POST', fixture.collection, candidate), 403, 'forbidden');
  expect(countAccepted({ ...fixture, harness: local })).toBe(0);
});

test('refuses a real machine grant for an agent bound to the granted human account', async () => {
  const fixture = await open({ machineGrants: await forwardingMachineGrants() });
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  addAgentPerson(fixture.harness.sqlite, 'agent-ada', organizationId, fixture.accountId);
  const { key } = await issueApiKey(fixture.harness.sqlite, {
    organizationId,
    personId: 'agent-ada',
    issuedBy: fixture.accountId,
  });
  expect((await callForwarded(fixture.harness, key, 'GET', fixture.path)).status).toBe(200);
  expect(await callForwarded(fixture.harness, key, 'POST', fixture.collection, candidate)).toEqual({
    status: 403,
    body: { error: 'forbidden' },
  });
  expect(countAccepted(fixture)).toBe(0);
});

test('refuses a live consent credential bound to the same granted account', async () => {
  const keys = await generateKeyPair('RS256');
  const fixture = await open({ delegationKey: keys.publicKey });
  const { harness, accountId } = fixture;
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  mapUpstream(harness, 'ada', 'sub-ada');
  const personId = 'agent-ada';
  const credentialId = crypto.randomUUID();
  addAgentPerson(harness.sqlite, personId, organizationId, accountId);
  harness.sqlite.run(
    "INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, mcp_family_id, name, created_at, created_by) VALUES (?, ?, ?, ?, 'mcp_consent', 'family-1', 'Fixture consent', 1, ?)",
    [credentialId, organizationId, personId, accountId, accountId],
  );
  const token = () =>
    delegationFor(harness, keys.privateKey, 'ada', organizationId, 'sub-ada', {
      credentialId,
      personId,
    });
  expect((await harness.callWith(await token(), 'GET', fixture.path)).status).toBe(200);
  expect(await harness.callWith(await token(), 'POST', fixture.collection, candidate)).toEqual({
    status: 403,
    body: { error: 'forbidden' },
  });
  expect(countAccepted(fixture)).toBe(0);
});

test('admits the verified upstream human and refuses a delegation carrying that same granted subject', async () => {
  const issuers = new LocalOidcIssuers();
  try {
    const identityProvider = await issuers.add('idp.test');
    const keys = await generateKeyPair('RS256');
    const audience = 'api://wbs';
    const fixture = await open({
      delegationKey: keys.publicKey,
      upstreamCredential: {
        verifier: new JwksTokenVerifier({
          audience,
          issuer: identityProvider.url,
          jwksUri: issuers.directJwksUrl(identityProvider),
        }),
        groupPrefix: 'dev',
        groupsClaim: 'wbs_groups',
      },
    });
    mapUpstream(fixture.harness, 'ada', 'sub-ada');
    const upstream = {
      kind: 'upstream',
      accountId: fixture.accountId,
      issuer: identityProvider.url,
      subject: 'sub-ada',
    } as const;
    setPolicy(fixture, [{ ...fixture.grant, subject: upstream }]);
    const candidate = offer(await exportPlan(fixture.request, fixture.path));
    const token = await identityProvider.sign({
      sub: upstream.subject,
      aud: audience,
      wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
    });
    const direct = withHeaders(fixture.harness, await selectOrganization(fixture.harness, token));
    const first = await expectRegisteredResponse(
      await direct('POST', fixture.collection, candidate),
    );
    const delegate = () =>
      delegationFor(fixture.harness, keys.privateKey, 'ada', organizationId, upstream.subject);
    expect((await fixture.harness.callWith(await delegate(), 'GET', fixture.path)).status).toBe(
      200,
    );
    expect(
      await fixture.harness.callWith(await delegate(), 'POST', fixture.collection, {
        ...candidate,
        expected: {
          kind: 'version',
          version: first.lock.version,
          referenceDigest: first.lock.referenceDigest,
        },
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(countAccepted(fixture)).toBe(1);

    const readOnly = await identityProvider.sign({
      sub: upstream.subject,
      aud: audience,
      wbs_groups: ['dev:wbs:read'],
    });
    const reader = withHeaders(
      fixture.harness,
      await selectOrganization(fixture.harness, readOnly),
    );
    const historical = historicalPath(fixture, 1, first.lock.referenceDigest);
    expect((await reader('GET', historical)).status).toBe(200);
    await expectRefusal(
      await reader('POST', fixture.collection, {
        ...candidate,
        expected: { kind: 'version', version: 1, referenceDigest: first.lock.referenceDigest },
      }),
      403,
      'insufficient_scope',
    );
    const writeOnly = await identityProvider.sign({
      sub: upstream.subject,
      aud: audience,
      wbs_groups: ['dev:wbs:write'],
    });
    const writer = withHeaders(
      fixture.harness,
      await selectOrganization(fixture.harness, writeOnly),
    );
    await expectRefusal(await writer('GET', historical), 403, 'insufficient_scope');
    expect(countAccepted(fixture)).toBe(1);
  } finally {
    await issuers.stop();
  }
});

test('requires explicit acceptance expectations, canonical byte transport, and a complete lookup selector', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const { expected: _expected, ...withoutExpectation } = candidate;
  for (const invalid of [
    withoutExpectation,
    { ...candidate, expected: { kind: 'version', version: 1 } },
    { ...candidate, requirementsBytes: 'YR==' },
  ]) {
    await expectRefusal(
      await fixture.request('POST', fixture.collection, invalid),
      400,
      'invalid_body',
    );
  }
  expect(countAccepted(fixture)).toBe(0);
  const first = await expectRegistration(fixture, candidate);
  for (const incomplete of [
    new URLSearchParams({ repository, change, version: '1' }),
    new URLSearchParams({ repository, change, referenceDigest: first.lock.referenceDigest }),
  ]) {
    await expectRefusal(
      await fixture.request('GET', `${fixture.collection}?${incomplete}`),
      400,
      'invalid_query',
    );
  }
  await expectRefusal(
    await fixture.request(
      'GET',
      historicalPath(fixture, 9007199254740992, first.lock.referenceDigest),
    ),
    400,
    'invalid_query',
  );
  expect(countAccepted(fixture)).toBe(1);
});

test('rechecks read access in the writer before disclosing a queued historical lookup', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const first = await expectRegistration(fixture, candidate);
  const historical = historicalPath(fixture, 1, first.lock.referenceDigest);
  const denied = await duringWriterQueue(
    fixture,
    () => fixture.request('GET', historical),
    () => {
      fixture.harness.sqlite.run(
        'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
        [organizationId, fixture.accountId],
      );
    },
  );
  await expectRefusal(denied, 403, 'not_a_member');
  expect(countAccepted(fixture)).toBe(1);
});

test('does not disclose a retained reference with a foreign organization in its lock', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const first = await expectRegistration(
    fixture,
    offer(await exportPlan(fixture.request, fixture.path)),
  );
  const { harness, projectId } = fixture;
  // A mis-scoped retained row would pass the project and version identity by themselves.
  expect(
    harness.sqlite.run(
      "INSERT INTO accepted_plan_reference (organization_id, project_id, repository, change, version, reference_digest, write_basis, artifacts, subject, accepted_at, policy_revision) SELECT 'org-b', project_id, repository, change, 2, reference_digest, write_basis, artifacts, subject, accepted_at, policy_revision FROM accepted_plan_reference WHERE project_id = ? AND version = 1",
      [projectId],
    ).changes,
  ).toBe(1);
  await expectRefusal(
    await fixture.request('GET', historicalPath(fixture, 2, first.lock.referenceDigest)),
    404,
    'not_found',
  );
  expect(countAccepted(fixture)).toBe(2);
});

test('refuses an ordinary export when the live source can no longer produce a version-11 document', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  expect(
    fixture.harness.sqlite.run('UPDATE step SET code = NULL WHERE project_id = ?', [
      fixture.projectId,
    ]).changes,
  ).toBeGreaterThan(0);
  await expectRefusal(await post(fixture, candidate), 409, 'live_plan_unavailable');
  expect(countAccepted(fixture)).toBe(0);
});

test('refuses a register whose expected browser organization disagrees with current access', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const request = withHeaders(fixture.harness, {
    ...fixture.headers,
    'X-WBS-Expected-Organization': 'another-org',
  });
  await expectRefusal(
    await request('POST', fixture.collection, candidate),
    409,
    'organization_context_changed',
  );
  expect(countAccepted(fixture)).toBe(0);
});

test('does not match a historical reference from another project in the same organization', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const first = await expectRegistration(
    fixture,
    offer(await exportPlan(fixture.request, fixture.path)),
  );
  const other = await createProject(fixture.harness, fixture.request, 'Other');
  const query = new URLSearchParams({
    repository,
    change,
    version: '1',
    referenceDigest: first.lock.referenceDigest,
  });
  await expectRefusal(
    await fixture.request('GET', `${other.path}/accepted-plan-references?${query}`),
    404,
    'not_found',
  );
  expect(countAccepted(fixture)).toBe(1);
});

test('fails on malformed retained artifacts instead of presenting missing history', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const first = await expectRegistration(fixture, candidate);
  fixture.harness.sqlite.run(
    "UPDATE accepted_plan_reference SET artifacts = '{}' WHERE version = 1",
  );
  const response = await fixture.request(
    'GET',
    historicalPath(fixture, 1, first.lock.referenceDigest),
  );
  expect(response.status, await response.clone().text()).toBe(500);
  expect(countAccepted(fixture)).toBe(1);
});

function nativeExpiry(token: string): number {
  const claims = decodeJwt(token);
  if (claims.exp === undefined) throw new Error('fixture access token has no expiration');
  return claims.exp * 1000;
}

function assertNativeBinding(
  binding: VerifiedOrganizationCredential | undefined,
): asserts binding is VerifiedOrganizationCredential & { readonly kind: 'native' } {
  if (binding?.kind !== 'native')
    throw new Error('direct caller fixture has no native token evidence');
}

function revokeNativeBinding(
  harness: OrganizationHarness,
  binding: { kind: 'native'; userId: string; digest: string; expiresAt: number },
) {
  harness.sqlite.run(
    'INSERT INTO browser_credential_revocations (kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
    [binding.kind, binding.userId, binding.digest, binding.expiresAt, Date.now()],
  );
}

const directClock = clockOf({ now: Date.now, newId: () => crypto.randomUUID() });

async function directCaller(fixture: Fixture, username: string) {
  const { harness } = fixture;
  const { cookie } = await selectOrganization(harness, harness.token(username));
  const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  const principal = await harness.authenticatedCommandPrincipal(username, value);
  const expectedAccess = {
    kind: 'scoped' as const,
    scope: { organizationId, userId: principal.id, role: 'super_admin' as const },
  };
  return { principal, expectedAccess };
}

test('refuses a valid direct read-only registration inside the writer', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const caller = await directCaller(fixture, 'ada');
  const reader = { ...caller, principal: { ...caller.principal, scopes: ['read'] as const } };
  const { acceptedPlanReferences: references } = installAcceptedPlanReference({
    source: fixture.harness.publicWrites(),
    clock: directClock,
  });
  const decision = await references.register(fixture.projectId, reader, candidate);
  expect({ decision, rows: countAccepted(fixture) }).toEqual({
    decision: { ok: false, error: 'insufficient_scope' },
    rows: 0,
  });
});

test.each(['register', 'read'] as const)(
  'retains direct %s caller evidence after alias replacement and revocation',
  async (operation) => {
    const fixture = await open();
    const { harness, projectId, scope } = fixture;
    await harness.register('grace');
    harness.member(organizationId, 'grace', 'super_admin');
    const caller = await directCaller(fixture, 'ada');
    const replacement = await directCaller(fixture, 'grace');
    const binding = caller.principal.organizationBinding?.credential;
    assertNativeBinding(binding);
    setPolicy(fixture, [
      fixture.grant,
      { ...fixture.grant, subject: { kind: 'first_party', accountId: replacement.principal.id } },
    ]);
    const candidate = offer(await exportPlan(fixture.request, fixture.path));
    const previous = operation === 'read' ? await expectRegistration(fixture, candidate) : null;
    const { acceptedPlanReferences: references } = installAcceptedPlanReference({
      source: harness.publicWrites(),
      clock: directClock,
    });
    const decision = await duringWriterQueue(
      fixture,
      async () =>
        previous === null
          ? references.register(projectId, caller, candidate)
          : references.read(projectId, caller, scope, previous.lock),
      () => {
        revokeNativeBinding(harness, binding);
        Object.assign(caller.principal, replacement.principal);
        Object.assign(caller.expectedAccess.scope, replacement.expectedAccess.scope);
      },
    );
    expect(decision).toEqual({ ok: false, refusal: 'no_active_organization' });
    expect(countAccepted(fixture)).toBe(previous === null ? 0 : 1);
  },
);

test('refuses a non-finite direct reference task count at registration', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const caller = await directCaller(fixture, 'ada');
  const { acceptedPlanReferences: references } = installAcceptedPlanReference({
    source: fixture.harness.publicWrites(),
    clock: directClock,
  });
  const overflow = {
    ...candidate,
    reference: { ...candidate.reference, taskCount: Number.POSITIVE_INFINITY },
  };
  const decision = await references.register(fixture.projectId, caller, overflow).then(
    (registered) => registered,
    (cause: unknown) => {
      if (!(cause instanceof Error)) throw cause;
      return { unexpectedFailure: cause.message };
    },
  );
  expect({ decision, rows: countAccepted(fixture) }).toEqual({
    decision: { ok: false, error: 'invalid_plan_artifacts' },
    rows: 0,
  });
  await expectRegistration(fixture, candidate);
  expect(countAccepted(fixture)).toBe(1);
});

test('archives the original offer when the in-process caller replaces its input while queued', async () => {
  const fixture = await open();
  const caller = await directCaller(fixture, 'ada');
  setPolicy(fixture, [fixture.grant]);
  const bytes = await exportPlan(fixture.request, fixture.path);
  const candidate = offer(bytes);
  const original = structuredClone(candidate);
  const alternate = offer(bytes, { planningCommit: '4'.repeat(40), sourceBaseCommit });
  const { acceptedPlanReferences: references } = installAcceptedPlanReference({
    source: fixture.harness.publicWrites(),
    clock: directClock,
  });
  const decision = await duringWriterQueue(
    fixture,
    () => references.register(fixture.projectId, caller, candidate),
    () => Object.assign(candidate, alternate),
  );
  expect(decision).toMatchObject({
    ok: true,
    value: { lock: { version: 1, referenceDigest: original.reference.referenceDigest } },
  });
  const restored = await fixture.request(
    'GET',
    historicalPath(fixture, 1, original.reference.referenceDigest),
  );
  expect(restored.status, await restored.clone().text()).toBe(200);
  expect(await restored.json()).toMatchObject({
    lock: { ...fixture.scope, version: 1, referenceDigest: original.reference.referenceDigest },
    exportBytes: original.exportBytes,
    requirementsBytes: original.requirementsBytes,
    tasks: original.tasks,
    reference: original.reference,
  });
});

test('archives the artifact intent even when the caller mutates compared nested objects during capture', async () => {
  const fixture = await open();
  const caller = await directCaller(fixture, 'ada');
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const original = structuredClone(candidate);
  const writer = fixture.harness.publicWrites();
  const { acceptedPlanReferences: references } = installAcceptedPlanReference({
    source: {
      ...writer,
      batch: (...args) => {
        candidate.reference.taskCount += 1;
        const leaf = candidate.tasks.tasks.at(0);
        if (leaf === undefined) throw new Error('the offered task fixture is empty');
        leaf.name = 'Replaced after artifact comparison';
        return writer.batch(...args);
      },
    },
    clock: directClock,
  });
  const decision = await references.register(fixture.projectId, caller, candidate);
  expect(decision).toMatchObject({
    ok: true,
    value: { lock: { version: 1, referenceDigest: original.reference.referenceDigest } },
  });
  const beforeRead = fixture.messages.length;
  const restored = await fixture.request(
    'GET',
    historicalPath(fixture, 1, original.reference.referenceDigest),
  );
  const integrityDiagnostic = fixture.messages.slice(beforeRead).join('').trimEnd();
  expect(restored.status, integrityDiagnostic).toBe(200);
  expect(await restored.json()).toMatchObject({
    tasks: original.tasks,
    reference: original.reference,
  });
});

test.each(['address', 'selector'] as const)(
  'retains the original direct historical %s after a queued input alias changes',
  async (part) => {
    const fixture = await open();
    const caller = await directCaller(fixture, 'ada');
    setPolicy(fixture, [fixture.grant]);
    const bytes = await exportPlan(fixture.request, fixture.path);
    const first = await expectRegistration(fixture, offer(bytes));
    const second = await expectRegistration(fixture, {
      ...offer(bytes, { planningCommit: '5'.repeat(40), sourceBaseCommit }),
      expected: {
        kind: 'version',
        version: first.lock.version,
        referenceDigest: first.lock.referenceDigest,
      },
    });
    const { acceptedPlanReferences: references } = installAcceptedPlanReference({
      source: fixture.harness.publicWrites(),
      clock: directClock,
    });
    const address = { repository, change };
    const selector = { version: first.lock.version, referenceDigest: first.lock.referenceDigest };
    const read = await duringWriterQueue(
      fixture,
      () => references.read(fixture.projectId, caller, address, selector),
      () => {
        if (part === 'address') address.change = 'changed-alias';
        else {
          selector.version = second.lock.version;
          selector.referenceDigest = second.lock.referenceDigest;
        }
      },
    );
    expect(read).toMatchObject({ ok: true, value: { lock: first.lock } });
  },
);

test.each([
  'requirements bytes',
  'export bytes',
  'task content',
  'reference fields',
  'complete reference',
] as const)('historical integrity refuses structurally valid altered %s', async (part) => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const bytes = await exportPlan(fixture.request, fixture.path);
  const candidate = offer(bytes);
  const accepted = await expectRegistration(fixture, candidate);
  const path = historicalPath(fixture, 1, accepted.lock.referenceDigest);
  const { exportBytes, requirementsBytes: retainedRequirements, tasks, reference } = candidate;
  const stored = { exportBytes, requirementsBytes: retainedRequirements, tasks, reference };
  const control = await fixture.request('GET', path);
  expect(control.status, await control.clone().text()).toBe(200);
  expect(await control.json()).toEqual({ lock: accepted.lock, ...stored });

  switch (part) {
    case 'requirements bytes':
      stored.requirementsBytes = Buffer.from('Altered requirements').toString('base64');
      break;
    case 'export bytes':
      stored.exportBytes = Buffer.concat([bytes, Buffer.from('\n')]).toString('base64');
      break;
    case 'task content':
      stored.tasks = {
        ...tasks,
        tasks: tasks.tasks.map((task) => ({ ...task, name: 'Historical alteration' })),
      };
      break;
    case 'reference fields':
      stored.reference = { ...reference, taskCount: reference.taskCount + 1 };
      break;
    case 'complete reference':
      stored.reference = offer(bytes, {
        planningCommit: '6'.repeat(40),
        sourceBaseCommit,
      }).reference;
      break;
  }
  expect(
    fixture.harness.sqlite.run(
      'UPDATE accepted_plan_reference SET artifacts = ? WHERE version = 1',
      [JSON.stringify(stored)],
    ).changes,
  ).toBe(1);
  const response = await fixture.request('GET', path);
  expect(response.status).toBe(500);
  expect(countAccepted(fixture)).toBe(1);
});

test('validates the entire readable policy before acting on a qualifying grant', async () => {
  const fixture = await open();
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const policy = [fixture.grant, { ...fixture.grant, subject: { kind: 'first_party' } }];
  expect(
    fixture.harness.sqlite.run(
      'UPDATE accepted_plan_reference_policy SET revision = 2, grants = ? WHERE singleton = 1',
      [JSON.stringify(policy)],
    ).changes,
  ).toBe(1);
  const response = await post(fixture, candidate);
  expect(response.status, await response.clone().text()).toBe(500);
  expect(fixture.messages.join('')).toContain('accepted plan reference policy is malformed');
  expect(countAccepted(fixture)).toBe(0);
});

test('refuses a qualifying grant when another policy row exists', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const sqlite = fixture.harness.sqlite;
  const insert = "INSERT INTO accepted_plan_reference_policy VALUES (2, 1, '[]')";
  expect(() => sqlite.run(insert)).toThrow(/CHECK constraint failed/);
  sqlite.run('PRAGMA ignore_check_constraints = ON');
  try {
    expect(sqlite.run(insert).changes).toBe(1);
  } finally {
    sqlite.run('PRAGMA ignore_check_constraints = OFF');
  }
  expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
    ignore_check_constraints: 0,
  });
  const response = await post(fixture, candidate);
  expect({
    status: response.status,
    malformedPolicy: fixture.messages
      .join('')
      .includes('accepted plan reference policy is malformed'),
    rows: countAccepted(fixture),
  }).toEqual({ status: 500, malformedPolicy: true, rows: 0 });
});

const overflowMarker = 'overflow-estimate-test-marker';

function overflowingJson(value: unknown) {
  const json = JSON.stringify(value);
  const marker = JSON.stringify(overflowMarker);
  expect(json.split(marker)).toHaveLength(2);
  return json.replace(marker, '1e400');
}

test.each([
  ['export task estimate', 'invalid_plan_artifacts'],
  ['export budget factor', 'invalid_plan_artifacts'],
  ['submitted task estimate', 'invalid_body'],
] as const)('refuses a non-finite %s at registration', async (field, error) => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const stepName = 'Estimate proof';
  const added = await fixture.request('POST', fixture.path + '/steps', { name: stepName });
  expect(added.status, await added.clone().text()).toBe(200);
  const step = fixture.harness.sqlite
    .query<{ id: string }, [string, string]>(
      'SELECT id FROM step WHERE project_id = ? AND name = ?',
    )
    .get(fixture.projectId, stepName);
  if (step === null) throw new Error('fixture step is absent');
  const edited = await fixture.request('POST', fixture.path + '/commands', {
    commands: [
      {
        kind: 'setEstimate',
        workItemId: fixture.leafId,
        stepId: step.id,
        days: { optimistic: 2, realistic: 3, pessimistic: 4 },
      },
    ],
  });
  expect(edited.status, await edited.clone().text()).toBe(200);
  const exportBytes = await exportPlan(fixture.request, fixture.path);
  const candidate = offer(exportBytes);
  const task = candidate.tasks.tasks.at(0);
  if (task === undefined) throw new Error('fixture task is absent');
  const estimate = task.estimates.at(0);
  if (estimate === undefined) throw new Error('fixture estimate is absent');
  expect(candidate.tasks.tasks).toHaveLength(1);
  expect(task.estimates).toHaveLength(1);
  expect(estimate.optimistic).toBe(2);

  let body: string;
  if (field === 'submitted task estimate') {
    body = overflowingJson({
      ...candidate,
      tasks: {
        ...candidate.tasks,
        tasks: [{ ...task, estimates: [{ ...estimate, optimistic: overflowMarker }] }],
      },
    });
  } else {
    const parsed: unknown = JSON.parse(exportBytes.toString('utf8'));
    const document = decodeOrdinaryPlanDocument(parsed);
    const changed =
      field === 'export budget factor'
        ? { ...document, settings: { ...document.settings, budgetFactor: overflowMarker } }
        : {
            ...document,
            workItems: document.workItems.map((work) =>
              work.id === fixture.leafId
                ? {
                    ...work,
                    estimates: {
                      ...work.estimates,
                      [step.id]: { optimistic: overflowMarker, realistic: 3, pessimistic: 4 },
                    },
                  }
                : work,
            ),
          };
    const overflow = Buffer.from(overflowingJson(changed));
    const reference = {
      ...candidate.reference,
      exportDigest: createHash('sha256').update(overflow).digest('hex'),
    };
    body = JSON.stringify({
      ...candidate,
      exportBytes: overflow.toString('base64'),
      reference: { ...reference, referenceDigest: digestWithout(reference, 'referenceDigest') },
    });
  }
  const response = await fixture.harness.request(fixture.collection, {
    method: 'POST',
    headers: fixture.headers,
    body,
  });
  if (field === 'submitted task estimate') {
    await expectRefusal(response, 400, error);
    expect(countAccepted(fixture)).toBe(0);
    const caller = await directCaller(fixture, 'ada');
    const { acceptedPlanReferences: references } = installAcceptedPlanReference({
      source: fixture.harness.publicWrites(),
      clock: directClock,
    });
    const overflow = {
      ...candidate,
      tasks: {
        ...candidate.tasks,
        tasks: [{ ...task, estimates: [{ ...estimate, optimistic: Number('1e400') }] }],
      },
    };
    const decision = await references.register(fixture.projectId, caller, overflow).then(
      (registered) => registered,
      (cause: unknown) => {
        if (!(cause instanceof Error)) throw cause;
        return { unexpectedFailure: cause.message };
      },
    );
    expect({ decision, rows: countAccepted(fixture) }).toEqual({
      decision: { ok: false, error: 'invalid_plan_artifacts' },
      rows: 0,
    });
  } else {
    expect({
      ...(await readReferenceResponse(response)),
      canonicalFailure: fixture.messages.join('').includes('canonical JSON needs finite numbers'),
      rows: countAccepted(fixture),
    }).toEqual({
      status: 400,
      body: { error },
      canonicalFailure: false,
      rows: 0,
    });
  }
  await expectRegistration(fixture, candidate);
  expect(countAccepted(fixture)).toBe(1);
});

async function readReferenceResponse(response: Response) {
  const text = await response.text();
  const body: unknown = text.startsWith('{') ? JSON.parse(text) : text;
  return { status: response.status, body };
}

function referenceFailureReports(fixture: Fixture, since: number) {
  return fixture.messages
    .slice(since)
    .join('')
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => {
      const entry: unknown = JSON.parse(line);
      // Proof: Filtering null made "rejects a null failure log entry before filtering reports"
      // receive an empty array without throwing instead of the expected TypeError.
      if (entry === null) throw new TypeError('reference failure log entry is null');
      if (
        typeof entry !== 'object' ||
        !('msg' in entry) ||
        entry.msg !== 'unexpected endpoint failure'
      )
        return [];
      const cause = 'err' in entry ? entry.err : undefined;
      const stack =
        typeof cause === 'object' && cause !== null && 'stack' in cause ? cause.stack : undefined;
      if (!Array.isArray(stack))
        throw new Error('reference failure report lacks its error and first frame');
      const error: unknown = stack[0];
      const frame: unknown = stack[1];
      if (typeof error !== 'string' || typeof frame !== 'string')
        throw new Error('reference failure report lacks its error and first frame');
      return [{ message: entry.msg, error, frame }];
    });
}

test('rejects a null failure log entry before filtering reports', async () => {
  const fixture = await open();
  const since = fixture.messages.length;
  fixture.messages.push('null\n');
  expect(() => referenceFailureReports(fixture, since)).toThrow(TypeError);
});

function referenceArtifacts({
  exportBytes,
  requirementsBytes,
  tasks,
  reference,
}: RegisterPlanReference) {
  return { exportBytes, requirementsBytes, tasks, reference };
}

test('rejects a missing expectation before the reference writer checks grants', async () => {
  const fixture = await open();
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const { expected: _expected, ...withoutExpectation } = candidate;
  await expectRefusal(await post(fixture, candidate), 403, 'forbidden');
  expect(countAccepted(fixture)).toBe(0);

  let writerCalls = 0;
  fixture.onQueued(() => {
    writerCalls += 1;
  });
  let response: Response;
  try {
    response = await fixture.request('POST', fixture.collection, withoutExpectation);
  } finally {
    fixture.onQueued(undefined);
  }
  const observed = await readReferenceResponse(response);
  expect({ ...observed, writerCalls, rows: countAccepted(fixture) }).toEqual({
    status: 400,
    body: { error: 'invalid_body' },
    writerCalls: 0,
    rows: 0,
  });
});

test('registers through the reference store supplied by the borrowed writer', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const before = countAccepted(fixture);
  expect(before).toBe(0);
  const since = fixture.messages.length;
  const response = await readReferenceResponse(await post(fixture, candidate));
  const rows = countAccepted(fixture);
  const reports = referenceFailureReports(fixture, since);

  expect(response.status, JSON.stringify({ body: response.body, before, rows, reports })).toBe(201);
  const writeBasis: unknown = expect.stringMatching(/.+/);
  expect(response.body).toEqual({
    lock: { ...fixture.scope, version: 1, referenceDigest: candidate.reference.referenceDigest },
    writeBasis,
  });
  expect(rows).toBe(1);
  expect(reports).toEqual([]);
});

test('refuses an unavailable capture even when it carries the prior valid document', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const exportBytes = await exportPlan(fixture.request, fixture.path);
  const candidate = offer(exportBytes);
  const prior = compileOrdinaryPlanReference({
    exportBytes,
    requirementsBytes,
    repository,
    change,
    planningCommit,
    sourceBaseCommit,
  }).document;
  const stepIds = prior.steps.map(({ id }) => id).sort();
  expect(stepIds.length).toBeGreaterThan(0);
  expect(
    fixture.harness.sqlite.run('UPDATE step SET code = NULL WHERE project_id = ?', [
      fixture.projectId,
    ]).changes,
  ).toBe(stepIds.length);

  const exportDescriptor = Object.getOwnPropertyDescriptors(PlanDocumentService.prototype).export;
  const exportDocument = exportDescriptor.value;
  if (typeof exportDocument !== 'function') throw new Error('plan document export is missing');
  const refusals: { ok: false; error: 'uncoded_steps'; stepIds: string[] }[] = [];
  const capture = spyOn(PlanDocumentService.prototype, 'export').mockImplementation(async function (
    this: PlanDocumentService,
    ...inputs: Parameters<PlanDocumentService['export']>
  ) {
    const attempt = await exportDocument.apply(this, inputs);
    if (inputs[0].id !== fixture.projectId || attempt.ok || attempt.error !== 'uncoded_steps')
      return attempt;
    refusals.push({
      ok: attempt.ok,
      error: attempt.error,
      stepIds: attempt.steps.map(({ id }) => id).sort(),
    });
    const refusedWithStaleDocument = { ...attempt, value: prior };
    return refusedWithStaleDocument;
  });
  let registered: Response;
  try {
    registered = await post(fixture, candidate);
  } finally {
    capture.mockRestore();
  }
  const response = await readReferenceResponse(registered);

  expect(refusals).toEqual([{ ok: false, error: 'uncoded_steps', stepIds }]);
  const rows = countAccepted(fixture);
  expect(
    response.status,
    JSON.stringify({
      body: response.body,
      refusals,
      rows,
      expectedLock: {
        ...fixture.scope,
        version: 1,
        referenceDigest: candidate.reference.referenceDigest,
      },
    }),
  ).toBe(409);
  expect(response.body).toEqual({ error: 'live_plan_unavailable' });
  expect(rows).toBe(0);
});

interface StoredReference {
  organization_id: string;
  project_id: string;
  repository: string;
  change: string;
  version: number;
  reference_digest: string;
  write_basis: string;
  artifacts: string;
  subject: string;
  accepted_at: number;
  policy_revision: number;
}

type ReferenceRowAddress = [string, string, string, string, number, string];

const referenceRowWhere =
  'organization_id = ? AND project_id = ? AND repository = ? AND change = ? AND version = ? AND reference_digest = ?';

function readReferenceRow(fixture: Fixture, address: ReferenceRowAddress) {
  return fixture.harness.sqlite
    .query<StoredReference, ReferenceRowAddress>(
      `SELECT organization_id, project_id, repository, change, version, reference_digest,
      write_basis, artifacts, subject, accepted_at, policy_revision
      FROM accepted_plan_reference WHERE ${referenceRowWhere}`,
    )
    .get(...address);
}

function rowAddress(row: StoredReference): ReferenceRowAddress {
  return [
    row.organization_id,
    row.project_id,
    row.repository,
    row.change,
    row.version,
    row.reference_digest,
  ];
}

function registeredReferenceRow(
  fixture: Fixture,
  accepted: ActivePlanReference,
  candidate: RegisterPlanReference,
) {
  const { organizationId, projectId, repository, change, version, referenceDigest } = accepted.lock;
  const row = readReferenceRow(fixture, [
    organizationId,
    projectId,
    repository,
    change,
    version,
    referenceDigest,
  ]);
  if (row === null) throw new Error('fixture registered reference row is missing');
  expect(row.write_basis).toBe(accepted.writeBasis);
  expect(JSON.parse(row.artifacts)).toEqual(referenceArtifacts(candidate));
  return row;
}

test.each([
  ['project ID', 'project_id'],
  ['repository', 'repository'],
  ['change', 'change'],
  ['reference digest', 'reference_digest'],
] as const)('historical lookup requires the stored %s', async (_, column) => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const accepted = await expectRegistration(fixture, candidate);
  const path = historicalPath(fixture, accepted.lock.version, accepted.lock.referenceDigest);
  const historical = { lock: accepted.lock, ...referenceArtifacts(candidate) };
  expect(await readReferenceResponse(await fixture.request('GET', path))).toEqual({
    status: 200,
    body: historical,
  });
  const original = registeredReferenceRow(fixture, accepted, candidate);
  const originalAddress = rowAddress(original);
  expect(countAccepted(fixture)).toBe(1);

  const replacement =
    column === 'project_id'
      ? (await createProject(fixture.harness, fixture.request, 'Peer')).projectId
      : {
          repository: 'https://example.test/retained-peer',
          change: 'retained-peer-change',
          reference_digest: '0'.repeat(64),
        }[column];
  expect(replacement).not.toBe(original[column]);
  const moved = { ...original, [column]: replacement };
  expect(
    fixture.harness.sqlite.run(
      `UPDATE accepted_plan_reference SET ${column} = ? WHERE ${referenceRowWhere}`,
      [replacement, ...originalAddress],
    ).changes,
  ).toBe(1);
  expect(readReferenceRow(fixture, originalAddress)).toBeNull();
  expect(readReferenceRow(fixture, rowAddress(moved))).toEqual(moved);
  expect(countAccepted(fixture)).toBe(1);

  const since = fixture.messages.length;
  const response = await readReferenceResponse(await fixture.request('GET', path));
  const rows = countAccepted(fixture);
  const reports = referenceFailureReports(fixture, since);
  expect(
    response.status,
    JSON.stringify({
      body: response.body,
      rows,
      reports,
      requestedLock: accepted.lock,
      changedColumn: column,
      storedAddress: rowAddress(moved),
    }),
  ).toBe(404);
  expect(response.body).toEqual({ error: 'not_found' });
  expect(rows).toBe(1);
  expect(reports).toEqual([]);
  expect(readReferenceRow(fixture, rowAddress(moved))).toEqual(moved);
});

test('rejects self-consistent foreign project artifacts under an exact local historical lock', async () => {
  const fixture = await open();
  setPolicy(fixture, [fixture.grant]);
  const candidate = offer(await exportPlan(fixture.request, fixture.path));
  const accepted = await expectRegistration(fixture, candidate);
  const original = registeredReferenceRow(fixture, accepted, candidate);
  const originalAddress = rowAddress(original);
  const foreign = await createProject(fixture.harness, fixture.request, 'Peer');
  expect(foreign.projectId).not.toBe(fixture.projectId);
  const foreignOffer = offer(await exportPlan(fixture.request, foreign.path));
  const artifacts = referenceArtifacts(foreignOffer);
  expect(artifacts.reference.planRef.plan).toBe(foreign.projectId);
  expect(artifacts.tasks.plan).toBe(foreign.projectId);
  const referenceDigest = artifacts.reference.referenceDigest;
  expect(referenceDigest).not.toBe(accepted.lock.referenceDigest);
  const foreignStored = {
    ...original,
    reference_digest: referenceDigest,
    artifacts: JSON.stringify(artifacts),
  };
  expect(
    fixture.harness.sqlite.run(
      `UPDATE accepted_plan_reference SET reference_digest = ?, artifacts = ? WHERE ${referenceRowWhere}`,
      [referenceDigest, foreignStored.artifacts, ...originalAddress],
    ).changes,
  ).toBe(1);
  expect(readReferenceRow(fixture, originalAddress)).toBeNull();
  expect(readReferenceRow(fixture, rowAddress(foreignStored))).toEqual(foreignStored);
  expect(countAccepted(fixture)).toBe(1);

  const since = fixture.messages.length;
  const path = historicalPath(fixture, accepted.lock.version, referenceDigest);
  const response = await readReferenceResponse(await fixture.request('GET', path));
  const rows = countAccepted(fixture);
  const reports = referenceFailureReports(fixture, since);
  expect(
    response.status,
    JSON.stringify({
      body: response.body,
      rows,
      reports,
      requestedLock: { ...accepted.lock, referenceDigest },
      foreignProjectId: foreign.projectId,
    }),
  ).toBe(500);
  expect(response.body).toBe('Internal Server Error');
  expect(reports).toHaveLength(1);
  const report = reports.at(0);
  if (report === undefined) throw new Error('reference failure report is absent');
  const { frame, ...details } = report;
  expect(details).toEqual({
    message: 'unexpected endpoint failure',
    error: 'Error: retained plan reference artifacts disagree with their lock',
  });
  expect(frame).toMatch(
    /\bat readHistorical \([^\r\n]+\/store-sqlite\/src\/accepted-plan-reference\.ts:\d+:\d+\)$/,
  );
  expect(rows).toBe(1);
  expect(readReferenceRow(fixture, rowAddress(foreignStored))).toEqual(foreignStored);
});
