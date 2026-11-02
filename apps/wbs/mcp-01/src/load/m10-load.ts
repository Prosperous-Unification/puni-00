import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalMcpResourceOf, mcpAuthorizationServerOf } from '@wbs/contracts';
import { Database } from 'bun:sqlite';

import { M10_LIMITS } from '../machine-limits';
import { McpSessionStore } from '../session-store';

/**
 * M10's load evidence (`wbs-mcp-agent-surface` task 4.3): be-01
 * (`apps/wbs/be-01/src/testing/mcp-load-backend.ts`) and mcp-01
 * (`mcp-01-loopback.ts`) as separate processes on loopback, driven over real
 * HTTP by the agents this process plays. Run from the repository root:
 *
 *     bun apps/wbs/mcp-01/src/load/m10-load.ts [--agents=100] [--steady-seconds=300]
 *
 * Phases, each with its own source address: mcp-01 runs with
 * `MCP_TRUSTED_PROXY_HOPS=1` and every request carries one `X-Forwarded-For`
 * entry from TEST-NET-2 (RFC 5737), so one process plays many sources.
 * 1. issuance burst: every org-a agent's `client_credentials` at once from one source, topped up
 *    to the per-source burst, then one more;
 * 2. steady design load: every org-a agent claims, heartbeats, reads the claims and releases its
 *    own leaf, one tool call each 500 ms, sequentially, with its own `wbs_run`;
 * 3. fences: one credential over its call burst (single calls, then a batch) while the others
 *    keep their pace; org-a over its in-flight limit, be-01 held 1.5 s per call, while org-b
 *    keeps its pace; and one undelayed 200-call burst, observed only;
 * 4. failures: a failed-authentication flood from one source, and wrong secrets for one real
 *    credential, beside valid clients elsewhere.
 *
 * The in-flight figures are this client's outstanding `/mcp` requests per organization: an
 * upper bound on what mcp-01 holds, since a call's slot is taken after its request arrives and
 * freed before its answer is sent. CPU and RSS are read from `/proc` (Linux only).
 *
 * Prints a JSON report, and exits 1 when any expectation in it does not hold. Every secret is
 * generated here and dies with the run; the temp directory (mcp-01's store, both logs) is
 * removed at the end, after the logs were scanned.
 */

const REPO_ROOT = join(import.meta.dir, '../../../../..');
const PUBLIC_URL = 'https://wbs.load.test/mcp';
const ISSUER = mcpAuthorizationServerOf(PUBLIC_URL);
const RESOURCE = canonicalMcpResourceOf(PUBLIC_URL);
const TOKEN_PATH = new URL(`${ISSUER}/token`).pathname;
const CALL_INTERVAL_MS = 500;
const SLOW_BE_MS = 1_500;

const options = new Map(
  process.argv
    .slice(2)
    .map((arg) => /^--([a-z-]+)=(.+)$/.exec(arg))
    .map((match) => {
      if (match === null) throw new Error('arguments are --agents=N and --steady-seconds=N');
      return [match[1], Number(match[2])] as const;
    }),
);
const AGENTS = options.get('agents') ?? 100;
const STEADY_SECONDS = options.get('steady-seconds') ?? 300;
const OTHER_AGENTS = 10;
/** Credentials that push org-a over its in-flight limit, each within its own call burst. */
const IN_FLIGHT_CALLERS = 15;
if (!Number.isSafeInteger(AGENTS) || AGENTS < IN_FLIGHT_CALLERS + 2 || AGENTS > 100)
  throw new Error(`--agents must be a whole number from ${String(IN_FLIGHT_CALLERS + 2)} to 100`);
if (!Number.isSafeInteger(STEADY_SECONDS) || STEADY_SECONDS < 5)
  throw new Error('--steady-seconds must be a whole number of at least 5');

interface Agent {
  readonly personId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly key: string;
  readonly projectId: string;
  readonly leafId: string;
}
interface Session extends Agent {
  readonly token: string;
}

interface Expectation {
  readonly name: string;
  readonly holds: boolean;
  readonly observed: unknown;
}
const expectations: Expectation[] = [];
function expect(name: string, holds: boolean, observed: unknown): void {
  expectations.push({ name, holds, observed });
}

/** `list[index]`, which the caller sized; a missing one is a defect of this script. */
function nth<T>(list: readonly T[], index: number): T {
  const found = list[index];
  if (found === undefined) throw new Error(`no entry ${String(index)} of ${String(list.length)}`);
  return found;
}

