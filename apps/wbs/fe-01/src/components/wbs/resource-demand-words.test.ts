import { describe, expect, it } from 'vitest';

import { demandsByWorkItem, demandSummary, demandWords } from './resource-demand-words';

const ram = { id: 'r-ram', name: 'RAM', kind: 'divisible' as const, unitLabel: 'GiB' };
const staging = { id: 'r-stg', name: 'staging', kind: 'exclusive' as const, unitLabel: 'env' };
const slots = { id: 'r-slot', name: 'agent slots', kind: 'divisible' as const, unitLabel: '' };

describe('a row’s demands in words', () => {
  it('names an exclusive resource alone and a divisible one with its units', () => {
    expect(demandWords({ ...staging, resourceId: staging.id, units: 1 })).toBe('staging');
    expect(demandWords({ ...ram, resourceId: ram.id, units: 6 })).toBe('RAM 6 GiB');
    expect(demandWords({ ...slots, resourceId: slots.id, units: 2 })).toBe('agent slots 2');
  });

  it('joins a row’s demands with a middle dot, by resource name', () => {
    const byItem = demandsByWorkItem({
      demands: [
        { workItemId: 'w1', resourceId: staging.id, units: 1 },
        { workItemId: 'w1', resourceId: ram.id, units: 6 },
        { workItemId: 'w2', resourceId: ram.id, units: 2 },
      ],
      demandedResources: [ram, staging],
    });
    expect(demandSummary(byItem.get('w1') ?? [])).toBe('RAM 6 GiB · staging');
    expect(demandSummary(byItem.get('w2') ?? [])).toBe('RAM 2 GiB');
    expect(byItem.get('w3')).toBeUndefined();
  });

  it('reads a tree with no demands as none, the payload of a plan stating none', () => {
    expect(demandsByWorkItem({}).size).toBe(0);
  });

  it('throws on a demand naming a resource the same read does not list', () => {
    // Proof: with the throw replaced by `continue`, this failed on `expected
    // [Function] to throw an error`: the row was silently dropped; watched 2026-10-25.
    expect(() =>
      demandsByWorkItem({
        demands: [{ workItemId: 'w1', resourceId: 'r-gone', units: 1 }],
        demandedResources: [ram],
      }),
    ).toThrow(/r-gone/);
  });
});
