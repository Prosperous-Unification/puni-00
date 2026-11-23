import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import { TEST_JWT_KEY } from './auth-fixture';
import { OrganizationHarness } from './organization-harness';

const secret = 'browser-reconciliation-secret-'.repeat(2);
const harness = OrganizationHarness.openComposedWith({
  // Test-only writer seam: durable authority alone does not activate production authoring.
  syntheticExternalCommands: true,
  sessionBinding: true,
  internalAuthSecret: secret,
  appOrigin: 'http://localhost:7600',
  pushFetch: (url, init) => fetch(url.replace('http://gw.invalid', 'http://localhost:7501'), init),
});
seedDependencyAuthority(harness.databasePath());
for (const username of ['ada', 'grace']) await harness.register(username);
for (const organizationId of ['org-a', 'org-b']) harness.organization(organizationId);
harness.member('org-a', 'ada', 'member');
harness.member('org-b', 'grace', 'member');
harness.member('org-b', 'ada', 'member');
harness.activate();
interface FixturePrincipal {
  readonly token: string;
  readonly cookie: string;
  readonly organizationId: string;
}
/** Only these original registration credentials retain compatibility with lower-boundary tests. */
const seedTokens = Object.freeze({ ada: harness.token('ada'), grace: harness.token('grace') });
const principals: Readonly<{ ada: FixturePrincipal; grace: FixturePrincipal }> = Object.freeze({
  ada: await selectFixturePrincipal(seedTokens.ada, 'org-a'),
  grace: await selectFixturePrincipal(seedTokens.grace, 'org-b'),
});
async function selectFixturePrincipal(
  token: string,
  organizationId: string,
): Promise<FixturePrincipal> {
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:7600',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId }),
  });
  // Proof: r1 rejected-response fault refuses here; omitting only this check reaches the acceptance sentinel.
  if (selected.status !== 200) throw new Error('Fixture organization selection refused');
  const selection: unknown = await selected.json();
  // Proof: r1 wrong/missing organization faults refuse here; each matching omission reaches the sentinel.
  if (
    typeof selection !== 'object' ||
    selection === null ||
    !('organizationId' in selection) ||
    selection.organizationId !== organizationId
  )
    throw new Error('Fixture selected another organization');
  const cookies = selected.headers.getSetCookie();
  // Proof: r1 absent/ambiguous Set-Cookie faults refuse here; each matching omission reaches the sentinel.
  if (cookies.length !== 1) throw new Error('Fixture selection cookie is ambiguous or absent');
  const cookie = cookies[0]?.split(';').at(0);
  // Proof: r1 wrong-name/empty cookie faults refuse here; each matching omission reaches the sentinel.
  if (cookie === undefined || !/^__Host-wbs_organization=[^;\s=]+$/.test(cookie))
    throw new Error('Fixture selection cookie is malformed');
  return Object.freeze({ token, cookie, organizationId });
}
/** Parses names even when spacing/value is malformed, so existing carriers are never repaired. */
function readCookies(headers: Headers): { name: string; value: string | null }[] {
  return (headers.get('cookie') ?? '').split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0
      ? { name: part.trim(), value: null }
      : { name: part.slice(0, separator).trim(), value: part.slice(separator + 1) };
  });
}
/** Appends an actual issued cookie only to one exact, unambiguous original seed credential. */
function bindFixtureToken(headers: Headers): Headers {
  const forwarded = new Headers(headers);
  const entries = readCookies(headers);
  const organizations = entries.filter((entry) => entry.name === '__Host-wbs_organization');
  const accesses = entries.filter((entry) => entry.name === '__Host-wbs_access');
  // Proof: removing these guards independently made existing-org and duplicate-access presentations receive invariant500 (2026-10-26).
  if (organizations.length !== 0 || accesses.length > 1) return forwarded;
  const authorization = headers.get('authorization');
  const bearer = authorization === null ? null : /^Bearer ([^\s]+)$/.exec(authorization)?.[1];
  // Proof: accepting Basic syntax made the real non-Bearer presentation receive invariant500 (2026-10-26).
  if (authorization !== null && bearer === undefined) return forwarded;
  const access = accesses.at(0)?.value;
  // Proof: accepting a spaced access-cookie name made the real malformed presentation receive invariant500 (2026-10-26).
  if (
    accesses.length === 1 &&
    (access === null ||
      access === undefined ||
      access.length === 0 ||
      !(headers.get('cookie') ?? '')
        .split(';')
        .some((part) => part.trim() === `__Host-wbs_access=${access}`))
  )
    return forwarded;
  // Proof: removing this equality guard made conflicting seed credentials receive invariant500 (2026-10-26).
  if (bearer !== null && bearer !== undefined && access !== undefined && bearer !== access)
    return forwarded;
  const token = bearer ?? access;
  // Proof: admitting a fresh ordinary token made unselected discovery receive invariant500 instead of403 (2026-10-26).
  const principal = Object.values(principals).find((candidate) => candidate.token === token);
  if (principal === undefined) return forwarded;
  forwarded.set(
    'cookie',
    [headers.get('cookie'), principal.cookie].filter((part) => part !== null).join('; '),
  );
  return forwarded;
}
/** Independently verifies noneligible requests at the actual forwarding boundary; errors never expose credentials. */
function assertForwarding(incoming: Headers, forwarded: Headers): void {
  const cookies = (incoming.get('cookie') ?? '').split(';');
  const accessCookies = cookies.filter(
    (cookie) => cookie.trim().split('=')[0]?.trim() === '__Host-wbs_access',
  );
  const organizationCookies = cookies.filter(
    (cookie) => cookie.trim().split('=')[0]?.trim() === '__Host-wbs_organization',
  );
  const authorization = incoming.get('authorization');
  const eligible = [principals.ada, principals.grace].some(
    (principal) =>
      organizationCookies.length === 0 &&
      accessCookies.length <= 1 &&
      (authorization === null || authorization === `Bearer ${principal.token}`) &&
      (accessCookies.length === 0 ||
        accessCookies[0]?.trim() === `__Host-wbs_access=${principal.token}`) &&
      (authorization === `Bearer ${principal.token}` ||
        accessCookies[0]?.trim() === `__Host-wbs_access=${principal.token}`),
  );
  if (
    !eligible &&
    JSON.stringify([...incoming.entries()]) !== JSON.stringify([...forwarded.entries()])
  )
    throw new Error('Fixture forwarding invariant violated');
}
async function callFixture(username: 'ada' | 'grace', method: string, path: string, body: unknown) {
  const principal = principals[username];
  return harness.callWith(principal.token, method, path, body, {
    cookie: principal.cookie,
    'X-WBS-Expected-Organization': principal.organizationId,
  });
}
/** Creates only this fixture's private parent and its real scoped creator grant. */
async function createFixtureParent(name: string, organizationId: string, actorId: string) {
  const connection = openConnection(harness.databasePath());
  const creation = await new ProjectRepository(connection.db, OPEN)
    .create(
      { id: crypto.randomUUID(), organizationId, name: name + ' parent' },
      {
        actor: { kind: 'user', userId: actorId },
        at: 1,
        grantId: crypto.randomUUID(),
        projectAuditId: crypto.randomUUID(),
        grantAuditId: crypto.randomUUID(),
      },
    )
    .then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
  try {
    connection.close();
  } catch (cleanup: unknown) {
    if (!creation.ok)
      throw new AggregateError(
        [creation.cause, cleanup],
        'fixture project creation and close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (!creation.ok) throw creation.cause;
  if (typeof creation.value === 'string' || creation.value.kind !== 'created')
    throw new Error('fixture project refused: ' + JSON.stringify(creation.value));
  return creation.value.project.id;
}
const workPackages: Record<string, { id: string; row: string; step: string } | undefined> = {};
let ready = false;
const server = Bun.serve({
  port: 7500,
  hostname: 'localhost',
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/__fixture/ready') return Response.json({ ready }, { status: ready ? 200 : 503 });
    if (path === '/__fixture/relationships')
      return Response.json(
        harness.sqlite
          .query(
            'SELECT id, organization_id, predecessor_work_package_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_package_id, successor_work_item_id, successor_scope, successor_step_id, type FROM external_dependency ORDER BY id',
          )
          .all(),
      );
    if (path === '/__fixture/identities')
      return Response.json({
        workPackages,
        token: seedTokens.ada,
        foreignToken: seedTokens.grace,
      });
    if (
      (path === '/__fixture/complete' || path === '/__fixture/reset') &&
      request.method === 'POST'
    ) {
      const workPackage = workPackages['A'];
      if (workPackage === undefined) throw new Error('missing upstream');
      const answer = await callFixture(
        'ada',
        'POST',
        `/api/work-packages/${workPackage.id}/commands`,
        {
          commands: [
            {
              kind: path === '/__fixture/complete' ? 'setProgress' : 'clearProgress',
              workItemId: workPackage.row,
              stepId: workPackage.step,
              ...(path === '/__fixture/complete' ? { state: 'done' } : {}),
            },
          ],
        },
      );
      return Response.json(answer.body, { status: answer.status });
    }
    const forwarded = bindFixtureToken(request.headers);
    // Proof: with the same broadened adapter, omitting this call changed the diagnostic expected500 to the backend's masked403 (2026-10-26).
    assertForwarding(request.headers, forwarded);
    return harness.request(path + new URL(request.url).search, {
      method: request.method,
      headers: forwarded,
      ...(request.method === 'GET' || request.method === 'HEAD'
        ? {}
        : { body: await request.text() }),
    });
  },
});
const gateway = Bun.spawn(
  [
    process.execPath,
    new URL('../../../gw-01/src/testing/cross-work-package-delivery-gateway.ts', import.meta.url)
      .pathname,
    'http://localhost:7500',
    TEST_JWT_KEY,
    secret,
    'http://localhost:7600',
    '7501',
  ],
  { stdout: 'pipe', stderr: 'inherit' },
);
if (!(gateway.stdout instanceof ReadableStream)) throw new Error('gateway stdout not piped');
const reader = gateway.stdout.getReader();
const startup = await reader.read();
reader.releaseLock();
const address = JSON.parse(new TextDecoder().decode(startup.value)) as { port: number };
if (address.port <= 0) throw new Error('gateway did not announce a port');
for (const name of [
  'A',
  'B',
  'C',
  'Unrelated',
  'Foreign',
  'Desktop',
  'Phone',
  'SuccessorDesktop',
  'SuccessorPhone',
  'Author',
  'RootAuthor',
  'RootStale',
  'AuthorPhone',
  'AuthorFF',
  'RenameSource',
  'RenameTarget',
  'DatedA',
  'DatedB',
  'DatedC',
]) {
  const username = name === 'Foreign' ? 'grace' : 'ada';
  const organizationId = principals[username].organizationId;
  const stamp = { at: 1, by: harness.userId(username) };
  const projectId = await createFixtureParent(name, organizationId, stamp.by);
  const stepId = crypto.randomUUID();
  const body = await harness.publicWrites().uow.run(async ({ stores }) => {
    const defined = await stores.stepCatalogue.defineAndBindStep(
      organizationId,
      {
        id: stepId,
        code: 'browser-' + name.toLowerCase(),
        name: name + ' step',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: crypto.randomUUID(),
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position: 10,
      },
      stamp,
    );
    if (!defined.ok) throw new Error('fixture step definition refused: ' + defined.reason);
    const prepared = prepareWorkPackageBirth(name, projectId, stamp, () => crypto.randomUUID());
    const created = await stores.workPackages.createWithSteps(prepared.workPackage, stamp, {
      kind: 'scoped',
      organizationId,
      creatorGrant: { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
    });
    if (typeof created === 'string') throw new Error('fixture work package refused: ' + created);
    return { commit: true, value: created };
  });
  const step = body.steps.at(0);
  if (
    body.steps.length !== 1 ||
    step?.id !== stepId ||
    step.estimateUnit !== 'workdays' ||
    step.allowancePercent !== 0
  )
    throw new Error('fixture package did not capture its one authored step');
  const workPackage = { id: body.workPackage.id, row: crypto.randomUUID(), step: step.id };
  workPackages[name] = workPackage;
  harness.sqlite.run(
    "INSERT INTO work_item (id, work_package_id, position, name, readiness) VALUES (?, ?, 10, ?, 'ready')",
    [workPackage.row, workPackage.id, `${name} row`],
  );
}
for (const [left, right] of [
  ['DatedA', 'DatedB'],
  ['DatedB', 'DatedC'],
  ['RenameSource', 'RenameTarget'],
  ['A', 'B'],
  ['B', 'C'],
  ['A', 'Desktop'],
  ['A', 'Phone'],
  ['A', 'SuccessorDesktop'],
  ['A', 'SuccessorPhone'],
] as const) {
  const predecessor = workPackages[left];
  const successor = workPackages[right];
  if (predecessor === undefined || successor === undefined) throw new Error('missing chain member');
  harness.sqlite.run(
    `INSERT INTO external_dependency (id, organization_id, predecessor_work_package_id, successor_work_package_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, successor_step_id, type) VALUES (?, 'org-a', ?, ?, ?, 'node', ?, ?, 'node', ?, 'FS')`,
    [
      left === 'DatedA'
        ? 'a4000000-0000-4000-8000-000000000001'
        : left === 'DatedB'
          ? 'a4000000-0000-4000-8000-000000000002'
          : `${left}-${right}`,
      predecessor.id,
      successor.id,
      predecessor.row,
      predecessor.step,
      successor.row,
      successor.step,
    ],
  );
}
harness.sqlite.run(
  "UPDATE external_dependency SET predecessor_scope='whole', predecessor_step_id=NULL WHERE id='A-Phone'",
);
harness.sqlite.run(
  "UPDATE external_dependency SET successor_scope='whole', successor_step_id=NULL WHERE id='A-SuccessorPhone'",
);
const renameSource = workPackages['RenameSource'];
if (renameSource === undefined) throw new Error('missing rename source');
harness.sqlite.run(
  'UPDATE work_package_abbreviation SET abbreviation = ? WHERE work_package_id = ?',
  ['NAV_OLD', renameSource.id],
);
harness.sqlite.run(
  "UPDATE external_dependency SET predecessor_scope='whole', predecessor_step_id=NULL WHERE id='RenameSource-RenameTarget'",
);
for (const name of ['DatedA', 'DatedB', 'DatedC']) {
  const workPackage = workPackages[name];
  if (workPackage === undefined) throw new Error('missing dated chain member');
  harness.sqlite.run('UPDATE work_package SET start_date = ? WHERE id = ?', [
    '2026-09-07',
    workPackage.id,
  ]);
  harness.sqlite.run(
    'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
    [workPackage.row, workPackage.step],
  );
}
ready = true;
async function stop() {
  gateway.kill();
  await gateway.exited;
  await server.stop(true);
  await harness.closeComposed();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