// ---------------------------------------------------------------- processes

const runDir = mkdtempSync(join(tmpdir(), 'mcp-m10-load-'));
const children: Bun.Subprocess[] = [];

/** Spawns `script`, tees its output to `log`, and answers the port its `{"port":N}` line names. */
async function spawnServer(
  script: string,
  env: Record<string, string>,
  log: string,
  bunFlags: readonly string[] = [],
): Promise<{ readonly process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>; readonly port: number }> {
  const child = Bun.spawn([process.execPath, ...bunFlags, script], {
    cwd: REPO_ROOT,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  children.push(child);
  const sink = createWriteStream(join(runDir, log));
  let announce: ((port: number) => void) | undefined;
  const announced = new Promise<number>((resolve) => (announce = resolve));
  const drain = async (stream: ReadableStream<Uint8Array>, findPort: boolean): Promise<void> => {
    let pending = '';
    for await (const chunk of stream) {
      sink.write(chunk);
      if (!findPort) continue;
      pending += new TextDecoder().decode(chunk);
      const port = /^\{"port":(\d+)\}$/m.exec(pending)?.[1];
      if (port !== undefined) {
        announce?.(Number(port));
        findPort = false;
      }
    }
  };
  void drain(child.stderr, false);
  const stdoutDone = drain(child.stdout, true);
  const port = await Promise.race([
    announced,
    stdoutDone.then(() => {
      throw new Error(`${script} exited before serving; see its log`);
    }),
  ]);
  return { process: child, port };
}

/**
 * `M10_LOAD_BE_PROFILE_DIR` (an existing directory, outside the run's temp directory) makes
 * be-01 write a `--cpu-prof-md` profile there when the driver stops it; unset, none is written.
 */
function beProfileFlags(): readonly string[] {
  const dir = process.env['M10_LOAD_BE_PROFILE_DIR'];
  return dir === undefined ? [] : ['--cpu-prof-md', `--cpu-prof-dir=${dir}`];
}

function baseEnv(): Record<string, string> {
  const path = process.env['PATH'];
  const home = process.env['HOME'];
  if (path === undefined || home === undefined) throw new Error('PATH and HOME are required');
  return { PATH: path, HOME: home };
}

/** mcp-01's store at the activated epoch, as the activation runbook's epoch step leaves it. */
function activatedStore(path: string, key: Buffer): void {
  new McpSessionStore(path, [key]).close();
  const db = new Database(path);
  db.run('UPDATE mcp_credential_epoch SET epoch = 1');
  db.close();
}

// ------------------------------------------------------------------ sampling

const CLOCK_TICKS = Number(
  new TextDecoder().decode(Bun.spawnSync(['getconf', 'CLK_TCK']).stdout).trim(),
);

interface ProcessSample {
  readonly at: number;
  readonly ticks: number;
  readonly rssKiB: number;
}
function sampleProcess(pid: number): ProcessSample {
  const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  // Fields after the parenthesised command name; utime and stime are fields 14 and 15.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const rss = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'))?.[1];
  if (rss === undefined) throw new Error(`no VmRSS for ${String(pid)}`);
  return {
    at: performance.now(),
    ticks: Number(fields[11]) + Number(fields[12]),
    rssKiB: Number(rss),
  };
}

interface Usage {
  peakCpuPercent: number;
  meanCpuPercent: number;
  peakRssMiB: number;
  endRssMiB: number;
}
/** Samples `pids` every `everyMs` until stopped: per-interval CPU percent and RSS. */
function watchProcesses(
  pids: Record<string, number>,
  everyMs: number,
): { stop(): Record<string, Usage> } {
  const watched = Object.entries(pids).map(([name, pid]) => {
    const first = sampleProcess(pid);
    const usage: Usage = { peakCpuPercent: 0, meanCpuPercent: 0, peakRssMiB: 0, endRssMiB: 0 };
    return { name, pid, first, last: first, usage };
  });
  const cpuPercent = (from: ProcessSample, to: ProcessSample): number =>
    round(((to.ticks - from.ticks) / CLOCK_TICKS / ((to.at - from.at) / 1000)) * 100);
  const tick = (): void => {
    for (const one of watched) {
      const now = sampleProcess(one.pid);
      one.usage.peakCpuPercent = Math.max(one.usage.peakCpuPercent, cpuPercent(one.last, now));
      one.usage.peakRssMiB = Math.max(one.usage.peakRssMiB, round(now.rssKiB / 1024));
      one.usage.endRssMiB = round(now.rssKiB / 1024);
      one.last = now;
    }
  };
  const timer = setInterval(tick, everyMs);
  return {
    stop() {
      clearInterval(timer);
      tick();
      for (const one of watched) one.usage.meanCpuPercent = cpuPercent(one.first, one.last);
      return Object.fromEntries(watched.map((one) => [one.name, one.usage]));
    },
  };
}

// --------------------------------------------------------------- statistics

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentiles(samples: readonly number[]): Record<string, number> {
  if (samples.length === 0) return { count: 0 };
  const sorted = samples.toSorted((a, b) => a - b);
  const at = (p: number): number =>
    round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN);
  return {
    count: sorted.length,
    p50: at(50),
    p95: at(95),
    p99: at(99),
    max: round(sorted.at(-1) ?? NaN),
  };
}

/** Outcomes of tool calls, by tool, with the in-flight peak per organization. */
class CallLedger {
  readonly latencies = new Map<string, number[]>();
  readonly outcomes = new Map<string, number>();
  readonly errorSamples = new Map<string, string>();
  readonly inFlight = new Map<string, number>();
  readonly peakInFlight = new Map<string, number>();
  busyMs = 0;

  begin(organizationId: string): void {
    const now = (this.inFlight.get(organizationId) ?? 0) + 1;
    this.inFlight.set(organizationId, now);
    this.peakInFlight.set(
      organizationId,
      Math.max(this.peakInFlight.get(organizationId) ?? 0, now),
    );
  }

  end(organizationId: string, tool: string, outcome: string, ms: number, text: string): void {
    this.inFlight.set(organizationId, (this.inFlight.get(organizationId) ?? 1) - 1);
    const latencies = this.latencies.get(tool) ?? [];
    latencies.push(ms);
    this.latencies.set(tool, latencies);
    this.outcomes.set(outcome, (this.outcomes.get(outcome) ?? 0) + 1);
    if (outcome !== 'ok' && !this.errorSamples.has(outcome))
      this.errorSamples.set(outcome, text.slice(0, 300));
    this.busyMs += ms;
  }

  count(outcome: string): number {
    return this.outcomes.get(outcome) ?? 0;
  }

  total(): number {
    return [...this.outcomes.values()].reduce((sum, n) => sum + n, 0);
  }

  failures(): number {
    return this.total() - this.count('ok');
  }

  report(seconds: number): Record<string, unknown> {
    const all = [...this.latencies.values()].flat();
    return {
      calls: this.total(),
      ratePerSecond: round(this.total() / seconds),
      outcomes: Object.fromEntries(this.outcomes),
      errorSamples: Object.fromEntries(this.errorSamples),
      latencyMs: {
        all: percentiles(all),
        ...Object.fromEntries([...this.latencies].map(([tool, ms]) => [tool, percentiles(ms)])),
      },
      peakInFlight: Object.fromEntries(this.peakInFlight),
      meanInFlight: round(this.busyMs / (seconds * 1000)),
    };
  }
}

// ----------------------------------------------------------------- the wire

let mcpBase = '';
let beBase = '';

interface TokenAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly retryAfter: string | null;
  readonly ms: number;
}
async function requestToken(
  agent: Agent,
  source: string,
  key: string = agent.key,
): Promise<TokenAnswer> {
  const started = performance.now();
  const response = await fetch(`${mcpBase}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${agent.clientId}:${key}`)}`,
      'x-forwarded-for': source,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: RESOURCE,
      wbs_run: `load-run-${agent.personId}`,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body,
    retryAfter: response.headers.get('retry-after'),
    ms: performance.now() - started,
  };
}

async function issue(agent: Agent, source: string): Promise<Session> {
  const answer = await requestToken(agent, source);
  const token = answer.body['access_token'];
  if (answer.status !== 200 || typeof token !== 'string')
    throw new Error(
      `${agent.personId} got no token: ${String(answer.status)} ${JSON.stringify(answer.body)}`,
    );
  return { ...agent, token };
}

interface CallAnswer {
  readonly status: number;
  /** `ok`, `tool_error:<code>`, `http_<status>`, or `thrown`. */
  readonly outcome: string;
  readonly text: string;
  readonly retryAfter: string | null;
}

function toolOutcome(result: { isError?: boolean; content?: { text?: string }[] }): {
  outcome: string;
  text: string;
} {
  const text = (result.content ?? []).map((part) => part.text ?? '').join('\n');
  if (result.isError !== true) return { outcome: 'ok', text };
  const code =
    /could not be called: ([a-z_]+)/.exec(text)?.[1] ?? /"error":"([a-z_]+)"/.exec(text)?.[1];
  return { outcome: `tool_error:${code ?? 'other'}`, text };
}

function mcpRequest(token: string, body: unknown): Promise<Response> {
  return fetch(`${mcpBase}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

