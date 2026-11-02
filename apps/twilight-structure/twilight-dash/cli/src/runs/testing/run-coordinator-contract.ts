import { rejects } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';
import { type DagWorkTicket, materializeDagInputFromRecords } from 'configurable-tree-traversal';

import { createRunCoordinator } from '../../coordination/run-coordinator';
import type { WbsCoordinationFacts } from '../../coordination/run-facts';
import { materializeOrderedSteps, prepareCoordination } from '../../coordination/topology';
import type { ArtifactStore } from '../artifact-store';
import {
  attemptId,
  decodeAdmission,
  decodeExecutionCommand,
  decodeReceipt,
  ownerId,
  runId,
} from '../record-codecs';
import type { Run } from '../records';
import { closeFixtures } from './close-fixtures';
import { createCompletion, createManifest, createRun, prepareTurn, unwrapReply } from './fixtures';
import type { StoreFixture } from './run-store-contract';

const FIRST = 'sn1.work.first';
const SECOND = 'sn1.work.second';
function currentFacts(): WbsCoordinationFacts {
  return {
    projectId: 'project',
    workItemId: 'work',
    steps: [
      { id: 'first', position: 0 },
      { id: 'second', position: 1 },
    ],
    progress: [],
    eligibleStepIds: ['first', 'second'],
  };
}
function topology() {
  return prepareCoordination(materializeOrderedSteps('work', currentFacts().steps));
}
function firstTicket(tickets: readonly DagWorkTicket<string>[]) {
  expect(tickets).toHaveLength(1);
  return tickets[0];
}

