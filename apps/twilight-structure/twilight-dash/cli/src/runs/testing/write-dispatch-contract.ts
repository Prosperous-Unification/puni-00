import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import type { ArtifactStore } from '../artifact-store';
import { readExecutionHistory } from '../claim-history';
import { deliverOutcome } from '../deliver-outcome';
import { retainRuntimeReceipt } from '../retain-runtime-receipt';
import type { RunStore, StoreReply } from '../run-store';
import { readRuntimeRequest } from '../runtime-codecs';
import { RuntimeDispatchError } from '../runtime-dispatch-error';
import { verifyRuntimeReceipt } from '../runtime-receipt';
import { executionCommandId, ownerId } from '../value-codecs';
import { stageWriteRequest } from '../write-history';
import type { WriteStageAck } from '../write-records';
import type { OutcomeFixture } from './fixtures';
import { unwrapReply } from './fixtures';
import { closeRecoveryResources, waitForReceiver } from './recovery-receiver';
import { createWriteFixture } from './write-fixture';
import { retainWriteReceipt } from './write-store-contract';

const signal = () => new AbortController().signal;
function held() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
export async function writeDispatchFixture(stores: OutcomeFixture) {
  const setup = await createWriteFixture(stores);
  return {
    ...setup,
    input: {
      commandId: setup.command.commandId,
      acceptanceCommandId: executionCommandId('accept-write'),
      completion: setup.completion,
      canonicalRequest: setup.canonicalRequest,
      stateEvidence: setup.stateEvidence,
    },
  };
}
type Setup = Awaited<ReturnType<typeof writeDispatchFixture>>;
export async function writeDispatchBytes(
  setup: Setup,
  extra = 'original',
  rewrite?: (receipt: Record<string, unknown>) => void,
) {
  const history = await setup.runs.readExecutionHistory(setup.guard.runId, setup.guard.attemptId);
  if (history.version !== 3 || history.writes[0]?.kind !== 'stage_write')
    throw Error('write stage missing');
  const reference = await retainWriteReceipt(setup, history.writes[0].reply.intent, (receipt) => {
    receipt['futureCompatible'] = extra;
    rewrite?.(receipt);
  });
  return (
    JSON.stringify(
      JSON.parse(new TextDecoder().decode(await setup.artifacts.readArtifact(reference))),
      null,
      2,
    ) + '\n'
  );
}
function remote(setup: Setup, respond?: (shape: string) => Promise<Response>) {
  const sent: string[] = [];
  const bodies: unknown[] = [];
  const client = createRuntimeClient(async (shape, input) => {
    sent.push(shape.operationId);
    bodies.push(structuredClone(input.body));
    return respond
      ? await respond(shape.operationId)
      : new Response(await writeDispatchBytes(setup));
  });
  return { client, sent, bodies };
}
function dispatch(
  setup: Setup,
  client: RuntimeClient,
  runs = setup.runs,
  cancellation = signal(),
  guard = setup.guard,
  input = setup.input,
) {
  return deliverOutcome(runs, setup.artifacts, client, guard, input, cancellation);
}
async function pending(setup: Setup) {
  const snapshot = await setup.runs.readRun(setup.guard.runId);
  expect(snapshot).toMatchObject({
    version: 4,
    capacity: { reserved: 0 },
    writeObligations: [{ disposition: { kind: 'pending' } }],
    writeReceipts: [],
  });
}
async function readPendingCompletion(setup: Setup) {
  await pending(setup);
  const snapshot = await setup.runs.readRun(setup.guard.runId);
  if (snapshot.version !== 4) throw Error('write snapshot missing');
  const history = await readExecutionHistory(
    setup.runs,
    setup.artifacts,
    setup.guard.runId,
    setup.guard.attemptId,
  );
  if (history.version !== 3 || history.writes[0]?.kind !== 'stage_write')
    throw Error('original write stage missing');
  expect(history.writes).toHaveLength(1);
  expect(history.writes[0].command).toEqual(setup.command);
  expect(history.attempt).toMatchObject({
    holdsCapacity: false,
    state: {
      kind: 'write_pending',
      stageCommandId: 'stage-write',
      outcome: { kind: 'succeeded', summary: 'validated output' },
    },
  });
  if (history.attempt.state.kind !== 'write_pending') throw Error('pending attempt missing');
  expect(history.attempt.state.outcome).toEqual(setup.completion.outcome);
  expect(snapshot.writeObligations).toEqual([history.writes[0].reply.obligation]);
  expect(snapshot.writeObligations[0]).toMatchObject({
    stageCommandId: 'stage-write',
    completion: setup.completion,
    intent: { commandId: 'wire-write', canonicalRequest: setup.canonicalRequest },
    disposition: { kind: 'pending' },
  });
  return { snapshot, history, scope: await setup.runs.readRuntimeScope(setup.guard.scope) };
}
/** Uses real provider staging/closure and the actual Response-capturing validated client. */
export function writeDispatchContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    async function fixture(run: (setup: Setup) => Promise<void>) {
      const stores = await create();
      try {
        await run(await writeDispatchFixture(stores));
      } finally {
        await stores.close();
      }
    }
    test('awaits durable stage and renewal before one exact POST and preserves raw evidence', () =>
      fixture(async (setup) => {
        const stage = held(),
          staged = held(),
          renew = held(),
          renewing = held();
        const runs: RunStore = {
          ...setup.runs,
          async stageWrite(guard, command) {
            staged.resolve();
            await stage.promise;
            return await setup.runs.stageWrite(guard, command);
          },
          async renewOwnership(ownership) {
            renewing.resolve();
            await renew.promise;
            return await setup.runs.renewOwnership(ownership);
          },
        };
        const receiver = remote(setup);
        const delivery = dispatch(setup, receiver.client, runs);
        try {
          await staged.promise;
          expect(receiver.sent).toEqual([]);
          stage.resolve();
          await renewing.promise;
          expect(receiver.sent).toEqual([]);
          await pending(setup);
          renew.resolve();
          const reply = await delivery;
          expect(reply.kind).toBe('accepted');
          if (reply.kind !== 'accepted') throw Error('acceptance missing');
          expect(receiver.sent).toEqual(['applyRuntimeCommands']);
          expect(receiver.bodies).toEqual([
            {
              ...readRuntimeRequest(setup.input.canonicalRequest).operation,
              personId: setup.scope.personId,
            },
          ]);
          expect(
            new TextDecoder().decode(
              await setup.artifacts.readArtifact(reply.ack.receipt.acceptance.evidence),
            ),
          ).toBe(await writeDispatchBytes(setup));
          expect(reply.ack.attempt).toMatchObject({
            holdsCapacity: false,
            state: { kind: 'write_terminal' },
          });
          const history = await readExecutionHistory(
            setup.runs,
            setup.artifacts,
            setup.guard.runId,
            setup.guard.attemptId,
          );
          expect(history.version).toBe(3);
        } finally {
          stage.resolve();
          renew.resolve();
          await Promise.allSettled([delivery]);
        }
      }));
    test('concurrent exact calls elect one POST and duplicate lookup only', () =>
      fixture(async (setup) => {
        const posted = held(),
          release = held();
        const receiver = remote(setup, async (shape) => {
          if (shape === 'applyRuntimeCommands') {
            posted.resolve();
            await release.promise;
            return new Response(await writeDispatchBytes(setup));
          }
          return Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 });
        });
        const first = dispatch(setup, receiver.client);
        let duplicate: ReturnType<typeof dispatch> | undefined;
        try {
          await waitForReceiver(posted.promise);
          duplicate = dispatch(setup, receiver.client);
          expect(await waitForReceiver(duplicate)).toMatchObject({
            kind: 'pending',
            observation: { kind: 'receiver_refused' },
          });
          expect(receiver.sent).toEqual(['applyRuntimeCommands', 'lookupRuntimeReceipt']);
        } finally {
          release.resolve();
          await Promise.allSettled(duplicate === undefined ? [first] : [first, duplicate]);
        }
        expect((await first).kind).toBe('accepted');
      }));
    test('held verification duplicate retains original stage acknowledgement and only applied peer sends', () =>
      fixture(async (setup) => {
        // Fault: electing a duplicate stage sends again after the peer has already accepted.
        const reading = held(),
          release = held();
        let isHeld = false;
        const artifacts: ArtifactStore = {
          ...setup.artifacts,
          async readArtifact(reference) {
            const bytes = await setup.artifacts.readArtifact(reference);
            if (!isHeld && reference.digest === setup.stateEvidence.digest) {
              isHeld = true;
              reading.resolve();
              await waitForReceiver(release.promise);
            }
            return bytes;
          },
        };
        const stages: StoreReply<WriteStageAck>[] = [];
        const runs: RunStore = {
          ...setup.runs,
          async stageWrite(guard, command) {
            const staged = await setup.runs.stageWrite(guard, command);
            stages.push(structuredClone(staged));
            return staged;
          },
        };
        const receiver = remote(setup);
        const first = deliverOutcome(
          runs,
          artifacts,
          receiver.client,
          setup.guard,
          setup.input,
          signal(),
        );
        let peer: ReturnType<typeof dispatch> | undefined;
        try {
          await waitForReceiver(reading.promise);
          expect(stages).toEqual([]);
          expect(receiver.sent).toEqual([]);
          // The peer uses the actual unwrapped artifact store and can finish before release.
          peer = dispatch(setup, receiver.client, runs);
          const accepted = await waitForReceiver(peer);
          expect(accepted.kind).toBe('accepted');
          if (accepted.kind !== 'accepted') throw Error('peer acceptance missing');
          const original = stages.at(0);
          if (original?.kind !== 'applied') throw Error('peer did not win stage election');
          expect(stages).toHaveLength(1);
          expect(original.value).toMatchObject({
            kind: 'write_staged',
            intent: { commandId: 'wire-write', canonicalRequest: setup.canonicalRequest },
            attempt: {
              holdsCapacity: false,
              state: {
                kind: 'write_pending',
                outcome: { kind: 'succeeded', summary: 'validated output' },
              },
            },
          });
          expect(original.value.obligation.completion).toEqual(setup.completion);
          expect(accepted.ack.attempt.state.kind).toBe('write_terminal');
          const terminal = await setup.runs.readRun(setup.guard.runId);
          expect(terminal).toMatchObject({
            capacity: { reserved: 0 },
            writeObligations: [],
            writeReceipts: [accepted.ack.receipt],
          });
          release.resolve();
          expect(await waitForReceiver(first)).toEqual(accepted);
          expect(stages).toEqual([original, { kind: 'duplicate', value: original.value }]);
          expect(receiver.sent).toEqual(['applyRuntimeCommands']);
          expect(receiver.bodies).toEqual([
            { ...readRuntimeRequest(setup.canonicalRequest).operation, personId: 'person' },
          ]);
          expect(receiver.bodies[0]).toMatchObject({
            commandId: 'wire-write',
            expectedLedgerId: 'ledger',
            action: {
              kind: 'write',
              commands: [
                { kind: 'setProgress', workItemId: 'work', stepId: 'step', state: 'done' },
                {
                  kind: 'releaseWorkItem',
                  workItemId: 'work',
                  personId: 'person',
                  steps: ['step'],
                },
              ],
            },
          });
          expect(await setup.runs.readRun(setup.guard.runId)).toEqual(terminal);
          console.log(
            'Task1 held-verification trace ' +
              JSON.stringify({ stages, accepted, sent: receiver.sent }),
          );
        } finally {
          release.resolve();
          await closeRecoveryResources([], peer === undefined ? [first] : [first, peer]);
        }
      }));
    test('duplicate winner independently rereads original acceptance evidence', () =>
      fixture(async (setup) => {
        const receiver = remote(setup);
        const accepted = await dispatch(setup, receiver.client);
        if (accepted.kind !== 'accepted') throw Error('acceptance missing');
        const evidence = accepted.ack.receipt.acceptance.evidence;
        let inspectWinner = false;
        const runs: RunStore = {
          ...setup.runs,
          async stageWrite(guard, command) {
            const staged = await setup.runs.stageWrite(guard, command);
            inspectWinner = true;
            return staged;
          },
        };
        const artifacts = {
          ...setup.artifacts,
          async readArtifact(reference: typeof evidence) {
            if (inspectWinner && reference.digest === evidence.digest)
              throw Error('original evidence unreadable');
            return await setup.artifacts.readArtifact(reference);
          },
        };
        await rejects(
          deliverOutcome(runs, artifacts, receiver.client, setup.guard, setup.input, signal()),
          RuntimeDispatchError,
        );
        expect(receiver.sent).toEqual(['applyRuntimeCommands']);
      }));
    test('same acceptance identity reconciles the original winning bytes and complete acknowledgement', () =>
      fixture(async (setup) => {
        const posted = held(),
          release = held();
        const receiver = remote(setup, async (shape) => {
          if (shape === 'applyRuntimeCommands') {
            posted.resolve();
            await release.promise;
            return new Response(await writeDispatchBytes(setup, 'post'));
          }
          return new Response(await writeDispatchBytes(setup, 'lookup'));
        });
        const first = dispatch(setup, receiver.client);
        let winner: Awaited<ReturnType<typeof dispatch>> | undefined;
        try {
          await posted.promise;
          winner = await dispatch(
            setup,
            receiver.client,
            setup.runs,
            signal(),
            await setup.currentGuard(),
          );
          expect(winner.kind).toBe('accepted');
        } finally {
          release.resolve();
          await Promise.allSettled([first]);
        }
        expect(await first).toEqual(winner);
        if (winner.kind !== 'accepted') throw Error('winner missing');
        expect(
          new TextDecoder().decode(
            await setup.artifacts.readArtifact(winner.ack.receipt.acceptance.evidence),
          ),
        ).toBe(await writeDispatchBytes(setup, 'lookup'));
      }));
    test('invalid acceptance identity rejects before history reads or HTTP', () =>
      fixture(async (setup) => {
        let reads = 0;
        const runs: RunStore = {
          ...setup.runs,
          async readExecutionHistory(run, attempt) {
            reads++;
            return await setup.runs.readExecutionHistory(run, attempt);
          },
        };
        const input = structuredClone(setup.input);
        Object.assign(input, { acceptanceCommandId: '' });
        const receiver = remote(setup);
        await rejects(dispatch(setup, receiver.client, runs, signal(), setup.guard, input));
        expect(reads).toBe(0);
        expect(receiver.sent).toEqual([]);
      }));
    for (const path of ['sender', 'history'] as const)
      test('additive applied metadata preserves original bytes through ' + path, () =>
        fixture(async (setup) => {
          let raw = '';
          const receiver = remote(setup, async () => {
            raw = await writeDispatchBytes(setup, 'public-addition', (receipt) => {
              const acceptance = receipt['acceptance'] as { applied: object[] };
              Object.assign(acceptance.applied[0], { serverExtension: 'entry' });
            });
            return new Response(raw);
          });
          const client: RuntimeClient = {
            ...receiver.client,
            async applyCommands(input) {
              const exchange = await receiver.client.applyCommands(input);
              expect(exchange.reply.kind).toBe('success');
              if (exchange.reply.kind !== 'success' || exchange.response === null)
                throw Error('public parser did not accept additive metadata');
              console.log(
                'Task3 additive public parser accepted ' +
                  JSON.stringify({
                    path,
                    rawBytesBase64: Buffer.from(exchange.response.bytes).toString('base64'),
                  }),
              );
              return exchange;
            },
          };
          if (path === 'sender') {
            const reply = await dispatch(setup, client);
            expect(reply.kind).toBe('accepted');
            if (reply.kind !== 'accepted') throw Error('additive sender acceptance missing');
            expect(reply.ack.receipt.projection).toEqual({
              version: 1,
              actorId: 'account',
              basisAfter: 'rb1:' + 'b'.repeat(64),
              applied: [
                { index: 0, kind: 'setProgress' },
                { index: 1, kind: 'releaseWorkItem' },
              ],
            });
            expect(
              new TextDecoder().decode(
                await setup.artifacts.readArtifact(reply.ack.receipt.acceptance.evidence),
              ),
            ).toBe(raw);
          } else {
            const { acceptanceCommandId, ...input } = setup.input;
            const staged = unwrapReply(
              await stageWriteRequest(setup.runs, setup.artifacts, setup.guard, input),
            );
            const operation = readRuntimeRequest(staged.intent.canonicalRequest).operation;
            const actual = await client.applyCommands({
              params: { id: setup.scope.projectId },
              body: JSON.parse(
                JSON.stringify({ ...operation, personId: setup.scope.personId }),
              ) as Parameters<RuntimeClient['applyCommands']>[0]['body'],
            });
            if (actual.reply.kind !== 'success') throw Error('public receipt refused');
            const evidence = await retainRuntimeReceipt(
              setup.artifacts,
              actual.response,
              actual.reply.status,
            );
            const receipt = await verifyRuntimeReceipt(setup.artifacts, staged.intent, evidence);
            if (receipt.acceptance.kind !== 'write') throw Error('write receipt missing');
            unwrapReply(
              await setup.runs.recordWriteAcceptance(await setup.currentGuard(), {
                version: 1,
                kind: 'accept_write',
                commandId: acceptanceCommandId,
                stageCommandId: setup.input.commandId,
                intent: staged.intent,
                evidence,
                projection: {
                  version: 1,
                  actorId: receipt.actorId,
                  basisAfter: receipt.acceptance.basisAfter,
                  applied: receipt.acceptance.applied.map(({ index, kind }) => ({ index, kind })),
                },
              }),
            );
          }
          expect(
            (
              await readExecutionHistory(
                setup.runs,
                setup.artifacts,
                setup.guard.runId,
                setup.guard.attemptId,
              )
            ).attempt.state.kind,
          ).toBe('write_terminal');
        }),
      );
    test('pre-stage refusal and same local IDs never send', () =>
      fixture(async (setup) => {
        const receiver = remote(setup);
        expect(
          await dispatch(setup, receiver.client, setup.runs, signal(), {
            ...setup.guard,
            expectedRevision: 0,
          }),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        await rejects(
          dispatch(setup, receiver.client, setup.runs, signal(), setup.guard, {
            ...setup.input,
            acceptanceCommandId: setup.input.commandId,
          }),
          /identities must differ/,
        );
        expect(receiver.sent).toEqual([]);
      }));
    test('lost response duplicate uses lookup only and preserves independently submitted cuts', () =>
      fixture(async (setup) => {
        let bytes = '';
        const receiver = remote(setup, async (shape) => {
          if (shape === 'applyRuntimeCommands') {
            bytes = await writeDispatchBytes(setup);
            throw Error('lost response');
          }
          return new Response(bytes);
        });
        expect(await dispatch(setup, receiver.client)).toMatchObject({
          kind: 'pending',
          observation: { kind: 'unconfirmed', failure: { code: 'transport' } },
        });
        await pending(setup);
        expect(await dispatch(setup, receiver.client)).toMatchObject({
          kind: 'pending',
          observation: { kind: 'local_refused', reason: 'revision_conflict' },
        });
        const accepted = await dispatch(
          setup,
          receiver.client,
          setup.runs,
          signal(),
          await setup.currentGuard(),
        );
        expect(accepted.kind).toBe('accepted');
        expect(receiver.sent).toEqual([
          'applyRuntimeCommands',
          'lookupRuntimeReceipt',
          'lookupRuntimeReceipt',
        ]);
        expect(await dispatch(setup, receiver.client)).toEqual(accepted);
        expect(receiver.sent).toHaveLength(3);
      }));
    test('different acceptance identity cannot borrow a winner', () =>
      fixture(async (setup) => {
        const receiver = remote(setup);
        expect((await dispatch(setup, receiver.client)).kind).toBe('accepted');
        expect(
          await dispatch(setup, receiver.client, setup.runs, signal(), await setup.currentGuard(), {
            ...setup.input,
            acceptanceCommandId: executionCommandId('other-accept'),
          }),
        ).toMatchObject({
          kind: 'pending',
          observation: { kind: 'local_refused', reason: 'identity_conflict' },
        });
        expect(receiver.sent).toEqual(['applyRuntimeCommands', 'lookupRuntimeReceipt']);
      }));
    test('pre-aborted outcome retains completion without extending ownership or entering client', () =>
      fixture(async (setup) => {
        // Fault: dropping the early cancellation check extends the actual lease unnecessarily.
        const controller = new AbortController();
        controller.abort();
        let renewals = 0,
          applications = 0;
        const receiver = remote(setup);
        const client: RuntimeClient = {
          ...receiver.client,
          async applyCommands(input) {
            applications++;
            return await receiver.client.applyCommands(input);
          },
        };
        const runs: RunStore = {
          ...setup.runs,
          async renewOwnership(ownership) {
            renewals++;
            return await setup.runs.renewOwnership(ownership);
          },
        };
        const scope = await setup.runs.readRuntimeScope(setup.guard.scope);
        setup.clock.advance(50);
        expect(await dispatch(setup, client, runs, controller.signal)).toMatchObject({
          kind: 'pending',
          observation: { kind: 'cancelled_before_dispatch' },
        });
        const retained = await readPendingCompletion(setup);
        expect(retained.scope.kind).toBe('pinned');
        if (retained.scope.kind !== 'pinned' || scope.kind !== 'pinned')
          throw Error('scope missing');
        expect(retained.scope.acceptances).toEqual(scope.acceptances);
        setup.clock.advance(51);
        const takeover = await setup.runs.acquireOwnership(
          ownerId('after-cancellation'),
          setup.ownership.epoch,
        );
        console.log(
          'Task1 pre-aborted trace ' +
            JSON.stringify({ renewals, applications, takeover, sent: receiver.sent }),
        );
        expect(takeover.kind).toBe('applied');
        expect(renewals).toBe(0);
        expect(applications).toBe(0);
        expect(receiver.sent).toEqual([]);
        const afterTakeover = await readPendingCompletion(setup);
        expect(afterTakeover.snapshot).toEqual(retained.snapshot);
        expect(afterTakeover.history).toEqual(retained.history);
        if (afterTakeover.scope.kind !== 'pinned') throw Error('scope missing after takeover');
        expect(afterTakeover.scope.acceptances).toEqual(retained.scope.acceptances);
        expect(afterTakeover.scope.intents).toEqual(retained.scope.intents);
      }));
    test('abort during held renewal retains completion before entering the validated client', () =>
      fixture(async (setup) => {
        // Fault: dropping the post-renewal check enters the client and misclassifies observed cancellation.
        const renewing = held(),
          release = held();
        const controller = new AbortController();
        const receiver = remote(setup);
        let applications = 0;
        const client: RuntimeClient = {
          ...receiver.client,
          async applyCommands(input) {
            applications++;
            return await receiver.client.applyCommands(input);
          },
        };
        const runs: RunStore = {
          ...setup.runs,
          async renewOwnership(ownership) {
            const renewed = await setup.runs.renewOwnership(ownership);
            if (renewed.kind !== 'applied') throw Error('actual ownership renewal refused');
            renewing.resolve();
            await waitForReceiver(release.promise);
            return renewed;
          },
        };
        const delivery = dispatch(setup, client, runs, controller.signal);
        try {
          await waitForReceiver(renewing.promise);
          const staged = await readPendingCompletion(setup);
          expect(applications).toBe(0);
          expect(receiver.sent).toEqual([]);
          controller.abort();
          release.resolve();
          const reply = await waitForReceiver(delivery);
          console.log(
            'Task1 held-renewal trace ' +
              JSON.stringify({ reply, applications, sent: receiver.sent }),
          );
          expect(reply).toMatchObject({
            kind: 'pending',
            observation: { kind: 'cancelled_before_dispatch' },
          });
          expect(applications).toBe(0);
          expect(receiver.sent).toEqual([]);
          expect(await readPendingCompletion(setup)).toEqual(staged);
        } finally {
          release.resolve();
          await closeRecoveryResources([], [delivery]);
        }
      }));
    test('takeover during renewal leaves original completion pending', () =>
      fixture(async (setup) => {
        const receiver = remote(setup);
        const runs: RunStore = {
          ...setup.runs,
          async renewOwnership() {
            setup.clock.advance(1000);
            await setup.runs.acquireOwnership(ownerId('other'), setup.ownership.epoch);
            return { kind: 'refused', reason: 'owner_stale' };
          },
        };
        expect(await dispatch(setup, receiver.client, runs)).toMatchObject({
          kind: 'pending',
          observation: { kind: 'local_refused' },
        });
        expect(receiver.sent).toEqual([]);
        await pending(setup);
      }));
    test('snapshots nested completion guard and acceptance identity before awaits', () =>
      fixture(async (setup) => {
        const entered = held(),
          resume = held();
        const guard = structuredClone(setup.guard),
          input = structuredClone(setup.input);
        const runs: RunStore = {
          ...setup.runs,
          async readExecutionHistory(run, attempt) {
            entered.resolve();
            await resume.promise;
            return await setup.runs.readExecutionHistory(run, attempt);
          },
        };
        const receiver = remote(setup);
        const delivery = dispatch(setup, receiver.client, runs, signal(), guard, input);
        await entered.promise;
        Object.assign(guard, { expectedRevision: 0 });
        Object.assign(input, {
          commandId: executionCommandId('mutated-stage'),
          acceptanceCommandId: executionCommandId('mutated'),
        });
        Object.assign(input.completion.outcome, { summary: 'mutated' });
        resume.resolve();
        const reply = await delivery;
        expect(reply.kind).toBe('accepted');
        if (reply.kind !== 'accepted') throw Error('missing acceptance');
        expect(reply.ack.attempt.state.outcome).toEqual(setup.completion.outcome);
        expect(
          await setup.runs.readExecutionHistory(setup.guard.runId, setup.guard.attemptId),
        ).toMatchObject({
          writes: [{}, { command: { commandId: setup.input.acceptanceCommandId } }],
        });
      }));
    test('authentic live claim session rejects substitution of local Dash run identity', () =>
      fixture(async (setup) => {
        expect(setup.state.claims[0]?.claim.runId).not.toBe(setup.guard.runId);
        const state = structuredClone(setup.state);
        Object.assign(state.claims[0].claim, { runId: setup.guard.runId });
        const retained = await setup.artifacts.retainArtifact(
          new TextEncoder().encode(JSON.stringify(state)),
          'application/json',
        );
        if (retained.kind !== 'retained') throw Error('retention refused');
        const receiver = remote(setup);
        await rejects(
          dispatch(setup, receiver.client, setup.runs, signal(), setup.guard, {
            ...setup.input,
            stateEvidence: retained.reference,
          }),
          /write state claim authority or target differs/,
        );
        expect(receiver.sent).toEqual([]);
      }));
    test('typed receiver refusal remains pending', () =>
      fixture(async (setup) => {
        const receiver = remote(setup, () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: 'runtime_authority_stale' }), { status: 409 }),
          ),
        );
        expect(await dispatch(setup, receiver.client)).toMatchObject({
          kind: 'pending',
          observation: { kind: 'receiver_refused' },
        });
        await pending(setup);
      }));
    for (const fault of ['malformed', 'mismatched', 'missing-capture'] as const)
      test('correlates ' + fault + ' actual receipt failure', () =>
        fixture(async (setup) => {
          const receiver = remote(setup, async () => {
            const bytes = await writeDispatchBytes(setup);
            return new Response(
              fault === 'malformed'
                ? '{}'
                : fault === 'mismatched'
                  ? bytes.replace('wire-write', 'other-wire')
                  : bytes,
            );
          });
          const client: RuntimeClient =
            fault === 'missing-capture'
              ? {
                  ...receiver.client,
                  async applyCommands(input) {
                    return { ...(await receiver.client.applyCommands(input)), response: null };
                  },
                }
              : receiver.client;
          const failure = await dispatch(setup, client).catch((cause: unknown) => cause);
          expect(failure).toBeInstanceOf(RuntimeDispatchError);
          if (!(failure instanceof RuntimeDispatchError)) throw Error('correlation missing');
          expect(failure.intent.commandId).toBe('wire-write');
          await pending(setup);
        }),
      );
  });
}
