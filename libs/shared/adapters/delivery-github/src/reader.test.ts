import { summarizeDeliveryTiming } from '@shared/delivery';
import { describe, expect, spyOn, test } from 'bun:test';

import { createGitHubDeliveryReader, type GitHubDeliveryFetch } from './reader';

const web = 'https://github.com/Prosperous-Unification/puni-00';
const api = 'https://api.github.com/repos/Prosperous-Unification/puni-00';
const revision = 'a'.repeat(40);
const start = '2026-10-23T10:00:00Z';
const end = '2026-10-23T10:00:10Z';
const pull = {
  id: 1,
  number: 688,
  title: 'Delivery',
  state: 'open',
  merged: false,
  head: { sha: revision },
  base: { repo: { full_name: 'Prosperous-Unification/puni-00', private: false } },
};
const check = {
  id: 2,
  name: 'build',
  head_sha: revision,
  status: 'completed',
  conclusion: 'success',
  started_at: start,
  completed_at: end,
  check_suite: { id: 3 },
};
const run = {
  id: 4,
  name: 'CI',
  head_sha: revision,
  check_suite_id: 3,
  run_attempt: 1,
  run_started_at: start,
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: 'Prosperous-Unification/puni-00', private: false },
};
const job = {
  id: 5,
  run_id: 4,
  run_attempt: 1,
  head_sha: revision,
  name: 'build',
  status: 'completed',
  conclusion: 'success',
  started_at: start,
  completed_at: end,
  runner_name: 'runner',
};

const mergedEvent = {
  id: 90,
  event: 'merged',
  url: `${api}/issues/events/90`,
  commit_id: 'c'.repeat(40),
  commit_url: `${api}/commits/${'c'.repeat(40)}`,
};

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const routes: Record<string, unknown> = {
    [`${api}/pulls/688`]: pull,
    [`${api}/issues/688/events?per_page=100&page=1`]: [mergedEvent],
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: {
      total_count: 1,
      check_runs: [check],
    },
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [run],
    },
    [`${api}/actions/runs/4/attempts/1`]: run,
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: { total_count: 1, jobs: [job] },
    ...overrides,
  };
  const fetcher: GitHubDeliveryFetch = (url, init) => {
    calls.push({ url, init });
    if (!(url in routes)) throw new Error(`Unexpected request ${url}`);
    const payload = routes[url];
    return Promise.resolve(payload instanceof Response ? payload : Response.json(payload));
  };
  return {
    calls,
    routes,
    fetcher,
    reader: createGitHubDeliveryReader({
      fetcher,
      clock: () => Date.parse('2026-10-23T11:00:00Z'),
    }),
  };
}

