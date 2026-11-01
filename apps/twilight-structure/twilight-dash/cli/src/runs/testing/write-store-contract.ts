import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { readExecutionHistory } from '../claim-history';
import { stageClaimRequest } from '../claim-history';
import type { RecoveryBeginCall } from '../recovery-records';
import type { RunStore } from '../run-store';
import { readRuntimeRequest } from '../runtime-codecs';
import type { RuntimeIntent } from '../runtime-records';
import { attemptId, executionCommandId, ownerId } from '../value-codecs';
import { acceptWriteReceipt, stageWriteRequest } from '../write-history';
import type { OutcomeFixture } from './fixtures';
import { admitExecution, createExecutionCommand, createRunGuard, unwrapReply } from './fixtures';
import { prepareSession, retainClaimReceipt } from './fixtures';
import { createRecoveryFenceCall } from './recovery-contract';
import { authorityRequest } from './runtime-history-contract';
import { createWriteFixture } from './write-fixture';

/** Retains complete original public write receipt bytes for the exact command; optional rewrites exercise the real verifier. */
export async function retainWriteReceipt(
  stores: Pick<OutcomeFixture, 'artifacts'>,
  intent: RuntimeIntent,
  rewrite: (receipt: Record<string, unknown>) => void = () => undefined,
) {
  const request = readRuntimeRequest(intent.canonicalRequest);
  if ('kind' in request.operation || request.operation.action.kind !== 'write')
    throw new Error('write fixture requires write');
  const receipt: Record<string, unknown> = {
    schemaVersion: 1,
    scope: request.scope,
    ledgerId: request.operation.expectedLedgerId,
    commandId: intent.commandId,
    requestDigest: intent.requestDigest,
    actorId: 'account',
    acceptance: {
      kind: 'write',
      authority: request.operation.authority,
      claim: request.operation.action.claim,
      basisAfter: 'rb1:' + 'b'.repeat(64),
      applied: request.operation.action.commands.map((entry, index) => ({
        index,
        kind: entry.kind,
      })),
    },
  };
  rewrite(receipt);
  const retained = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(JSON.stringify(receipt)),
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('write receipt retention refused');
  return retained.reference;
}
export function writeStoreContract(
  name: string,
  create: () => Promise<OutcomeFixture & { readonly runs: RunStore }>,
) {
  describe(name, () => {
    test('one owner publishes two actual eligible write targets and preserves default fixture bytes', async () => {
      const stores = await create();
      try {
        const first = await createWriteFixture(stores);
        expect(Object.hasOwn(first, 'facts')).toBe(true);
        expect(first.command.commandId).toBe(executionCommandId('stage-write'));
        expect(readRuntimeRequest(first.canonicalRequest).operation.commandId).toBe('wire-write');
        const staged = unwrapReply(await stores.runs.stageWrite(first.guard, first.command));
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await first.currentGuard(), {
            commandId: executionCommandId('accept-first'),
            stageCommandId: first.command.commandId,
            intent: staged.intent,
            evidence: await retainWriteReceipt(stores, staged.intent),
          }),
        );
        const second = await createWriteFixture(stores, {
          ownership: first.ownership,
          suffix: 'other',
        });
        expect(Object.hasOwn(second, 'facts')).toBe(false);
        expect(second.run.runId).not.toBe(first.run.runId);
        expect(second.guard.attemptId).not.toBe(first.guard.attemptId);
        expect(readRuntimeRequest(second.canonicalRequest).operation.commandId).toBe(
          'wire-write-other',
        );
        const next = unwrapReply(await stores.runs.stageWrite(second.guard, second.command));
        expect(next.attempt.state.kind).toBe('write_pending');
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await second.currentGuard(), {
            commandId: executionCommandId('accept-other'),
            stageCommandId: second.command.commandId,
            intent: next.intent,
            evidence: await retainWriteReceipt(stores, next.intent),
          }),
        );
        const third = await createWriteFixture(stores, {
          ownership: first.ownership,
          suffix: 'third',
        });
        expect(Object.hasOwn(third, 'facts')).toBe(false);
        expect(third.run.runId).not.toBe(second.run.runId);
        expect(
          unwrapReply(await stores.runs.stageWrite(third.guard, third.command)).attempt.state.kind,
        ).toBe('write_pending');
        expect(await stores.runs.stageWrite(first.guard, first.command)).toEqual({
          kind: 'duplicate',
          value: staged,
        });
        expect(
          (await stores.runs.readExecutionHistory(first.run.runId, first.guard.attemptId)).version,
        ).toBe(3);
        expect(
          (await stores.runs.readExecutionHistory(second.run.runId, second.guard.attemptId))
            .version,
        ).toBe(3);
      } finally {
        await stores.close();
      }
    });
    for (const domain of ['local', 'wire'] as const)
      test(
        'second actual write target independently refuses a global ' +
          domain +
          ' identity collision',
        async () => {
          const stores = await create();
          try {
            const first = await createWriteFixture(stores);
            const stage = unwrapReply(await stores.runs.stageWrite(first.guard, first.command));
            unwrapReply(
              await acceptWriteReceipt(stores.runs, stores.artifacts, await first.currentGuard(), {
                commandId: executionCommandId('accept-first'),
                stageCommandId: first.command.commandId,
                intent: stage.intent,
                evidence: await retainWriteReceipt(stores, stage.intent),
              }),
            );
            const second = await createWriteFixture(stores, {
              ownership: first.ownership,
              suffix: 'other',
            });
            const before = await stores.runs.readRun(second.run.runId);
            const wire = JSON.parse(second.canonicalRequest) as Record<string, unknown>;
            wire['commandId'] = stage.intent.commandId;
            const command =
              domain === 'local'
                ? { ...second.command, commandId: first.command.commandId }
                : { ...second.command, canonicalRequest: JSON.stringify(wire) };
            const reply = await stores.runs.stageWrite(second.guard, command).then(
              (reply) => ({ kind: 'reply' as const, reply }),
              (cause: unknown) => ({ kind: 'thrown' as const, cause }),
            );
            expect(reply).toEqual({
              kind: 'reply',
              reply: { kind: 'refused', reason: 'identity_conflict' },
            });
            expect(await stores.runs.readRun(second.run.runId)).toEqual(before);
            expect((await stores.runs.stageWrite(second.guard, second.command)).kind).toBe(
              'applied',
            );
          } finally {
            await stores.close();
          }
        },
      );
    test('coupled stage and acceptance publish exact original replies and histories once', async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const staging = await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, {
          commandId: setup.command.commandId,
          completion: setup.completion,
          canonicalRequest: setup.canonicalRequest,
          stateEvidence: setup.stateEvidence,
        }).then(
          (reply) => ({ kind: 'reply' as const, reply }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        expect(staging.kind).toBe('reply');
        if (staging.kind !== 'reply')
          throw Error('verified stage failed', { cause: staging.cause });
        expect(staging.reply.kind).toBe('applied');
        const staged = unwrapReply(staging.reply);
        const pendingRead = await stores.runs.readRun(setup.run.runId).then(
          (snapshot) => ({ kind: 'read' as const, snapshot }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        expect(pendingRead.kind).toBe('read');
        if (pendingRead.kind !== 'read')
          throw new Error('staged bundle is unreadable', { cause: pendingRead.cause });
        const pending = pendingRead.snapshot;
        expect(pending).toMatchObject({
          version: 4,
          capacity: { reserved: 0 },
          writeObligations: [staged.obligation],
          writeReceipts: [],
          pendingIntents: [],
          receipts: [],
        });
        expect(pending.run.revision).toBe(setup.guard.expectedRevision + 1);
        const scope = await stores.runs.readRuntimeScope(setup.scope);
        expect(scope.version).toBe(3);
        expect(scope).toMatchObject({
          kind: 'pinned',
          revision: staged.intent.stagedRevision,
          pendingCommandId: staged.intent.commandId,
        });
        const history = await readExecutionHistory(
          stores.runs,
          stores.artifacts,
          setup.run.runId,
          setup.guard.attemptId,
        );
        expect(history).toMatchObject({
          version: 3,
          completion: null,
          receipt: null,
          writes: [
            {
              kind: 'stage_write',
              context: { scopeRevision: setup.guard.expectedScopeRevision },
              reply: staged,
            },
          ],
        });
        const guard = await setup.currentGuard();
        const input = {
          commandId: executionCommandId('accept-write'),
          stageCommandId: setup.command.commandId,
          intent: staged.intent,
          evidence: await retainWriteReceipt(stores, staged.intent),
        };
        const accepted = unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input),
        );
        expect(accepted.attempt).toMatchObject({
          version: 4,
          holdsCapacity: false,
          state: { kind: 'write_terminal' },
        });
        const terminalRead = await stores.runs.readRun(setup.run.runId).then(
          (snapshot) => ({ kind: 'read' as const, snapshot }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        expect(terminalRead.kind).toBe('read');
        if (terminalRead.kind !== 'read')
          throw new Error('accepted bundle is unreadable', { cause: terminalRead.cause });
        const terminal = terminalRead.snapshot;
        expect(await stores.runs.readRuntimeScope(setup.scope)).toMatchObject({
          kind: 'pinned',
          revision: accepted.receipt.acceptance.acceptedRevision,
          pendingCommandId: null,
        });
        expect(terminal).toMatchObject({
          capacity: { reserved: 0 },
          writeObligations: [],
          writeReceipts: [accepted.receipt],
        });
        expect(terminal.run.revision).toBe(pending.run.revision + 1);
        expect(await stores.runs.stageWrite(setup.guard, setup.command)).toEqual({
          kind: 'duplicate',
          value: staged,
        });
        expect(await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input)).toEqual({
          kind: 'duplicate',
          value: accepted,
        });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(terminal);
        expect(
          await readExecutionHistory(
            stores.runs,
            stores.artifacts,
            setup.run.runId,
            guard.attemptId,
          ),
        ).toMatchObject({ version: 3, writes: [{ reply: staged }, { reply: accepted }] });
        const {
          scope: _scope,
          expectedScopeRevision: _cut,
          ...ordinary
        } = await setup.currentGuard();
        expect(
          await stores.runs.recordExecution(
            ordinary,
            createExecutionCommand({ kind: 'recovery_required', reason: 'late' }, 'late'),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        expect(
          await stores.runs.admitAttempt(createRunGuard(await setup.currentGuard()), {
            ...setup.admission,
            attemptId: attemptId('replacement'),
            ordinal: 2,
          }),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
      } finally {
        await stores.close();
      }
    });
    for (const field of ['run', 'attempt', 'scope'] as const)
      test('write stage refuses independently stale ' + field, async () => {
        const stores = await create();
        try {
          const setup = await createWriteFixture(stores);
          const before = await stores.runs.readRun(setup.run.runId);
          const guard = {
            ...setup.guard,
            ...(field === 'run'
              ? { expectedRevision: 0 }
              : field === 'attempt'
                ? { expectedAttemptRevision: 0 }
                : { expectedScopeRevision: 0 }),
          };
          expect(await stores.runs.stageWrite(guard, setup.command)).toEqual({
            kind: 'refused',
            reason: 'revision_conflict',
          });
          expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        } finally {
          await stores.close();
        }
      });
    test('write original replay still fences current owner and changed local reuse', async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const staged = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        expect(
          await stores.runs.stageWrite(setup.guard, {
            ...setup.command,
            completion: {
              ...setup.completion,
              outcome: { ...setup.completion.outcome, summary: 'changed' },
            },
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        stores.clock.advance(100);
        expect(await stores.runs.stageWrite(setup.guard, setup.command)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        const ownership = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('replacement'), setup.ownership.epoch),
        );
        expect(await stores.runs.stageWrite(setup.guard, setup.command)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(await stores.runs.stageWrite({ ...setup.guard, ownership }, setup.command)).toEqual({
          kind: 'duplicate',
          value: staged,
        });
      } finally {
        await stores.close();
      }
    });
    test('write acceptance rejects a borrowed local winner and stale submitted cuts', async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const staged = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        const input = {
          commandId: executionCommandId('accept-write'),
          stageCommandId: setup.command.commandId,
          intent: staged.intent,
          evidence: await retainWriteReceipt(stores, staged.intent),
        };
        expect(await acceptWriteReceipt(stores.runs, stores.artifacts, setup.guard, input)).toEqual(
          { kind: 'refused', reason: 'revision_conflict' },
        );
        const guard = await setup.currentGuard();
        unwrapReply(await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input));
        expect(
          await acceptWriteReceipt(stores.runs, stores.artifacts, guard, {
            ...input,
            commandId: executionCommandId('borrowed'),
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      } finally {
        await stores.close();
      }
    });
    for (const operation of ['stage', 'accept'] as const)
      test(
        'write ' + operation + ' snapshots caller cuts and identity before its clock dependency',
        async () => {
          const stores = await create();
          const read = stores.clock.read.bind(stores.clock);
          try {
            const setup = await createWriteFixture(stores);
            const stage =
              operation === 'accept'
                ? unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command))
                : undefined;
            const guard = { ...(await setup.currentGuard()) };
            const command =
              stage === undefined
                ? { ...setup.command }
                : {
                    version: 1 as const,
                    kind: 'accept_write' as const,
                    commandId: executionCommandId('accept-write'),
                    stageCommandId: setup.command.commandId,
                    intent: stage.intent,
                    evidence: await retainWriteReceipt(stores, stage.intent),
                    projection: {
                      version: 1 as const,
                      actorId: 'account',
                      basisAfter: 'rb1:' + 'b'.repeat(64),
                      applied: [
                        { index: 0, kind: 'setProgress' as const },
                        { index: 1, kind: 'releaseWorkItem' as const },
                      ],
                    },
                  };
            const original = structuredClone(command);
            stores.clock.read = () => {
              guard.expectedScopeRevision = 0;
              command.commandId = executionCommandId('caller-mutated');
              return read();
            };
            const reply =
              command.kind === 'stage_write'
                ? await stores.runs.stageWrite(guard, command)
                : await stores.runs.recordWriteAcceptance(guard, command);
            stores.clock.read = read;
            expect(reply.kind).toBe('applied');
            const history = await stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.guard.attemptId,
            );
            expect(history.version).toBe(3);
            if (history.version !== 3) throw Error('current write history absent');
            expect(history.writes.at(-1)?.command).toEqual(original);
          } finally {
            stores.clock.read = read;
            await stores.close();
          }
        },
      );
    test('write acceptance original replay fences expired and superseded current owners', async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        const guard = await setup.currentGuard();
        const input = {
          commandId: executionCommandId('accept-write'),
          stageCommandId: setup.command.commandId,
          intent: stage.intent,
          evidence: await retainWriteReceipt(stores, stage.intent),
        };
        const accepted = unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input),
        );
        stores.clock.advance(100);
        expect(await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        const ownership = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('replacement'), setup.ownership.epoch),
        );
        expect(await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(
          await acceptWriteReceipt(stores.runs, stores.artifacts, { ...guard, ownership }, input),
        ).toEqual({ kind: 'duplicate', value: accepted });
      } finally {
        await stores.close();
      }
    });
    for (const fault of [
      'absent',
      'unreadable',
      'wrong command',
      'wrong applied',
      'wrong media',
      'invalid UTF8',
    ] as const)
      test('actual write acceptance evidence rejects ' + fault, async () => {
        const stores = await create();
        try {
          const setup = await createWriteFixture(stores);
          const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
          let evidence = await retainWriteReceipt(stores, stage.intent, (receipt) => {
            if (fault === 'wrong command') receipt['commandId'] = 'other';
            if (fault === 'wrong applied') receipt['acceptance'] = { kind: 'write' };
          });
          if (fault === 'wrong media') evidence = { ...evidence, mediaType: 'text/plain' };
          if (fault === 'absent')
            evidence = { ...evidence, digest: '0'.repeat(64) as typeof evidence.digest };
          const before = await stores.runs.readRun(setup.run.runId);
          const artifacts =
            fault === 'unreadable'
              ? {
                  ...stores.artifacts,
                  readArtifact() {
                    return Promise.reject(new Error('unreadable write evidence'));
                  },
                }
              : fault === 'invalid UTF8'
                ? {
                    ...stores.artifacts,
                    readArtifact() {
                      return Promise.resolve(new Uint8Array([255]));
                    },
                  }
                : stores.artifacts;
          await rejects(
            acceptWriteReceipt(stores.runs, artifacts, await setup.currentGuard(), {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence,
            }),
          );
          expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        } finally {
          await stores.close();
        }
      });
  });
  for (const cut of ['run', 'attempt', 'scope'] as const)
    test('write acceptance independently refuses stale ' + cut + ' cut', async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        const original = await setup.currentGuard();
        const guard = {
          ...original,
          ...(cut === 'run'
            ? { expectedRevision: 0 }
            : cut === 'attempt'
              ? { expectedAttemptRevision: 0 }
              : { expectedScopeRevision: 0 }),
        };
        const input = {
          commandId: executionCommandId('accept-write'),
          stageCommandId: setup.command.commandId,
          intent: stage.intent,
          evidence: await retainWriteReceipt(stores, stage.intent),
        };
        const before = await stores.runs.readRun(setup.run.runId);
        expect(await acceptWriteReceipt(stores.runs, stores.artifacts, guard, input)).toEqual({
          kind: 'refused',
          reason: 'revision_conflict',
        });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
}

