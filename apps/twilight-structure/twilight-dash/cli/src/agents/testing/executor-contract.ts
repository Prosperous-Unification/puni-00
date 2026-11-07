import { describe, expect, test } from 'bun:test';

import { attemptId, decisionId } from '../../runs/record-codecs';
import type {
  ActivityExecutor,
  ExecutorLocator,
  Preparation,
  TurnOutcome,
  TurnReply,
  TurnRequest,
} from '../activity-executor';

type TurnControl = Parameters<ActivityExecutor['turn']>[2];
type StreamPart = Parameters<TurnControl['onPart']>[0];

/**
 * Supplies real adapter instances and probes at their allocation/backend boundaries.
 * Expected values come from the dependency script, independently of executor replies.
 * Each factory call owns fresh state; a second instance must enforce actual ownership.
 */
export interface ExecutorFixture {
  readonly executor: ActivityExecutor;
  readonly preparation: Preparation;
  readonly initialRequest: TurnRequest;
  readonly expectedSession: ExecutorLocator['session'];
  readonly expectedOutcome: TurnOutcome;
  readonly expectedTextParts: readonly Extract<StreamPart, { type: 'text-delta' }>[];
  readonly allocationCount: () => number;
  readonly dispatchCount: () => number;
  readonly createOtherExecutor: () => ActivityExecutor;
}

/** Held real dependencies must be released and every started turn drained even on assertion failure. */
export interface HeldExecutorFixture extends ExecutorFixture {
  readonly entered: Promise<undefined>;
  readonly secondEntered: Promise<undefined>;
  release(): void;
}

const signal = () => new AbortController().signal;
const aborted = () => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};
const control = (): TurnControl => ({ signal: signal(), onPart: () => undefined });
const decision = (request: TurnRequest, turnKey = 'decision'): TurnRequest => ({
  ...request,
  turnKey,
  cause: { kind: 'decision', decisionId: decisionId('decision') },
});

async function open(executor: ActivityExecutor, preparation: Preparation) {
  const opened = await executor.open(preparation, signal());
  if (opened.kind !== 'opened') throw new Error('expected local session');
  return opened.session;
}

