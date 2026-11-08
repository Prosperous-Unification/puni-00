import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';

import {
  type McpAgentSession,
  type McpAgentStack,
  startMcpAgentStack,
  type ToolAnswer,
} from './testing/mcp-agent-stack';
import { OrganizationHarness } from './testing/organization-harness';

/**
 * A swarm end to end over be-01's production composition and real SQLite, through public
 * routes only: an organization capped by its operator (`wbs-organization-limits`), agent
 * persons each holding an API key (`wbs-machine-credentials`), resources with project
 * capacities and a compute provider's report beside them (`wbs-resources`, `compute-providers`),
 * and four agents claiming at once with `assign: true` (`wbs-team-claims`, `assignee-management`).
 * Store access is limited to setup no route offers: the organization row, its admin and its
 * activation marker. The tests share one store and run in order.
 *
 * The agents take the MCP path (`wbs-mcp-agent-surface` task 7.0): each exchanges its key for
 * an access token at a real mcp-01's token endpoint and makes tool calls on `/mcp`
 * (`startMcpAgentStack`); no agent request reaches `/api` with its key. Dany, the human
 * admin, stays on `/api` with a browser-equivalent session.
 */
setDefaultTimeout(60_000);

const ORGANIZATION = 'org-swarm';
const AGENTS = ['agent-1', 'agent-2', 'agent-3', 'agent-4'] as const;
type Agent = (typeof AGENTS)[number];
const CAPS = { agents: 4, claims: 3, units: 64 } as const;
const RAM = 32;
const SLOTS = 3;
const DISK = 60;

/**
 * The plan's leaves: their batch, RAM demand in GiB and the agent that claims each in the swarm.
 * The swarm's 12, 12, 10 and 8 GiB race for 32 GiB and three slots: in every admission order
 * exactly three are admitted, the 8 with 12 + 12 or with 12 + 10, and the fourth is short of RAM
 * or of a slot. 12 + 12 + 10, three the claim cap alone would admit, never fit.
 */
const LEAVES = [
  { key: 'A1', batch: 'A', ram: 12, swarm: 'agent-1' },
  { key: 'A2', batch: 'A', ram: 12, swarm: 'agent-2' },
  { key: 'A3', batch: 'A', ram: 10, swarm: 'agent-3' },
  { key: 'B1', batch: 'B', ram: 8, swarm: 'agent-4' },
  { key: 'B2', batch: 'B', ram: 12, swarm: null },
  { key: 'B3', batch: 'B', ram: 8, swarm: null },
] as const satisfies readonly { key: string; batch: 'A' | 'B'; ram: number; swarm: Agent | null }[];
type LeafKey = (typeof LEAVES)[number]['key'];

let stack: McpAgentStack;
let h: OrganizationHarness;

const ids = {
  project: '',
  opsProject: '',
  opsLeaf: '',
  team: '',
  provider: '',
  steps: { dev: '', qa: '' },
  resources: { ram: '', disk: '', slots: '' },
  batches: { A: '', B: '' },
  leaves: new Map<LeafKey, string>(),
  persons: new Map<string, string>(),
  credentials: new Map<Agent, { id: string; key: string; session: McpAgentSession }>(),
};

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

/**
 * Every answer the test read, tool answers and token answers included, but the credential
 * create answers, for the key leak check.
 */
const answered: { readonly text: string }[] = [];
/** Every key minted, the revoked spare's included. */
const keys: string[] = [];

beforeAll(async () => {
  stack = await startMcpAgentStack((machineGrants) =>
    OrganizationHarness.openComposedWith({ machineGrants }),
  );
  h = stack.h;
  await h.register('dany');
  h.organization(ORGANIZATION);
  h.member(ORGANIZATION, 'dany', 'super_admin');
  h.bind('dany', ORGANIZATION);
  h.activate();
});

afterAll(async () => {
  for (const { session } of ids.credentials.values()) await session.close();
  await stack.stop();
  h.close();
});

async function send(
  bearer: string,
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Reply> {
  const response = await h.request(path, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: 'http://localhost' }),
      authorization: `Bearer ${bearer}`,
      ...extra,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    // Every be-01 answer read here is JSON or empty; anything else is kept as text to fail on.
    body: text.startsWith('{') ? (JSON.parse(text) as unknown) : text,
    text,
  };
}

/** Dany's browser-equivalent session in the organization. */
async function asAdmin(method: string, path: string, body?: unknown): Promise<Reply> {
  const reply = await send(h.token('dany'), method, path, body, {
    'X-WBS-Expected-Organization': ORGANIZATION,
  });
  answered.push(reply);
  return reply;
}

/** One agent's tool call on its own MCP session. */
async function asAgent(agent: Agent, tool: string, input: Record<string, unknown> = {}) {
  const reply = await credentialOf(agent).session.call(tool, input);
  answered.push(reply);
  return reply;
}

/** A machine token for `key` at mcp-01's token endpoint, recorded for the leak check. */
async function tokenFor(key: string) {
  const reply = await stack.token(key);
  answered.push({ text: JSON.stringify(reply.body) });
  return reply;
}

