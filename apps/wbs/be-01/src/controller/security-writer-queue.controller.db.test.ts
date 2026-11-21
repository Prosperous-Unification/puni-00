import { createHash } from 'node:crypto';

import type { AuditedAct } from '@wbs/core/ports/organization-audit';
import type { SecurityPrincipal } from '@wbs/core/ports/security-principal';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { type Connection, type Drizzle, openConnection, openDatabase } from '@wbs/store-sqlite/db';
import { DomainClaimRepository } from '@wbs/store-sqlite/domain-claim';
import { EnterpriseConnectionRepository } from '@wbs/store-sqlite/enterprise-connection';
import { type Gate, WriteCoordinator } from '@wbs/store-sqlite/gate';
import { ProvisioningTokenRepository } from '@wbs/store-sqlite/provisioning-token';
import { SessionPolicyRepository } from '@wbs/store-sqlite/session-policy';
import { SharedPeopleRestoreApprovalRepository } from '@wbs/store-sqlite/shared-people-restore-approval';
import { TrustedIssuerAdministrationRepository } from '@wbs/store-sqlite/trusted-issuer-administration';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { seedConnection } from '../testing/scim-fixture';

let harness: OrganizationHarness;
const ownedConnections: Connection[] = [];
const observedDigest = createHash('sha256').update('matched-proof').digest('hex');
const pendingClaim = {
  id: 'pending-claim',
  domain: 'example.net',
  challengeDigest: observedDigest,
  challengeExpiresAt: 100_000,
  phase: 'pending' as const,
};
beforeEach(async () => {
  harness = OrganizationHarness.open();
  for (const username of ['security', 'substitute']) await harness.register(username);
  harness.organization('org-a');
  for (const username of ['security', 'substitute']) {
    harness.member('org-a', username, 'viewer');
    harness.grantPermissions('org-a', username, ['organization.manage_security']);
    harness.bind(username, 'org-a');
  }
  harness.activate();
  seedConnection(harness, {
    organizationId: 'org-a',
    domain: 'acme.test',
    auth0Connection: 'acme-saml',
    loginSlug: 'acme',
    provenBy: 'security',
  });
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim(id,organization_id,domain,status,proof_digest,last_success_at,last_checked_at,created_at) VALUES ('free-claim','org-a','example.org','verified',?,1,1,1)",
    ['a'.repeat(64)],
  );
  harness.sqlite.run(
    "INSERT INTO organization_domain_claim(id,organization_id,domain,status,challenge_digest,challenge_expires_at,created_at) VALUES ('pending-claim','org-a','example.net','pending',?,?,1)",
    [observedDigest, pendingClaim.challengeExpiresAt],
  );
  harness.sqlite.run(
    "INSERT INTO organization_scim_token(id,organization_id,digest,created_at,created_by) VALUES ('token-id','org-a',?,1,?)",
    ['b'.repeat(64), harness.userId('security')],
  );
  harness.sqlite.run(
    "INSERT INTO organization_trusted_issuer(id,organization_id,issuer,jwks_uri,default_audience,created_at,created_by) VALUES ('issuer-id','org-a','https://existing.test','https://existing.test/jwks','audience',1,?)",
    [harness.userId('security')],
  );
});
afterEach(() => {
  for (const connection of ownedConnections.splice(0).reverse()) connection.close();
  harness.close();
});

