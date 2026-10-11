import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Realtime authorization (org-access 6.1–6.3): gw-01 forwards a socket's
 * browser credential behind its own secret, and be-01 proves the principal
 * through ordinary browser authentication, then current membership and the
 * project's organization. Real SQLite and the production organization access.
 */
let h: OrganizationHarness;
const SECRET = 'x'.repeat(32);
let aProject: string;
let bProject: string;

async function project(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/** A gateway call: its secret plus the socket's forwarded cookie, as gw-01 sends them. */
async function gateway(
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await h.app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

const forwarded = (username: string) => ({
  'x-internal-auth': SECRET,
  cookie: `__Host-wbs_access=${h.token(username)}`,
});

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  aProject = await project('ada', 'A plan');
  bProject = await project('grace', 'B plan');
});

afterEach(() => {
  h.close();
});

const access = (projectId: string) => `/internal/gateway/projects/${projectId}/browser-access`;

describe('POST /internal/gateway/projects/:id/browser-access', () => {
  it('admits a member to their organization’s project', async () => {
    expect(await gateway(access(aProject), forwarded('ada'))).toEqual({ status: 204, body: null });
  });

  it('refuses a foreign project as not found, exactly like an absent one', async () => {
    const foreign = await gateway(access(bProject), forwarded('ada'));
    const absent = await gateway(access(crypto.randomUUID()), forwarded('ada'));

    expect(foreign).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(foreign).toEqual(absent);
  });

  it('refuses a removed member', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-a',
      h.userId('ada'),
    ]);

    expect(await gateway(access(aProject), forwarded('ada'))).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });

  it('refuses a forwarded browser credential without the gateway secret', async () => {
    const { cookie } = forwarded('ada');

    expect(await gateway(access(aProject), { cookie })).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(await gateway(access(aProject), { cookie, 'x-internal-auth': 'y'.repeat(32) })).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('refuses a Bearer in place of the forwarded browser cookie', async () => {
    expect(
      await gateway(access(aProject), {
        'x-internal-auth': SECRET,
        authorization: `Bearer ${h.token('ada')}`,
      }),
    ).toEqual({ status: 401, body: { error: 'unauthenticated' } });
  });

  it('refuses a forwarded credential that proves nobody', async () => {
    expect(
      await gateway(access(aProject), {
        'x-internal-auth': SECRET,
        cookie: '__Host-wbs_access=not-a-session',
      }),
    ).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    expect(await gateway(access(aProject), { 'x-internal-auth': SECRET })).toEqual({
      status: 401,
      body: { error: 'unauthenticated' },
    });
  });
});

describe('POST /internal/resume for the forwarded principal', () => {
  const resume = (username: string, points: Record<string, number>) =>
    gateway('/internal/resume', forwarded(username), { resume_points: points, trace_id: 't' });

  it('refuses a resume naming a foreign project', async () => {
    const answer = await resume('ada', {
      [`project:${aProject}`]: -1,
      [`project:${bProject}`]: -1,
      'internal:anything': -1,
    });

    expect(answer.status).toBe(200);
    const outcomes = answer.body as Partial<Record<string, { status: string; reason?: string }>>;
    expect(outcomes[`project:${aProject}`]?.status).toBe('replaying');
    expect(outcomes[`project:${bProject}`]).toEqual({ status: 'denied', reason: 'forbidden' });
    expect(outcomes['internal:anything']).toEqual({ status: 'denied', reason: 'forbidden' });
  });

  it('replays nothing to a removed member', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?', [
      'org-a',
      h.userId('ada'),
    ]);

    expect((await resume('ada', { [`project:${aProject}`]: -1 })).body).toEqual({
      [`project:${aProject}`]: { status: 'denied', reason: 'forbidden' },
    });
  });

  it('refuses a resume without the gateway secret or a forwarded principal', async () => {
    const body = { resume_points: { [`project:${aProject}`]: -1 }, trace_id: 't' };
    expect(
      (await gateway('/internal/resume', { cookie: forwarded('ada').cookie }, body)).status,
    ).toBe(401);
    expect((await gateway('/internal/resume', { 'x-internal-auth': SECRET }, body)).body).toEqual({
      error: 'unauthenticated',
    });
  });
});
