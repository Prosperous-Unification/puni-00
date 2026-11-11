import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

interface Observation {
  completion: 'returned' | 'threw';
  status?: number;
  events: string[];
  failures: string[];
  originalSingle: boolean;
  primaryCause: boolean;
  signalsRestored: boolean;
}
function exercise(mode: string): Observation {
  const root = mkdtempSync(join(tmpdir(), 'resource-command-cleanup-'));
  try {
    const request = join(root, 'request.json');
    writeFileSync(request, '{}');
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        join(import.meta.dir, 'testing/command-cleanup.test.fixture.ts'),
        mode,
        request,
      ],
      {
        cwd: import.meta.dir,
        env: process.env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10000,
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    // The owned child writes only this observation after the actual production call has settled.
    const observation = JSON.parse(child.stdout.toString()) as Observation;
    expect(observation.signalsRestored).toBe(true);
    return observation;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('connection failure closes its already-open ledger and retains the original error', () => {
  const observed = exercise('connect');
  expect(observed).toMatchObject({
    completion: 'threw',
    failures: ['connect failed'],
    originalSingle: true,
  });
  expect(observed.events).toEqual(['ledger open', 'connect', 'ledger close']);
});
test('connection and ledger cleanup failures both survive without inventing a transport', () => {
  const observed = exercise('connect-ledger');
  expect(observed).toMatchObject({
    completion: 'threw',
    failures: ['connect failed', 'ledger close failed'],
    primaryCause: true,
  });
  expect(observed.events).toEqual(['ledger open', 'connect', 'ledger close']);
});
test('watch retains the primary and all guard ledger and transport cleanup errors', () => {
  const observed = exercise('watch-all');
  expect(observed).toMatchObject({
    completion: 'threw',
    failures: [
      'sweep failed',
      'guard stop failed',
      'ledger close failed',
      'transport close failed',
    ],
    primaryCause: true,
  });
  expect(observed.events).toEqual([
    'ledger open',
    'connect',
    'guard open',
    'sweep',
    'guard stop start',
    'guard stop end',
    'ledger close',
    'transport close',
  ]);
});
for (const mode of [
  'watch-single',
  'watch-repeated',
  'watch-stop',
  'init-transport',
  'run-primary',
  'exec-primary',
  'run-undefined',
])
  test(mode + ' preserves a single thrown value by identity', () => {
    const observed = exercise(mode);
    expect(observed.completion).toBe('threw');
    expect(observed.originalSingle).toBe(true);
    expect(observed.events.at(-1)).toBe('transport close');
  });
test('ledger close failure cannot skip required transport close', () => {
  const observed = exercise('init-both-closes');
  expect(observed.failures).toEqual(['ledger close failed', 'transport close failed']);
  expect(observed.primaryCause).toBe(true);
  expect(observed.events.slice(-2)).toEqual(['ledger close', 'transport close']);
});
for (const action of ['run', 'exec']) {
  for (const point of [
    'inspect before',
    'request cleanup',
    'sweep',
    'inspect after',
    'report after',
  ])
    test(action + ' retains its primary when ' + point + ' cleanup fails', () => {
      const observed = exercise(action + '-' + point);
      expect(observed.failures).toEqual(['run failed', point + ' failed']);
      expect(observed.primaryCause).toBe(true);
      expect(observed.events).toContain('sweep');
      expect(observed.events).toContain('inspect after');
      expect(observed.events.slice(-2)).toEqual(['ledger close', 'transport close']);
    });
  test(action + ' attempts independent cleanup and retains every original failure', () => {
    const observed = exercise(action + '-all');
    expect(observed.failures).toEqual([
      'run failed',
      'request cleanup failed',
      'sweep failed',
      'report after failed',
      'ledger close failed',
      'transport close failed',
    ]);
    expect(observed.primaryCause).toBe(true);
    expect(observed.events.slice(-2)).toEqual(['ledger close', 'transport close']);
  });
}
for (const action of ['init', 'watch', 'run', 'exec'])
  test(action + ' retains its healthy status and closes owned capabilities', () => {
    const observed = exercise(action + '-healthy');
    expect(observed).toMatchObject({
      completion: 'returned',
      status: action === 'run' || action === 'exec' ? 23 : 0,
      failures: [],
    });
    expect(observed.events.slice(-2)).toEqual(['ledger close', 'transport close']);
    if (action === 'watch')
      expect(observed.events.indexOf('guard stop end')).toBeLessThan(
        observed.events.indexOf('ledger close'),
      );
  });

test('exec cleans its created use when the creation report fails before payload launch', () => {
  const observed = exercise('exec-creation-report');
  expect(observed).toMatchObject({
    completion: 'threw',
    failures: ['report creation failed'],
    originalSingle: true,
  });
  expect(observed.events).not.toContain('run');
  expect(observed.events).toContain('request cleanup');
  expect(observed.events).toContain('sweep');
  expect(observed.events.slice(-2)).toEqual(['ledger close', 'transport close']);
});

async function signalDuringCleanup(
  stage: 'guard stop' | 'transport close',
  signal: 'SIGINT' | 'SIGTERM',
): Promise<Observation> {
  const root = mkdtempSync(join(tmpdir(), 'resource-command-signal-'));
  const request = join(root, 'request.json');
  writeFileSync(request, '{}');
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      join(import.meta.dir, 'testing/command-cleanup.test.fixture.ts'),
      stage === 'guard stop' ? 'watch-gated-stop' : 'init-gated-transport',
      request,
    ],
    {
      cwd: import.meta.dir,
      env: process.env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const output = new Response(child.stdout).text(),
    errors = new Response(child.stderr).text(),
    exited = child.exited;
  try {
    const deadline = performance.now() + 5000;
    while (!existsSync(join(root, 'entered'))) {
      if (child.exitCode !== null)
        throw new Error('owned child ended before cleanup gate: ' + (await errors));
      if (performance.now() >= deadline) throw new Error('owned child did not enter cleanup gate');
      await Bun.sleep(10);
    }
    // The fixture adds no signal handler; only actual runResources may prevent native default termination.
    child.kill(signal);
    const observation = await Promise.race([
      exited.then((status) => ({ kind: 'ended' as const, status })),
      Bun.sleep(100).then(() => ({ kind: 'pending' as const })),
    ]);
    expect(observation).toEqual({ kind: 'pending' });
    const during: unknown = JSON.parse(readFileSync(join(root, 'events.json'), 'utf8'));
    expect(during).not.toContain(stage === 'guard stop' ? 'guard stop end' : 'transport close end');
    if (stage === 'guard stop') expect(during).not.toContain('ledger close');
    writeFileSync(join(root, 'release'), 'release', { flag: 'wx' });
    expect(await exited, await errors).toBe(0);
    // Only the fully settled owned child emits this observation.
    const complete = JSON.parse(await output) as Observation;
    expect(complete.signalsRestored).toBe(true);
    return complete;
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    } finally {
      await exited;
      await Promise.all([output, errors]);
      rmSync(root, { recursive: true, force: true });
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(
    signal + ' during gated guard stop preserves owned settlement and primary failure',
    async () => {
      const complete = await signalDuringCleanup('guard stop', signal);
      expect(complete).toMatchObject({
        completion: 'threw',
        failures: ['sweep failed'],
        originalSingle: true,
      });
      expect(complete.events.indexOf('guard stop end')).toBeLessThan(
        complete.events.indexOf('ledger close'),
      );
      expect(complete.events.slice(-2)).toEqual(['ledger close', 'transport close']);
    },
    15000,
  );
  test(
    signal + ' during gated transport close preserves owned settlement and healthy status',
    async () => {
      const complete = await signalDuringCleanup('transport close', signal);
      expect(complete).toMatchObject({ completion: 'returned', status: 0, failures: [] });
      expect(complete.events.at(-1)).toBe('transport close end');
    },
    15000,
  );
}