describe('public GitHub delivery reader', () => {
  test('reads attributed jobs through fixed anonymous GETs and pins the revision twice', async () => {
    const { reader, calls } = fixture();
    const reading = await reader.read(`${web}/pull/688`);
    expect(reading.kind).toBe('observed');
    if (reading.kind !== 'observed') throw new Error('Expected observation');
    expect(reading.observation.change.state).toBe('open');
    expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs).toMatchObject({
      state: 'known',
      milliseconds: 10000,
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${api}/pulls/688`,
      `${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`,
      `${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`,
      `${api}/actions/runs/4/attempts/1`,
      `${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`,
      `${api}/pulls/688`,
    ]);
    for (const call of calls) {
      expect(call.init.method).toBe('GET');
      expect(call.init.redirect).toBe('manual');
      expect(new Headers(call.init.headers).get('authorization')).toBeNull();
      expect(new Headers(call.init.headers).get('X-GitHub-Api-Version')).toBe('2026-03-10');
    }
  });
  test.each([
    'http://github.com/a/b/pull/1',
    'https://github.com.evil/a/b/pull/1',
    'https://user@github.com/a/b/pull/1',
    'https://github.com/a/b/issues/1',
    'https://github.com/a/b/pull/1?x=y',
    'https://github.com/a/b/pull/9007199254740993',
  ])('unsupported URL causes no traffic: %s', async (url) => {
    const { reader, calls } = fixture();
    expect((await reader.read(url)).kind).toBe('unsupported');
    expect(calls).toHaveLength(0);
  });
  test.each([
    [404, 'missing'],
    [403, 'inaccessible'],
    [429, 'rate-limited'],
    [500, 'provider-unavailable'],
    [302, 'invalid-response'],
  ] as const)('models HTTP %s', async (status, reason) => {
    const { reader, calls } = fixture({
      [`${api}/pulls/688`]: new Response(null, {
        status,
        headers: { location: 'https://evil.test' },
      }),
    });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({ kind: 'unavailable', reason });
    expect(calls).toHaveLength(1);
  });
  test('rejects malformed provider records instead of empty success', async () => {
    const { reader } = fixture({ [`${api}/pulls/688`]: {} });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({
      kind: 'unavailable',
      reason: 'invalid-response',
    });
  });
});

test.each([
  ['PR number', `${api}/pulls/688`, { ...pull, number: 689 }],
  [
    'PR repository',
    `${api}/pulls/688`,
    { ...pull, base: { repo: { full_name: 'other/repo', private: false } } },
  ],
  [
    'private repository',
    `${api}/pulls/688`,
    { ...pull, base: { repo: { full_name: 'Prosperous-Unification/puni-00', private: true } } },
  ],
  [
    'check head',
    `${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`,
    { total_count: 1, check_runs: [{ ...check, head_sha: 'b'.repeat(40) }] },
  ],
  [
    'run head',
    `${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`,
    { total_count: 1, workflow_runs: [{ ...run, head_sha: 'b'.repeat(40) }] },
  ],
  [
    'run repository',
    `${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`,
    {
      total_count: 1,
      workflow_runs: [{ ...run, repository: { full_name: 'other/repo', private: false } }],
    },
  ],
  ['attempt identity', `${api}/actions/runs/4/attempts/1`, { ...run, id: 44 }],
  ['attempt ordinal', `${api}/actions/runs/4/attempts/1`, { ...run, run_attempt: 2 }],
  ['attempt suite', `${api}/actions/runs/4/attempts/1`, { ...run, check_suite_id: 33 }],
  [
    'job run',
    `${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`,
    { total_count: 1, jobs: [{ ...job, run_id: 44 }] },
  ],
  [
    'job attempt',
    `${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`,
    { total_count: 1, jobs: [{ ...job, run_attempt: 2 }] },
  ],
  [
    'job head',
    `${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`,
    { total_count: 1, jobs: [{ ...job, head_sha: 'b'.repeat(40) }] },
  ],
  [
    'negative duration',
    `${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`,
    { total_count: 1, jobs: [{ ...job, completed_at: '2026-10-23T09:59:59Z' }] },
  ],
  ['unsafe identity', `${api}/pulls/688`, { ...pull, id: Number.MAX_SAFE_INTEGER + 1 }],
  ['malformed list', `${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`, {}],
] as const)('rejects wrong %s association or malformed records', async (_name, path, payload) => {
  const { reader } = fixture({ [path]: payload });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('re-reading the PR rejects a changed head and identity', async () => {
  const base = fixture();
  let pulls = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: async (url, init) =>
      url === `${api}/pulls/688` && ++pulls === 2
        ? Response.json({ ...pull, head: { sha: 'b'.repeat(40) } })
        : base.fetcher(url, init),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'revision-changed',
  });
});

test.each([
  ['closed', false, 'closed'],
  ['closed', true, 'merged'],
] as const)('preserves %s merged=%s change state', async (state, merged, wanted) => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: {
      ...pull,
      state,
      merged,
      merge_commit_sha: merged ? 'c'.repeat(40) : 'd'.repeat(40),
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  expect(reading.kind).toBe('observed');
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.change.state).toBe(wanted);
  expect(reading.observation.change.mergedRevision).toBe(merged ? 'c'.repeat(40) : null);
});

test('empty checks retain empty inventory without implying success', async () => {
  const { reader } = fixture({
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: {
      total_count: 0,
      check_runs: [],
    },
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 0,
      workflow_runs: [],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.checks).toEqual([]);
  expect(reading.observation.coverage.notes.join(' ')).toContain('merge policy');
});

test('unmatched external suites remain visible with partial execution coverage', async () => {
  const { reader } = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 0,
      workflow_runs: [],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.checks).toHaveLength(1);
  expect(reading.observation.coverage.runs).toBe('partial');
  expect(reading.observation.coverage.notes.join(' ')).toContain('execution inventory');
});

test('caller cancellation settles even an uncooperative provider', async () => {
  const controller = new AbortController();
  const reader = createGitHubDeliveryReader({
    fetcher: async () =>
      new Promise<Response>(() => {
        /* Deliberately uncooperative transport. */
      }),
  });
  const reading = reader.read(`${web}/pull/688`, controller.signal);
  controller.abort();
  expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  await reading.catch(() => undefined);
});

test('network failure is unavailable', async () => {
  const reader = createGitHubDeliveryReader({
    fetcher: () => Promise.reject(new TypeError('network')),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'provider-unavailable',
  });
});

test('bounds the complete read deadline', async () => {
  const base = fixture();
  let now = Date.parse(start);
  const reader = createGitHubDeliveryReader({
    clock: () => now,
    fetcher: async (url, init) => {
      const response = await base.fetcher(url, init);
      now += 30001;
      return response;
    },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'timeout',
  });
});

test('bounds streamed bytes without trusting content-length', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
          controller.close();
        },
      }),
    ),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'budget-exceeded',
  });
});

test('rejects malformed JSON and absent bodies', async () => {
  for (const response of [new Response('{'), new Response(null)]) {
    const { reader } = fixture({ [`${api}/pulls/688`]: response });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({
      kind: 'unavailable',
      reason: 'invalid-response',
    });
  }
});

test('skipped inverted intervals stay not-performed with unknown timing', async () => {
  const { reader } = fixture({
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: {
      total_count: 1,
      jobs: [{ ...job, conclusion: 'skipped', completed_at: '2026-10-23T09:00:00Z' }],
    },
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: {
      total_count: 1,
      check_runs: [{ ...check, conclusion: 'skipped', completed_at: '2026-10-23T09:00:00Z' }],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.runs[0]?.attempts[0]?.executions[0]).toMatchObject({
    kind: 'not-performed',
    startedAt: null,
    completedAt: null,
  });
  expect(reading.observation.checks[0]?.startedAt).toBeNull();
  expect(reading.observation.coverage.notes.join(' ')).toContain('Skipped');
});

test('captured PR688 three-attempt partial rerun counts 240s performed and 305s span', async () => {
  const sample = (await Bun.file(new URL('./fixtures/pr688.json', import.meta.url)).json()) as {
    pull: typeof pull;
    checks: unknown;
    attempts: (typeof run)[];
    jobs: unknown[];
    events: unknown;
  };
  const sha = sample.pull.head.sha;
  const latest = sample.attempts[2];
  const routes: Record<string, unknown> = {
    [`${api}/pulls/688`]: sample.pull,
    [`${api}/issues/688/events?per_page=100&page=1`]: sample.events,
    [`${api}/commits/${sha}/check-runs?filter=latest&per_page=100&page=1`]: sample.checks,
    [`${api}/actions/runs?head_sha=${sha}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [latest],
    },
  };
  for (const [index, attempt] of sample.attempts.entries()) {
    routes[`${api}/actions/runs/${String(attempt.id)}/attempts/${String(index + 1)}`] = attempt;
    routes[
      `${api}/actions/runs/${String(attempt.id)}/attempts/${String(index + 1)}/jobs?per_page=100&page=1`
    ] = sample.jobs[index];
  }
  const { reader } = fixture(routes);
  const reading = await reader.read(`${web}/pull/688`);
  expect(reading.kind).toBe('observed');
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  const timing = summarizeDeliveryTiming(reading.observation);
  expect(timing.sumExecutionMs.milliseconds).toBe(240000);
  expect(timing.elapsedMs.milliseconds).toBe(305000);
  expect(
    reading.observation.runs[0]?.attempts.map(
      (attempt) => attempt.executions.filter((execution) => execution.kind === 'performed').length,
    ),
  ).toEqual([5, 1, 1]);
  expect(
    reading.observation.runs[0]?.attempts.map(
      (attempt) => attempt.executions.filter((execution) => execution.kind === 'carried').length,
    ),
  ).toEqual([0, 4, 4]);
  expect(reading.observation.coverage.runs).toBe('partial');
  expect(
    reading.observation.runs[0]?.attempts[1]?.executions.find(
      (execution) => execution.name === 'gate_mode',
    )?.executionId,
  ).toBe('Prosperous-Unification/puni-00:run:39973519519:job:120482080243');
});

function rerunFixture(ambiguous = false) {
  return fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [{ ...run, run_attempt: 2 }],
    },
    [`${api}/actions/runs/4/attempts/2`]: {
      ...run,
      run_attempt: 2,
      run_started_at: '2026-10-23T10:01:00Z',
    },
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: {
      total_count: ambiguous ? 2 : 1,
      jobs: ambiguous ? [job, { ...job, id: 6 }] : [job],
    },
    [`${api}/actions/runs/4/attempts/2/jobs?per_page=100&page=1`]: {
      total_count: 1,
      jobs: [{ ...job, id: 7, run_attempt: 2 }],
    },
  });
}

test('unique copied execution resolves original identity without counting twice', async () => {
  const { reader } = rerunFixture();
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs).toMatchObject({
    state: 'known',
    milliseconds: 10000,
  });
  expect(reading.observation.runs[0]?.attempts[1]?.executions[0]).toMatchObject({
    kind: 'carried',
    executionId: 'Prosperous-Unification/puni-00:run:4:job:5',
  });
});

test('ambiguous copied execution stays unknown and makes inventory partial', async () => {
  const { reader } = rerunFixture(true);
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs).toMatchObject({
    state: 'partial',
    milliseconds: 20000,
  });
  expect(reading.observation.runs[0]?.attempts[1]).toMatchObject({
    executionsComplete: false,
    executions: [{ kind: 'unknown', executionId: null }],
  });
});

test('missing execution timing remains unknown rather than zero', async () => {
  const { reader } = fixture({
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: {
      total_count: 1,
      jobs: [{ ...job, started_at: null, completed_at: null, status: 'queued', conclusion: null }],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs).toMatchObject({
    state: 'unknown',
    milliseconds: null,
  });
  expect(reading.observation.runs[0]?.attempts[0]).toMatchObject({
    executionsComplete: false,
    executions: [{ kind: 'unknown', executionId: null }],
  });
});

test('parallel jobs sum work separately from elapsed time', async () => {
  const { reader } = fixture({
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: {
      total_count: 2,
      jobs: [job, { ...job, id: 6, name: 'lint' }],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  const timing = summarizeDeliveryTiming(reading.observation);
  expect(timing.sumExecutionMs.milliseconds).toBe(20000);
  expect(timing.elapsedMs.milliseconds).toBe(10000);
});

test('five-page check scan is partial and never follows hostile Link destinations', async () => {
  const base = fixture();
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/check-runs?')) {
        pages++;
        return Promise.resolve(
          Response.json(
            {
              total_count: 501,
              check_runs: Array.from({ length: 100 }, (_unused, index) => ({
                ...check,
                id: 1000 * pages + index,
              })),
            },
            { headers: { Link: '<https://evil.test/steal>; rel="next"' } },
          ),
        );
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(pages).toBe(5);
  expect(reading.observation.checks).toHaveLength(500);
  expect(reading.observation.coverage.checks).toBe('partial');
});

test.each([
  [
    'oversized page',
    {
      total_count: 101,
      check_runs: Array.from({ length: 101 }, (_unused, index) => ({ ...check, id: index + 1 })),
    },
  ],
  ['duplicate identity', { total_count: 2, check_runs: [check, check] }],
  ['impossible count', { total_count: 0, check_runs: [check] }],
  ['missing records', { total_count: 1, check_runs: [] }],
] as const)('rejects collection %s', async (_name, payload) => {
  const { reader } = fixture({
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: payload,
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('attempt truncation keeps chronological history and explicit partial total', async () => {
  const base = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [{ ...run, run_attempt: 11 }],
    },
  });
  let attempts = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      const match = /\/attempts\/(\d+)(\/jobs\?per_page=100&page=1)?$/.exec(url);
      if (match) {
        const ordinal = Number(match[1]);
        if (match[2]) return Promise.resolve(Response.json({ total_count: 0, jobs: [] }));
        attempts++;
        return Promise.resolve(Response.json({ ...run, run_attempt: ordinal }));
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(attempts).toBe(10);
  expect(reading.observation.runs[0]?.attemptsComplete).toBe(false);
  expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs.state).toBe('unknown');
});

/** Answers every attempt and jobs page of the requested runs, counting GETs. */
function attemptHistory(
  base: ReturnType<typeof fixture>,
  suiteOf: (runId: number) => number,
  jobsPage: (runId: number, ordinal: number, page: number) => unknown,
) {
  let requests = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      requests++;
      const match = /\/runs\/(\d+)\/attempts\/(\d+)(\/jobs\?per_page=100&page=(\d+))?$/.exec(url);
      if (match) {
        const runId = Number(match[1]);
        const ordinal = Number(match[2]);
        return Promise.resolve(
          Response.json(
            match[3]
              ? jobsPage(runId, ordinal, Number(match[4]))
              : { ...run, id: runId, check_suite_id: suiteOf(runId), run_attempt: ordinal },
          ),
        );
      }
      return base.fetcher(url, init);
    },
  });
  return { reader, requests: () => requests };
}

test('five suites of three attempts stop at the request budget', async () => {
  const suites = [3, 13, 23, 33, 43];
  const base = fixture({
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: {
      total_count: 5,
      check_runs: suites.map((suite, index) => ({
        ...check,
        id: 100 + index,
        check_suite: { id: suite },
      })),
    },
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 5,
      workflow_runs: suites.map((suite, index) => ({
        ...run,
        id: 200 + index,
        check_suite_id: suite,
        run_attempt: 3,
      })),
    },
  });
  // Unbounded, this read needs 34 GETs: the PR, checks, runs, 15 attempt pairs and the re-read.
  const history = attemptHistory(
    base,
    (runId) => suites[runId - 200] ?? 0,
    () => ({ total_count: 0, jobs: [] }),
  );
  const reading = await history.reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error(`Expected observed, got ${reading.kind}`);
  expect(history.requests()).toBe(32);
  expect(reading.observation.checks).toHaveLength(5);
  expect(reading.observation.runs).toHaveLength(5);
  expect(reading.observation.runs.flatMap((entry) => entry.attempts)).toHaveLength(14);
  expect(reading.observation.runs.map((entry) => entry.attemptsComplete)).toEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
  expect(reading.observation.coverage.runs).toBe('partial');
  expect(reading.observation.coverage.notes).toContain(
    'Attempt inventory stopped at the 32-request read budget; unread attempts are unavailable.',
  );
});

test('truncated job pages stop at the request budget', async () => {
  const base = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [{ ...run, run_attempt: 6 }],
    },
  });
  const history = attemptHistory(
    base,
    () => 3,
    (runId, ordinal, page) => ({
      total_count: 501,
      jobs: Array.from({ length: 100 }, (_unused, index) => ({
        ...job,
        id: ordinal * 100_000 + page * 1000 + index,
        run_id: runId,
        run_attempt: ordinal,
      })),
    }),
  );
  const reading = await history.reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error(`Expected observed, got ${reading.kind}`);
  expect(history.requests()).toBe(32);
  const attempts = reading.observation.runs[0]?.attempts ?? [];
  expect(attempts.map((attempt) => attempt.executions.length)).toEqual([500, 500, 500, 500, 300]);
  expect(attempts.every((attempt) => !attempt.executionsComplete)).toBe(true);
  expect(reading.observation.runs[0]?.attemptsComplete).toBe(false);
});

test('already cancelled reads preserve AbortError and make zero requests', async () => {
  const { reader, calls } = fixture();
  const controller = new AbortController();
  controller.abort('custom reason');
  const reading = reader.read(`${web}/pull/688`, controller.signal);
  expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  await reading.catch(() => undefined);
  expect(calls).toHaveLength(0);
});

test('invalid trusted clock throws rather than publishing an unavailable reading', async () => {
  const { fetcher } = fixture();
  const reading = createGitHubDeliveryReader({ fetcher, clock: () => NaN }).read(`${web}/pull/688`);
  expect(reading).rejects.toThrow('clock');
  await reading.catch(() => undefined);
});

test('malformed merged state cannot claim a merged observation', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: { ...pull, state: 'open', merged: true, merge_commit_sha: revision },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('attempt chronology and private run responses are rejected', async () => {
  const base = rerunFixture();
  base.routes[`${api}/actions/runs/4/attempts/2`] = {
    ...run,
    run_attempt: 2,
    run_started_at: '2026-10-23T09:00:00Z',
  };
  expect(await base.reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  const privateRun = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [{ ...run, repository: { ...run.repository, private: true } }],
    },
  });
  expect(await privateRun.reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('changing collection counts cannot silently complete a scan', async () => {
  const base = fixture();
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/check-runs?')) {
        pages++;
        return Promise.resolve(
          Response.json({
            total_count: pages === 1 ? 2 : 3,
            check_runs: [{ ...check, id: pages }],
          }),
        );
      }
      return base.fetcher(url, init);
    },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  expect(pages).toBe(2);
});

test('eleven matching workflows are capped to ten with partial inventory', async () => {
  const base = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 11,
      workflow_runs: Array.from({ length: 11 }, (_unused, index) => ({ ...run, id: index + 10 })),
    },
  });
  let attempts = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      const match = /\/runs\/(\d+)\/attempts\/1(\/jobs\?per_page=100&page=1)?$/.exec(url);
      if (match) {
        if (match[2]) return Promise.resolve(Response.json({ total_count: 0, jobs: [] }));
        attempts++;
        return Promise.resolve(Response.json({ ...run, id: Number(match[1]) }));
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.runs).toHaveLength(10);
  expect(attempts).toBe(10);
  expect(reading.observation.coverage.runs).toBe('partial');
});

test('total body budget bounds many individually valid responses', async () => {
  const base = fixture();
  const reader = createGitHubDeliveryReader({
    fetcher: async (url, init) => {
      const response = await base.fetcher(url, init);
      const payload: unknown = await response.json();
      return Response.json({
        ...(payload as Record<string, unknown>),
        padding: 'x'.repeat(1800000),
      });
    },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'budget-exceeded',
  });
});

test('rate-limit headers distinguish public quota refusal from access refusal', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: new Response(null, {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
    }),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'rate-limited',
  });
});

