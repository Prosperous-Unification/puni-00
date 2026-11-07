import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import { organizationId } from '../record-codecs';
import { RecoveryDispatchError } from '../recovery-dispatch-error';
import { RuntimeDispatchError } from '../runtime-dispatch-error';
import { FixtureClock } from '../testing/fixtures';
import { acquireReceiverAuthority } from '../testing/recovery-receiver';
import { writeDispatchContract } from '../testing/write-dispatch-contract';
import { ownerId } from '../value-codecs';
import { bootstrapSqliteStores } from './open-stores';
writeDispatchContract('sqlite write dispatch', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'write-dispatch-'));
  console.log('Task3 sender DB root ' + directory);
  const clock = new FixtureClock();
  const connection = await bootstrapSqliteStores({
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  });
  return {
    ...connection,
    clock,
    async close() {
      await connection.close();
      rmSync(directory, { recursive: true });
      console.log('Task3 sender closed and removed ' + directory);
    },
  };
});

import { expect, test } from 'bun:test';

import { buildWriteRequest } from '../build-write-request';
import { acceptClaimReceipt } from '../claim-history';
import { deliverOutcome } from '../deliver-outcome';
import { dispatchRecovery } from '../dispatch-recovery';
import { retainRuntimeReceipt } from '../retain-runtime-receipt';
import { unwrapReply } from '../testing/fixtures';
import { prepareReceiverClaim } from '../testing/recovery-dispatch-contract';
import { closeRecoveryResources, createRecoveryReceiver } from '../testing/recovery-receiver';
import { executionCommandId } from '../value-codecs';
import { openSqliteStores } from './open-stores';