/** An MCP session of the agent holding `key`, on a fresh access token. */
async function sessionOf(key: string): Promise<McpAgentSession> {
  const reply = await tokenFor(key);
  const token = (reply.body as { access_token?: unknown }).access_token;
  if (reply.status !== 200 || typeof token !== 'string')
    throw new Error(`no token: ${JSON.stringify(reply)}\n${stack.log()}`);
  return stack.connect(token);
}

/** Whether be-01 answered the tool call with a success. */
function isOk(reply: ToolAnswer): boolean {
  return reply.via === 'be-01' && reply.ok;
}

/** be-01's body of a tool call it answered. @throws when mcp-01 or `/mcp` answered instead. */
function bodyOf(reply: ToolAnswer): unknown {
  if (reply.via !== 'be-01') throw new Error(`be-01 did not answer: ${reply.text}`);
  return reply.body;
}

/** A stand-in for a missing reply, read as a failure. */
const FAILED: ToolAnswer = { via: 'http', status: 0, text: 'no reply' };

function credentialOf(agent: Agent) {
  const found = ids.credentials.get(agent);
  if (found === undefined) throw new Error(`${agent} holds no credential`);
  return found;
}

function personOf(name: string): string {
  const found = ids.persons.get(name);
  if (found === undefined) throw new Error(`no person ${name}`);
  return found;
}

function leafOf(key: LeafKey): string {
  const found = ids.leaves.get(key);
  if (found === undefined) throw new Error(`no leaf ${key}`);
  return found;
}

function keyOf(workItemId: string): LeafKey {
  for (const [key, id] of ids.leaves) if (id === workItemId) return key;
  throw new Error(`no leaf has id ${workItemId}`);
}

function agentOf(personId: string): Agent {
  const found = AGENTS.find((agent) => ids.persons.get(agent) === personId);
  if (found === undefined) throw new Error(`no agent is person ${personId}`);
  return found;
}

function minted(reply: Reply): string[] {
  if (reply.status !== 200) throw new Error(`refused: ${reply.text}`);
  return (reply.body as { results: { id?: string }[] }).results.map((each, index) => {
    if (each.id === undefined) throw new Error(`command ${String(index)} minted no id`);
    return each.id;
  });
}

function adminCommands(projectId: string, list: unknown[]) {
  return asAdmin('POST', `/api/projects/${projectId}/commands`, { commands: list });
}

function agentCommands(agent: Agent, list: unknown[], projectId = ids.project) {
  return asAgent(agent, 'postApiProjectsByIdCommands', { id: projectId, commands: list });
}

const claim = (agent: Agent, key: LeafKey) => ({
  kind: 'claimWorkItem',
  workItemId: leafOf(key),
  personId: personOf(agent),
  runId: `run:${agent}:${key}`,
  assign: true,
});

interface ClaimAnswer {
  claimIds: string[];
  acquired: { resourceId: string; units: number }[];
  assignedStepIds: string[];
}

function claimAnswerOf(reply: ToolAnswer): ClaimAnswer {
  const first = (bodyOf(reply) as { results: ClaimAnswer[] }).results.at(0);
  if (first === undefined) throw new Error(`no claim answer: ${reply.text}`);
  return first;
}

interface Startable {
  leaves: { workItemId: string; stepIds: string[] }[];
  doesNotFit?: {
    workItemId: string;
    exhausted: { resourceId: string; asked: number; free: number; shortfall: number };
  }[];
  claimed: {
    workItemId: string;
    stepId: string;
    claimId: string;
    holder: { personId: string };
    assignee: { personId: string } | null;
    runId: string | null;
  }[];
  resources?: { resourceId: string; capacity: number; occupied: number; free: number }[];
  occupancyScope: string;
}

async function startable(): Promise<Startable> {
  const reply = await asAdmin('GET', `/api/projects/${ids.project}/startable`);
  if (reply.status !== 200) throw new Error(`startable refused: ${reply.text}`);
  return reply.body as Startable;
}

/** Each stated resource's capacity, occupied and free units, as the startable read answers. */
async function freeUnits(): Promise<Record<string, { capacity: number; occupied: number }>> {
  const read = await startable();
  return Object.fromEntries(
    (read.resources ?? []).map((each) => {
      expect(each.free).toBe(each.capacity - each.occupied);
      return [each.resourceId, { capacity: each.capacity, occupied: each.occupied }];
    }),
  );
}

/** The RAM units claims hold in the project, as the startable read answers them. */
async function ramOccupied(): Promise<number> {
  const found = Object.entries(await freeUnits()).find(([id]) => id === ids.resources.ram);
  if (found === undefined) throw new Error('the startable read states no RAM capacity');
  return found[1].occupied;
}

/** The step holders of the project by leaf key, as the startable read lists them. */
async function holders(): Promise<Map<LeafKey, Agent>> {
  const held = new Map<LeafKey, Agent>();
  for (const step of (await startable()).claimed)
    held.set(keyOf(step.workItemId), agentOf(step.holder.personId));
  return held;
}