test('whole-read timer bounds an uncooperative fetch without a clock advance', async () => {
  const nativeTimer = globalThis.setTimeout;
  const acceleratedTimer = Object.assign(
    (callback: (...arguments_: unknown[]) => void, delay?: number, ...arguments_: unknown[]) =>
      nativeTimer(callback, delay === 30000 ? 0 : delay, ...arguments_),
    { __promisify__: nativeTimer.__promisify__ },
  );
  // The production reader uses function callbacks; the spy boundary also inherits Node and DOM overloads.
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(
    acceleratedTimer as typeof setTimeout,
  );
  try {
    const reader = createGitHubDeliveryReader({
      fetcher: () =>
        new Promise<Response>(() => {
          /* Deliberately ignores cancellation. */
        }),
    });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({
      kind: 'unavailable',
      reason: 'timeout',
    });
  } finally {
    timer.mockRestore();
  }
});

test('unreadable body cannot become empty successful observation', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('stream failed'));
        },
      }),
    ),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'provider-unavailable',
  });
});

test('already-followed redirects are refused even when the status is 200', async () => {
  const response = Response.json(pull);
  Object.defineProperty(response, 'redirected', { value: true });
  const { reader, calls } = fixture({ [`${api}/pulls/688`]: response });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  expect(calls).toHaveLength(1);
});

