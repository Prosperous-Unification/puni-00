import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  type CapacityReport,
  type CapacityReportBody,
  type CapacityReportFacts,
  capacityReportStateOf,
  compareCapacity,
  decideCapacityReport,
  REPORT_FUTURE_TOLERANCE_MS,
} from './compute-provider';

const NOW = 1_800_000_000_000;
const ORG_A = 'org-a';
const H4CLAW = 'provider-h4claw';

const body = (over: Partial<CapacityReportBody> = {}): CapacityReportBody => ({
  observedAt: NOW - 1000,
  cadenceSeconds: 300,
  outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
  ...over,
});

const facts = (over: Partial<CapacityReportFacts> = {}): CapacityReportFacts => ({
  personKind: 'agent',
  provider: { organizationId: ORG_A },
  resource: { organizationId: ORG_A, providerId: H4CLAW, stored: null },
  ...over,
});

const request = (reportBody: CapacityReportBody = body(), now = NOW) => ({
  organizationId: ORG_A,
  personId: 'dash-a',
  providerId: H4CLAW,
  resourceId: 'h4claw-ram',
  body: reportBody,
  now,
});

const stored = (observedAt: number, over: Partial<CapacityReport> = {}): CapacityReport => ({
  ...body({ observedAt }),
  providerId: H4CLAW,
  reportedBy: 'dash-a',
  reportedAt: observedAt + 5,
  ...over,
});

describe('decideCapacityReport', () => {
  it('stores the first report with its instance, sender and arrival', () => {
    expect(decideCapacityReport(facts(), request())).toEqual({
      kind: 'store',
      report: { ...body(), providerId: H4CLAW, reportedBy: 'dash-a', reportedAt: NOW },
    });
  });

  it('refuses a key pinned to a person of kind person', () => {
    expect(decideCapacityReport(facts({ personKind: 'person' }), request())).toEqual({
      kind: 'refused',
      refusal: { kind: 'not_an_agent_principal', personKind: 'person' },
    });
  });

  it('refuses an observedAt beyond the skew tolerance and admits one at it', () => {
    const ahead = body({ observedAt: NOW + REPORT_FUTURE_TOLERANCE_MS + 1 });
    expect(decideCapacityReport(facts(), request(ahead))).toEqual({
      kind: 'refused',
      refusal: { kind: 'observedAt_in_future', skewMs: REPORT_FUTURE_TOLERANCE_MS + 1 },
    });
    const atTolerance = body({ observedAt: NOW + REPORT_FUTURE_TOLERANCE_MS });
    expect(decideCapacityReport(facts(), request(atTolerance)).kind).toBe('store');
  });

  it("answers another organization's instance unknown_provider, and an absent one alike", () => {
    const foreign = facts({ provider: { organizationId: 'org-b' } });
    expect(decideCapacityReport(foreign, request())).toEqual({
      kind: 'refused',
      refusal: { kind: 'unknown_provider' },
    });
    expect(decideCapacityReport(facts({ provider: null }), request())).toEqual(
      decideCapacityReport(foreign, request()),
    );
  });

  it('answers a resource the organization does not hold not_found, a legacy one alike', () => {
    expect(decideCapacityReport(facts({ resource: null }), request()).kind).toBe('refused');
    const legacy = facts({ resource: { organizationId: null, providerId: H4CLAW, stored: null } });
    expect(decideCapacityReport(legacy, request())).toEqual({
      kind: 'refused',
      refusal: { kind: 'not_found' },
    });
  });

  it('refuses a resource that names another instance, naming the one it holds', () => {
    const other = facts({
      resource: { organizationId: ORG_A, providerId: 'provider-h2puni', stored: null },
    });
    expect(decideCapacityReport(other, request())).toEqual({
      kind: 'refused',
      refusal: { kind: 'provider_mismatch', providerId: 'provider-h2puni' },
    });
    const none = facts({ resource: { organizationId: ORG_A, providerId: null, stored: null } });
    expect(decideCapacityReport(none, request())).toEqual({
      kind: 'refused',
      refusal: { kind: 'provider_mismatch', providerId: null },
    });
  });

  it('keeps the stored report when the same body arrives again', () => {
    const kept = stored(NOW - 1000, { reportedAt: NOW - 900 });
    const again = facts({ resource: { organizationId: ORG_A, providerId: H4CLAW, stored: kept } });
    expect(decideCapacityReport(again, request())).toEqual({ kind: 'unchanged', report: kept });
  });

  it('refuses an older report, and another body at the stored instant, as superseded', () => {
    const newer = stored(NOW - 1000);
    const held = facts({ resource: { organizationId: ORG_A, providerId: H4CLAW, stored: newer } });
    expect(decideCapacityReport(held, request(body({ observedAt: NOW - 301_000 })))).toEqual({
      kind: 'refused',
      refusal: { kind: 'report_superseded', storedObservedAt: NOW - 1000 },
    });
    const otherBody = body({ outcome: { kind: 'unreachable', reason: 'ssh: timed out' } });
    expect(decideCapacityReport(held, request(otherBody))).toEqual({
      kind: 'refused',
      refusal: { kind: 'report_superseded', storedObservedAt: NOW - 1000 },
    });
  });

  it('keeps the newest observedAt over any sequence of reports', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            observedAt: fc.integer({ min: NOW - 10_000_000, max: NOW }),
            capacityUnits: fc.integer({ min: 0, max: 64 }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (sequence) => {
          let kept: CapacityReport | null = null;
          let newestAccepted = -Infinity;
          for (const { observedAt, capacityUnits } of sequence) {
            const decision = decideCapacityReport(
              facts({ resource: { organizationId: ORG_A, providerId: H4CLAW, stored: kept } }),
              request(
                body({ observedAt, outcome: { kind: 'measured', capacityUnits, usageUnits: 0 } }),
              ),
            );
            if (decision.kind === 'store') {
              if (kept !== null)
                expect(decision.report.observedAt).toBeGreaterThan(kept.observedAt);
              kept = decision.report;
              newestAccepted = Math.max(newestAccepted, observedAt);
            }
          }
          expect(kept?.observedAt).toBe(newestAccepted);
          expect(newestAccepted).toBe(Math.max(...sequence.map((each) => each.observedAt)));
        },
      ),
    );
  });
});

describe('capacityReportStateOf', () => {
  it('reads no_report before the first report', () => {
    expect(capacityReportStateOf(null, NOW)).toBe('no_report');
  });

  it('marks stale only past three cadences', () => {
    const report = stored(NOW - 900_000);
    expect(capacityReportStateOf(report, NOW)).toBe('measured');
    expect(capacityReportStateOf(report, NOW + 1)).toBe('stale');
  });

  it('reads an unreachable report as unreachable, never as a capacity', () => {
    const unreachable = stored(NOW - 1000, {
      outcome: { kind: 'unreachable', reason: 'ssh: connect timed out' },
    });
    expect(capacityReportStateOf(unreachable, NOW)).toBe('unreachable');
    expect(compareCapacity(32, unreachable, NOW)).toEqual({
      declared: 32,
      measured: null,
      measuredAt: NOW - 1000,
      state: 'unreachable',
    });
  });

  it('shows the declared and measured figures side by side', () => {
    expect(compareCapacity(32, stored(NOW - 240_000), NOW)).toEqual({
      declared: 32,
      measured: 15,
      measuredAt: NOW - 240_000,
      state: 'measured',
    });
    expect(compareCapacity(null, null, NOW)).toEqual({
      declared: null,
      measured: null,
      measuredAt: null,
      state: 'no_report',
    });
  });
});
