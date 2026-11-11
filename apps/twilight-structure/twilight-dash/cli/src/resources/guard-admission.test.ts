import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { createDecision, createHold } from './hold-token';
import { ampleHost, hostPoolFixture, jobType } from './host-pool.test.fixture';
import { identifySelf } from './process-identity';
import { GUARD_LABEL, loadResourceConfiguration, ResourceRuntime } from './runtime';

/** Seed the unchanged historical guard row without new Ready qualification; native-owner suites prove flock lifetime. */
function createFixture() {
  const fixture = hostPoolFixture({
    cpuCores: 8,
    memoryGib: 16,
    headroom: { cpuCores: 0, memoryGib: 2 },
    gateTrees: 0,
    credential: fakeCredential(),
  });
  const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(fixture.config),
      { read: () => 100 },
      ampleHost,
    ),
    path = join(fixture.base, 'mutex');
  runtime.beginModeSwitch('concurrent', 'fixture');
  runtime.completeModeSwitch('concurrent', 'fixture', 'fixture', ['controlled ledger transition']);
  const identity = identifySelf(),
    holdFile = join(fixture.root, '.dash', 'legacy-holds', GUARD_LABEL);
  mkdirSync(join(fixture.root, '.dash', 'legacy-holds'), { mode: 0o700 });
  createHold(holdFile, identity);
  mkdirSync(path + '.d', { mode: 0o700 });
  writeFileSync(path + '.d/holder', String(process.pid) + '\n', { mode: 0o600 });
  writeFileSync(path + '.d/label', GUARD_LABEL + '\n', { mode: 0o600 });
  const ledger = new Database(join(fixture.root, '.dash', 'resources.sqlite'));
  try {
    ledger
      .query('UPDATE host_pool SET guard_holder=? WHERE id=1')
      .run(JSON.stringify({ ...identity, lockPath: path, since: 100 }));
  } finally {
    ledger.close();
  }
  function enqueue() {
    const queued = runtime.enqueueHostJob(
      { descriptor: jobType('fixture', 1, 1), label: 'fixture', waitSeconds: 0 },
      process.pid,
    );
    if (queued.kind !== 'queued') throw new Error(queued.reason);
    return queued.ticket;
  }
  return {
    runtime,
    identity,
    holdFile,
    enqueue,
    close() {
      runtime.close();
      fixture.remove();
    },
  };
}
it('requires complete current Ready evidence for new admission while preserving existing legacy continuity', () => {
  const fixture = createFixture();
  try {
    expect(fixture.runtime.guardStillHeld()).toBe(true);
    const ticket = fixture.enqueue();
    expect(fixture.runtime.pollHostJob(ticket, () => undefined)).toMatchObject({
      kind: 'waiting',
      awaiting: 'singleton guard',
    });
    createDecision(fixture.holdFile + '.ready', 'ready', fixture.identity);
    expect(fixture.runtime.pollHostJob(ticket, () => undefined).kind).toBe('admitted');
  } finally {
    fixture.close();
  }
});
it('rechecks Ready before preparing an admitted job even when legacy continuity remains live', () => {
  const fixture = createFixture();
  try {
    createDecision(fixture.holdFile + '.ready', 'ready', fixture.identity);
    const admission = fixture.runtime.pollHostJob(fixture.enqueue(), () => undefined);
    if (admission.kind !== 'admitted') throw new Error('fixture job not admitted');
    unlinkSync(fixture.holdFile + '.ready');
    expect(fixture.runtime.guardStillHeld()).toBe(true);
    expect(() => fixture.runtime.prepareHostJob(admission.job.id)).toThrow(
      'singleton guard was lost between admission and launch',
    );
  } finally {
    fixture.close();
  }
});
it('refuses mismatched full Ready identity rather than treating a valid-looking decision as admission', () => {
  const fixture = createFixture();
  try {
    createDecision(fixture.holdFile + '.ready', 'ready', {
      ...fixture.identity,
      start: String(BigInt(fixture.identity.start) + 1n),
    });
    const ticket = fixture.enqueue();
    expect(() => fixture.runtime.pollHostJob(ticket, () => undefined)).toThrow(
      'guard readiness does not match its recorded birth',
    );
  } finally {
    fixture.close();
  }
});