test('partial checks force partial associated execution inventory', async () => {
  const base = fixture();
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/check-runs?')) {
        pages++;
        return Promise.resolve(
          Response.json({
            total_count: 501,
            check_runs: Array.from({ length: 100 }, (_unused, index) => ({
              ...check,
              id: 1000 * pages + index,
            })),
          }),
        );
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.coverage.runs).toBe('partial');
});

test('source links are generated from pinned public identities', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: { ...pull, html_url: 'javascript:alert(1)' },
    [`${api}/actions/runs/4/attempts/1/jobs?per_page=100&page=1`]: {
      total_count: 1,
      jobs: [{ ...job, html_url: 'https://evil.test' }],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.change.source.url).toBe(`${web}/pull/688`);
  expect(reading.observation.runs[0]?.attempts[0]?.executions[0]?.source.url).toBe(
    `${web}/actions/runs/4/job/5`,
  );
});

test('stale check rejection prevents execution inventory reads', async () => {
  const { reader, calls } = fixture({
    [`${api}/commits/${revision}/check-runs?filter=latest&per_page=100&page=1`]: {
      total_count: 1,
      check_runs: [{ ...check, head_sha: 'b'.repeat(40) }],
    },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  expect(calls).toHaveLength(3);
});

test('unassociated workflow suites never acquire execution history', async () => {
  const { reader, calls } = fixture({
    [`${api}/actions/runs?head_sha=${revision}&per_page=100&page=1`]: {
      total_count: 1,
      workflow_runs: [{ ...run, check_suite_id: 33 }],
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.runs).toEqual([]);
  expect(reading.observation.coverage.runs).toBe('partial');
  expect(calls).toHaveLength(4);
});

test('schema rejection stops before dependent reads', async () => {
  const { reader, calls } = fixture({ [`${api}/pulls/688`]: { ...pull, title: 42 } });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  expect(calls).toHaveLength(1);
});

test('caller cancellation settles before provider completion', async () => {
  const base = fixture();
  const controller = new AbortController();
  const reader = createGitHubDeliveryReader({
    fetcher: async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return base.fetcher(url, init);
    },
  });
  const reading = reader.read(`${web}/pull/688`, controller.signal).then(
    () => 'observed',
    (failure: unknown) => (failure instanceof Error ? failure.name : 'unexpected'),
  );
  controller.abort();
  expect(
    await Promise.race([
      reading,
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve('did-not-cancel');
        }, 10),
      ),
    ]),
  ).toBe('AbortError');
  await reading;
});

