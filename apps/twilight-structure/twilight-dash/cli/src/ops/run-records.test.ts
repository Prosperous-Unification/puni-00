import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { type ContainerVerdict, HostJobRunRecords, type RunOutcome } from './run-records';

/**
 * `dash-host-jobs` task 6.22, the run record's container verdict shape: a `host-service`
 * verdict keeps the declared service and its bounds, and one without them is refused before
 * it is written.
 */
describe('run record container verdicts (task 6.22, A-ATTR-HOSTSVC-1)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function begun(): HostJobRunRecords {
    const root = mkdtempSync(join(tmpdir(), 'dash-run-records-'));
    roots.push(root);
    mkdirSync(join(root, '.dash'), { mode: 0o700 });
    const records = HostJobRunRecords.open(root, false);
    records.begin(
      {
        jobId: 'run-one',
        type: 'gate',
        label: 'gate',
        descriptor: {},
        descriptorDigest: 'digest',
        cataloguePath: '/srv/checkout/infra/jobs/catalogue.json',
        launcherSha: 'a'.repeat(40),
        argumentProfile: '',
        argv: ['bin/payload.sh'],
        hostClass: 'linux-x64-8c-15g',
        unit: 'dash-job-run-one',
        cgroup: '/user.slice/dash-job-run-one.scope',
        tmpDirectory: '/managed/run-one',
        units: [],
        startedAt: 1_800_000_000_000,
      },
      {
        kind: 'gate',
        observedAt: 1_800_000_000_000,
        counters: null,
        tmpBytes: null,
        containers: null,
        failure: 'not read',
      },
    );
    return records;
  }

  const outcome = (containers: unknown[]): RunOutcome => ({
    endedAt: 1_800_000_001_000,
    exitCode: 0,
    signal: null,
    telemetryFailure: null,
    ledgerFailure: null,
    attributionIncomplete: false,
    // The refusal case writes a verdict the type forbids, as a corrupt caller would.
    containers: containers as ContainerVerdict[],
  });

  test('a host-service verdict keeps its service name and declared bounds', () => {
    const records = begun();
    const verdict: ContainerVerdict = {
      id: 'c'.repeat(64),
      verdict: 'host-service',
      reason: 'host service goaccess-reports, memory 536870912 bytes, 1 cores',
      hostService: { name: 'goaccess-reports', memoryBytes: 536870912, cpuCores: 1 },
    };
    records.finish('run-one', outcome([verdict]));
    expect(records.inspect('run-one')?.containers).toEqual([verdict]);
    records.close();
  });

  test('a host-service verdict without its declared bounds is refused', () => {
    const records = begun();
    expect(() => {
      records.finish(
        'run-one',
        outcome([{ id: 'c'.repeat(64), verdict: 'host-service', reason: 'no bounds' }]),
      );
    }).toThrow();
    expect(records.inspect('run-one')?.endedAt).toBeNull();
    records.close();
  });
});