interface QueuedSecurityCall {
  readonly name: string;
  readonly denied: unknown;
  readonly invoke: (
    db: Drizzle,
    gate: Gate,
    principal: SecurityPrincipal,
    act: AuditedAct,
  ) => Promise<unknown>;
}
const policy = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 };
const draft = {
  id: 'fresh-issuer',
  issuer: 'https://fresh.test',
  jwksUri: 'https://fresh.test/jwks',
  audience: 'audience',
  ssoConnectionId: null,
};
const calls: readonly QueuedSecurityCall[] = [
  {
    name: 'session-read',
    denied: 'forbidden',
    invoke: (db, gate, principal) => new SessionPolicyRepository(db, gate).read('org-a', principal),
  },
  {
    name: 'session-set',
    denied: 'forbidden',
    invoke: (db, gate, principal, act) =>
      new SessionPolicyRepository(db, gate).set('org-a', principal, policy, act),
  },
  {
    name: 'domain-list',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new DomainClaimRepository(db, gate).listClaims('org-a', principal),
  },
  {
    name: 'domain-capture',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new DomainClaimRepository(db, gate).readClaimForVerification(
        'org-a',
        principal,
        'pending-claim',
      ),
  },
  {
    name: 'domain-verify',
    denied: 'forbidden',
    invoke: (db, gate, principal, act) =>
      new DomainClaimRepository(db, gate).verifyClaim(
        'org-a',
        principal,
        pendingClaim,
        observedDigest,
        act.stamp,
        () => 1,
      ),
  },
  {
    name: 'domain-challenge',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new DomainClaimRepository(db, gate).reissueClaim(
        'org-a',
        principal,
        'example.com',
        'c'.repeat(64),
        100_000,
        act.stamp,
      ),
  },
  {
    name: 'domain-rotate',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new DomainClaimRepository(db, gate).rotateClaim(
        'org-a',
        principal,
        'free-claim',
        'c'.repeat(64),
        act.stamp,
      ),
  },
  {
    name: 'domain-release',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new DomainClaimRepository(db, gate).releaseClaim('org-a', principal, 'free-claim'),
  },
  {
    name: 'sso-list',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new EnterpriseConnectionRepository(db, gate).list('org-a', principal),
  },
  {
    name: 'sso-create',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new EnterpriseConnectionRepository(db, gate).create(
        'org-a',
        principal,
        {
          domainClaimId: 'free-claim',
          auth0Connection: 'new-saml',
          strategy: 'samlp',
          loginSlug: 'new',
        },
        'new-connection',
        act,
      ),
  },
  {
    name: 'sso-update',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new EnterpriseConnectionRepository(db, gate).update(
        'org-a',
        principal,
        'conn-acme',
        { loginSlug: 'changed' },
        act,
      ),
  },
  {
    name: 'sso-enforcement',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new EnterpriseConnectionRepository(db, gate).setEnforced(
        'org-a',
        principal,
        'conn-acme',
        false,
        null,
        act,
      ),
  },
  {
    name: 'sso-remove',
    denied: 'forbidden',
    invoke: (db, gate, principal, act) =>
      new EnterpriseConnectionRepository(db, gate).remove('org-a', principal, 'conn-acme', act),
  },
  {
    name: 'provisioning-list',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new ProvisioningTokenRepository(db, gate).list('org-a', principal),
  },
  {
    name: 'provisioning-issue',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new ProvisioningTokenRepository(db, gate).issue(
        'org-a',
        principal,
        'new-token',
        'd'.repeat(64),
        act,
      ),
  },
  {
    name: 'provisioning-rotate',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new ProvisioningTokenRepository(db, gate).rotate(
        'org-a',
        principal,
        'token-id',
        'successor',
        'e'.repeat(64),
        act,
      ),
  },
  {
    name: 'provisioning-revoke',
    denied: 'forbidden',
    invoke: (db, gate, principal, act) =>
      new ProvisioningTokenRepository(db, gate).revoke('org-a', principal, 'token-id', act),
  },
  {
    name: 'trusted-list',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new TrustedIssuerAdministrationRepository(db, gate).list('org-a', principal),
  },
  {
    name: 'trusted-preflight',
    denied: 'forbidden',
    invoke: (db, gate, principal) =>
      new TrustedIssuerAdministrationRepository(db, gate).checkRegistration(
        'org-a',
        principal,
        draft,
      ),
  },
  {
    name: 'trusted-register',
    denied: { kind: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new TrustedIssuerAdministrationRepository(db, gate).register('org-a', principal, draft, act),
  },
  {
    name: 'trusted-remove',
    denied: 'forbidden',
    invoke: (db, gate, principal, act) =>
      new TrustedIssuerAdministrationRepository(db, gate).remove(
        'org-a',
        principal,
        'issuer-id',
        act,
      ),
  },
  {
    name: 'restore-approval',
    denied: { ok: false, refusal: 'forbidden' },
    invoke: (db, gate, principal, act) =>
      new SharedPeopleRestoreApprovalRepository(db, gate).approve(
        'org-a',
        principal,
        'restore-1',
        'a'.repeat(64),
        'approval-id',
        act.stamp,
      ),
  },
];
const snapshot = () =>
  [
    'organization_session_policy',
    'organization_domain_claim',
    'organization_sso_connection',
    'organization_scim_token',
    'organization_trusted_issuer',
    'organization_audit',
    'shared_people_restore_operation',
    'shared_people_restore_approval',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());

for (const call of calls) {
  it('retains the actual queued security principal and current grant at ' + call.name, async () => {
    const gate = new WriteCoordinator();
    const entered = Promise.withResolvers<undefined>();
    const held = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const principal: SecurityPrincipal = {
      id: harness.userId('security'),
      authentication: { kind: 'first_party', issuedAt: 1 },
    };
    const act = {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'queued-security',
    };
    const before = snapshot();
    let settled = false;
    const pending = call.invoke(openSecurityDb(), gate, principal, act).finally(() => {
      settled = true;
    });
    try {
      await Bun.sleep(10);
      expect(settled).toBe(false);
      expect(snapshot()).toEqual(before);
      harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [principal.id]);
      principal.id = harness.userId('substitute');
      principal.authentication = undefined;
    } finally {
      held.resolve(undefined);
      await blocker;
    }
    expect(await pending).toEqual(call.denied);
    expect(snapshot()).toEqual(before);
  });
  it(
    'throws for missing actual security principal before owner entry at ' + call.name,
    async () => {
      const before = snapshot();
      const gate: Gate = {
        enter: () => {
          throw new Error('unexpected owner entry');
        },
      };
      const act = {
        actor: harness.userId('security'),
        stamp: { at: 1, by: harness.userId('security') },
        auditId: 'missing-principal',
      };
      expect(
        (
          await rejectionOf(
            Promise.resolve(undefined).then(() =>
              call.invoke(openSecurityDb(), gate, undefined as unknown as SecurityPrincipal, act),
            ),
          )
        ).message,
      ).toMatch(/undefined/);
      expect(snapshot()).toEqual(before);
    },
  );
  it('reads current security grants under the same immediate writer at ' + call.name, async () => {
    const rival = openDatabase(harness.sqlite.filename);
    rival.run('PRAGMA busy_timeout=0');
    let observed = false;
    const principal: SecurityPrincipal = {
      id: harness.userId('security'),
      authentication: { kind: 'first_party', issuedAt: 1 },
    };
    const act = {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'held-security',
    };
    const db = openSecurityDb({
      logQuery(query) {
        if (!query.includes('CROSS JOIN access_grant g')) return;
        observed = true;
        expect(() =>
          rival.run('DELETE FROM access_grant WHERE subject_id=?', [principal.id]),
        ).toThrow('database is locked');
      },
    });
    try {
      expect(await call.invoke(db, new WriteCoordinator(), principal, act)).not.toEqual(
        call.denied,
      );
      expect(observed).toBe(true);
    } finally {
      rival.close();
    }
  });
  for (const broken of ['missing', 'corrupt'] as const) {
    it('throws on ' + broken + ' trusted grant state before effects at ' + call.name, async () => {
      const principal: SecurityPrincipal = { id: harness.userId('security') };
      if (broken === 'missing')
        harness.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_grants');
      else {
        harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
        harness.sqlite.run(
          "UPDATE access_role_permission SET permission='organization.unknown' WHERE role_id IN (SELECT role_id FROM access_grant WHERE subject_id=?)",
          [principal.id],
        );
      }
      const before = snapshot();
      const act = {
        actor: principal.id,
        stamp: { at: 1, by: principal.id },
        auditId: 'broken-grant',
      };
      expect(
        (await rejectionOf(call.invoke(openSecurityDb(), new WriteCoordinator(), principal, act)))
          .message,
      ).toMatch(broken === 'missing' ? 'access_grant' : 'organization.unknown');
      expect(snapshot()).toEqual(before);
    });
  }

  if (
    [
      'session-set',
      'domain-verify',
      'domain-challenge',
      'domain-rotate',
      'sso-create',
      'sso-update',
      'sso-enforcement',
      'sso-remove',
      'provisioning-issue',
      'provisioning-rotate',
      'provisioning-revoke',
      'trusted-register',
      'trusted-remove',
      'restore-approval',
    ].includes(call.name)
  ) {
    it('rejects a different stamped actor before any security owner at ' + call.name, async () => {
      const principal: SecurityPrincipal = { id: harness.userId('security') };
      const act = {
        actor: principal.id,
        stamp: { at: 1, by: harness.userId('substitute') },
        auditId: 'mismatched-security',
      };
      const before = snapshot();
      const gate: Gate = {
        enter: () => {
          throw new Error('unexpected owner entry');
        },
      };
      expect(
        (
          await rejectionOf(
            Promise.resolve(undefined).then(() =>
              call.invoke(openSecurityDb(), gate, principal, act),
            ),
          )
        ).message,
      ).toContain('security principal differs from the audited actor');
      expect(snapshot()).toEqual(before);
    });
    it('retains detached queued security stamps and audit actors at ' + call.name, async () => {
      if (call.name === 'sso-remove') harness.sqlite.run('DELETE FROM organization_scim_token');
      if (call.name === 'sso-enforcement')
        harness.sqlite.run(
          "UPDATE organization_sso_connection SET enforced=1 WHERE id='conn-acme'",
        );
      const gate = new WriteCoordinator();
      const entered = Promise.withResolvers<undefined>();
      const held = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const principal: SecurityPrincipal = { id: harness.userId('security') };
      const act = {
        actor: principal.id,
        stamp: { at: 1, by: principal.id },
        auditId: 'original-security-audit',
      };
      const pending = call.invoke(openSecurityDb(), gate, principal, act);
      act.actor = harness.userId('substitute');
      act.stamp.by = act.actor;
      act.stamp.at = 999;
      act.auditId = 'substituted-security-audit';
      held.resolve(undefined);
      await blocker;
      expect(await pending).not.toEqual(call.denied);
      for (const rows of snapshot())
        for (const row of rows) {
          if (typeof row !== 'object' || row === null)
            throw new Error('malformed actual security fixture row');
          for (const [key, value] of Object.entries(row)) {
            if (key === 'actor_id' || key.endsWith('_by'))
              expect(value).not.toBe(harness.userId('substitute'));
            if (key.endsWith('_at')) expect(value).not.toBe(999);
          }
        }
      expect(
        harness.sqlite
          .query("SELECT id FROM organization_audit WHERE id='substituted-security-audit'")
          .all(),
      ).toEqual([]);
    });
  }
  it('refuses a delegated human with an effective security grant at ' + call.name, async () => {
    const principal: SecurityPrincipal = {
      id: harness.userId('security'),
      delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
    };
    const act = {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'delegated-security',
    };
    const before = snapshot();
    expect(await call.invoke(openSecurityDb(), new WriteCoordinator(), principal, act)).toEqual(
      call.denied,
    );
    expect(snapshot()).toEqual(before);
  });
}

