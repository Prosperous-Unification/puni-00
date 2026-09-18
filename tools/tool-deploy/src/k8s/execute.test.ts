import { describe, expect, it } from 'bun:test';

import { type ExecuteOptions, executeRelease, ReleaseFailedError } from './execute';
import { CrashSignal, FakeCluster, memoryJournal } from './fake-cluster';
import {
  FORWARD_PHASES,
  type ReleaseIdentity,
  releaseIdOf,
  type ReleasePhase,
  type ReleaseRequest,
} from './release';

const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const DESIRED = 'c'.repeat(40);
const PREVIOUS = 'd'.repeat(40);
const RECOVERY = 'e'.repeat(40);

function identity(sha: string, fill: string): ReleaseIdentity {
  const digest = `sha256:${fill.repeat(64)}`;
  return {
    sourceSha: sha,
    images: {
      backend: `registry.puni.test/wbs-be@${digest}`,
      gateway: `registry.puni.test/wbs-gw@${digest}`,
      frontend: `registry.puni.test/wbs-fe@${digest}`,
      mcp: `registry.puni.test/wbs-mcp@${digest}`,
    },
  };
}

const OLD = identity(OLD_SHA, '1');
const NEW = identity(NEW_SHA, '2');

function request(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    environment: 'staging',
    cluster: { context: 'lab', uid: 'uid-lab' },
    namespaces: { app: 'wbs', backend: 'wbs-solver' },
    release: NEW,
    expectedCurrent: OLD,
    admission: { package: 'pkg@sha256:1', activation: 'act@sha256:1' },
    flux: {
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'deploy',
      desiredRevision: DESIRED,
      previousRevision: PREVIOUS,
    },
    recovers: null,
    ...overrides,
  };
}

/**
 * `source` is the revision the WBS GitRepository serves: DESIRED once the release's manifests
 * were pushed, PREVIOUS when they were not.
 */
function cluster(source: string = DESIRED): FakeCluster {
  const fake = new FakeCluster(OLD, ['0001_init'], source);
  fake.sourceImages.set(PREVIOUS, OLD);
  fake.sourceImages.set(DESIRED, NEW);
  fake.migrationsByImage.set(OLD.images.backend, [
    { name: '0001_init', hash: 'hash-0001_init', downSha256: 'down-1' },
  ]);
  fake.migrationsByImage.set(NEW.images.backend, [
    { name: '0001_init', hash: 'hash-0001_init', downSha256: 'down-1' },
    { name: '0002_add', hash: 'hash-0002_add', downSha256: 'down-2' },
  ]);
  fake.write('row-before');
  return fake;
}

const quiet = (): void => undefined;

/** Executor options on the fake's clock; sleeping advances it instead of waiting. */
function on(fake: FakeCluster): ExecuteOptions {
  return {
    clock: fake.clock,
    sleep: (ms) => {
      fake.now += ms;
      return Promise.resolve();
    },
    heartbeatMs: 3_600_000,
  };
}

function expectRestored(fake: FakeCluster): void {
  expect(fake.images).toEqual({ ...OLD.images });
  expect(fake.applied).toEqual(['0001_init']);
  expect(fake.rows).toContain('row-before');
  expect(fake.writesOpen).toBe(true);
  expect(fake.backendReplicas).toBe(1);
  expect(fake.fluxSuspended).toBe(false);
  expect(fake.lease).toBeNull();
  expect(fake.maxConcurrentWriters).toBeLessThanOrEqual(1);
}

async function failure(promise: Promise<unknown>): Promise<ReleaseFailedError> {
  try {
    await promise;
  } catch (e: unknown) {
    if (e instanceof ReleaseFailedError) return e;
    throw e;
  }
  throw new Error('expected the release to fail');
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}

