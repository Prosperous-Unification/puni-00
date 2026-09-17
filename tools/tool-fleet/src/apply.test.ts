import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { type ApplyDependencies, applyOperation } from './apply';
import { readOperationJournal, writeOperationJournal } from './journal';
import { type OperationPlan, sealOperationPlan } from './plan';

function operationPlan(): OperationPlan {
  return sealOperationPlan({
    schemaVersion: 1,
    desiredRevision: 'fleet-2026-09-17',
    observationDigest: 'a'.repeat(64),
    observedAt: '2026-09-17T09:00:00.000Z',
    expiresAt: '2026-09-17T09:30:00.000Z',
    request: {
      kind: 'provision',
      nodeId: 'workers-c',
      clusterId: 'workers',
      cloudAccount: 'production',
      region: 'fsn1',
      machineType: 'cx33',
      image: 'ubuntu-24.04',
      network: 'private',
      sshKeyIds: ['operator'],
      retainedStorage: false,
      k3sRole: 'agent',
      capabilities: ['execution'],
      budgetCapEur: 20,
      providerOwnershipId: 'provision-workers-c-20260917',
      terraformPlanSha256: 'f'.repeat(64),
      terraformVariablesSha256: 'c'.repeat(64),
      terraformBackendEvidenceSha256: 'd'.repeat(64),
      ansibleVariablesSha256: 'e'.repeat(64),
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    },
    targetIdentities: ['pending:workers-c', 'cluster:workers'],
    preconditions: [
      'observation remains current',
      'target identities still match',
      'operation lease is owned',
    ],
    effects: ['create provider instance', 'record provider identity', 'enroll configured host'],
    affectedCapabilities: [],
    storageImplication: 'system-disk-only-with-no-retention',
    downtimeImplication: 'none-new-capacity',
    summary: 'provision workers-c',
  });
}

