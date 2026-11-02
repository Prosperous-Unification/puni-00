import { randomBytes } from 'node:crypto';

import { importMachineGrantKeys } from '../runtime/machine-grant';
import { OrganizationHarness } from './organization-harness';

/**
 * be-01 for the agent-pool swarm rehearsal
 * (`apps/wbs/mcp-01/src/load/pool-swarm-rehearsal.ts`, `wbs-mcp-agent-surface`
 * task 8.1 before dev), run as its own process: the composed organization
 * harness (production `buildServices` and `buildApp` over a fresh migrated
 * SQLite file in the system temp directory, removed on exit) with machine
 * grants, and the claim lease sweep started as boot starts it.
 * `POOL_SWARM_BE_SECRET` and `POOL_SWARM_AUTHORIZATION_SERVER` are the run's
 * own generated values; the grant key is generated here. Never point it at a
 * deployment's store: it opens only its own temp file.
 *
 * Activated organization `org-pool` with one super admin, dany, whose browser
 * session the fixture route below speaks for. Pools, agents and keys are made
 * only through be-01's own routes. Prints `{"port":N}` once serving, then
 * be-01's log lines. Fixture routes:
 * - `POST /__fixture/admin` `{ method, path, body? }`: one request as dany's
 *   browser session, answered `{ status, body }`;
 * - `GET /__fixture/audit`: the organization audit rows, oldest first, as
 *   `{ action, subjectId, detail }` (no route reads them);
 * - `POST /__fixture/sweep-settled`: waits until no sweep tick runs.
 */
const secret = process.env['POOL_SWARM_BE_SECRET'];
const authorizationServer = process.env['POOL_SWARM_AUTHORIZATION_SERVER'];
if (secret === undefined || authorizationServer === undefined)
  throw new Error('POOL_SWARM_BE_SECRET and POOL_SWARM_AUTHORIZATION_SERVER are required');

const ORGANIZATION = 'org-pool';
const ADMIN = 'dany';

const h = OrganizationHarness.openComposedWith({
  machineGrants: {
    secret,
    keys: await importMachineGrantKeys({
      current: randomBytes(32).toString('base64url'),
      previous: null,
    }),
    authorizationServer,
  },
});
await h.register(ADMIN);
h.organization(ORGANIZATION);
h.member(ORGANIZATION, ADMIN, 'super_admin');
h.bind(ADMIN, ORGANIZATION);
h.activate();
const sweep = h.claimLeaseSweep();
sweep.start();

async function fixture(request: Request, path: string): Promise<Response | undefined> {
  if (request.method === 'POST' && path === '/__fixture/admin') {
    const {
      method,
      path: target,
      body,
    } = (await request.json()) as {
      method: string;
      path: string;
      body?: unknown;
    };
    return Response.json(await h.call(ADMIN, method, target, body));
  }
  if (request.method === 'GET' && path === '/__fixture/audit')
    return Response.json(
      h.sqlite
        .query(
          'SELECT action, subject_id AS subjectId, detail FROM organization_audit ORDER BY created_at, rowid',
        )
        .all(),
    );
  if (request.method === 'POST' && path === '/__fixture/sweep-settled') {
    await sweep.settled();
    return Response.json({ settled: true });
  }
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
  await sweep.stop();
  h.close();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
