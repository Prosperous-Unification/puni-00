import { expect, it } from 'bun:test';

import { run } from './execute';
import { type McpObservationEffects, observeMissingMcpKey } from './lab-mcp-observation';

function failObservation(observation: Promise<string>): Promise<Error> {
  return observation.then(
    () => {
      throw new Error('observation unexpectedly succeeded');
    },
    (cause: unknown) => {
      if (!(cause instanceof Error)) throw new Error('missing observation failure');
      return cause;
    },
  );
}

const firstContainer = `containerd://${'a'.repeat(64)}`;
const secondContainer = `containerd://${'b'.repeat(64)}`;

function missingContainer(containerID: string): string {
  return `rpc error: code = NotFound desc = an error occurred when try to find container "${containerID.slice('containerd://'.length)}": not found`;
}

const required = 'MCP_STORE_KEY_CURRENT is required';
function pod(uid = 'new', exitCode = 1, containerID = firstContainer, deleting = false) {
  return {
    metadata: { name: `mcp-${uid}`, uid, ...(deleting ? { deletionTimestamp: 'now' } : {}) },
    status: {
      containerStatuses: [
        { name: 'sidecar', lastState: { terminated: { exitCode: 0, containerID: 'sidecar' } } },
        { name: 'mcp', lastState: { terminated: { exitCode, containerID } } },
      ],
    },
  };
}
const listed = (...pods: ReturnType<typeof pod>[]) => JSON.stringify({ items: pods });
interface Reply {
  stdout: string;
  stderr: string;
  exitCode: number;
}
const ok = (stdout: string): Reply => ({ stdout, stderr: '', exitCode: 0 });
const unavailable = (stderr: string): Reply => ({ stdout: '', stderr, exitCode: 1 });
function rehearsal(replies: Reply[], repeat?: Reply) {
  let now = 0;
  let restarted = false;
  const calls: { args: readonly string[]; timeout: number }[] = [];
  const effects: McpObservationEffects = {
    apiCommand: ['kubectl'],
    node: 'k3d-puni-f8-lab-server-0',
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    invoke: (args, timeout) => {
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(5000 - now);
      expect(args).toContain(
        args[0] === 'docker'
          ? `--timeout=${String(timeout)}ms`
          : `--request-timeout=${String(timeout)}ms`,
      );
      calls.push({ args, timeout });
      if (args.includes('restart')) {
        restarted = true;
        return Promise.resolve(ok(''));
      }
      const reply = replies.shift() ?? repeat;
      if (reply === undefined) throw new Error('unexpected command');
      return Promise.resolve(reply);
    },
  };
  return {
    observe: () => observeMissingMcpKey(effects, ['secret-material'], 5000),
    calls,
    restarted: () => restarted,
    now: () => now,
  };
}

it('ignores pre-restart and deleting pods and converges after replacement disappearance', async () => {
  const run = rehearsal([
    ok(listed(pod('old', 1, secondContainer))),
    ok(
      listed(
        pod('old', 1, secondContainer),
        pod('deleting', 1, `containerd://${'c'.repeat(64)}`, true),
      ),
    ),
    ok(listed(pod('vanished'))),
    unavailable(missingContainer(firstContainer)),
    ok(listed(pod())),
    ok(required),
    ok(listed(pod())),
  ]);
  expect(await run.observe()).toContain('mcp-new');
  expect(run.restarted()).toBe(true);
  expect(
    run.calls.filter(({ args }) => args.includes('logs')).map(({ args }) => args.at(-1)),
  ).toEqual(['a'.repeat(64), 'a'.repeat(64)]);
});

for (const failure of [
  missingContainer(firstContainer),
  `time="2026-10-23T12:00:00Z" level=fatal msg=${JSON.stringify(missingContainer(firstContainer))}`,
]) {
  it(`bounds lifecycle unavailability: ${failure}`, async () => {
    const replies = [ok(listed(pod('old')))];
    for (let attempt = 0; attempt < 5; attempt++)
      replies.push(ok(listed(pod())), unavailable(failure));
    const run = rehearsal(replies);
    expect((await failObservation(run.observe())).message).toContain('last seen:');
    expect(run.now()).toBe(5000);
  });
}

for (const [exitCode, logs] of [
  [0, required],
  [137, 'OOMKilled secret-material'],
] as const) {
  it(`refuses incomplete termination proof ${String(exitCode)}`, async () => {
    let reads = 0;
    const clock = { now: 0 };
    const failure = await failObservation(
      observeMissingMcpKey(
        {
          apiCommand: ['kubectl'],
          node: 'k3d-puni-f8-lab-server-0',
          now: () => clock.now,
          sleep: (ms) => {
            clock.now += ms;
            return Promise.resolve();
          },
          invoke: (args) => {
            reads++;
            return Promise.resolve(
              ok(
                reads === 1
                  ? listed(pod('old'))
                  : args.includes('logs')
                    ? logs
                    : listed(pod('new', exitCode)),
              ),
            );
          },
        },
        ['secret-material'],
        5000,
      ),
    );
    expect(failure.message).toContain('last seen:');
    expect(reads).toBeGreaterThan(1);
  });
}