test('unexpected internal failures rethrow instead of becoming provider unavailability', async () => {
  const { fetcher } = fixture();
  let reads = 0;
  const reader = createGitHubDeliveryReader({
    fetcher,
    clock: () => {
      if (++reads === 3) throw new Error('Trusted clock failed');
      return Date.parse(start);
    },
  });
  const reading = reader.read(`${web}/pull/688`);
  expect(reading).rejects.toThrow('Trusted clock failed');
  await reading.catch(() => undefined);
});

test('malformed revision is refused before constructing provider paths', async () => {
  const { reader, calls } = fixture({
    [`${api}/pulls/688`]: { ...pull, head: { sha: '../other' } },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
  expect(calls).toHaveLength(1);
});

test('truncated job inventory propagates partial performed totals', async () => {
  const base = fixture();
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/jobs?')) {
        pages++;
        return Promise.resolve(
          Response.json({
            total_count: 501,
            jobs: Array.from({ length: 100 }, (_unused, index) => ({
              ...job,
              id: 1000 * pages + index,
            })),
          }),
        );
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(pages).toBe(5);
  expect(reading.observation.runs[0]?.attempts[0]?.executionsComplete).toBe(false);
  expect(summarizeDeliveryTiming(reading.observation).sumExecutionMs).toMatchObject({
    state: 'partial',
    milliseconds: 5000000,
  });
});

test('failed reads abort outstanding provider response work', async () => {
  const { reader, calls } = fixture({
    [`${api}/pulls/688`]: new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'budget-exceeded',
  });
  expect(calls[0]?.init.signal?.aborted).toBe(true);
});

test('pinned API merged PR omits legacy merge field and resolves its issue merge event', async () => {
  const pinned = { ...pull, state: 'closed', merged: true };
  const mergedEvent = {
    id: 90,
    event: 'merged',
    url: `${api}/issues/events/90`,
    commit_id: 'c'.repeat(40),
    commit_url: `${api}/commits/${'c'.repeat(40)}`,
  };
  const { reader, calls } = fixture({
    [`${api}/pulls/688`]: pinned,
    [`${api}/issues/688/events?per_page=100&page=1`]: [mergedEvent],
  });
  const reading = await reader.read(`${web}/pull/688`);
  expect(reading.kind).toBe('observed');
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.change.mergedRevision).toBe('c'.repeat(40));
  expect(
    calls.filter((call) => call.url.includes('/issues/688/events')).map((call) => call.url),
  ).toEqual([`${api}/issues/688/events?per_page=100&page=1`]);
});

test('truncated original history cannot establish unique copied execution attribution', async () => {
  const base = rerunFixture();
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/attempts/1/jobs?')) {
        pages++;
        return Promise.resolve(
          Response.json({
            total_count: 501,
            jobs: Array.from({ length: 100 }, (_unused, index) => ({
              ...job,
              id: 1000 * pages + index,
              name:
                pages === 1 && index === 0 ? 'build' : `other-${String(pages)}-${String(index)}`,
            })),
          }),
        );
      }
      return base.fetcher(url, init);
    },
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.runs[0]?.attempts[1]).toMatchObject({
    executionsComplete: false,
    executions: [{ kind: 'unknown', executionId: null }],
  });
});

