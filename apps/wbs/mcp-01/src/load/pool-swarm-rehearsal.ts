import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mcpAuthorizationServerOf } from '@wbs/contracts';

import { HUMAN_ONLY_OPERATIONS } from '../openapi-tools';

/**
 * The agent-pool swarm rehearsal (`wbs-mcp-agent-surface` task 8.1, before its dev run): a pool
 * of three agents under `headersHelper` with `twilight-dash mcp token`, each with its own
 * `wbs_run`, claiming, heartbeating and releasing; re-keyed mid-run, then revoked, watching the
 * leases end. Every part is a real process over loopback HTTP:
 * - be-01: `apps/wbs/be-01/src/testing/pool-swarm-backend.ts` (the composed harness, its claim
 *   lease sweep started, one activated organization whose admin's browser session the driver
 *   speaks through);
 * - mcp-01: its production entrypoint `apps/wbs/mcp-01/src/main.ts`, standalone, on a port
 *   chosen first so its public URL is `http://127.0.0.1:<port>/mcp`;
 * - Dash: the real CLI, `pool import` writing the store, and each agent's stored
 *   `headersHelper` running `mcp token`;
 * - three (then one more) agent processes, `pool-swarm-agent.ts`, each an MCP SDK client
 *   whose initial real GET probe is drained and automatic SSE reconnects are disabled. The
 *   foreground helper lifecycle is exercised; background notification/SSE recovery is not.
 *
 * Run from anywhere:
 *
 *     bun apps/wbs/mcp-01/src/load/pool-swarm-rehearsal.ts [--fault=skip-reimport|skip-revoke]
 *
 * Prints a timeline and a JSON report, and exits 1 when any expectation does not hold. `--fault`
 * breaks the scenario on purpose (R5): `skip-reimport` re-keys without importing the new keys,
 * `skip-revoke` never revokes the pool. Every secret is generated here and dies with the run; the
 * temp directory (both stores, the keys documents, every log) is removed at the end.
 *
 * Its casts read JSON this run's own processes answer (be-01's composed routes and fixture, the
 * agents' lines, Dash's `pool.json`): a shape that is wrong fails an expectation or throws.
 */

const REPO_ROOT = join(import.meta.dir, '../../../../..');
const BACKEND = 'apps/wbs/be-01/src/testing/pool-swarm-backend.ts';
const MCP_MAIN = 'apps/wbs/mcp-01/src/main.ts';
const DASH = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
const AGENT = 'apps/wbs/mcp-01/src/load/pool-swarm-agent.ts';
const RAM_CAPACITY = 24;
const RAM_PER_LEAF = 8;
const DISK_CAPACITY = 40;
const DISK_PER_LEAF = 10;
const LEAVES = 6;
const HEARTBEATS = 3;

const FAULTS = ['skip-reimport', 'skip-revoke'] as const;
type Fault = (typeof FAULTS)[number];
const fault = ((): Fault | null => {
  const arg = process.argv.slice(2).find((each) => each.startsWith('--fault='));
  if (arg === undefined) return null;
  const named = arg.slice('--fault='.length);
  const known = FAULTS.find((each) => each === named);
  if (known === undefined) throw new Error(`--fault is one of ${FAULTS.join(', ')}`);
  return known;
})();

// ------------------------------------------------------------- expectations

interface Expectation {
  readonly name: string;
  readonly holds: boolean;
  readonly observed: unknown;
}
const expectations: Expectation[] = [];
function expect(name: string, holds: boolean, observed: unknown): void {
  expectations.push({ name, holds, observed });
  if (!holds) console.error(`FAILED: ${name}: ${JSON.stringify(observed)}`);
}

const started = Date.now();
interface TimelineRow {
  readonly ms: number;
  readonly actor: string;
  readonly event: string;
  readonly detail: string;
}
const timeline: TimelineRow[] = [];
/** One timeline row; an agent's own event passes the instant it printed (`at`). */
function note(actor: string, event: string, detail = '', at = Date.now()): void {
  timeline.push({ ms: at - started, actor, event, detail });
}

// ---------------------------------------------------------------- processes

const runDir = mkdtempSync(join(tmpdir(), 'pool-swarm-'));
const children: Bun.Subprocess[] = [];

function baseEnv(): Record<string, string> {
  const path = process.env['PATH'];
  const home = process.env['HOME'];
  if (path === undefined || home === undefined) throw new Error('PATH and HOME are required');
  return { PATH: path, HOME: home };
}

function freePort(): number {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
  const port = probe.port;
  void probe.stop(true);
  if (port === undefined) throw new Error('no free port');
  return port;
}

/** Tees `stream` to `log`; resolves the port of the first `{"port":N}` line when `findPort`. */
function drain(stream: ReadableStream<Uint8Array>, log: string): Promise<number> {
  const sink = createWriteStream(join(runDir, log), { flags: 'a' });
  return new Promise<number>((resolve, reject) => {
    void (async () => {
      let pending = '';
      let found = false;
      for await (const chunk of stream) {
        sink.write(chunk);
        if (found) continue;
        pending += new TextDecoder().decode(chunk);
        const port = /^\{"port":(\d+)\}$/m.exec(pending)?.[1];
        if (port !== undefined) {
          found = true;
          resolve(Number(port));
        }
      }
      if (!found) reject(new Error(`a server exited before serving; see ${log}`));
    })();
  });
}