async function assigneesOf(key: LeafKey): Promise<Record<string, string>> {
  const reply = await asAdmin('GET', `/api/projects/${ids.project}/work-items/${leafOf(key)}`);
  if (reply.status !== 200) throw new Error(`work item read refused: ${reply.text}`);
  return (reply.body as { workItem: { assignees: Record<string, string> } }).workItem.assignees;
}

async function limits() {
  const reply = await asAdmin('GET', '/api/organization/limits');
  expect(reply.status).toBe(200);
  return reply.body as {
    source: string;
    limits: {
      maxAgentPersons: number;
      maxConcurrentClaims: number;
      maxCapacityUnitsPerResource: number;
    };
    usage: {
      agentPersons: number;
      concurrentClaims: number;
      capacityUnits: { resourceId: string; units: number }[];
    };
  };
}

/** The operator's `organization-limits-cli.ts`, run against the harness's store. */
function setLimits(): { exitCode: number; stdout: string; stderr: string } {
  const run = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      join(import.meta.dir, 'organization-limits-cli.ts'),
      'set',
      '--organization',
      ORGANIZATION,
      `--max-agent-persons=${String(CAPS.agents)}`,
      `--max-concurrent-claims=${String(CAPS.claims)}`,
      `--max-capacity-units-per-resource=${String(CAPS.units)}`,
      '--apply',
    ],
    {
      env: {
        PATH: process.env['PATH'] ?? '',
        DB_PATH: h.databasePath(),
        ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
        ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
        ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return { exitCode: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() };
}

/**
 * Fires every agent's batch at once (`Promise.all`), each on its own MCP session; the write
 * coordinator alone orders them. They are not lined up behind a held write turn first, as the
 * two-fleet rehearsal does: each crosses mcp-01's process, so the order they reach be-01 in is
 * not the test's to choose.
 */
function swarm(batches: { agent: Agent; list: unknown[] }[]): Promise<ToolAnswer[]> {
  return Promise.all(batches.map((each) => agentCommands(each.agent, each.list)));
}

/** The swarm's outcome, kept for the later steps. */
const outcome = {
  winners: [] as { agent: Agent; key: LeafKey }[],
  loser: { agent: '', key: '' },
  revoked: {} as { agent?: Agent; key?: LeafKey },
  /** The winner that finished and released in step 8. */
  released: undefined as Agent | undefined,
};

function ramOf(key: string): number {
  const found = LEAVES.find((leaf) => leaf.key === key);
  if (found === undefined) throw new Error(`no leaf ${key}`);
  return found.ram;
}

function loser(): { agent: Agent; key: LeafKey } {
  const found = LEAVES.find((leaf) => leaf.key === outcome.loser.key);
  if (found?.swarm == null) throw new Error('the swarm had no loser');
  return { agent: found.swarm, key: found.key };
}

describe('a swarm of four agents on a capped organization, end to end', () => {
  it('1-3. caps the organization, makes four agents, refuses a fifth and keys each agent', async () => {
    // `organization-limits`: the operator sets the caps by CLI; no route changes them.
    const set = setLimits();
    expect({ exitCode: set.exitCode, stderr: set.stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(JSON.parse(set.stdout)).toMatchObject({
      mode: 'applied',
      after: {
        source: 'organization',
        limits: {
          maxAgentPersons: CAPS.agents,
          maxConcurrentClaims: CAPS.claims,
          maxCapacityUnitsPerResource: CAPS.units,
        },
      },
    });
    expect(await limits()).toEqual({
      source: 'organization',
      limits: {
        maxAgentPersons: CAPS.agents,
        maxConcurrentClaims: CAPS.claims,
        maxCapacityUnitsPerResource: CAPS.units,
      },
      usage: { agentPersons: 0, concurrentClaims: 0, capacityUnits: [] },
    });

    // `createPerson` carries no kind (`organization-limits`: "createPerson carries no kind"), so
    // an agent person is a person made and then turned into an agent bound to Dany's account.
    const names = [...AGENTS, 'agent-5'];
    const made = minted(
      await asAdmin('POST', '/api/directory/commands', {
        commands: [
          { kind: 'createTeam', ref: 'swarm', name: 'Swarm' },
          ...names.map((name) => ({ kind: 'createPerson', name, teamRefs: ['swarm'] })),
        ],
      }),
    );
    ids.team = made[0] ?? '';
    for (const [index, name] of names.entries()) ids.persons.set(name, made[index + 1] ?? '');
    const promote = (name: string) => ({
      kind: 'patchPerson',
      personId: personOf(name),
      patch: { kind: 'agent', accountId: h.userId('dany') },
    });
    expect(
      (
        await asAdmin('POST', '/api/directory/commands', {
          commands: AGENTS.map(promote),
        })
      ).status,
    ).toBe(200);
    // `organization-limits`: "Making one more agent person than the cap allows is refused".
    expect(
      await asAdmin('POST', '/api/directory/commands', { commands: [promote('agent-5')] }),
    ).toMatchObject({
      status: 409,
      body: {
        error: 'agent_person_limit',
        at: 0,
        kind: 'patchPerson',
        cap: CAPS.agents,
        current: CAPS.agents,
        added: 1,
      },
    });
    expect((await limits()).usage.agentPersons).toBe(CAPS.agents);

    // `machine-credentials`: one API key per agent, shown once, exchanged at mcp-01's token
    // endpoint for the access token its MCP session carries.
    for (const agent of AGENTS) {
      const created = await send(
        h.token('dany'),
        'POST',
        '/api/organization/machine-credentials',
        { source: 'api_key', name: agent, personId: personOf(agent) },
        { 'X-WBS-Expected-Organization': ORGANIZATION },
      );
      expect(created).toMatchObject({
        status: 201,
        body: { source: 'api_key', name: agent, personId: personOf(agent) },
      });
      const { id, key } = created.body as { id: string; key: string };
      expect(key.startsWith(`wbs_mk_${id}.`)).toBe(true);
      keys.push(key);
      ids.credentials.set(agent, { id, key, session: await sessionOf(key) });
      expect(isOk(await asAgent(agent, 'getApiProjects'))).toBe(true);
    }
    // A spare key of agent-1, revoked at once: its very next request is refused.
    const spare = await send(
      h.token('dany'),
      'POST',
      '/api/organization/machine-credentials',
      { source: 'api_key', name: 'agent-1 spare', personId: personOf('agent-1') },
      { 'X-WBS-Expected-Organization': ORGANIZATION },
    );
    expect(spare.status).toBe(201);
    const spareKey = (spare.body as { id: string; key: string }).key;
    keys.push(spareKey);
    const spareSession = await sessionOf(spareKey);
    const spareCall = async () => {
      const reply = await spareSession.call('getApiProjects', {});
      answered.push(reply);
      return reply;
    };
    expect(isOk(await spareCall())).toBe(true);
    expect(
      await asAdmin(
        'DELETE',
        `/api/organization/machine-credentials/${(spare.body as { id: string }).id}`,
      ),
    ).toMatchObject({ status: 204 });
    // M3/M5: be-01 rereads the credential on every call, so the token's very next call is
    // refused in band; mcp-01 then refuses the token itself, and no new one is issued.
    expect(await spareCall()).toMatchObject({ via: 'mcp-01', code: 'machine_credential_refused' });
    expect(await spareCall()).toMatchObject({ via: 'http', status: 401 });
    expect(await tokenFor(spareKey)).toMatchObject({
      status: 401,
      body: { error: 'invalid_client' },
    });
    await spareSession.close();
    const listed = await asAdmin('GET', '/api/organization/machine-credentials');
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { credentials: { personId: string }[] }).credentials
        .map((each) => agentOf(each.personId))
        .toSorted(),
    ).toEqual([...AGENTS]);
  });

  it('4-6. declares resources and capacities, reports measured capacity and builds the plan', async () => {
    const declared = minted(
      await asAdmin('POST', '/api/directory/commands', {
        commands: [
          {
            kind: 'createResource',
            name: 'h4claw RAM',
            resourceKind: 'divisible',
            unitLabel: 'GiB',
          },
          {
            kind: 'createResource',
            name: 'h4claw disk',
            resourceKind: 'divisible',
            unitLabel: 'GiB',
          },
          {
            kind: 'createResource',
            name: 'agent slots',
            resourceKind: 'divisible',
            unitLabel: 'slots',
          },
        ],
      }),
    );
    ids.resources = { ram: declared[0] ?? '', disk: declared[1] ?? '', slots: declared[2] ?? '' };
    const project = await asAdmin('POST', '/api/projects', { name: 'Swarm' });
    expect(project.status).toBe(200);
    ids.project = (project.body as { project: { id: string } }).project.id;
    const steps = (project.body as { steps: { id: string; name: string }[] }).steps;
    ids.steps = {
      dev: steps.find((each) => each.name === 'Dev')?.id ?? '',
      qa: steps.find((each) => each.name === 'QA')?.id ?? '',
    };
    expect(Object.values(ids.steps).every((id) => id !== '')).toBe(true);
    const ops = await asAdmin('POST', '/api/projects', { name: 'Ops' });
    expect(ops.status).toBe(200);
    ids.opsProject = (ops.body as { project: { id: string } }).project.id;

    // `organization-limits`: capacities within the per-resource cap of 64 are applied.
    const capacities = await adminCommands(ids.project, [
      { kind: 'setResourceCapacity', resourceId: ids.resources.ram, units: RAM },
      { kind: 'setResourceCapacity', resourceId: ids.resources.slots, units: SLOTS },
      { kind: 'setResourceCapacity', resourceId: ids.resources.disk, units: DISK },
    ]);
    expect(capacities.status).toBe(200);
    // "Stating more capacity units of a resource than the cap allows is refused": 32 + 40 > 64.
    expect(
      await adminCommands(ids.opsProject, [
        { kind: 'setResourceCapacity', resourceId: ids.resources.ram, units: 40 },
      ]),
    ).toMatchObject({
      status: 409,
      body: {
        error: 'capacity_limit',
        resourceId: ids.resources.ram,
        cap: CAPS.units,
        declared: RAM,
        asked: 40,
      },
    });
    expect(
      (await limits()).usage.capacityUnits.map(({ resourceId, units }) => ({ resourceId, units })),
    ).toEqual(
      [
        { resourceId: ids.resources.ram, units: RAM },
        { resourceId: ids.resources.disk, units: DISK },
        { resourceId: ids.resources.slots, units: SLOTS },
      ].toSorted((a, b) => a.resourceId.localeCompare(b.resourceId)),
    );

    // The plan: two batches of three leaves, every step estimated, a RAM, disk and slot demand on
    // each leaf, no deadline; and one demand-free leaf in the Ops project.
    const tree = minted(
      await adminCommands(ids.project, [
        { kind: 'createWorkItem', ref: 'A', parentId: null, name: 'Batch A' },
        { kind: 'createWorkItem', ref: 'B', parentId: null, name: 'Batch B' },
        ...LEAVES.map((leaf) => ({
          kind: 'createWorkItem',
          ref: leaf.key,
          parentRef: leaf.batch,
          name: `Leaf ${leaf.key}`,
        })),
      ]),
    );
    ids.batches = { A: tree[0] ?? '', B: tree[1] ?? '' };
    for (const [index, leaf] of LEAVES.entries()) ids.leaves.set(leaf.key, tree[index + 2] ?? '');
    const planned = await adminCommands(ids.project, [
      ...LEAVES.flatMap((leaf) => [
        ...Object.values(ids.steps).map((stepId) => ({
          kind: 'setEstimate',
          workItemId: leafOf(leaf.key),
          stepId,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        })),
        {
          kind: 'setDemand',
          workItemId: leafOf(leaf.key),
          resourceId: ids.resources.ram,
          units: leaf.ram,
        },
        {
          kind: 'setDemand',
          workItemId: leafOf(leaf.key),
          resourceId: ids.resources.disk,
          units: 10,
        },
        {
          kind: 'setDemand',
          workItemId: leafOf(leaf.key),
          resourceId: ids.resources.slots,
          units: 1,
        },
      ]),
    ]);
    expect(planned.status).toBe(200);
    ids.opsLeaf =
      minted(
        await adminCommands(ids.opsProject, [
          { kind: 'createWorkItem', ref: 'ops', parentId: null, name: 'Rotate logs' },
        ]),
      )[0] ?? '';
    const opsSteps = (
      (await asAdmin('GET', `/api/projects/${ids.opsProject}`)).body as { steps: { id: string }[] }
    ).steps;
    expect(
      (
        await adminCommands(
          ids.opsProject,
          opsSteps.map((step) => ({
            kind: 'setEstimate',
            workItemId: ids.opsLeaf,
            stepId: step.id,
            days: { optimistic: 1, realistic: 1, pessimistic: 1 },
          })),
        )
      ).status,
    ).toBe(200);

    // `compute-providers`: an admin registers h4claw, the RAM resource names it, and an agent
    // reports what it measured through the MCP tool; the report sits beside the declared 32 and
    // plans nothing.
    const registered = await asAdmin('POST', '/api/organization/compute-providers', {
      kind: 'ssh_host',
      name: 'h4claw',
      locator: 'puni1@h4claw',
    });
    expect(registered.status).toBe(201);
    ids.provider = (registered.body as { id: string }).id;
    expect(
      (
        await asAdmin('POST', '/api/directory/commands', {
          commands: [
            {
              kind: 'patchResource',
              resourceId: ids.resources.ram,
              patch: { providerId: ids.provider },
            },
          ],
        })
      ).status,
    ).toBe(200);
    const planning = async () => ({
      startable: await startable(),
      leaves: await Promise.all(
        LEAVES.map(async (leaf) => {
          const read = await asAdmin(
            'GET',
            `/api/projects/${ids.project}/work-items/${leafOf(leaf.key)}`,
          );
          return (read.body as { workItem: { schedule: unknown } }).workItem.schedule;
        }),
      ),
    });
    const before = await planning();
    const observedAt = Date.now() - 1000;
    const reported = await asAgent(
      'agent-1',
      'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
      {
        providerId: ids.provider,
        resourceId: ids.resources.ram,
        observedAt,
        cadenceSeconds: 300,
        outcome: { kind: 'measured', capacityUnits: 30, usageUnits: 12 },
      },
    );
    expect(reported).toMatchObject({
      via: 'be-01',
      ok: true,
      body: { reportedBy: personOf('agent-1') },
    });
    const resources = await asAdmin('GET', `/api/projects/${ids.project}/resources`);
    expect(resources.status).toBe(200);
    const ram = (
      resources.body as {
        resources: { id: string; providerId: string | null; measurement?: unknown }[];
      }
    ).resources.find((each) => each.id === ids.resources.ram);
    expect(ram).toMatchObject({
      providerId: ids.provider,
      measurement: { declared: RAM, measured: 30, measuredAt: observedAt, state: 'measured' },
    });
    // "never a planning input": the startable read and every leaf's schedule are unchanged.
    const after = await planning();
    expect(after).toEqual(before);
    expect(
      after.startable.resources?.find((each) => each.resourceId === ids.resources.ram),
    ).toMatchObject({
      capacity: RAM,
      occupied: 0,
    });
    // The comparison sees a capacity change: adopting the measurement is the explicit
    // `setResourceCapacity` the spec names, and it moves both the schedules and the startable
    // read; restating 32 moves them back.
    const adopt = (units: number) =>
      adminCommands(ids.project, [
        { kind: 'setResourceCapacity', resourceId: ids.resources.ram, units },
      ]);
    expect((await adopt(30)).status).toBe(200);
    const adopted = await planning();
    expect(adopted.leaves).not.toEqual(before.leaves);
    expect(adopted.startable).not.toEqual(before.startable);
    expect((await adopt(RAM)).status).toBe(200);
    expect(await planning()).toEqual(before);
  });

  it('7. four agents claim at once with assign: never over capacity, typed refusals, assignees set', async () => {
    const contenders = LEAVES.flatMap((leaf) =>
      leaf.swarm === null ? [] : [{ agent: leaf.swarm, key: leaf.key }],
    );
    const replies = await swarm(
      contenders.map(({ agent, key }) => ({ agent, list: [claim(agent, key)] })),
    );
    const won = contenders.filter((_, index) => isOk(replies[index] ?? FAILED));
    const lost = contenders.filter((_, index) => !isOk(replies[index] ?? FAILED));
    expect(won).toHaveLength(SLOTS);
    expect(lost).toHaveLength(1);
    outcome.winners = won;
    outcome.loser = lost[0] ?? { agent: '', key: '' };

    // `resource-occupancy`: every winner acquired its whole demand vector, and together they
    // never exceed a stated capacity.
    const acquired = replies.filter(isOk).flatMap((reply) => claimAnswerOf(reply).acquired);
    const unitsOf = (resourceId: string) =>
      acquired
        .filter((each) => each.resourceId === resourceId)
        .reduce((sum, each) => sum + each.units, 0);
    const heldRam = won.reduce((sum, each) => sum + ramOf(each.key), 0);
    // Proof: 2026-10-23, with `refuseOccupancy`'s answer ignored in `decideClaim`, only the
    // claim cap stopped the swarm: 12 + 12 + 10 were admitted and this read 34 GiB of 32.
    // Watched again through mcp-01's tools on 2026-10-29: the same 34.
    expect(unitsOf(ids.resources.ram)).toBe(heldRam);
    expect(unitsOf(ids.resources.ram)).toBeLessThanOrEqual(RAM);
    expect(unitsOf(ids.resources.slots)).toBe(SLOTS);
    expect(await freeUnits()).toEqual({
      [ids.resources.ram]: { capacity: RAM, occupied: heldRam },
      [ids.resources.slots]: { capacity: SLOTS, occupied: SLOTS },
      [ids.resources.disk]: { capacity: DISK, occupied: 10 * SLOTS },
    });

    // The loser is refused `resources_exhausted` naming a resource it is short of.
    const refused = replies.find((reply) => !isOk(reply));
    expect(refused).toMatchObject({
      via: 'be-01',
      status: 409,
      body: { error: 'resources_exhausted', at: 0, kind: 'claimWorkItem' },
    });
    const refusal = bodyOf(refused ?? FAILED) as {
      resourceId: string;
      asked: number;
      free: number;
      holders: { personId: string; workItemId: string; runId: string }[];
    };
    expect([ids.resources.ram, ids.resources.slots]).toContain(refusal.resourceId);
    expect(refusal.free).toBeLessThan(refusal.asked);
    // The holders are those standing when it was decided: winners admitted before it.
    const winning = new Set(won.map((each) => `${each.agent}/${each.key}`));
    expect(refusal.holders.length).toBeGreaterThan(0);
    for (const holder of refusal.holders)
      expect(winning).toContain(`${agentOf(holder.personId)}/${keyOf(holder.workItemId)}`);

    // `assignee-management` "A claim may also assign": each winner holds and is assigned both
    // steps; the loser's leaf is assigned to nobody.
    // Proof: 2026-10-23, with `decideClaim`'s `assignStepIds` replaced by `[]`, assignedStepIds
    // read [] here and step 8's work item read answered the done leaf's assignees as {}.
    const bothSteps = [ids.steps.dev, ids.steps.qa].toSorted();
    for (const [index, reply] of replies.entries()) {
      const contender = contenders.at(index);
      if (contender === undefined || !isOk(reply)) continue;
      const person = personOf(contender.agent);
      expect(claimAnswerOf(reply).assignedStepIds.toSorted()).toEqual(bothSteps);
      expect(await assigneesOf(contender.key)).toEqual({
        [ids.steps.dev]: person,
        [ids.steps.qa]: person,
      });
      const work = await asAgent(contender.agent, 'getApiProjectsByIdPeopleByPersonIdWork', {
        id: ids.project,
        personId: person,
      });
      expect(isOk(work)).toBe(true);
      const read = bodyOf(work) as {
        assignments: { workItemId: string; stepId: string }[];
        claims: { workItemId: string; stepId: string; runId: string }[];
      };
      expect(
        read.assignments.map((each) => `${keyOf(each.workItemId)}/${each.stepId}`).toSorted(),
      ).toEqual(bothSteps.map((stepId) => `${contender.key}/${stepId}`));
      expect(
        read.claims
          .map((each) => `${keyOf(each.workItemId)}/${each.stepId}/${each.runId}`)
          .toSorted(),
      ).toEqual(
        bothSteps.map(
          (stepId) => `${contender.key}/${stepId}/run:${contender.agent}:${contender.key}`,
        ),
      );
    }
    expect(await assigneesOf(loser().key)).toEqual({});
    expect([...(await holders())].map(([key, agent]) => `${key}/${agent}`).toSorted()).toEqual(
      won.map((each) => `${each.key}/${each.agent}`).toSorted(),
    );

    // `wbs-team-claims` / `machine-credentials`: a winner's key claiming as the loser is refused
    // by its pin before anything else.
    const winner = won.at(0);
    if (winner === undefined) throw new Error('nobody won');
    expect(await agentCommands(winner.agent, [claim(loser().agent, 'B2')])).toMatchObject({
      via: 'be-01',
      status: 403,
      body: { error: 'credential_not_for_person', at: 0, kind: 'claimWorkItem' },
    });
    // `organization-limits`: three bound claims are held org-wide, so the loser's claim of a
    // demand-free leaf in another project is refused last, by the claim cap.
    expect(
      await agentCommands(
        loser().agent,
        [
          {
            kind: 'claimWorkItem',
            workItemId: ids.opsLeaf,
            personId: personOf(loser().agent),
            runId: `run:${loser().agent}:ops`,
            assign: true,
          },
        ],
        ids.opsProject,
      ),
    ).toMatchObject({
      via: 'be-01',
      status: 409,
      body: {
        error: 'claim_limit',
        at: 0,
        kind: 'claimWorkItem',
        cap: CAPS.claims,
        current: CAPS.claims,
      },
    });
    expect((await limits()).usage.concurrentClaims).toBe(CAPS.claims);
    expect((await startable()).claimed).toHaveLength(SLOTS * 2);
  });

  it('8. a winner finishes and releases; the loser retries into the freed units', async () => {
    // The largest winner goes, so the loser fits whichever three won: 12 freed of
    // 12 + 12 + 8 leaves 12 for a 10, and 12 freed of 12 + 10 + 8 leaves 14 for a 12.
    const done = outcome.winners.toSorted((a, b) => ramOf(b.key) - ramOf(a.key)).at(0);
    if (done === undefined) throw new Error('nobody won');
    outcome.released = done.agent;
    const finished = await agentCommands(done.agent, [
      ...[ids.steps.dev, ids.steps.qa].map((stepId) => ({
        kind: 'setProgress',
        workItemId: leafOf(done.key),
        stepId,
        state: 'done',
      })),
      { kind: 'releaseWorkItem', workItemId: leafOf(done.key), personId: personOf(done.agent) },
    ]);
    expect(isOk(finished)).toBe(true);
    const still = outcome.winners.filter((each) => each !== done);
    const stillRam = still.reduce((sum, each) => sum + ramOf(each.key), 0);
    // `resource-occupancy` "Release of the last claim frees the units"; the startable read
    // lists the loser's leaf as fitting again.
    expect(await freeUnits()).toEqual({
      [ids.resources.ram]: { capacity: RAM, occupied: stillRam },
      [ids.resources.slots]: { capacity: SLOTS, occupied: SLOTS - 1 },
      [ids.resources.disk]: { capacity: DISK, occupied: 10 * (SLOTS - 1) },
    });
    expect((await startable()).leaves.map((each) => keyOf(each.workItemId))).toContain(loser().key);
    // Assignments outlive the claim: the done leaf keeps its assignee.
    expect(await assigneesOf(done.key)).toEqual({
      [ids.steps.dev]: personOf(done.agent),
      [ids.steps.qa]: personOf(done.agent),
    });
    expect((await limits()).usage.concurrentClaims).toBe(CAPS.claims - 1);

    const retried = await agentCommands(loser().agent, [claim(loser().agent, loser().key)]);
    expect(isOk(retried)).toBe(true);
    expect(
      claimAnswerOf(retried).acquired.find((each) => each.resourceId === ids.resources.ram)?.units,
    ).toBe(ramOf(loser().key));
    expect(await assigneesOf(loser().key)).toEqual({
      [ids.steps.dev]: personOf(loser().agent),
      [ids.steps.qa]: personOf(loser().agent),
    });
    expect((await freeUnits())[ids.resources.ram]).toEqual({
      capacity: RAM,
      occupied: stillRam + ramOf(loser().key),
    });
    expect((await limits()).usage.concurrentClaims).toBe(CAPS.claims);
  });

  it('9. an admin reassigns a subtree; the claim on a reassigned leaf stays with its holder', async () => {
    const held = await holders();
    const first = [...held].toSorted().at(0);
    if (first === undefined) throw new Error('nothing is held');
    const [heldKey, holder] = first;
    const batch = LEAVES.find((leaf) => leaf.key === heldKey)?.batch ?? 'A';
    const reviewer = outcome.released;
    if (reviewer === undefined || reviewer === holder) throw new Error('no free reviewer');
    // `assignee-management` (issue #669 F6): assignSubtree never refuses on a claim, and lists
    // each leaf step it reassigned while another person holds a step claim on it.
    const batchLeaves = LEAVES.filter((each) => each.batch === batch);
    const claimedDev = (await startable()).claimed.filter(
      (each) => each.stepId === ids.steps.dev && each.holder.personId !== personOf(reviewer),
    );
    // In tree order, as the startable read lists claimed steps.
    const expected = [];
    for (const claimed of claimedDev) {
      const key = keyOf(claimed.workItemId);
      if (!batchLeaves.some((leaf) => leaf.key === key)) continue;
      const previousPersonId = (await assigneesOf(key))[ids.steps.dev] ?? null;
      if (previousPersonId === personOf(reviewer)) continue;
      expected.push({
        workItemId: claimed.workItemId,
        stepId: ids.steps.dev,
        previousPersonId,
        holder: {
          claimId: claimed.claimId,
          personId: claimed.holder.personId,
          runId: claimed.runId,
        },
      });
    }
    expect(expected.map(({ workItemId }) => keyOf(workItemId))).toContain(heldKey);
    const assigned = await adminCommands(ids.project, [
      {
        kind: 'assignSubtree',
        workItemId: ids.batches[batch],
        stepId: ids.steps.dev,
        personId: personOf(reviewer),
      },
    ]);
    expect(assigned.status).toBe(200);
    expect(
      (assigned.body as { results: { reassignedClaimedSteps?: unknown }[] }).results[0]
        ?.reassignedClaimedSteps,
    ).toEqual(expected);
    for (const leaf of batchLeaves)
      expect((await assigneesOf(leaf.key))[ids.steps.dev]).toBe(personOf(reviewer));
    // The claim is untouched: still held by its holder, now beside another assignee.
    const step = (await startable()).claimed.find(
      (each) => each.workItemId === leafOf(heldKey) && each.stepId === ids.steps.dev,
    );
    expect(step).toMatchObject({
      holder: { personId: personOf(holder) },
      assignee: { personId: personOf(reviewer) },
      runId: `run:${holder}:${heldKey}`,
    });
    expect((await holders()).get(heldKey)).toBe(holder);
    outcome.revoked = { agent: holder, key: heldKey };
  });

  it('10. revoking a holding agent’s last key refuses it at once and the sweep releases its claims', async () => {
    const { agent, key } = outcome.revoked;
    if (agent === undefined || key === undefined) throw new Error('step 9 chose no holder');
    // `wbs-claim-leases` L8: revoking a person's last live credential ends its leases in the
    // revoke's own transaction, and the revoke asks the sweep for an immediate tick, which
    // releases them. The sweep runs as boot starts it; its first tick finds nothing expired.
    const sweep = h.claimLeaseSweep();
    sweep.start();
    try {
      await sweep.settled();
      const held = [...(await holders())].filter(([, holder]) => holder === agent);
      expect(held.map(([each]) => each)).toContain(key);
      const occupiedBefore = await ramOccupied();
      const claimsBefore = (await limits()).usage.concurrentClaims;
      const revoked = await asAdmin(
        'DELETE',
        `/api/organization/machine-credentials/${credentialOf(agent).id}`,
      );
      expect(revoked.status).toBe(204);
      // `machine-credentials` "Revocation is immediate and audited": the token's next call is
      // refused in band, the call after it is HTTP 401, and the key gets no new token.
      expect(await agentCommands(agent, [claim(agent, 'B3')])).toMatchObject({
        via: 'mcp-01',
        code: 'machine_credential_refused',
      });
      expect(await asAgent(agent, 'getApiProjects')).toMatchObject({ via: 'http', status: 401 });
      expect(await tokenFor(credentialOf(agent).key)).toMatchObject({
        status: 401,
        body: { error: 'invalid_client' },
      });
      await sweep.settled();
      const after = await holders();
      for (const [each] of held) expect(after.has(each)).toBe(false);
      expect(await ramOccupied()).toBe(
        occupiedBefore - held.reduce((sum, [each]) => sum + ramOf(each), 0),
      );
      expect((await limits()).usage.concurrentClaims).toBe(claimsBefore - held.length);
      // L10: the reap is history under the claim's writing account, naming its reason.
      const history = await asAdmin('GET', `/api/projects/${ids.project}/history`);
      expect(history.status).toBe(200);
      expect(history.text).toContain('(credential revoked)');
      // Every other agent's key still works, and their claims stand.
      for (const other of AGENTS.filter((each) => each !== agent))
        expect(isOk(await asAgent(other, 'getApiProjectsByIdStartable', { id: ids.project }))).toBe(
          true,
        );
      expect([...after.values()]).not.toContain(agent);
      expect(after.size).toBeGreaterThan(0);
    } finally {
      await sweep.stop();
    }
  });

  // Proof: 2026-10-23, with the four create answers pushed into `answered`, this listed them;
  // watched again with the agents on MCP, 2026-10-29.
  it('never answers a key outside its create response', () => {
    expect(answered.length).toBeGreaterThan(50);
    const secrets = keys.flatMap((key) => [key, key.slice(key.indexOf('.') + 1)]);
    const leaks = answered.filter((reply) => secrets.some((secret) => reply.text.includes(secret)));
    expect(leaks.map((reply) => reply.text)).toEqual([]);
  });
});