/** Registers the public lifecycle oracle once per real adapter; it makes no durable recovery claim. */
export function executorContract(
  name: string,
  fixtures: {
    createFixture(): ExecutorFixture;
    createHeldFixture(): HeldExecutorFixture;
  },
): void {
  describe(name + ' executor lifecycle', () => {
    test('open creates a portable local session without dispatch and replays exact preparation', async () => {
      const { executor, preparation, allocationCount, dispatchCount, expectedSession } =
        fixtures.createFixture();
      const session = await open(executor, preparation);
      try {
        expect(session.locator.session).toEqual(expectedSession);
        expect(JSON.parse(JSON.stringify(session.locator))).toEqual(session.locator);
        expect(await executor.open(structuredClone(preparation), aborted())).toEqual({
          kind: 'opened',
          session,
        });
        expect(
          executor.open({ ...preparation, attemptId: attemptId('changed') }, aborted()),
        ).rejects.toThrow();
        expect(allocationCount()).toBe(1);
        expect(dispatchCount()).toBe(0);
      } finally {
        await executor.close(session);
      }
    });

    test('fresh pre-aborted creation remains unbound and allocates no ID', async () => {
      const { executor, preparation, allocationCount, dispatchCount } = fixtures.createFixture();
      expect(await executor.open(preparation, aborted())).toEqual({
        kind: 'not_started',
        reason: 'cancelled_before_dispatch',
      });
      expect(allocationCount()).toBe(0);
      const changed = { ...preparation, attemptId: attemptId('changed') };
      const session = await open(executor, changed);
      try {
        expect(session.locator.preparation).toEqual(changed);
        expect(allocationCount()).toBe(1);
        expect(dispatchCount()).toBe(0);
      } finally {
        await executor.close(session);
      }
    });

    test('completed exact replay emits no UI or dispatch and rejects changed payload before aborted signal', async () => {
      const {
        executor,
        preparation,
        initialRequest,
        dispatchCount,
        expectedOutcome,
        expectedTextParts,
      } = fixtures.createFixture();
      const session = await open(executor, preparation);
      try {
        const parts: StreamPart[] = [];
        const first = await executor.turn(session, initialRequest, {
          signal: signal(),
          onPart: (part) => parts.push(part),
        });
        expect(first).toMatchObject({ kind: 'completed', outcome: expectedOutcome });
        expect(parts.filter((part) => part.type === 'text-delta')).toEqual([...expectedTextParts]);
        const duplicates: StreamPart[] = [];
        expect(
          await executor.turn(session, structuredClone(initialRequest), {
            signal: aborted(),
            onPart: (part) => duplicates.push(part),
          }),
        ).toEqual(first);
        // Proof: removing recorded payload comparison replays changed input instead of rejecting.
        for (const changed of [
          { ...initialRequest, input: 'changed' },
          { ...initialRequest, owner: { ...initialRequest.owner, epoch: 2 } },
          decision(initialRequest, initialRequest.turnKey),
        ])
          expect(
            executor.turn(session, changed, { ...control(), signal: aborted() }),
          ).rejects.toThrow();
        expect(duplicates).toEqual([]);
        expect(dispatchCount()).toBe(1);
        expect(Object.isFrozen(first)).toBe(true);
        if (first.kind !== 'completed') throw new Error('expected completed');
        expect(Object.isFrozen(first.outcome)).toBe(true);
        expect(Object.isFrozen(first.outcome.usage)).toBe(true);
        expect(first).not.toHaveProperty('responseMessages');
      } finally {
        await executor.close(session);
      }
    });

    test('retained turn request detaches input and owner while caller remains mutable', async () => {
      const { executor, preparation, initialRequest, dispatchCount } = fixtures.createFixture();
      const request = structuredClone(initialRequest);
      const original = structuredClone(request);
      const session = await open(executor, preparation);
      try {
        const first = await executor.turn(session, request, control());
        expect(() => {
          Object.assign(request, { input: 'changed by caller' });
          Object.assign(request.owner, { epoch: 8 });
        }).not.toThrow();
        expect(request.input).toBe('changed by caller');
        expect(request.owner.epoch).toBe(8);
        // Proof: retaining the mutable caller alias rejects the original exact replay after caller edits.
        expect(await executor.turn(session, original, control())).toEqual(first);
        expect(dispatchCount()).toBe(1);
      } finally {
        await executor.close(session);
      }
    });

    test('fresh pre-aborted turn stays unbound and preserves initial cause', async () => {
      const { executor, preparation, initialRequest, dispatchCount } = fixtures.createFixture();
      const session = await open(executor, preparation);
      try {
        expect(
          await executor.turn(session, initialRequest, { ...control(), signal: aborted() }),
        ).toMatchObject({ kind: 'not_started', reason: 'cancelled_before_dispatch' });
        expect(dispatchCount()).toBe(0);
        expect(
          await executor.turn(session, { ...initialRequest, input: 'resubmitted' }, control()),
        ).toMatchObject({ kind: 'completed' });
        expect(dispatchCount()).toBe(1);
      } finally {
        await executor.close(session);
      }
    });

    test('active key is uncertain and a fresh busy key stays unbound for changed resubmission', async () => {
      const held = fixtures.createHeldFixture();
      const { executor, preparation, initialRequest, dispatchCount } = held;
      const session = await open(executor, preparation);
      const pending: Promise<TurnReply>[] = [];
      const failures: unknown[] = [];
      const first = executor.turn(session, initialRequest, control());
      pending.push(first);
      try {
        try {
          await held.entered;
          expect(
            await executor.turn(session, initialRequest, { ...control(), signal: aborted() }),
          ).toMatchObject({ kind: 'unresolved', reason: 'turn_in_flight' });
          expect(
            executor.turn(session, { ...initialRequest, input: 'conflict' }, control()),
          ).rejects.toThrow();
          const competing = executor.turn(session, decision(initialRequest), control());
          pending.push(competing);
          const admission = await Promise.race([
            competing,
            held.secondEntered.then(() => ({ kind: 'extra_dispatch' })),
          ]);
          // Proof: removing active-session exclusion reaches a second real backend entry and fails this count.
          expect(dispatchCount()).toBe(1);
          expect(admission).toMatchObject({ kind: 'not_started', reason: 'session_busy' });
          expect(
            await executor.turn(session, decision(initialRequest, 'aborted-busy'), {
              ...control(),
              signal: aborted(),
            }),
          ).toMatchObject({ kind: 'not_started', reason: 'cancelled_before_dispatch' });
          expect(dispatchCount()).toBe(1);
        } finally {
          held.release();
          // Settlement, rather than cancel acknowledgement, establishes dependency cleanup.
          for (const settlement of await Promise.allSettled(pending))
            if (settlement.status === 'rejected') failures.push(settlement.reason);
        }
        if (failures.length === 0) {
          expect(await first).toMatchObject({ kind: 'completed' });
          expect(
            await executor.turn(
              session,
              { ...decision(initialRequest), input: 'changed retry' },
              control(),
            ),
          ).toMatchObject({ kind: 'completed' });
          expect(
            await executor.turn(
              session,
              { ...decision(initialRequest, 'aborted-busy'), input: 'changed after abort' },
              control(),
            ),
          ).toMatchObject({ kind: 'completed' });
          expect(dispatchCount()).toBe(3);
        }
      } catch (cause) {
        failures.unshift(cause);
      } finally {
        try {
          await executor.close(session);
        } catch (cause) {
          failures.push(cause);
        }
      }
      if (failures.length > 0)
        throw new AggregateError(failures, 'executor lifecycle or cleanup failed');
    });

    test('decision cannot precede initial admission and failed cause does not bind its key', async () => {
      const { executor, preparation, initialRequest, dispatchCount } = fixtures.createFixture();
      const session = await open(executor, preparation);
      try {
        expect(
          executor.turn(session, decision(initialRequest, 'turn-1'), control()),
        ).rejects.toThrow();
        expect(await executor.turn(session, initialRequest, control())).toMatchObject({
          kind: 'completed',
        });
        expect(dispatchCount()).toBe(1);
      } finally {
        await executor.close(session);
      }
    });

    test('foreign live and deserialized attachments cannot turn cancel or close before local open', async () => {
      const { executor, createOtherExecutor, preparation, initialRequest, dispatchCount } =
        fixtures.createFixture();
      const other = createOtherExecutor();
      const foreign = await open(other, preparation);
      try {
        for (const attachment of [foreign, structuredClone(foreign)]) {
          expect(executor.turn(attachment, initialRequest, control())).rejects.toThrow();
          expect(executor.cancel(attachment)).rejects.toThrow();
          expect(executor.close(attachment)).rejects.toThrow();
        }
        const local = await open(executor, preparation);
        try {
          expect(executor.turn(foreign, initialRequest, control())).rejects.toThrow();
          expect(executor.cancel(foreign)).rejects.toThrow();
          expect(executor.close(foreign)).rejects.toThrow();
          expect(dispatchCount()).toBe(0);
        } finally {
          await executor.close(local);
        }
      } finally {
        await other.close(foreign);
      }
    });

    test('closed attachment rejects cached turn and reopen while repeated close cancel keep original locator', async () => {
      const { executor, preparation, initialRequest, allocationCount, dispatchCount } =
        fixtures.createFixture();
      const session = await open(executor, preparation);
      try {
        await executor.turn(session, initialRequest, control());
        await executor.close(session);
        await executor.close(session);
        expect(await executor.cancel(session)).toEqual({
          kind: 'requested',
          locator: session.locator,
        });
        expect(await executor.cancel(session)).toEqual({
          kind: 'requested',
          locator: session.locator,
        });
        expect(executor.turn(session, initialRequest, control())).rejects.toThrow();
        expect(executor.open(preparation, signal())).rejects.toThrow();
        expect(allocationCount()).toBe(1);
        expect(dispatchCount()).toBe(1);
      } finally {
        await executor.close(session);
      }
    });
  });
}
