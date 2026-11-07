import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { hostJobRunRecordAbsence, hostJobRunRecordLocator } from './resource-runtime-shapes';

/**
 * The run-record locator and absence statement (`dash-host-jobs` task 6.8, S6F-A1) are what
 * Dash publishes and be-01 compares byte for byte, and what an operator recomputes: pinned
 * literally here, so a change to either is a visible contract change.
 */
describe('host job run record evidence', () => {
  test('the locator names the enrollment and the job', () => {
    expect(hostJobRunRecordLocator('h2puni-host-pool', 'job-1')).toBe(
      'dash-host-job-run://h2puni-host-pool/job-1',
    );
  });

  test('a not_created digest hashes a stable absence statement', () => {
    const absence = hostJobRunRecordAbsence(hostJobRunRecordLocator('h2puni-host-pool', 'job-1'));
    expect(absence).toBe('dash-host-job-run://h2puni-host-pool/job-1 absent');
    expect(createHash('sha256').update(absence).digest('hex')).toBe(
      'e5c0c5357f17d5efd5f8fba0af32f04572a418372d36439be9071a4d792e5d2b',
    );
  });
});