test('unexpected observation validator dependency faults reject the production reader', async () => {
  const script = `
 import {mock} from 'bun:test';
 const shared=await import(${JSON.stringify(new URL('../../../domain/delivery/src/index.ts', import.meta.url).pathname)});
 mock.module('@shared/delivery',()=>({...shared,validateDeliveryObservation(){throw new TypeError('Validator dependency defect')}}));
 const {createGitHubDeliveryReader}=await import(${JSON.stringify(new URL('./reader.ts', import.meta.url).pathname)});
 const reader=createGitHubDeliveryReader({fetcher:(url)=>Promise.resolve(Response.json(url.includes('/pulls/')?${JSON.stringify(pull)}:url.includes('/check-runs?')?{total_count:0,check_runs:[]}:{total_count:0,workflow_runs:[]}))});
 try {await reader.read(${JSON.stringify(`${web}/pull/688`)});throw new Error('Validator fault was swallowed')}catch(failure){if(!(failure instanceof TypeError)||failure.message!=='Validator dependency defect')throw failure}
 console.log('validator fault propagated');
 `;
  const child = Bun.spawn([process.execPath, '--eval', script], {
    cwd: new URL('../../../../../', import.meta.url).pathname,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ exit, stderr }).toEqual({ exit: 0, stderr: '' });
  expect(stdout).toContain('validator fault propagated');
});

