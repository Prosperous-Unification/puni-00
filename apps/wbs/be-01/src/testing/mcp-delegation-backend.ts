import { JwksTokenVerifier } from '@wbs/auth';
import type { SqliteSource } from '@wbs/store-sqlite';
import { AccessGrantRepository } from '@wbs/store-sqlite/access-grant';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './booted-browser-process';
import { FakeOidcProvider } from './fake-oidc-provider';
import { grantCredential } from './machine-credential-fixture';
import { TEST_MACHINE_GRANT_ENV } from './machine-grant-fixture';
import { writeMcpStoreFixture } from './mcp-store-fixture';

/**
 * be-01 for mcp-01's booted organization delegation test
 * (`apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`), run as its own
 * process: `bootBe01`'s production composition over a fresh migrated file,
 * with a fresh delegation key pair and the RS256 upstream verifier the test's
 * JWKS (`MCP_TEST_JWKS_URL`) signs for. Prints `{"port":N}` once serving.
 *
 * Fixture routes stand in for the operator and the people page:
 * `/__fixture/activate` runs the organization activation CLI and then adds a
 * second organization holding a new account, `/__fixture/remove-member`
 * removes one account's membership, `/__fixture/agent` adds an agent person
 * to dany's organization bound to an account or to nobody, its root name its
 * id as scoped access creates it and its local name `name`,
 * `/__fixture/revoke-consent` revokes a person's live consent credentials as
 * the revoke route does, and `/__fixture/consents` lists the consent
 * credentials (`wbs-machine-credentials` A20).
 */
const jwksUrl = process.env['MCP_TEST_JWKS_URL'];
const issuer = process.env['MCP_TEST_ISSUER'];
const audience = process.env['MCP_TEST_AUDIENCE'];
if (jwksUrl === undefined || issuer === undefined || audience === undefined)
  throw new Error('MCP_TEST_JWKS_URL, MCP_TEST_ISSUER and MCP_TEST_AUDIENCE are required');
const trustedIssuer: string = issuer;
let syntheticExternalCommands = false;
let source: SqliteSource | undefined;
let publications = 0;
let armed = false;
let releaseWriter: (() => void) | undefined;
let heldWriter: Promise<void> | undefined;
let observeQueued: (() => void) | undefined;
let queued: Promise<void> | undefined;
let markQueued: (() => void) | undefined;

const keys = await generateKeyPair('RS256', { extractable: true });
const backend = await BootedBrowserProcess.open(
  'enabled',
  {
    ...new FakeOidcProvider().routeOptions(BOOTED_ORIGIN),
    verifier: new JwksTokenVerifier({ audience, issuer, jwksUri: new URL(jwksUrl) }),
    issuer: () => Promise.resolve(trustedIssuer),
  },
  BOOTED_ORIGIN,
  undefined,
  undefined,
  { signingKey: await exportPKCS8(keys.privateKey), verifyKey: await exportSPKI(keys.publicKey) },
  () => syntheticExternalCommands,
  (opened) => {
    source = opened;
  },
);
if (source === undefined) throw new Error('boot did not expose its source');
const gate = source.gate;
const enter = gate.enter.bind(gate);
gate.enter = (work) => {
  const pending = enter(work);
  observeQueued?.();
  observeQueued = undefined;
  return pending;
};
const resolveOrganization = backend.options.organizations.resolve.bind(
  backend.options.organizations,
);
backend.options.organizations.resolve = async (principal) => {
  const resolution = await resolveOrganization(principal);
  // Request admission consumes delegation_use on this same writer before returning.
  // Hold only after that real admission, or the delegation consumption itself deadlocks.
  if (armed) {
    armed = false;
    const released = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    heldWriter = enter(() => released);
    observeQueued = markQueued;
  }
  return resolution;
};
const publish = backend.options.writes.announcements.publish.bind(
  backend.options.writes.announcements,
);
backend.options.writes.announcements.publish = (projectId, event) => {
  publications += 1;
  return publish(projectId, event);
};

/**
 * An account signed in only through the upstream provider as `auth0|<name>`:
 * before activation through the legacy `users.idp_*` pair, which activation
 * backfills into `external_identity`; after it, through that mapping.
 */
