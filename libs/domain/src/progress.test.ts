import { describe, expect, it } from 'bun:test';

import { agree, isStepState, NOT_STARTED, stateOf } from './progress';

describe('agree', () => {
  it('answers the state both readings hold', () => {
    expect(agree('done', 'done')).toBe('done');
    expect(agree('in_progress', 'in_progress')).toBe('in_progress');
    expect(agree(NOT_STARTED, NOT_STARTED)).toBe(NOT_STARTED);
  });

  it('answers in progress for every disagreement, including finished against untouched', () => {
    // The rule the whole module is: Dev finished and QA silent is neither a
    // finished item nor an untouched one.
    //
    // Proof: `agree` written as `a === 'done' || b === 'done' ? 'done' : …` and
    // this case fails with `done` where `in_progress` is owed — a plan
    // reporting work as finished that nobody has tested; watched 2026-08-18.
    expect(agree('done', NOT_STARTED)).toBe('in_progress');
    expect(agree(NOT_STARTED, 'done')).toBe('in_progress');
    expect(agree('done', 'in_progress')).toBe('in_progress');
    expect(agree(NOT_STARTED, 'in_progress')).toBe('in_progress');
  });

  it('is associative, which is what lets a branch be folded from its children', () => {
    // A parent folded from its children's states and the same parent folded
    // from every step beneath it must answer the same thing, or the tree has
    // two readings and the one on screen depends on the traversal.
    const states = [NOT_STARTED, 'in_progress', 'done'] as const;
    for (const a of states) {
      for (const b of states) {
        for (const c of states) {
          expect(agree(agree(a, b), c)).toBe(agree(a, agree(b, c)));
          expect(agree(a, b)).toBe(agree(b, a));
        }
      }
    }
  });
});

describe('stateOf', () => {
  it('reads an empty collection as not started, never as vacuously done', () => {
    // An item with no steps, a branch with no leaves, a plan on its first day.
    // Proof: `answer ?? 'done'` and this fails with `done` — every empty branch
    // in a fresh plan reporting finished work; watched 2026-08-18.
    expect(stateOf([])).toBe(NOT_STARTED);
  });

  it('is done only when every reading is', () => {
    expect(stateOf(['done', 'done', 'done'])).toBe('done');
    expect(stateOf(['done', 'done', NOT_STARTED])).toBe('in_progress');
    expect(stateOf(['done', 'in_progress'])).toBe('in_progress');
  });

  it('is not started only when nothing has been said at all', () => {
    expect(stateOf([NOT_STARTED, NOT_STARTED])).toBe(NOT_STARTED);
    expect(stateOf([NOT_STARTED, 'in_progress'])).toBe('in_progress');
  });

  it('carries one reading through unchanged', () => {
    expect(stateOf(['done'])).toBe('done');
    expect(stateOf(['in_progress'])).toBe('in_progress');
    expect(stateOf([NOT_STARTED])).toBe(NOT_STARTED);
  });
});

describe('isStepState', () => {
  it('admits the two states a step may be stored in and nothing else', () => {
    expect(isStepState('in_progress')).toBe(true);
    expect(isStepState('done')).toBe(true);
    // The absence of a row is how "not started" is spelled, so it is not a
    // value anybody may write — see `StepState`.
    expect(isStepState('not_started')).toBe(false);
    expect(isStepState('blocked')).toBe(false);
    expect(isStepState('')).toBe(false);
    expect(isStepState(null)).toBe(false);
    expect(isStepState(1)).toBe(false);
  });
});
