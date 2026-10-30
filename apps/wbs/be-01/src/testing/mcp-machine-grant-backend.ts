import { randomBytes } from 'node:crypto';

import type { DependencyClientRefusal } from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from '@wbs/store-sqlite/testing/dependency-capability';

import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-capability';
import { admitDependencyClient } from '../runtime/dependency-client';
import { importMachineGrantKeys, type MachineGrantKey } from '../runtime/machine-grant';
import { LocalOidcIssuers } from './local-oidc-issuer';
import { addAgentPerson, issueApiKey, revokeMachineCredential } from './machine-credential-fixture';
import { OrganizationHarness } from './organization-harness';

/**
 * be-01 for mcp-01's booted machine token test
 * (`apps/wbs/mcp-01/src/machine-token.boot.test.ts`, `wbs-mcp-agent-surface`
 * tasks 2.2 and 2.3), run as its own process: the composed organization
 * harness with machine grants and one local trusted issuer, over a fresh
 * migrated file. `MCP_TEST_BE_SECRET` and `MCP_TEST_AUTHORIZATION_SERVER` are
 * the test's own generated values; the grant key is generated here. Prints
 * `{"port":N}` once serving, then be-01's log lines.
 *
 * Organization `org-a` has dany (super admin) and vic (viewer), with agent
 * persons `claire` (bound to dany) and `vics-agent` (bound to vic). Fixture
 * routes stand in for the admin:
 * - `POST /__fixture/activate` sets the activation marker, then trusts the
 *   local issuer in org-a;
 * - `POST /__fixture/api-key` `{ personId }` issues an API key: `{ id, key }`;
 * - `POST /__fixture/revoke` `{ id }` revokes a credential;
 * - `POST /__fixture/workload` `{ subject }` creates claire's `oidc` credential: `{ id }`;
 * - `POST /__fixture/assertion` `{ subject, typ?, lifetimeSeconds?, jti? }`
 *   signs a workload token of the trusted issuer for `<authorization server>/org/org-a`;
 * - `POST /__fixture/fail-next-issuance` makes the next audit write throw, a
 *   failure inside the grant route (task 2.3);
 * - `POST /__fixture/rotate-grant-key` replaces the grant key with a fresh one
 *   and keeps no previous key: a rotation that dropped `_PREVIOUS` early, so
 *   every grant already issued is `unknown_grant_key` (task 3.2);
 * - `GET /__fixture/audit` lists the organization audit rows;
 * - `POST /__fixture/compute-provider` registers an SSH host in org-a as dany and points a new
 *   divisible resource at it: `{ providerId, resourceId }`;
 * - `GET /__fixture/capacity-reports` lists the stored capacity reports.
 */
const secret = process.env['MCP_TEST_BE_SECRET'];
const authorizationServer = process.env['MCP_TEST_AUTHORIZATION_SERVER'];
if (secret === undefined || authorizationServer === undefined)
  throw new Error('MCP_TEST_BE_SECRET and MCP_TEST_AUTHORIZATION_SERVER are required');

/** The workload audience: under mcp-01's issuer, as `wbs-mcp-agent-surface` M2 requires. */
const AUDIENCE = `${authorizationServer}/org/org-a`;
const issuers = new LocalOidcIssuers();
const ci = await issuers.add('ci.test');
let failNextIssuance = false;
let trustedIssuerId: string | undefined;

/** Read at every signature and verification, so the rotation fixture can replace its key. */
const grantKeys: { current: MachineGrantKey; previous: MachineGrantKey | null } =
  await importMachineGrantKeys({ current: randomBytes(32).toString('base64url'), previous: null });

const dependencyCapability =
  process.env['MCP_TEST_DEPENDENCY_CAPABILITY'] === 'unsupported'
    ? INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY
    : BACKEND_DEPENDENCY_CAPABILITY;

const h = OrganizationHarness.openComposedWith({
  dependencyCapability,
  admitDependencyClient: (claim): DependencyClientRefusal | null => {
    const connection = openConnection(h.databasePath());
    try {
      return admitDependencyClient(connection.db, dependencyCapability, claim);
    } finally {
      connection.close();
    }
  },
  trustedIssuers: { fetch: issuers.fetch, configuredIssuer: null },
  machineGrants: {
    secret,
    keys: grantKeys,
    authorizationServer,
    newId: () => {
      if (failNextIssuance) {
        failNextIssuance = false;
        throw new Error('injected failure inside the machine grant route');
      }
      return crypto.randomUUID();
    },
  },
});
await h.register('dany');
await h.register('vic');
h.organization('org-a');
h.member('org-a', 'dany', 'super_admin');
h.member('org-a', 'vic', 'viewer');
h.bind('dany', 'org-a');
addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
addAgentPerson(h.sqlite, 'vics-agent', 'org-a', h.userId('vic'));

function issuedBy(personId: string): string {
  return h.userId(personId === 'vics-agent' ? 'vic' : 'dany');
}

