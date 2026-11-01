import { randomBytes } from 'node:crypto';

import { importMachineGrantKeys } from '../runtime/machine-grant';
import { addAgentPerson, issueApiKey } from './machine-credential-fixture';
import { OrganizationHarness } from './organization-harness';

/**
 * be-01 for mcp-01's M10 load run (`apps/wbs/mcp-01/src/load/m10-load.ts`,
 * `wbs-mcp-agent-surface` task 4.3), run as its own process: the composed
 * organization harness (production `buildServices` and `buildApp` over a fresh
 * migrated SQLite file in the system temp directory, removed on exit) with
 * machine grants. `MCP_LOAD_BE_SECRET` and `MCP_LOAD_AUTHORIZATION_SERVER` are
 * the run's own generated values; the grant key is generated here. Never point
 * it at a deployment's store: it opens only its own temp file.
 *
 * Two activated organizations, each with one super admin, a project, and
 * `MCP_LOAD_AGENTS` (org-a) or `MCP_LOAD_OTHER_AGENTS` (org-b) agent persons
 * bound to that admin, each with one API key and one leaf of its own. Agents
 * are written straight into SQLite as the tests do, so the agent-person cap is
 * not judged here.
 *
 * Prints `{"port":N}` once serving, then be-01's log lines. Load routes:
 * - `GET /__load/agents` answers every agent: `{ personId, organizationId,
 *   clientId, key, projectId, leafId }`;
 * - `POST /__load/delay` `{ ms }` holds every later `/api` request `ms` before
 *   be-01 handles it (0 stops), so a fence that needs slow calls can be
 *   reached without changing mcp-01.
 */
const secret = process.env['MCP_LOAD_BE_SECRET'];
const authorizationServer = process.env['MCP_LOAD_AUTHORIZATION_SERVER'];
if (secret === undefined || authorizationServer === undefined)
  throw new Error('MCP_LOAD_BE_SECRET and MCP_LOAD_AUTHORIZATION_SERVER are required');
const agentCount = Number(process.env['MCP_LOAD_AGENTS'] ?? '');
const otherAgentCount = Number(process.env['MCP_LOAD_OTHER_AGENTS'] ?? '');
if (!Number.isSafeInteger(agentCount) || agentCount < 1)
  throw new Error('MCP_LOAD_AGENTS must be a positive whole number');
if (!Number.isSafeInteger(otherAgentCount) || otherAgentCount < 1)
  throw new Error('MCP_LOAD_OTHER_AGENTS must be a positive whole number');

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
h.activate();

interface LoadAgent {
  readonly personId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly key: string;
  readonly projectId: string;
  readonly leafId: string;
}

/** One organization with its admin, project and `count` agents, each holding a key and a leaf. */
async function seedOrganization(
  organizationId: string,
  admin: string,
  count: number,
): Promise<LoadAgent[]> {
  await h.register(admin);
  h.organization(organizationId);
  h.member(organizationId, admin, 'super_admin');
  h.bind(admin, organizationId);
  const created = await h.call(admin, 'POST', '/api/projects', { name: `${organizationId} swarm` });
  if (created.status !== 201 && created.status !== 200)
    throw new Error(`creating ${organizationId}'s project: ${JSON.stringify(created)}`);
  const projectId = (created.body as { project: { id: string } }).project.id;
  const leaves = await h.call(admin, 'POST', `/api/projects/${projectId}/commands`, {
    commands: Array.from({ length: count }, (_, index) => ({
      kind: 'createWorkItem',
      parentId: null,
      afterId: null,
      name: `leaf ${String(index + 1)}`,
    })),
  });
  const leafIds = ((leaves.body as { results?: { id?: unknown }[] }).results ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');
  if (leaves.status !== 200 || leafIds.length !== count)
    throw new Error(`creating ${organizationId}'s leaves: ${JSON.stringify(leaves)}`);
  const agents: LoadAgent[] = [];
  for (const [index, leafId] of leafIds.entries()) {
    const personId = `${organizationId}-agent-${String(index + 1)}`;
    addAgentPerson(h.sqlite, personId, organizationId, h.userId(admin));
    const { id, key } = await issueApiKey(h.sqlite, {
      organizationId,
      personId,
      issuedBy: h.userId(admin),
    });
    agents.push({ personId, organizationId, clientId: id, key, projectId, leafId });
  }
  return agents;
}

const agents = [
  ...(await seedOrganization('org-a', 'dany', agentCount)),
  ...(await seedOrganization('org-b', 'eve', otherAgentCount)),
];
let delayMs = 0;

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/__load/agents') return Response.json(agents);
    if (request.method === 'POST' && url.pathname === '/__load/delay') {
      const { ms } = (await request.json()) as { ms: number };
      if (!Number.isSafeInteger(ms) || ms < 0) return new Response('ms', { status: 400 });
      delayMs = ms;
      return Response.json({ delayMs });
    }
    if (delayMs > 0 && url.pathname.startsWith('/api/')) await Bun.sleep(delayMs);
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
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
