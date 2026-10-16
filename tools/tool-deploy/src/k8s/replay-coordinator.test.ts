import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { executeRelease, ReleaseFailedError } from './execute';
import { CrashSignal, FakeCluster, memoryJournal } from './fake-cluster';
import { fileJournal, parseJournal } from './journal';
import { type ReleaseIdentity, releaseIdOf, type ReleaseRequest } from './release';
import { buildReplayInventoryCommand } from './replay-capability';
import type { ReplayCount } from './replay-receipt';

interface CorruptReceipt {
  target: string;
  attempt: string;
  direction: string;
  inventory: unknown;
  candidate: { image: string; capabilities: unknown };
  previous: { image: string; capabilities: unknown };
  bytes: string;
  sha256: string;
}
interface CorruptProgress {
  state: { replayForward?: CorruptReceipt; replayRollback: CorruptReceipt | null };
}
async function rejectedError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected rejection');
    },
    (error: unknown) => error,
  );
}
async function rejectedMessage(promise: Promise<unknown>): Promise<string> {
  const error = await rejectedError(promise);
  return error instanceof Error ? error.message : String(error);
}

const old: ReleaseIdentity = {
  sourceSha: 'a'.repeat(40),
  images: {
    backend: `be@sha256:${'1'.repeat(64)}`,
    gateway: `gw@sha256:${'1'.repeat(64)}`,
    frontend: `fe@sha256:${'1'.repeat(64)}`,
    mcp: `mcp@sha256:${'1'.repeat(64)}`,
  },
};
const incoming: ReleaseIdentity = {
  sourceSha: 'b'.repeat(40),
  images: {
    backend: `be@sha256:${'2'.repeat(64)}`,
    gateway: `gw@sha256:${'2'.repeat(64)}`,
    frontend: `fe@sha256:${'2'.repeat(64)}`,
    mcp: `mcp@sha256:${'2'.repeat(64)}`,
  },
};
const request: ReleaseRequest = {
  environment: 'local',
  cluster: { uid: 'uid-lab', context: 'lab' },
  namespaces: { app: 'wbs', backend: 'wbs-solver' },
  release: incoming,
  expectedCurrent: old,
  admission: { package: 'pkg', activation: 'act' },
  flux: null,
  recovers: null,
};
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'replay-coordinator-'));
  roots.push(root);
  const path = join(root, 'journal.sqlite');
  const db = new Database(path);
  db.run(
    'CREATE TABLE __drizzle_migrations (name TEXT); CREATE TABLE command_journal (payload TEXT, inverse TEXT, preconditions TEXT)',
  );
  db.query('INSERT INTO command_journal VALUES (?, ?, ?)').run(
    JSON.stringify({ forward: { do: 'patch' } }),
    JSON.stringify({
      do: 'batch',
      steps: [
        { do: 'batch', steps: [{ do: 'move', expectedProgress: [] }, { do: 'replace_blockage' }] },
      ],
    }),
    JSON.stringify({ moveProgress: {} }),
  );
  db.close();
  const fake = new FakeCluster(old, [], 'revision');
  fake.migrationsByImage.set(old.images.backend, []);
  fake.migrationsByImage.set(incoming.images.backend, []);
  const vocabularies = new Map([
    [old.images.backend, ['replace_blockage', 'move_progress_v1']],
    [incoming.images.backend, ['replace_blockage', 'move_progress_v1']],
  ]);
  fake.observeReplayInventory = () => {
    expect(fake.writesOpen).toBe(false);
    expect(fake.backendReplicas).toBe(0);
    expect(fake.lease).not.toBeNull();
    const child = Bun.spawnSync({
      cmd: [...buildReplayInventoryCommand()],
      env: { ...process.env, DB_PATH: path },
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return Promise.resolve(JSON.parse(child.stdout.toString()) as readonly ReplayCount[]);
  };
  fake.observeReplayCapabilities = (_attempt: string, image: string) => {
    const capabilities = vocabularies.get(image);
    if (capabilities === undefined) throw new Error('image absent');
    return Promise.resolve({ image, capabilities });
  };
  const journal = memoryJournal();
  const options = {
    clock: fake.clock,
    heartbeatMs: 3_600_000,
    sleep: (ms: number) => {
      fake.now += ms;
      return Promise.resolve();
    },
  };
  const run = () => executeRelease(request, journal, fake, () => undefined, options);
  return { fake, journal, vocabularies, run, path };
}

it('durably checks nested inverse and precondition replay history before capture', async () => {
  const { fake, journal, run } = fixture();
  const capture = fake.capture.bind(fake);
  fake.capture = (identity, image) => {
    expect(journal.read()?.state.phase).toBe('replay-checked');
    expect(journal.read()?.state.replayForward?.inventory).toEqual([
      { kind: 'replace_blockage', count: 1 },
      { kind: 'move_progress_v1', count: 1 },
    ]);
    return capture(identity, image);
  };
  expect((await run()).phase).toBe('lease-released');
});

for (const image of [old.images.backend, incoming.images.backend]) {
  for (const kind of ['replace_blockage', 'move_progress_v1']) {
    it(`refuses ${kind} history unsupported by ${image} before capture`, async () => {
      const { fake, vocabularies, run } = fixture();
      vocabularies.set(
        image,
        ['replace_blockage', 'move_progress_v1'].filter((entry) => entry !== kind),
      );
      expect(await rejectedMessage(run())).toContain(kind);
      expect(fake.migrationJobRuns).toBe(0);
      expect(fake.calls).not.toContain('capture');
      if (image === old.images.backend) {
        expect(fake.calls).not.toContain('rolloutTiers');
        expect(fake.writesOpen).toBe(false);
        expect(fake.lease?.parked).toBe('rollback-failed');
      }
    });
  }
}

it('records rollback replay evidence before restoring tiers and reopening writes', async () => {
  const { fake, journal, run } = fixture();
  fake.faults.set('migrate', new Error('migration failed'));
  const rollout = fake.rolloutTiers.bind(fake);
  fake.rolloutTiers = (identity) => {
    expect(journal.read()?.state.phase).toBe('rollback-replay-checked');
    expect(journal.read()?.state.replayRollback?.previous.image).toBe(old.images.backend);
    return rollout(identity);
  };
  expect(await rejectedError(run())).toBeInstanceOf(ReleaseFailedError);
  expect(journal.read()?.state.phase).toBe('rolled-back');
  expect(fake.writesOpen).toBe(true);
});

it('refuses changed fenced inventory before rollback rollout or reopen', async () => {
  const { fake, journal, path, run } = fixture();
  fake.migrate = () => {
    const db = new Database(path);
    db.run('DELETE FROM command_journal');
    db.close();
    return Promise.reject(new Error('unexpected history change'));
  };
  expect(await rejectedMessage(run())).toContain('replay inventory changed');
  expect(fake.calls).not.toContain('rolloutTiers');
  expect(fake.writesOpen).toBe(false);
  expect(journal.read()?.state.phase).toBe('rollback-failed');
});

for (const fault of [
  'missing',
  'null',
  'changed',
  'changed-bytes',
  'malformed',
  'foreign',
] as const) {
  it(`refuses ${fault} replay progress on resume before cluster mutation`, async () => {
    const { fake, journal, run } = fixture();
    journal.crashAfter = 'replay-checked';
    expect(await rejectedError(run())).toBeInstanceOf(CrashSignal);
    const stored = JSON.parse(journal.stored ?? 'null') as CorruptProgress;
    if (fault === 'missing') delete stored.state.replayForward;
    if (fault === 'null') stored.state.replayForward = null as never;
    if (fault === 'changed-bytes')
      stored.state.replayForward!.bytes = ` ${stored.state.replayForward!.bytes}`;
    if (fault === 'changed') stored.state.replayForward!.inventory = [];
    if (fault === 'malformed') stored.state.replayForward!.bytes = '{';
    if (fault === 'foreign') stored.state.replayForward!.previous.image = incoming.images.backend;
    journal.stored = JSON.stringify(stored);
    fake.calls.length = 0;
    const before = journal.stored;
    expect(await rejectedMessage(run())).toMatch(/replay/);
    expect(fake.calls).toEqual([]);
    expect(journal.stored).toBe(before);
    expect(() => parseJournal('/state/release.json', before)).toThrow(/replay/);
  });
}

it('refuses malformed inventory output and bounds abort without reopening', async () => {
  const { fake, journal, run } = fixture();
  let reads = 0;
  fake.observeReplayInventory = () => {
    reads++;
    return Promise.resolve([{ kind: 'move_progress_v1', count: -1 }]);
  };
  expect(await rejectedMessage(run())).toMatch(/replay inventory/);
  expect(reads).toBe(2);
  expect(journal.read()?.state.phase).toBe('rollback-failed');
  expect(fake.writesOpen).toBe(false);
  expect(fake.calls).not.toContain('capture');
});

it('crashes after the durable receipt and resumes through guarded rollback', async () => {
  const { fake, journal, run } = fixture();
  journal.crashAfter = 'replay-checked';
  expect(await rejectedError(run())).toBeInstanceOf(CrashSignal);
  fake.now += 30_000;
  expect(await rejectedError(run())).toBeInstanceOf(ReleaseFailedError);
  expect(journal.read()?.state.phase).toBe('rolled-back');
  expect(journal.read()?.state.replayRollback).not.toBeNull();
  expect(fake.writesOpen).toBe(true);
});

for (const direction of ['inverse', 'precondition'] as const) {
  it(`refuses ${direction}-only guarded moves with empty snapshots before capture`, async () => {
    const { fake, vocabularies, path, run } = fixture();
    const db = new Database(path);
    db.run('DELETE FROM command_journal');
    db.query('INSERT INTO command_journal VALUES (?, ?, ?)').run(
      JSON.stringify({ forward: { do: 'patch' } }),
      JSON.stringify(
        direction === 'inverse'
          ? { do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] }
          : { do: 'patch' },
      ),
      JSON.stringify(direction === 'precondition' ? { moveProgress: {} } : {}),
    );
    db.close();
    vocabularies.set(incoming.images.backend, ['replace_blockage']);
    expect(await rejectedMessage(run())).toContain('move_progress_v1');
    expect(fake.calls).not.toContain('capture');
  });
}

