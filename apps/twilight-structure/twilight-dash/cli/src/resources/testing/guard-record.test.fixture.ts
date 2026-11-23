import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDecision, createHold } from '../hold-token';
import { ampleHost, hostPoolFixture, jobType } from '../host-pool.test.fixture';
import { identifySelf } from '../process-identity';
import { GUARD_LABEL, loadResourceConfiguration, ResourceRuntime } from '../runtime';

/** Synthetic protocol records test only ledger fences; native-owner suites prove actual flock lifetime. */
export function createGuardFixture(credential: string, record = false) {
  const fixture = hostPoolFixture({
    cpuCores: 8,
    memoryGib: 16,
    headroom: { cpuCores: 0, memoryGib: 2 },
    gateTrees: 0,
    credential,
  });
  let milliseconds = 100;
  const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(fixture.config),
      { read: () => milliseconds },
      ampleHost,
    ),
    path = join(fixture.base, 'mutex');
  runtime.beginModeSwitch('concurrent', 'fixture');
  runtime.completeModeSwitch('concurrent', 'fixture', 'fixture', ['controlled ledger transition']);
  const identity = identifySelf(),
    holdFile = join(fixture.root, '.dash', 'legacy-holds', GUARD_LABEL);
  mkdirSync(join(fixture.root, '.dash', 'legacy-holds'), { mode: 0o700 });
  const hold = createHold(holdFile, identity),
    decision = createDecision(holdFile + '.ready', 'ready', identity);
  mkdirSync(path + '.d', { mode: 0o700 });
  writeFileSync(path + '.d/holder', String(identity.pid) + '\n', { mode: 0o600 });
  writeFileSync(path + '.d/label', GUARD_LABEL + '\n', { mode: 0o600 });
  if (record && !runtime.recordGuardHolder(identity.pid, path))
    throw new Error('fixture guard was not recorded');
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
    path,
    identity,
    holdFile,
    hold,
    decision,
    enqueue,
    advance() {
      milliseconds = 200;
    },
    close() {
      runtime.close();
      fixture.remove();
    },
  };
}
