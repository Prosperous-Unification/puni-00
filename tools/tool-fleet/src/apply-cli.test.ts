import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { ApplyDependencies } from './apply';
import { runApply } from './cli';
import { type OperationPlan, sealOperationPlan } from './plan';

function operationPlan(): OperationPlan {
  return sealOperationPlan({
    schemaVersion: 1,
    desiredRevision: 'fleet-2026-09-17',
    observationDigest: 'a'.repeat(64),
    observedAt: '2026-09-17T09:00:00.000Z',
    expiresAt: '2026-09-17T09:30:00.000Z',
    request: {
      kind: 'enroll',
      nodeId: 'workers-c',
      clusterId: 'workers',
      inventorySha256: 'b'.repeat(64),
      ansibleVariablesSha256: 'c'.repeat(64),
      knownHostsSha256: 'd'.repeat(64),
    },
    targetIdentities: ['node:workers-c', 'ssh:machine-1', 'cluster:workers'],
    preconditions: ['observation remains current', 'operation lease is owned'],
    effects: ['verify provider identity', 'configure host', 'join cluster'],
    affectedCapabilities: ['execution'],
    storageImplication: 'attachments-must-be-verified-before-scheduling',
    downtimeImplication: 'none-before-schedulable',
    summary: 'enroll workers-c',
  });
}

function dependencies(): ApplyDependencies {
  return {
    now: () => new Date('2026-09-17T09:01:00.000Z'),
    acquireLease: () => Promise.resolve({ owner: 'owner', expiresAt: '2026-09-17T09:20:00.000Z' }),
    ownsLease: () => Promise.resolve(true),
    observe: (plan) =>
      Promise.resolve({
        digest: plan.observationDigest,
        targetIdentities: plan.targetIdentities,
        providerState: 'ready',
      }),
    applyEffect: () => Promise.resolve({}),
  };
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

describe('production apply CLI boundary', () => {
  it('consumes only a persisted plan path and expected digest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-cli-'));
    const planPath = join(directory, 'operation.json');
    const plan = operationPlan();
    await writeFile(planPath, `${JSON.stringify(plan)}\n`);

    await runApply(['--plan', planPath, '--expect-sha256', plan.planSha256], () => dependencies());

    expect(Bun.file(`${planPath}.journal.json`).size).toBeGreaterThan(0);
  });

  it('rejects malformed, inexact, and argument-expanded plans before dependency creation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-cli-refusal-'));
    const malformedPath = join(directory, 'malformed.json');
    const inexactPath = join(directory, 'inexact.json');
    const plan = operationPlan();
    await writeFile(malformedPath, '{');
    await writeFile(inexactPath, JSON.stringify({ ...plan, unreviewed: true }));
    let factories = 0;
    const create = () => {
      factories += 1;
      return dependencies();
    };

    expect(
      await rejectionMessage(
        runApply(['--plan', malformedPath, '--expect-sha256', plan.planSha256], create),
      ),
    ).toMatch(/malformed JSON/i);
    expect(
      await rejectionMessage(
        runApply(['--plan', inexactPath, '--expect-sha256', plan.planSha256], create),
      ),
    ).toMatch(/validation failed/i);
    expect(
      await rejectionMessage(
        runApply(
          [
            '--plan',
            inexactPath,
            '--expect-sha256',
            plan.planSha256,
            '--terraform-root',
            '/unreviewed',
          ],
          create,
        ),
      ),
    ).toMatch(/unexpected fleet apply flag/i);
    expect(factories).toBe(0);
  });
});