it('retries changed terminated container identity after logs', async () => {
  const run = rehearsal([
    ok(listed(pod('old'))),
    ok(listed(pod())),
    ok(required),
    ok(listed(pod('new', 1, secondContainer))),
    ok(listed(pod('new', 1, secondContainer))),
    ok(required),
    ok(listed(pod('new', 1, secondContainer))),
  ]);
  expect(await run.observe()).toContain(secondContainer);
});

for (const reply of [
  unavailable('Error from server (Forbidden): denied secret-material'),
  ok('{bad secret-material'),
  ok('{"items":[{"metadata":{"name":"mcp","uid":"uid"},"status":{"containerStatuses":"broken"}}]}'),
  ok(
    '{"items":[{"metadata":{"name":"mcp","uid":"uid"},"status":{"containerStatuses":[{"name":"mcp","lastState":{"terminated":{"exitCode":"1"}}}]}}]}',
  ),
  ok('{"items":[{}]}'),
]) {
  it(`refuses unmodeled or malformed observation immediately: ${reply.stdout || reply.stderr}`, async () => {
    const run = rehearsal([ok(listed(pod('old'))), reply]);
    const failure = await failObservation(run.observe());
    expect(failure.message).not.toContain('secret-material');
    expect(run.now()).toBe(0);
  });
}