async function afterQueued<T>(start: (gate: Gate) => Promise<T>, mutate: () => void): Promise<T> {
  const gate = new WriteCoordinator();
  const entered = Promise.withResolvers<undefined>();
  const held = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  let pending: Promise<T>;
  try {
    pending = start(gate);
    mutate();
  } finally {
    held.resolve(undefined);
    await blocker;
  }
  return await pending;
}
function accountAct(): { principal: SecurityPrincipal; act: AuditedAct } {
  const principal = { id: harness.userId('security') };
  return {
    principal,
    act: { actor: principal.id, stamp: { at: 1, by: principal.id }, auditId: 'snapshot-security' },
  };
}
it('retains an enterprise create draft before its writer queue', async () => {
  const { principal, act } = accountAct();
  const draft = {
    domainClaimId: 'free-claim',
    auth0Connection: 'new-saml',
    strategy: 'samlp' as const,
    loginSlug: 'new',
  };
  const outcome = await afterQueued(
    (gate) =>
      new EnterpriseConnectionRepository(openSecurityDb(), gate).create(
        'org-a',
        principal,
        draft,
        'new-connection',
        act,
      ),
    () => {
      draft.auth0Connection = 'substituted-saml';
      draft.loginSlug = 'substituted';
    },
  );
  expect(outcome.kind).toBe('created');
  expect(
    harness.sqlite
      .query(
        "SELECT auth0_connection,login_slug FROM organization_sso_connection WHERE id='new-connection'",
      )
      .all(),
  ).toEqual([{ auth0_connection: 'new-saml', login_slug: 'new' }]);
});
it('retains an enterprise update change before its writer queue', async () => {
  const { principal, act } = accountAct();
  const change = { loginSlug: 'changed' };
  const outcome = await afterQueued(
    (gate) =>
      new EnterpriseConnectionRepository(openSecurityDb(), gate).update(
        'org-a',
        principal,
        'conn-acme',
        change,
        act,
      ),
    () => {
      change.loginSlug = 'substituted';
    },
  );
  expect(outcome.kind).toBe('updated');
  expect(
    harness.sqlite
      .query("SELECT login_slug FROM organization_sso_connection WHERE id='conn-acme'")
      .all(),
  ).toEqual([{ login_slug: 'changed' }]);
});
it('retains a domain verification snapshot before its writer queue', async () => {
  const { principal, act } = accountAct();
  const claim = { ...pendingClaim };
  const outcome = await afterQueued(
    (gate) =>
      new DomainClaimRepository(openSecurityDb(), gate).verifyClaim(
        'org-a',
        principal,
        claim,
        observedDigest,
        act.stamp,
        () => 1,
      ),
    () => {
      claim.id = 'free-claim';
      claim.challengeDigest = 'substituted';
    },
  );
  expect(outcome).toBe('verified');
  expect(
    harness.sqlite
      .query("SELECT status FROM organization_domain_claim WHERE id='pending-claim'")
      .all(),
  ).toEqual([{ status: 'verified' }]);
});
it('retains a trusted issuer registration preflight before its writer queue', async () => {
  const { principal } = accountAct();
  const registration = {
    issuer: 'https://fresh.test',
    audience: 'audience',
    ssoConnectionId: null,
  };
  const outcome = await afterQueued(
    (gate) =>
      new TrustedIssuerAdministrationRepository(openSecurityDb(), gate).checkRegistration(
        'org-a',
        principal,
        registration,
      ),
    () => {
      registration.issuer = 'https://existing.test';
    },
  );
  expect(outcome).toBe('ready');
});
it('retains a trusted issuer draft before its writer queue', async () => {
  const { principal, act } = accountAct();
  const registration = { ...draft };
  const outcome = await afterQueued(
    (gate) =>
      new TrustedIssuerAdministrationRepository(openSecurityDb(), gate).register(
        'org-a',
        principal,
        registration,
        act,
      ),
    () => {
      registration.issuer = 'https://substituted.test';
      registration.audience = 'substituted-audience';
    },
  );
  expect(outcome.kind).toBe('registered');
  expect(
    harness.sqlite
      .query(
        "SELECT issuer,default_audience FROM organization_trusted_issuer WHERE id='fresh-issuer'",
      )
      .all(),
  ).toEqual([{ issuer: 'https://fresh.test', default_audience: 'audience' }]);
});
it('retains the actual enterprise proof account identity and audited evidence before its writer queue', async () => {
  harness.sqlite.run(
    "UPDATE organization_sso_connection SET proven_at=NULL,proven_by=NULL WHERE id='conn-acme'",
  );
  const principal = { id: harness.userId('security') };
  const act = {
    actor: principal.id,
    stamp: { at: 1, by: principal.id },
    auditId: 'original-proof-audit',
  };
  const identity = {
    issuer: 'https://idp.test',
    subject: 'samlp|acme-saml|security@acme.test',
    email: 'security@acme.test',
    emailVerified: true,
  };
  const outcome = await afterQueued(
    (gate) =>
      new EnterpriseConnectionRepository(openSecurityDb(), gate).linkThroughConnection(
        principal,
        'conn-acme',
        identity,
        act,
      ),
    () => {
      principal.id = harness.userId('substitute');
      act.actor = principal.id;
      act.stamp.by = principal.id;
      act.auditId = 'substituted-proof-audit';
      identity.subject = 'samlp|other|substituted@acme.test';
      identity.email = 'substituted@acme.test';
    },
  );
  expect(outcome.kind).toBe('linked');
  expect(
    harness.sqlite
      .query("SELECT proven_by FROM organization_sso_connection WHERE id='conn-acme'")
      .all(),
  ).toEqual([{ proven_by: harness.userId('security') }]);
  expect(
    harness.sqlite
      .query(
        "SELECT user_id,subject,created_by FROM external_identity WHERE issuer='https://idp.test'",
      )
      .all(),
  ).toEqual([
    {
      user_id: harness.userId('security'),
      subject: 'samlp|acme-saml|security@acme.test',
      created_by: harness.userId('security'),
    },
  ]);
  expect(harness.sqlite.query('SELECT id,actor_id FROM organization_audit').all()).toEqual([
    { id: 'original-proof-audit', actor_id: harness.userId('security') },
  ]);
});
it('rechecks a queued enterprise proof grant without refusing its ordinary identity link', async () => {
  harness.sqlite.run(
    "UPDATE organization_sso_connection SET proven_at=NULL,proven_by=NULL WHERE id='conn-acme'",
  );
  const { principal, act } = accountAct();
  const identity = {
    issuer: 'https://idp.test',
    subject: 'samlp|acme-saml|security@acme.test',
    email: 'security@acme.test',
    emailVerified: true,
  };
  const outcome = await afterQueued(
    (gate) =>
      new EnterpriseConnectionRepository(openSecurityDb(), gate).linkThroughConnection(
        principal,
        'conn-acme',
        identity,
        act,
      ),
    () => harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [principal.id]),
  );
  expect(outcome.kind).toBe('linked');
  expect(
    harness.sqlite
      .query("SELECT proven_at,proven_by FROM organization_sso_connection WHERE id='conn-acme'")
      .all(),
  ).toEqual([{ proven_at: null, proven_by: null }]);
  expect(
    harness.sqlite
      .query("SELECT user_id FROM external_identity WHERE issuer='https://idp.test'")
      .all(),
  ).toEqual([{ user_id: principal.id }]);
  expect(
    harness.sqlite.query('SELECT email,email_verified FROM users WHERE id=?').get(principal.id),
  ).toEqual({ email: null, email_verified: 0 });
  expect(harness.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});

