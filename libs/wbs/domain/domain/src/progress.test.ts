import { describe, expect, it } from 'bun:test';

import {
  agree,
  foldStatuses,
  HOLDS,
  isHold,
  isReadiness,
  isSettableStatus,
  isStepState,
  leafStatusOf,
  READINESSES,
  SETTABLE_STATUSES,
  statusOf,
  UNKNOWN,
} from './progress';

describe('agree', () => {
  it('answers the status both readings hold', () => {
    expect(agree('done', 'done')).toBe('done');
    expect(agree('in_progress', 'in_progress')).toBe('in_progress');
    expect(agree(UNKNOWN, UNKNOWN)).toBe(UNKNOWN);
  });

  it('answers in progress for every disagreement, including finished against untouched', () => {
    // The rule the whole module is: Dev finished and QA silent is neither a
    // finished item nor an untouched one.
    //
    // Proof: `agree` written as `a === 'done' || b === 'done' ? 'done' : …` and
    // this case fails with `done` where `in_progress` is owed — a plan
    // reporting work as finished that nobody has tested; watched 2026-08-18.
    expect(agree('done', UNKNOWN)).toBe('in_progress');
    expect(agree(UNKNOWN, 'done')).toBe('in_progress');
    expect(agree('done', 'in_progress')).toBe('in_progress');
    expect(agree(UNKNOWN, 'in_progress')).toBe('in_progress');
  });

  it('is associative, which is what lets a branch be folded from its children', () => {
    // A parent folded from its children's states and the same parent folded
    // from every step beneath it must answer the same thing, or the tree has
    // two readings and the one on screen depends on the traversal.
    const statuses = [UNKNOWN, 'in_progress', 'done'] as const;
    for (const a of statuses) {
      for (const b of statuses) {
        for (const c of statuses) {
          expect(agree(agree(a, b), c)).toBe(agree(a, agree(b, c)));
          expect(agree(a, b)).toBe(agree(b, a));
        }
      }
    }
  });
});

describe('statusOf', () => {
  it('reads an empty collection as unknown, never as vacuously done', () => {
    // An item with no steps, a branch with no leaves, a plan on its first day.
    // Proof: `answer ?? 'done'` and this fails with `done` — every empty branch
    // in a fresh plan reporting finished work; watched 2026-08-18.
    expect(statusOf([])).toBe(UNKNOWN);
  });

  it('is done only when every reading is', () => {
    expect(statusOf(['done', 'done', 'done'])).toBe('done');
    expect(statusOf(['done', 'done', UNKNOWN])).toBe('in_progress');
    expect(statusOf(['done', 'in_progress'])).toBe('in_progress');
  });

  it('is unknown only when nothing has been said at all', () => {
    expect(statusOf([UNKNOWN, UNKNOWN])).toBe(UNKNOWN);
    expect(statusOf([UNKNOWN, 'in_progress'])).toBe('in_progress');
  });

  it('carries one reading through unchanged', () => {
    expect(statusOf(['done'])).toBe('done');
    expect(statusOf(['in_progress'])).toBe('in_progress');
    expect(statusOf([UNKNOWN])).toBe(UNKNOWN);
  });
});

describe('isStepState', () => {
  it('admits the two states a step may be stored in and nothing else', () => {
    expect(isStepState('in_progress')).toBe(true);
    expect(isStepState('done')).toBe(true);
    // The absence of a row is how "not started" is spelled, so it is not a
    // value anybody may write — see `StepState`.
    expect(isStepState('not_started')).toBe(false);
    expect(isStepState('unknown')).toBe(false);
    expect(isStepState('blocked')).toBe(false);
    expect(isStepState('')).toBe(false);
    expect(isStepState(null)).toBe(false);
    expect(isStepState(1)).toBe(false);
  });
});

