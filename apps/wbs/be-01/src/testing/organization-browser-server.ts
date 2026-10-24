import { parseArgs } from 'node:util';

import { BootedBrowserProcess } from './booted-browser-process';

/** Loopback only: the JWT key and the fixture password are public in this repository. */
const HOSTNAME = '127.0.0.1';

/**
 * `--port` (0 picks a free one), required so the caller owns the port.
 *
 * @throws naming the flag when it is missing or not a non-negative integer.
 */
function portFromArguments(): number {
  const { values } = parseArgs({ options: { port: { type: 'string' } }, strict: true });
  if (values.port === undefined || values.port === '') throw new Error('--port is required');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0) throw new Error('--port must be a non-negative integer');
  return port;
}

const port = portFromArguments();
/** Local acceptance alone activates this newly migrated disposable database. */
const backend = await BootedBrowserProcess.open('enabled', undefined, 'http://localhost:7400');
await backend.register('ada');
for (const organization of ['org-a', 'org-b']) {
  backend.organization(organization);
  backend.member(organization, 'ada', 'super_admin');
}
await backend.register('token-admin');
backend.organization('org-tokens');
backend.member('org-tokens', 'token-admin', 'super_admin');
backend.sqlite.run(
  `INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at)
   VALUES ('claim-tokens', 'org-tokens', 'tokens.test', 'verified', ?, 1, 1)`,
  ['a'.repeat(64)],
);
backend.sqlite.run(
  `INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, proven_at, proven_by, created_at)
   VALUES ('conn-tokens', 'org-tokens', 'claim-tokens', 'tokens-saml', 'samlp', 'tokens', 1, ?, 1)`,
  [backend.userId('token-admin')],
);
backend.activate();
const server = Bun.serve({
  hostname: HOSTNAME,
  port,
  fetch: (request: Request) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/__fixture/remove-a') {
      backend.sqlite.run(
        'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
        ['org-a', backend.userId('ada')],
      );
      return Response.json({ removed: true });
    }
    return backend.app.handle(request);
  },
});
console.log(
  `organization fixture: enabled authority; activated disposable SQLite; http://${HOSTNAME}:${String(server.port)}`,
);
async function stop() {
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