it('projects actual security authority without retaining credential binding or secret-shaped extras', async () => {
  const principal = {
    id: harness.userId('security'),
    authentication: { kind: 'first_party' as const, issuedAt: 1 },
    organizationBinding: { cookie: 'SENTINEL-COOKIE', credential: { digest: 'SENTINEL-DIGEST' } },
    rawToken: 'SENTINEL-TOKEN',
  };
  const observed: unknown[] = [];
  const db = openSecurityDb();
  const decisions = new AccessDecisionRepository(db);
  const evaluate = decisions.effectiveRoleAt.bind(decisions);
  const lookup = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt').mockImplementation(
    function (this: AccessDecisionRepository, subject, target) {
      observed.push(subject);
      return evaluate(subject, target);
    },
  );
  try {
    const act = {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'projected-security',
    };
    expect(
      await new SessionPolicyRepository(db, new WriteCoordinator()).set(
        'org-a',
        principal,
        policy,
        act,
      ),
    ).toBe('set');
  } finally {
    lookup.mockRestore();
  }
  expect(observed.map((subject) => Object.keys(subject as object).sort())).toEqual([
    ['authentication', 'delegation', 'id'],
  ]);
  expect(JSON.stringify(observed)).not.toContain('SENTINEL');
  expect(JSON.stringify(snapshot())).not.toContain('SENTINEL');
});

async function rejectionOf(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected the production operation to reject with an Error', {
      cause: failure,
    });
  return failure;
}

function openSecurityDb(logger?: Parameters<typeof openConnection>[1]): Drizzle {
  const connection = openConnection(harness.sqlite.filename, logger);
  ownedConnections.push(connection);
  return connection.db;
}
