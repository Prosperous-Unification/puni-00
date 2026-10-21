import { JwksTokenVerifier } from '@wbs/auth';
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
 * Two fixture routes stand in for the operator: `/__fixture/activate` runs the
 * organization activation CLI and then adds a second organization holding a
 * new account, and `/__fixture/remove-member` removes one account's membership.
 */
const jwksUrl = process.env['MCP_TEST_JWKS_URL'];
const issuer = process.env['MCP_TEST_ISSUER'];
const audience = process.env['MCP_TEST_AUDIENCE'];
if (jwksUrl === undefined || issuer === undefined || audience === undefined)
  throw new Error('MCP_TEST_JWKS_URL, MCP_TEST_ISSUER and MCP_TEST_AUDIENCE are required');
const trustedIssuer: string = issuer;

const keys = await generateKeyPair('RS256', { extractable: true });
const backend = await BootedBrowserProcess.open(
  'enabled',
  {
    ...new FakeOidcProvider().routeOptions(BOOTED_ORIGIN),
    verifier: new JwksTokenVerifier({ audience, issuer, jwksUri: new URL(jwksUrl) }),
  },
  BOOTED_ORIGIN,
  undefined,
  undefined,
  { signingKey: await exportPKCS8(keys.privateKey), verifyKey: await exportSPKI(keys.publicKey) },
);

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
    if (request.method === 'POST' && path === '/__fixture/remove-member') {
      const { username } = (await request.json()) as { username: string };
      backend.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
        `u-${username}`,
      ]);
      return Response.json({ removed: username });
    }
    return backend.app.handle(request);
  },
});
console.log(JSON.stringify({ port: server.port }));

async function stop(): Promise<void> {
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
