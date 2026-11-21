import type { GitHubDeliveryFetch } from '@shared/delivery-github';
import { describe, expect, it, spyOn } from 'bun:test';

import { assertDeploymentVerification, type VerificationOutcome } from './provenance';
import { githubVerificationProvider } from './provenance-github';

const revision = 'a'.repeat(40);
const origin = 'https://github.com/Example/Project.git';

function run(patch: Record<string, unknown> = {}) {
  return {
    id: 91,
    run_number: 17,
    workflow_id: 3,
    run_attempt: 2,
    head_sha: revision,
    head_branch: 'main',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'Example/Project' },
    ...patch,
  };
}
function job(patch: Record<string, unknown> = {}) {
  return {
    id: 101,
    run_id: 91,
    run_attempt: 2,
    head_sha: revision,
    name: 'gate',
    status: 'completed',
    conclusion: 'success',
    ...patch,
  };
}
function runs(executions: unknown[] = [run()], count = executions.length) {
  return { total_count: count, workflow_runs: executions };
}
function jobs(
  checks: unknown[] = [job(), job({ id: 102, name: 'pixels' })],
  count = checks.length,
) {
  return { total_count: count, jobs: checks };
}
function script(bodies: unknown[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher: GitHubDeliveryFetch = (url, init) => {
    requests.push({ url, init });
    if (bodies.length === 0) throw new Error('Unexpected extra request');
    const body = bodies.shift();
    if (body instanceof Error) throw body;
    return Promise.resolve(body instanceof Response ? body : Response.json(body));
  };
  return { fetcher, requests };
}
function observation(
  execution = run(),
  checks = jobs([
    job({ run_id: execution.id, head_sha: execution.head_sha }),
    job({ id: 102, name: 'pixels', run_id: execution.id, head_sha: execution.head_sha }),
  ]),
) {
  return script([runs([execution]), execution, checks, execution, runs([execution])]);
}
async function accept(fetcher: GitHubDeliveryFetch) {
  const provider = githubVerificationProvider(origin, revision, fetcher);
  const observed = await provider.observe();
  assertDeploymentVerification(provider.policy, observed);
  return observed;
}

async function expectRefusal(promise: Promise<unknown>, pattern?: RegExp): Promise<void> {
  const failure: unknown = await promise.catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(Error);
  if (pattern !== undefined) {
    if (!(failure instanceof Error)) throw new Error('Expected an Error refusal');
    expect(failure.message).toMatch(pattern);
  }
}

describe('githubVerificationProvider', () => {
  it('normalizes exact source and current attempt through anonymous bounded GETs', async () => {
    const channel = observation();
    const observed = await accept(channel.fetcher);
    expect(observed).toEqual({
      source: {
        repository: 'https://github.com/example/project',
        revision,
        ref: 'refs/heads/main',
      },
      pipeline: '.github/workflows/ci.yml',
      trigger: 'source-update',
      completed: true,
      outcome: 'passed',
      origin: {
        provider: 'github',
        executionId: '91',
        attempt: 2,
        url: 'https://github.com/example/project/actions/runs/91',
      },
      checks: [
        {
          name: 'gate',
          completed: true,
          outcome: 'passed',
          origin: { executionId: '91', attempt: 2, checkId: '101' },
        },
        {
          name: 'pixels',
          completed: true,
          outcome: 'passed',
          origin: { executionId: '91', attempt: 2, checkId: '102' },
        },
      ],
    });
    expect(channel.requests.map(({ url }) => url)).toEqual([
      `https://api.github.com/repos/example/project/actions/workflows/ci.yml/runs?head_sha=${revision}&event=push&branch=main&per_page=100`,
      'https://api.github.com/repos/example/project/actions/runs/91',
      'https://api.github.com/repos/example/project/actions/runs/91/jobs?filter=all&per_page=100&page=1',
      'https://api.github.com/repos/example/project/actions/runs/91',
      `https://api.github.com/repos/example/project/actions/workflows/ci.yml/runs?head_sha=${revision}&event=push&branch=main&per_page=100`,
    ]);
    const signals = new Set(channel.requests.map(({ init }) => init.signal));
    expect(signals.size).toBe(1);
    for (const { init } of channel.requests) {
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('manual');
      expect(init.credentials).toBe('omit');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.headers).toEqual({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      });
    }
  });

  for (const source of [
    origin,
    'https://github.com/Example/Project',
    'git@github.com:Example/Project.git',
    'ssh://git@github.com/Example/Project.git',
  ]) {
    it(`discovers public source ${source}`, async () => {
      const provider = githubVerificationProvider(source, revision, observation().fetcher);
      expect(provider.policy).toEqual({
        source: {
          repository: 'https://github.com/example/project',
          revision,
          ref: 'refs/heads/main',
        },
        pipeline: '.github/workflows/ci.yml',
        checks: ['gate', 'pixels'],
      });
      assertDeploymentVerification(provider.policy, await provider.observe());
    });
  }
  for (const source of [
    'https://secret@github.com/example/project',
    'https://user:secret@github.com/example/project',
    'https://github.com:443/example/project',
    'https://github.com/example/project/',
    'https://github.com/example/project?token=secret',
    'https://github.com/example/project#secret',
    'http://github.com/example/project',
    'https://gitlab.com/example/project',
    'https://github.com/example/../project',
    'https://github.com/example/%70roject',
    'https://github.com/-example/project',
    'https://github.com/example-/project',
    'https://github.com/example//project',
    'https://github.com/example/.',
    'https://github.com/example/..',
    'https://github.com/example/pro ject',
    'https://github.com/example/project\n',
    'git@github.com:example/project.git?x',
    'ssh://user@github.com/example/project.git',
    'ssh://git@github.com:22/example/project.git',
  ]) {
    it(`refuses unsafe origin before requests ${JSON.stringify(source)}`, () => {
      const channel = observation();
      expect(() => githubVerificationProvider(source, revision, channel.fetcher)).toThrow(
        /source origin/i,
      );
      expect(channel.requests).toHaveLength(0);
      try {
        githubVerificationProvider(source, revision, channel.fetcher);
      } catch (failure) {
        expect(String(failure)).not.toContain(source);
        expect(String(failure)).not.toContain('secret');
      }
    });
  }
  for (const sha of [
    '',
    'revision-42',
    'a'.repeat(39),
    'a'.repeat(41),
    'A'.repeat(40),
    `${revision}\n`,
  ]) {
    it(`refuses non-Git revision before requests ${JSON.stringify(sha)}`, () => {
      const channel = observation();
      expect(() => githubVerificationProvider(origin, sha, channel.fetcher)).toThrow(/revision/i);
      expect(channel.requests).toHaveLength(0);
    });
  }

  for (const body of [
    null,
    {},
    { workflow_runs: [] },
    runs([], 1),
    runs([run()], 2),
    runs([run(), run({ run_number: 16 })]),
    runs([run(), run({ id: 92 })]),
    runs([run(), run({ id: 92, run_number: 16, workflow_id: 4 })]),
  ]) {
    it(`refuses incomplete or ambiguous run inventory ${JSON.stringify(body)}`, async () => {
      await expectRefusal(accept(script([body, run(), jobs(), run(), body]).fetcher));
    });
  }
  it('refuses absent executions', async () => {
    await expectRefusal(accept(script([runs([])]).fetcher), /no source execution/);
  });

  for (const field of [
    'id',
    'run_number',
    'workflow_id',
    'run_attempt',
    'head_sha',
    'head_branch',
    'path',
    'event',
    'status',
    'conclusion',
    'repository',
  ]) {
    it(`validates run boundary field ${field}`, async () => {
      const malformed = Object.fromEntries(
        Object.entries(run()).filter(([name]) => name !== field),
      );
      await expectRefusal(
        accept(
          script([runs([malformed]), malformed, jobs(), malformed, runs([malformed])]).fetcher,
        ),
        /malformed records/,
      );
    });
  }
  for (const patch of [
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { run_attempt: 0 },
    { run_number: 1.5 },
    { workflow_id: -1 },
    { workflow_id: Number.MAX_SAFE_INTEGER + 1 },
    { head_sha: 'bad' },
    { repository: { full_name: 'malformed' } },
  ]) {
    it(`refuses malformed run values ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(accept(observation(run(patch)).fetcher));
    });
  }
  for (const patch of [
    { head_sha: 'b'.repeat(40) },
    { repository: { full_name: 'other/project' } },
    { path: '.github/workflows/other.yml' },
    { event: 'pull_request' },
    { event: 'workflow_dispatch' },
    { head_branch: 'other' },
    { head_branch: null },
  ]) {
    it(`never turns observed mismatch into policy ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(accept(observation(run(patch)).fetcher));
    });
  }

  const conclusions: readonly [string | null, VerificationOutcome][] = [
    ['success', 'passed'],
    ['failure', 'failed'],
    ['timed_out', 'failed'],
    ['startup_failure', 'failed'],
    ['action_required', 'failed'],
    ['cancelled', 'cancelled'],
    ['skipped', 'skipped'],
    ['neutral', 'skipped'],
    [null, 'unknown'],
    ['future_outcome', 'unknown'],
  ];
  for (const [conclusion, outcome] of conclusions) {
    it(`maps run conclusion ${String(conclusion)} visibly`, async () => {
      const provider = githubVerificationProvider(
        origin,
        revision,
        observation(run({ conclusion })).fetcher,
      );
      const observed = await provider.observe();
      expect(observed.outcome).toBe(outcome);
      if (outcome !== 'passed')
        expect(() => {
          assertDeploymentVerification(provider.policy, observed);
        }).toThrow();
    });
    it(`maps check conclusion ${String(conclusion)} visibly`, async () => {
      const provider = githubVerificationProvider(
        origin,
        revision,
        observation(run(), jobs([job({ conclusion }), job({ id: 102, name: 'pixels' })])).fetcher,
      );
      const observed = await provider.observe();
      expect(observed.checks[0]?.outcome).toBe(outcome);
      if (outcome !== 'passed')
        expect(() => {
          assertDeploymentVerification(provider.policy, observed);
        }).toThrow();
    });
  }
  for (const status of ['queued', 'in_progress', 'future_status']) {
    it(`refuses incomplete current execution ${status}`, async () => {
      await expectRefusal(accept(observation(run({ status })).fetcher));
    });
    it(`refuses incomplete required check ${status}`, async () => {
      await expectRefusal(
        accept(
          observation(run(), jobs([job({ status }), job({ id: 102, name: 'pixels' })])).fetcher,
        ),
      );
    });
  }
  it('selects greatest run number independent of input order and id', async () => {
    const selected = run({ id: 90 });
    const inventory = runs([run({ id: 99, run_number: 16 }), selected]);
    const channel = script([
      inventory,
      selected,
      jobs([job({ run_id: 90 }), job({ id: 102, run_id: 90, name: 'pixels' })]),
      selected,
      inventory,
    ]);
    expect((await accept(channel.fetcher)).origin.executionId).toBe('90');
  });
  it('never masks a newer failed execution with older green', async () => {
    const selected = run({ conclusion: 'failure' });
    const inventory = runs([selected, run({ id: 90, run_number: 16 })]);
    await expectRefusal(accept(script([inventory, selected, jobs(), selected, inventory]).fetcher));
  });
  it('never masks a newer incomplete attempt with an older green attempt', async () => {
    const current = run({ run_attempt: 3, status: 'in_progress', conclusion: null });
    await expectRefusal(accept(observation(current).fetcher));
  });

  for (const field of ['id', 'run_id', 'run_attempt', 'head_sha', 'name', 'status', 'conclusion']) {
    it(`validates job boundary field ${field}`, async () => {
      const malformed = Object.fromEntries(
        Object.entries(job()).filter(([name]) => name !== field),
      );
      await expectRefusal(
        accept(observation(run(), jobs([malformed])).fetcher),
        /malformed records/,
      );
    });
  }
  for (const patch of [
    { run_id: 90 },
    { head_sha: 'b'.repeat(40) },
    { run_attempt: 3 },
    { run_attempt: 0 },
    { run_attempt: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    it(`refuses job binding or identity ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(
        accept(observation(run(), jobs([job(patch), job({ id: 102, name: 'pixels' })])).fetcher),
      );
    });
  }
  for (const patch of [{ run_id: 90 }, { head_sha: 'b'.repeat(40) }, { run_attempt: 3 }]) {
    it(`refuses unrelated optional job ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(
        accept(
          observation(
            run(),
            jobs([
              job(),
              job({ id: 102, name: 'pixels' }),
              job({ id: 103, name: 'optional', ...patch }),
            ]),
          ).fetcher,
        ),
      );
    });
  }
  it('retains explicit carried-check provenance across a partial retry', async () => {
    const observed = await accept(
      observation(run(), jobs([job({ run_attempt: 1, name: 'pixels' }), job({ id: 102 })])).fetcher,
    );
    expect(observed.checks).toEqual([
      {
        name: 'gate',
        completed: true,
        outcome: 'passed',
        origin: { executionId: '91', attempt: 2, checkId: '102' },
      },
      {
        name: 'pixels',
        completed: true,
        outcome: 'passed',
        origin: { executionId: '91', attempt: 1, checkId: '101' },
      },
    ]);
  });
  for (const patch of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { conclusion: 'skipped' },
    { status: 'in_progress', conclusion: null },
  ]) {
    it(`never reuses older green over newer check ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(
        accept(
          observation(
            run(),
            jobs([
              job({ run_attempt: 1 }),
              job({ id: 102, name: 'pixels', run_attempt: 1 }),
              job({ id: 103, ...patch }),
            ]),
          ).fetcher,
        ),
      );
    });
  }
  it('refuses duplicate latest check names', async () => {
    const provider = githubVerificationProvider(
      origin,
      revision,
      observation(run(), jobs([job(), job({ id: 102 }), job({ id: 103, name: 'pixels' })])).fetcher,
    );
    await expectRefusal(provider.observe());
  });
  it('allows superseded duplicate names from an earlier attempt', async () => {
    await accept(
      observation(
        run(),
        jobs([
          job({ run_attempt: 1 }),
          job({ id: 104, run_attempt: 1 }),
          job({ id: 102 }),
          job({ id: 103, name: 'pixels' }),
        ]),
      ).fetcher,
    );
  });
  it('returns missing policy checks as missing', async () => {
    const provider = githubVerificationProvider(
      origin,
      revision,
      observation(run(), jobs([job(), job({ id: 102, name: 'optional' })])).fetcher,
    );
    const observed = await provider.observe();
    expect(observed.checks.map(({ name }) => name)).toEqual(['gate']);
    expect(() => {
      assertDeploymentVerification(provider.policy, observed);
    }).toThrow();
  });
  it('refuses duplicate job identities', async () => {
    await expectRefusal(accept(observation(run(), jobs([job(), job({ name: 'pixels' })])).fetcher));
  });
  it('reads every job page before acceptance', async () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      job({ id: index + 200, name: `optional-${String(index)}` }),
    );
    const channel = script([runs(), run(), jobs(first, 102), jobs(undefined, 102), run(), runs()]);
    await accept(channel.fetcher);
    expect(channel.requests[3]?.url).toBe(
      'https://api.github.com/repos/example/project/actions/runs/91/jobs?filter=all&per_page=100&page=2',
    );
  });
  it('refuses empty intermediate job pages', async () => {
    await expectRefusal(
      accept(
        script([
          runs(),
          run(),
          jobs([job()], 3),
          jobs([], 3),
          jobs([job({ id: 102, name: 'pixels' }), job({ id: 103, name: 'optional' })], 3),
          run(),
          runs(),
        ]).fetcher,
      ),
    );
  });
  it('refuses changed job page count', async () => {
    await expectRefusal(
      accept(
        script([
          runs(),
          run(),
          jobs([job()], 3),
          jobs([job({ id: 102, name: 'pixels' })], 2),
          run(),
          runs(),
        ]).fetcher,
      ),
    );
  });
  it('refuses jobs exceeding the advertised count', async () => {
    await expectRefusal(
      accept(observation(run(), jobs(undefined, 1)).fetcher),
      /exceeds its count/,
    );
  });
  it('refuses duplicate identities across job pages', async () => {
    await expectRefusal(
      accept(script([runs(), run(), jobs([job()], 2), jobs([job()], 2)]).fetcher),
    );
  });
  it('refuses pagination before exhausting the closing-read budget', async () => {
    const pages = Array.from({ length: 30 }, (_, index) =>
      jobs([job({ id: 200 + index, name: 'optional' })], 31),
    );
    const channel = script([runs(), run(), ...pages]);
    await expectRefusal(accept(channel.fetcher), /closing-read budget/i);
    expect(channel.requests.length).toBeLessThanOrEqual(30);
  });

  for (const patch of [
    { id: 92 },
    { run_attempt: 3 },
    { run_number: 18 },
    { workflow_id: 4 },
    { head_sha: 'b'.repeat(40) },
    { repository: { full_name: 'other/project' } },
    { path: '.github/workflows/other.yml' },
    { event: 'pull_request' },
    { head_branch: 'other' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ]) {
    it(`refuses exact run drift ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(accept(script([runs(), run(), jobs(), run(patch), runs()]).fetcher));
    });
    it(`refuses list/detail disagreement ${JSON.stringify(patch)}`, async () => {
      await expectRefusal(accept(script([runs(), run(patch), jobs(), run(patch), runs()]).fetcher));
    });
  }
  it('refuses initial list drift even when later reads agree', async () => {
    const current = run({ run_attempt: 3 });
    await expectRefusal(
      accept(script([runs(), current, jobs(), current, runs([current])]).fetcher),
    );
  });
  it('refuses a newer execution appearing during the read', async () => {
    await expectRefusal(
      accept(
        script([runs(), run(), jobs(), run(), runs([run(), run({ id: 92, run_number: 18 })])])
          .fetcher,
      ),
    );
  });
  it('refuses latest selection attempt drift', async () => {
    await expectRefusal(
      accept(script([runs(), run(), jobs(), run(), runs([run({ run_attempt: 3 })])]).fetcher),
    );
  });
  for (const body of [
    new Error('offline'),
    new Response(null, { status: 404 }),
    new Response(null, { status: 503 }),
    new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } }),
    new Response('{bad'),
    new Response(null),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('unreadable'));
        },
      }),
    ),
  ]) {
    it(`refuses unavailable or unreadable provider body ${body instanceof Error ? body.message : String(body.status)}`, async () => {
      await expectRefusal(accept(script([body, run(), jobs(), run(), body]).fetcher));
    });
  }
  it('bounds the whole observation with a 30-second cancellation signal', async () => {
    const channel = observation();
    const timeout = spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      expect(milliseconds).toBe(30_000);
      return AbortSignal.abort(new DOMException('Observation timed out', 'TimeoutError'));
    });
    try {
      await expectRefusal(accept(channel.fetcher), /Observation timed out/);
      expect(channel.requests).toHaveLength(0);
    } finally {
      timeout.mockRestore();
    }
  });
  it('refuses followed redirects even with successful JSON', async () => {
    const redirected = Response.json(runs());
    Object.defineProperty(redirected, 'redirected', { value: true });
    await expectRefusal(accept(script([redirected]).fetcher));
  });
  for (const body of [
    null,
    {},
    { total_count: 2 },
    { total_count: -1, jobs: [] },
    { total_count: 1, jobs: [null] },
  ]) {
    it(`refuses malformed jobs response ${JSON.stringify(body)}`, async () => {
      await expectRefusal(accept(script([runs(), run(), body]).fetcher));
    });
  }
});
