import { describe, expect, it } from 'vitest';

import { sendableTrio, trioProblem, type TypedTrio } from './estimate-draft';

const trio = (optimistic: string, realistic: string, pessimistic: string): TypedTrio => ({
  optimistic,
  realistic,
  pessimistic,
});

describe('trioProblem', () => {
  it('says nothing about a row nobody has estimated', () => {
    expect(trioProblem(trio('', '', ''))).toBeNull();
    expect(trioProblem(trio('  ', '', ' '))).toBeNull();
  });

  it('says nothing about an ordered trio, including equal figures', () => {
    expect(trioProblem(trio('1', '2', '3'))).toBeNull();
    expect(trioProblem(trio('5', '5', '5'))).toBeNull();
    expect(trioProblem(trio('0.5', '1.5', '2'))).toBeNull();
  });

  it('names both members of the pair that breaks the order', () => {
    // Which single box is wrong in 5/3/10 is not answerable — the pair is.
    expect(trioProblem(trio('5', '3', '10'))?.points).toEqual(['optimistic', 'realistic']);
    expect(trioProblem(trio('1', '9', '3'))?.points).toEqual(['realistic', 'pessimistic']);
    expect(trioProblem(trio('9', '5', '1'))?.points).toEqual([
      'optimistic',
      'realistic',
      'pessimistic',
    ]);
  });

  it('names the empty boxes of a half-filled trio', () => {
    // be-01 stores a trio or nothing, so this saves nothing — and an unsaved
    // estimate that looks saved is worse than a visible complaint.
    expect(trioProblem(trio('5', '', ''))?.points).toEqual(['realistic', 'pessimistic']);
    expect(trioProblem(trio('1', '2', ''))?.message).toContain('not saved');
  });

  it('names what cannot be a number of days', () => {
    expect(trioProblem(trio('two', '3', '4'))?.points).toEqual(['optimistic']);
    expect(trioProblem(trio('1', '-2', '4'))?.points).toEqual(['realistic']);
  });
});

describe('sendableTrio', () => {
  it('sends exactly what was typed, unrepaired', () => {
    expect(sendableTrio(trio('1', '2', '3'))).toEqual({
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
  });

  it('sends nothing for an empty trio', () => {
    expect(sendableTrio(trio('', '', ''))).toBeNull();
  });

  it('sends nothing rather than repairing a broken one', () => {
    // The old `keepOrdered` turned 5/0/0 into 5/5/5 and sent it. The number a
    // person did not type must never become the number the plan carries.
    expect(sendableTrio(trio('5', '0', '0'))).toBeNull();
    expect(sendableTrio(trio('5', '', ''))).toBeNull();
    expect(sendableTrio(trio('5', '3', '10'))).toBeNull();
  });
});