for (const cut of [
  'lost-reply',
  'staged-before-post',
  'accepted-before-ack',
  'local-takeover',
  'receiver-takeover',
  'authorization-refusal',
  'late-closure-abort',
  'process-stage-before-post',
  'process-accepted-before-ack',
  'malformed-reply',
  'mismatched-reply',
] as const)
  test(
    'real receiver ordered effects and sender receiver reopen ' + cut,
    async () => {
      const isStaged = cut === 'staged-before-post' || cut === 'process-stage-before-post';
      const isAcceptedBeforeAck =
        cut === 'accepted-before-ack' || cut === 'process-accepted-before-ack';
      let keepsCrashRoot = false;
      const directory = mkdtempSync(join(tmpdir(), 'write-real-reopen-'));
      console.log('Task3 real sender DB root ' + directory);
      const clock = new FixtureClock();
      const options = {
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('org-a'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock,
        maxBusyAttempts: 20,
        busyDelayMilliseconds: 1,
      };
      let stores = await bootstrapSqliteStores(options);
      const receiver = await createRecoveryReceiver();
      try {
        const setup = await prepareReceiverClaim({ ...stores, clock }, receiver);
        const claimed = await receiver.client.applyCommands({
          params: { id: receiver.scope.projectId },
          body: { ...setup.request, personId: receiver.scope.personId },
        });
        if (claimed.reply.kind !== 'success') throw Error('real fixture claim refused');
        unwrapReply(
          await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.guard(), {
            commandId: executionCommandId('accept-claim'),
            intent: setup.stage.intent,
            evidence: await retainRuntimeReceipt(
              stores.artifacts,
              claimed.response,
              claimed.reply.status,
            ),
          }),
        );
        const guard = await setup.guard();
        unwrapReply(
          await stores.runs.stageTurn(guard, {
            version: 2,
            kind: 'stage_turn',
            commandId: executionCommandId('stage-turn'),
            request: {
              version: 1,
              turnKey: 'turn',
              owner: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
              cause: { kind: 'initial' },
              input: 'work',
            },
          }),
        );
        const current = await setup.guard();
        const state = await receiver.client.readState({
          params: { id: receiver.scope.projectId },
          query: { personId: receiver.scope.personId, expectedLedgerId: receiver.ledgerId },
        });
        if (state.reply.kind !== 'success') throw Error('real state refused');
        const stateEvidence = await retainRuntimeReceipt(
          stores.artifacts,
          state.response,
          state.reply.status,
        );
        const output = await stores.artifacts.retainArtifact(
          new TextEncoder().encode('validated completion'),
          'text/plain',
        );
        if (output.kind !== 'retained') throw Error('output retention refused');
        const built = await buildWriteRequest(stores.runs, stores.artifacts, current, {
          commandId: 'real-write',
          stateEvidence,
          commands: [
            {
              kind: 'setProgress',
              workItemId: receiver.workItemId,
              stepId: receiver.stepId,
              state: 'done',
            },
            {
              kind: 'patchWorkItem',
              workItemId: receiver.workItemId,
              patch: {
                externalRefs: [
                  { systemId: 'task3', url: 'https://example.invalid/task3', name: 'proof' },
                ],
              },
            },
            {
              kind: 'setMeasure',
              workItemId: receiver.workItemId,
              stepId: receiver.stepId,
              metric: 'token_actual',
              value: 7,
            },
            {
              kind: 'releaseWorkItem',
              workItemId: receiver.workItemId,
              personId: receiver.scope.personId,
              steps: [receiver.stepId],
            },
          ],
        });
        if (built.kind !== 'built') throw Error('real builder refused');
        const input = {
          commandId: executionCommandId('stage-write'),
          acceptanceCommandId: executionCommandId('real-write'),
          completion: {
            version: 1 as const,
            outcome: {
              version: 1 as const,
              kind: 'succeeded' as const,
              summary: 'validated output',
              artifacts: [output.reference],
            },
            quiescence: {
              version: 1 as const,
              operationKey: setup.admission.identity.operationKey,
              observedAt: 1000,
              evidence: output.reference,
              effect: 'succeeded' as const,
            },
          },
          ...built.request,
        };
        if (cut === 'malformed-reply') receiver.rewriteReply('real-write', () => '{');
        if (cut === 'mismatched-reply')
          receiver.rewriteReply('real-write', (bytes) =>
            bytes.replace('"commandId":"real-write"', '"commandId":"borrowed-write"'),
          );
        if (
          !isStaged &&
          !isAcceptedBeforeAck &&
          cut !== 'malformed-reply' &&
          cut !== 'mismatched-reply'
        )
          receiver.dropReply('real-write');
        const cancellation = new AbortController();
        if (isStaged) cancellation.abort();
        const deliveryRuns =
          cut === 'accepted-before-ack'
            ? {
                ...stores.runs,
                async recordWriteAcceptance(
                  guard: Parameters<typeof stores.runs.recordWriteAcceptance>[0],
                  command: Parameters<typeof stores.runs.recordWriteAcceptance>[1],
                ) {
                  await stores.runs.recordWriteAcceptance(guard, command);
                  throw Error('coordinator stopped after local acceptance');
                },
              }
            : stores.runs;
        if (cut === 'process-stage-before-post' || cut === 'process-accepted-before-ack') {
          keepsCrashRoot = true;
          const origin = receiver.listen();
          const payloadPath = join(directory, 'dispatch.json');
          await Bun.write(
            payloadPath,
            JSON.stringify({
              path: options.path,
              organizationId: options.organizationId,
              capacity: options.capacity,
              leaseMilliseconds: options.leaseMilliseconds,
              guard: current,
              input,
              origin,
              cut,
            }),
          );
          await stores.close();
          const program = `import {writeSync} from 'node:fs';import {openSqliteStores} from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};import {deliverOutcome} from ${JSON.stringify(new URL('../deliver-outcome.ts', import.meta.url).pathname)};import {createRuntimeClient} from ${JSON.stringify(new URL('../../bridge/runtime-client.ts', import.meta.url).pathname)};import {fetchTransport} from ${JSON.stringify(import.meta.resolve('@wbs/contracts'))};const input=JSON.parse(await Bun.file(Bun.argv[1]).text());const stores=await openSqliteStores({...input,clock:{read:()=>1000},maxBusyAttempts:20,busyDelayMilliseconds:1});const stop=(code)=>{writeSync(1,'Task3 committed '+code+String.fromCharCode(10));process.exit(code);};const runs=input.cut==='process-stage-before-post'?{...stores.runs,async stageWrite(...args){const ack=await stores.runs.stageWrite(...args);if(ack.kind!=='applied')throw Error('child stage not applied');stop(73);}}:{...stores.runs,async recordWriteAcceptance(...args){const ack=await stores.runs.recordWriteAcceptance(...args);if(ack.kind!=='applied')throw Error('child acceptance not applied');stop(74);}};await deliverOutcome(runs,stores.artifacts,createRuntimeClient(fetchTransport(input.origin)),input.guard,input.input,new AbortController().signal);throw Error('sender did not stop at committed cut');`;
          const programPath = join(directory, 'sender-cut.ts');
          await Bun.write(programPath, program);
          const child = Bun.spawn([process.execPath, '--no-install', '-e', program, payloadPath], {
            cwd: process.cwd(),
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const timeout = setTimeout(() => {
            child.kill('SIGKILL');
          }, 20000);
          console.log(
            'Task3 sender crash child ' +
              JSON.stringify({
                pid: child.pid,
                directory,
                cut,
                programPath,
                programSha256: new Bun.CryptoHasher('sha256').update(program).digest('hex'),
              }),
          );
          const stdout = new Response(child.stdout).arrayBuffer();
          const stderr = new Response(child.stderr).arrayBuffer();
          try {
            const [code, out, err] = await Promise.all([child.exited, stdout, stderr]);
            console.log(
              'Task3 sender crash terminal ' +
                JSON.stringify({
                  pid: child.pid,
                  code,
                  signal: child.signalCode,
                  stdoutBase64: Buffer.from(out).toString('base64'),
                  stderrBase64: Buffer.from(err).toString('base64'),
                  stdoutEOF: true,
                  stderrEOF: true,
                  nativeSqliteClose: 'unobserved abrupt process exit',
                  directory,
                }),
            );
            expect(code).toBe(isStaged ? 73 : 74);
            expect(new TextDecoder().decode(err)).toBe('');
            expect(new TextDecoder().decode(out)).toBe('Task3 committed ' + String(code) + '\n');
          } finally {
            clearTimeout(timeout);
            if (child.exitCode === null) child.kill();
            await child.exited;
            await Promise.allSettled([stdout, stderr]);
          }
          stores = await openSqliteStores(options);
        } else {
          const delivery = await deliverOutcome(
            deliveryRuns,
            stores.artifacts,
            receiver.client,
            current,
            input,
            cancellation.signal,
          ).catch((cause: unknown) => cause);
          if (
            cut === 'accepted-before-ack' ||
            cut === 'malformed-reply' ||
            cut === 'mismatched-reply'
          )
            expect(delivery).toBeInstanceOf(RuntimeDispatchError);
          else
            expect(delivery).toMatchObject({
              kind: 'pending',
              observation: { kind: isStaged ? 'cancelled_before_dispatch' : 'unconfirmed' },
            });
        }
        const effects = receiver.inspectEffects();
        if (!isStaged)
          expect(effects).toEqual(
            expect.arrayContaining([
              {
                table: 'step_progress',
                rows: [
                  expect.objectContaining({
                    work_item_id: receiver.workItemId,
                    step_id: receiver.stepId,
                    state: 'done',
                  }),
                ],
              },
              {
                table: 'step_measure',
                rows: [
                  expect.objectContaining({
                    work_item_id: receiver.workItemId,
                    step_id: receiver.stepId,
                    metric: 'token_actual',
                    value: 7,
                  }),
                ],
              },
              {
                table: 'work_item_external_ref',
                rows: [
                  expect.objectContaining({
                    work_item_id: receiver.workItemId,
                    system_id: 'task3',
                    url: 'https://example.invalid/task3',
                  }),
                ],
              },
              { table: 'claim', rows: [] },
            ]),
          );
        if (isAcceptedBeforeAck) {
          const before = await stores.runs.readRun(current.runId);
          await stores.close();
          await receiver.reopen();
          stores = await openSqliteStores(options);
          expect(
            await deliverOutcome(
              stores.runs,
              stores.artifacts,
              receiver.client,
              current,
              input,
              new AbortController().signal,
            ),
          ).toMatchObject({ kind: 'accepted' });
          expect(await stores.runs.readRun(current.runId)).toEqual(before);
          expect(receiver.inspectEffects()).toEqual(effects);
          return;
        }
        if (cut === 'receiver-takeover')
          expect((await acquireReceiverAuthority(receiver, 'foreign-owner', 1)).reply.kind).toBe(
            'success',
          );
        const scope = await stores.runs.readRuntimeScope(receiver.scope);
        if (scope.kind !== 'pinned') throw Error('scope missing');
        const history = await stores.runs.readExecutionHistory(current.runId, current.attemptId);
        if (history.version !== 3 || history.writes[0]?.kind !== 'stage_write')
          throw Error('stage missing');
        const recoveryGuard = {
          ...current,
          expectedRevision: history.run.revision,
          expectedAttemptRevision: history.attempt.revision,
          expectedScopeRevision: scope.revision,
          expectedRecoveryRevision: 0,
        };
        if (cut === 'local-takeover') {
          clock.advance(101);
          const ownership = unwrapReply(
            await stores.runs.acquireOwnership(ownerId('new-resolver'), current.ownership.epoch),
          );
          Object.assign(recoveryGuard, { ownership });
        }
        const original = history.writes[0].reply.intent;
        unwrapReply(
          await stores.runs.beginRecovery({
            kind: 'write',
            guard: recoveryGuard,
            intent: {
              version: 2,
              recoveryId: 'real-recovery',
              target: {
                kind: 'write',
                original,
                runId: current.runId,
                attemptId: current.attemptId,
                stageCommandId: input.commandId,
                acceptanceCommandId: input.acceptanceCommandId,
              },
              begunScopeRevision: original.stagedRevision,
              resolver: {
                ownerId: recoveryGuard.ownership.ownerId,
                epoch: recoveryGuard.ownership.epoch,
              },
            },
          }),
        );
        if (cut === 'authorization-refusal') receiver.revokeAccess();
        await stores.close();
        await receiver.reopen();
        stores = await openSqliteStores(options);
        let trigger: Database | undefined;
        if (cut === 'late-closure-abort') {
          trigger = new Database(options.path);
          trigger.run(
            "CREATE TRIGGER task3_abort BEFORE INSERT ON run6_recovery_closure BEGIN SELECT RAISE(ABORT,'Task3 closure abort'); END",
          );
        }
        let reply;
        try {
          reply = await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            { kind: 'write', guard: recoveryGuard, recoveryId: 'real-recovery' },
            new AbortController().signal,
          );
          // Proof: Fix1 removing only the named trigger installation failed this cut with 'Task3 closure abort was not observed' before retry; the actual named SQLite abort control passed. Exact source restored.
          if (cut === 'late-closure-abort') throw Error('Task3 closure abort was not observed');
        } catch (cause) {
          if (cut !== 'late-closure-abort') throw cause;
          if (
            !(cause instanceof RecoveryDispatchError) ||
            cause.code !== 'unexpected' ||
            !(cause.cause instanceof Error) ||
            cause.cause.message !== 'Task3 closure abort'
          )
            throw Error('expected named Task3 closure abort before retry', { cause });
          console.log(
            'Task3 fix1 named late abort ' +
              JSON.stringify({
                recoveryId: cause.recoveryId,
                code: cause.code,
                causeName: cause.cause.name,
                causeMessage: cause.cause.message,
              }),
          );
          const retained = await stores.runs.readExecutionHistory(current.runId, current.attemptId);
          await stores.close();
          stores = await openSqliteStores(options);
          expect(await stores.runs.readExecutionHistory(current.runId, current.attemptId)).toEqual(
            retained,
          );
          expect(retained.attempt).toEqual(history.attempt);
          expect(retained).toMatchObject({ writes: [{ kind: 'stage_write' }] });
          if (trigger === undefined) throw Error('abort trigger missing', { cause });
          trigger.run('DROP TRIGGER task3_abort');
          reply = await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            {
              kind: 'write',
              guard: { ...recoveryGuard, expectedRecoveryRevision: 2 },
              recoveryId: 'real-recovery',
            },
            new AbortController().signal,
          );
        } finally {
          trigger?.close();
        }
        if (cut === 'authorization-refusal') {
          expect(reply).toMatchObject({ kind: 'pending', reason: 'receiver_refused' });
          expect(receiver.inspectEffects()).toEqual(effects);
          return;
        }
        expect(reply).toMatchObject({
          kind: 'resolved',
          closure: {
            version: 2,
            decision: { kind: isStaged ? 'fenced_nonaccepted' : 'accepted' },
            attemptReply: {
              holdsCapacity: false,
              state: { kind: isStaged ? 'write_nonaccepted' : 'write_terminal' },
            },
          },
        });
        expect(receiver.inspectEffects()).toEqual(effects);
        expect(
          receiver.requests.filter(
            (entry) =>
              entry.operationId === 'applyRuntimeCommands' && entry.commandId === 'real-write',
          ),
        ).toHaveLength(isStaged ? 0 : 1);
        if (isStaged) return;
        expect(await stores.runs.readRun(current.runId)).toMatchObject({
          writeObligations: [],
          writeReceipts: [{ stageCommandId: input.commandId }],
          capacity: { reserved: 0 },
        });
      } finally {
        await closeRecoveryResources([receiver, stores]);
        if (keepsCrashRoot) console.log('Task3 retained abrupt sender DB root ' + directory);
        else {
          rmSync(directory, { recursive: true });
          console.log('Task3 real sender closed and removed ' + directory);
        }
      }
    },
    60000,
  );
