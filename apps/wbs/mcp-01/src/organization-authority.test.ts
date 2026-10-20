import { describe, expect, it } from 'bun:test';

import {
  type DelegationOutcome,
  organizationAuthority,
  OrganizationAuthorityDefect,
} from './organization-authority';
import type { McpRefreshAuthority } from './refresh-authority';
import type { FetchLike } from './wbs-client';

/** mcp-01's client of be-01's `/internal/mcp/*` routes: what it sends, and how it reads each answer. */
const SECRET = 's'.repeat(32);

function client(answer: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    return answer(url);
  };
  return {
    calls,
    authority: organizationAuthority(
      { WBS_API_URL: 'https://be.test/', INTERNAL_AUTH_SECRET: SECRET },
      fetchImpl,
    ),
  };
}

const REQUEST = {
  organizationId: 'org-a',
  userId: 'u-ada',
  client: 'client-1',
  grant: 'family-1',
  scopes: ['read', 'write'],
} as const;

const AUTHORITY: McpRefreshAuthority = {
  familyId: 'family-1',
  clientId: 'client-1',
  subject: 'auth0|ada',
  scope: 'wbs:read',
  credentialEpoch: 0,
  binding: { organizationId: 'org-a', userId: 'u-ada', issuer: 'https://idp.test/' },
};

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a rejection');
}

describe('organization authority client', () => {
  it('sends the service secret and the upstream token, and the binding in the body', async () => {
    const { authority, calls } = client(() => Response.json({ token: 'delegation' }));
    expect(await authority.delegationFor('upstream', REQUEST)).toEqual({
      kind: 'issued',
      token: 'delegation',
    });
    expect(calls).toEqual([
      {
        url: 'https://be.test/internal/mcp/delegation',
        headers: {
          'x-internal-auth': SECRET,
          authorization: 'Bearer upstream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'org-a',
          userId: 'u-ada',
          client: 'client-1',
          grant: 'family-1',
          scope: 'read write',
        }),
      },
    ]);
  });

  it('reads each modeled delegation refusal and throws on the rest', async () => {
    const answers: [number, string, DelegationOutcome['kind']][] = [
      [401, 'unauthenticated', 'upstream_rejected'],
      [401, 'unknown_identity', 'upstream_rejected'],
      [403, 'not_a_member', 'membership_ended'],
      [403, 'binding_changed', 'membership_ended'],
      [403, 'sso_required', 'refused'],
      [403, 'reauthentication_required', 'refused'],
      [403, 'insufficient_scope', 'refused'],
    ];
    for (const [status, error, kind] of answers) {
      const { authority } = client(() => Response.json({ error }, { status }));
      expect((await authority.delegationFor('upstream', REQUEST)).kind).toBe(kind);
    }
    for (const [status, body] of [
      [401, { error: 'unauthorized' }],
      [403, { error: 'delegation_inactive' }],
      [403, { error: 'no_active_organization' }],
      [500, { error: 'internal' }],
      [200, { nope: true }],
    ] as const) {
      const { authority } = client(() => Response.json(body, { status }));
      expect(await rejection(authority.delegationFor('upstream', REQUEST))).toBeInstanceOf(
        OrganizationAuthorityDefect,
      );
    }
  });

  it('lists consent organizations and reads a refused upstream token', async () => {
    const listed = client(() =>
      Response.json({
        state: 'activated',
        userId: 'u-ada',
        memberships: [{ organizationId: 'org-a', name: 'Acme', role: 'member' }],
      }),
    );
    expect(await listed.authority.organizationsFor('upstream')).toEqual({
      kind: 'activated',
      userId: 'u-ada',
      memberships: [{ organizationId: 'org-a', name: 'Acme', role: 'member' }],
    });
    expect(listed.calls[0]?.body).toBeUndefined();
    const before = client(() => Response.json({ state: 'pre_activation' }));
    expect(await before.authority.organizationsFor('upstream')).toEqual({ kind: 'pre_activation' });
    const unknown = client(() => Response.json({ error: 'unknown_identity' }, { status: 401 }));
    expect(await unknown.authority.organizationsFor('upstream')).toEqual({ kind: 'refused' });
    const misconfigured = client(() => Response.json({ error: 'unauthorized' }, { status: 401 }));
    expect(await rejection(misconfigured.authority.organizationsFor('upstream'))).toBeInstanceOf(
      OrganizationAuthorityDefect,
    );
  });

  it('reads family authority, unavailable on an outage and defective otherwise', async () => {
    const admitted = client(() =>
      Response.json({
        outcome: 'admitted',
        issuer: 'https://idp.test/',
        subject: 'auth0|ada',
        userId: 'u-ada',
        organizationId: 'org-a',
        enforced: [],
        policy: { maxSessionSeconds: 60, reauthenticateAfterSeconds: null },
      }),
    );
    expect(await admitted.authority.readRefreshAuthority(AUTHORITY)).toEqual({
      outcome: 'admitted',
      authority: AUTHORITY,
      facts: {
        enforced: [],
        policy: { maxSessionSeconds: 60, reauthenticateAfterSeconds: null },
        lifecycle: null,
      },
    });
    // No user credential travels with an authority read.
    expect(admitted.calls[0]?.headers['authorization']).toBeUndefined();
    const echoed = client(() =>
      Response.json({
        outcome: 'admitted',
        issuer: 'https://idp.test/',
        subject: 'auth0|ada',
        userId: 'u-grace',
        organizationId: 'org-a',
        enforced: [],
        policy: null,
      }),
    );
    // The echo is what be-01 verified, so a substituted user reaches the caller's comparison.
    expect(await echoed.authority.readRefreshAuthority(AUTHORITY)).toMatchObject({
      authority: { binding: { userId: 'u-grace' } },
    });
    expect(
      await client(() => Response.json({ outcome: 'denied' })).authority.readRefreshAuthority(
        AUTHORITY,
      ),
    ).toEqual({ outcome: 'denied' });
    expect(
      await client(() => new Response('down', { status: 503 })).authority.readRefreshAuthority(
        AUTHORITY,
      ),
    ).toEqual({ outcome: 'unavailable' });
    expect(
      await client(() => {
        throw new TypeError('fetch failed');
      }).authority.readRefreshAuthority(AUTHORITY),
    ).toEqual({ outcome: 'unavailable' });
    expect(
      await rejection(
        client(() =>
          Response.json({ error: 'unauthorized' }, { status: 401 }),
        ).authority.readRefreshAuthority(AUTHORITY),
      ),
    ).toBeInstanceOf(OrganizationAuthorityDefect);
  });
});
