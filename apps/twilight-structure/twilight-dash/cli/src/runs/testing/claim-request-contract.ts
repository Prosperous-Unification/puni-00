import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { buildClaimRequest } from '../build-claim-request';
import { stageClaimRequest } from '../claim-history';
import { artifactDigest, executionCommandId, organizationId, ownerId } from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import type { ArtifactRef } from '../records';
import type { RunStore } from '../run-store';
import { readRuntimeRequest } from '../runtime-codecs';
import { acceptRuntimeReceipt } from '../runtime-history';
import {
  admitExecution,
  createExecutionCommand,
  type OutcomeFixture,
  prepareClaimed,
  prepareSession,
  unwrapReply,
} from './fixtures';

type Prepared = Awaited<ReturnType<typeof prepareSession>>;
type BuildStores = Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>;

async function scenario(
  create: () => Promise<OutcomeFixture>,
  check: (setup: Prepared) => Promise<void>,
) {
  const stores = await create();
  try {
    const ownership = unwrapReply(
      await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
    );
    await check(await prepareSession(stores, { ownership, suffix: '-builder' }));
  } finally {
    await stores.close();
  }
}

function inputFor(setup: Pick<Prepared, 'preparationInput'>) {
  return {
    commandId: 'receiver-claim',
    stateEvidence: structuredClone(setup.preparationInput.stateEvidence),
  };
}

async function retainBytes(setup: Prepared, content: Uint8Array) {
  const retained = await setup.artifacts.retainArtifact(content, 'application/json');
  if (retained.kind !== 'retained') throw new Error('claim state retention refused');
  return retained.reference;
}

async function retainState(setup: Prepared, state: unknown) {
  return await retainBytes(setup, new TextEncoder().encode(JSON.stringify(state)));
}

function expectedRequest(setup: Prepared, basis = setup.state.basis, commandId = 'receiver-claim') {
  return {
    scope: setup.scope,
    operation: {
      schemaVersion: 1 as const,
      commandId,
      expectedLedgerId: 'ledger',
      authority: { ownerId: 'receiver-owner', generation: 1 },
      expectedBasis: basis,
      action: {
        kind: 'claim' as const,
        workItemId: setup.run.workItemId,
        stepId: 'step',
        parentClaimId: null,
        execution: {
          storeId: setup.ownership.storeId,
          runId: setup.run.runId,
          attemptId: setup.attempt.attemptId,
          sessionId: setup.locator.session.sessionId,
        },
      },
    },
  };
}

async function assertBuilt(
  setup: Prepared,
  input = inputFor(setup),
  runs: BuildStores = setup.runs,
  artifacts = setup.artifacts,
  guard?: Awaited<ReturnType<Prepared['scopedGuard']>>,
) {
  const reply = await buildClaimRequest(
    runs,
    artifacts,
    guard ?? (await setup.scopedGuard()),
    input,
  );
  expect(reply.kind).toBe('built');
  if (reply.kind !== 'built') throw new Error('expected built claim');
  return reply.request;
}

