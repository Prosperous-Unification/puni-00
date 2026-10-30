import { rejects } from 'node:assert/strict';
import { existsSync, writeSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  assertRealHostReader,
  type ModelChild,
  type ModelChildProbe,
  ModelPoolFailure,
  type ModelProcess,
  type ModelReader,
  type OwnedModelChild,
  releaseModelReader,
  runModelChild,
  startModelChild,
  withModelFixture,
} from '../fixtures/model-child-custody';
import { PARTICIPANT_OPENER_CASES } from '../fixtures/participant-opener-cases';
import { createProductByteTransportFixture } from '../fixtures/product-byte-transport';
import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';

const MODEL_CHILD_WORK_MS = 1_440_000;
// Frozen measurement: 16 cases took 1111.14s; 60 * ceil((1111.14 + 277.785) / 60) = 1440s.
// This test-only allowance leaves every per-case and product operation deadline unchanged.
const MODEL_PARENT_TEST_MS = MODEL_CHILD_WORK_MS + 60_000;

const MODEL_CASES = [
  'modeled raw IO reaches both role successes, stable binding, and mount refusal',
  'modeled first binding refuses same-byte init executable object replacement',
  'modeled first observation refuses application mount namespace mismatch',
  'modeled first observation refuses init-argv drift',
  'modeled first observation refuses init-cwd drift',
  'modeled admitted init directory is retained and later cwd drift refuses',
  'modeled listener inode owned by init is refused after successful binding',
  'modeled three-process wrapper object replacement cannot rebind',
  'modeled three-process wrapper allowed argv spelling cannot rebind',
  'modeled lost exec reap prevents acceptance and all later effects',
  'modeled retained private supervisor group prevents acceptance and later effects',
  'modeled missing-done refuses privately and blocks later effects',
  'modeled duplicate-done refuses privately and blocks later effects',
  'modeled oversized-receipt refuses privately and blocks later effects',
  'modeled private-stderr refuses privately and blocks later effects',
  'modeled cleanup-failure refuses privately and blocks later effects',
] as const;

const MODEL_SHARDS: readonly (readonly string[])[] = Object.freeze(
  Array.from({ length: 4 }, (_, index) =>
    Object.freeze(MODEL_CASES.slice(index * 4, index * 4 + 4)),
  ),
);

