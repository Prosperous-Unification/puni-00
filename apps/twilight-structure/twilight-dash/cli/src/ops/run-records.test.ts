import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import {
  type ContainerVerdict,
  HostJobRunRecords,
  leftoverNote,
  type RunOutcome,
} from './run-records';

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
        tmpUnreadable: [],
        tmpUnreadableOmitted: 0,
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
  test('a lifetime-bounded verdict keeps its label, name and lifetime (A-ATTR-ENDED-1)', () => {
    const records = begun();
    const verdict: ContainerVerdict = {
      id: 'c'.repeat(64),
      verdict: 'lifetime-bounded',
      reason:
        'host-service=sqlite3-backup from its create event (ended before inspection, lifetime 1.2 s)',
      lifetimeBound: {
        name: 'sqlite3-backup',
        lifetimeMs: 1200,
        sampleIntervalMs: 10_000,
      },
    };
    records.finish('run-one', outcome([verdict]));
    expect(records.inspect('run-one')?.containers).toEqual([verdict]);
    records.close();
  });

  test('a lifetime-bounded verdict without its lifetime is refused', () => {
    const records = begun();
    expect(() => {
      records.finish(
        'run-one',
        outcome([{ id: 'c'.repeat(64), verdict: 'lifetime-bounded', reason: 'no lifetime' }]),
      );
    }).toThrow();
    expect(records.inspect('run-one')?.endedAt).toBeNull();
    records.close();
  });

  describe('leftover processes (task 6.24)', () => {
    test('a run keeps the leftovers it ended', () => {
      const records = begun();
      const leftovers = {
        count: 9,
        examples: [{ pid: 42, comm: 'node', cmdline: 'node serve.cjs' }],
        endedWith: 'SIGTERM' as const,
      };
      records.finish('run-one', { ...outcome([]), leftoverProcesses: leftovers });
      const record = records.inspect('run-one');
      expect(record?.leftoverProcesses).toEqual(leftovers);
      if (record === null) throw new Error('no record');
      expect(leftoverNote(record)).toBe(
        'run run-one ended 9 leftover processes with SIGTERM (node serve.cjs ×1, 8 more undescribed)',
      );
      records.close();
    });

    test('an outcome recorded before task 6.24 loads with no leftovers', () => {
      const records = begun();
      const root = roots.at(-1);
      if (root === undefined) throw new Error('no records root');
      // The outcome as a launcher before task 6.24 stored it.
      const db = new Database(HostJobRunRecords.pathOf(root));
      db.query('UPDATE runs SET outcome=? WHERE job_id=?').run(
        JSON.stringify(outcome([])),
        'run-one',
      );
      db.close();
      // Proof: requiring the field made `inspect` throw `leftoverProcesses must be an object
      // (was missing)` on the stored row (2026-11-19, task 6.24).
      const record = records.inspect('run-one');
      expect(record).not.toHaveProperty('leftoverProcesses');
      if (record === null) throw new Error('no record');
      expect(leftoverNote(record)).toBeNull();
      records.close();
    });

    test('an unknown ending is refused before it is written', () => {
      const records = begun();
      expect(() => {
        records.finish('run-one', {
          ...outcome([]),
          // A corrupt caller's value, which the type forbids.
          leftoverProcesses: { count: 1, examples: [], endedWith: 'SIGHUP' as 'none' },
        });
      }).toThrow();
      expect(records.inspect('run-one')?.endedAt).toBeNull();
      records.close();
    });
  });
  describe('unreadable tmp subtrees (task 6.23)', () => {
    test('a sample keeps the unreadable paths it saw', () => {
      const records = begun();
      records.sample('run-one', {
        kind: 'interval',
        observedAt: 1_800_000_000_500,
        counters: null,
        tmpBytes: 4096,
        tmpUnreadable: ['wbs-shared-process-XYrBbJ/inaccessible'],
        tmpUnreadableOmitted: 2,
        containers: null,
        failure: null,
      });
      expect(records.inspect('run-one')?.samples.at(-1)).toMatchObject({
        tmpBytes: 4096,
        tmpUnreadable: ['wbs-shared-process-XYrBbJ/inaccessible'],
        tmpUnreadableOmitted: 2,
      });
      records.close();
    });

    test('a sample recorded before task 6.23 loads with no unreadable paths', () => {
      const records = begun();
      const root = roots.at(-1);
      if (root === undefined) throw new Error('no records root');
      const db = new Database(HostJobRunRecords.pathOf(root));
      db.query('INSERT INTO samples(job_id, sample) VALUES (?, ?)').run(
        'run-one',
        JSON.stringify({
          kind: 'interval',
          observedAt: 1_800_000_000_500,
          counters: null,
          tmpBytes: 4096,
          containers: null,
          failure: null,
        }),
      );
      db.close();
      expect(records.inspect('run-one')?.samples.at(-1)).toMatchObject({
        tmpBytes: 4096,
        tmpUnreadable: [],
        tmpUnreadableOmitted: 0,
      });
      records.close();
    });
  });
});
