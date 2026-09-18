import { describe, expect, it } from 'bun:test';

import { type DnsRecordSet, planDnsChange } from './platform-dns';

const zone = 'bulletpoints.club';
const production: DnsRecordSet = {
  name: 'wbs.bulletpoints.club',
  type: 'A',
  ttl: 3600,
  values: ['203.0.113.10'],
};

describe('planDnsChange', () => {
  it('plans a staging host and a production cutover with an exact rollback', () => {
    const plan = planDnsChange(
      zone,
      [production],
      [
        { ...production, ttl: 300, values: ['198.51.100.20'] },
        { name: 'wbs-staging.bulletpoints.club', type: 'A', ttl: 300, values: ['198.51.100.20'] },
      ],
    );
    expect(plan.changes.map(({ action, next }) => [action, next?.name])).toEqual([
      ['create', 'wbs-staging.bulletpoints.club'],
      ['update', 'wbs.bulletpoints.club'],
    ]);
    expect(plan.rollback).toEqual([
      { action: 'update', previous: plan.changes[1]?.next ?? null, next: production },
      { action: 'delete', previous: plan.changes[0]?.next ?? null, next: null },
    ]);
    expect(plan.propagationWaitSeconds).toBe(3600);
  });

  it('plans nothing when the record sets already match', () => {
    expect(planDnsChange(zone, [production], [production]).changes).toEqual([]);
  });

  it('refuses a record outside the zone', () => {
    // Proof: removing the zone-suffix check made this negative resolve on 2026-09-18.
    expect(() => planDnsChange(zone, [], [{ ...production, name: 'wbs.example.com' }])).toThrow(
      /outside zone bulletpoints\.club/,
    );
  });

  it('refuses a duplicated record set', () => {
    expect(() => planDnsChange(zone, [production, production], [])).toThrow(/twice/);
  });
});