function modelNamePattern(names: readonly string[]): string {
  return `^(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
}

function assertModelShard(child: ModelChild, names: readonly string[]): readonly string[] {
  expect(child.expired).toBe(false);
  expect(child.signal).toBeNull();
  expect(child.settled).toBe(true);
  if (child.exit !== 0 || child.failure !== null)
    throw new Error('modeled product process child failed');
  // Proof: independent pass/fail/filtered guard omissions accepted actual 3-pass, 1-fail,
  // or 22-filtered transcripts; each forged-child control missed its rejection (2026-10-26).
  expect(child.output.match(/^\s*\d+ pass$/gm)?.map((line) => line.trim())).toEqual(['4 pass']);
  expect(child.output.match(/^\s*\d+ fail$/gm)?.map((line) => line.trim())).toEqual(['0 fail']);
  expect(child.output.match(/^\s*\d+ filtered out$/gm)?.map((line) => line.trim())).toEqual([
    '23 filtered out',
  ]);
  // Proof: omitting this guard admitted an actual child transcript with a skip footer;
  // the forged-child control failed with Missing expected rejection (2026-10-26).
  expect(child.output).not.toMatch(/^\s*\d+ (?:skip|todo)\b|^\((?:skip|todo)\)/m);
  const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
    (match) => match[1],
  );
  // Proof: omitting local and aggregate exact rosters admitted actual duplicate-name child output;
  // the forged-coverage control failed with Missing expected rejection (2026-10-26).
  // Proof: omitting ONLY this check while retaining the global check made the direct
  // actual-child validator accept duplicate names; its independent control did not throw.
  expect(passed).toEqual([...names]);
  return passed;
}

async function runModelShards(
  commands: readonly (readonly string[])[],
  deadline: number,
  project: string,
  environment?: NodeJS.ProcessEnv,
  beforeDrain?: (index: number, child: ModelProcess, reader: ModelReader) => Promise<void>,
): Promise<void> {
  if (commands.length !== 4) throw new Error('model shard command roster differs');
  // Proof: refreshing this cutoff before each admission accepted queued late summaries;
  // the shared-cutoff control failed with Missing expected rejection (2026-10-26).
  const cutoff = deadline;
  let next = 0;
  const state = { failed: false };
  const owners: OwnedModelChild[] = [];
  const children: (ModelChild | undefined)[] = [];
  const passed: (readonly string[] | undefined)[] = [];
  const failures: unknown[] = [];
  const refuse = (cause: unknown) => {
    state.failed = true;
    failures.push(cause);
    for (const owner of owners) owner.cancel();
  };
  const worker = async () => {
    try {
      while (!state.failed && next < commands.length) {
        const remaining = cutoff - performance.now();
        // Proof: removing this boundary spawned two actual readers after an expired cutoff;
        // the admission observer expected zero and observed two (2026-10-26).
        if (remaining <= 0) throw new Error('model shard shared deadline expired before admission');
        const index = next++;
        const command = commands[index];
        const names = MODEL_SHARDS[index];
        const owner = startModelChild(
          command,
          cutoff,
          project,
          environment,
          refuse,
          beforeDrain === undefined
            ? undefined
            : (child, reader) => beforeDrain(index, child, reader),
        );
        owners.push(owner);
        const child = await owner.completed;
        children[index] = child;
        if (child.expired) throw new Error('model shard shared deadline expired');
        passed[index] = assertModelShard(child, names);
      }
    } catch (cause) {
      refuse(cause);
    }
  };
  // A worker owns its slot through native exit AND stderr settlement, including cancellation.
  // Proof: four workers admitted four live owned children before the release barrier;
  // the independent active-count control expected two and observed four (2026-10-26).
  await Promise.allSettled(Array.from({ length: 2 }, worker));
  const settlement = await Promise.allSettled(owners.map((owner) => owner.completed));
  const settled = settlement.every((entry) => entry.status === 'fulfilled' && entry.value.settled);
  try {
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      if (child !== undefined) {
        writeSync(2, `model shard ${String(index + 1)}/4 transcript\n`);
        writeSync(2, child.output);
      }
    }
  } catch (cause) {
    // Proof: an actual writeSync(-1) RangeError retained uncertainty with this wrapper;
    // omitting the wrapper made the real unread-child owner control reject its error type.
    throw new ModelPoolFailure('model shard transcript reporting failed', settled, [
      ...failures,
      cause,
    ]);
  }
  if (!settled)
    throw new ModelPoolFailure(
      'model shard exit or stderr settlement unproved; retain fixture ownership',
      false,
      failures,
    );
  if (performance.now() >= cutoff && !state.failed)
    refuse(new Error('model shard shared deadline expired after settlement'));
  if (state.failed)
    throw new ModelPoolFailure('model shard pool failed or deadline expired', true, failures);
  assertModelOrder(passed);
}

function assertModelOrder(passed: readonly (readonly string[] | undefined)[]): void {
  const ordered = MODEL_SHARDS.flatMap((_, index) => {
    const names = passed[index];
    if (names === undefined) throw new Error('model shard verified coverage absent');
    return names;
  });
  // Proof: removing both exact-roster checks admitted duplicate coverage despite valid shard footers;
  // the actual forged-coverage control missed its required rejection (2026-10-26).
  // Proof: omitting ONLY this check admitted duplicate assembly of independently verified
  // actual child rows; the independent aggregate control failed to observe a throw.
  expect(ordered).toEqual([...MODEL_CASES]);
}

function assertCompleteModelSummary(output: string): void {
  expect(output).toMatch(/\b16 pass\b/);
  expect(output).toMatch(/\b0 fail\b/);
  expect(output).toMatch(/\b11 filtered out\b/);
  expect(output).not.toMatch(/^\s*\d+ (?:skip|todo)\b|^\((?:skip|todo)\)/m);
  const passed = [...output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map((match) => match[1]);
  // Proof: replacing one named case with an impostor while retaining a 16/0 footer
  // was accepted when this exact-list check was omitted; the summary negative failed.
  expect(passed).toEqual([...MODEL_CASES]);
}

function assertModelChild(child: Awaited<ReturnType<typeof runModelChild>>): void {
  expect(child.expired).toBe(false);
  expect(child.signal).toBeNull();
  // Proof: model-exit omission accepted nonzero exit with a complete-looking case list; the nonzero child negative missed its rejection.
  if (child.exit !== 0) throw new Error('modeled product process child failed');
  assertCompleteModelSummary(child.output);
}

// Proof: temporarily importing the mock-bearing model into this configured test file made
// the real /proc/self/status sentinel fail with "modeled host proc path unsupported".
test('ordinary collection retains the real host proc reader', async () => {
  await assertRealHostReader();
});

test(
  'modeled product process suite runs in a joined child without contaminating host proc reads',
  async () => {
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createProductByteTransportFixture();
    await withModelFixture(fixture.directory, async () => {
      const deadline = performance.now() + MODEL_CHILD_WORK_MS;
      const commands = MODEL_SHARDS.map((names) => [
        process.execPath,
        'test',
        'test/dependency-product-process-model-child.test.ts',
        '-t',
        modelNamePattern(names),
        '--preload',
        '../test/scratch/preload.ts',
        '--timeout=300000',
      ]);
      await runModelShards(commands, deadline, project, fixture.environment);
    });
    await assertRealHostReader();
  },
  MODEL_PARENT_TEST_MS,
);

test('modeled summary refuses an impostor case despite a valid-looking 16/0 footer', () => {
  const lines = MODEL_CASES.map((name) => `(pass) ${name} [1ms]`);
  lines[0] = '(pass) modeled impostor [1ms]';
  expect(() => {
    assertCompleteModelSummary(`${lines.join('\n')}\n 16 pass\n 11 filtered out\n 0 fail\n`);
  }).toThrow();
});

test('modeled child watchdog kills and joins owned work before a late valid-looking summary', async () => {
  const project = new URL('../..', import.meta.url).pathname;
  const child = await runModelChild(
    [
      process.execPath,
      '-e',
      "setTimeout(() => process.stderr.write('(pass) late model\\n16 pass\\n0 fail\\n'), 100)",
    ],
    20,
    project,
  );
  expect(child.expired).toBe(true);
  expect(child.signal).toBe('SIGKILL');
  expect(child.output).not.toContain('16 pass');
}, 5000);

for (const mode of ['nonzero', 'signal'] as const)
  test(`model child refuses ${mode} despite complete-looking cases`, async () => {
    const output =
      MODEL_CASES.map((name) => `(pass) ${name} [1ms]`).join('\n') +
      '\n16 pass\n11 filtered out\n0 fail\n';
    const source = `process.stderr.write(${JSON.stringify(output)}); ${mode === 'nonzero' ? 'process.exit(9)' : "process.kill(process.pid, 'SIGTERM')"};`;
    const child = await runModelChild(
      [process.execPath, '-e', source],
      1000,
      new URL('../..', import.meta.url).pathname,
    );
    expect(() => {
      assertModelChild(child);
    }).toThrow();
  });

test('model child output refusal joins exact owned child before returning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'product-model-output-'));
  try {
    const path = join(directory, 'pid');
    const source = `await Bun.write(${JSON.stringify(path)}, String(process.pid)); process.stderr.write('X'.repeat(65537)); setTimeout(() => {}, 100);`;
    await rejects(
      runModelChild(
        [process.execPath, '-e', source],
        1000,
        new URL('../..', import.meta.url).pathname,
      ).then((child) => {
        // Unexpected fulfillment necessarily fails the unchanged rejects oracle; preserve the original child.
        process.stderr.write(
          `${JSON.stringify({
            exit: child.exit,
            signal: child.signal,
            expired: child.expired,
            settled: child.settled,
            failure:
              child.failure instanceof Error
                ? { name: child.failure.name, message: child.failure.message }
                : String(child.failure),
            stderr: child.output,
          })}\n`,
        );
        return child;
      }),
      /output bound exceeded/,
    );
    const pid = Number(await readFile(path, 'utf8'));
    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow('No such process');
  } finally {
    await rm(directory, { recursive: true });
  }
});

for (const fault of ['none', 'after-health', 'after-capability'] as const)
  test(`isolated readiness actual HTTP and full observer brackets: ${fault}`, async () => {
    const deadline = performance.now() + 310000;
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createReadinessByteTransportFixture();
    await withModelFixture(fixture.directory, async () => {
      const name = `readiness actual HTTP and full observer brackets: ${fault}`;
      const childWork = Math.min(300000, deadline - performance.now() - 10000);
      if (childWork <= 0) throw new Error('readiness child cleanup reserve unavailable');
      const child = await runModelChild(
        [
          process.execPath,
          'test',
          'test/dependency-product-process-model-child.test.ts',
          '-t',
          `^${name}$`,
          '--preload',
          '../test/scratch/preload.ts',
          '--timeout=300000',
        ],
        childWork,
        project,
        fixture.environment,
      );
      process.stderr.write(child.output);
      expect(child.expired).toBe(false);
      expect(child.signal).toBeNull();
      expect(child.exit).toBe(0);
      expect(child.output).toMatch(/\b1 pass\b/);
      expect(child.output).toMatch(/\b0 fail\b/);
      // Sixteen observer cases, eight barrier cases and the other two readiness cases remain registered.
      expect(child.output).toMatch(/\b26 filtered out\b/);
      const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
        (match) => match[1],
      );
      expect(passed).toEqual([name]);
    });
    await assertRealHostReader();
  }, 310000);

for (const filtered of [10, 12])
  test(`model summary refuses ${String(filtered)} filtered registrations`, () => {
    const lines = MODEL_CASES.map((name) => `(pass) ${name} [1ms]`);
    expect(() => {
      assertCompleteModelSummary(
        `${lines.join('\n')}\n16 pass\n${String(filtered)} filtered out\n0 fail\n`,
      );
    }).toThrow();
  });

for (const fault of [
  'pre-evidence',
  'pre-artifact',
  'pre-stores',
  'post-evidence',
  'post-artifact',
  'post-stores',
  'post-ingress',
  'post-context',
] as const)
  test(`isolated readiness retained state barrier: ${fault}`, async () => {
    const deadline = performance.now() + 310000;
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createReadinessByteTransportFixture();
    await withModelFixture(fixture.directory, async () => {
      const name = `readiness retained state barrier: ${fault}`;
      const childWork = Math.min(300000, deadline - performance.now() - 10000);
      if (childWork <= 0) throw new Error('readiness barrier cleanup reserve unavailable');
      const child = await runModelChild(
        [
          process.execPath,
          'test',
          'test/dependency-product-process-model-child.test.ts',
          '-t',
          `^${name}$`,
          '--preload',
          '../test/scratch/preload.ts',
          '--timeout=300000',
        ],
        childWork,
        project,
        fixture.environment,
      );
      process.stderr.write(child.output);
      expect(child.expired).toBe(false);
      expect(child.signal).toBeNull();
      expect(child.exit).toBe(0);
      expect(child.output).toMatch(/\b1 pass\b/);
      expect(child.output).toMatch(/\b0 fail\b/);
      expect(child.output).toMatch(/\b26 filtered out\b/);
      const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
        (match) => match[1],
      );
      expect(passed).toEqual([name]);
    });
    await assertRealHostReader();
  }, 310000);

test('model child retains exact plain case names under inherited CI colors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'product-model-reporter-'));
  try {
    const path = join(directory, 'reporter.test.ts');
    await Bun.write(
      path,
      "import { expect, test } from 'bun:test'; test('owned model reporter control', () => { expect(1).toBe(1); });\n",
    );
    const child = await runModelChild([process.execPath, 'test', path], 5000, directory, {
      ...process.env,
      FORCE_COLOR: '1',
      GITHUB_ACTIONS: 'true',
    });
    expect(child.expired).toBe(false);
    expect(child.signal).toBeNull();
    expect(child.exit).toBe(0);
    expect(child.output).not.toContain('\u001b');
    const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
      (match) => match[1],
    );
    expect(passed).toEqual(['owned model reporter control']);
    expect(child.output).toMatch(/\b1 pass\b/);
    expect(child.output).toMatch(/\b0 fail\b/);
  } finally {
    await rm(directory, { recursive: true });
  }
}, 10000);

function shardTranscript(names: readonly string[]): string {
  return (
    names.map((name) => `(pass) ${name} [1ms]`).join('\n') + '\n4 pass\n23 filtered out\n0 fail\n'
  );
}

function controlCommands(directory: string, programs: readonly string[] = []): string[][] {
  return MODEL_SHARDS.map((names, index) => {
    const source = `import { existsSync, writeFileSync, readdirSync, appendFileSync, rmSync, writeSync } from 'node:fs';
const directory=${JSON.stringify(directory)}; const index=${String(index)};
writeFileSync(directory+'/started-'+index,String(process.pid));
${programs[index] ?? `writeFileSync(directory+'/live-'+index,''); appendFileSync(directory+'/counts',String(readdirSync(directory).filter(name=>name.startsWith('live-')).length)+'\\n'); while(!existsSync(directory+'/release'))await Bun.sleep(2); await Bun.sleep(15); rmSync(directory+'/live-'+index); writeSync(2,${JSON.stringify(shardTranscript(names))});`}`;
    return [process.execPath, '-e', source];
  });
}

async function awaitControl(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!(await check())) {
    if (performance.now() >= deadline) throw new Error('owned shard control barrier expired');
    await Bun.sleep(2);
  }
}

test('model shard pool limits actual live children and joins all four queued shards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-pool-cap-'));
  const pending = runModelShards(controlCommands(directory), performance.now() + 5000, directory);
  void pending.catch(() => undefined);
  try {
    await awaitControl(
      async () =>
        (await readdir(directory)).filter((name) => name.startsWith('started-')).length >= 2,
    );
    await Bun.sleep(30);
    expect((await readdir(directory)).filter((name) => name.startsWith('started-')).length).toBe(2);
    await Bun.write(join(directory, 'release'), '');
    await pending;
    const counts = (await readFile(join(directory, 'counts'), 'utf8'))
      .trim()
      .split('\n')
      .map(Number);
    expect(Math.max(...counts)).toBe(2);
    expect((await readdir(directory)).filter((name) => name.startsWith('started-')).length).toBe(4);
    expect((await readdir(directory)).filter((name) => name.startsWith('live-'))).toEqual([]);
    for (let index = 0; index < 4; index++) {
      const pid = Number(await readFile(join(directory, `started-${String(index)}`), 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow('No such process');
    }
  } finally {
    await Bun.write(join(directory, 'release'), '');
    await Promise.allSettled([pending]);
    await rm(directory, { recursive: true });
  }
}, 10000);

test('model shard pool gives queued work only the shared cutoff remainder', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-pool-cutoff-'));
  let releaseInitial: () => void = () => {
    throw new Error('initial reader release unavailable');
  };
  const initial = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  let initialExits = 0;
  const deadline = performance.now() + 3000;
  const commands = controlCommands(
    directory,
    MODEL_SHARDS.map(
      (names, index) =>
        `${index < 2 ? '' : "while(!existsSync(directory+'/late-release'))await Bun.sleep(2);"} writeSync(2,${JSON.stringify(shardTranscript(names))});`,
    ),
  );
  const pending = runModelShards(commands, deadline, directory, undefined, async (index, child) => {
    if (index < 2) {
      await child.exited;
      initialExits++;
      await initial;
    }
  });
  // The same pending work is reawaited below and in finally; this only observes early rejection.
  void pending.catch(() => undefined);
  try {
    await awaitControl(() => initialExits === 2);
    // Native exits are observed, but their real readers still own both worker slots.
    await Bun.sleep(Math.max(0, deadline - performance.now() - 1500));
    releaseInitial();
    // Late actors get permission only after the original monotonic work cutoff.
    await Bun.sleep(Math.max(0, deadline - performance.now() + 500));
    await Bun.write(join(directory, 'late-release'), '');
    await rejects(pending, /deadline|expired/);
    let expiredStarts = 0;
    await rejects(
      runModelShards(commands, performance.now() - 1, directory, undefined, () => {
        expiredStarts++;
        return Promise.resolve();
      }),
      /deadline|expired/,
    );
    expect(expiredStarts).toBe(0);
  } finally {
    releaseInitial();
    await Bun.write(join(directory, 'late-release'), '');
    await Promise.allSettled([pending, initial]);
    await rm(directory, { recursive: true });
  }
}, 10000);

test('model shard pool refuses actual forged coverage and unsuccessful children', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-pool-coverage-'));
  try {
    for (const fault of [
      'duplicate',
      'omitted',
      'impostor',
      'order',
      'pass-count',
      'extra-footer',
      'fail-count',
      'filtered',
      'skip',
      'todo',
      'nonzero',
      'signal',
    ] as const) {
      const names: string[] = [...MODEL_SHARDS[0]];
      if (fault === 'duplicate') names[1] = names[0] ?? '';
      if (fault === 'omitted') names.pop();
      if (fault === 'impostor') names[0] = 'modeled impostor';
      if (fault === 'order') names.reverse();
      let output = shardTranscript(names);
      if (fault === 'extra-footer') output += '8 pass\n';
      if (fault === 'fail-count') output = output.replace('0 fail', '1 fail');
      if (fault === 'pass-count') output = output.replace('4 pass', '3 pass');
      if (fault === 'filtered') output = output.replace('23 filtered out', '22 filtered out');
      if (fault === 'skip' || fault === 'todo') output += `1 ${fault}\n`;
      const source = `writeSync(2,${JSON.stringify(output)}); ${fault === 'nonzero' ? 'process.exit(9)' : fault === 'signal' ? "process.kill(process.pid,'SIGTERM')" : ''};`;
      const commands = controlCommands(
        directory,
        MODEL_SHARDS.map((roster, index) =>
          index === 0
            ? source
            : `await Bun.sleep(60); writeSync(2,${JSON.stringify(shardTranscript(roster))});`,
        ),
      );
      await rejects(runModelShards(commands, performance.now() + 5000, directory));
    }
  } finally {
    await rm(directory, { recursive: true });
  }
}, 10000);

test('model shard pool failure retains fixture until actual exit and held stderr continuation settle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-pool-settlement-'));
  let releaseDrain: () => void = () => {
    throw new Error('drain release unavailable');
  };
  const heldDrain = new Promise<void>((resolve) => {
    releaseDrain = resolve;
  });
  let returnDrain: () => void = () => {
    throw new Error('drain return unavailable');
  };
  const returnedDrain = new Promise<void>((resolve) => {
    returnDrain = resolve;
  });
  let isRemoved = false;
  const commands = controlCommands(directory, [
    "while(!existsSync(directory+'/started-1'))await Bun.sleep(2); writeFileSync(directory+'/failed',''); process.exit(9);",
    'setInterval(()=>{},1000);',
    "throw new Error('queued child admitted after failure');",
    "throw new Error('queued child admitted after failure');",
  ]);
  const pending = runModelShards(
    commands,
    performance.now() + 5000,
    directory,
    undefined,
    async (index) => {
      if (index === 1) {
        await Bun.write(join(directory, 'drain-held'), '');
        await heldDrain;
        await Bun.write(join(directory, 'drain-returned'), '');
        returnDrain();
      }
    },
  );
  const observed = pending.finally(async () => {
    // This observer is outside the scheduler and stands in for its caller's fixture removal.
    isRemoved = true;
    expect(await readFile(join(directory, 'drain-returned'), 'utf8')).toBe('');
  });
  // Attach rejection observation while the independent drain barrier is still held.
  const outcome = observed.then(
    () => null,
    (cause: unknown) => cause,
  );
  try {
    await awaitControl(
      () => existsSync(join(directory, 'failed')) && existsSync(join(directory, 'drain-held')),
    );
    await Bun.sleep(30);
    expect(isRemoved).toBe(false);
    expect((await readdir(directory)).filter((name) => name.startsWith('started-')).length).toBe(2);
    releaseDrain();
    expect(await outcome).toBeInstanceOf(Error);
    expect(isRemoved).toBe(true);
    for (const index of [0, 1]) {
      const pid = Number(await readFile(join(directory, `started-${String(index)}`), 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow('No such process');
    }
  } finally {
    releaseDrain();
    await returnedDrain;
    await Promise.allSettled([pending, observed, outcome]);
    await rm(directory, { recursive: true });
  }
}, 10000);

test('model shard validator refuses forged actual names without aggregate masking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-shard-validator-'));
  try {
    const roster = MODEL_SHARDS[0];
    for (const fault of ['duplicate', 'omitted', 'impostor', 'order'] as const) {
      const names: string[] = [...roster];
      if (fault === 'duplicate') names[1] = names[0] ?? '';
      if (fault === 'omitted') names.pop();
      if (fault === 'impostor') names[0] = 'modeled impostor';
      if (fault === 'order') names.reverse();
      const source = `import {writeSync} from 'node:fs'; writeSync(2,${JSON.stringify(shardTranscript(names))});`;
      const child = await runModelChild([process.execPath, '-e', source], 1000, directory);
      // This invokes the same child validator directly; no aggregate check can mask its omission.
      expect(() => assertModelShard(child, roster)).toThrow();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
}, 10000);

test('model aggregate coverage refuses missing duplicate and reordered verified actual shards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-aggregate-coverage-'));
  try {
    const verified: (readonly string[])[] = [];
    for (const roster of MODEL_SHARDS) {
      const source = `import {writeSync} from 'node:fs'; writeSync(2,${JSON.stringify(shardTranscript(roster))});`;
      const child = await runModelChild([process.execPath, '-e', source], 1000, directory);
      verified.push(assertModelShard(child, roster));
    }
    assertModelOrder(verified);
    // Each row came from an independently accepted actual child; only indexed assembly changes.
    expect(() => {
      assertModelOrder([verified[0], verified[0], verified[2], verified[3]]);
    }).toThrow();
    expect(() => {
      assertModelOrder([verified[1], verified[0], verified[2], verified[3]]);
    }).toThrow();
    expect(() => {
      assertModelOrder(verified.slice(0, 3));
    }).toThrow();
  } finally {
    await rm(directory, { recursive: true });
  }
}, 10000);

async function recoverModelFixture(
  directory: string,
  children: readonly ModelProcess[],
): Promise<void> {
  if (children.length === 0) throw new Error('original child ownership absent; fixture retained');
  for (const child of children) child.kill('SIGKILL');
  const terminal = await Promise.allSettled(
    children.map(async (child) => {
      const failures: unknown[] = [];
      const drain = (async () => {
        let reader: ModelReader | undefined;
        try {
          reader = child.stderr.getReader();
          for (;;) {
            const frame = await reader.read();
            if (frame.done) break;
          }
        } catch (cause) {
          failures.push(cause);
          throw cause;
        } finally {
          if (reader !== undefined)
            releaseModelReader(reader, failures, () => {
              child.kill('SIGKILL');
            });
        }
      })();
      const observations = await Promise.allSettled([child.exited, drain]);
      const refusals = observations.flatMap((entry): unknown[] =>
        entry.status === 'rejected' ? [entry.reason] : [],
      );
      if (refusals.length > 0)
        throw new AggregateError(refusals, 'original child exit or EOF recovery refused');
    }),
  );
  const failures = terminal.flatMap((entry): unknown[] =>
    entry.status === 'rejected' ? [entry.reason] : [],
  );
  if (failures.length > 0)
    throw new AggregateError(failures, 'original child recovery incomplete; fixture retained');
  // Removal follows original-handle native exit and a newly acquired original-stream EOF.
  // A broken owner may already have removed it; the control's existence assertion detects that fault.
  if (existsSync(directory)) await rm(directory, { recursive: true });
}

test('model fixture owner retains actual unread child streams until native exit and EOF are recovered', async () => {
  for (const mode of ['single', 'pool'] as const) {
    const fixture = await createReadinessByteTransportFixture();
    const children: ModelProcess[] = [];
    const inspectReader: ModelChildProbe = (child, reader) => {
      children.push(child);
      reader.releaseLock();
      return Promise.resolve();
    };
    try {
      const source = 'setInterval(()=>{},1000);';
      await rejects(
        withModelFixture(fixture.directory, async () => {
          if (mode === 'single') {
            await runModelChild(
              [process.execPath, '-e', source],
              5000,
              fixture.directory,
              fixture.environment,
              inspectReader,
            );
          } else {
            await runModelShards(
              MODEL_SHARDS.map(() => [process.execPath, '-e', source]),
              performance.now() + 5000,
              fixture.directory,
              fixture.environment,
              (_index, child, reader) => inspectReader(child, reader),
            );
          }
        }),
        (cause: unknown) => {
          if (!(cause instanceof ModelPoolFailure)) return false;
          expect(cause.settled).toBe(false);
          if (mode === 'single') expect(cause.cause).toBeInstanceOf(TypeError);
          else expect(cause.cause).toEqual(expect.arrayContaining([expect.any(TypeError)]));
          return true;
        },
      );
      expect(children.length).toBeGreaterThan(0);
      expect(existsSync(fixture.directory)).toBe(true);
    } finally {
      await recoverModelFixture(fixture.directory, children);
    }
  }
}, 10000);

test('isolated backend restart coordinator retains fences through durable ready', async () => {
  const deadline = performance.now() + 310000;
  await assertRealHostReader();
  const project = new URL('../..', import.meta.url).pathname;
  const fixture = await createReadinessByteTransportFixture();
  await withModelFixture(fixture.directory, async () => {
    const name = 'backend restart coordinator retains fences through durable ready';
    const childWork = Math.min(300000, deadline - performance.now() - 10000);
    if (childWork <= 0) throw new Error('coordinator child cleanup reserve unavailable');
    const child = await runModelChild(
      [
        process.execPath,
        'test',
        'test/dependency-participant-restoration-model-child.test.ts',
        '-t',
        `^${name}$`,
        '--preload',
        '../test/scratch/preload.ts',
        '--timeout=300000',
      ],
      childWork,
      project,
      fixture.environment,
    );
    process.stderr.write(child.output);
    expect(child.expired).toBe(false);
    expect(child.signal).toBeNull();
    expect(child.exit).toBe(0);
    expect(child.output).toMatch(/\b1 pass\b/);
    expect(child.output).toMatch(/\b0 fail\b/);
    expect(child.output).toMatch(/\b27 filtered out\b/);
    const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
      (match) => match[1],
    );
    expect(passed).toEqual([name]);
  });
  await assertRealHostReader();
}, 310000);

for (const kind of PARTICIPANT_OPENER_CASES)
  test(`isolated backend coordinator authority boundary: ${kind}`, async () => {
    const deadline = performance.now() + 310000;
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createReadinessByteTransportFixture();
    await withModelFixture(fixture.directory, async () => {
      const name = `backend coordinator authority boundary: ${kind}`;
      const childWork = Math.min(300000, deadline - performance.now() - 10000);
      if (childWork <= 0) throw new Error('opener child cleanup reserve unavailable');
      const child = await runModelChild(
        [
          process.execPath,
          'test',
          'test/dependency-participant-opener-model-child.test.ts',
          '-t',
          `^${name}$`,
          '--preload',
          '../test/scratch/preload.ts',
          '--timeout=300000',
        ],
        childWork,
        project,
        fixture.environment,
      );
      process.stderr.write(child.output);
      expect(child.expired).toBe(false);
      expect(child.signal).toBeNull();
      expect(child.exit).toBe(0);
      expect(child.output).toMatch(/\b1 pass\b/);
      expect(child.output).toMatch(/\b0 fail\b/);
      expect(child.output).toMatch(/\b41 filtered out\b/);
      const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
        (match) => match[1],
      );
      expect(passed).toEqual([name]);
    });
    await assertRealHostReader();
  }, 310000);