describe('isSettableStatus', () => {
  it('admits the seven statuses a row may be set to, in menu order, and nothing else', () => {
    expect(SETTABLE_STATUSES).toEqual([
      'draft',
      'ready',
      'in_progress',
      'on_hold',
      'blocked',
      'done',
      'unknown',
    ]);
    for (const status of SETTABLE_STATUSES) expect(isSettableStatus(status)).toBe(true);
    // Said by the dependency graph, never by anyone.
    expect(isSettableStatus('blocked_by_proxy')).toBe(false);
    expect(isSettableStatus('not_started')).toBe(false);
    expect(isSettableStatus(null)).toBe(false);
  });
});

describe('isReadiness and isHold', () => {
  it('admit exactly their own closed sets', () => {
    for (const readiness of READINESSES) expect(isReadiness(readiness)).toBe(true);
    for (const hold of HOLDS) expect(isHold(hold)).toBe(true);
    // A hold is not a readiness and neither is a status the steps own.
    for (const other of [
      'on_hold',
      'blocked',
      'done',
      'unknown',
      'blocked_by_proxy',
      '',
      null,
      1,
    ]) {
      expect(isReadiness(other)).toBe(false);
    }
    for (const other of ['draft', 'ready', 'paused', 'done', 'blocked_by_proxy', '', null, 1]) {
      expect(isHold(other)).toBe(false);
    }
  });
});

describe('leafStatusOf', () => {
  it('reads unknown when nothing has been said', () => {
    expect(leafStatusOf({ progress: UNKNOWN, hold: null, readiness: null })).toBe(UNKNOWN);
  });

  it('reads the readiness when neither the steps nor a hold have spoken', () => {
    expect(leafStatusOf({ progress: UNKNOWN, hold: null, readiness: 'draft' })).toBe('draft');
    expect(leafStatusOf({ progress: UNKNOWN, hold: null, readiness: 'ready' })).toBe('ready');
  });

  it('lets running work outrank readiness', () => {
    expect(leafStatusOf({ progress: 'in_progress', hold: null, readiness: 'ready' })).toBe(
      'in_progress',
    );
  });

  it('lets a hold outrank running work, so resuming returns to it', () => {
    expect(leafStatusOf({ progress: 'in_progress', hold: 'on_hold', readiness: null })).toBe(
      'on_hold',
    );
    expect(leafStatusOf({ progress: UNKNOWN, hold: 'blocked', readiness: 'ready' })).toBe(
      'blocked',
    );
  });

  it('lets done outrank a hold', () => {
    expect(leafStatusOf({ progress: 'done', hold: 'blocked', readiness: 'ready' })).toBe('done');
  });
});

describe('foldStatuses', () => {
  it('reads a parent with no children as unknown, never as vacuously done', () => {
    expect(foldStatuses([])).toBe(UNKNOWN);
  });

  it('is done, on hold or blocked only when every child is', () => {
    expect(foldStatuses(['done', 'done'])).toBe('done');
    expect(foldStatuses(['on_hold', 'on_hold'])).toBe('on_hold');
    expect(foldStatuses(['blocked', 'blocked'])).toBe('blocked');
  });

  it('is in progress when any child has started, whatever the others say', () => {
    expect(foldStatuses(['done', 'on_hold'])).toBe('in_progress');
    expect(foldStatuses(['in_progress', 'blocked', 'ready'])).toBe('in_progress');
    expect(foldStatuses(['done', UNKNOWN])).toBe('in_progress');
  });

  it('is blocked by proxy when every child is stopped but not all the same way', () => {
    expect(foldStatuses(['on_hold', 'blocked'])).toBe('blocked_by_proxy');
    expect(foldStatuses(['blocked_by_proxy', 'on_hold'])).toBe('blocked_by_proxy');
    expect(foldStatuses(['blocked_by_proxy'])).toBe('blocked_by_proxy');
  });

  it('reads the unstopped children otherwise: unknown, then draft, then ready', () => {
    expect(foldStatuses(['on_hold', 'ready'])).toBe('ready');
    expect(foldStatuses(['blocked_by_proxy', 'ready', 'draft'])).toBe('draft');
    expect(foldStatuses(['ready', 'draft', UNKNOWN, 'blocked'])).toBe(UNKNOWN);
    expect(foldStatuses(['ready', 'ready'])).toBe('ready');
  });
});
