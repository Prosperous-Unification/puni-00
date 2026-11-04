import { rejects, throws } from 'node:assert/strict';

import { canonicalRuntimeRequest } from '@wbs/contracts';
import { describe, expect, test } from 'bun:test';

import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import { deliverOutcome } from '../deliver-outcome';
import { dispatchRecovery } from '../dispatch-recovery';
import { decodeRecoveryClosure, decodeRecoveryHistory } from '../recovery-codecs';
import { RecoveryDispatchError } from '../recovery-dispatch-error';
import { readRecoveryExchange } from '../recovery-evidence';
import { verifyRecoveryHistory } from '../recovery-history';
import type { RecoveryBeginCall } from '../recovery-records';
import { decodeRuntimeIntent, readRuntimeRequest } from '../runtime-codecs';
import type { RuntimeIntent } from '../runtime-records';
import { type HistoryCatalog, validateHistory } from '../validate-history';
import { executionCommandId } from '../value-codecs';
import { stageWriteRequest } from '../write-history';
import { type OutcomeFixture, unwrapReply } from './fixtures';
import { decodeFormat5Command, decodeFormat5Payload } from './format5-protocol';
import { authorityReceipt } from './runtime-history-contract';
import { writeDispatchBytes, writeDispatchFixture } from './write-dispatch-contract';

type WriteSetup = Awaited<ReturnType<typeof writeDispatchFixture>>;

/** Reconstructs only these isolated fixtures: one run/attempt/manifest/scope at capacity2. Run, execution, write, obligation and recovery payloads come from provider reads; owner comes from fixture input, active/barrier/count projections from scope histories, and empty signal/generic ledgers from known fixture operations. This is not an independent raw-global observer or barrier/count proof. */
async function readWriteCatalogue(
  stores: OutcomeFixture,
  setup: WriteSetup,
): Promise<HistoryCatalog> {
  const snapshot = await stores.runs.readRun(setup.guard.runId);
  const history = await stores.runs.readExecutionHistory(setup.guard.runId, setup.guard.attemptId);
  const scope = await stores.runs.readRuntimeScope(setup.scope);
  if (
    snapshot.version !== 4 ||
    history.version !== 3 ||
    scope.kind !== 'pinned' ||
    scope.version !== 3
  )
    throw Error('current write catalogue missing');
  const histories = scope.recoveries;
  const barriers = histories.flatMap((entry) =>
    entry.closure === null
      ? []
      : [
          {
            recoveryId: entry.intent.recoveryId,
            scope: setup.scope,
            scopeBefore: entry.closure.scopeBefore,
            scopeAfter: entry.closure.scopeAfter,
            generationFloor:
              entry.closure.fence.observation.reply.body.value.acceptance.authority.generation,
          },
        ],
  );
  const active =
    scope.activeRecoveryId === null
      ? []
      : [{ scope: setup.scope, recoveryId: scope.activeRecoveryId }];
  const owner = setup.guard.ownership;
  return {
    ownership: {
      storeId: owner.storeId,
      organizationId: owner.organizationId,
      epoch: owner.epoch,
      owner,
    },
    runtime: {
      scopes: [{ pin: scope.pin, revision: scope.revision }],
      intents: scope.intents,
      acceptances: scope.acceptances,
      recovery: {
        histories,
        barriers,
        active,
        counts: {
          journals: histories.length,
          fences: histories.reduce((sum, entry) => sum + entry.fences.length, 0),
          observations: histories.reduce((sum, entry) => sum + entry.observations.length, 0),
          closures: histories.filter((entry) => entry.closure !== null).length,
          barriers: barriers.length,
          active: active.length,
        },
      },
    },
    manifests: [setup.manifest],
    runs: [{ run: history.run, initial: setup.run }],
    attempts: [{ attempt: history.attempt, admission: setup.admission }],
    executions: history.executions,
    consumptions: [],
    completions: [],
    receipts: [],
    decisions: [],
    reservations: [],
    capacity: 2,
    writes: history.writes,
    obligations: snapshot.writeObligations,
    writeReceipts: snapshot.writeReceipts,
  };
}