test.each([
  [
    'foreign event repository',
    { ...mergedEvent, url: 'https://api.github.com/repos/other/repo/issues/events/90' },
  ],
  ['wrong event identity', { ...mergedEvent, url: `${api}/issues/events/91` }],
  [
    'foreign merge commit',
    {
      ...mergedEvent,
      commit_url: `https://api.github.com/repos/other/repo/commits/${'c'.repeat(40)}`,
    },
  ],
  ['different merge commit', { ...mergedEvent, commit_url: `${api}/commits/${'d'.repeat(40)}` }],
  ['missing merge commit', { ...mergedEvent, commit_id: null, commit_url: `${api}/commits/null` }],
  ['malformed merge commit', { ...mergedEvent, commit_id: 'invalid' }],
] as const)(
  'refuses %s event association without following supplied URLs',
  async (_name, event) => {
    const { reader, calls } = fixture({
      [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true },
      [`${api}/issues/688/events?per_page=100&page=1`]: [event],
    });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({
      kind: 'unavailable',
      reason: 'invalid-response',
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${api}/pulls/688`,
      `${api}/issues/688/events?per_page=100&page=1`,
    ]);
  },
);

test.each([
  ['missing', []],
  ['ambiguous', [mergedEvent, { ...mergedEvent, id: 91, url: `${api}/issues/events/91` }]],
] as const)(
  'refuses %s merged revision before reading execution history',
  async (_name, events) => {
    const { reader, calls } = fixture({
      [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true },
      [`${api}/issues/688/events?per_page=100&page=1`]: events,
    });
    expect(await reader.read(`${web}/pull/688`)).toMatchObject({
      kind: 'unavailable',
      reason: 'invalid-response',
    });
    expect(calls).toHaveLength(2);
  },
);

function issueEvent(id: number) {
  return {
    id,
    event: 'closed',
    url: `${api}/issues/events/${String(id)}`,
    commit_id: null,
    commit_url: null,
  };
}

test('rejects duplicate issue event identities before attributing the merge', async () => {
  const event = issueEvent(101);
  const { reader } = fixture({
    [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true },
    [`${api}/issues/688/events?per_page=100&page=1`]: [event, event, mergedEvent],
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('rejects oversized issue event pages', async () => {
  const { reader } = fixture({
    [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true },
    [`${api}/issues/688/events?per_page=100&page=1`]: [
      mergedEvent,
      ...Array.from({ length: 100 }, (_unused, index) => issueEvent(index + 101)),
    ],
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'invalid-response',
  });
});

test('bounded-out issue events never establish a unique merged revision', async () => {
  const base = fixture({ [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true } });
  let pages = 0;
  const reader = createGitHubDeliveryReader({
    fetcher: (url, init) => {
      if (url.includes('/issues/688/events?')) {
        pages++;
        return Promise.resolve(
          Response.json(
            Array.from({ length: 100 }, (_unused, index) =>
              pages === 1 && index === 0 ? mergedEvent : issueEvent(pages * 1000 + index),
            ),
          ),
        );
      }
      return base.fetcher(url, init);
    },
  });
  expect(await reader.read(`${web}/pull/688`)).toMatchObject({
    kind: 'unavailable',
    reason: 'budget-exceeded',
  });
  expect(pages).toBe(5);
});

test('merge event pagination preserves canonical provenance', async () => {
  const { reader, calls } = fixture({
    [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: true },
    [`${api}/issues/688/events?per_page=100&page=1`]: Array.from(
      { length: 100 },
      (_unused, index) => issueEvent(index + 101),
    ),
    [`${api}/issues/688/events?per_page=100&page=2`]: [mergedEvent],
  });
  const reading = await reader.read(`${web}/pull/688`);
  if (reading.kind !== 'observed') throw new Error('Expected observed');
  expect(reading.observation.change.mergedRevision).toBe('c'.repeat(40));
  expect(reading.observation.coverage.notes).toContain(
    `Merged revision attributed to GitHub issue event 90: ${api}/issues/events/90`,
  );
  expect(calls.filter((call) => call.url.includes('/events?')).map((call) => call.url)).toEqual([
    `${api}/issues/688/events?per_page=100&page=1`,
    `${api}/issues/688/events?per_page=100&page=2`,
  ]);
});

test('ordinary closed changes do not request merge events', async () => {
  const { reader, calls } = fixture({
    [`${api}/pulls/688`]: { ...pull, state: 'closed', merged: false },
  });
  expect((await reader.read(`${web}/pull/688`)).kind).toBe('observed');
  expect(calls.some((call) => call.url.includes('/events?'))).toBe(false);
});