describe('executeRelease', () => {
  it('takes the exact phase order and promotes the release', async () => {
    const fake = cluster();
    const journal = memoryJournal();
    const phases: string[] = [];
    const recording = {
      ...journal,
      write: (r: Parameters<typeof journal.write>[0]) => {
        phases.push(r.state.phase);
        journal.write(r);
      },
    };
    const final = await executeRelease(request(), recording, fake, quiet, on(fake));
    expect(final.phase).toBe('lease-released');
    expect(phases).toEqual(
      FORWARD_PHASES.filter((p) => !['requested', 'validated', 'lease-acquired'].includes(p)),
    );
    const mutations = fake.calls.filter((c) => !c.endsWith('Lease'));
    expect(mutations).toEqual([
      'observeCluster',
      'admitBackendImages',
      'suspendFlux',
      'closeWrites',
      'drainGateway',
      'stopWriter',
      'capture',
      'migrate',
      'rolloutBackend',
      'rolloutTiers',
      'smoke',
      'publishDesired',
      'persistRelease',
      'reopenWrites',
      'reconcileDesired',
      'resumeFlux',
    ]);
    expect(fake.images).toEqual({ ...NEW.images });
    expect(fake.applied).toEqual(['0001_init', '0002_add']);
    expect(fake.maxConcurrentWriters).toBe(1);
    // Every step after the Lease is taken first renews it.
    for (const call of [
      'suspendFlux',
      'stopWriter',
      'migrate',
      'reopenWrites',
      'resumeFlux',
    ] as const) {
      expect(fake.calls[fake.calls.indexOf(call) - 1]).toBe('renewLease');
    }
    expect(fake.lease).toBeNull();
  });

  const beforeProof = FORWARD_PHASES.slice(
    FORWARD_PHASES.indexOf('intent-persisted'),
    FORWARD_PHASES.indexOf('smoke-passed'),
  );
  for (const phase of beforeProof) {
    it(`rolls back after a crash following ${phase}`, async () => {
      const fake = cluster(PREVIOUS);
      const journal = memoryJournal();
      journal.crashAfter = phase;
      // Proof: CrashSignal escapes the executor instead of being handled as a step failure.
      let crashed: unknown = null;
      await executeRelease(request(), journal, fake, quiet, on(fake)).catch((e: unknown) => {
        crashed = e;
      });
      expect(crashed).toBeInstanceOf(CrashSignal);
      const failed = await failure(executeRelease(request(), journal, fake, quiet, on(fake)));
      expect(failed.state.phase).toBe('rolled-back');
      expect(failed.state.rollbackFrom).toBe(phase as never);
      expectRestored(fake);
      fake.write('row-after-rollback');
    });
  }

  const afterProof = FORWARD_PHASES.slice(FORWARD_PHASES.indexOf('smoke-passed'), -1);
  for (const phase of afterProof) {
    it(`finishes the proven release after a crash following ${phase}`, async () => {
      const fake = cluster();
      const journal = memoryJournal();
      journal.crashAfter = phase;
      await executeRelease(request(), journal, fake, quiet, on(fake)).catch((e: unknown) => {
        expect(e).toBeInstanceOf(CrashSignal);
      });
      const final = await executeRelease(request(), journal, fake, quiet, on(fake));
      expect(final.phase).toBe('lease-released');
      expect(fake.images).toEqual({ ...NEW.images });
      expect(fake.writesOpen).toBe(true);
      expect(fake.fluxSuspended).toBe(false);
      expect(fake.lease).toBeNull();
      expect(fake.migrationJobRuns).toBe(1);
    });
  }

  it('reclaims the Lease of a coordinator that died before persisting intent', async () => {
    const fake = cluster();
    const journal = memoryJournal();
    fake.seedLease(`${releaseIdOf(NEW)}-dead00#0000`, journal.path);
    const final = await executeRelease(request(), journal, fake, quiet, on(fake));
    expect(final.phase).toBe('lease-released');
    expect(fake.calls).toContain('takeoverLease');
    expect(fake.lease).toBeNull();
  });

  it('refuses while a live coordinator of another transaction holds the Lease', async () => {
    const fake = cluster();
    fake.seedLease('another-release-abc#1234', '/other/journal.json');
    expect(
      await rejection(executeRelease(request(), memoryJournal(), fake, quiet, on(fake))),
    ).toContain('held by live coordinator another-release-abc#1234');
    expect(fake.calls).toEqual(['observeCluster', 'readLease']);
    expect(fake.writesOpen).toBe(true);
  });

  it('refuses a second live coordinator for the same request', async () => {
    const fake = cluster();
    const journal = memoryJournal();
    // Real waiting: the fake clock stands still, so the live holder never lapses.
    const options = { ...on(fake), sleep: () => Promise.resolve() };
    const [first, second] = await Promise.allSettled([
      executeRelease(request(), journal, fake, quiet, options),
      executeRelease(request(), journal, fake, quiet, options),
    ]);
    const outcomes = [first, second].map((r) =>
      r.status === 'fulfilled' ? r.value.phase : String(r.reason),
    );
    expect(outcomes.filter((o) => o === 'lease-released')).toHaveLength(1);
    expect(outcomes.filter((o) => o.includes('still renewed'))).toHaveLength(1);
    expect(fake.migrationJobRuns).toBe(1);
    expect(fake.maxConcurrentWriters).toBe(1);
    expect(journal.read()?.state.phase).toBe('lease-released');
  });

  it('refuses to resume a transaction whose live coordinator still renews the Lease', async () => {
    const fake = cluster();
    const journal = memoryJournal();
    journal.crashAfter = 'writes-closed';
    await executeRelease(request(), journal, fake, quiet, on(fake)).catch(() => undefined);
    // The "crashed" holder keeps renewing: another process of this transaction is alive.
    const stored = journal.stored;
    const options = {
      ...on(fake),
      sleep: () => {
        if (fake.lease !== null) fake.lease = { ...fake.lease, renewedAtMs: fake.now };
        return Promise.resolve();
      },
    };
    expect(await rejection(executeRelease(request(), journal, fake, quiet, options))).toContain(
      'still renewed',
    );
    // Nothing was journaled or mutated by the refused run.
    expect(journal.stored).toBe(stored);
    expect(fake.writesOpen).toBe(false);
  });

  it('stops when another process takes the Lease', async () => {
    const fake = cluster();
    const original = fake.capture.bind(fake);
    fake.capture = async (id, image) => {
      const captured = await original(id, image);
      fake.seedLease('usurper-tx#9999', '/other.json');
      return captured;
    };
    const journal = memoryJournal();
    expect(await rejection(executeRelease(request(), journal, fake, quiet, on(fake)))).toContain(
      'Lease lost before migrate',
    );
    expect(fake.calls).not.toContain('migrate');
    expect(journal.read()?.state.phase).toBe('state-captured');
  });

  for (const [label, arrange] of [
    ['failed health', (fake: FakeCluster) => fake.unhealthy.add(NEW.images.backend)],
    [
      'failed smoke',
      (fake: FakeCluster) => fake.faults.set('smoke', new Error('frontend index FAIL 502')),
    ],
    [
      'a timeout',
      (fake: FakeCluster) =>
        fake.faults.set('migrate', new Error('job wbs-migrate did not happen within 600000ms')),
    ],
  ] as const) {
    it(`rolls back to the captured schema and old digests before writes reopen on ${label}`, async () => {
      const fake = cluster(PREVIOUS);
      arrange(fake);
      const failed = await failure(
        executeRelease(request(), memoryJournal(), fake, quiet, on(fake)),
      );
      expect(failed.state.phase).toBe('rolled-back');
      expectRestored(fake);
      // Writes reopen only after the old release verified.
      const reopen = fake.calls.lastIndexOf('reopenWrites');
      expect(fake.calls.lastIndexOf('smoke')).toBeLessThan(reopen);
      expect(fake.calls.lastIndexOf('rollbackSchema')).toBeLessThan(reopen);
    });
  }

  it('leaves writes fenced and prints the manual command when rollback fails', async () => {
    const fake = cluster();
    fake.unhealthy.add(NEW.images.backend);
    fake.brokenEffects.add('rollbackSchema');
    const journal = memoryJournal();
    const failed = await failure(executeRelease(request(), journal, fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('rollback-failed');
    expect(fake.writesOpen).toBe(false);
    expect(fake.lease?.holder.startsWith(failed.state.transactionId)).toBe(true);
    expect(fake.lease?.parked).toBe('rollback-failed');
    expect(fake.fluxSuspended).toBe(true);
    expect(failed.message).toContain(
      `manual command: kubectl --context lab create -f /state/wbs-manual-rollback-${failed.state.transactionId}.json # --to=0001_init`,
    );
    expect(failed.message).toContain(
      'captured migration set: baseline 0001_init; applied [0001_init]; pending [0002_add]',
    );
    expect(failed.message).toContain('journal: /state/release.json');
    // A restart refuses rather than reopening writes.
    expect(await rejection(executeRelease(request(), journal, fake, quiet, on(fake)))).toContain(
      'writes stay fenced',
    );
    expect(fake.writesOpen).toBe(false);
  });

  it('names the manual completion when a later rollback step fails', async () => {
    const fake = cluster();
    fake.unhealthy.add(NEW.images.backend);
    fake.brokenEffects.add('smoke');
    const failed = await failure(executeRelease(request(), memoryJournal(), fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('rollback-failed');
    expect(failed.state.failure?.step).toBe('rollback-verify');
    expect(failed.message).toContain(
      `manual command: reopen writes and delete the Lease of ${releaseIdOf(NEW)}`,
    );
    expect(fake.writesOpen).toBe(false);
  });

  it('refuses an edited down migration and stays fenced', async () => {
    const fake = cluster();
    fake.unhealthy.add(NEW.images.backend);
    const journal = memoryJournal();
    // The image the rollback reads carries a different down.sql than capture recorded.
    const original = fake.observeDownMigrations.bind(fake);
    fake.observeDownMigrations = async (id, image) =>
      (await original(id, image)).map((m) =>
        m.name === '0002_add' ? { ...m, downSha256: 'edited' } : m,
      );
    const failed = await failure(executeRelease(request(), journal, fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('rollback-failed');
    expect(failed.state.failure?.message).toContain('0002_add/down.sql is edited');
    expect(fake.applied).toEqual(['0001_init', '0002_add']);
    expect(fake.writesOpen).toBe(false);
  });

  it('refuses a migration Job that completed without applying the captured set', async () => {
    const fake = cluster(PREVIOUS);
    fake.migrate = () => Promise.resolve(['0001_init']);
    const failed = await failure(executeRelease(request(), memoryJournal(), fake, quiet, on(fake)));
    expect(failed.state.failure?.step).toBe('migrate');
    expect(failed.state.phase).toBe('rolled-back');
  });

  it('stops at recovery-required after writes reopen and recovers with a fresh capture', async () => {
    const fake = cluster();
    fake.faults.set('resumeFlux', new Error('Flux source is at main@sha1:old'));
    const journal = memoryJournal();
    const failed = await failure(executeRelease(request(), journal, fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('recovery-required');
    // No blind rollback: the new release keeps serving and accepts writes.
    expect(fake.images).toEqual({ ...NEW.images });
    fake.write('row-after-promotion');
    const staleSnapshot = failed.state.snapshot?.path;

    expect(
      await rejection(
        executeRelease(
          request({ release: OLD, expectedCurrent: NEW }),
          journal,
          fake,
          quiet,
          on(fake),
        ),
      ),
    ).toContain('only a request with recovers=');

    fake.migrationsByImage.set(OLD.images.backend, [
      { name: '0001_init', hash: 'hash-0001_init', downSha256: 'down-1' },
    ]);
    fake.sourceImages.set(RECOVERY, OLD);
    fake.fluxRevision = RECOVERY;
    expect(fake.lease?.parked).toBe('recovery-required');
    const recovery = request({
      release: OLD,
      expectedCurrent: NEW,
      recovers: releaseIdOf(NEW),
      flux: {
        namespace: 'flux-system',
        kustomization: 'wbs',
        gitRepository: 'deploy',
        desiredRevision: RECOVERY,
        previousRevision: DESIRED,
      },
    });
    const final = await executeRelease(recovery, journal, fake, quiet, on(fake));
    expect(final.phase).toBe('lease-released');
    expect(final.snapshot?.path).not.toBe(staleSnapshot);
    expect(fake.rows).toEqual(['row-before', 'row-after-promotion']);
    expect(fake.images).toEqual({ ...OLD.images });
    expect(fake.lease).toBeNull();
  });

  it('refuses a new release while another release journal is unfinished', async () => {
    const fake = cluster();
    const journal = memoryJournal();
    journal.crashAfter = 'writes-closed';
    await executeRelease(request(), journal, fake, quiet, on(fake)).catch(() => undefined);
    const other = identity(NEW_SHA, '3');
    expect(
      await rejection(executeRelease(request({ release: other }), journal, fake, quiet, on(fake))),
    ).toContain('holds unfinished release');
  });

  it('rolls back with Flux onto the previous revision only', async () => {
    const fake = cluster(PREVIOUS);
    fake.unhealthy.add(NEW.images.backend);
    const failed = await failure(executeRelease(request(), memoryJournal(), fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('rolled-back');
    expectRestored(fake);
  });

  it('keeps Flux suspended when the source already serves the failed release', async () => {
    const fake = cluster(DESIRED);
    fake.unhealthy.add(NEW.images.backend);
    const journal = memoryJournal();
    const failed = await failure(executeRelease(request(), journal, fake, quiet, on(fake)));
    expect(failed.state.phase).toBe('flux-revert-required');
    // The restored release keeps serving: Flux never re-applied the failed digests.
    expect(fake.images).toEqual({ ...OLD.images });
    expect(fake.applied).toEqual(['0001_init']);
    expect(fake.writesOpen).toBe(true);
    expect(fake.fluxSuspended).toBe(true);
    expect(fake.lease?.parked).toBe('flux-revert-required');
    expect(failed.message).toContain(
      `manual command: revert deploy to ${PREVIOUS}, then resume wbs`,
    );
    expect(await rejection(executeRelease(request(), journal, fake, quiet, on(fake)))).toContain(
      'deploy repository is reverted',
    );
  });

  it('publishes the desired revision before writes reopen, and rolls back when the push fails', async () => {
    const promoted = cluster(PREVIOUS);
    await executeRelease(request(), memoryJournal(), promoted, quiet, on(promoted));
    expect(promoted.calls.indexOf('publishDesired')).toBeLessThan(
      promoted.calls.indexOf('reopenWrites'),
    );
    expect(promoted.fluxRevision).toBe(DESIRED);
    expect(promoted.images).toEqual({ ...NEW.images });

    const rejected = cluster(PREVIOUS);
    rejected.brokenEffects.add('publishDesired');
    const failed = await failure(
      executeRelease(request(), memoryJournal(), rejected, quiet, on(rejected)),
    );
    expect(failed.state.phase).toBe('rolled-back');
    expect(failed.state.failure?.step).toBe('persist-release');
    expectRestored(rejected);
  });

  it('never renews the Lease concurrently', async () => {
    const fake = cluster();
    let inFlight = 0;
    let most = 0;
    const renew = fake.renewLease.bind(fake);
    fake.renewLease = async (holder: string) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await Bun.sleep(3);
      try {
        await renew(holder);
      } finally {
        inFlight--;
      }
    };
    const final = await executeRelease(request(), memoryJournal(), fake, quiet, {
      ...on(fake),
      heartbeatMs: 1,
    });
    expect(final.phase).toBe('lease-released');
    expect(most).toBe(1);
  });

  it('admits the candidate and rollback digests before any backend pod starts', async () => {
    const fake = cluster();
    await executeRelease(request(), memoryJournal(), fake, quiet, on(fake));
    expect(fake.approved).toEqual([NEW.images.backend, OLD.images.backend]);
    expect(fake.calls.indexOf('admitBackendImages')).toBeLessThan(fake.calls.indexOf('capture'));
  });

  it('records every phase it wrote in the journal history', async () => {
    const journal = memoryJournal();
    await executeRelease(request(), journal, cluster(), quiet, on(cluster()));
    const phases = journal.read()?.history.map((h) => h.phase) as ReleasePhase[];
    expect(phases.at(0)).toBe('intent-persisted');
    expect(phases.at(-1)).toBe('lease-released');
  });
});