const port = freePort();
const RESOURCE = `http://127.0.0.1:${String(port)}/mcp`;
const ISSUER = mcpAuthorizationServerOf(RESOURCE);
// Generated per run, never a deployment's: be-01 and mcp-01 share it.
const SECRET = randomBytes(32).toString('base64url');

const backend = Bun.spawn([process.execPath, BACKEND], {
  cwd: REPO_ROOT,
  env: { ...baseEnv(), POOL_SWARM_BE_SECRET: SECRET, POOL_SWARM_AUTHORIZATION_SERVER: ISSUER },
  stdin: 'ignore',
  stdout: 'pipe',
  stderr: 'pipe',
});
children.push(backend);
void drain(backend.stderr, 'be-01.log').catch(() => undefined);
const backendUrl = `http://127.0.0.1:${String(await drain(backend.stdout, 'be-01.log'))}`;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const mcp = Bun.spawn([process.execPath, MCP_MAIN], {
  cwd: REPO_ROOT,
  env: {
    ...baseEnv(),
    PORT: String(port),
    MCP_AUTH_MODE: 'standalone',
    MCP_PUBLIC_URL: RESOURCE,
    MCP_TRUSTED_PROXY_HOPS: '0',
    WBS_API_URL: backendUrl,
    MCP_BE_INTERNAL_SECRET: SECRET,
    MCP_STORE_PATH: join(runDir, 'mcp-session.sqlite'),
    MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
    MCP_SIGNING_KEY_CURRENT: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  },
  stdin: 'ignore',
  stdout: 'pipe',
  stderr: 'pipe',
});
children.push(mcp);
void drain(mcp.stdout, 'mcp-01.log').catch(() => undefined);
void drain(mcp.stderr, 'mcp-01.log').catch(() => undefined);
for (let attempt = 0; ; attempt += 1) {
  if (mcp.exitCode !== null) throw new Error('mcp-01 exited before serving; see mcp-01.log');
  try {
    if (
      (await fetch(`http://127.0.0.1:${String(port)}/.well-known/oauth-protected-resource/mcp`))
        .status === 200
    )
      break;
  } catch {
    // Not listening yet; the attempt bound below ends the wait.
  }
  if (attempt >= 400) throw new Error('mcp-01 did not serve its metadata within 20 s');
  await Bun.sleep(50);
}
note('driver', 'stack up', `be-01 ${backendUrl}, mcp-01 ${RESOURCE}`);

// -------------------------------------------------------------------- admin

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** One request as the admin's browser session. */
async function admin(method: string, path: string, body?: unknown): Promise<Answer> {
  const response = await fetch(`${backendUrl}/__fixture/admin`, {
    method: 'POST',
    body: JSON.stringify({ method, path, ...(body === undefined ? {} : { body }) }),
  });
  if (response.status !== 200) throw new Error(`admin fixture: ${await response.text()}`);
  return (await response.json()) as Answer;
}

async function adminOk<T>(method: string, path: string, body?: unknown): Promise<T> {
  const answer = await admin(method, path, body);
  if (answer.status < 200 || answer.status > 299)
    throw new Error(`${method} ${path}: ${JSON.stringify(answer)}`);
  return answer.body as T;
}

function idsOf(body: unknown): string[] {
  return ((body as { results?: { id?: unknown }[] }).results ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');
}

// --------------------------------------------------------------------- seed

const resourceIds = idsOf(
  await adminOk('POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'h2puni RAM', resourceKind: 'divisible', unitLabel: 'GiB' },
      { kind: 'createResource', name: 'h2puni disk', resourceKind: 'divisible', unitLabel: 'GiB' },
    ],
  }),
);
const ram = resourceIds.at(0);
const disk = resourceIds.at(1);
if (ram === undefined || disk === undefined) throw new Error('the resources were not created');
const project = await adminOk<{ project: { id: string }; steps: { id: string }[] }>(
  'POST',
  '/api/projects',
  { name: 'Pool swarm' },
);
const projectId = project.project.id;
const leafIds = idsOf(
  await adminOk('POST', `/api/projects/${projectId}/commands`, {
    commands: Array.from({ length: LEAVES }, (_, index) => ({
      kind: 'createWorkItem',
      parentId: null,
      afterId: null,
      name: `build shard ${String(index + 1)}`,
    })),
  }),
);
if (leafIds.length !== LEAVES) throw new Error('the leaves were not created');
await adminOk('POST', `/api/projects/${projectId}/commands`, {
  commands: [
    { kind: 'setResourceCapacity', resourceId: ram, units: RAM_CAPACITY },
    { kind: 'setResourceCapacity', resourceId: disk, units: DISK_CAPACITY },
    ...leafIds.flatMap((workItemId) => [
      ...project.steps.map((step) => ({
        kind: 'setEstimate',
        workItemId,
        stepId: step.id,
        days: { optimistic: 1, realistic: 1, pessimistic: 2 },
      })),
      { kind: 'setDemand', workItemId, resourceId: ram, units: RAM_PER_LEAF },
      { kind: 'setDemand', workItemId, resourceId: disk, units: DISK_PER_LEAF },
    ]),
  ],
});
note(
  'admin',
  'seeded',
  `${String(LEAVES)} leaves of ${String(RAM_PER_LEAF)} GiB RAM + ${String(DISK_PER_LEAF)} GiB disk; capacity RAM ${String(RAM_CAPACITY)}, disk ${String(DISK_CAPACITY)}`,
);

