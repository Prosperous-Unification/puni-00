import { createHash } from 'node:crypto';

import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { seedConnection } from '../testing/scim-fixture';

let harness: OrganizationHarness;
const dnsValue = `wbs-domain-verification=org-a:example.net:${'c'.repeat(64)}`;
let dnsCalls: number;

beforeEach(async () => {
  dnsCalls = 0;
  harness = OrganizationHarness.open({
    resolver: {
      lookupTxt: () => {
        dnsCalls += 1;
        return Promise.resolve([dnsValue]);
      },
    },
  });
  for (const username of ['security', 'role-only']) await harness.register(username);
  harness.organization('org-a');
  harness.member('org-a', 'security', 'viewer');
  harness.grantPermissions('org-a', 'security', ['organization.manage_security']);
  harness.member('org-a', 'role-only', 'super_admin', ['project-contributor']);
  for (const username of ['security', 'role-only']) harness.bind(username, 'org-a');
  harness.activate();
  seedConnection(harness, {
    organizationId: 'org-a',
    domain: 'acme.test',
    auth0Connection: 'acme-saml',
    loginSlug: 'acme',
    provenBy: 'security',
  });
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id,organization_id,domain,status,proof_digest,last_success_at,last_checked_at,created_at) VALUES ('free-claim','org-a','example.org','verified',?,1,1,1)",
    ['a'.repeat(64)],
  );
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim (id,organization_id,domain,status,challenge_digest,challenge_expires_at,created_at) VALUES ('pending-claim','org-a','example.net','pending',?,?,1)",
    [createHash('sha256').update(dnsValue).digest('hex'), Date.now() + 86_400_000],
  );
});
afterEach(() => {
  harness.close();
});

interface SecurityCall {
  readonly name: string;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  readonly status: number;
}
const calls: readonly SecurityCall[] = [
  { name: 'domain-list', method: 'GET', path: '/api/organization/domains', status: 200 },
  {
    name: 'domain-challenge',
    method: 'POST',
    path: '/api/organization/domains/challenges',
    body: { domain: 'example.com' },
    status: 201,
  },
  {
    name: 'domain-release',
    method: 'DELETE',
    path: '/api/organization/domains/free-claim',
    status: 204,
  },
  {
    name: 'domain-rotate',
    method: 'POST',
    path: '/api/organization/domains/free-claim/rotate',
    status: 201,
  },
  {
    name: 'domain-verify',
    method: 'POST',
    path: '/api/organization/domains/pending-claim/verify',
    status: 200,
  },
  { name: 'sso-list', method: 'GET', path: '/api/organization/sso-connections', status: 200 },
  {
    name: 'sso-create',
    method: 'POST',
    path: '/api/organization/sso-connections',
    body: {
      domainClaimId: 'free-claim',
      auth0Connection: 'example-saml',
      strategy: 'samlp',
      loginSlug: 'example',
    },
    status: 201,
  },
  {
    name: 'sso-update',
    method: 'PATCH',
    path: '/api/organization/sso-connections/conn-acme',
    body: { loginSlug: 'changed-acme' },
    status: 200,
  },
  {
    name: 'sso-enforcement',
    method: 'PATCH',
    path: '/api/organization/sso-connections/conn-acme',
    body: { enforced: false },
    status: 200,
  },
  {
    name: 'sso-remove',
    method: 'DELETE',
    path: '/api/organization/sso-connections/conn-acme',
    status: 204,
  },
  {
    name: 'provisioning-list',
    method: 'GET',
    path: '/api/organization/provisioning-tokens',
    status: 200,
  },
  {
    name: 'provisioning-issue',
    method: 'POST',
    path: '/api/organization/provisioning-tokens',
    status: 201,
  },
  {
    name: 'provisioning-rotate',
    method: 'POST',
    path: '/api/organization/provisioning-tokens/token-id/rotate',
    status: 201,
  },
  {
    name: 'provisioning-revoke',
    method: 'DELETE',
    path: '/api/organization/provisioning-tokens/token-id',
    status: 204,
  },
  {
    name: 'restore-approval',
    method: 'POST',
    path: '/api/organization/shared-people/restore-approvals',
    body: { operationId: 'restore-1', backupDigest: 'a'.repeat(64) },
    status: 200,
  },
];
const snapshot = () =>
  [
    'organization_domain_claim',
    'organization_sso_connection',
    'organization_scim_token',
    'organization_audit',
    'shared_people_restore_operation',
    'shared_people_restore_approval',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());

for (const call of calls) {
  function prepare(): void {
    if (call.path.includes('/token-id'))
      harness.sqlite.run(
        "INSERT INTO organization_scim_token(id,organization_id,digest,created_at,created_by) VALUES ('token-id','org-a',?,1,?)",
        ['b'.repeat(64), harness.userId('security')],
      );
  }
  it('admits a minimal security grant at ' + call.name, async () => {
    prepare();
    expect((await harness.call('security', call.method, call.path, call.body)).status).toBe(
      call.status,
    );
  });
  it('encodes a current grant denial before effects at ' + call.name, async () => {
    prepare();
    const before = snapshot();
    expect(await harness.call('role-only', call.method, call.path, call.body)).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_security' },
    });
    expect(snapshot()).toEqual(before);
    expect(dnsCalls).toBe(0);
  });
}

async function duringSecurityResolution<T>(mutate: string, call: () => Promise<T>): Promise<T> {
  const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
  const resolve = observer.getMockImplementation();
  if (resolve === undefined) throw new Error('security resolver spy lost its real implementation');
  let substitutions = 0;
  observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
    const admitted = await resolve.call(this, principal);
    if (mutate === 'id') Object.assign(principal, { id: harness.userId('role-only') });
    if (mutate === 'authentication')
      Object.assign(principal, {
        authentication: { kind: 'machine', credentialId: 'replacement', personId: 'agent' },
      });
    if (mutate === 'delegation')
      Object.assign(principal, { delegation: { organizationId: 'org-a' } });
    substitutions += 1;
    return admitted;
  });
  try {
    const answered = await call();
    expect(substitutions).toBe(1);
    return answered;
  } finally {
    observer.mockRestore();
  }
}

for (const call of calls) {
  for (const mutate of ['id', 'authentication', 'delegation']) {
    it(
      'retains the route security principal across organization resolution at ' +
        call.name +
        ': ' +
        mutate,
      async () => {
        if (call.path.includes('/token-id'))
          harness.sqlite.run(
            "INSERT INTO organization_scim_token(id,organization_id,digest,created_at,created_by) VALUES ('token-id','org-a',?,1,?)",
            ['b'.repeat(64), harness.userId('security')],
          );
        const answered = await duringSecurityResolution(mutate, () =>
          harness.call('security', call.method, call.path, call.body),
        );
        expect(answered.status).toBe(call.status);
        expect(
          harness.sqlite
            .query('SELECT id FROM organization_audit WHERE actor_id=?')
            .all(harness.userId('role-only')),
        ).toEqual([]);
      },
    );
  }
}
