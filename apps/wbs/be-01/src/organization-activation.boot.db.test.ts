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

/** The project names `username`'s browser session lists after selecting its one membership. */
async function listAfterSelecting(
  process: BootedBrowserProcess,
  username: string,
): Promise<string[]> {
  const projects = await call(
    process,
    'GET',
    '/api/projects',
    await selectSession(process, username),
  );
  expect(projects.status).toBe(200);
  return (projects.body as { projects: { name: string }[] }).projects.map((p) => p.name).toSorted();
}

/** Three accounts and two legacy projects, then the CLI's apply against the served file. */
async function activateLegacyStore(process: BootedBrowserProcess): Promise<void> {
  for (const username of ['dany', 'ada', 'grace']) await process.register(username);
  for (const [username, name] of [
    ['dany', 'Launch'],
    ['ada', 'Billing'],
  ] as const) {
    const created = await call(process, 'POST', '/api/projects', bearer(process, username), {
      name,
    });
    expect(created.status).toBe(200);
  }
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

test('after the CLI activates, the super-admin and a member list the legacy projects and a stranger is refused', async () => {
  be = await BootedBrowserProcess.open('enabled');
  const process = be;
  await activateLegacyStore(process);

  // The running app reads the marker per request: no restart between the CLI and these.
  // Proof: 2026-10-20, running the CLI without --apply made the memberships read answer 403.
  expect(await listAfterSelecting(process, 'dany')).toEqual(['Billing', 'Launch']);
  expect(await listAfterSelecting(process, 'ada')).toEqual(['Billing', 'Launch']);
  // A Bearer credential without the browser's organization cookie binds none (mcp-01's way).
  expect(await call(process, 'GET', '/api/projects', bearer(process, 'dany'))).toMatchObject({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  await process.register('eve');
  expect(await call(process, 'GET', '/api/projects', bearer(process, 'eve'))).toMatchObject({
    status: 403,
    body: { error: 'no_active_organization' },
  });
});

test('after activation, the disabled composition binds no organization', async () => {
  be = await BootedBrowserProcess.open('disabled');
  const process = be;
  await activateLegacyStore(process);

  // Production `disabled` wires NO_BOUND_ORGANIZATION and refuses selection: activating a
  // store served this way locks every account out of organization resources.
  expect(await call(process, 'GET', '/api/projects', bearer(process, 'dany'))).toMatchObject({
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

test('a member reads a restricted project it does not own and cannot edit it, before and after', async () => {
  be = await BootedBrowserProcess.open('enabled');
  const process = be;
  for (const username of ['dany', 'ada']) await process.register(username);
  const created = await call(process, 'POST', '/api/projects', bearer(process, 'dany'), {
    name: 'Launch',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const restricted = await call(
    process,
    'PATCH',
    `/api/projects/${projectId}`,
    bearer(process, 'dany'),
    { restricted: true },
  );
  expect(restricted.status).toBe(200);
  const answers = async (headers: Record<string, string>) => {
    const read = await call(process, 'GET', `/api/projects/${projectId}`, headers);
    const edit = await call(process, 'PATCH', `/api/projects/${projectId}`, headers, {
      name: 'Hijacked',
    });
    return { read: read.status, edit: { status: edit.status, body: edit.body } };
  };
  const before = await answers(bearer(process, 'ada'));
  expect(before.read).toBe(200);
  expect(before.edit.status).toBe(403);

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
  expect(activated.exitCode).toBe(0);

  // Proof: 2026-10-20, granting every other user `super_admin` instead of `member` made this
  // edit answer 200 and rename the project (an audited recovery) instead of 403 `forbidden`.
  expect(await answers(await selectSession(process, 'ada'))).toEqual(before);
  const project = await call(
    process,
    'GET',
    `/api/projects/${projectId}`,
    await selectSession(process, 'dany'),
  );
  expect(project.body).toMatchObject({ project: { name: 'Launch', restricted: true } });
});