// -------------------------------------------------------------- admin reads

interface Limits {
  readonly usage: { agentPersons: number; concurrentClaims: number };
}
const limits = () => adminOk<Limits>('GET', '/api/organization/limits');

interface Startable {
  readonly leaves: readonly { workItemId: string }[];
  readonly doesNotFit?: readonly { workItemId: string }[];
  readonly claimed: readonly {
    workItemId: string;
    claimId: string;
    holder: { personId: string };
    assignee: { personId: string } | null;
    runId: string | null;
    leaseExpiresAt: number | null;
  }[];
  readonly resources?: readonly { resourceId: string; occupied: number; free: number }[];
}
const startable = () => adminOk<Startable>('GET', `/api/projects/${projectId}/startable`);
const occupied = async (): Promise<{ ram: number; disk: number }> => {
  const read = await startable();
  const of = (id: string) => read.resources?.find((each) => each.resourceId === id)?.occupied;
  return { ram: of(ram) ?? -1, disk: of(disk) ?? -1 };
};

interface ProjectClaim {
  readonly claimId: string;
  readonly workItemId: string;
  readonly holder: { personId: string };
  readonly runId: string | null;
  readonly leaseExpiresAt: number | null;
  readonly leaseRevokedAt: number | null;
}
const claims = async () =>
  (await adminOk<{ claims: ProjectClaim[] }>('GET', `/api/projects/${projectId}/claims`)).claims;

interface HistoryEvent {
  readonly kind: string;
  readonly reason: string;
  readonly claims: readonly { holder: { personId: string }; runId: string | null }[];
}
const history = async () =>
  (
    await adminOk<{ events: HistoryEvent[] }>(
      'GET',
      `/api/projects/${projectId}/claim-history?limit=100`,
    )
  ).events;

interface PoolListing {
  readonly id: string;
  readonly revokedAt: number | null;
  readonly credentials: readonly { id: string; personId: string }[];
}
const pools = async () =>
  (await adminOk<{ pools: PoolListing[] }>('GET', '/api/organization/agent-pools')).pools;

interface AuditRow {
  readonly action: string;
  readonly subjectId: string;
  readonly detail: string;
}
async function audit(): Promise<AuditRow[]> {
  return (await (await fetch(`${backendUrl}/__fixture/audit`)).json()) as AuditRow[];
}
async function sweepSettled(): Promise<void> {
  await fetch(`${backendUrl}/__fixture/sweep-settled`, { method: 'POST' });
}

interface ResourceUse {
  readonly id: string;
  readonly state: string;
}
async function resourceUseState(useId: string): Promise<string> {
  const listed = await adminOk<{ uses: ResourceUse[] }>(
    'GET',
    `/api/projects/${projectId}/resource-uses?limit=100`,
  );
  return listed.uses.find((each) => each.id === useId)?.state ?? 'absent';
}

// --------------------------------------------------------------------- Dash

interface KeysDocument {
  readonly poolId: string;
  readonly agents: readonly {
    personId: string;
    personName: string;
    credentialId: string;
    key: string;
  }[];
}
interface StoredPool {
  readonly agents: readonly { personId: string; run: string; mcpConfig: string; keyFile: string }[];
}
const store = join(runDir, 'pools');

/** Writes the keys document `0600`, as the admin's `chmod 600` leaves it. */
function saveDocument(document: KeysDocument, label: string): string {
  const path = join(runDir, `pool-${document.poolId}.${label}.keys.json`);
  writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
  return path;
}