function held() {
  let release: () => void = () => {
    throw new Error('hold not initialized');
  };
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

export function claimRequestContract(name: string, create: () => Promise<OutcomeFixture>): void {
  describe(name, () => {
    test('constructs complete prepared claim fields without mutation and stages the exact bytes', () =>
      scenario(create, async (setup) => {
        const guard = await setup.scopedGuard();
        const before = await setup.runs.readRun(setup.run.runId);
        const history = await setup.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        const runtime = await setup.runs.readRuntimeScope(setup.scope);
        const input = inputFor(setup);
        const artifact = await setup.artifacts.readArtifact(input.stateEvidence);
        const noWrites: ArtifactStore = {
          readArtifact: (reference) => setup.artifacts.readArtifact(reference),
          retainArtifact() {
            throw new Error('builder attempted artifact write');
          },
        };
        const request = await assertBuilt(setup, input, setup.runs, noWrites, guard);
        expect(readRuntimeRequest(request.canonicalRequest)).toEqual(expectedRequest(setup));
        expect(request.stateEvidence).toEqual(input.stateEvidence);
        expect(request.stateEvidence).not.toBe(input.stateEvidence);
        expect(await setup.artifacts.readArtifact(input.stateEvidence)).toEqual(artifact);
        expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
        expect(
          await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(history);
        expect(await setup.runs.readRuntimeScope(setup.scope)).toEqual(runtime);
        expect(
          (
            await stageClaimRequest(setup.runs, setup.artifacts, guard, {
              commandId: executionCommandId('local-stage'),
              ...request,
            })
          ).kind,
        ).toBe('applied');
      }));

    test('refreshes only basis and evidence with the same prepared target and actual session', () =>
      scenario(create, async (setup) => {
        const basis = 'rb1:' + 'c'.repeat(64);
        // Remote authority is deliberately different: this builder uses verified local
        // construction evidence; the receiver owns the live admission check.
        const state = {
          ...setup.state,
          basis,
          authority: { kind: 'uninitialized' },
          facts: { ...setup.state.facts, projectRevision: 9 },
        };
        const input = { ...inputFor(setup), stateEvidence: await retainState(setup, state) };
        const request = await assertBuilt(setup, input);
        expect(readRuntimeRequest(request.canonicalRequest)).toEqual(expectedRequest(setup, basis));
        expect(request.stateEvidence).toEqual(input.stateEvidence);
      }));

    test('preserves retained non-null parent claim from prepared intent', async () => {
      const stores = await create();
      try {
        const setup = await admitExecution(stores);
        const guard = await setup.currentGuard();
        const owner = { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch };
        const preparedIntent = unwrapReply(
          await recordPreparation(stores.runs, stores.artifacts, guard, {
            ...setup.preparationInput,
            parentClaimId: 'parent-claim',
          }),
        );
        const opened = createExecutionCommand(
          { kind: 'session_prepared', locator: setup.locator, owner },
          'opened',
        );
        const prepared = unwrapReply(
          await stores.runs.recordExecution(await setup.currentGuard(), opened),
        );
        const request = await assertBuilt({
          ...setup,
          guard,
          owner,
          preparedIntent,
          opened,
          prepared,
        });
        const parsed = readRuntimeRequest(request.canonicalRequest);
        expect(parsed).toEqual({
          ...expectedRequest({ ...setup, guard, owner, preparedIntent, opened, prepared }),
          operation: {
            ...expectedRequest({ ...setup, guard, owner, preparedIntent, opened, prepared })
              .operation,
            action: {
              ...expectedRequest({ ...setup, guard, owner, preparedIntent, opened, prepared })
                .operation.action,
              parentClaimId: 'parent-claim',
            },
          },
        });
      } finally {
        await stores.close();
      }
    });

    test('receiver command identity may equal a local command and has no local length bound', () =>
      scenario(create, async (setup) => {
        for (const commandId of [setup.preparationInput.commandId, 'receiver/'.repeat(90)]) {
          const request = await assertBuilt(setup, { ...inputFor(setup), commandId });
          expect(readRuntimeRequest(request.canonicalRequest)).toEqual(
            expectedRequest(setup, setup.state.basis, commandId),
          );
        }
      }));

    for (const field of [
      'expectedRevision',
      'expectedAttemptRevision',
      'expectedScopeRevision',
    ] as const)
      test('refuses stale independently submitted ' + field, () =>
        scenario(create, async (setup) => {
          const guard = await setup.scopedGuard();
          const before = await setup.runs.readRun(setup.run.runId);
          expect(
            await buildClaimRequest(
              setup.runs,
              setup.artifacts,
              { ...guard, [field]: guard[field] - 1 },
              inputFor(setup),
            ),
          ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
          expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
        }),
      );

    for (const field of ['organizationId', 'projectId', 'personId'] as const)
      test('refuses submitted scope ' + field + ' conflict', () =>
        scenario(create, async (setup) => {
          const guard = await setup.scopedGuard();
          expect(
            await buildClaimRequest(
              setup.runs,
              setup.artifacts,
              {
                ...guard,
                scope: { ...guard.scope, [field]: 'other' },
              },
              inputFor(setup),
            ),
          ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        }),
      );

    test('refuses a different fully pinned and granted submitted scope', () =>
      scenario(create, async (setup) => {
        const original = await setup.runs.readRuntimeScope(setup.scope);
        if (original.kind !== 'pinned' || original.intents.at(0) === undefined)
          throw new Error('fixture authority missing');
        const scope = { ...setup.scope, personId: 'other-person' };
        unwrapReply(
          await setup.runs.pinRuntimeScope(setup.ownership, {
            version: 1,
            scope,
            ledgerId: 'ledger',
          }),
        );
        const canonical = original.intents[0].canonicalRequest
          .replace('"personId":"person"', '"personId":"other-person"')
          .replace('"commandId":"authority"', '"commandId":"other-authority"');
        const intent = unwrapReply(
          await setup.runs.stageRuntimeRequest(
            { ownership: setup.ownership, scope, expectedRevision: 0 },
            canonical,
          ),
        );
        const evidence = await retainState(setup, {
          schemaVersion: 1,
          ledgerId: 'ledger',
          scope,
          commandId: intent.commandId,
          requestDigest: intent.requestDigest,
          actorId: 'account',
          acceptance: {
            kind: 'authority',
            authority: { ownerId: 'receiver-owner', generation: 1 },
          },
        });
        unwrapReply(
          await acceptRuntimeReceipt(
            setup.runs,
            setup.artifacts,
            { ownership: setup.ownership, scope, expectedRevision: 1 },
            intent,
            evidence,
          ),
        );
        expect(
          await buildClaimRequest(
            setup.runs,
            setup.artifacts,
            {
              ...(await setup.scopedGuard()),
              scope,
            },
            inputFor(setup),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      }));

    test('refuses submitted ownership organization conflict', () =>
      scenario(create, async (setup) => {
        const guard = await setup.scopedGuard();
        expect(
          await buildClaimRequest(
            setup.runs,
            setup.artifacts,
            {
              ...guard,
              ownership: { ...guard.ownership, organizationId: organizationId('other') },
            },
            inputFor(setup),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      }));

    for (const field of ['ownerId', 'epoch'] as const)
      test('refuses grant from another submitted owner ' + field, () =>
        scenario(create, async (setup) => {
          const guard = await setup.scopedGuard();
          const ownership =
            field === 'ownerId'
              ? { ...guard.ownership, ownerId: ownerId('other') }
              : { ...guard.ownership, epoch: guard.ownership.epoch + 1 };
          expect(
            await buildClaimRequest(
              setup.runs,
              setup.artifacts,
              { ...guard, ownership },
              inputFor(setup),
            ),
          ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        }),
      );

    test('refuses absent current epoch grant after actual owner takeover', () =>
      scenario(create, async (setup) => {
        setup.clock.advance(101);
        const ownership = unwrapReply(
          await setup.runs.acquireOwnership(ownerId('new-owner'), setup.ownership.epoch),
        );
        expect(
          await buildClaimRequest(
            setup.runs,
            setup.artifacts,
            {
              ...(await setup.scopedGuard()),
              ownership,
            },
            inputFor(setup),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      }));

    for (const fault of [
      'unpinned',
      'grant absent',
      'grant epoch',
      'grant provenance',
      'pin scope',
      'pin ledger',
    ] as const)
      test('refuses retained authority ' + fault + ' conflict', () =>
        scenario(create, async (setup) => {
          const guard = await setup.scopedGuard();
          const runs: BuildStores = {
            ...setup.runs,
            async readRuntimeScope(scope) {
              const snapshot = structuredClone(await setup.runs.readRuntimeScope(scope));
              if (snapshot.kind !== 'pinned' || snapshot.grant === null)
                throw new Error('fixture grant missing');
              if (fault === 'unpinned')
                return {
                  version: 1,
                  kind: 'uninitialized',
                  scope,
                  ownerEpoch: setup.ownership.epoch,
                };
              if (fault === 'grant absent') return { ...snapshot, grant: null };
              if (fault === 'grant epoch')
                return {
                  ...snapshot,
                  grant: { ...snapshot.grant, localEpoch: snapshot.grant.localEpoch + 1 },
                };
              if (fault === 'grant provenance')
                return { ...snapshot, grant: { ...snapshot.grant, commandId: 'missing' } };
              if (fault === 'pin scope')
                return {
                  ...snapshot,
                  pin: { ...snapshot.pin, scope: { ...scope, personId: 'other' } },
                };
              return { ...snapshot, pin: { ...snapshot.pin, ledgerId: 'other' } };
            },
          };
          expect(await buildClaimRequest(runs, setup.artifacts, guard, inputFor(setup))).toEqual({
            kind: 'refused',
            reason: 'authority_conflict',
          });
        }),
      );

    for (const fault of ['work', 'step', 'code', 'scope'] as const)
      test('rejects actual refreshed artifact different ' + fault, () =>
        scenario(create, async (setup) => {
          const state = structuredClone(setup.state);
          if (fault === 'work') Object.assign(state.facts.workItems[0], { id: 'other' });
          if (fault === 'step') Object.assign(state.facts.steps[0], { id: 'other' });
          if (fault === 'code') Object.assign(state.facts.steps[0], { code: 'other' });
          if (fault === 'scope') Object.assign(state.scope, { personId: 'other' });
          const input = { ...inputFor(setup), stateEvidence: await retainState(setup, state) };
          await rejects(
            buildClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), input),
            /runtime state (target|scope) differs/,
          );
        }),
      );

    test('refuses actual refreshed artifact different ledger', () =>
      scenario(create, async (setup) => {
        const input = {
          ...inputFor(setup),
          stateEvidence: await retainState(setup, { ...setup.state, ledgerId: 'other' }),
        };
        expect(
          await buildClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), input),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      }));

    for (const fault of ['absent', 'unreadable', 'malformed', 'invalid UTF8', 'schema'] as const)
      test('throws for ' + fault + ' actual refreshed artifact', () =>
        scenario(create, async (setup) => {
          let reference: ArtifactRef;
          if (fault === 'absent')
            reference = {
              ...setup.preparationInput.stateEvidence,
              digest: artifactDigest('f'.repeat(64)),
            };
          else if (fault === 'malformed')
            reference = await retainBytes(setup, new TextEncoder().encode('{'));
          else if (fault === 'invalid UTF8') {
            const content = new TextEncoder().encode(
              JSON.stringify({ ...setup.state, extra: 'x' }),
            );
            const index = content.lastIndexOf('x'.charCodeAt(0));
            content[index] = 255;
            reference = await retainBytes(setup, content);
          } else
            reference = await retainState(
              setup,
              fault === 'schema'
                ? { schemaVersion: 99 }
                : { ...setup.state, basis: 'rb1:' + 'd'.repeat(64) },
            );
          const artifacts: ArtifactStore = {
            ...setup.artifacts,
            readArtifact:
              fault === 'unreadable'
                ? (observed) => {
                    if (observed.digest === reference.digest)
                      throw new Error('injected state unreadable');
                    return setup.artifacts.readArtifact(observed);
                  }
                : (observed) => setup.artifacts.readArtifact(observed),
          };
          await rejects(
            buildClaimRequest(setup.runs, artifacts, await setup.scopedGuard(), {
              ...inputFor(setup),
              stateEvidence: reference,
            }),
          );
        }),
      );

    for (const boundary of ['execution history', 'runtime history'] as const)
      test('consumes verified ' + boundary + ' artifacts', () =>
        scenario(create, async (setup) => {
          const runtime = await setup.runs.readRuntimeScope(setup.scope);
          if (runtime.kind !== 'pinned' || runtime.acceptances.at(0) === undefined)
            throw new Error('fixture acceptance missing');
          const failedDigest =
            boundary === 'execution history'
              ? setup.preparationInput.stateEvidence.digest
              : runtime.acceptances[0].evidence.digest;
          const input = {
            ...inputFor(setup),
            stateEvidence: await retainState(setup, {
              ...setup.state,
              basis: 'rb1:' + 'e'.repeat(64),
            }),
          };
          const artifacts: ArtifactStore = {
            ...setup.artifacts,
            readArtifact(reference) {
              if (reference.digest === failedDigest)
                throw new Error('injected retained history unreadable');
              return setup.artifacts.readArtifact(reference);
            },
          };
          await rejects(
            buildClaimRequest(setup.runs, artifacts, await setup.scopedGuard(), input),
            /injected retained history unreadable/,
          );
        }),
      );

    for (const checkpoint of ['queued', 'preparing', 'reconciling', 'claiming', 'ready'] as const)
      test('refuses direct non-prepared checkpoint ' + checkpoint, async () => {
        const stores = await create();
        try {
          const setup =
            checkpoint === 'ready'
              ? await prepareClaimed(stores)
              : checkpoint === 'queued' || checkpoint === 'preparing'
                ? await admitExecution(stores)
                : await prepareSession(stores);
          if (checkpoint === 'preparing')
            unwrapReply(
              await recordPreparation(
                stores.runs,
                stores.artifacts,
                await setup.currentGuard(),
                setup.preparationInput,
              ),
            );
          if (checkpoint === 'reconciling')
            unwrapReply(
              await stores.runs.recordExecution(
                await setup.currentGuard(),
                createExecutionCommand(
                  { kind: 'recovery_required', reason: 'test uncertainty' },
                  'recover',
                ),
              ),
            );
          if (checkpoint === 'claiming')
            unwrapReply(
              await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
                commandId: executionCommandId('stage'),
                canonicalRequest: setup.canonicalRequest,
                stateEvidence: setup.preparationInput.stateEvidence,
              }),
            );
          expect(
            await buildClaimRequest(
              stores.runs,
              stores.artifacts,
              await setup.scopedGuard(),
              inputFor(setup),
            ),
          ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        } finally {
          await stores.close();
        }
      });

    for (const boundary of ['history', 'artifact'] as const)
      test('snapshots submitted guard and input across held ' + boundary + ' read', () =>
        scenario(create, async (setup) => {
          const guard = structuredClone(await setup.scopedGuard());
          const reference = await retainState(setup, {
            ...setup.state,
            basis: 'rb1:' + 'c'.repeat(64),
          });
          const input = { ...inputFor(setup), stateEvidence: structuredClone(reference) };
          const reached = held();
          const resume = held();
          const runs: BuildStores = {
            ...setup.runs,
            async readExecutionHistory(runId, attemptId) {
              if (boundary === 'history') {
                reached.release();
                await resume.wait;
              }
              return await setup.runs.readExecutionHistory(runId, attemptId);
            },
          };
          const artifacts: ArtifactStore = {
            ...setup.artifacts,
            async readArtifact(observed) {
              if (boundary === 'artifact' && observed.digest === reference.digest) {
                reached.release();
                await resume.wait;
              }
              return await setup.artifacts.readArtifact(observed);
            },
          };
          const pending = buildClaimRequest(runs, artifacts, guard, input);
          await reached.wait;
          Object.assign(guard, {
            expectedRevision: 999,
            expectedAttemptRevision: 999,
            expectedScopeRevision: 999,
          });
          Object.assign(guard.ownership, { ownerId: 'other', epoch: 99, storeId: 'other' });
          Object.assign(guard.scope, { personId: 'other' });
          input.commandId = 'edited';
          Object.assign(input.stateEvidence, { digest: 'f'.repeat(64) });
          resume.release();
          const reply = await pending;
          expect(reply.kind).toBe('built');
          if (reply.kind !== 'built') throw new Error('snapshot build refused');
          expect(readRuntimeRequest(reply.request.canonicalRequest)).toEqual(
            expectedRequest(setup, 'rb1:' + 'c'.repeat(64)),
          );
          expect(reply.request.stateEvidence).toEqual(reference);
        }),
      );

    for (const fault of ['command', 'extra input', 'evidence', 'guard'] as const)
      test('rejects malformed submitted ' + fault + ' before reads', () =>
        scenario(create, async (setup) => {
          const guard = await setup.scopedGuard();
          const input = inputFor(setup);
          if (fault === 'command') input.commandId = '';
          if (fault === 'extra input') Object.assign(input, { sessionId: 'replacement' });
          if (fault === 'evidence') Object.assign(input.stateEvidence, { byteLength: -1 });
          if (fault === 'guard') Object.assign(guard, { expectedRevision: -1 });
          let reads = 0;
          const runs: BuildStores = {
            ...setup.runs,
            readExecutionHistory() {
              reads += 1;
              throw new Error('unexpected history read');
            },
          };
          await rejects(buildClaimRequest(runs, setup.artifacts, guard, input));
          expect(reads).toBe(0);
        }),
      );
  });
}
