import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['sue', 'adam']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'sue', 'super_admin');
  h.member('org-a', 'adam', 'admin');
  h.bind('sue', 'org-a');
  h.bind('adam', 'org-a');
  h.activate();
});

afterEach(() => {
  h.close();
});

const audits = () =>
  h.sqlite
    .query(
      "SELECT actor_id, detail FROM organization_audit WHERE action = 'session_policy_changed'",
    )
    .all();

/**
 * `organization-session-policy` "A super-admin sets the organization's
 * session policy", mounted over real SQLite.
 */
describe('/api/organization/session-policy', () => {
  it('sets a policy with one audit row naming both values, reads it and clears it', async () => {
    const policy = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 };
    expect(await h.call('sue', 'PUT', '/api/organization/session-policy', policy)).toEqual({
      status: 200,
      body: { policy },
    });
    expect(audits()).toEqual([{ actor_id: h.userId('sue'), detail: JSON.stringify(policy) }]);
    expect(await h.call('sue', 'GET', '/api/organization/session-policy')).toEqual({
      status: 200,
      body: { policy },
    });
    expect(
      await h.call('sue', 'PUT', '/api/organization/session-policy', {
        maxSessionSeconds: null,
        reauthenticateAfterSeconds: null,
      }),
    ).toEqual({ status: 200, body: { policy: null } });
    expect(audits()).toHaveLength(2);
  });

  // Proof: admitting every body made this answer 500 from the store instead
  // of 400; watched 2026-10-12.
  it('refuses out-of-range, fractional and inverted bounds', async () => {
    for (const body of [
      { maxSessionSeconds: 299, reauthenticateAfterSeconds: null },
      { maxSessionSeconds: 2_592_001, reauthenticateAfterSeconds: null },
      { maxSessionSeconds: 3_600.5, reauthenticateAfterSeconds: null },
      { maxSessionSeconds: 3_600, reauthenticateAfterSeconds: 7_200 },
    ])
      expect(await h.call('sue', 'PUT', '/api/organization/session-policy', body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(await h.call('sue', 'GET', '/api/organization/session-policy')).toEqual({
      status: 200,
      body: { policy: null },
    });
    expect(audits()).toEqual([]);
  });

  it('refuses an admin, changing nothing and writing no audit', async () => {
    const body = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: null };
    expect(await h.call('adam', 'PUT', '/api/organization/session-policy', body)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await h.call('adam', 'GET', '/api/organization/session-policy')).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(audits()).toEqual([]);
  });
});