for (const field of [
  'target',
  'attempt',
  'direction',
  'inventory',
  'candidate',
  'previous',
] as const) {
  it(`refuses a resealed invalid ${field} receipt before resume effects`, async () => {
    const { fake, journal, run } = fixture();
    journal.crashAfter = 'replay-checked';
    expect(await rejectedError(run())).toBeInstanceOf(CrashSignal);
    const stored = JSON.parse(journal.stored ?? 'null') as CorruptProgress;
    const receipt = stored.state.replayForward!;
    const payload = JSON.parse(receipt.bytes) as Omit<CorruptReceipt, 'bytes' | 'sha256'>;
    if (field === 'inventory') payload.inventory = [{ kind: 'future_kind', count: 1 }];
    else if (field === 'candidate' || field === 'previous')
      payload[field].capabilities = ['replace_blockage'];
    else payload[field] = 'foreign';
    const bytes = JSON.stringify(payload);
    const { createHash } = await import('node:crypto');
    stored.state.replayForward = {
      ...payload,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    journal.stored = JSON.stringify(stored);
    fake.calls.length = 0;
    expect(await rejectedMessage(run())).toMatch(/replay/);
    expect(fake.calls).toEqual([]);
  });
}

for (const capabilities of [null, ['move_progress_v1', 'move_progress_v1'], [3], ['']] as const) {
  it(`refuses malformed image capability output ${JSON.stringify(capabilities)}`, async () => {
    const { fake, journal, run } = fixture();
    // Boundary: intentionally invalid external transport output tests coordinator validation.
    fake.observeReplayCapabilities = (_attempt, image) =>
      Promise.resolve({ image, capabilities } as never);
    expect(await rejectedMessage(run())).toMatch(/replay capability/);
    expect(journal.read()?.state.phase).toBe('rollback-failed');
    expect(fake.calls).not.toContain('capture');
    expect(fake.writesOpen).toBe(false);
  });
}

it('refuses capability observations from a different exact image', async () => {
  const { fake, journal, run } = fixture();
  fake.observeReplayCapabilities = () =>
    Promise.resolve({
      image: old.images.backend,
      capabilities: ['replace_blockage', 'move_progress_v1'],
    });
  expect(await rejectedMessage(run())).toContain('another image');
  expect(journal.read()?.state.phase).toBe('rollback-failed');
  expect(fake.calls).not.toContain('capture');
});

it('allows a new attempt after an abort before the write fence was attempted', async () => {
  const { fake, journal, run } = fixture();
  fake.faults.set('admitBackendImages', new Error('admission failure'));
  expect(await rejectedMessage(run())).toContain('admission failure');
  expect(journal.read()?.state.phase).toBe('rolled-back');
  expect((await run()).phase).toBe('lease-released');
});

for (const inventory of [
  null,
  {},
  [{ kind: 'move_progress_v1', count: 0 }],
  [{ kind: 'move_progress_v1', count: 1.5 }],
  [{ kind: 'future_kind', count: 1 }],
  [
    { kind: 'move_progress_v1', count: 1 },
    { kind: 'move_progress_v1', count: 1 },
  ],
]) {
  it(`refuses invalid inventory transport ${JSON.stringify(inventory)}`, async () => {
    const { fake, run } = fixture();
    // Boundary: inject invalid external Job logs at the effects boundary.
    fake.observeReplayInventory = () => Promise.resolve(inventory as never);
    expect(await rejectedMessage(run())).toMatch(/replay inventory/);
    expect(fake.calls).not.toContain('capture');
    expect(fake.writesOpen).toBe(false);
  });
}

it('refuses malformed receipt JSON even when the corrupted bytes are resealed', async () => {
  const { fake, journal, run } = fixture();
  journal.crashAfter = 'replay-checked';
  expect(await rejectedError(run())).toBeInstanceOf(CrashSignal);
  const stored = JSON.parse(journal.stored ?? 'null') as CorruptProgress;
  const { createHash } = await import('node:crypto');
  stored.state.replayForward!.bytes = '{';
  stored.state.replayForward!.sha256 = createHash('sha256').update('{').digest('hex');
  journal.stored = JSON.stringify(stored);
  fake.calls.length = 0;
  expect(await rejectedMessage(run())).toContain('replay receipt bytes are malformed');
  expect(fake.calls).toEqual([]);
});

for (const phase of ['rollback-replay-checked', 'rollback-verified'] as const) {
  it(`refuses missing rollback receipt on resume from ${phase}`, async () => {
    const { fake, journal, run } = fixture();
    fake.faults.set('migrate', new Error('migration failed'));
    journal.crashAfter = phase;
    expect(await rejectedError(run())).toBeInstanceOf(CrashSignal);
    const stored = JSON.parse(journal.stored ?? 'null') as CorruptProgress;
    stored.state.replayRollback = null;
    journal.stored = JSON.stringify(stored);
    fake.calls.length = 0;
    expect(await rejectedMessage(run())).toContain('replay receipt is missing');
    expect(fake.calls).toEqual([]);
  });
}

for (const [phase, forbidden] of [
  ['replay-checked', 'capture'],
  ['release-persisted', 'reopenWrites'],
  ['rollback-replay-checked', 'rolloutTiers'],
  ['rollback-verified', 'reopenWrites'],
] as const) {
  it(`refuses in-process receipt loss at ${phase} before ${forbidden}`, async () => {
    const { fake, journal } = fixture();
    if (phase.startsWith('rollback-')) fake.faults.set('migrate', new Error('migration failed'));
    if (phase === 'release-persisted') {
      const reopen = fake.reopenWrites.bind(fake);
      fake.reopenWrites = () => {
        expect(fake.images.backend).toBe(old.images.backend);
        return reopen();
      };
    }
    let injected = false;
    const corrupting = {
      ...journal,
      write: (record: Parameters<typeof journal.write>[0]) => {
        journal.write(record);
        if (!injected && record.state.phase === phase) {
          injected = true;
          if (phase.startsWith('rollback-')) record.state.replayRollback = null;
          else record.state.replayForward = null;
        }
      },
    };
    expect(
      await rejectedMessage(
        executeRelease(request, corrupting, fake, () => undefined, {
          clock: fake.clock,
          heartbeatMs: 3_600_000,
        }),
      ),
    ).toMatch(/replay receipt/);
    // Rollback may safely restore tiers after refusing forward capture; forward capture itself must never run.
    if (phase !== 'release-persisted') expect(fake.calls).not.toContain(forbidden);
  });
}

it('refuses rollback when the previous image capability observation changes', async () => {
  const { fake, journal, vocabularies, run } = fixture();
  fake.migrate = () => {
    vocabularies.set(old.images.backend, []);
    return Promise.reject(new Error('forward migration failed'));
  };
  const message = await rejectedMessage(run());
  expect(message).toContain('rollback-check-replay');
  expect(message).toContain('replace_blockage');
  expect(message).toContain(old.images.backend);
  expect(message).toContain('manual command:');
  expect(journal.read()?.state.replayForward).not.toBeNull();
  expect(journal.read()?.state.replayRollback).toBeNull();
  expect(fake.calls).not.toContain('rolloutTiers');
  expect(fake.writesOpen).toBe(false);
  expect(fake.lease?.parked).toBe('rollback-failed');
});

for (const fault of ['null', 'missing'] as const) {
  it(`refuses ${fault} forward evidence from recovery-required on disk before recovery takeover`, async () => {
    const { fake, journal, path, run } = fixture();
    fake.faults.set('reconcileDesired', new Error('post-reopen failure'));
    expect(await rejectedMessage(run())).toContain('recovery-required');
    const progress = JSON.parse(journal.stored ?? 'null') as CorruptProgress;
    if (fault === 'null') progress.state.replayForward = null as never;
    else delete progress.state.replayForward;
    const bytes = JSON.stringify(progress);
    const journalPath = join(dirname(path), 'release.json');
    writeFileSync(journalPath, bytes);
    const disk = fileJournal(journalPath);
    expect(() => disk.read()).toThrow('replay receipt');
    fake.calls.length = 0;
    const lease = JSON.stringify(fake.lease);
    const recovery = { ...request, expectedCurrent: incoming, recovers: releaseIdOf(incoming) };
    expect(
      await rejectedMessage(
        executeRelease(recovery, disk, fake, () => undefined, {
          clock: fake.clock,
          heartbeatMs: 3_600_000,
        }),
      ),
    ).toContain('replay receipt');
    expect(fake.calls).toEqual([]);
    expect(JSON.stringify(fake.lease)).toBe(lease);
    expect(readFileSync(journalPath, 'utf8')).toBe(bytes);
  });
}

for (const supportsDelete of [false, true]) {
  it(`requires image-owned delete_state_v1 capability in the coordinator (supported=${String(supportsDelete)})`, async () => {
    const { fake, journal, path, vocabularies, run } = fixture();
    const db = new Database(path);
    db.query('UPDATE command_journal SET payload=?,inverse=?,preconditions=?').run(
      JSON.stringify({ forward: { do: 'delete_subtree', deletionState: { blockages: [] } } }),
      JSON.stringify({ do: 'restore_subtree', deletionState: { blockages: [] } }),
      '{}',
    );
    db.close();
    if (supportsDelete)
      for (const image of [old.images.backend, incoming.images.backend])
        vocabularies.set(image, ['replace_blockage', 'move_progress_v1', 'delete_state_v1']);
    if (supportsDelete) {
      expect((await run()).phase).toBe('lease-released');
      expect(journal.read()?.state.replayForward?.inventory).toEqual([
        { kind: 'delete_state_v1', count: 1 },
      ]);
    } else {
      expect(await rejectedMessage(run())).toContain('delete_state_v1');
      expect(fake.calls).not.toContain('capture');
      expect(fake.writesOpen).toBe(false);
    }
  });
}

for (const incompatible of [old.images.backend, incoming.images.backend]) {
  it(`refuses enabled-empty activation unsupported by exact image ${incompatible}`, async () => {
    const { fake, vocabularies, run } = fixture();
    fake.observeReplayInventory = () =>
      Promise.resolve([{ kind: 'step_blockage_activation_v1', count: 1 }]);
    for (const image of [old.images.backend, incoming.images.backend])
      vocabularies.set(image, image === incompatible ? [] : ['step_blockage_activation_v1']);
    expect(await rejectedMessage(run())).toContain(
      `step_blockage_activation_v1 (1) unsupported by ${incompatible}`,
    );
    expect(fake.calls).not.toContain('capture');
    expect(fake.calls).not.toContain('migrate');
    expect(fake.writesOpen).toBe(incompatible === incoming.images.backend);
  });
}

it('preserves enabled-empty admission in the durable coordinator receipt', async () => {
  const { fake, journal, vocabularies, run } = fixture();
  fake.observeReplayInventory = () =>
    Promise.resolve([{ kind: 'step_blockage_activation_v1', count: 1 }]);
  for (const image of [old.images.backend, incoming.images.backend])
    vocabularies.set(image, ['step_blockage_activation_v1']);
  expect((await run()).phase).toBe('lease-released');
  expect(journal.read()?.state.replayForward?.inventory).toEqual([
    { kind: 'step_blockage_activation_v1', count: 1 },
  ]);
});
