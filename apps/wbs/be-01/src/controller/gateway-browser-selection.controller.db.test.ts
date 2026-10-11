import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The forwarded organization cookie, end to end: a real selection cookie issued
 * by `POST /api/organization/active` and read back by the production
 * `organizationCookieBinding` when gw-01 forwards it. Production still composes
 * `NO_BOUND_ORGANIZATION` until activation; this proves the path it will use.
 *
 * Proof: reading no organization cookie in `identityResolver` (`cookie: null`)
 * failed all four cases (0 pass, 4 fail): nothing binds an organization
 * without the forwarded cookie (2026-10-11).
 */
let h: OrganizationHarness;
const SECRET = 'x'.repeat(32);
const selections = new Map<string, string>();
let aProject: string;
let bProject: string;

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

async function project(username: string, name: string): Promise<string> {
  const response = await h.app.handle(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: {
        cookie: `__Host-wbs_access=${h.token(username)}; __Host-wbs_organization=${selections.get(username) ?? ''}`,
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }),
  );
  if (response.status !== 200) throw new Error(`create refused: ${await response.text()}`);
  return ((await response.json()) as { project: { id: string } }).project.id;
}

/** gw-01's call: its secret plus `username`'s access cookie and `organizationCookie`. */
async function browserAccess(projectId: string, username: string, organizationCookie: string) {
  const response = await h.app.handle(
    new Request(`http://localhost/internal/gateway/projects/${projectId}/browser-access`, {
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

beforeEach(async () => {
  h = OrganizationHarness.open({ sessionBinding: true });
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.activate();
  selections.set('ada', await select('ada', 'org-a'));
  selections.set('grace', await select('grace', 'org-b'));
  aProject = await project('ada', 'A plan');
  bProject = await project('grace', 'B plan');
});

afterEach(() => {
  h.close();
  selections.clear();
});

describe('browser-access with a real forwarded organization cookie', () => {
  it('admits the selected organization’s own project', async () => {
    expect(await browserAccess(aProject, 'ada', selections.get('ada') ?? '')).toEqual({
      status: 204,
      body: null,
    });
  });

  it('refuses another user’s valid organization cookie pasted beside one’s own credential', async () => {
    // Grace's cookie is genuine but bound to her credential, so for Ada it
    // binds nothing: Ada has no active organization, not a foreign one.
    const pasted = await browserAccess(bProject, 'ada', selections.get('grace') ?? '');
    expect(pasted).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    expect(await browserAccess(aProject, 'ada', selections.get('grace') ?? '')).toEqual(pasted);
  });

  it('refuses a removed member presenting their own still-valid cookie', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-a',
      h.userId('ada'),
    ]);

    expect(await browserAccess(aProject, 'ada', selections.get('ada') ?? '')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });

  it('refuses a foreign project as not found under the own selection', async () => {
    const foreign = await browserAccess(bProject, 'ada', selections.get('ada') ?? '');
    expect(foreign).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await browserAccess(crypto.randomUUID(), 'ada', selections.get('ada') ?? '')).toEqual(
      foreign,
    );
  });
});
