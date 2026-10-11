import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  isNodeReading,
  NODE_READINGS,
  type NodeFacts,
  type NodeReading,
  nodeReadingOf,
} from './node-reading';
import { HOLDS, STEP_STATES } from './progress';

/** A node nobody has said anything about, with no predecessor and no attempt. */
const silent: NodeFacts = {
  participation: null,
  statement: null,
  rowHold: null,
  runningAttempt: false,
  rowBlockedByProxy: false,
  predecessors: [],
};

const read = (facts: Partial<NodeFacts>): NodeReading => nodeReadingOf({ ...silent, ...facts });

describe('NODE_READINGS', () => {
  it('NODE_READINGS has eight words', () => {
    expect(NODE_READINGS).toEqual([
      'skipped',
      'done',
      'on_hold',
      'blocked',
      'in_progress',
      'blocked_by_proxy',
      'waiting',
      'unknown',
    ]);
    for (const reading of NODE_READINGS) expect(isNodeReading(reading)).toBe(true);
    for (const stranger of ['paused', 'ready', 'draft', '', null, 3]) {
      expect(isNodeReading(stranger)).toBe(false);
    }
  });
});

describe('nodeReadingOf, one clause at a time in order', () => {
  it('a skipped node reads skipped whatever else is said', () => {
    expect(
      read({
        participation: 'skipped',
        statement: 'done',
        rowHold: 'on_hold',
        runningAttempt: true,
        rowBlockedByProxy: true,
        predecessors: ['done'],
      }),
    ).toBe('skipped');
  });

  it('done outranks the row hold and a running attempt', () => {
    expect(read({ statement: 'done', rowHold: 'blocked', runningAttempt: true })).toBe('done');
    expect(read({ participation: 'included', statement: 'done' })).toBe('done');
  });

  it("the row's hold shows on its nodes", () => {
    // Hold over in progress: the planner's later word about work the node said
    // had started; clearing the hold returns the node to in progress.
    expect(read({ statement: 'in_progress', rowHold: 'on_hold' })).toBe('on_hold');
    expect(read({ runningAttempt: true, rowHold: 'blocked' })).toBe('blocked');
    expect(read({ statement: 'in_progress', rowHold: null })).toBe('in_progress');
  });

  it('a running attempt reads in progress', () => {
    expect(read({ runningAttempt: true, predecessors: ['done'] })).toBe('in_progress');
    expect(read({ statement: 'in_progress', rowBlockedByProxy: true })).toBe('in_progress');
  });

  it('a silent node of a row blocked by proxy reads blocked by proxy', () => {
    expect(read({ rowBlockedByProxy: true, predecessors: ['done'] })).toBe('blocked_by_proxy');
  });

  it('QA waits on a finished Dev', () => {
    expect(read({ predecessors: ['done'] })).toBe('waiting');
  });

  it('waits on two done predecessors', () => {
    expect(read({ predecessors: ['done', 'done'] })).toBe('waiting');
  });

  it('a first node is never waiting', () => {
    expect(read({ predecessors: [] })).toBe('unknown');
  });

  it('a predecessor not done leaves the node unknown', () => {
    for (const other of NODE_READINGS.filter((reading) => reading !== 'done')) {
      expect(read({ predecessors: ['done', other] })).toBe('unknown');
    }
  });
});

describe('skipped before participation exists', () => {
  it('skipped is never produced with participation null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, ...STEP_STATES),
        fc.constantFrom(null, ...HOLDS),
        fc.boolean(),
        fc.boolean(),
        fc.array(fc.constantFrom(...NODE_READINGS), { maxLength: 4 }),
        (statement, rowHold, runningAttempt, rowBlockedByProxy, predecessors) =>
          nodeReadingOf({
            participation: null,
            statement,
            rowHold,
            runningAttempt,
            rowBlockedByProxy,
            predecessors,
          }) !== 'skipped',
      ),
    );
  });
});
