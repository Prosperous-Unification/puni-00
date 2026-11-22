import { createProject } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { BootedBrowserProcess } from '../testing/booted-browser-process';
import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The forwarded organization cookie, end to end: a real selection cookie issued
 * by `POST /api/organization/active` and read back by the production
 * `organizationCookieBinding` when gw-01 forwards it. Every case runs twice:
 * against the organization harness and against `bootBe01`'s own composition
 * with `browserSessionAuthority: 'enabled'`, so the path production uses after
 * activation is the one proven here.
 *
 * Proof: reading no organization cookie in `identityResolver` (`cookie: null`)
 * failed all four cases (0 pass, 4 fail): nothing binds an organization
 * without the forwarded cookie (2026-10-11).
 *
 * Proof: composing `NO_BOUND_ORGANIZATION` in `bootBe01` when enabled failed
 * every booted case in `beforeEach`: the selected pair's work package creation
 * answered 403 `no_active_organization` (4 pass, 4 fail, 2026-10-11).
 */
type SelectionHost = Pick<
  OrganizationHarness,
  'app' | 'register' | 'token' | 'userId' | 'organization' | 'member' | 'activate' | 'sqlite'
> & { close(): void | Promise<void> };

const HOSTS: readonly [string, () => Promise<SelectionHost>][] = [
  [
    'organization harness',
    () => Promise.resolve(OrganizationHarness.open({ sessionBinding: true })),
  ],
  ['production boot composition', () => BootedBrowserProcess.open('enabled')],
];

let h: SelectionHost;
const SECRET = 'x'.repeat(32);
const selections = new Map<string, string>();
let aWorkPackage: string;
let bWorkPackage: string;

async function select(username: string, organizationId: string): Promise<string> {
  const response = await h.app.handle(
    new Request('http://localhost/api/organization/active', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.token(username)}`,
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId }),
    }),
  );
  const pair = response.headers.get('set-cookie')?.split(';')[0];
  if (response.status !== 200 || pair === undefined)
    throw new Error(`selection refused: ${String(response.status)}`);
  return pair.slice('__Host-wbs_organization='.length);
}

async function workPackage(
  username: string,
  name: string,
  organizationId: string,
): Promise<string> {
  const response = await h.app.handle(
    new Request('http://localhost' + createProject.path, {
      method: createProject.method,
      headers: {
        cookie: `__Host-wbs_access=${h.token(username)}; __Host-wbs_organization=${selections.get(username) ?? ''}`,
        'X-WBS-Expected-Organization': organizationId,
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: name + ' project', workPackage: { name } }),
    }),
  );
  if (response.status !== 201) throw new Error(`create refused: ${await response.text()}`);
  const birth = await createProject.responses[0].schema.validator['~standard'].validate(
    await response.json(),
  );
  if (birth.issues !== undefined || birth.value.workPackage === undefined)
    throw new Error('project birth omitted the selected gateway fixture package');
  return birth.value.workPackage.id;
}

/** gw-01's call: its secret plus `username`'s access cookie and `organizationCookie`. */
async function browserAccess(workPackageId: string, username: string, organizationCookie: string) {
  const response = await h.app.handle(
    new Request(`http://localhost/internal/gateway/work-packages/${workPackageId}/browser-access`, {
      method: 'POST',
      headers: {
        'x-internal-auth': SECRET,
        cookie: `__Host-wbs_access=${h.token(username)}; __Host-wbs_organization=${organizationCookie}`,
      },
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

describe.each(HOSTS)('browser-access with a real forwarded organization cookie (%s)', (_, open) => {
  beforeEach(async () => {
    h = await open();
    for (const username of ['ada', 'grace']) await h.register(username);
    h.organization('org-a');
    h.organization('org-b');
    h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
    h.member('org-b', 'grace', 'member', ['project-contributor', 'org-viewer']);
    for (const [org, user] of [
      ['org-a', 'ada'],
      ['org-b', 'grace'],
    ])
      h.sqlite.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,'organization',?,'user',?,'org-admin','route',1)",
        ['gateway-' + org, org, org, h.userId(user)],
      );
    h.activate();
    selections.set('ada', await select('ada', 'org-a'));
    selections.set('grace', await select('grace', 'org-b'));
    aWorkPackage = await workPackage('ada', 'A plan', 'org-a');
    bWorkPackage = await workPackage('grace', 'B plan', 'org-b');
  });

  afterEach(async () => {
    await h.close();
    selections.clear();
  });

  it('admits the selected organization’s own work package', async () => {
    expect(await browserAccess(aWorkPackage, 'ada', selections.get('ada') ?? '')).toEqual({
      status: 204,
      body: null,
    });
  });

  it('refuses another user’s valid organization cookie pasted beside one’s own credential', async () => {
    // Grace's cookie is genuine but bound to her credential, so for Ada it
    // binds nothing: Ada has no active organization, not a foreign one.
    const pasted = await browserAccess(bWorkPackage, 'ada', selections.get('grace') ?? '');
    expect(pasted).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    expect(await browserAccess(aWorkPackage, 'ada', selections.get('grace') ?? '')).toEqual(pasted);
  });

  it('refuses a removed member presenting their own still-valid cookie', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-a',
      h.userId('ada'),
    ]);

    expect(await browserAccess(aWorkPackage, 'ada', selections.get('ada') ?? '')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });

  it('refuses a foreign work package as not found under the own selection', async () => {
    const foreign = await browserAccess(bWorkPackage, 'ada', selections.get('ada') ?? '');
    expect(foreign).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await browserAccess(crypto.randomUUID(), 'ada', selections.get('ada') ?? '')).toEqual(
      foreign,
    );
  });
});
