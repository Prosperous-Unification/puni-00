import { describe, expect, it } from 'vitest';

import { createRetirementJoin, RetirementJoinClosedError } from './retirement-join';

/** A retirement the case settles by hand. */
function heldRetirement() {
  let settle: () => void = () => undefined;
  let refuse: (failure: Error) => void = () => undefined;
  const retirement = new Promise<void>((resolve, reject) => {
    settle = resolve;
    refuse = reject;
  });
  return { retirement, settle, refuse };
}

describe('the application’s retirement join', () => {
  it('settles at once when nothing was joined', async () => {
    await expect(createRetirementJoin().settle()).resolves.toBeUndefined();
  });

  it('waits for every joined retirement before it settles', async () => {
    const join = createRetirementJoin();
    const held = heldRetirement();
    const seen: string[] = [];
    join.join(held.retirement);

    const settling = join.settle().then(() => seen.push('settled'));
    await Promise.resolve();
    seen.push('session given back');
    held.settle();
    await settling;

    expect(seen).toEqual(['session given back', 'settled']);
  });

  it('waits for a retirement joined while it waits', async () => {
    const join = createRetirementJoin();
    const first = heldRetirement();
    const late = heldRetirement();
    const seen: string[] = [];
    join.join(first.retirement);
    const settling = join.settle().then(() => seen.push('settled'));

    join.join(late.retirement);
    first.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    seen.push('joined late');
    late.settle();
    await settling;

    expect(seen).toEqual(['joined late', 'settled']);
  });

  it('fails when a joined retirement failed, whenever it failed', async () => {
    const join = createRetirementJoin();
    const early = heldRetirement();
    join.join(early.retirement);
    early.refuse(new Error('the session could not be given back'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(join.settle()).rejects.toBeInstanceOf(AggregateError);
  });

  it('refuses a retirement handed to it once it has settled', async () => {
    const join = createRetirementJoin();
    await join.settle();

    expect(() => {
      join.join(Promise.resolve());
    }).toThrow(RetirementJoinClosedError);
  });
});
