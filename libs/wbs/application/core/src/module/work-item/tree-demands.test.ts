import type { Demand, Resource } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { namedDemandFields, readUntilNamed, withDemands } from './tree-demands';

const ram: Resource = { id: 'r-ram', name: 'ram', kind: 'divisible', unitLabel: 'GB' };
const staging: Resource = { id: 'r-stg', name: 'staging', kind: 'exclusive', unitLabel: 'env' };
const onRam: Demand = { workItemId: 'w1', resourceId: ram.id, units: 4 };
const onStaging: Demand = { workItemId: 'w1', resourceId: staging.id, units: 1 };

/** A read answering each queued answer once, then the last one again. */
function reads<T>(...answers: T[]): { read: () => Promise<T>; calls: () => number } {
  let calls = 0;
  return {
    read: () => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      if (answer === undefined) throw new Error('no answer queued');
      return Promise.resolve(answer);
    },
    calls: () => calls,
  };
}

describe('the demand fields of the tree read', () => {
  it('names each demanded resource once, and adds nothing for a plan stating none', () => {
    expect(withDemands([onStaging, onRam], [ram, staging])).toEqual({
      demands: [onStaging, onRam].sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
      demandedResources: [ram, staging],
    });
    expect(withDemands([], [ram])).toEqual({});
  });

  it('throws on a demand naming a resource the catalog does not hold', () => {
    // Proof: with the throw replaced by dropping the entry, this and `throws
    // when the two reads still disagree` failed (no throw); watched 2026-10-25.
    expect(() => withDemands([onStaging], [ram])).toThrow(/r-stg/);
  });

  it('reads the catalog only when something is demanded', async () => {
    const catalog = reads<Resource[]>([ram]);
    expect(await namedDemandFields(reads<Demand[]>([]).read, catalog.read)).toEqual({});
    expect(catalog.calls()).toBe(0);
  });

  it('reads both again once when a removal landed between them, and converges', async () => {
    // A cascade removing staging lands after the demands were read and before
    // the catalog was: the second pair agrees.
    // Proof: with no second pair (the first answered as is), this rejected on
    // `r-stg`; watched 2026-10-25.
    const demands = reads<Demand[]>([onRam, onStaging], [onRam]);
    const catalog = reads<Resource[]>([ram], [ram]);
    expect(await namedDemandFields(demands.read, catalog.read)).toEqual({
      demands: [onRam],
      demandedResources: [ram],
    });
    expect([demands.calls(), catalog.calls()]).toEqual([2, 2]);
  });

  it('throws when the two reads still disagree on the second pair', async () => {
    // The second pair's verdict is `withDemands`' own throw (proof above).
    const demands = reads<Demand[]>([onStaging]);
    const catalog = reads<Resource[]>([ram]);
    const failure = await namedDemandFields(demands.read, catalog.read).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/r-stg/);
  });
});

describe('a read whose resources the catalog must name', () => {
  const named = (ids: readonly string[]) => ids;

  it('reads no catalog when the read names no resource', async () => {
    const catalog = reads<Resource[]>([ram]);
    expect(await readUntilNamed(reads<string[]>([]).read, catalog.read, named)).toEqual({
      answer: [],
      catalog: [],
    });
    expect(catalog.calls()).toBe(0);
  });

  it('reads both again once when a removal landed between them', async () => {
    // Proof: with the second read dropped (the first answer returned with its
    // catalog), this failed on `answer: [ 'r-stg' ]`; watched 2026-10-25.
    const tree = reads<string[]>([staging.id], []);
    const catalog = reads<Resource[]>([ram]);
    expect(await readUntilNamed(tree.read, catalog.read, named)).toEqual({
      answer: [],
      catalog: [],
    });
    expect(tree.calls()).toBe(2);
  });

  it('answers the second pair as it is, for its labeller to refuse', async () => {
    const tree = reads<string[]>([staging.id]);
    const catalog = reads<Resource[]>([ram]);
    expect(await readUntilNamed(tree.read, catalog.read, named)).toEqual({
      answer: [staging.id],
      catalog: [ram],
    });
    expect([tree.calls(), catalog.calls()]).toEqual([2, 2]);
  });
});
