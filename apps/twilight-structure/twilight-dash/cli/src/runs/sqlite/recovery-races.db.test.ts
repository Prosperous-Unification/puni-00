import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { stageClaimRequest } from '../claim-history';
import { decodeClaimAcceptCommand } from '../execution-codecs';
import { executionCommandId, organizationId, ownerId } from '../record-codecs';
import type { RecoveryBeginCall } from '../recovery-records';
import type { RunStore } from '../run-store';
import { verifyRuntimeReceipt } from '../runtime-receipt';
import { closeFixtures } from '../testing/close-fixtures';
import { FixtureClock, prepareSession, retainClaimReceipt, unwrapReply } from '../testing/fixtures';
import {
  authorityRequest,
  runtimeEvidence,
  runtimePin,
  runtimeScope,
} from '../testing/runtime-history-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
import { isBusy } from './run-store';

async function waitFor(observe: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!observe()) {
    if (Date.now() >= deadline) throw new Error(description + ' timed out');
    await Bun.sleep(2);
  }
}
async function prepareRace(
  stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> & { clock: FixtureClock },
  family: 'authority' | 'claim',
) {
  if (family === 'claim') {
    const setup = await prepareSession(stores);
    const staged = unwrapReply(
      await stageClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('stage-claim'),
        canonicalRequest: setup.canonicalRequest,
        stateEvidence: setup.preparationInput.stateEvidence,
      }),
    );
    const evidence = await retainClaimReceipt(setup, staged.intent);
    const receipt = await verifyRuntimeReceipt(setup.artifacts, staged.intent, evidence);
    if (receipt.acceptance.kind !== 'claim') throw new Error('claim receipt required');
    const input = decodeClaimAcceptCommand({
      version: 2,
      kind: 'accept_claim',
      commandId: 'accept-claim',
      intent: staged.intent,
      evidence,
      projection: {
        version: 1,
        claimId: receipt.acceptance.claim.claimId,
        actorId: receipt.actorId,
        basisAfter: receipt.acceptance.basisAfter,
      },
    });
    const guard = await setup.scopedGuard();
    const call: RecoveryBeginCall = {
      kind: 'claim',
      guard: { ...guard, expectedRecoveryRevision: 0 },
      intent: {
        version: 1,
        recoveryId: 'recover',
        target: {
          kind: 'claim',
          original: staged.intent,
          runId: setup.run.runId,
          attemptId: setup.admission.attemptId,
          stageCommandId: 'stage-claim',
          acceptanceCommandId: 'accept-claim',
        },
        begunScopeRevision: staged.intent.stagedRevision,
        resolver: setup.owner,
      },
    };
    return {
      call,
      original: staged.intent,
      operation: { kind: 'accept_claim' as const, guard, input },
      accept: (runs: RunStore) => runs.recordClaimAcceptance(guard, input),
    };
  }
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
  unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope: runtimeScope, expectedRevision: 0 },
      authorityRequest('original', 2),
    ),
  );
  const guard = { ownership, scope: runtimeScope, expectedRevision: 1 };
  const input = { intent: original, evidence: runtimeEvidence };
  const call: RecoveryBeginCall = {
    kind: 'authority',
    guard: { ...guard, expectedRecoveryRevision: 0 },
    intent: {
      version: 1,
      recoveryId: 'recover',
      target: { kind: 'authority', original },
      begunScopeRevision: 1,
      resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
    },
  };
  return {
    call,
    original,
    operation: { kind: 'accept' as const, guard, input },
    accept: (runs: RunStore) => runs.recordRuntimeAcceptance(guard, input),
  };
}
for (const family of ['authority', 'claim'] as const)
  for (const first of ['begin', 'accept'] as const)
    test(`separate process ${family} ${first} holds the real write transaction before its competing operation`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'recovery-race-'));
      const options = {
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock: new FixtureClock(),
        maxBusyAttempts: 5000,
        busyDelayMilliseconds: 1,
      };
      let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
      let competitor: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
      const entered = join(directory, 'entered');
      const release = join(directory, 'release');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The fault observer restores the exact native function and preserves its receiver.
      const originalRun = Database.prototype.run;
      let worker: ReturnType<typeof Bun.spawn> | undefined;
      let stdout: Promise<string> | undefined;
      let stderr: Promise<string> | undefined;
      let competing: Promise<unknown> | undefined;
      try {
        stores = await bootstrapSqliteStores(options);
        competitor = await openSqliteStores(options);
        const setup = await prepareRace({ ...stores, clock: options.clock }, family);
        const { call, original } = setup;
        const command = join(directory, 'command.json');
        writeFileSync(
          command,
          JSON.stringify({
            path: options.path,
            entered,
            release,
            operation: first === 'begin' ? { kind: 'begin', call } : setup.operation,
          }),
        );
        const child = Bun.spawn(
          [
            process.execPath,
            resolve(
              'apps/twilight-structure/twilight-dash/cli/src/runs/testing/recovery-race-worker.ts',
            ),
            command,
          ],
          {
            stdout: 'pipe',
            stderr: 'pipe',
            env: { ...process.env, NO_COLOR: undefined, FORCE_COLOR: undefined },
          },
        );
        worker = child;
        stdout = new Response(child.stdout).text();
        stderr = new Response(child.stderr).text();
        await waitFor(
          () => existsSync(entered) || child.exitCode !== null,
          'actual synchronous trigger entry',
        );
        if (!existsSync(entered))
          throw new Error('race worker exited before barrier: ' + (await stderr));
        let busy = 0;
        Database.prototype.run = function (sql, ...parameters) {
          try {
            return originalRun.call(this, sql, ...parameters);
          } catch (cause) {
            if (sql === 'BEGIN IMMEDIATE' && isBusy(cause)) busy += 1;
            throw cause;
          }
        };
        let settled = false;
        competing = (
          first === 'begin' ? setup.accept(competitor.runs) : competitor.runs.beginRecovery(call)
        ).then((reply) => {
          settled = true;
          return reply;
        });
        await waitFor(() => busy > 0, 'competing SQLITE_BUSY observation');
        expect(settled).toBe(false);
        expect(busy).toBeGreaterThan(0);
        writeFileSync(release, 'release');
        expect(await child.exited).toBe(0);
        expect(await stderr).toBe('');
        expect(JSON.parse(await stdout)).toMatchObject({ kind: 'applied' });
        expect(await competing).toEqual({ kind: 'refused', reason: 'state_conflict' });
        const scope = await stores.runs.readRuntimeScope(runtimeScope);
        expect(scope).toMatchObject(
          first === 'begin'
            ? {
                revision: original.stagedRevision,
                pendingCommandId: original.commandId,
                activeRecoveryId: 'recover',
                recoveries: [{ revision: 0 }],
              }
            : {
                revision: original.stagedRevision + 1,
                pendingCommandId: null,
                activeRecoveryId: null,
                recoveries: [],
              },
        );
      } finally {
        Database.prototype.run = originalRun;
        writeFileSync(release, 'cleanup-release');
        if (worker !== undefined) {
          if (worker.exitCode === null) worker.kill('SIGKILL');
          await worker.exited;
          await Promise.all([stdout, stderr]);
        }
        try {
          await competing;
        } finally {
          try {
            await closeFixtures([
              ...(competitor === undefined ? [] : [competitor]),
              ...(stores === undefined ? [] : [stores]),
            ]);
          } finally {
            rmSync(directory, { recursive: true, force: true });
          }
        }
      }
    });