function account(name: string, activated: boolean): void {
  backend.sqlite.run(
    'INSERT INTO users (id, username, password_hash, created_at, idp_issuer, idp_sub) VALUES (?, ?, NULL, 1, ?, ?)',
    [`u-${name}`, name, trustedIssuer, `auth0|${name}`],
  );
  if (activated)
    backend.sqlite.run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      [`map-${name}`, `u-${name}`, trustedIssuer, `auth0|${name}`],
    );
}
account('dany', false);
account('ada', false);

const cli = new URL('../organization-activation-cli.ts', import.meta.url).pathname;
// Activation waits for an advanced mcp-01 credential epoch. This stands for the operator's
// epoch CLI; the booted mcp-01 keeps its own store, so its pre-activation session stays
// unrevoked and the test still observes be-01's `no_active_organization` refusal.
const mcpStore = `${backend.databasePath()}-mcp.sqlite`;
writeMcpStoreFixture(mcpStore, 1);

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/__fixture/arm-consent-write') {
      if (armed || heldWriter !== undefined) throw new Error('writer already armed');
      armed = true;
      queued = new Promise<void>((resolve) => {
        markQueued = resolve;
      });
      return Response.json({ armed: true });
    }
    if (request.method === 'POST' && path === '/__fixture/wait-consent-write') {
      // The command has completed real request admission before its enqueue is observed.
      if (queued === undefined) throw new Error('writer not armed');
      await queued;
      return Response.json({ queued: true });
    }
    if (request.method === 'POST' && path === '/__fixture/change-consent') {
      const { personId, fault } = (await request.json()) as { personId: string; fault: string };
      // backend.sqlite is a separate connection, not the writer's held connection.
      const changed =
        fault === 'revocation'
          ? backend.sqlite.run(
              "UPDATE machine_credential SET revoked_at = ? WHERE person_id = ? AND source = 'mcp_consent'",
              [Date.now(), personId],
            )
          : fault === 'family'
            ? backend.sqlite.run(
                "UPDATE machine_credential SET mcp_family_id = ? WHERE person_id = ? AND source = 'mcp_consent'",
                [crypto.randomUUID(), personId],
              )
            : (() => {
                throw new Error(`unknown consent fault: ${fault}`);
              })();
      return Response.json({ changed: changed.changes });
    }
    if (request.method === 'POST' && path === '/__fixture/release-consent-write') {
      if (releaseWriter === undefined || heldWriter === undefined)
        throw new Error('writer not held');
      releaseWriter();
      await heldWriter;
      releaseWriter = undefined;
      heldWriter = undefined;
      queued = undefined;
      observeQueued = undefined;
      return Response.json({ released: true });
    }
    if (request.method === 'POST' && path === '/__fixture/cleanup-consent-write') {
      releaseWriter?.();
      await heldWriter;
      armed = false;
      releaseWriter = undefined;
      heldWriter = undefined;
      queued = undefined;
      markQueued = undefined;
      observeQueued = undefined;
      return Response.json({ cleaned: true });
    }
    if (request.method === 'POST' && path === '/__fixture/publications')
      return Response.json({ publications });
    if (request.method === 'POST' && path === '/__fixture/active-commands') {
      seedDependencyAuthority(backend.databasePath());
      syntheticExternalCommands = true;
      return Response.json({ active: true });
    }
    if (request.method === 'POST' && path === '/__fixture/activate') {
      const run = Bun.spawnSync(
        [
          process.execPath,
          cli,
          '--mcp-store',
          mcpStore,
          '--name',
          'default',
          '--super-admin',
          'dany',
          '--apply',
        ],
        {
          env: { ...process.env, ...TEST_MACHINE_GRANT_ENV, DB_PATH: backend.databasePath() },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      if (run.exitCode !== 0) return new Response(run.stderr.toString(), { status: 500 });
      // A second organization the activated store did not have, and its only member.
      account('grace', true);
      backend.organization('org-b');
      backend.sqlite.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-b', 'u-grace', 'member', 1)",
      );
      const primary = backend.sqlite
        .query<{ organization_id: string }, []>(
          "SELECT organization_id FROM organization_membership WHERE user_id='u-dany'",
        )
        .get();
      if (primary === null) throw new Error('activated fixture account has no organization');
      for (const [organizationId, userId, roleId] of [
        [primary.organization_id, 'u-dany', 'org-super-admin'],
        [primary.organization_id, 'u-ada', 'project-contributor'],
        ['org-b', 'u-grace', 'org-admin'],
      ])
        backend.sqlite.run(
          "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,'organization',?,'user',?,?,'route',1)",
          [crypto.randomUUID(), organizationId, organizationId, userId, roleId],
        );
      return new Response(run.stdout.toString(), { status: 200 });
    }
    if (request.method === 'POST' && path === '/__fixture/create-project') {
      const { username, name, token } = (await request.json()) as {
        username: string;
        name: string;
        token: string;
      };
      const target = backend.sqlite
        .query<{ organization_id: string }, [string]>(
          'SELECT organization_id FROM organization_membership WHERE user_id=?',
        )
        .get(`u-${username}`);
      if (target === null) throw new Error('fixture project account has no organization');
      const authorization = `Bearer ${token}`;
      const selected = await backend.app.handle(
        new Request(`${BOOTED_ORIGIN}/api/organization/active`, {
          method: 'POST',
          headers: { authorization, origin: BOOTED_ORIGIN, 'content-type': 'application/json' },
          body: JSON.stringify({ organizationId: target.organization_id }),
        }),
      );
      if (selected.status !== 200)
        throw new Error(
          `fixture native selection refused: ${String(selected.status)} ${await selected.text()}`,
        );
      const cookie = selected.headers.get('set-cookie')?.split(';')[0];
      if (cookie === undefined) throw new Error('fixture native selection set no cookie');
      const created = await backend.app.handle(
        new Request(`${BOOTED_ORIGIN}/api/projects`, {
          method: 'POST',
          headers: {
            authorization,
            origin: BOOTED_ORIGIN,
            cookie,
            'X-WBS-Expected-Organization': target.organization_id,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name }),
        }),
      );
      const body: unknown = await created.json();
      return Response.json({ status: created.status, body });
    }
    if (request.method === 'POST' && path === '/__fixture/cp14-consent') {
      const { familyId, action } = (await request.json()) as {
        familyId: string;
        action: 'clear' | 'repair' | 'state';
      };
      const credential = backend.sqlite
        .query<
          { id: string; organization_id: string; issued_by: string; person_id: string },
          [string]
        >(
          'SELECT id,organization_id,issued_by,person_id FROM machine_credential WHERE mcp_family_id=?',
        )
        .get(familyId);
      if (credential === null) throw new Error('CP14 fixture family has no credential');
      if (action === 'clear')
        backend.sqlite.run(
          "DELETE FROM access_grant WHERE organization_id=? AND scope_kind='organization' AND subject_kind='user' AND role_id='org-super-admin'",
          [credential.organization_id],
        );
      if (action === 'repair') {
        if (source === undefined) throw new Error('CP14 fixture source missing');
        const granted = await new AccessGrantRepository(source.db, source.gate).grant(
          credential.organization_id,
          {
            id: crypto.randomUUID(),
            scope: { kind: 'organization' },
            subject: { kind: 'user', userId: credential.issued_by },
            roleId: 'org-super-admin',
            origin: 'operator',
          },
          {
            actor: { kind: 'operator', login: 'cp14-repair' },
            at: Date.now(),
            auditId: crypto.randomUUID(),
          },
        );
        if (typeof granted === 'string')
          throw new Error('operator CP14 repair refused: ' + granted);
      }
      const holders = backend.sqlite
        .query<{ n: number }, [string]>(
          "SELECT count(*) AS n FROM access_grant g JOIN organization_membership m ON m.organization_id=g.organization_id AND m.user_id=g.subject_id WHERE g.organization_id=? AND g.scope_kind='organization' AND g.scope_id=g.organization_id AND g.subject_kind='user' AND g.role_id='org-super-admin'",
        )
        .get(credential.organization_id);
      if (holders === null) throw new Error('CP14 fixture count missing');
      if (action === 'repair' && holders.n < 1)
        throw new Error('audited CP14 repair did not establish a direct holder');
      return Response.json({
        directHolders: holders.n,
        credential: backend.sqlite
          .query('SELECT id,revoked_at FROM machine_credential WHERE id=?')
          .get(credential.id),
        grants: backend.sqlite
          .query(
            "SELECT id,role_id FROM access_grant WHERE subject_kind='machine_credential' AND subject_id=? ORDER BY id",
          )
          .all(credential.id),
        claims: backend.sqlite
          .query('SELECT * FROM claim WHERE person_id=? ORDER BY id')
          .all(credential.person_id),
        revoked: backend.sqlite
          .query(
            "SELECT action,actor_id,subject_id FROM organization_audit WHERE (action='machine_credential_revoked' AND subject_id=?) OR (action='access_revoked' AND json_extract(detail,'$.subjectId')=?) ORDER BY rowid",
          )
          .all(credential.id, credential.id),
      });
    }
    if (request.method === 'POST' && path === '/__fixture/grant-consent') {
      const { familyId, roleId, scope } = (await request.json()) as {
        familyId: string;
        roleId: string;
        scope: { kind: 'organization' } | { kind: 'work_package'; id: string };
      };
      const credentials = backend.sqlite
        .query<{ id: string; organization_id: string }, [string]>(
          'SELECT id,organization_id FROM machine_credential WHERE mcp_family_id=? AND revoked_at IS NULL',
        )
        .all(familyId);
      const credential = credentials.at(0);
      if (credentials.length !== 1 || credential === undefined)
        throw new Error('fixture consent family must name exactly one live credential');
      grantCredential(
        backend.sqlite,
        credential.organization_id,
        credential.id,
        roleId,
        scope.kind,
        scope.kind === 'organization' ? credential.organization_id : scope.id,
      );
      return Response.json({ granted: true });
    }
    if (request.method === 'POST' && path === '/__fixture/restrict-project') {
      const { id, restricted } = (await request.json()) as { id: string; restricted: boolean };
      backend.sqlite.run('UPDATE project SET restricted = ?, owner_id = ? WHERE id = ?', [
        restricted ? 1 : 0,
        restricted ? 'u-grace' : 'u-dany',
        id,
      ]);
      return Response.json({ id, restricted });
    }
    if (request.method === 'POST' && path === '/__fixture/typed-dependencies')
      return Response.json(
        backend.sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all(),
      );
    if (request.method === 'POST' && path === '/__fixture/consent-write-state')
      return Response.json(
        backend.sqlite
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map(({ name }) => ({
            name,
            rows: backend.sqlite
              .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
              .all()
              .map((row) => JSON.stringify(row))
              .sort(),
          })),
      );
    if (request.method === 'POST' && path === '/__fixture/write-state') {
      const tables = [
        'project',
        'work_item',
        'dependency',
        'typed_dependency',
        'external_dependency',
        'step',
        'calendar_marker',
        'command_journal',
        'saved_plan',
        'saved_plan_body',
        'organization_audit',
        'event_log',
        'event_sequencer',
      ];
      return Response.json(
        tables.map((table) => backend.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
      );
    }
    if (request.method === 'POST' && path === '/__fixture/remove-member') {
      const { username } = (await request.json()) as { username: string };
      backend.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
        `u-${username}`,
      ]);
      return Response.json({ removed: username });
    }
    if (request.method === 'POST' && path === '/__fixture/agent') {
      const { id, account, name } = (await request.json()) as {
        id: string;
        account: string | null;
        name: string;
      };
      const organization = backend.sqlite
        .query<{ organization_id: string }, []>(
          "SELECT organization_id FROM organization_membership WHERE user_id = 'u-dany'",
        )
        .get();
      if (organization === null) return new Response('dany has no organization', { status: 500 });
      backend.sqlite.run(
        "INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, 'agent', ?)",
        [id, id, account === null ? null : `u-${account}`],
      );
      backend.sqlite.run(
        'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
        [id, organization.organization_id, name],
      );
      return Response.json({ organizationId: organization.organization_id });
    }
    if (request.method === 'POST' && path === '/__fixture/revoke-consent') {
      const { personId } = (await request.json()) as { personId: string };
      const revoked = backend.sqlite.run(
        "UPDATE machine_credential SET revoked_at = ? WHERE person_id = ? AND source = 'mcp_consent' AND revoked_at IS NULL",
        [Date.now(), personId],
      );
      return Response.json({ revoked: revoked.changes });
    }
    if (request.method === 'GET' && path === '/__fixture/consents')
      return Response.json(
        backend.sqlite
          .query(
            "SELECT person_id AS personId, issued_by AS issuedBy, revoked_at AS revokedAt FROM machine_credential WHERE source = 'mcp_consent' ORDER BY created_at, id",
          )
          .all(),
      );
    if (request.method === 'GET' && path === '/__fixture/claims')
      return Response.json(
        backend.sqlite.query('SELECT person_id AS personId FROM claim ORDER BY person_id').all(),
      );
    return backend.app.handle(request);
  },
});
console.log(JSON.stringify({ port: server.port }));

async function stop(): Promise<void> {
  releaseWriter?.();
  await heldWriter;
  await server.stop(true);
  await backend.close();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
