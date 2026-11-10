import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  authorize,
  AuthService,
  clockOf,
  fingerprintResourceUseActor,
  type OrganizationPrincipal,
  retainSecurityPrincipal,
  type SecurityPrincipal,
} from '@wbs/core';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { AccessDecisionRepository } from './access-decisions';
import { openDatabase, openDrizzle } from './db';
import { resolveProjectWriteScopeIn } from './fanout-capture';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { runMigrations } from './migrate';
import { currentMembershipAccess, SqliteOrganizationAccess } from './organization-access';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { admitResourceUseProject } from './resource-use';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let dir: string;
let sqlite: Database;
let access: SqliteOrganizationAccess;
let decisions: AccessDecisionRepository;
const target = {
  kind: 'work_package',
  chain: { level: 'work_package', organizationId: 'org-a', workPackageId: 'wp-a' },
  restricted: false,
} as const;
const human: OrganizationPrincipal = { id: 'ada' };
const machine: OrganizationPrincipal = {
  id: 'ada',
  delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
  authentication: { kind: 'machine', credentialId: 'cred-a', personId: 'agent-a' },
};
const consent: OrganizationPrincipal = {
  id: 'ada',
  delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
  authentication: {
    kind: 'consent',
    issuer: 'https://idp.test/',
    subject: 'ada',
    credentialId: 'cred-c',
    personId: 'agent-c',
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-authorization-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  sqlite = openDatabase(path);
  sqlite.run("INSERT INTO users (id, username, created_at) VALUES ('ada', 'ada', 1)");
  sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  sqlite.run(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'super_admin', 1)",
  );
  sqlite.run(
    "INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES ('wp-a', 'A', 'ada', 0, 1)",
  );
  sqlite.run(
    "INSERT INTO project_organization (resource_id, organization_id) VALUES ('wp-a', 'org-a')",
  );
  sqlite.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  const db = openDrizzle(path);
  access = new SqliteOrganizationAccess(
    db,
    () => Promise.resolve('org-a'),
    () => 1000,
  );
  decisions = new AccessDecisionRepository(db);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function grant(
  subjectKind: 'user' | 'machine_credential',
  subjectId: string,
  roleId: string,
): void {
  sqlite.run(
    `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at) VALUES (?, 'org-a', 'work_package', 'wp-a', ?, ?, ?, 'route', 1)`,
    [`grant-${subjectId}`, subjectKind, subjectId, roleId],
  );
}

describe('resolved organization authority with grants', () => {
  it('resolves current membership uncapped without lending its legacy role to authorization', async () => {
    expect(await access.resolve(human)).toEqual({
      ok: true,
      access: {
        principal: { id: 'ada' },
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: 'ada', role: 'super_admin', cap: null },
      },
    });
    expect(await authorize(decisions, human, target, 'package.write')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    grant('user', 'ada', 'package-viewer');
    expect(await authorize(decisions, human, target, 'package.write')).toEqual({
      ok: false,
      reason: 'forbidden',
      permission: 'package.write',
    });
    expect(await authorize(decisions, human, target, 'package.read')).toMatchObject({
      ok: true,
      effective: { via: [{ roleId: 'package-viewer' }] },
    });
  });

  for (const [kind, principal] of [
    ['machine', machine],
    ['consent', consent],
  ] as const) {
    it(`resolves a ${kind} principal with delegation and contributor cap, using only its credential grants`, async () => {
      expect(await access.resolve(principal)).toEqual({
        ok: true,
        access: {
          principal: {
            id: principal.id,
            authentication: structuredClone(principal.authentication),
          },
          kind: 'scoped',
          scope: {
            organizationId: 'org-a',
            userId: 'ada',
            role: 'member',
            delegated: true,
            cap: CONTRIBUTOR_CAP,
          },
        },
      });
      grant('user', 'ada', 'package-manager');
      expect(await authorize(decisions, principal, target, 'package.read')).toEqual({
        ok: false,
        reason: 'not_found',
      });
      const authentication = principal.authentication;
      if (authentication?.kind !== 'machine' && authentication?.kind !== 'consent')
        throw new Error('expected credential principal');
      grant('machine_credential', authentication.credentialId, 'package-manager');
      expect(await authorize(decisions, principal, target, 'package.write')).toMatchObject({
        ok: true,
      });
      expect(await authorize(decisions, principal, target, 'package.manage_settings')).toEqual({
        ok: false,
        reason: 'forbidden',
        permission: 'package.manage_settings',
      });
      expect(await authorize(decisions, principal, target, 'package.claim_for_others')).toEqual({
        ok: false,
        reason: 'forbidden',
        permission: 'package.claim_for_others',
      });
      sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = 'ada'",
      );
      expect(await access.resolve(principal)).toEqual({ ok: false, refusal: 'not_a_member' });
      expect(await authorize(decisions, principal, target, 'package.read')).toEqual({
        ok: false,
        reason: 'not_found',
      });
    });
  }

  it('keeps a human delegation uncapped', async () => {
    const delegated: OrganizationPrincipal = {
      ...human,
      delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
    };
    expect(await access.resolve(delegated)).toEqual({
      ok: true,
      access: {
        principal: { id: 'ada' },
        kind: 'scoped',
        scope: {
          organizationId: 'org-a',
          userId: 'ada',
          role: 'super_admin',
          delegated: true,
          cap: null,
        },
      },
    });
    grant('user', 'ada', 'package-manager');
    expect(await authorize(decisions, delegated, target, 'package.manage_settings')).toMatchObject({
      ok: true,
    });
  });

  it('returns membership facts without inventing a credential cap', () => {
    expect(currentMembershipAccess(openDrizzle(join(dir, 'test.db')), 'org-a', 'ada')).toEqual({
      ok: true,
      access: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: 'ada', role: 'super_admin' },
      },
    });
  });

  for (const [kind, principal] of [
    ['machine', machine],
    ['consent', consent],
  ] as const) {
    it(`preserves the actual ${kind} principal and fixed cap through resource-use grant admission`, async () => {
      const retained = retainSecurityPrincipal(principal);
      const authentication = retained.authentication;
      if (authentication?.kind !== 'machine' && authentication?.kind !== 'consent')
        throw new Error('expected pinned native fixture');
      Object.assign(authentication, { credentialId: crypto.randomUUID() });
      if (authentication.kind === 'consent')
        Object.assign(retained, {
          delegation: {
            organizationId: 'org-a',
            audience: 'wbs-be-01/via-mcp-01',
            client: 'native-fixture',
            grant: 'native-family',
          },
        });
      sqlite.run("INSERT INTO person(id,name,kind,account_id) VALUES(?,?,'agent','ada')", [
        authentication.personId,
        authentication.personId,
      ]);
      sqlite.run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
        [authentication.personId, authentication.personId],
      );
      sqlite.run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,mcp_family_id,created_at,created_by) VALUES(?,'org-a',?,'ada',?,?,?,1,'ada')",
        [
          authentication.credentialId,
          authentication.personId,
          authentication.kind === 'consent' ? 'mcp_consent' : 'api_key',
          kind,
          authentication.kind === 'consent' ? 'native-family' : null,
        ],
      );
      grant('machine_credential', authentication.credentialId, 'package-manager');
      const resolved = await access.resolve(retained);
      if (!resolved.ok || resolved.access.kind !== 'scoped')
        throw new Error('expected scoped resource grant fixture');
      const observed: SecurityPrincipal[] = [];
      // Capture before installing the spy; call(this, ...) below retains its actual borrowed connection.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const check = AccessDecisionRepository.prototype.effectiveRoleAt;
      const observer = spyOn(
        AccessDecisionRepository.prototype,
        'effectiveRoleAt',
      ).mockImplementation(async function (this: AccessDecisionRepository, current, target) {
        observed.push(structuredClone(current));
        return check.call(this, current, target);
      });
      try {
        expect(
          await admitResourceUseProject(
            openDrizzle(join(dir, 'test.db')),
            'wp-a',
            {
              id: retained.id,
              principal: retained,
              fingerprint: fingerprintResourceUseActor(retained),
              personId: authentication.personId,
              access: resolved.access,
            },
            true,
            false,
          ),
        ).toEqual({ name: 'A', organizationId: 'org-a' });
        expect(observed).toEqual([retained]);
        expect(await authorize(decisions, retained, target, 'package.manage_settings')).toEqual({
          ok: false,
          reason: 'forbidden',
          permission: 'package.manage_settings',
        });
      } finally {
        observer.mockRestore();
      }
    });
  }

  it('preserves the credential cap when resolving a borrowed project write scope', async () => {
    grant('user', 'ada', 'package-contributor');
    grant('machine_credential', 'cred-a', 'package-contributor');
    grant('machine_credential', 'cred-c', 'package-contributor');
    const resolve = resolveProjectWriteScopeIn(
      openDrizzle(join(dir, 'test.db')),
      createReadSnapshotLifetime(),
    );
    for (const principal of [human, machine, consent]) {
      const authentication = principal.authentication;
      expect(await resolve('wp-a', 'org-a', 'ada', authentication)).toMatchObject({
        ok: true,
        scope: { cap: authentication === undefined ? null : CONTRIBUTOR_CAP },
      });
    }
  });

  it('authorizes an authenticated machine grant through its own persisted grant', async () => {
    const credentialId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    sqlite.run(
      "INSERT INTO person (id, name, kind, account_id, created_at) VALUES ('agent-a', 'Agent', 'agent', 'ada', 1)",
    );
    sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('agent-a', 'org-a', 'Agent')",
    );
    sqlite.run(
      "INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at) VALUES (?, 'org-a', 'agent-a', 'ada', 'api_key', 'Agent key', 1)",
      [credentialId],
    );
    const db = openDrizzle(join(dir, 'test.db'));
    const auth = new AuthService({
      users: new UserRepository(db, OPEN),
      clock: clockOf({ now: () => 1000, newId: () => 'unused' }),
      passwords: {
        hash: () => Promise.reject(new Error('unexpected password hash')),
        verify: () => Promise.reject(new Error('unexpected password verify')),
      },
      tokens: {
        sign: () => Promise.reject(new Error('unexpected token sign')),
        verify: () => Promise.reject(new Error('unexpected token verify')),
      },
      machineKeys: { credentials: new MachineCredentialRepository(db, OPEN), now: () => 1000 },
    });
    const principal = await auth.admitMachineGrant({
      credentialId,
      personId: 'agent-a',
      organizationId: 'org-a',
      runId: null,
    });
    if (principal === 'unknown_identity') throw new Error('the persisted credential was refused');
    expect(await access.resolve(principal)).toMatchObject({
      ok: true,
      access: { scope: { cap: CONTRIBUTOR_CAP, delegated: true } },
    });
    grant('user', 'ada', 'package-manager');
    expect(await authorize(decisions, principal, target, 'package.read')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    grant('machine_credential', credentialId, 'package-manager');
    expect(await authorize(decisions, principal, target, 'package.write')).toMatchObject({
      ok: true,
    });
    expect(await authorize(decisions, principal, target, 'package.manage_settings')).toEqual({
      ok: false,
      reason: 'forbidden',
      permission: 'package.manage_settings',
    });
  });

  it('throws when trusted grant state is unreadable', () => {
    sqlite.run('DROP TABLE access_role_permission');
    expect(authorize(decisions, human, target, 'package.read')).rejects.toThrow();
  });
});
