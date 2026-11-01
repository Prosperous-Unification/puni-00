import type { CapacityReport } from '@wbs/domain/compute-provider';
import { describe, expect, it } from 'vitest';

import { inUseSentence, readReport, spanWords, unitsWords } from './compute-provider-words';

const NOW = Date.UTC(2026, 9, 23, 10, 0);
const CADENCE_S = 300;

const reportOf = (fields: Partial<CapacityReport> = {}): CapacityReport => ({
  providerId: 'cp-1',
  observedAt: NOW - 120_000,
  cadenceSeconds: CADENCE_S,
  outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
  reportedBy: 'p-agent',
  reportedAt: NOW - 119_000,
  ...fields,
});

describe('capacity report words', () => {
  it('never reads a missing report as a number', () => {
    const reading = readReport(undefined, 'GB', NOW);
    expect(reading).toEqual({
      state: 'no_report',
      headline: 'No report yet',
      detail: 'Dash has not reported for this resource.',
    });
    expect(`${reading.headline} ${reading.detail}`).not.toMatch(/\d/);
  });

  it('reads a measurement in the resource’s own unit, with its age', () => {
    expect(readReport(reportOf(), 'GB', NOW)).toEqual({
      state: 'measured',
      headline: 'Measured 15 GB, 8 in use',
      detail: 'Observed 2 min ago.',
      capacityUnits: 15,
    });
  });

  // `dash-host-jobs` 5.3, "Reserved by two jobs".
  it('reads reserved units and both job names beside the measured usage', () => {
    const reserved = reportOf({
      outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8, reservedUnits: 12 },
    });
    expect(
      readReport(reserved, 'GiB', NOW, [{ label: 'gate 1a2b3c4' }, { label: 'gate 5d6e7f8' }]),
    ).toEqual({
      state: 'measured',
      headline: 'Measured 15 GiB, 8 in use, 12 reserved by 2 jobs',
      detail: 'Reserved by gate 1a2b3c4 and gate 5d6e7f8. Observed 2 min ago.',
      capacityUnits: 15,
    });
    expect(readReport(reserved, 'GiB', NOW, [{ label: 'gate 1a2b3c4' }]).headline).toBe(
      'Measured 15 GiB, 8 in use, 12 reserved by 1 job',
    );
    // Reserved units whose jobs WBS has not heard of yet, and an idle pool.
    expect(readReport(reserved, 'GiB', NOW)).toMatchObject({
      headline: 'Measured 15 GiB, 8 in use, 12 reserved',
      detail: 'Dash has not published the jobs holding it yet. Observed 2 min ago.',
    });
    expect(
      readReport(
        reportOf({
          outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8, reservedUnits: 0 },
        }),
        'GiB',
        NOW,
      ),
    ).toMatchObject({ headline: 'Measured 15 GiB, 8 in use, none reserved' });
    // Stale reads as before, whatever the jobs.
    expect(
      readReport({ ...reserved, observedAt: NOW - 3_600_000 }, 'GiB', NOW, [
        { label: 'gate 1a2b3c4' },
      ]).detail,
    ).toBe(
      'Dash reports every 5 min; a report is stale after 15 min (3 × cadence). It measured 15 GiB, 8 in use.',
    );
  });

  it('reads an unreachable report with the adapter’s reason', () => {
    const reading = readReport(
      reportOf({ outcome: { kind: 'unreachable', reason: 'ssh: connection timed out' } }),
      'GB',
      NOW,
    );
    expect(reading).toEqual({
      state: 'unreachable',
      headline: 'Unreachable 2 min ago',
      detail: 'ssh: connection timed out',
    });
  });

  it('is not stale at exactly three cadences, and is one millisecond later', () => {
    const boundary = NOW - 3 * CADENCE_S * 1000;
    expect(readReport(reportOf({ observedAt: boundary }), 'GB', NOW).state).toBe('measured');
    const stale = readReport(reportOf({ observedAt: boundary - 1 }), 'GB', NOW);
    expect(stale).toEqual({
      state: 'stale',
      headline: 'Stale: last report 15 min ago',
      detail:
        'Dash reports every 5 min; a report is stale after 15 min (3 × cadence). It measured 15 GB, 8 in use.',
    });
  });

  it('keeps the reason of a stale unreachable report', () => {
    const reading = readReport(
      reportOf({
        observedAt: NOW - 3_600_000,
        outcome: { kind: 'unreachable', reason: 'host key mismatch' },
      }),
      'GB',
      NOW,
    );
    expect(reading.state).toBe('stale');
    expect(reading.detail).toContain('It could not reach the host: host key mismatch');
  });

  it('throws on an outcome the contract does not have', () => {
    const impossible = reportOf({
      // An impossible union value, which the read's schema never lets through.
      outcome: { kind: 'guessed' } as unknown as CapacityReport['outcome'],
    });
    expect(() => readReport(impossible, 'GB', NOW)).toThrow();
  });
});

describe('compute provider words', () => {
  it('names every resource of an in_use refusal and what a cascade does', () => {
    expect(inUseSentence('h2puni', [{ name: 'h2puni ram' }])).toBe(
      'h2puni fulfils h2puni ram. Removing it clears that reference and deletes its capacity report; no plan changes.',
    );
    expect(
      inUseSentence('h2puni', [{ name: 'h2puni ram' }, { name: 'tmp disk' }, { name: 'slots' }]),
    ).toBe(
      'h2puni fulfils h2puni ram, tmp disk and slots. Removing it clears all 3 references and deletes their capacity reports; no plan changes.',
    );
  });

  it('reads spans and units', () => {
    expect(spanWords(45_000)).toBe('45 s');
    expect(spanWords(-5)).toBe('0 s');
    expect(spanWords(3 * 3_600_000)).toBe('3 h');
    expect(spanWords(3 * 86_400_000)).toBe('3 d');
    expect(unitsWords(4, '')).toBe('4');
    expect(unitsWords(4, 'slots')).toBe('4 slots');
  });
});