type WriteAuditGap =
  | 'acceptance_identity'
  | 'stage_association'
  | 'active_checkpoint'
  | 'reserved_ack'
  | 'current_attempt'
  | 'original_ack'
  | 'nonaccepted_consequence';
function rejectWriteAuditGap(catalogue: HistoryCatalog, field: WriteAuditGap) {
  const corrupted = structuredClone(catalogue);
  const history = corrupted.runtime.recovery.histories[0];
  const attempt = corrupted.attempts[0].attempt;
  if (history.version !== 2 || attempt.version !== 4)
    throw Error('write gap fixture is not current');
  let expected: string;
  switch (field) {
    case 'acceptance_identity':
      Object.assign(history.intent.target, { acceptanceCommandId: 'stage-claim' });
      expected = 'corrupt recovery write acceptance identity';
      break;
    case 'stage_association':
      Object.assign(history.intent.target, { stageCommandId: 'missing-stage' });
      expected = 'corrupt recovery write stage association';
      break;
    case 'active_checkpoint':
      Object.assign(attempt.state.outcome, { summary: 'substituted-current-outcome' });
      expected = 'corrupt active recovery write checkpoint';
      break;
    case 'reserved_ack': {
      const accepted = corrupted.writes.find((entry) => entry.kind === 'accept_write');
      if (accepted?.kind !== 'accept_write') throw Error('accepted gap journal missing');
      Object.assign(accepted.reply.attempt.state.outcome, { summary: 'substituted-ack-outcome' });
      expected = 'corrupt write recovery command collision';
      break;
    }
    case 'current_attempt':
      Object.assign(attempt.state.outcome, { summary: 'substituted-current-outcome' });
      expected = 'corrupt recovery write current attempt';
      break;
    case 'original_ack': {
      const accepted = corrupted.writes.find((entry) => entry.kind === 'accept_write');
      if (accepted?.kind !== 'accept_write') throw Error('accepted gap journal missing');
      Object.assign(accepted.context, { scopeRevision: accepted.context.scopeRevision + 1 });
      expected = 'write journal acceptance differs';
      break;
    }
    case 'nonaccepted_consequence': {
      const closure = history.closure;
      if (closure?.version !== 2 || closure.decision.kind !== 'fenced_nonaccepted')
        throw Error('nonaccepted gap closure missing');
      Object.assign(closure.attemptReply.state.outcome, { summary: 'substituted-settled-outcome' });
      Object.assign(attempt.state.outcome, { summary: 'substituted-settled-outcome' });
      expected = 'corrupt write nonacceptance consequence';
      break;
    }
  }
  throws(
    () => validateHistory(corrupted),
    (cause: unknown) => {
      if (!(cause instanceof Error)) throw Error('unexpected gap failure', { cause });
      console.log(
        'Task3 phase2 gap ' + JSON.stringify({ field, expected, observed: cause.message }),
      );
      return cause.message === expected;
    },
    'phase2 write audit ' + field,
  );
}

/** Reuses the contract's modeled remote replies through the actual Response-capturing client. No physical receiver effects are asserted by this fixture transport. */
export function createWriteRecoveryClient(
  setup: WriteSetup,
  original: RuntimeIntent,
  accepted: boolean,
  trace: string[],
  extension: boolean,
): RuntimeClient {
  return createRuntimeClient(async (shape, input) => {
    trace.push(shape.operationId);
    if (shape.operationId === 'readRuntimeState') return Response.json(setup.state);
    if (shape.operationId === 'acquireRuntimeAuthority') {
      const { personId: _personId, ...body } = input.body as Record<string, unknown>;
      const canonical = canonicalRuntimeRequest(setup.scope, {
        ...body,
        kind: 'authority',
      });
      const receipt = authorityReceipt(
        decodeRuntimeIntent({
          version: 1,
          commandId: readRuntimeRequest(canonical).operation.commandId,
          canonicalRequest: canonical,
          requestDigest: new Bun.CryptoHasher('sha256').update(canonical).digest('hex'),
          localOwner: original.localOwner,
          stagedRevision: 1,
        }),
      );
      return Response.json({
        ...receipt,
        acceptance: {
          ...receipt.acceptance,
          authority: { ...receipt.acceptance.authority, ownerId: body['ownerId'] },
        },
      });
    }
    return accepted
      ? new Response(
          await writeDispatchBytes(setup, 'original', (receipt) => {
            if (extension) {
              const acceptance = receipt['acceptance'] as { applied: object[] };
              Object.assign(acceptance.applied[0], { serverExtension: 'entry' });
            }
          }),
        )
      : Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 });
  });
}