async function callTool(
  ledger: CallLedger,
  session: Session,
  name: string,
  args: Record<string, unknown>,
): Promise<CallAnswer> {
  ledger.begin(session.organizationId);
  const started = performance.now();
  let answer: CallAnswer;
  try {
    const response = await mcpRequest(session.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const text = await response.text();
    const retryAfter = response.headers.get('retry-after');
    if (response.status !== 200)
      answer = {
        status: response.status,
        outcome: `http_${String(response.status)}`,
        text,
        retryAfter,
      };
    else {
      const parsed = JSON.parse(text) as {
        result?: { isError?: boolean; content?: { text?: string }[] };
        error?: unknown;
      };
      answer =
        parsed.result === undefined
          ? { status: 200, outcome: 'jsonrpc_error', text, retryAfter }
          : { status: 200, ...toolOutcome(parsed.result), retryAfter };
    }
  } catch (cause) {
    answer = { status: 0, outcome: 'thrown', text: String(cause), retryAfter: null };
  }
  ledger.end(
    session.organizationId,
    name,
    answer.outcome,
    performance.now() - started,
    answer.text,
  );
  return answer;
}

/** The agent's four calls, in order: claim its leaf, heartbeat, read the claims, release. */
function cycleOf(session: Session): readonly [string, Record<string, unknown>][] {
  return [
    [
      'postApiProjectsByIdCommands',
      {
        id: session.projectId,
        commands: [
          { kind: 'claimWorkItem', workItemId: session.leafId, personId: session.personId },
        ],
      },
    ],
    ['postApiClaimsRenew', {}],
    ['getApiProjectsByIdClaims', { id: session.projectId }],
    [
      'postApiProjectsByIdCommands',
      {
        id: session.projectId,
        commands: [
          { kind: 'releaseWorkItem', workItemId: session.leafId, personId: session.personId },
        ],
      },
    ],
  ];
}

/**
 * Every session runs whole cycles, one call each {@link CALL_INTERVAL_MS} (never catching up a
 * late call), starting staggered across one interval, until `until()` is false at a cycle's end.
 */
async function paceAgents(
  ledger: CallLedger,
  sessions: readonly Session[],
  until: () => boolean,
): Promise<void> {
  await Promise.all(
    sessions.map(async (session, index) => {
      await Bun.sleep((index / sessions.length) * CALL_INTERVAL_MS);
      let next = performance.now();
      do {
        for (const [tool, args] of cycleOf(session)) {
          const wait = next - performance.now();
          if (wait > 0) await Bun.sleep(wait);
          await callTool(ledger, session, tool, args);
          next = Math.max(next + CALL_INTERVAL_MS, performance.now());
        }
      } while (until());
    }),
  );
}

async function setBeDelay(ms: number): Promise<void> {
  const response = await fetch(`${beBase}/__load/delay`, {
    method: 'POST',
    body: JSON.stringify({ ms }),
  });
  if (response.status !== 200) throw new Error(`delay: ${String(response.status)}`);
}

// ------------------------------------------------------------------- phases

async function issuanceBurst(
  orgA: readonly Agent[],
  orgB: readonly Agent[],
  pids: Record<string, number>,
): Promise<{ readonly sessions: Session[]; readonly report: Record<string, unknown> }> {
  const source = '198.51.100.10';
  const watch = watchProcesses(pids, 100);
  const started = performance.now();
  const answers = await Promise.all(orgA.map((agent) => requestToken(agent, source)));
  const wallMs = performance.now() - started;
  // Fewer agents than the burst: the same credentials top the source up to it, so the next
  // request meets the per-source issuance limit whatever --agents was.
  const topUp = await Promise.all(
    Array.from({ length: M10_LIMITS.issuancesPerSource.burst - orgA.length }, (_, index) =>
      requestToken(nth(orgA, index % orgA.length), source),
    ),
  );
  const extra = nth(orgB, 0);
  const over = await requestToken(extra, source);
  const usage = watch.stop();
  const issued = answers.filter((answer) => answer.status === 200).length;
  expect('issuance burst: every agent issued at once from one source', issued === orgA.length, {
    issued,
    of: orgA.length,
  });
  expect(
    'issuance burst: the top-up issued',
    topUp.every((a) => a.status === 200),
    topUp.map((a) => a.status),
  );
  expect(
    'issuance burst: one past the per-source burst is 429 rate_limited with Retry-After',
    over.status === 429 &&
      over.body['error'] === 'invalid_request' &&
      over.body['error_description'] === 'rate_limited' &&
      Number(over.retryAfter) >= 1,
    { status: over.status, body: over.body, retryAfter: over.retryAfter },
  );
  const sessions = answers.map((answer, index) => {
    const token = answer.body['access_token'];
    if (typeof token !== 'string') throw new Error('an agent got no token');
    return { ...nth(orgA, index), token };
  });
  return {
    sessions,
    report: {
      source,
      requests: orgA.length,
      issued,
      wallMs: round(wallMs),
      latencyMs: percentiles(answers.map((a) => a.ms)),
      topUpRequests: topUp.length,
      oneMore: { status: over.status, body: over.body, retryAfter: over.retryAfter },
      usage,
    },
  };
}

async function steadyLoad(
  sessions: readonly Session[],
  pids: Record<string, number>,
): Promise<Record<string, unknown>> {
  const ledger = new CallLedger();
  const watch = watchProcesses(pids, 1_000);
  const started = performance.now();
  const end = started + STEADY_SECONDS * 1000;
  await paceAgents(ledger, sessions, () => performance.now() < end);
  const seconds = (performance.now() - started) / 1000;
  const usage = watch.stop();
  const report = ledger.report(seconds);
  const designRate = (sessions.length * 1000) / CALL_INTERVAL_MS;
  expect('steady: no failed call', ledger.failures() === 0, report['outcomes']);
  expect('steady: at least 95% of the design rate', ledger.total() / seconds >= 0.95 * designRate, {
    achieved: report['ratePerSecond'],
    design: designRate,
  });
  expect(
    'steady: org-a in flight stays under the limit',
    (ledger.peakInFlight.get('org-a') ?? 0) < M10_LIMITS.callsInFlightPerOrganization,
    report['peakInFlight'],
  );
  return {
    agents: sessions.length,
    seconds: round(seconds),
    designRatePerSecond: designRate,
    ...report,
    usage,
  };
}

async function credentialFence(
  sessions: readonly Session[],
  pids: Record<string, number>,
): Promise<Record<string, unknown>> {
  const probe = nth(sessions, 0);
  const others = sessions.slice(1);
  const background = new CallLedger();
  const probeLedger = new CallLedger();
  const watch = watchProcesses(pids, 1_000);
  let running = true;
  const started = performance.now();
  const paced = paceAgents(background, others, () => running);
  await Bun.sleep(3_000);
  const read = ['getApiProjectsByIdClaims', { id: probe.projectId }] as const;
  const burst = await Promise.all(
    Array.from({ length: 40 }, () => callTool(probeLedger, probe, read[0], read[1])),
  );
  const admitted = burst.filter((a) => a.outcome === 'ok').length;
  const limited = burst.filter((a) => a.status === 429);
  expect(
    'credential fence: 40 single calls at once run the burst of 20 (± refill) and answer the rest HTTP 429',
    admitted >= M10_LIMITS.callsPerCredential.burst &&
      admitted <= M10_LIMITS.callsPerCredential.burst + 2 &&
      admitted + limited.length === 40,
    { admitted, limited: limited.length },
  );
  expect(
    'credential fence: each 429 names rate_limited and a Retry-After of at least 1 s',
    limited.every((a) => Number(a.retryAfter) >= 1 && a.text.includes('rate_limited')),
    limited.slice(0, 1).map((a) => ({ retryAfter: a.retryAfter, body: a.text })),
  );
  // A full bucket again (20 at 10 a second), then one batch of 30 messages.
  await Bun.sleep(2_500);
  const batchResponse = await mcpRequest(
    probe.token,
    Array.from({ length: 30 }, (_, index) => ({
      jsonrpc: '2.0',
      id: index + 1,
      method: 'tools/call',
      params: { name: read[0], arguments: read[1] },
    })),
  );
  const batch = (await batchResponse.json()) as {
    result: { isError?: boolean; content?: { text?: string }[] };
  }[];
  const batchOutcomes = batch.map((message) => toolOutcome(message.result));
  const batchAdmitted = batchOutcomes.filter((o) => o.outcome === 'ok').length;
  const batchLimited = batchOutcomes.filter((o) => o.outcome === 'tool_error:rate_limited');
  expect(
    'credential fence: a batch of 30 keeps HTTP 200, runs about 20 and answers the rest rate_limited tool errors',
    batchResponse.status === 200 &&
      batchAdmitted >= M10_LIMITS.callsPerCredential.burst &&
      batchAdmitted <= M10_LIMITS.callsPerCredential.burst + 2 &&
      batchAdmitted + batchLimited.length === 30,
    {
      status: batchResponse.status,
      admitted: batchAdmitted,
      limited: batchLimited.length,
      sample: batchLimited[0]?.text,
    },
  );
  await Bun.sleep(2_000);
  running = false;
  await paced;
  const seconds = (performance.now() - started) / 1000;
  const usage = watch.stop();
  expect(
    'credential fence: the other agents saw no failure',
    background.failures() === 0,
    Object.fromEntries(background.outcomes),
  );
  return {
    probe: probe.personId,
    singleCalls: { sent: 40, admitted, limited: limited.length, sample: limited[0] },
    batch: {
      sent: 30,
      status: batchResponse.status,
      admitted: batchAdmitted,
      limited: batchLimited.length,
      sample: batchLimited[0]?.text,
    },
    background: background.report(seconds),
    usage,
  };
}

async function inFlightFence(
  orgA: readonly Session[],
  orgB: readonly Session[],
  pids: Record<string, number>,
): Promise<Record<string, unknown>> {
  const callers = orgA.slice(0, IN_FLIGHT_CALLERS);
  const perCaller = 10;
  const background = new CallLedger();
  const pushed = new CallLedger();
  const watch = watchProcesses(pids, 1_000);
  await setBeDelay(SLOW_BE_MS);
  let running = true;
  const started = performance.now();
  const paced = paceAgents(background, orgB, () => running);
  await Bun.sleep(2_000);
  const answers = await Promise.all(
    callers.flatMap((session) =>
      Array.from({ length: perCaller }, () =>
        callTool(pushed, session, 'getApiProjectsByIdClaims', { id: session.projectId }),
      ),
    ),
  );
  running = false;
  await paced;
  await setBeDelay(0);
  const seconds = (performance.now() - started) / 1000;
  const usage = watch.stop();
  const admitted = answers.filter((a) => a.outcome === 'ok').length;
  const limited = answers.filter((a) => a.status === 429);
  const sent = callers.length * perCaller;
  expect(
    `in-flight fence: ${String(sent)} org-a calls against a slow be-01 run exactly the limit and answer the rest HTTP 429`,
    admitted === M10_LIMITS.callsInFlightPerOrganization && limited.length === sent - admitted,
    { admitted, limited: limited.length, outcomes: Object.fromEntries(pushed.outcomes) },
  );
  expect(
    'in-flight fence: each 429 asks a 1 s wait',
    limited.every((a) => a.retryAfter === '1'),
    limited.slice(0, 1).map((a) => ({ retryAfter: a.retryAfter, body: a.text })),
  );
  expect(
    'in-flight fence: org-b saw no failure meanwhile',
    background.failures() === 0,
    Object.fromEntries(background.outcomes),
  );
  return {
    beDelayMs: SLOW_BE_MS,
    pushed: {
      sent,
      admitted,
      limited: limited.length,
      sample: limited[0],
      peakInFlight: Object.fromEntries(pushed.peakInFlight),
    },
    orgBBackground: background.report(seconds),
    usage,
  };
}

/** Observed only: 200 org-a calls at once against an undelayed be-01. */
async function undelayedBurst(orgA: readonly Session[]): Promise<Record<string, unknown>> {
  await Bun.sleep(2_500);
  const ledger = new CallLedger();
  const answers = await Promise.all(
    orgA
      .slice(0, 20)
      .flatMap((session) =>
        Array.from({ length: 10 }, () =>
          callTool(ledger, session, 'getApiProjectsByIdClaims', { id: session.projectId }),
        ),
      ),
  );
  return {
    sent: answers.length,
    outcomes: Object.fromEntries(ledger.outcomes),
    latencyMs: percentiles([...ledger.latencies.values()].flat()),
  };
}

async function failureFences(
  orgA: readonly Agent[],
  orgB: readonly Agent[],
): Promise<Record<string, unknown>> {
  const flood = '198.51.100.30';
  const strangers = Array.from({ length: 40 }, () => {
    const id = randomUUID();
    return {
      ...nth(orgA, 0),
      clientId: id,
      key: `wbs_mk_${id}.${randomBytes(32).toString('base64url')}`,
    };
  });
  const floodAnswers: TokenAnswer[] = [];
  for (const stranger of strangers) floodAnswers.push(await requestToken(stranger, flood));
  const refused = floodAnswers.filter((a) => a.status === 401).length;
  const limited = floodAnswers.filter((a) => a.status === 429);
  expect(
    'failure fence: 40 bad secrets from one source, sent one by one, are 30 × 401 then 429',
    refused === M10_LIMITS.failuresPerSource.burst &&
      limited.length === 40 - refused &&
      floodAnswers.slice(0, refused).every((a) => a.status === 401),
    { refused, limited: limited.length, statuses: floodAnswers.map((a) => a.status).join(',') },
  );
  const elsewhere = nth(orgB, 1);
  const unaffected = await requestToken(elsewhere, '198.51.100.31');
  expect(
    'failure fence: a valid client from another source still issues',
    unaffected.status === 200,
    unaffected.status,
  );

  const target = nth(orgA, 1);
  const guesser = '198.51.100.40';
  const guesses: number[] = [];
  for (let n = 0; n < 6; n += 1)
    guesses.push(
      (
        await requestToken(
          target,
          guesser,
          `wbs_mk_${target.clientId}.${randomBytes(32).toString('base64url')}`,
        )
      ).status,
    );
  const holderAtGuesser = await requestToken(target, guesser);
  const holderElsewhere = await requestToken(target, '198.51.100.41');
  expect(
    "failure fence: a credential's wrong secrets from one source are 5 × 401 then 429; its holder elsewhere still issues",
    guesses.join(',') === '401,401,401,401,401,429' && holderElsewhere.status === 200,
    { guesses, holderAtGuesser: holderAtGuesser.status, holderElsewhere: holderElsewhere.status },
  );
  return {
    flood: { source: flood, sent: 40, refused, limited: limited.length, sample: limited[0]?.body },
    unaffectedElsewhere: unaffected.status,
    guesses: {
      source: guesser,
      statuses: guesses,
      holderAtGuesser: holderAtGuesser.status,
      holderElsewhere: holderElsewhere.status,
    },
  };
}

// --------------------------------------------------------------------- main

/**
 * How many lines `log` holds, how many match SQLite contention, and how many are pino's
 * `error` or `fatal` (`@wbs/observability` writes the level as its label).
 */
function scanLog(log: string): {
  readonly lines: number;
  readonly sqliteBusy: number;
  readonly errorLines: number;
} {
  const text = readFileSync(join(runDir, log), 'utf8');
  const count = (pattern: RegExp): number => text.match(pattern)?.length ?? 0;
  return {
    lines: count(/\n/g),
    sqliteBusy: count(/SQLITE_BUSY|database is locked/gi),
    // Proof: matching `"level":"(info|fatal)"` instead made a 20-agent run exit 1 on `no error
    // line in either log`, counting mcp-01's 161 info lines; watched 2026-10-28.
    errorLines: count(/"level":"(error|fatal)"/g),
  };
}

async function run(): Promise<Record<string, unknown>> {
  const beSecret = randomBytes(32).toString('base64url');
  const be = await spawnServer(
    'apps/wbs/be-01/src/testing/mcp-load-backend.ts',
    {
      ...baseEnv(),
      MCP_LOAD_BE_SECRET: beSecret,
      MCP_LOAD_AUTHORIZATION_SERVER: ISSUER,
      MCP_LOAD_AGENTS: String(AGENTS),
      MCP_LOAD_OTHER_AGENTS: String(OTHER_AGENTS),
    },
    'be-01.log',
    beProfileFlags(),
  );
  beBase = `http://127.0.0.1:${String(be.port)}`;
  const storeKey = randomBytes(32);
  const storePath = join(runDir, 'mcp-store.sqlite');
  activatedStore(storePath, storeKey);
  const signing = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const mcp = await spawnServer(
    'apps/wbs/mcp-01/src/load/mcp-01-loopback.ts',
    {
      ...baseEnv(),
      MCP_AUTH_MODE: 'standalone',
      MCP_PUBLIC_URL: PUBLIC_URL,
      WBS_API_URL: beBase,
      MCP_BE_INTERNAL_SECRET: beSecret,
      MCP_TRUSTED_PROXY_HOPS: '1',
      MCP_SIGNING_KEY_CURRENT: signing.privateKey
        .export({ format: 'der', type: 'pkcs8' })
        .toString('base64'),
      MCP_STORE_KEY_CURRENT: storeKey.toString('base64'),
      MCP_STORE_PATH: storePath,
    },
    'mcp-01.log',
  );
  mcpBase = `http://127.0.0.1:${String(mcp.port)}`;
  const pids = { 'be-01': be.process.pid, 'mcp-01': mcp.process.pid, driver: process.pid };

  // The run's own backend wrote this list (`mcp-load-backend.ts` `LoadAgent`); nothing else answers.
  const agents = (await (await fetch(`${beBase}/__load/agents`)).json()) as Agent[];
  const orgA = agents.filter((agent) => agent.organizationId === 'org-a');
  const orgB = agents.filter((agent) => agent.organizationId === 'org-b');

  const burst = await issuanceBurst(orgA, orgB, pids);
  const orgBSessions = await Promise.all(orgB.map((agent) => issue(agent, '198.51.100.20')));
  const steady = await steadyLoad(burst.sessions, pids);
  const credential = await credentialFence(burst.sessions, pids);
  const inFlight = await inFlightFence(burst.sessions, orgBSessions, pids);
  const undelayed = await undelayedBurst(burst.sessions);
  const failures = await failureFences(orgA, orgB);

  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map((child) => child.exited));
  const logs = { 'be-01': scanLog('be-01.log'), 'mcp-01': scanLog('mcp-01.log') };
  expect(
    'no error line in either log',
    logs['be-01'].errorLines + logs['mcp-01'].errorLines === 0,
    logs,
  );
  expect(
    'no SQLite busy or lock error in either log',
    logs['be-01'].sqliteBusy + logs['mcp-01'].sqliteBusy === 0,
    logs,
  );
  return {
    configuration: {
      agents: AGENTS,
      otherOrganizationAgents: OTHER_AGENTS,
      steadySeconds: STEADY_SECONDS,
      callIntervalMs: CALL_INTERVAL_MS,
      trustedProxyHops: 1,
      limits: M10_LIMITS,
      bun: Bun.version,
    },
    issuanceBurst: burst.report,
    steady,
    credentialFence: credential,
    inFlightFence: inFlight,
    undelayedBurst: undelayed,
    failureFences: failures,
    logs,
  };
}

/** The last lines of each log, for a run that threw before its report. */
function printLogTails(): void {
  for (const log of ['be-01.log', 'mcp-01.log']) {
    try {
      const lines = readFileSync(join(runDir, log), 'utf8').trimEnd().split('\n');
      console.error(`--- last lines of ${log}\n${lines.slice(-40).join('\n')}`);
    } catch (cause) {
      console.error(`--- ${log} unreadable: ${String(cause)}`);
    }
  }
}

try {
  const report = await run().catch((cause: unknown) => {
    printLogTails();
    throw cause;
  });
  const failed = expectations.filter((e) => !e.holds);
  console.log(JSON.stringify({ ...report, expectations }, null, 2));
  // Proof: with the in-flight expectation raised to the limit plus one, a 20-agent run exited 1
  // naming it; watched 2026-10-28 (verify.md, slice 11).
  if (failed.length > 0) {
    console.error(
      `M10 load: ${String(failed.length)} expectation(s) did not hold: ${failed.map((e) => e.name).join('; ')}`,
    );
    process.exitCode = 1;
  }
} finally {
  for (const child of children) child.kill('SIGKILL');
  rmSync(runDir, { recursive: true, force: true });
}
