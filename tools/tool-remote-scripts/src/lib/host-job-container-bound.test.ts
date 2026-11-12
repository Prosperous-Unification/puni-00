import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  HOST_JOB_CONTAINER_BOUND,
  hostJobAttributionFlags,
  hostJobContainerFlags,
} from './host-job-container-bound';

interface CatalogueJob {
  readonly id: string;
  readonly containers?: { readonly memoryGib: number; readonly cpuCores: number };
}

const catalogue = JSON.parse(
  readFileSync(join(import.meta.dir, '../../../../infra/jobs/catalogue.json'), 'utf8'),
) as { readonly jobs: readonly CatalogueJob[] };

describe('the host job container flags', () => {
  // Proof: with the `jobId === null` branch removed from readJobId's callers (flags always
  // built), `adds nothing outside a Dash job` failed on `Expected: [] Received: [ "--memory", …`,
  // and with the flags never built, `bounds and labels inside a Dash job` failed (2026-11-12).
  it('bounds and labels inside a Dash job', () => {
    expect(hostJobContainerFlags({ DASH_JOB_ID: 'abc' })).toEqual([
      '--memory',
      '1g',
      '--cpus',
      '1',
      '--label',
      'puni.job=abc',
    ]);
    expect(hostJobAttributionFlags({ DASH_JOB_ID: 'abc' }, 512)).toEqual([
      '--cpus',
      '1',
      '--label',
      'puni.job=abc',
    ]);
  });

  it('adds nothing outside a Dash job, an empty DASH_JOB_ID included', () => {
    expect(hostJobContainerFlags({})).toEqual([]);
    expect(hostJobContainerFlags({ DASH_JOB_ID: '' })).toEqual([]);
    expect(hostJobAttributionFlags({}, 4096)).toEqual([]);
  });

  // Proof: with the memory comparison removed, this test failed on `Received function did not
  // throw` (2026-11-12).
  it('refuses a caller memory above the bound inside a job', () => {
    expect(() => hostJobAttributionFlags({ DASH_JOB_ID: 'abc' }, 1025)).toThrow(
      'memory 1025 MiB exceeds the 1 GiB containers bound',
    );
    expect(hostJobAttributionFlags({ DASH_JOB_ID: 'abc' }, 1024)).toHaveLength(4);
  });

  it('is the gate type declared bound and within every type that declares one', () => {
    const gate = catalogue.jobs.find((job) => job.id === 'gate');
    expect(gate?.containers).toEqual(HOST_JOB_CONTAINER_BOUND);
    for (const job of catalogue.jobs) {
      if (job.containers === undefined) continue;
      expect(job.containers.memoryGib).toBeGreaterThanOrEqual(HOST_JOB_CONTAINER_BOUND.memoryGib);
      expect(job.containers.cpuCores).toBeGreaterThanOrEqual(HOST_JOB_CONTAINER_BOUND.cpuCores);
    }
  });
});