/** The same actual store must exclude write local IDs from later legacy submissions while permitting unrelated wire labels. */
export function writeReciprocalContract(name: string, create: () => Promise<OutcomeFixture>) {
  test(
    name +
      ' each fresh legacy coupled submission excludes an audited write local while its unrelated identity applies',
    async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await setup.currentGuard(), {
            commandId: executionCommandId('accept-write'),
            stageCommandId: setup.command.commandId,
            intent: stage.intent,
            evidence: await retainWriteReceipt(stores, stage.intent),
          }),
        );
        const other = await prepareSession(stores, { ownership: setup.ownership, suffix: 'other' });
        if (other.prepared.state.kind !== 'prepared') throw new Error('legacy preparation absent');
        const stageInput = {
          version: 2 as const,
          kind: 'stage_claim' as const,
          commandId: executionCommandId('legacy-stage'),
          canonicalRequest: other.canonicalRequest,
          observation: other.prepared.state.session.preparation.target.observation,
        };
        const stageGuard = await other.scopedGuard();
        expect(
          await stores.runs.stageClaim(stageGuard, {
            ...stageInput,
            commandId: setup.command.commandId,
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        const claimed = unwrapReply(await stores.runs.stageClaim(stageGuard, stageInput));
        const evidence = await retainClaimReceipt(stores, claimed.intent);
        const acceptGuard = await other.scopedGuard();
        const acceptInput = {
          version: 2 as const,
          kind: 'accept_claim' as const,
          commandId: executionCommandId('legacy-accept'),
          intent: claimed.intent,
          evidence,
          projection: {
            version: 1 as const,
            claimId: 'claim',
            actorId: 'account',
            basisAfter: 'rb1:' + 'b'.repeat(64),
          },
        };
        expect(
          await stores.runs.recordClaimAcceptance(acceptGuard, {
            ...acceptInput,
            commandId: setup.command.commandId,
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        unwrapReply(await stores.runs.recordClaimAcceptance(acceptGuard, acceptInput));
        const turnGuard = await other.scopedGuard();
        const turnInput = {
          version: 2 as const,
          kind: 'stage_turn' as const,
          commandId: executionCommandId('legacy-turn'),
          request: {
            version: 1 as const,
            turnKey: 'other-turn',
            owner: other.owner,
            cause: { kind: 'initial' as const },
            input: 'work',
          },
        };
        expect(
          await stores.runs.stageTurn(turnGuard, {
            ...turnInput,
            commandId: setup.command.commandId,
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          unwrapReply(await stores.runs.stageTurn(turnGuard, turnInput)).attempt.state.kind,
        ).toBe('turn_pending');
      } finally {
        await stores.close();
      }
    },
  );
  test(
    name +
      ' legacy recovery reservations exclude write local IDs at begin acceptance and fence boundaries',
    async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await setup.currentGuard(), {
            commandId: executionCommandId('accept-write'),
            stageCommandId: setup.command.commandId,
            intent: stage.intent,
            evidence: await retainWriteReceipt(stores, stage.intent),
          }),
        );
        const other = await prepareSession(stores, { ownership: setup.ownership, suffix: 'other' });
        const staged = unwrapReply(
          await stageClaimRequest(stores.runs, stores.artifacts, await other.scopedGuard(), {
            commandId: executionCommandId('legacy-stage'),
            canonicalRequest: other.canonicalRequest,
            stateEvidence: other.preparationInput.stateEvidence,
          }),
        );
        const begin: RecoveryBeginCall = {
          kind: 'claim',
          guard: { ...(await other.scopedGuard()), expectedRecoveryRevision: 0 },
          intent: {
            version: 1,
            recoveryId: 'legacy-recovery',
            begunScopeRevision: staged.intent.stagedRevision,
            resolver: other.owner,
            target: {
              kind: 'claim',
              original: staged.intent,
              runId: other.run.runId,
              attemptId: other.attempt.attemptId,
              stageCommandId: 'legacy-stage',
              acceptanceCommandId: 'legacy-accept',
            },
          },
        };
        expect(
          await stores.runs.beginRecovery({
            ...begin,
            intent: { ...begin.intent, recoveryId: setup.command.commandId },
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          await stores.runs.beginRecovery({
            ...begin,
            intent: {
              ...begin.intent,
              target: { ...begin.intent.target, acceptanceCommandId: setup.command.commandId },
            },
          }),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        unwrapReply(await stores.runs.beginRecovery(begin));
        const badFence = await createRecoveryFenceCall(
          stores.artifacts,
          begin,
          1,
          undefined,
          setup.command.commandId,
        );
        expect(await stores.runs.stageRecoveryFence(badFence)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        const fence = await createRecoveryFenceCall(stores.artifacts, begin, 1);
        expect((await stores.runs.stageRecoveryFence(fence)).kind).toBe('applied');
        expect(
          (await stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId)).version,
        ).toBe(3);
      } finally {
        await stores.close();
      }
    },
  );
  test(
    name + ' unrelated authority and claim wire labels may equal retained write local IDs',
    async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await setup.currentGuard(), {
            commandId: executionCommandId('accept-write'),
            stageCommandId: setup.command.commandId,
            intent: stage.intent,
            evidence: await retainWriteReceipt(stores, stage.intent),
          }),
        );
        const scope = { ...setup.scope, personId: 'other-person' };
        unwrapReply(
          await stores.runs.pinRuntimeScope(setup.ownership, {
            version: 1,
            scope,
            ledgerId: 'ledger',
          }),
        );
        expect(
          unwrapReply(
            await stores.runs.stageRuntimeRequest(
              { ownership: setup.ownership, scope, expectedRevision: 0 },
              authorityRequest(setup.command.commandId, null, scope),
            ),
          ).commandId,
        ).toBe(setup.command.commandId);
        const other = await prepareSession(stores, { ownership: setup.ownership, suffix: 'other' });
        const wire = JSON.parse(other.canonicalRequest) as Record<string, unknown>;
        wire['commandId'] = 'accept-write';
        const claimed = unwrapReply(
          await stageClaimRequest(stores.runs, stores.artifacts, await other.scopedGuard(), {
            commandId: executionCommandId('legacy-stage'),
            canonicalRequest: JSON.stringify(wire),
            stateEvidence: other.preparationInput.stateEvidence,
          }),
        );
        expect(claimed.intent.commandId).toBe('accept-write');
        expect(
          (await stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId)).version,
        ).toBe(3);
      } finally {
        await stores.close();
      }
    },
  );
  test(name + ' legacy execution cannot reuse a retained write local submission', async () => {
    const stores = await create();
    try {
      const setup = await createWriteFixture(stores);
      unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
      const { scope: _scope, expectedScopeRevision: _cut, ...guard } = await setup.currentGuard();
      const before = await stores.runs.readRun(setup.run.runId);
      expect(
        await stores.runs.recordExecution(
          guard,
          createExecutionCommand(
            { kind: 'recovery_required', reason: 'late' },
            setup.command.commandId,
          ),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
    } finally {
      await stores.close();
    }
  });
  test(
    name +
      ' independent fresh legacy submission excludes write local ID and accepts unrelated wire label',
    async () => {
      const stores = await create();
      try {
        const setup = await createWriteFixture(stores);
        const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
        const other = await admitExecution(stores, { ownership: setup.ownership, suffix: 'other' });
        const guard = await other.currentGuard();
        const before = await stores.runs.readRun(other.run.runId);
        expect(
          await stores.runs.recordExecution(
            guard,
            createExecutionCommand(
              { kind: 'recovery_required', reason: 'recover' },
              setup.command.commandId,
            ),
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(await stores.runs.readRun(other.run.runId)).toEqual(before);
        const control = unwrapReply(
          await stores.runs.recordExecution(
            guard,
            createExecutionCommand(
              { kind: 'recovery_required', reason: 'recover' },
              stage.intent.commandId,
            ),
          ),
        );
        expect(control.state.kind).toBe('reconciling');
        const pending = await stores.runs.readRun(setup.run.runId);
        expect(pending.version).toBe(4);
        if (pending.version !== 4) throw new Error('current write snapshot absent');
        expect(pending.writeObligations).toEqual([stage.obligation]);
      } finally {
        await stores.close();
      }
    },
  );
}