async function fixture(request: Request, path: string): Promise<Response | undefined> {
  if (request.method === 'POST' && path === '/__fixture/enable-dependencies') {
    seedDependencyAuthority(h.databasePath());
    return Response.json({ state: 'ENABLED' });
  }
  if (request.method === 'POST' && path === '/__fixture/activate') {
    h.activate();
    const registered = await h.call('dany', 'POST', '/api/organization/trusted-issuers', {
      issuer: ci.url,
      audience: AUDIENCE,
    });
    if (registered.status !== 201) return Response.json(registered, { status: 500 });
    trustedIssuerId = (registered.body as { id: string }).id;
    return Response.json({ activated: true });
  }
  if (request.method === 'POST' && path === '/__fixture/api-key') {
    const { personId } = (await request.json()) as { personId: string };
    const { id, key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId,
      issuedBy: issuedBy(personId),
      name: `key ${crypto.randomUUID()}`,
    });
    return Response.json({ id, key });
  }
  if (request.method === 'POST' && path === '/__fixture/revoke') {
    const { id } = (await request.json()) as { id: string };
    revokeMachineCredential(h.sqlite, id, Date.now());
    return Response.json({ revoked: id });
  }
  if (request.method === 'POST' && path === '/__fixture/workload') {
    const { subject } = (await request.json()) as { subject: string };
    if (trustedIssuerId === undefined) return new Response('activate first', { status: 500 });
    const created = await h.call('dany', 'POST', '/api/organization/machine-credentials', {
      source: 'oidc',
      name: `workload ${subject}`,
      personId: 'claire',
      trustedIssuerId,
      subject,
    });
    if (created.status !== 201) return Response.json(created, { status: 500 });
    return Response.json({ id: (created.body as { id: string }).id });
  }
  if (request.method === 'POST' && path === '/__fixture/assertion') {
    const { subject, typ, lifetimeSeconds, jti } = (await request.json()) as {
      subject: string;
      typ?: string;
      lifetimeSeconds?: number;
      jti?: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: subject,
      aud: AUDIENCE,
      iat: now,
      exp: now + (lifetimeSeconds ?? 300),
      jti: jti ?? crypto.randomUUID(),
    };
    return Response.json({
      assertion: typ === undefined ? await ci.sign(claims) : await ci.signTyped(claims, typ),
    });
  }
  if (request.method === 'POST' && path === '/__fixture/rotate-grant-key') {
    const rotated = await importMachineGrantKeys({
      current: randomBytes(32).toString('base64url'),
      previous: null,
    });
    grantKeys.current = rotated.current;
    grantKeys.previous = null;
    return Response.json({ rotated: true });
  }
  if (request.method === 'POST' && path === '/__fixture/fail-next-issuance') {
    failNextIssuance = true;
    return Response.json({ armed: true });
  }
  if (request.method === 'POST' && path === '/__fixture/compute-provider') {
    const provider = await h.call('dany', 'POST', '/api/organization/compute-providers', {
      kind: 'ssh_host',
      name: `host ${crypto.randomUUID()}`,
      locator: 'puni1@h4claw',
    });
    if (provider.status !== 201) return Response.json(provider, { status: 500 });
    const providerId = (provider.body as { id: string }).id;
    const declared = await h.call('dany', 'POST', '/api/directory/commands', {
      commands: [
        {
          kind: 'createResource',
          name: `h4claw ram ${crypto.randomUUID()}`,
          resourceKind: 'divisible',
          unitLabel: 'GB',
        },
      ],
    });
    const resourceId = (declared.body as { results?: { id?: string }[] }).results?.at(0)?.id;
    if (declared.status !== 200 || resourceId === undefined)
      return Response.json(declared, { status: 500 });
    const referenced = await h.call('dany', 'POST', '/api/directory/commands', {
      commands: [{ kind: 'patchResource', resourceId, patch: { providerId } }],
    });
    if (referenced.status !== 200) return Response.json(referenced, { status: 500 });
    return Response.json({ providerId, resourceId });
  }
  if (request.method === 'GET' && path === '/__fixture/capacity-reports')
    return Response.json(
      h.sqlite
        .query(
          'SELECT provider_id AS providerId, resource_id AS resourceId FROM resource_capacity_report',
        )
        .all(),
    );
  if (request.method === 'GET' && path === '/__fixture/audit')
    return Response.json(
      h.sqlite.query('SELECT action, detail FROM organization_audit ORDER BY created_at, id').all(),
    );
  return undefined;
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    const answered = await fixture(request, url.pathname);
    if (answered !== undefined) return answered;
    return await h.request(`${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      ...(request.method === 'GET' || request.method === 'HEAD'
        ? {}
        : { body: await request.arrayBuffer() }),
    });
  },
});
console.log(JSON.stringify({ port: server.port }));

async function stop(): Promise<void> {
  await server.stop(true);
  h.close();
  await issuers.stop();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
