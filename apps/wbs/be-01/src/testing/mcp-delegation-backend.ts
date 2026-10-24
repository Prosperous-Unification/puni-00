import { JwksTokenVerifier } from '@wbs/auth';
import type { SqliteSource } from '@wbs/store-sqlite';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './booted-browser-process';
import { FakeOidcProvider } from './fake-oidc-provider';
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
 * to dany's organization bound to an account or to nobody,
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
          env: { ...process.env, DB_PATH: backend.databasePath() },
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
      return new Response(run.stdout.toString(), { status: 200 });
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
      const { id, account } = (await request.json()) as { id: string; account: string | null };
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
        [id, organization.organization_id, id],
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