/** Exercises the actual CTT consumer and each real atomic store without synthetic admission authority. */
export function runCoordinatorContract(
  name: string,
  create: () => Promise<StoreFixture & { readonly artifacts: ArtifactStore }>,
): void {
  describe(name, () => {
    const opened: StoreFixture[] = [];
    afterEach(async () => {
      await closeFixtures(opened.splice(0));
    });
    async function fixture(maxAttempts = 3) {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(
        await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
      );
      unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
      const run = unwrapReply(await stores.runs.createRun(ownership, createRun({ maxAttempts })));
      let facts = currentFacts();
      const readWbs = () => Promise.resolve(facts);
      const coordinator = await createRunCoordinator({
        dag: topology(),
        runs: stores.runs,
        runId: run.runId,
        readWbs,
      });
      const guard = { ownership, runId: run.runId, expectedRevision: 0 };
      const admission = decodeAdmission({
        attemptId: 'attempt',
        identity: {
          version: 1,
          runId: run.runId,
          occurrenceId: FIRST,
          operationKey: 'original-key',
        },
        ordinal: 1,
      });
      return {
        ...stores,
        ownership,
        run,
        guard,
        admission,
        coordinator,
        readWbs,
        setFacts(next: WbsCoordinationFacts) {
          facts = next;
        },
      };
    }
    test('in-progress WBS statements never seed accepted completion', async () => {
      const setup = await fixture();
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'in_progress' }] });
      const coordinator = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      expect((await coordinator.ready()).map((ticket) => ticket.vertexId)).toEqual([FIRST]);
      expect(coordinator.summary().completedWorkIds).toEqual([]);
    });
    test('malformed WBS progress cannot become an executable unfinished step', async () => {
      const setup = await fixture();
      const malformed = {
        ...currentFacts(),
        progress: [{ stepId: 'first', state: 'unexpected' }],
      } as unknown as WbsCoordinationFacts;
      let tickets: readonly DagWorkTicket<string>[] = [];
      const rejected = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: () => Promise.resolve(malformed),
      }).then(
        async (coordinator) => {
          tickets = await coordinator.ready();
          return false;
        },
        () => true,
      );
      expect(tickets).toEqual([]);
      expect(rejected).toBe(true);
    });
    test('shallow caller mutation cannot borrow another steps eligibility during initial WBS read', async () => {
      const setup = await fixture();
      const dag = topology();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let blocked = true;
      const pending = createRunCoordinator({
        dag,
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: async () => {
          if (blocked) {
            blocked = false;
            entered.resolve(undefined);
            await release.promise;
          }
          return { ...currentFacts(), eligibleStepIds: ['second'] };
        },
      });
      await entered.promise;
      Object.assign(dag.definition.vertices[0].data, { stepId: 'second' });
      release.resolve(undefined);
      const coordinator = await pending;
      expect(await coordinator.ready()).toEqual([]);
      expect((await setup.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
    });
    test('accepted predecessors seed only fresh sessions and new done requires explicit completion', async () => {
      const setup = await fixture();
      expect((await setup.coordinator.ready()).map((ticket) => ticket.vertexId)).toEqual([FIRST]);
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] });
      expect(setup.coordinator.summary().completedWorkIds).toEqual([]);
      const rebuilt = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      expect((await rebuilt.ready()).map((ticket) => ticket.vertexId)).toEqual([SECOND]);
      expect(setup.coordinator.summary().completedWorkIds).toEqual([]);
    });
    test('unaccepted completion never releases a successor; accepted duplicate is explicit', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      const rejected = await setup.coordinator.complete(ticket).then(
        () => false,
        () => true,
      );
      expect(setup.coordinator.summary().completedWorkIds).toEqual([]);
      expect((await setup.coordinator.ready()).map((ticket) => ticket.vertexId)).toEqual([FIRST]);
      expect(rejected).toBe(true);
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] });
      expect(await setup.coordinator.complete(ticket)).toEqual({ kind: 'accepted' });
      expect(await setup.coordinator.complete(ticket)).toEqual({ kind: 'alreadyAccepted' });
      expect((await setup.coordinator.ready()).map((ticket) => ticket.vertexId)).toEqual([SECOND]);
    });
    test('foreign fabricated and pre-reconstruction tickets never acknowledge current work', async () => {
      const setup = await fixture();
      const old = firstTicket(await setup.coordinator.ready());
      const rebuilt = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      firstTicket(await rebuilt.ready());
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] });
      for (const ticket of [
        old,
        { vertexId: FIRST } as DagWorkTicket<string>,
        { vertexId: SECOND } as DagWorkTicket<string>,
      ]) {
        const rejected = await rebuilt.complete(ticket).then(
          () => false,
          () => true,
        );
        expect(rebuilt.summary().completedWorkIds).toEqual([]);
        expect(rejected).toBe(true);
      }
    });
    test('undo of accepted progress requires reconstruction before successor admission', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] });
      await setup.coordinator.complete(ticket);
      const successor = firstTicket(await setup.coordinator.ready());
      setup.setFacts(currentFacts());
      const admission = decodeAdmission({
        ...setup.admission,
        identity: { ...setup.admission.identity, occurrenceId: SECOND },
      });
      const rejected = await setup.coordinator.admit(successor, setup.guard, admission).then(
        () => false,
        () => true,
      );
      expect((await setup.runs.readRun(setup.run.runId)).attempts).toEqual([]);
      expect(rejected).toBe(true);
      await rejects(setup.coordinator.ready(), /rebuild required/);
    });
    test('admission preserves keys and cannot implicitly complete; replay precedes eligibility and capacity', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      expect((await setup.coordinator.admit(ticket, setup.guard, setup.admission)).kind).toBe(
        'applied',
      );
      expect(setup.coordinator.summary().completedWorkIds).toEqual([]);
      expect(await setup.coordinator.ready()).toEqual([]);
      setup.setFacts({ ...currentFacts(), eligibleStepIds: [] });
      expect((await setup.coordinator.admit(ticket, setup.guard, setup.admission)).kind).toBe(
        'duplicate',
      );
      expect(
        await setup.coordinator.admit(ticket, setup.guard, { ...setup.admission, ordinal: 2 }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      const snapshot = await setup.runs.readRun(setup.run.runId);
      expect(String(snapshot.attempts[0].identity.operationKey)).toBe('original-key');
      expect(snapshot.capacity.reserved).toBe(1);
      setup.clock.advance(101);
      expect(await setup.coordinator.admit(ticket, setup.guard, setup.admission)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });
    test('current eligibility and exact ticket occurrence prevent unwanted reservation', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      setup.setFacts({ ...currentFacts(), eligibleStepIds: [] });
      const reply = await setup.coordinator.admit(ticket, setup.guard, setup.admission);
      expect((await setup.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
      expect(reply).toEqual({ kind: 'refused', reason: 'state_conflict' });
      setup.setFacts(currentFacts());
      expect(
        await setup.coordinator.admit(
          ticket,
          setup.guard,
          decodeAdmission({
            ...setup.admission,
            identity: { ...setup.admission.identity, occurrenceId: SECOND },
          }),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect((await setup.runs.readRun(setup.run.runId)).attempts).toEqual([]);
    });
    test('two kernel-ready runs race through actual atomic capacity and revision checks', async () => {
      const setup = await fixture();
      const second: Run = createRun({ runId: runId('second') });
      unwrapReply(await setup.runs.createRun(setup.ownership, second));
      const other = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: second.runId,
        readWbs: setup.readWbs,
      });
      const first = firstTicket(await setup.coordinator.ready());
      const next = firstTicket(await other.ready());
      expect(
        await setup.coordinator.admit(
          first,
          { ...setup.guard, expectedRevision: 1 },
          setup.admission,
        ),
      ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      const replies = await Promise.all([
        setup.coordinator.admit(first, setup.guard, setup.admission),
        other.admit(
          next,
          { ...setup.guard, runId: second.runId },
          decodeAdmission({
            ...setup.admission,
            attemptId: 'second',
            identity: { ...setup.admission.identity, runId: second.runId },
          }),
        ),
      ]);
      const snapshots = await Promise.all([
        setup.runs.readRun(setup.run.runId),
        setup.runs.readRun(second.runId),
      ]);
      expect(snapshots.map((snapshot) => snapshot.capacity.reserved)).toEqual([1, 1]);
      expect(snapshots.flatMap((snapshot) => snapshot.attempts)).toHaveLength(1);
      expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'refused']);
      expect(replies.find((reply) => reply.kind === 'refused')).toEqual({
        kind: 'refused',
        reason: 'capacity_full',
      });
    });
    test('reconstruction excludes unfinished attempts and rejects arbitrary retained occurrence IDs', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      await setup.coordinator.admit(ticket, setup.guard, setup.admission);
      const rebuilt = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      expect(await rebuilt.ready()).toEqual([]);
      expect(rebuilt.summary().completedWorkIds).toEqual([]);
      const other = await fixture();
      unwrapReply(
        await other.runs.admitAttempt(
          other.guard,
          decodeAdmission({
            ...other.admission,
            identity: { ...other.admission.identity, occurrenceId: 'legacy-arbitrary' },
          }),
        ),
      );
      let exposed: readonly DagWorkTicket<string>[] = [];
      const refused = await createRunCoordinator({
        dag: topology(),
        runs: other.runs,
        runId: other.run.runId,
        readWbs: other.readWbs,
      }).then(
        async (coordinator) => {
          exposed = await coordinator.ready();
          return false;
        },
        () => true,
      );
      expect(exposed).toEqual([]);
      expect(refused).toBe(true);
    });
    for (const effect of ['absent', 'failed', 'unknown'] as const)
      test(`durable ${effect} interruption follows the existing pre-claim retry rule`, async () => {
        const setup = await fixture();
        const ticket = firstTicket(await setup.coordinator.ready());
        unwrapReply(await setup.coordinator.admit(ticket, setup.guard, setup.admission));
        const retained = await setup.artifacts.retainArtifact(
          new TextEncoder().encode('quiescence'),
          'text/plain',
        );
        if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
        const evidence = retained.reference;

        const command = decodeExecutionCommand({
          version: 2,
          kind: 'execution',
          commandId: 'interrupted',
          fact: {
            kind: 'interrupted',
            quiescence: {
              version: 1,
              operationKey: 'original-key',
              observedAt: 1000,
              effect,
              evidence,
            },
          },
        });
        unwrapReply(
          await setup.runs.recordExecution(
            {
              ...setup.guard,
              expectedRevision: 1,
              attemptId: setup.admission.attemptId,
              expectedAttemptRevision: 0,
            },
            command,
          ),
        );
        expect((await setup.coordinator.ready()).map((ticket) => ticket.vertexId)).toEqual(
          effect === 'absent' ? [FIRST] : [],
        );
        expect(setup.coordinator.summary().completedWorkIds).toEqual([]);
        const reply = await setup.coordinator.admit(
          ticket,
          { ...setup.guard, expectedRevision: 2 },
          { ...setup.admission, attemptId: attemptId('retry'), ordinal: 2 },
        );
        expect(reply.kind).toBe(effect === 'absent' ? 'applied' : 'refused');
      });
    test('exhausted retries stay hidden after proven-absent interruption', async () => {
      const setup = await fixture(1);
      const ticket = firstTicket(await setup.coordinator.ready());
      unwrapReply(await setup.coordinator.admit(ticket, setup.guard, setup.admission));

      const retained = await setup.artifacts.retainArtifact(
        new TextEncoder().encode('quiescence'),
        'text/plain',
      );
      if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
      unwrapReply(
        await setup.runs.recordExecution(
          {
            ...setup.guard,
            expectedRevision: 1,
            attemptId: setup.admission.attemptId,
            expectedAttemptRevision: 0,
          },
          decodeExecutionCommand({
            version: 2,
            kind: 'execution',
            commandId: 'stop',
            fact: {
              kind: 'interrupted',
              quiescence: {
                version: 1,
                operationKey: 'original-key',
                observedAt: 1000,
                effect: 'absent',
                evidence: retained.reference,
              },
            },
          }),
        ),
      );
      expect(await setup.coordinator.ready()).toEqual([]);
      expect(
        await setup.coordinator.admit(
          ticket,
          { ...setup.guard, expectedRevision: 2 },
          { ...setup.admission, attemptId: attemptId('retry'), ordinal: 2 },
        ),
      ).toEqual({ kind: 'refused', reason: 'retry_exhausted' });
    });
    test('captures admission and guard before a finite WBS read barrier', async () => {
      const setup = await fixture();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let blocked = false;
      const coordinator = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: async () => {
          if (blocked) {
            entered.resolve(undefined);
            await release.promise;
          }
          return currentFacts();
        },
      });
      const ticket = firstTicket(await coordinator.ready());
      blocked = true;
      const admission = structuredClone(setup.admission);
      const guard = structuredClone(setup.guard);
      const pending = coordinator.admit(ticket, guard, admission);
      await entered.promise;
      Object.assign(admission.identity, { occurrenceId: SECOND, operationKey: 'mutated' });
      Object.assign(guard.ownership, { ownerId: 'mutated' });
      release.resolve(undefined);
      expect((await pending).kind).toBe('applied');
      expect((await setup.runs.readRun(setup.run.runId)).attempts[0].identity).toEqual(
        setup.admission.identity,
      );
    });

    for (const mode of ['exact', 'changed', 'stale', 'fresh'] as const)
      test(`pending WBS read preserves ${mode} admission authority after concurrent admission`, async () => {
        const setup = await fixture();
        const entered = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        let blocked = false;
        const coordinator = await createRunCoordinator({
          dag: topology(),
          runs: setup.runs,
          runId: setup.run.runId,
          readWbs: async () => {
            if (blocked) {
              entered.resolve(undefined);
              await release.promise;
              return { ...currentFacts(), eligibleStepIds: [] };
            }
            return currentFacts();
          },
        });
        const ticket = firstTicket(await coordinator.ready());
        blocked = true;
        const admission = mode === 'changed' ? { ...setup.admission, ordinal: 2 } : setup.admission;
        const pending = coordinator.admit(ticket, setup.guard, admission);
        await entered.promise;
        try {
          if (mode !== 'fresh')
            expect((await setup.runs.admitAttempt(setup.guard, setup.admission)).kind).toBe(
              'applied',
            );
          if (mode === 'stale') setup.clock.advance(101);
        } finally {
          release.resolve(undefined);
        }
        const reply = await pending;
        const snapshot = await setup.runs.readRun(setup.run.runId);
        expect(snapshot.capacity.reserved).toBe(mode === 'fresh' ? 0 : 1);
        expect(snapshot.attempts).toHaveLength(mode === 'fresh' ? 0 : 1);
        expect(coordinator.summary().completedWorkIds).toEqual([]);
        if (mode === 'exact') {
          expect(reply.kind).toBe('duplicate');
          expect(unwrapReply(reply).identity).toEqual(setup.admission.identity);
        } else {
          expect(reply).toEqual({
            kind: 'refused',
            reason:
              mode === 'changed'
                ? 'identity_conflict'
                : mode === 'stale'
                  ? 'owner_stale'
                  : 'state_conflict',
          });
        }
      });

    test('captures returned WBS eligibility before awaiting the current store snapshot', async () => {
      const setup = await fixture();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let blocked = false;
      let facts = currentFacts();
      const coordinator = await createRunCoordinator({
        dag: topology(),
        runId: setup.run.runId,
        runs: {
          ...setup.runs,
          async readRun(identity) {
            if (blocked) {
              entered.resolve(undefined);
              await release.promise;
            }
            return await setup.runs.readRun(identity);
          },
        },
        readWbs: () => Promise.resolve(facts),
      });
      const ticket = firstTicket(await coordinator.ready());
      const eligibility: string[] = [];
      facts = { ...currentFacts(), eligibleStepIds: eligibility };
      blocked = true;
      const pending = coordinator.admit(ticket, setup.guard, setup.admission);
      await entered.promise;
      eligibility.push('first');
      release.resolve(undefined);
      const reply = await pending;
      expect((await setup.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
      expect(reply).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(coordinator.summary().completedWorkIds).toEqual([]);
    });

    test('foreign admission tickets cannot reserve capacity even for the same ready activity', async () => {
      const setup = await fixture();
      const other = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      firstTicket(await setup.coordinator.ready());
      const foreign = firstTicket(await other.ready());
      const rejected = await setup.coordinator.admit(foreign, setup.guard, setup.admission).then(
        () => false,
        () => true,
      );
      expect((await setup.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
      expect(rejected).toBe(true);
    });
    for (const state of ['waiting', 'reconciling', 'outcome', 'terminal'] as const)
      test(`retained ${state} blocks new work without seeding accepted completion`, async () => {
        const stores = await create();
        opened.push(stores);
        const ownership = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
        );
        const setup = await prepareTurn(stores, {
          ownership,
          suffix: 'coordinated',
          occurrenceId: 'sn1.work.step',
        });
        if (state === 'waiting' || state === 'reconciling') {
          const fact =
            state === 'reconciling'
              ? { kind: 'recovery_required', reason: 'lost response' }
              : {
                  kind: 'waiting',
                  wait: {
                    version: 1,
                    correlationKey: 'question',
                    prompt: setup.quiescence.evidence,
                    choices: ['yes', 'no'],
                  },
                  quiescence: setup.quiescence,
                };
          unwrapReply(
            await stores.runs.recordExecution(
              await setup.currentGuard(),
              decodeExecutionCommand({ version: 2, kind: 'execution', commandId: state, fact }),
            ),
          );
        } else {
          const completion = createCompletion(setup.claim, setup.quiescence);
          unwrapReply(await stores.runs.commitOutcome(await setup.currentGuard(), completion));
          if (state === 'terminal')
            unwrapReply(
              await stores.runs.reconcileReceipt(
                await setup.currentGuard(),
                decodeReceipt({
                  version: 2,
                  commandId: completion.intent.commandId,
                  commandDigest: completion.intent.commandDigest,
                  claim: setup.claim,
                  acceptedWbsRevision: 'wbs-after',
                  evidence: setup.quiescence.evidence,
                }),
              ),
            );
        }
        const facts: WbsCoordinationFacts = {
          projectId: setup.run.projectId,
          workItemId: setup.run.workItemId,
          steps: [{ id: 'step', position: 0 }],
          progress: [],
          eligibleStepIds: ['step'],
        };
        const coordinator = await createRunCoordinator({
          dag: prepareCoordination(materializeOrderedSteps('work', facts.steps)),
          runs: stores.runs,
          runId: setup.run.runId,
          readWbs: () => Promise.resolve(facts),
        });
        expect(await coordinator.ready()).toEqual([]);
        expect(coordinator.summary().completedWorkIds).toEqual([]);
      });

    test('concurrent completion and readiness serialize accepted-progress undo across a finite barrier', async () => {
      const setup = await fixture();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let block = false;
      let facts = currentFacts();
      const coordinator = await createRunCoordinator({
        dag: topology(),
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: async () => {
          const captured = structuredClone(facts);
          if (block) {
            block = false;
            entered.resolve(undefined);
            await release.promise;
          }
          return captured;
        },
      });
      const ticket = firstTicket(await coordinator.ready());
      facts = { ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] };
      block = true;
      const completion = coordinator.complete(ticket);
      await entered.promise;
      facts = currentFacts();
      const readiness = coordinator.ready().then(
        (tickets) => ({ kind: 'ready' as const, tickets }),
        () => ({ kind: 'rebuild' as const }),
      );
      release.resolve(undefined);
      expect(await completion).toEqual({ kind: 'accepted' });
      expect(await readiness).toEqual({ kind: 'rebuild' });
    });
    test('captures vertex correspondence before the initial asynchronous WBS read', async () => {
      const setup = await fixture();
      const dag = topology();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let blocked = true;
      const pending = createRunCoordinator({
        dag,
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: async () => {
          if (blocked) {
            blocked = false;
            entered.resolve(undefined);
            await release.promise;
          }
          return setup.readWbs();
        },
      });
      await entered.promise;
      Object.assign(dag.definition.vertices[0].data, { stepId: 'second' });
      release.resolve(undefined);
      const coordinator = await pending;
      const ticket = firstTicket(await coordinator.ready());
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'second', state: 'done' }] });
      const rejected = await coordinator.complete(ticket).then(
        () => false,
        () => true,
      );
      expect(coordinator.summary().completedWorkIds).toEqual([]);
      expect(rejected).toBe(true);
    });
    for (const [fault, change] of [
      ['project scope', { projectId: 'foreign' }],
      ['leaf scope', { workItemId: 'foreign' }],
      [
        'duplicate steps',
        {
          steps: [
            { id: 'first', position: 0 },
            { id: 'first', position: 1 },
          ],
        },
      ],
      [
        'duplicate progress',
        {
          progress: [
            { stepId: 'first', state: 'done' },
            { stepId: 'first', state: 'in_progress' },
          ],
        },
      ],
      ['foreign progress', { progress: [{ stepId: 'foreign', state: 'done' }] }],
      ['duplicate eligibility', { eligibleStepIds: ['first', 'first'] }],
      ['foreign eligibility', { eligibleStepIds: ['first', 'foreign'] }],
    ] as const)
      test(`inconsistent ${fault} never exposes executable tickets`, async () => {
        const setup = await fixture();
        const facts = { ...currentFacts(), ...change };
        let tickets: readonly DagWorkTicket<string>[] = [];
        const rejected = await createRunCoordinator({
          dag: topology(),
          runs: setup.runs,
          runId: setup.run.runId,
          readWbs: () => Promise.resolve(facts),
        }).then(
          async (coordinator) => {
            tickets = await coordinator.ready();
            return false;
          },
          () => true,
        );
        expect(tickets).toEqual([]);
        expect(rejected).toBe(true);
      });
    test('omitted native prerequisites cannot satisfy undeclared WBS activity work', async () => {
      const setup = await fixture();
      const input = materializeDagInputFromRecords(
        [
          { workItemId: 'work', stepId: 'first' },
          { workItemId: 'work', stepId: 'second' },
        ],
        {
          id: (node) => (node.stepId === 'first' ? FIRST : SECOND),
          dependsOnWork: (node) => (node.stepId === 'first' ? ['omitted'] : [FIRST]),
        },
      );
      const dag = prepareCoordination({
        ...input,
        traversableGraph: {
          ...input.traversableGraph,
          resolvePrerequisite: () => ({
            kind: 'omitted',
            identity: { vertexId: 'omitted' },
            satisfiesDependencies: true,
          }),
        },
      });
      let tickets: readonly DagWorkTicket<string>[] = [];
      const rejected = await createRunCoordinator({
        dag,
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      }).then(
        async (coordinator) => {
          tickets = await coordinator.ready();
          return false;
        },
        () => true,
      );
      expect(tickets).toEqual([]);
      expect(rejected).toBe(true);
    });
    test('equivalent WBS catalog array and property order preserve the active session', async () => {
      const setup = await fixture();
      const ticket = firstTicket(await setup.coordinator.ready());
      const reordered = [
        { position: 1, id: 'second', name: 'Renamed second' },
        { position: 0, id: 'first', name: 'Renamed first' },
      ];
      setup.setFacts({ ...currentFacts(), steps: reordered });
      expect((await setup.coordinator.ready()).map((ready) => ready.vertexId)).toEqual([FIRST]);
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'first', state: 'done' }] });
      expect(await setup.coordinator.complete(ticket)).toEqual({ kind: 'accepted' });
    });
    test('changed step positions require rebuilding before exposing another ticket', async () => {
      const setup = await fixture();
      firstTicket(await setup.coordinator.ready());
      setup.setFacts({
        ...currentFacts(),
        steps: [
          { id: 'first', position: 2 },
          { id: 'second', position: 1 },
        ],
      });
      let tickets: readonly DagWorkTicket<string>[] = [];
      const rejected = await setup.coordinator.ready().then(
        (ready) => {
          tickets = ready;
          return false;
        },
        () => true,
      );
      expect(tickets).toEqual([]);
      expect(rejected).toBe(true);
    });
    test('catalog change refuses executable readiness and shallow vertex mutation cannot retarget tickets', async () => {
      const setup = await fixture();
      const dag = topology();
      const coordinator = await createRunCoordinator({
        dag,
        runs: setup.runs,
        runId: setup.run.runId,
        readWbs: setup.readWbs,
      });
      const ticket = firstTicket(await coordinator.ready());
      Object.assign(dag.definition.vertices[0].data, { stepId: 'second' });
      setup.setFacts({ ...currentFacts(), progress: [{ stepId: 'second', state: 'done' }] });
      const rejected = await coordinator.complete(ticket).then(
        () => false,
        () => true,
      );
      expect(coordinator.summary().completedWorkIds).toEqual([]);
      expect(rejected).toBe(true);
      setup.setFacts({ ...currentFacts(), steps: [{ id: 'first', position: 0 }] });
      await rejects(setup.coordinator.ready(), /rebuild required/);
    });
    test('complete activity mappings reject missing duplicate omitted and foreign vertices', async () => {
      const setup = await fixture();
      const definitions = [
        prepareCoordination(materializeOrderedSteps('work', [{ id: 'first', position: 0 }])),
        prepareCoordination(materializeOrderedSteps('foreign', currentFacts().steps)),
        prepareCoordination(
          materializeDagInputFromRecords(
            [
              { workItemId: 'work', stepId: 'first' },
              { workItemId: 'work', stepId: 'first' },
            ],
            {
              id: (() => {
                let index = 0;
                return (): string => (++index === 1 ? FIRST : SECOND);
              })(),
            },
          ),
        ),
      ];
      for (const dag of definitions) {
        let tickets: readonly DagWorkTicket<string>[] = [];
        const rejected = await createRunCoordinator({
          dag,
          runs: setup.runs,
          runId: setup.run.runId,
          readWbs: setup.readWbs,
        }).then(
          async (coordinator) => {
            tickets = await coordinator.ready();
            return false;
          },
          () => true,
        );
        expect(tickets).toEqual([]);
        expect(rejected).toBe(true);
      }
    });
  });
}