function runDash(argv: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  const run = Bun.spawnSync([process.execPath, DASH, ...argv], {
    cwd: REPO_ROOT,
    env: baseEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() };
}

function importPool(document: KeysDocument, label: string): StoredPool {
  const imported = runDash(['pool', 'import', saveDocument(document, label), '--store', store]);
  const leaked = document.agents.some(
    (agent) => imported.stdout.includes(agent.key) || imported.stderr.includes(agent.key),
  );
  expect(`${label}: pool import exits 0`, imported.exitCode === 0, imported.stderr.trim());
  expect(`${label}: pool import prints no key`, !leaked, leaked);
  note('dash', `pool import (${label})`, `exit ${String(imported.exitCode)}`);
  return JSON.parse(
    readFileSync(join(store, `pool-${document.poolId}`, 'pool.json'), 'utf8'),
  ) as StoredPool;
}

/** One `mcp token` run with `key` (written to its own `0600` file): its exit code and stderr. */
function tokenWith(key: string, run: string, label: string): { exitCode: number; stderr: string } {
  const keyFile = join(runDir, `${label}.key`);
  writeFileSync(keyFile, `${key}\n`, { mode: 0o600 });
  const ran = runDash([
    'mcp',
    'token',
    '--resource',
    RESOURCE,
    '--key-file',
    keyFile,
    '--run',
    run,
  ]);
  return { exitCode: ran.exitCode, stderr: ran.stderr.trim().slice(0, 300) };
}

// ------------------------------------------------------------------- agents

interface AgentProcess {
  readonly personId: string;
  readonly run: string;
  readonly process: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
  readonly answers: Map<number, (line: Record<string, unknown>) => void>;
  readonly events: Record<string, unknown>[];
}
let seq = 0;
const agents: AgentProcess[] = [];

function startAgent(personId: string, run: string, mcpConfig: string): AgentProcess {
  const child = Bun.spawn([process.execPath, AGENT, mcpConfig], {
    cwd: REPO_ROOT,
    env: baseEnv(),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  children.push(child);
  const agent: AgentProcess = { personId, run, process: child, answers: new Map(), events: [] };
  void drain(child.stderr, `agent-${personId}.log`).catch(() => undefined);
  void (async () => {
    let pending = '';
    for await (const chunk of child.stdout) {
      pending += new TextDecoder().decode(chunk);
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const line = JSON.parse(pending.slice(0, end)) as Record<string, unknown>;
        pending = pending.slice(end + 1);
        if (typeof line['event'] === 'string') {
          agent.events.push(line);
          note(short(personId), line['event'], describeEvent(line), Number(line['at']));
        }
        const waiting =
          typeof line['seq'] === 'number' ? agent.answers.get(line['seq']) : undefined;
        if (waiting !== undefined) waiting(line);
      }
    }
  })();
  agents.push(agent);
  return agent;
}

function describeEvent(line: Record<string, unknown>): string {
  if (line['event'] === 'helper_issued')
    return `${String(line['why'])}, jti ${String(line['jti']).slice(0, 8)}`;
  if (line['event'] === 'helper_failed')
    return `${String(line['why'])}, exit ${String(line['exitCode'])}: ${String(line['stderr'])}`;
  return '';
}

/** The first 8 characters of a person id, for the timeline. */
function short(personId: string): string {
  return `agent ${personId.slice(0, 8)}`;
}

function ask(
  agent: AgentProcess,
  op: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  seq += 1;
  const mine = seq;
  const answered = new Promise<Record<string, unknown>>((resolve) =>
    agent.answers.set(mine, resolve),
  );
  void agent.process.stdin.write(`${JSON.stringify({ seq: mine, op, ...args })}\n`);
  void agent.process.stdin.flush();
  return Promise.race([
    answered,
    Bun.sleep(60_000).then(() => {
      throw new Error(`${agent.personId} did not answer ${op} within 60 s`);
    }),
  ]);
}

interface Held {
  readonly agent: AgentProcess;
  readonly workItemId: string;
  readonly claimIds: readonly string[];
}

/** Every agent claims at once; each answer is checked and noted. */
async function claimAll(round: string, team: readonly AgentProcess[]): Promise<Held[]> {
  const answers = await Promise.all(team.map((agent) => ask(agent, 'claim', { projectId })));
  const held: Held[] = [];
  for (const [index, answer] of answers.entries()) {
    const agent = team.at(index);
    if (agent === undefined) continue;
    expect(`${round}: ${short(agent.personId)} claims a leaf`, answer['outcome'] === 'ok', answer);
    if (answer['outcome'] !== 'ok') continue;
    const acquired = answer['acquired'] as { resourceId: string; units: number }[];
    expect(
      `${round}: ${short(agent.personId)}'s claim acquires the leaf's RAM and disk demand`,
      acquired.some((each) => each.resourceId === ram && each.units === RAM_PER_LEAF) &&
        acquired.some((each) => each.resourceId === disk && each.units === DISK_PER_LEAF),
      acquired,
    );
    held.push({
      agent,
      workItemId: String(answer['workItemId']),
      claimIds: answer['claimIds'] as string[],
    });
    note(
      short(agent.personId),
      'claimed',
      `leaf ${String(answer['workItemId']).slice(0, 8)}, refusals ${JSON.stringify(answer['refusals'])}`,
    );
  }
  expect(
    `${round}: the agents hold distinct leaves`,
    new Set(held.map((each) => each.workItemId)).size === held.length,
    held.map((each) => each.workItemId),
  );
  return held;
}

/** The project's claims as the admin reads them: each held one carries its agent's own run. */
async function checkHolders(round: string, held: readonly Held[]): Promise<ProjectClaim[]> {
  const read = await claims();
  for (const { agent, claimIds } of held) {
    const mine = read.filter((each) => claimIds.includes(each.claimId));
    expect(
      `${round}: ${short(agent.personId)}'s claims are held by its pool person under its own run`,
      mine.length === claimIds.length &&
        mine.every((each) => each.holder.personId === agent.personId && each.runId === agent.run),
      mine,
    );
  }
  const runs = new Set(read.map((each) => each.runId));
  expect(`${round}: every agent's run is distinct`, runs.size === held.length, [...runs]);
  return read;
}

/** Every holder heartbeats {@link HEARTBEATS} times; each answer names one lease per claimed step. */
async function heartbeatAll(round: string, held: readonly Held[]): Promise<void> {
  for (let beat = 1; beat <= HEARTBEATS; beat += 1) {
    const answers = await Promise.all(held.map(({ agent }) => ask(agent, 'heartbeat')));
    for (const [index, answer] of answers.entries()) {
      const holder = held.at(index);
      if (holder === undefined) continue;
      const { agent } = holder;
      expect(
        `${round}: ${short(agent.personId)}'s heartbeat ${String(beat)} renews exactly its own leases`,
        answer['outcome'] === 'ok' &&
          answer['leases'] === holder.claimIds.length &&
          typeof answer['leaseExpiresAt'] === 'number',
        answer,
      );
    }
    note(
      'agents',
      `heartbeat ${String(beat)}`,
      answers.map((each) => `${String(each['outcome'])}/${String(each['leases'])}`).join(' '),
    );
    await Bun.sleep(200);
  }
}

/**
 * Heartbeats until the answer is `ok` or a helper failed, at most `bound` calls, answering every
 * outcome in order: what an agent meets after its credential changed.
 */
async function heartbeatUntilSettled(agent: AgentProcess, bound: number): Promise<string[]> {
  const outcomes: string[] = [];
  for (let call = 0; call < bound; call += 1) {
    const answer = await ask(agent, 'heartbeat');
    outcomes.push(String(answer['outcome']));
    note(short(agent.personId), 'heartbeat', String(answer['outcome']));
    if (answer['outcome'] === 'ok' || String(answer['outcome']).startsWith('helper_failed')) break;
  }
  return outcomes;
}

async function releaseAll(round: string, held: readonly Held[]): Promise<void> {
  const answers = await Promise.all(
    held.map(({ agent, workItemId }) => ask(agent, 'release', { projectId, workItemId })),
  );
  for (const [index, answer] of answers.entries()) {
    const agent = held.at(index)?.agent;
    if (agent === undefined) continue;
    expect(
      `${round}: ${short(agent.personId)} releases its claim`,
      answer['outcome'] === 'ok',
      answer,
    );
  }
  note('agents', 'released', answers.map((each) => String(each['outcome'])).join(' '));
}

// ----------------------------------------------------------------- scenario

let exitCode = 1;
try {
  const before = await limits();

  // 1. The admin creates the pool and Dash imports it.
  const created = await admin('POST', '/api/organization/agent-pools', { name: 'fleet', size: 3 });
  expect('the admin creates a pool of 3 (201)', created.status === 201, created.status);
  const first = created.body as KeysDocument;
  note('admin', 'agent_pool_created', `pool ${first.poolId.slice(0, 8)}, 3 keys`);
  const stored = importPool(first, 'create');
  const afterCreate = await limits();
  expect(
    'the pool takes 3 agent persons of the cap',
    afterCreate.usage.agentPersons === before.usage.agentPersons + 3,
    { before: before.usage, after: afterCreate.usage },
  );
  const listed = (await pools()).find((each) => each.id === first.poolId);
  expect('the pool lists 3 live credentials', listed?.credentials.length === 3, listed);
  expect(
    'every agent has its own run pool-<poolId>/<personId>',
    stored.agents.every((each) => each.run === `pool-${first.poolId}/${each.personId}`),
    stored.agents.map((each) => each.run),
  );

  const team = stored.agents.map((each) => startAgent(each.personId, each.run, each.mcpConfig));

  // 2. Tools: the agent surface, none of the human-only operations.
  const humanOnly = new Set(HUMAN_ONLY_OPERATIONS.map((each) => each.operationId));
  for (const id of [
    'getApiOrganizationAgent-pools',
    'postApiOrganizationAgent-pools',
    'postApiOrganizationAgent-poolsByIdRekey',
    'deleteApiOrganizationAgent-poolsById',
  ])
    expect(`the pool route ${id} is human-only`, humanOnly.has(id), id);
  for (const agent of team) {
    const tools = await ask(agent, 'tools');
    // Proof: removing the agent's probe barrier with a delayed SDK GET failed this startup
    // check before re-key. A probe held forever hit ask's existing 60 s bound and exited 1;
    // watched 2026-10-29, see verify.md, launch gate repair.
    expect(
      `${short(agent.personId)} finishes its startup GET probe before serving commands`,
      JSON.stringify(agent.events.map((each) => each['event'])) ===
        JSON.stringify(['helper_issued', 'probe_finished']) &&
        agent.events.at(-1)?.['status'] === 200,
      agent.events.slice(),
    );
    const names = (tools['tools'] as string[] | undefined) ?? [];
    expect(
      `${short(agent.personId)} lists the claim, heartbeat and resource-use tools`,
      [
        'getApiProjectsByIdStartable',
        'postApiProjectsByIdCommands',
        'postApiClaimsRenew',
        'postApiProjectsByIdResourceUses',
      ].every((name) => names.includes(name)),
      names.length,
    );
    expect(
      `${short(agent.personId)} lists no human-only tool`,
      names.every((name) => !humanOnly.has(name)),
      names.filter((name) => humanOnly.has(name)),
    );
  }

  // 3. Round 1: claim, register the disk copy, heartbeat, release.
  const round1 = await claimAll('round 1', team);
  await checkHolders('round 1', round1);
  const read1 = await startable();
  expect(
    'round 1: the startable read shows each claim assigned to its holder',
    round1.every(({ agent, workItemId }) =>
      read1.claimed
        .filter((each) => each.workItemId === workItemId)
        .every((each) => each.assignee?.personId === agent.personId),
    ),
    read1.claimed,
  );
  expect(
    'round 1: the claims hold 24 GiB RAM and 30 GiB disk',
    JSON.stringify(await occupied()) === JSON.stringify({ ram: 24, disk: 30 }),
    await occupied(),
  );
  expect(
    'round 1: the three other leaves do not fit (RAM full)',
    (read1.doesNotFit ?? []).length === LEAVES - 3,
    read1.doesNotFit?.length,
  );
  for (const { agent } of round1) {
    const work = await adminOk<{ claims: { runId: string | null }[] }>(
      'GET',
      `/api/projects/${projectId}/people/${agent.personId}/work`,
    );
    expect(
      `round 1: ${short(agent.personId)}'s person work lists its claim under its run`,
      work.claims.length > 0 && work.claims.every((each) => each.runId === agent.run),
      work.claims,
    );
  }
  const uses1 = await Promise.all(
    round1.map(({ agent, workItemId }) =>
      ask(agent, 'register_use', {
        projectId,
        workItemId,
        resourceId: disk,
        units: DISK_PER_LEAF,
        run: agent.run,
      }),
    ),
  );
  for (const [index, use] of uses1.entries())
    expect(
      `round 1: ${short(round1[index]?.agent.personId ?? '')} registers its disk copy`,
      use['outcome'] === 'ok' && use['state'] === 'active',
      use,
    );
  note('agents', 'resource uses registered', uses1.map((each) => String(each['state'])).join(' '));
  await heartbeatAll('round 1', round1);
  await releaseAll('round 1', round1);
  expect(
    'round 1: releasing frees every unit',
    JSON.stringify(await occupied()) === JSON.stringify({ ram: 0, disk: 0 }),
    await occupied(),
  );
  expect('round 1: no claim is left', (await claims()).length === 0, await claims());
  for (const use of uses1)
    expect(
      'round 1: a released claim asks for its resource use cleanup',
      (await resourceUseState(String(use['useId']))) === 'cleanup_pending',
      await resourceUseState(String(use['useId'])),
    );

  // 4. Round 2: claim, re-key mid-run, re-import, heartbeat through the change, release.
  const round2 = await claimAll('round 2', team);
  const held2 = await checkHolders('round 2', round2);
  const rekeyEpisodes = round2.map(({ agent }) => ({ agent, start: agent.events.length }));
  const rekeyed = await admin('POST', `/api/organization/agent-pools/${first.poolId}/rekey`, {});
  expect('the admin re-keys the pool (201)', rekeyed.status === 201, rekeyed.status);
  const second = rekeyed.body as KeysDocument;
  note('admin', 'agent_pool_rekeyed', `${String(second.agents.length)} new keys`);
  expect(
    're-key keys the same persons with new credentials',
    JSON.stringify(second.agents.map((each) => each.personId).toSorted()) ===
      JSON.stringify(first.agents.map((each) => each.personId).toSorted()) &&
      second.agents.every((each) =>
        first.agents.every((old) => old.credentialId !== each.credentialId),
      ),
    second.agents.map((each) => each.credentialId),
  );
  const afterRekey = await limits();
  expect(
    're-key consumes no agent person',
    afterRekey.usage.agentPersons === afterCreate.usage.agentPersons,
    afterRekey.usage,
  );
  const oldAgent = first.agents.at(0);
  if (oldAgent === undefined) throw new Error('the pool has no agent');
  const oldIssued = tokenWith(oldAgent.key, `pool-${first.poolId}/${oldAgent.personId}`, 'old-key');
  expect(
    'the old key no longer issues a token (mcp token exits non-zero)',
    oldIssued.exitCode !== 0,
    oldIssued,
  );
  note(
    'dash',
    'mcp token with an old key',
    `exit ${String(oldIssued.exitCode)}: ${oldIssued.stderr}`,
  );
  if (fault !== 'skip-reimport') importPool(second, 'rekey');
  const listedRekeyed = (await pools()).find((each) => each.id === first.poolId);
  expect(
    'after re-key the pool lists exactly the 3 new credentials',
    listedRekeyed?.credentials.length === 3 &&
      listedRekeyed.credentials.every((each) =>
        second.agents.some((agent) => agent.credentialId === each.id),
      ),
    listedRekeyed?.credentials,
  );
  // Proof: with `--fault=skip-reimport` every agent's next helper run met `invalid_client`
  // (`["tool_error:machine_credential_refused","helper_failed:1"]`) and the run exited 1;
  // watched 2026-10-28.
  // M3/M5: be-01 rereads the credential on every call, so the first call with a bearer of the
  // revoked key is an in-band `machine_credential_refused`; its jti enters mcp-01's refused set,
  // the next request is HTTP 401, and the helper re-runs with the re-imported key.
  // Proof: re-enabled SDK reconnects, with its real GET's 401 rendezvoused with the POST's,
  // failed this exact episode for all three agents (two 401s, two helpers, same old jti);
  // watched 2026-10-29.
  for (const { agent, start } of rekeyEpisodes) {
    const outcomes = await heartbeatUntilSettled(agent, 4);
    const episode = agent.events.slice(start);
    expect(
      `round 2: ${short(agent.personId)}'s heartbeat recovers after re-key (refused in band, then 401, helper re-runs, ok)`,
      JSON.stringify(outcomes) ===
        JSON.stringify(['tool_error:machine_credential_refused', 'ok']) &&
        JSON.stringify(episode.map((each) => each['event'])) ===
          JSON.stringify(['http_401', 'helper_issued']) &&
        episode.at(-1)?.['why'] === 'after_401',
      { outcomes, events: episode },
    );
  }
  const reread2 = await claims();
  expect(
    'round 2: the claims survive the re-key: same ids, holders and runs',
    held2.every((was) =>
      reread2.some(
        (now) =>
          now.claimId === was.claimId &&
          now.holder.personId === was.holder.personId &&
          now.runId === was.runId &&
          now.leaseRevokedAt === null &&
          (now.leaseExpiresAt ?? 0) >= (was.leaseExpiresAt ?? Infinity),
      ),
    ) && reread2.length === held2.length,
    reread2,
  );
  await heartbeatAll('round 2', round2);
  await releaseAll('round 2', round2);

  // 5. Round 3: claim and register copies, then revoke and watch the leases end.
  const round3 = await claimAll('round 3', team);
  await checkHolders('round 3', round3);
  const uses3 = await Promise.all(
    round3.map(({ agent, workItemId }) =>
      ask(agent, 'register_use', {
        projectId,
        workItemId,
        resourceId: disk,
        units: DISK_PER_LEAF,
        run: agent.run,
      }),
    ),
  );
  await heartbeatAll('round 3', round3);
  const claimsBeforeRevoke = (await limits()).usage.concurrentClaims;
  expect('round 3: the cap counts the 3 held claims', claimsBeforeRevoke === 3, claimsBeforeRevoke);
  if (fault !== 'skip-revoke') {
    const revoked = await admin('DELETE', `/api/organization/agent-pools/${first.poolId}`);
    expect(
      'the admin revokes the pool: 3 keys, no person removed',
      revoked.status === 200 &&
        JSON.stringify(revoked.body) ===
          JSON.stringify({ poolId: first.poolId, revokedCredentials: 3, removedPersons: 0 }),
      revoked,
    );
    note('admin', 'agent_pool_revoked', JSON.stringify(revoked.body));
  }
  await sweepSettled();
  // Proof: with `--fault=skip-revoke` this run exited 1 on these lease checks, and with be-01's
  // `endLeasesOfUncredentialed` call commented out of `AgentPoolRepository.revoke`
  // (agent-pool.ts) it exited 1 on the same nine: claims left, 24 GiB RAM held, the cap at 3,
  // no `credential_revoked` history, resource uses still `active`; watched 2026-10-28.
  const afterRevoke = await claims();
  expect(
    'after revoke no claim of the pool is left (leases ended, sweep released)',
    afterRevoke.length === 0,
    afterRevoke,
  );
  note('be-01', 'lease sweep settled', `${String(afterRevoke.length)} claims left`);
  expect(
    'after revoke every unit is free',
    JSON.stringify(await occupied()) === JSON.stringify({ ram: 0, disk: 0 }),
    await occupied(),
  );
  expect(
    'after revoke the cap counts no claim',
    (await limits()).usage.concurrentClaims === 0,
    (await limits()).usage,
  );
  const reaped = (await history()).filter(
    (each) => each.kind === 'release' && each.reason === 'credential_revoked',
  );
  expect(
    'claim history records each agent’s release as credential_revoked under its run',
    round3.every(({ agent }) =>
      reaped.some((event) =>
        event.claims.some(
          (each) => each.holder.personId === agent.personId && each.runId === agent.run,
        ),
      ),
    ),
    reaped,
  );
  for (const use of uses3)
    expect(
      'after revoke each reaped claim’s resource use asks for cleanup',
      (await resourceUseState(String(use['useId']))) === 'cleanup_pending',
      await resourceUseState(String(use['useId'])),
    );
  for (const { agent } of round3) {
    const outcomes = await heartbeatUntilSettled(agent, 4);
    expect(
      `after revoke ${short(agent.personId)} is refused: in band, then 401, then its helper fails to issue`,
      JSON.stringify(outcomes) ===
        JSON.stringify(['tool_error:machine_credential_refused', 'helper_failed:1']),
      { outcomes, events: agent.events.slice(-3) },
    );
  }
  const latest = second.agents.at(0);
  if (latest === undefined) throw new Error('the re-keyed pool has no agent');
  const latestIssued = tokenWith(
    latest.key,
    `pool-${first.poolId}/${latest.personId}`,
    'revoked-key',
  );
  expect('after revoke the latest key issues no token', latestIssued.exitCode !== 0, latestIssued);
  const listedRevoked = (await pools()).find((each) => each.id === first.poolId);
  expect(
    'the revoked pool lists revokedAt and no live credential',
    listedRevoked?.revokedAt !== null && listedRevoked?.credentials.length === 0,
    listedRevoked,
  );
  expect(
    'a revoked pool’s persons still count toward the cap',
    (await limits()).usage.agentPersons === afterCreate.usage.agentPersons,
    (await limits()).usage,
  );

  // 6. A second pool, revoked with removePersons=true.
  const spareCreated = await admin('POST', '/api/organization/agent-pools', {
    name: 'spare',
    size: 1,
  });
  expect('the admin creates a spare pool of 1', spareCreated.status === 201, spareCreated.status);
  const spare = spareCreated.body as KeysDocument;
  const spareStored = importPool(spare, 'spare');
  const spareAgentEntry = spareStored.agents.at(0);
  if (spareAgentEntry === undefined) throw new Error('the spare pool has no agent');
  const spareAgent = startAgent(
    spareAgentEntry.personId,
    spareAgentEntry.run,
    spareAgentEntry.mcpConfig,
  );
  const spareHeld = await claimAll('spare', [spareAgent]);
  const withSpare = await limits();
  const removed = await admin(
    'DELETE',
    `/api/organization/agent-pools/${spare.poolId}?removePersons=true`,
  );
  expect(
    'removePersons=true revokes the key and removes the person',
    removed.status === 200 &&
      JSON.stringify(removed.body) ===
        JSON.stringify({ poolId: spare.poolId, revokedCredentials: 1, removedPersons: 1 }),
    removed,
  );
  note('admin', 'agent_pool_revoked (removePersons)', JSON.stringify(removed.body));
  await sweepSettled();
  const afterRemoval = await limits();
  expect(
    'removing the person releases the cap and its claim',
    afterRemoval.usage.agentPersons === withSpare.usage.agentPersons - 1 &&
      afterRemoval.usage.concurrentClaims === withSpare.usage.concurrentClaims - spareHeld.length &&
      (await claims()).length === 0,
    { before: withSpare.usage, after: afterRemoval.usage },
  );

  // 7. Audit.
  const rows = await audit();
  const count = (action: string) => rows.filter((each) => each.action === action).length;
  expect(
    'audit: agent_pool_created twice',
    count('agent_pool_created') === 2,
    count('agent_pool_created'),
  );
  expect(
    'audit: agent_pool_rekeyed once',
    count('agent_pool_rekeyed') === 1,
    count('agent_pool_rekeyed'),
  );
  expect(
    'audit: agent_pool_revoked twice',
    count('agent_pool_revoked') === (fault === 'skip-revoke' ? 1 : 2),
    count('agent_pool_revoked'),
  );
  const issuedFor = new Set(
    rows.filter((each) => each.action === 'machine_token_issued').map((each) => each.subjectId),
  );
  const fleetCredentials = [...first.agents, ...second.agents].map((each) => each.credentialId);
  expect(
    'audit: machine_token_issued names every fleet credential of both generations',
    fleetCredentials.every((id) => issuedFor.has(id)),
    { issued: issuedFor.size, fleet: fleetCredentials.length },
  );
  // At most once per (credential, run, UTC day): many helper runs, one row each.
  expect(
    'audit: one machine_token_issued row per credential and run',
    rows.filter((each) => each.action === 'machine_token_issued').length === issuedFor.size,
    rows.filter((each) => each.action === 'machine_token_issued').length,
  );
  expect(
    'audit: no row carries a key',
    rows.every((row) =>
      [...first.agents, ...second.agents, ...spare.agents].every(
        (agent) => !row.detail.includes(agent.key),
      ),
    ),
    null,
  );

  for (const agent of agents) await ask(agent, 'stop').catch(() => undefined);
  exitCode = expectations.every((each) => each.holds) ? 0 : 1;
} catch (cause) {
  console.error(cause);
  expect('the rehearsal ran to its end', false, String(cause));
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.all(children.map((child) => child.exited));
  rmSync(runDir, { recursive: true, force: true });
}

timeline.sort((a, b) => a.ms - b.ms);
const width = Math.max(...timeline.map((row) => row.actor.length));
for (const row of timeline)
  console.log(
    `${String(row.ms).padStart(6)} ms  ${row.actor.padEnd(width)}  ${row.event}${row.detail === '' ? '' : `  ${row.detail}`}`,
  );
const failed = expectations.filter((each) => !each.holds);
console.log(
  JSON.stringify(
    {
      fault,
      expectations: expectations.length,
      held: expectations.length - failed.length,
      failed: failed.map((each) => ({ name: each.name, observed: each.observed })),
    },
    null,
    2,
  ),
);
process.exit(exitCode);