/** Runs full write recovery against real provider journals and actual captured Response exchanges. Real receiver composition is a separate integration case. */
export function writeRecoveryContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    for (const { accepted, identity, fault, extension } of [
      ...[true, false].flatMap((accepted) =>
        ['local-accept', 'wire-write', 'grant'].map((identity) => ({
          accepted,
          identity,
          fault: undefined,
          extension: false,
        })),
      ),
      ...['receipt_command', 'receipt_claim', 'receipt_authority', 'projection', 'context'].map(
        (fault) => ({ accepted: true, identity: 'local-accept', fault, extension: false }),
      ),
      { accepted: true, identity: 'local-accept', fault: undefined, extension: true },
    ])
      test(
        'write recovery ' +
          (accepted ? 'accepted' : 'nonaccepted') +
          ' preserves false capacity with acceptance ' +
          identity +
          ' fault ' +
          String(fault) +
          ' extension ' +
          String(extension),
        async () => {
          const stores = await create();
          try {
            const setup = await writeDispatchFixture(stores);
            const stage = unwrapReply(
              await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, {
                commandId: setup.input.commandId,
                completion: setup.completion,
                canonicalRequest: setup.canonicalRequest,
                stateEvidence: setup.stateEvidence,
              }),
            );
            const guard = { ...(await setup.currentGuard()), expectedRecoveryRevision: 0 };
            const begin: RecoveryBeginCall = {
              kind: 'write',
              guard,
              intent: {
                version: 2,
                recoveryId: 'recover-write',
                target: {
                  kind: 'write',
                  original: stage.intent,
                  runId: guard.runId,
                  attemptId: guard.attemptId,
                  stageCommandId: setup.input.commandId,
                  acceptanceCommandId: executionCommandId(identity),
                },
                begunScopeRevision: stage.intent.stagedRevision,
                resolver: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
              },
            };
            expect(() =>
              decodeFormat5Command({ method: 'beginRecovery', parameters: [begin] }),
            ).toThrow();
            if (identity === 'local-accept' && fault === undefined) {
              for (const field of ['version', 'unknown'] as const) {
                const malformed = structuredClone(begin);
                if (field === 'version') Object.assign(malformed.intent, { version: 3 });
                else Object.assign(malformed.intent.target, { unexpected: true });
                await rejects(stores.runs.beginRecovery(malformed));
              }
              expect(
                await stores.runs.beginRecovery({
                  ...begin,
                  intent: {
                    ...begin.intent,
                    target: { ...begin.intent.target, acceptanceCommandId: setup.input.commandId },
                  },
                }),
              ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
              expect(
                await stores.runs.beginRecovery({
                  ...begin,
                  intent: {
                    ...begin.intent,
                    target: {
                      ...begin.intent.target,
                      stageCommandId: executionCommandId('stage-claim'),
                    },
                  },
                }),
              ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
            }
            if (identity === 'local-accept' && fault === undefined && !extension) {
              const missing = structuredClone(begin);
              Object.assign(missing.guard, { runId: 'missing-run' });
              Object.assign(missing.intent.target, { runId: 'missing-run' });
              await rejects(stores.runs.beginRecovery(missing), /recovery target does not exist/);
            }
            const begun = await stores.runs.beginRecovery(begin);
            expect(begun.kind).toBe('applied');
            expect(() =>
              decodeFormat5Payload({ action: 'invoke', method: 'beginRecovery', value: begun }),
            ).toThrow();

            if (identity === 'local-accept' && fault === undefined && !extension) {
              const catalogue = await readWriteCatalogue(stores, setup);
              expect(validateHistory(catalogue)).toHaveLength(1);
              for (const field of [
                'acceptance_identity',
                'stage_association',
                'active_checkpoint',
              ] as const)
                rejectWriteAuditGap(catalogue, field);
            }

            const trace: string[] = [];
            const actualClient = createWriteRecoveryClient(
              setup,
              stage.intent,
              accepted,
              trace,
              extension,
            );
            const client: RuntimeClient = {
              ...actualClient,
              async lookupReceipt(input) {
                const exchange = await actualClient.lookupReceipt(input);
                if (extension) expect(exchange.reply.kind).toBe('success');
                return exchange;
              },
            };
            const runs: typeof stores.runs = {
              ...stores.runs,
              async stageRecoveryFence(call) {
                expect(() =>
                  decodeFormat5Command({ method: 'stageRecoveryFence', parameters: [call] }),
                ).toThrow();
                return await stores.runs.stageRecoveryFence(call);
              },
              async recordRecoveryFence(call) {
                expect(() =>
                  decodeFormat5Command({ method: 'recordRecoveryFence', parameters: [call] }),
                ).toThrow();
                return await stores.runs.recordRecoveryFence(call);
              },
              async resolveRecovery(call) {
                expect(() =>
                  decodeFormat5Command({ method: 'resolveRecovery', parameters: [call] }),
                ).toThrow();

                const candidate = structuredClone(call);
                if (
                  fault !== undefined &&
                  candidate.kind === 'write' &&
                  candidate.decision.kind === 'accepted'
                ) {
                  const receipt = candidate.decision.lookup.body.value;
                  if (fault === 'receipt_command')
                    Object.assign(receipt, { commandId: 'other-command' });
                  if (fault === 'receipt_claim')
                    Object.assign(receipt.acceptance.claim, { claimId: 'other-claim' });
                  if (fault === 'receipt_authority')
                    Object.assign(receipt.acceptance.authority, { generation: 99 });
                  if (fault === 'projection')
                    Object.assign(candidate.decision.command.projection, { actorId: 'invented' });
                  if (fault === 'context')
                    Object.assign(candidate.decision.lookup.envelope.value.context, {
                      observationRevision: 99,
                    });
                }
                return await stores.runs.resolveRecovery(candidate);
              },
            };
            const closed = await dispatchRecovery(
              runs,
              stores.artifacts,
              client,
              { kind: 'write', guard, recoveryId: 'recover-write' },
              new AbortController().signal,
            );
            if (fault !== undefined) {
              expect(closed).toEqual({ kind: 'refused', reason: 'identity_conflict' });
              return;
            }
            expect(closed).toMatchObject({
              kind: 'resolved',
              closure: {
                version: 2,
                attemptReply: {
                  version: 4,
                  holdsCapacity: false,
                  state: { kind: accepted ? 'write_terminal' : 'write_nonaccepted' },
                },
              },
            });
            if (closed.kind !== 'resolved') throw Error('closure missing');
            expect(() =>
              decodeFormat5Payload({
                action: 'invoke',
                method: 'resolveRecovery',
                value: { kind: 'applied', value: closed.closure },
              }),
            ).toThrow();
            expect(trace).toEqual([
              'readRuntimeState',
              'acquireRuntimeAuthority',
              'lookupRuntimeReceipt',
            ]);
            const snapshot = await stores.runs.readRun(guard.runId);
            expect(snapshot).toMatchObject({
              capacity: { reserved: 0 },
              writeObligations: accepted
                ? []
                : [{ disposition: { kind: 'fenced_nonaccepted', recoveryId: 'recover-write' } }],
            });
            expect(snapshot.run.revision).toBe(guard.expectedRevision + 1);
            expect(snapshot.attempts[0]?.revision).toBe(guard.expectedAttemptRevision + 1);
            expect(await stores.runs.readRuntimeScope(setup.scope)).toMatchObject({
              pendingCommandId: null,
              activeRecoveryId: null,
              generationFloor: 2,
            });
            if (accepted && identity === 'local-accept' && closed.closure.version === 2) {
              const lookup = closed.closure.decision.lookup;
              const rewritten = await stores.artifacts.retainArtifact(
                new TextEncoder().encode(
                  JSON.stringify({
                    ...lookup.envelope.value,
                    context: {
                      kind: 'fence_reply',
                      recoveryId: 'recover-write',
                      ordinal: 1,
                      requestDigest: stage.intent.requestDigest,
                      stagedRevision: stage.intent.stagedRevision,
                    },
                  }),
                ),
                'application/json',
              );
              if (rewritten.kind !== 'retained') throw Error('purpose artifact refused');
              await rejects(
                readRecoveryExchange(stores.artifacts, rewritten.reference, {
                  kind: 'write',
                  intent: stage.intent,
                }),
                /recovery evidence purpose differs/,
              );
            }
            if (identity === 'local-accept') {
              const scope = await stores.runs.readRuntimeScope(setup.scope);
              const history = await stores.runs.readExecutionHistory(guard.runId, guard.attemptId);
              if (
                scope.kind !== 'pinned' ||
                scope.version !== 3 ||
                history.version !== 3 ||
                snapshot.version !== 4
              )
                throw Error('current history missing');
              const histories = scope.recoveries;
              await verifyRecoveryHistory(stores.artifacts, histories[0]);
              if (accepted) {
                const forged = structuredClone(histories[0]);
                if (forged.closure?.version !== 2 || forged.closure.decision.kind !== 'accepted')
                  throw Error('verified write closure missing');
                Object.assign(forged.closure.decision.command.projection, {
                  actorId: 'substituted-actor',
                });
                await rejects(
                  verifyRecoveryHistory(stores.artifacts, forged),
                  /recovery write command differs from actual receipt/,
                );
              }

              expect(() =>
                decodeFormat5Payload({
                  action: 'observe_recovery',
                  version: 2,
                  value: histories[0],
                }),
              ).toThrow();
              const barriers = histories.flatMap((entry) =>
                entry.closure === null
                  ? []
                  : [
                      {
                        recoveryId: entry.intent.recoveryId,
                        scope: setup.scope,
                        scopeBefore: entry.closure.scopeBefore,
                        scopeAfter: entry.closure.scopeAfter,
                        generationFloor:
                          entry.closure.fence.observation.reply.body.value.acceptance.authority
                            .generation,
                      },
                    ],
              );
              const catalog: HistoryCatalog = {
                ownership: {
                  storeId: guard.ownership.storeId,
                  organizationId: guard.ownership.organizationId,
                  epoch: guard.ownership.epoch,
                  owner: guard.ownership,
                },
                runtime: {
                  scopes: [{ pin: scope.pin, revision: scope.revision }],
                  intents: scope.intents,
                  acceptances: scope.acceptances,
                  recovery: {
                    histories,
                    barriers,
                    active: [],
                    counts: {
                      journals: histories.length,
                      fences: histories.reduce((sum, entry) => sum + entry.fences.length, 0),
                      observations: histories.reduce(
                        (sum, entry) => sum + entry.observations.length,
                        0,
                      ),
                      closures: 1,
                      barriers: 1,
                      active: 0,
                    },
                  },
                },
                manifests: [setup.manifest],
                runs: [{ run: history.run, initial: setup.run }],
                attempts: [{ attempt: history.attempt, admission: setup.admission }],
                executions: history.executions,
                consumptions: [],
                completions: [],
                receipts: [],
                decisions: [],
                reservations: [],
                capacity: 2,
                writes: history.writes,
                obligations: snapshot.writeObligations,
                writeReceipts: snapshot.writeReceipts,
              };
              expect(validateHistory(catalog)).toHaveLength(1);
              if (!extension) {
                if (accepted)
                  for (const field of ['reserved_ack', 'current_attempt', 'original_ack'] as const)
                    rejectWriteAuditGap(catalog, field);
                else rejectWriteAuditGap(catalog, 'nonaccepted_consequence');
              }

              if (accepted)
                for (const fault of [
                  'receipt_claim',
                  'receipt_authority',
                  'receipt_applied',
                  'closure_projection',
                  'closure_attempt',
                ] as const) {
                  const corrupted = structuredClone(catalog);
                  const retained = corrupted.runtime.recovery.histories[0];
                  const closure = retained.closure;
                  if (
                    retained.version !== 2 ||
                    closure?.version !== 2 ||
                    closure.decision.kind !== 'accepted' ||
                    closure.originalReply?.kind !== 'write'
                  )
                    throw Error('accepted write closure missing');
                  const receipt = closure.decision.lookup.body.value;
                  if (fault === 'receipt_claim')
                    Object.assign(receipt.acceptance.claim, { claimId: 'substituted-claim' });
                  if (fault === 'receipt_authority')
                    Object.assign(receipt.acceptance.authority, { generation: 99 });
                  if (fault === 'receipt_applied')
                    Object.assign(receipt.acceptance.applied[0], { kind: 'setMeasure' });
                  if (fault === 'closure_projection')
                    Object.assign(closure.decision.command.projection, {
                      actorId: 'substituted-actor',
                    });
                  if (fault === 'closure_attempt') {
                    Object.assign(closure.attemptReply.state, {
                      stageCommandId: 'substituted-stage',
                    });
                    Object.assign(closure.originalReply.ack.attempt.state, {
                      stageCommandId: 'substituted-stage',
                    });
                  }
                  const diagnostic = fault.startsWith('receipt_')
                    ? /corrupt recovery write receipt/
                    : fault === 'closure_projection'
                      ? /corrupt recovery write closure/
                      : /corrupt recovery write attempt closure/;
                  throws(
                    () => validateHistory(corrupted),
                    diagnostic,
                    'retained write recovery ' + fault,
                  );
                }

              expect(() => decodeRecoveryHistory({ ...histories[0], version: 3 })).toThrow();
              expect(() => decodeRecoveryClosure({ ...closed.closure, version: 3 })).toThrow();
              for (const field of [
                'stage',
                'original',
                'barrier',
                'index',
                'capacity',
                'reservation',
                'settlement',
              ]) {
                const corrupted = structuredClone(catalog);
                const retained = corrupted.runtime.recovery.histories[0];
                const closure = retained.closure;
                if (closure?.version !== 2) throw Error('write closure missing');
                if (field === 'stage')
                  Object.assign(retained.intent.target, { stageCommandId: 'other-stage' });
                if (field === 'original')
                  Object.assign(closure.original, { requestDigest: 'a'.repeat(64) });
                if (field === 'barrier')
                  Object.assign(corrupted.runtime.recovery.barriers[0], { generationFloor: 99 });
                if (field === 'index')
                  Object.assign(corrupted.runtime.recovery, {
                    active: [{ scope: setup.scope, recoveryId: 'recover-write' }],
                    counts: { ...corrupted.runtime.recovery.counts, active: 1 },
                  });
                if (field === 'capacity')
                  Object.assign(closure.attemptReply, { holdsCapacity: true });
                if (field === 'reservation')
                  Object.assign(retained.intent.target, { acceptanceCommandId: 'stage-claim' });
                if (field === 'settlement')
                  Object.assign(corrupted, {
                    obligations: accepted ? [stage.obligation] : [stage.obligation],
                  });
                throws(
                  () => validateHistory(corrupted),
                  (cause: unknown) => cause instanceof Error,
                  'write recovery history field ' + field,
                );
              }
            }
            if (!accepted) {
              const before = await stores.runs.readRun(guard.runId);
              const current = await setup.currentGuard();
              expect(
                await deliverOutcome(
                  stores.runs,
                  stores.artifacts,
                  client,
                  current,
                  { ...setup.input, acceptanceCommandId: executionCommandId(identity) },
                  new AbortController().signal,
                ),
              ).toMatchObject({ kind: 'pending' });
              expect(trace.filter((operation) => operation === 'applyRuntimeCommands')).toEqual([]);
              expect(
                await stores.runs.stageWrite(current, {
                  ...setup.command,
                  commandId: executionCommandId('replacement'),
                }),
              ).toMatchObject({ kind: 'refused' });
              expect(await stores.runs.readRun(guard.runId)).toEqual(before);
            }
          } finally {
            await stores.close();
          }
        },
      );
    test('write target retains three fence identities and three POSTs per invocation across resume', async () => {
      const stores = await create();
      try {
        const setup = await writeDispatchFixture(stores);
        const { acceptanceCommandId, ...input } = setup.input;
        const stage = unwrapReply(
          await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, input),
        );
        const guard = { ...(await setup.currentGuard()), expectedRecoveryRevision: 0 };
        const recoveryId = 'bounded-write';
        unwrapReply(
          await stores.runs.beginRecovery({
            kind: 'write',
            guard,
            intent: {
              version: 2,
              recoveryId,
              target: {
                kind: 'write',
                original: stage.intent,
                runId: guard.runId,
                attemptId: guard.attemptId,
                stageCommandId: input.commandId,
                acceptanceCommandId,
              },
              begunScopeRevision: stage.intent.stagedRevision,
              resolver: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
            },
          }),
        );
        let generation = 1;
        let limit = 3;
        const posts: string[] = [];
        const lookups: string[] = [];
        const client = createRuntimeClient((shape, input) => {
          if (shape.operationId === 'readRuntimeState')
            return Promise.resolve(
              Response.json({
                ...setup.state,
                authority: { kind: 'held', ownerId: 'contender', generation },
              }),
            );
          if (shape.operationId === 'acquireRuntimeAuthority') {
            const command = input.body as { commandId: string };
            posts.push(command.commandId);
            generation++;
            if (posts.length > limit)
              throw Error('test observed an extra POST beyond invocation bound');
            return Promise.resolve(
              Response.json({ error: 'runtime_generation_conflict' }, { status: 409 }),
            );
          }
          if (shape.operationId === 'lookupRuntimeReceipt') {
            const commandId = input.params['commandId'];
            if (commandId === undefined) throw Error('lookup command identity missing');
            lookups.push(commandId);
            return Promise.resolve(
              Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 }),
            );
          }
          throw Error('unexpected bounded recovery operation');
        });
        const run = async () => {
          const reply = await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            client,
            { kind: 'write', guard, recoveryId },
            new AbortController().signal,
          );
          console.log('Task3 bounded write returned ' + JSON.stringify(reply));
          return reply;
        };
        await rejects(
          run(),
          (cause: unknown) => cause instanceof RecoveryDispatchError && cause.code === 'exhausted',
        );
        expect(posts).toEqual([
          'bounded-write:fence:1',
          'bounded-write:fence:2',
          'bounded-write:fence:3',
        ]);
        Object.assign(guard, { expectedRecoveryRevision: 6 });
        limit = 6;
        await rejects(
          run(),
          (cause: unknown) => cause instanceof RecoveryDispatchError && cause.code === 'exhausted',
        );
        expect(posts.slice(3)).toEqual([
          'bounded-write:fence:3',
          'bounded-write:fence:3',
          'bounded-write:fence:3',
        ]);
        expect(lookups).not.toContain(stage.intent.commandId);
        const scope = await stores.runs.readRuntimeScope(setup.scope);
        expect(scope).toMatchObject({
          activeRecoveryId: recoveryId,
          pendingCommandId: stage.intent.commandId,
          recoveries: [{ version: 2, revision: 6, closure: null }],
        });
        if (scope.kind !== 'pinned' || scope.version !== 3) throw Error('bounded scope missing');
        expect(scope.recoveries[0].fences).toHaveLength(3);
        expect(await stores.runs.readRun(guard.runId)).toMatchObject({
          writeObligations: [{ disposition: { kind: 'pending' } }],
          capacity: { reserved: 0 },
        });
      } finally {
        await stores.close();
      }
    });
  });
}