it('redacts the last rejected log on deadline exhaustion', async () => {
  const replies = [ok(listed(pod('old')))];
  for (let attempt = 0; attempt < 5; attempt++)
    replies.push(ok(listed(pod())), ok('OOMKilled secret-material'), ok(listed(pod())));
  const run = rehearsal(replies);
  const failure = await run.observe().then(
    () => {
      throw new Error('observation unexpectedly succeeded');
    },
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('missing observation failure');
  expect(failure.message).toContain('last seen: pod mcp-new');
  expect(failure.message).toContain('[REDACTED]');
  expect(failure.message).not.toContain('secret-material');
});

it('refuses pod-list failures instead of treating them as a log lifecycle race', async () => {
  const run = rehearsal(
    [ok(listed(pod('old')))],
    unavailable('Error from server (NotFound): pods "mcp-new" not found'),
  );
  expect((await failObservation(run.observe())).message).toContain('command failed');
  expect(run.now()).toBe(0);
});

for (const failure of [
  'Error from server (NotFound): pods "mcp-other" not found',
  'Error from server (BadRequest): previous terminated container "mcp" in pod "mcp-other" not found',
  'unable to retrieve container logs for containerd://malformed',
  'unable to retrieve container logs for Forbidden: denied',
  missingContainer(secondContainer),
  'rpc error: code = PermissionDenied desc = denied',
]) {
  it(`refuses unrelated log failures immediately: ${failure}`, async () => {
    const run = rehearsal([ok(listed(pod('old'))), ok(listed(pod())), unavailable(failure)]);
    expect((await failObservation(run.observe())).message).toContain('command failed');
    expect(run.now()).toBe(0);
  });
}

it('spends command time from one deadline including the restart', async () => {
  let now = 0;
  let reads = 0;
  const budgets: number[] = [];
  const observed = await observeMissingMcpKey(
    {
      apiCommand: ['kubectl'],
      node: 'k3d-puni-f8-lab-server-0',
      now: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
      invoke: (args, timeout) => {
        budgets.push(timeout);
        expect(args).toContain(
          args[0] === 'docker'
            ? `--timeout=${String(timeout)}ms`
            : `--request-timeout=${String(timeout)}ms`,
        );
        now += 200;
        reads++;
        return Promise.resolve(
          ok(reads === 1 ? listed(pod('old')) : args.includes('logs') ? required : listed(pod())),
        );
      },
    },
    [],
    5000,
  );
  expect(observed).toContain('mcp-new');
  expect(budgets).toEqual([5000, 4800, 4600, 4400, 4200]);
});

it('refuses a command completing after the observation deadline', async () => {
  let now = 0;
  let calls = 0;
  const failure = await failObservation(
    observeMissingMcpKey(
      {
        apiCommand: ['kubectl'],
        node: 'k3d-puni-f8-lab-server-0',
        now: () => now,
        sleep: () => Promise.resolve(),
        invoke: () => {
          calls++;
          if (calls === 5) now = 5001;
          return Promise.resolve(
            ok(calls === 1 ? listed(pod('old')) : calls === 4 ? required : listed(pod())),
          );
        },
      },
      [],
      5000,
    ),
  );
  expect(failure.message).toContain('last seen:');
  expect(calls).toBe(5);
});

it('reobserves a replacement after the selected runtime container is collected', async () => {
  const run = rehearsal([
    ok(listed(pod('old'))),
    ok(listed(pod())),
    unavailable(missingContainer(firstContainer)),
    ok(listed(pod('new', 1, secondContainer))),
    ok(required),
    ok(listed(pod('new', 1, secondContainer))),
  ]);
  expect(await run.observe()).toContain(secondContainer);
});

it('refuses newer kubelet logs while both API reads remain stale', async () => {
  let now = 0;
  let calls = 0;
  const failure = await failObservation(
    observeMissingMcpKey(
      {
        apiCommand: ['kubectl'],
        node: 'k3d-puni-f8-lab-server-0',
        now: () => now,
        sleep: (ms) => {
          now += ms;
          return Promise.resolve();
        },
        invoke: (args) => {
          calls++;
          // API keeps reporting A's unrelated nonzero exit; kubelet's previous log is B's.
          if (args.includes('logs'))
            return Promise.resolve(
              ok(
                args[0] === 'docker' && args.at(-1) === 'a'.repeat(64)
                  ? 'unrelated failure'
                  : required,
              ),
            );
          return Promise.resolve(ok(listed(pod(calls === 1 ? 'old' : 'new'))));
        },
      },
      [],
      5000,
    ),
  );
  expect(failure.message).toContain('last seen:');
});

it('retains redacted pod evidence when the real subprocess runner times out', async () => {
  let calls = 0;
  const failure = await failObservation(
    observeMissingMcpKey(
      {
        apiCommand: ['kubectl'],
        node: 'k3d-puni-f8-lab-server-0',
        now: Date.now,
        sleep: Bun.sleep,
        invoke: (args, timeout) => {
          calls++;
          if (args.includes('logs'))
            return run(
              [process.execPath, '-e', 'setTimeout(() => {}, 5000)', 'secret-material'],
              null,
              timeout,
            );
          return Promise.resolve(ok(listed(pod(calls === 1 ? 'old' : 'secret-material'))));
        },
      },
      ['secret-material'],
      150,
    ),
  );
  expect(failure.message).toContain('last seen: pods:');
  expect(failure.message).toContain('was killed');
  expect(failure.message).toContain('[REDACTED]');
  expect(failure.message).not.toContain('secret-material');
});

for (const message of ['unexpected transport failure', 'pretend exceeded 150ms and was killed']) {
  it(`preserves an unrelated invocation rejection: ${message}`, async () => {
    const failure = new Error(message);
    const observed = await failObservation(
      observeMissingMcpKey(
        {
          apiCommand: ['kubectl'],
          node: 'k3d-puni-f8-lab-server-0',
          now: Date.now,
          sleep: Bun.sleep,
          invoke: () => Promise.reject(failure),
        },
        [],
        1000,
      ),
    );
    expect(observed).toBe(failure);
  });
}

it('rejects malformed runtime IDs before invoking the node', async () => {
  const run = rehearsal([
    ok(listed(pod('old'))),
    ok(listed(pod('new', 1, 'containerd://malformed'))),
  ]);
  expect((await failObservation(run.observe())).message).toContain('malformed MCP runtime ID');
  expect(run.calls.some(({ args }) => args[0] === 'docker')).toBe(false);
});

it('recovers only the selected runtime ID from wrapped CRI garbage collection diagnostics', async () => {
  const id = 'a'.repeat(64);
  const missing = missingContainer(firstContainer);
  const diagnostic = `E1023 12:00:00.000000 123 remote_runtime.go:430] "ContainerStatus from runtime service failed" err=${JSON.stringify(missing)} containerID=${JSON.stringify(id)}\ntime="2026-10-23T12:00:00Z" level=fatal msg=${JSON.stringify(missing)}`;
  const run = rehearsal([
    ok(listed(pod('old'))),
    ok(listed(pod())),
    unavailable(diagnostic),
    ok(listed(pod())),
    ok(required),
    ok(listed(pod())),
  ]);
  expect(await run.observe()).toContain(firstContainer);
});

it('reads the selected container stderr stream emitted by crictl', async () => {
  const run = rehearsal([
    ok(listed(pod('old'))),
    ok(listed(pod())),
    { stdout: '', stderr: required, exitCode: 0 },
    ok(listed(pod())),
  ]);
  expect(await run.observe()).toContain(required);
});