function dependencies(overrides: Partial<ApplyDependencies> = {}): ApplyDependencies {
  return {
    now: () => new Date('2026-09-17T09:01:00.000Z'),
    acquireLease: () =>
      Promise.resolve({ owner: 'operation-owner', expiresAt: '2026-09-17T09:20:00.000Z' }),
    ownsLease: () => Promise.resolve(true),
    renewLease: (_plan, lease) => Promise.resolve(lease),
    releaseLease: () => Promise.resolve(),
    observe: (plan) =>
      Promise.resolve({
        digest: plan.observationDigest,
        targetIdentities: plan.targetIdentities,
        providerState: 'ready',
        terraformState: { lineage: 'lineage-1', serial: 7 },
      }),
    applyEffect: (_plan, _effect, stepId) => Promise.resolve({ externalResourceId: stepId }),
    ...overrides,
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

describe('applyOperation', () => {
  it('persists intent before effects and returns a completed receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-success-'));
    const journalPath = join(directory, 'journal.json');
    const calls: string[] = [];
    const plan = operationPlan();
    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath,
      dependencies: dependencies({
        applyEffect: async (_plan, effect, stepId) => {
          const journal = await readOperationJournal(journalPath);
          expect(journal.state).toBe('running');
          calls.push(effect);
          return { externalResourceId: stepId };
        },
      }),
    });

    expect(calls).toEqual([...plan.effects]);
    expect(receipt.state).toBe('complete');
    expect(receipt.completedSteps).toHaveLength(plan.effects.length);
    expect((await readOperationJournal(journalPath)).state).toBe('complete');
  });

  it('returns a completed journal without reacquiring a Lease', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-complete-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    const first = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath,
      dependencies: dependencies(),
    });
    let acquisitions = 0;
    const second = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath,
      dependencies: dependencies({
        acquireLease: () => {
          acquisitions += 1;
          return Promise.reject(new Error('completed work must not acquire'));
        },
      }),
    });
    // Proof: acquiring before this completed-journal read made the second invocation fail on the
    // previous execution's Lease; the production executor now performs zero acquisitions.
    expect(acquisitions).toBe(0);
    expect(second).toEqual(first);
  });

  it('refreshes recoverable journal progress after acquiring the Lease', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-journal-race-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    const completed = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath,
      dependencies: dependencies(),
    });
    await writeOperationJournal(journalPath, {
      ...completed,
      state: 'recoverable',
      completedSteps: [],
      updatedAt: '2026-09-17T09:02:00.000Z',
    });
    let mutations = 0;
    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath,
      dependencies: dependencies({
        acquireLease: async () => {
          await writeOperationJournal(journalPath, completed);
          return { owner: 'second-owner', expiresAt: '2026-09-17T09:20:00.000Z' };
        },
        applyEffect: () => {
          mutations += 1;
          return Promise.resolve({});
        },
      }),
    });
    // Proof: using the journal read before Lease acquisition replayed all three controlled effects;
    // refreshing it under the Lease observes completion and executes zero mutations.
    expect(mutations).toBe(0);
    expect(receipt).toEqual(completed);
  });

  it('rechecks plan expiry at the adapter mutation boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-boundary-expiry-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    let clockReads = 0;
    let mutations = 0;
    const now = () => {
      clockReads += 1;
      return new Date(clockReads < 6 ? '2026-09-17T09:01:00.000Z' : '2026-09-17T09:30:00.000Z');
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            now,
            applyEffect: async (_plan, _effect, _stepId, beforeMutation) => {
              await beforeMutation();
              mutations += 1;
              return {};
            },
          }),
        }),
      ),
    ).toMatch(/expired/i);
    // Proof: omitting the boundary expiry check incremented this counter after the clock crossed
    // the reviewed plan expiry; the production callback now refuses first.
    expect(mutations).toBe(0);
  });

  it('persists a recoverable active step when the postcondition changes identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-postcondition-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    let observations = 0;
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            observe: () => {
              observations += 1;
              return Promise.resolve({
                digest: plan.observationDigest,
                targetIdentities:
                  observations === 1
                    ? plan.targetIdentities
                    : ['hcloud:wrong-instance', 'cluster:workers'],
                providerState: 'ready',
                terraformState: { lineage: 'lineage-1', serial: 7 },
              });
            },
          }),
        }),
      ),
    ).toMatch(/postcondition/i);
    const journal = await readOperationJournal(journalPath);
    expect(journal.state).toBe('recoverable');
    expect(journal.activeStep?.beforeObservation.targetIdentities).toEqual([
      ...plan.targetIdentities,
    ]);
  });

  it('refuses stale plans, digest mismatch, identity drift, and pending deletion before mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-refusal-'));
    const plan = operationPlan();
    let mutations = 0;
    const applyEffect = () => {
      mutations += 1;
      return Promise.resolve({});
    };
    for (const [name, expectedSha256, adapter] of [
      [
        'stale',
        plan.planSha256,
        dependencies({ now: () => new Date(plan.expiresAt), applyEffect }),
      ],
      ['digest', 'b'.repeat(64), dependencies({ applyEffect })],
      [
        'identity',
        plan.planSha256,
        dependencies({
          observe: () =>
            Promise.resolve({
              digest: plan.observationDigest,
              targetIdentities: ['pending:different', 'cluster:workers'],
              providerState: 'ready',
              terraformState: { lineage: 'lineage-1', serial: 7 },
            }),
          applyEffect,
        }),
      ],
      [
        'deleting',
        plan.planSha256,
        dependencies({
          observe: () =>
            Promise.resolve({
              digest: plan.observationDigest,
              targetIdentities: plan.targetIdentities,
              providerState: 'pending-deletion',
              terraformState: { lineage: 'lineage-1', serial: 7 },
            }),
          applyEffect,
        }),
      ],
      [
        'terraform-state',
        plan.planSha256,
        dependencies({
          observe: () =>
            Promise.resolve({
              digest: plan.observationDigest,
              targetIdentities: plan.targetIdentities,
              providerState: 'ready',
              terraformState: { lineage: 'different', serial: 7 },
            }),
          applyEffect,
        }),
      ],
    ] as const) {
      expect(
        await rejectionMessage(
          applyOperation({
            plan,
            expectedSha256,
            journalPath: join(directory, `${name}.json`),
            dependencies: adapter,
          }),
        ),
      ).toMatch(/expired|digest|identit|pending deletion|terraform state/i);
    }
    expect(mutations).toBe(0);
  });

  it('stops after a lost lease and persists recoverable progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-lease-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    const leaseChecks = [true, true, true, false];
    const effects: string[] = [];

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            ownsLease: () => Promise.resolve(leaseChecks.shift() ?? false),
            applyEffect: (_plan, effect) => {
              effects.push(effect);
              return Promise.resolve({});
            },
          }),
        }),
      ),
    ).toMatch(/lease/i);

    expect(effects).toEqual([plan.effects[0]]);
    const journal = await readOperationJournal(journalPath);
    expect(journal.state).toBe('recoverable');
    expect(journal.completedSteps).toHaveLength(1);
  });

  it('rechecks Lease ownership after a slow observation and before mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-slow-observation-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    const leaseChecks = [true, false];
    let mutations = 0;

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            ownsLease: () => Promise.resolve(leaseChecks.shift() ?? false),
            applyEffect: () => {
              mutations += 1;
              return Promise.resolve({});
            },
          }),
        }),
      ),
    ).toMatch(/lease expired during/i);
    expect(mutations).toBe(0);
    expect((await readOperationJournal(journalPath)).state).toBe('recoverable');
  });

  it('refuses an already expired lease and stale observation before mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-current-'));
    const plan = operationPlan();
    let mutations = 0;
    const applyEffect = () => {
      mutations += 1;
      return Promise.resolve({});
    };

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: join(directory, 'expired-lease.json'),
          dependencies: dependencies({
            acquireLease: () =>
              Promise.resolve({
                owner: 'operation-owner',
                expiresAt: '2026-09-17T09:01:00.000Z',
              }),
            applyEffect,
          }),
        }),
      ),
    ).toMatch(/lease expired/i);
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: join(directory, 'stale-observation.json'),
          dependencies: dependencies({
            observe: () =>
              Promise.resolve({
                digest: 'b'.repeat(64),
                targetIdentities: plan.targetIdentities,
                providerState: 'ready',
                terraformState: { lineage: 'lineage-1', serial: 7 },
              }),
            applyEffect,
          }),
        }),
      ),
    ).toMatch(/observation digest is stale/i);
    expect(mutations).toBe(0);
  });

  it('persists recoverable state when an effect fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-effect-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            applyEffect: () => Promise.reject(new Error('provider timeout')),
          }),
        }),
      ),
    ).toMatch(/create provider instance/i);
    expect((await readOperationJournal(journalPath)).state).toBe('recoverable');
  });

  it('refuses an unknown completed step before issuing another mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-step-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    await writeOperationJournal(journalPath, {
      schemaVersion: 1,
      operationId: plan.planSha256,
      planSha256: plan.planSha256,
      state: 'recoverable',
      leaseOwner: 'operation-owner',
      completedSteps: [
        {
          stepId: 'unreviewed-step',
          effect: 'unknown effect',
          beforeObservationSha256: 'b'.repeat(64),
          beforeObservation: {
            digest: plan.observationDigest,
            targetIdentities: [...plan.targetIdentities],
            providerState: 'ready',
            terraformState: { lineage: 'lineage-1', serial: 7 },
          },
          afterObservationSha256: 'c'.repeat(64),
          afterObservation: {
            digest: plan.observationDigest,
            targetIdentities: [...plan.targetIdentities],
            providerState: 'ready',
            terraformState: { lineage: 'lineage-1', serial: 7 },
          },
        },
      ],
      updatedAt: '2026-09-17T09:02:00.000Z',
    });
    let mutations = 0;

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies({
            applyEffect: () => {
              mutations += 1;
              return Promise.resolve({});
            },
          }),
        }),
      ),
    ).toMatch(/unknown completed step/i);
    expect(mutations).toBe(0);
    expect(await readFile(journalPath, 'utf8')).toContain('unreviewed-step');
  });

  it('refuses an incomplete journal marked complete', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-apply-incomplete-complete-'));
    const journalPath = join(directory, 'journal.json');
    const plan = operationPlan();
    await writeOperationJournal(journalPath, {
      schemaVersion: 1,
      operationId: plan.planSha256,
      planSha256: plan.planSha256,
      state: 'complete',
      leaseOwner: 'operation-owner',
      completedSteps: [],
      updatedAt: '2026-09-17T09:02:00.000Z',
    });

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies: dependencies(),
        }),
      ),
    ).toMatch(/does not cover every reviewed effect/i);
  });
});
