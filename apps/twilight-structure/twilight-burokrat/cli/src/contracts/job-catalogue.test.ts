import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  JobCataloguePath,
  type JobType,
  parseJobArguments,
  parseJobCatalogue,
} from './job-catalogue';

const repositoryRoot = join(import.meta.dir, '..', '..', '..', '..', '..', '..');

function readRepositoryCatalogue(): unknown {
  return JSON.parse(readFileSync(join(repositoryRoot, JobCataloguePath), 'utf8')) as unknown;
}

function catalogueWith(jobs: unknown[]): unknown {
  return { schemaVersion: 1, jobs };
}

function gateJob(): Record<string, unknown> {
  return {
    id: 'gate',
    entrypoint: 'bin/h2puni-gate.sh',
    argumentProfile: '<sha>',
    envelope: { cpuCores: 4, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] },
    containers: { memoryGib: 1, cpuCores: 1 },
    enforcement: 'observe',
    provenance: { kind: 'estimated', basis: 'fixture', until: '2026-12-01' },
  };
}

describe('the job catalogue shape', () => {
  test("parses this repository's catalogue and names its four job types", () => {
    const catalogue = parseJobCatalogue(readRepositoryCatalogue());
    expect(catalogue.jobs.map((job) => job.id)).toEqual([
      'gate',
      'release-build',
      'test-queued',
      'solver-image-publish',
    ]);
  });

  test('refuses a malformed entry naming the field paths', () => {
    const malformed = gateJob();
    malformed['envelope'] = { cpuCores: 1.5, memoryGib: 6, tmpDiskGib: 8, exclusive: [] };
    malformed['enforcement'] = 'kill';
    expect(() => parseJobCatalogue(catalogueWith([malformed]))).toThrow(
      'Validation failed: jobs[0].enforcement must be "cap" or "observe" (was "kill")\njobs[0].envelope.cpuCores must be an integer (was 1.5)',
    );
  });

  test('refuses containers that are neither none nor a bound', () => {
    const unbounded = gateJob();
    unbounded['containers'] = 'unbounded';
    expect(() => parseJobCatalogue(catalogueWith([unbounded]))).toThrow(/jobs\[0\]\.containers/);
  });

  test('refuses a duplicate id', () => {
    expect(() => parseJobCatalogue(catalogueWith([gateJob(), gateJob()]))).toThrow(
      'repeated: gate',
    );
  });

  test('refuses calibrated provenance whose record ids disagree with its count', () => {
    const calibrated = gateJob();
    calibrated['provenance'] = {
      kind: 'calibrated',
      hostClass: 'h2puni',
      calibratedAt: '2026-11-20T10:00:00.000Z',
      recordCount: 3,
      p95: { cpuCores: 3.1, memoryGib: 4.2, tmpDiskGib: 5 },
      recordIds: ['r1', 'r2', 'r2'],
    };
    expect(() => parseJobCatalogue(catalogueWith([calibrated]))).toThrow(
      'as many unique record ids as its record count',
    );
  });

  test('refuses an impossible until date', () => {
    const job = gateJob();
    job['provenance'] = { kind: 'estimated', basis: 'fixture', until: '2026-02-30' };
    expect(() => parseJobCatalogue(catalogueWith([job]))).toThrow('a real calendar date');
  });
});

describe('the argument profile', () => {
  const gate = (): JobType => {
    const catalogue = parseJobCatalogue(catalogueWith([gateJob()]));
    const [job] = catalogue.jobs;
    return job;
  };
  const sha = '0a518a42d'.padEnd(40, '0');

  test('accepts arguments that match the profile token for token', () => {
    expect(parseJobArguments(gate(), [sha])).toEqual([sha]);
  });

  test('refuses arguments outside the argument profile', () => {
    for (const args of [[], [sha, 'extra'], ['HEAD'], [sha.slice(0, 8)]]) {
      expect(() => parseJobArguments(gate(), args)).toThrow(
        `job type gate: arguments ${JSON.stringify(args)} do not match its argument profile "<sha>"`,
      );
    }
  });

  test('the empty profile takes no arguments', () => {
    const job = { ...gate(), argumentProfile: '' };
    expect(parseJobArguments(job, [])).toEqual([]);
    expect(() => parseJobArguments(job, ['be'])).toThrow('do not match its argument profile ""');
  });
});
