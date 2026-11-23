import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './testing/booted-browser-process';
import { TEST_MACHINE_GRANT_ENV } from './testing/machine-grant-fixture';
import { writeMcpStoreFixture } from './testing/mcp-store-fixture';

setDefaultTimeout(30_000);

const cli = new URL('./organization-activation-cli.ts', import.meta.url).pathname;

/** An mcp-01 store beside `databasePath` whose credential epoch has advanced. */
function advancedMcpStore(databasePath: string): string {
  const path = `${databasePath}-mcp.sqlite`;
  writeMcpStoreFixture(path, 1);
  return path;
}

let be: BootedBrowserProcess | undefined;
afterEach(async () => {
  await be?.close();
  be = undefined;
});

async function call(
  process: BootedBrowserProcess,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown; setCookie: string | null }> {
  const response = await process.app.handle(
    new Request(`${BOOTED_ORIGIN}${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as unknown,
    setCookie: response.headers.get('set-cookie'),
  };
}

function bearer(process: BootedBrowserProcess, username: string): Record<string, string> {
  return { authorization: `Bearer ${process.token(username)}`, origin: BOOTED_ORIGIN };
}

/** `username`'s browser headers after explicitly selecting its one membership. */
async function selectSession(
  process: BootedBrowserProcess,
  username: string,
): Promise<Record<string, string>> {
  const memberships = await call(
    process,
    'GET',
    '/api/organization/memberships',
    bearer(process, username),
  );
  expect(memberships.status).toBe(200);
  const listed = (memberships.body as { memberships: { organizationId: string }[] }).memberships;
  expect(listed).toHaveLength(1);
  const organizationId = listed.at(0)?.organizationId;
  if (organizationId === undefined) throw new Error(`${username} has no membership`);
  const selected = await call(
    process,
    'POST',
    '/api/organization/active',
    bearer(process, username),
    { organizationId },
  );
  const cookie = selected.setCookie?.split(';')[0];
  if (selected.status !== 200 || cookie === undefined)
    throw new Error(`selection refused: ${JSON.stringify(selected)}`);
  return {
    cookie: `__Host-wbs_access=${process.token(username)}; ${cookie}`,
    origin: BOOTED_ORIGIN,
    'X-WBS-Expected-Organization': organizationId,
  };
}

/** The work package names `username`'s browser session lists after selecting its one membership. */
async function listAfterSelecting(
  process: BootedBrowserProcess,
  username: string,
): Promise<string[]> {
  const workPackages = await call(
    process,
    'GET',
    '/api/work-packages',
    await selectSession(process, username),
  );
  expect(workPackages.status).toBe(200);
  return (workPackages.body as { workPackages: { name: string }[] }).workPackages
    .map((p) => p.name)
    .toSorted();
}

/** Activates an empty current store through the real CLI before current Project creation. */
async function activateEmptyStore(process: BootedBrowserProcess): Promise<void> {
  for (const username of ['dany', 'ada', 'grace']) await process.register(username);
  const activated = Bun.spawnSync(
    [
      globalThis.process.execPath,
      cli,
      '--mcp-store',
      advancedMcpStore(process.databasePath()),
      '--name',
      'default',
      '--super-admin',
      'dany',
      '--apply',
    ],
    {
      env: {
        ...globalThis.process.env,
        ...TEST_MACHINE_GRANT_ENV,
        DB_PATH: process.databasePath(),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(activated.stderr.toString()).toBe('');
  expect(activated.exitCode).toBe(0);
  expect(JSON.parse(activated.stdout.toString())).toMatchObject({
    mode: 'applied',
    prunedStreams: [],
  });
}

/** Creates under selected current authority, retaining the actual Project parent. */
async function createScopedPackage(process: BootedBrowserProcess, name: string): Promise<string> {
  const organization = process.sqlite
    .query<{ id: string }, []>('SELECT id FROM organization WHERE legacy=1')
    .get();
  if (organization === null) throw new Error('activated organization missing');
  process.grantPermissions(organization.id, 'dany', ['organization.create_project']);
  process.grantPermissions(organization.id, 'ada', ['project.read', 'package.read']);
  const headers = await selectSession(process, 'dany');
  const parent = await call(process, 'POST', '/api/projects', headers, { name });
  expect(parent.status).toBe(201);
  const projectId = (parent.body as { project: { id: string } }).project.id;
  const created = await call(process, 'POST', '/api/work-packages', headers, { name, projectId });
  expect(created.status).toBe(200);
  return (created.body as { workPackage: { id: string } }).workPackage.id;
}

test('after the CLI activates, the super-admin and a member list current work packages and a stranger is refused', async () => {
  be = await BootedBrowserProcess.open('enabled');
  const process = be;
  await activateEmptyStore(process);
  await createScopedPackage(process, 'Launch');
  await createScopedPackage(process, 'Billing');

  // The running app reads the marker per request: no restart between the CLI and these.
  // Historical Proof at 8c997e62a: 2026-10-20, omitting --apply made memberships answer 403.
  expect(await listAfterSelecting(process, 'dany')).toEqual(['Billing', 'Launch']);
  expect(await listAfterSelecting(process, 'ada')).toEqual(['Billing', 'Launch']);
  // A Bearer credential without the browser's organization cookie binds none (mcp-01's way).
  expect(await call(process, 'GET', '/api/work-packages', bearer(process, 'dany'))).toMatchObject({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  await process.register('eve');
  expect(await call(process, 'GET', '/api/work-packages', bearer(process, 'eve'))).toMatchObject({
    status: 403,
    body: { error: 'no_active_organization' },
  });
});

test('after activation, the disabled composition binds no organization', async () => {
  be = await BootedBrowserProcess.open('disabled');
  const process = be;
  await activateEmptyStore(process);

  // Production `disabled` wires NO_BOUND_ORGANIZATION and refuses selection: activating a
  // store served this way locks every account out of organization resources.
  expect(await call(process, 'GET', '/api/work-packages', bearer(process, 'dany'))).toMatchObject({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  const selected = await call(
    process,
    'POST',
    '/api/organization/active',
    bearer(process, 'dany'),
    {
      organizationId: 'any',
    },
  );
  expect(selected.status).not.toBe(200);
  expect(selected.setCookie).toBeNull();
});

test('a member reads a restricted work package it cannot edit after real CLI activation', async () => {
  be = await BootedBrowserProcess.open('enabled');
  const process = be;
  await activateEmptyStore(process);
  const workPackageId = await createScopedPackage(process, 'Launch');
  const restricted = await call(
    process,
    'PATCH',
    `/api/work-packages/${workPackageId}`,
    await selectSession(process, 'dany'),
    { restricted: true },
  );
  expect(restricted.status).toBe(200);
  const answers = async (headers: Record<string, string>) => {
    const read = await call(process, 'GET', `/api/work-packages/${workPackageId}`, headers);
    const edit = await call(process, 'PATCH', `/api/work-packages/${workPackageId}`, headers, {
      name: 'Hijacked',
    });
    return { read: read.status, edit: { status: edit.status, body: edit.body } };
  };
  const owner = process.sqlite
    .query<{ organization_id: string }, [string]>(
      'SELECT organization_id FROM work_package_organization WHERE resource_id=?',
    )
    .get(workPackageId);
  if (owner === null) throw new Error('activated work package owner missing');
  process.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('ada-restricted-reader',?,'work_package',?,'user',?,'package-viewer','route',1)",
    [owner.organization_id, workPackageId, process.userId('ada')],
  );

  // Historical Proof at 8c997e62a: 2026-10-20, granting every other user `super_admin` instead of `member` made this
  // edit answer 200 and rename the work package (an audited recovery) instead of 403 `forbidden`.
  expect(await answers(await selectSession(process, 'ada'))).toEqual({
    read: 200,
    edit: { status: 403, body: { error: 'forbidden', permission: 'package.manage_settings' } },
  });
  const workPackage = await call(
    process,
    'GET',
    `/api/work-packages/${workPackageId}`,
    await selectSession(process, 'dany'),
  );
  expect(workPackage.body).toMatchObject({ workPackage: { name: 'Launch', restricted: true } });
});

test('current preactivation restricted packages refuse edits by creator and another actor', async () => {
  be = await BootedBrowserProcess.open('enabled');
  const process = be;
  for (const username of ['dany', 'ada']) await process.register(username);
  process.organization('legacy');
  process.sqlite.run("UPDATE organization SET legacy=1 WHERE id='legacy'");
  process.sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES('parent','legacy','Parent',1)",
  );
  // Trusted stored fixture: current parent and creator exist; no activation or grant is fabricated.
  process.sqlite.run(
    "INSERT INTO work_package(id,project_id,name,created_at,created_by,restricted) VALUES('restricted','parent','Launch',1,?,1)",
    [process.userId('dany')],
  );
  for (const username of ['dany', 'ada']) {
    const headers = bearer(process, username);
    expect((await call(process, 'GET', '/api/work-packages/restricted', headers)).status).toBe(200);
    expect(
      (await call(process, 'PATCH', '/api/work-packages/restricted', headers, { name: 'Hijacked' }))
        .status,
    ).toBe(403);
  }
  expect(
    (await call(process, 'GET', '/api/work-packages/restricted', bearer(process, 'dany'))).body,
  ).toMatchObject({ workPackage: { name: 'Launch', restricted: true } });
});
