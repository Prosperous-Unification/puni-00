import type { Stores, TransactionalStores } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseId, CaseRegistration } from './case-manifest';
import type { CaseFixture, SourceDeclaration } from './source-declaration';
import { actualRegistrations } from './stores/actuals';
import { calendarMarkerRegistrations } from './stores/calendar-markers';
import { capacityRegistrations } from './stores/capacity';
import { dependencyRegistrations } from './stores/dependencies';
import { directoryRegistrations } from './stores/directory';
import { estimateRegistrations } from './stores/estimates';
import { eventLogRegistrations } from './stores/event-log';
import { journalRegistrations } from './stores/journal';
import { measureRegistrations } from './stores/measures';
import { organizationLimitRegistrations } from './stores/organization-limits';
import { planEventRegistrations } from './stores/plan-events';
import { type OpenCase, storeCase } from './stores/store-case';
import { typedDependencyRegistrations } from './stores/typed-dependencies';
export { DEPENDENCY_SURVIVOR_IDS } from './stores/dependencies';
import { attemptRegistrations } from './stores/attempts';
import { progressRegistrations } from './stores/progress';
export { PROGRESS_SENTINEL_STEP_ID } from './stores/progress';
import { historyBatchRegistrations, type OpenHistoryBatchCase } from './stores/history-batch';
import { priorityBandRegistrations } from './stores/priority-bands';
import { projectRegistrations } from './stores/projects';
import {
  CONFORMANCE_RESOURCES,
  demandRegistrations,
  directoryResourceRegistrations,
  resourceCapacityRegistrations,
} from './stores/resources';
import { savedPlanCaptureRegistrations } from './stores/saved-plan-capture';
import { savedPlanRegistrations } from './stores/saved-plans';
import { stepRegistrations } from './stores/steps';
import { subtreeRegistrations } from './stores/subtrees';
import { userRegistrations } from './stores/users';
import { workItemRegistrations } from './stores/work-items';

export interface ExistingStoreOpeners {
  readonly livePlans?: OpenCase<'livePlans'>;
  readonly projects: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['projects']>>;
  readonly projectRanks?: OpenCase<'projectRanks'>;
  /** Absent where a source offers no organization limits gauge. */
  readonly organizationLimits?: OpenCase<'organizationLimits'>;
  readonly users: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['users']>>;
  readonly capacity: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['capacity']>>;
  readonly resourceCapacity: OpenCase<'resourceCapacity'>;
  readonly priorityBands: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['priorityBands']>>;
  readonly calendarMarkers: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['calendarMarkers']>>;
  readonly workItems: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['workItems']>>;
  readonly steps: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['steps']>>;
  readonly estimates: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['estimates']>>;
  readonly actuals: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['actuals']>>;
  readonly measures: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['measures']>>;
  readonly progress: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['progress']>>;
  readonly attempts: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['attempts']>>;
  readonly stepParallels: OpenCase<'stepParallels'>;
  readonly claims: OpenCase<'claims'>;
  readonly demands: OpenCase<'demands'>;
  readonly blockages: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['blockages']>>;
  readonly typedDependencies: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['typedDependencies']>>;
  readonly dependencies: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['dependencies']>>;
  readonly directory: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['directory']>>;
  readonly eventLog: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['eventLog']>>;
  readonly planEvents: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['planEvents']>>;
  readonly subtrees: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['subtrees']>>;
  readonly journal: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['journal']>>;
  readonly savedPlans: (caseId: CaseId) => Promise<CaseFixture<Stores['savedPlans']>>;
  readonly savedPlanCapture: (caseId: CaseId) => Promise<CaseFixture<Stores['savedPlanCapture']>>;
}

export interface SourceConformanceOpeners extends ExistingStoreOpeners {
  readonly historyBatch: OpenHistoryBatchCase;
}

/** Registers the migrated source-family kits in their implementation order. */
export function existingStoreRegistrations(
  openers: ExistingStoreOpeners,
): readonly CaseRegistration[] {
  return [
    ...(openers.livePlans === undefined
      ? [{ family: 'livePlans' as const, caseId: 'livePlans.read:legacy-and-absence' as const }]
      : [
          storeCase(
            'livePlans',
            'livePlans.read:legacy-and-absence',
            openers.livePlans,
            async ({ port, seed }) => {
              if (port === undefined) throw new Error('declared live plan capability is absent');
              expect(await port.read(seed.projectIds[0], { kind: 'legacy' })).toEqual({
                kind: 'isolated',
              });
              expect(await port.read('missing-project', { kind: 'legacy' })).toEqual({
                kind: 'not_found',
              });
              expect(await port.readProject(seed.projectIds[0])).toEqual({ kind: 'isolated' });
              expect(await port.readProject('missing-project')).toEqual({ kind: 'not_found' });
              expect(await port.readExport(seed.projectIds[0], { kind: 'legacy' })).toEqual({
                kind: 'isolated',
              });
              expect(await port.readExport('missing-project', { kind: 'legacy' })).toEqual({
                kind: 'not_found',
              });
            },
          ),
        ]),
    ...projectRegistrations(openers.projects),
    ...(openers.projectRanks === undefined
      ? [{ family: 'projectRanks' as const, caseId: 'projectRanks.orderIn:scoped-move' as const }]
      : [
          storeCase(
            'projectRanks',
            'projectRanks.orderIn:scoped-move',
            openers.projectRanks,
            async ({ port, seed }) => {
              if (port === undefined) throw new Error('declared project rank capability is absent');
              expect(await port.orderIn('rank-conformance-org')).toEqual([
                { projectId: seed.projectIds[0], rank: 1, ranked: false },
                { projectId: seed.projectIds[1], rank: 2, ranked: false },
              ]);
              expect(
                await port.moveAfter(
                  'rank-conformance-org',
                  seed.projectIds[1],
                  null,
                  seed.stamps[0],
                ),
              ).toEqual({
                ok: true,
                order: [
                  { projectId: seed.projectIds[1], rank: 1, ranked: true },
                  { projectId: seed.projectIds[0], rank: 2, ranked: true },
                ],
              });
              expect(await port.orderIn('rank-conformance-org')).toEqual([
                { projectId: seed.projectIds[1], rank: 1, ranked: true },
                { projectId: seed.projectIds[0], rank: 2, ranked: true },
              ]);
            },
          ),
        ]),
    ...(openers.organizationLimits === undefined
      ? [
          {
            family: 'organizationLimits' as const,
            caseId: 'organizationLimits.readAgentPersonCap:organization-scope' as const,
          },
          {
            family: 'organizationLimits' as const,
            caseId: 'organizationLimits.readConcurrentClaimCap:bound-triples' as const,
          },
          {
            family: 'organizationLimits' as const,
            caseId: 'organizationLimits.readCapacityCap:per-resource-except-project' as const,
          },
        ]
      : organizationLimitRegistrations(openers.organizationLimits)),
    ...userRegistrations(openers.users),
    ...capacityRegistrations(openers.capacity),
    ...resourceCapacityRegistrations(openers.resourceCapacity),
    ...priorityBandRegistrations(openers.priorityBands),
    ...calendarMarkerRegistrations(openers.calendarMarkers),
    ...workItemRegistrations(openers.workItems),
    ...stepRegistrations(openers.steps),
    ...estimateRegistrations(openers.estimates),
    ...actualRegistrations(openers.actuals),
    ...measureRegistrations(openers.measures),
    ...progressRegistrations(openers.progress),
    ...attemptRegistrations(openers.attempts),
    storeCase(
      'blockages',
      'blockages.set:read-remove',
      openers.blockages,
      async ({ port, seed }) => {
        const blockage = {
          workItemId: seed.workItemIds[0][0],
          stepId: seed.stepIds[0][0],
          blockedAt: 123456,
        };
        expect(await port.set(blockage, seed.stamps[0])).toBe('written');
        expect(await port.listByProject(seed.projectIds[0])).toEqual([blockage]);
        expect(await port.listByWorkItems(seed.projectIds[0], [blockage.workItemId])).toEqual([
          blockage,
        ]);
        expect(await port.listByProject(seed.projectIds[1])).toEqual([]);
        await port.remove(blockage.workItemId, blockage.stepId, seed.stamps[1]);
        expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
      },
    ),
    storeCase(
      'stepParallels',
      'stepParallels.set:sparse-replace-remove',
      openers.stepParallels,
      async ({ port, seed }) => {
        const parallel = {
          workItemId: seed.workItemIds[0][0],
          stepId: seed.stepIds[0][0],
          maxParallel: 1,
        };
        expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
        await port.set(parallel, seed.stamps[0]);
        expect(await port.listByProject(seed.projectIds[0])).toEqual([parallel]);
        await port.set({ ...parallel, maxParallel: 1000 }, seed.stamps[1]);
        expect(await port.listByWorkItems(seed.projectIds[0], [parallel.workItemId])).toEqual([
          { ...parallel, maxParallel: 1000 },
        ]);
        expect(await port.listByProject(seed.projectIds[1])).toEqual([]);
        await port.remove(parallel.workItemId, parallel.stepId, seed.stamps[1]);
        expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
      },
    ),
    storeCase(
      'claims',
      'claims.add:taken-stated-remove',
      openers.claims,
      async ({ port, seed }) => {
        const [workItemId] = seed.workItemIds[0];
        const [stepId, otherStepId] = seed.stepIds[0];
        const held = {
          id: 'claim-one',
          workItemId,
          stepId,
          personId: seed.personIds[0],
          runId: 'agent:main:subagent:7f',
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const stated = [{ workItemId, stepId }];
        expect(await port.add([held], stated, seed.stamps[0], [])).toBe('written');
        expect(await port.listByProject(seed.projectIds[0])).toEqual([held]);
        expect(await port.findById(seed.projectIds[0], held.id)).toEqual(held);
        expect(await port.findById(seed.projectIds[1], held.id)).toBeNull();
        expect(await port.listByProject(seed.projectIds[1])).toEqual([]);
        const rival = { ...held, id: 'claim-two', personId: seed.personIds[1] };
        expect(await port.add([rival], [], seed.stamps[1], [])).toBe('taken');
        const beside = { ...rival, stepId: otherStepId };
        expect(await port.add([beside], stated, seed.stamps[1], [])).toBe('progress_stated');
        expect(await port.listByProject(seed.projectIds[0])).toEqual([held]);
        await port.remove([held], stated, seed.stamps[1]);
        expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
        expect(await port.add([beside], stated, seed.stamps[1], [])).toBe('written');
        expect(await failureOf(port.remove([held], [], seed.stamps[1]))).toContain('not stored');
      },
    ),
    storeCase(
      'claims',
      'claims.listStampedByProject:write-instant',
      openers.claims,
      async ({ port, seed }) => {
        const [workItemId] = seed.workItemIds[0];
        const [stepId, otherStepId] = seed.stepIds[0];
        const first = {
          id: 'claim-first',
          workItemId,
          stepId,
          personId: seed.personIds[0],
          runId: null,
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const second = { ...first, id: 'claim-second', stepId: otherStepId };
        expect(await port.add([first], [], seed.stamps[0], [])).toBe('written');
        expect(await port.add([second], [], seed.stamps[1], [])).toBe('written');
        expect(await port.listStampedByProject(seed.projectIds[0])).toEqual(
          [
            { ...first, claimedAt: seed.stamps[0].at, leaseExpiresAt: null, leaseRevokedAt: null },
            { ...second, claimedAt: seed.stamps[1].at, leaseExpiresAt: null, leaseRevokedAt: null },
          ].sort((left, right) => (left.stepId < right.stepId ? -1 : 1)),
        );
        expect(await port.listStampedByProject(seed.projectIds[1])).toEqual([]);
        // The plain reads stay unstamped: the journal stores what they answer.
        expect(await port.listByProject(seed.projectIds[0])).toEqual(
          [first, second].sort((left, right) => (left.stepId < right.stepId ? -1 : 1)),
        );
        expect(await port.findById(seed.projectIds[0], first.id)).toEqual(first);
      },
    ),
    storeCase(
      'claims',
      'claims.remove:delegated-cascade',
      openers.claims,
      async ({ port, seed }) => {
        const [parentItem, childItem] = seed.workItemIds[0];
        const subtree = {
          id: 'claim-subtree',
          workItemId: parentItem,
          stepId: null,
          personId: seed.personIds[0],
          runId: null,
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const delegated = {
          ...subtree,
          id: 'claim-delegated',
          workItemId: childItem,
          stepId: seed.stepIds[0][0],
          personId: seed.personIds[1],
          parentClaimId: subtree.id,
        };
        expect(await port.add([subtree], [], seed.stamps[0], [])).toBe('written');
        expect(await port.add([{ ...subtree, id: 'claim-again' }], [], seed.stamps[0], [])).toBe(
          'taken',
        );
        expect(await port.add([delegated], [], seed.stamps[0], [])).toBe('written');
        await port.remove([subtree], [], seed.stamps[1]);
        expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
      },
    ),
    storeCase('claims', 'claims.moveAll:in-place', openers.claims, async ({ port, seed }) => {
      const [leaf, child] = seed.workItemIds[0];
      const [stepId, otherStepId] = seed.stepIds[0];
      const moved = {
        id: 'claim-moved',
        workItemId: leaf,
        stepId,
        personId: seed.personIds[0],
        runId: 'run-moved',
        parentClaimId: null,
        accountId: seed.ownerIds[0],
      };
      // Delegated under the moved claim: a delete and insert would cascade it away.
      const under = {
        ...moved,
        id: 'claim-under',
        workItemId: child,
        stepId: otherStepId,
        personId: seed.personIds[1],
        parentClaimId: moved.id,
      };
      expect(await port.add([moved], [], seed.stamps[0], [])).toBe('written');
      expect(await port.add([under], [], seed.stamps[0], [])).toBe('written');
      await port.moveAll(leaf, child, seed.stamps[1]);
      expect(await port.listStampedByProject(seed.projectIds[0])).toEqual(
        [
          {
            ...moved,
            workItemId: child,
            claimedAt: seed.stamps[0].at,
            leaseExpiresAt: null,
            leaseRevokedAt: null,
          },
          { ...under, claimedAt: seed.stamps[0].at, leaseExpiresAt: null, leaseRevokedAt: null },
        ].sort((left, right) => (left.stepId < right.stepId ? -1 : 1)),
      );
      const clash = { ...moved, id: 'claim-clash', workItemId: leaf, stepId: otherStepId };
      expect(await port.add([clash], [], seed.stamps[1], [])).toBe('written');
      expect(await failureOf(port.moveAll(leaf, child, seed.stamps[1]))).not.toBe('');
      await port.remove([clash], [], seed.stamps[1]);
      await port.moveAll(child, leaf, seed.stamps[1]);
      expect(await port.findById(seed.projectIds[0], moved.id)).toEqual(moved);
      await port.remove([moved], [], seed.stamps[1]);
      expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
    }),
    // `wbs-claim-leases` L1, L4, L5: a lease is written with its claim,
    // renewed only while in force and due, and read as expired at exactly
    // its instant.
    storeCase(
      'claims',
      'claims.lease:write-renew-expire',
      openers.claims,
      async ({ port, seed }) => {
        const [leaf] = seed.workItemIds[0];
        const [otherLeaf] = seed.workItemIds[1];
        const [stepId, otherStepId] = seed.stepIds[0];
        const [otherProjectStep] = seed.stepIds[1];
        const [agent, human] = seed.personIds;
        const leased = {
          id: 'claim-leased',
          workItemId: leaf,
          stepId,
          personId: agent,
          runId: 'run-1',
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const unleased = { ...leased, id: 'claim-human', stepId: otherStepId, personId: human };
        const elsewhere = {
          ...leased,
          id: 'claim-elsewhere',
          workItemId: otherLeaf,
          stepId: otherProjectStep,
        };
        expect(
          await failureOf(
            port.add([leased], [], seed.stamps[0], [], [{ claimId: 'stray', expiresAt: 1 }]),
          ),
        ).toContain('not added');
        expect(
          await port.add(
            [leased],
            [],
            seed.stamps[0],
            [],
            [{ claimId: leased.id, expiresAt: 10_000 }],
          ),
        ).toBe('written');
        expect(await port.add([unleased], [], seed.stamps[0], [])).toBe('written');
        expect(
          await port.add(
            [elsewhere],
            [],
            seed.stamps[0],
            [],
            [{ claimId: elsewhere.id, expiresAt: 860_000 }],
          ),
        ).toBe('written');
        expect(
          (await port.listStampedByProject(seed.projectIds[0])).map(({ id, leaseExpiresAt }) => [
            id,
            leaseExpiresAt,
          ]),
        ).toEqual([
          ['claim-leased', 10_000],
          ['claim-human', null],
        ]);
        // At 5,000 a lease is due below 845,000 (`renewalAt`): the first moves
        // to 905,000, the second was renewed within the resolution and stays.
        // Only the first project's lease moved, so only it is named.
        expect(await port.renewLeases(agent, () => 5_000)).toEqual({
          standing: { leases: 2, leaseExpiresAt: 860_000 },
          renewedProjectIds: [seed.projectIds[0]],
        });
        // At 860,000 the second lease has run out: it is not revived.
        expect(await port.renewLeases(agent, () => 860_000)).toEqual({
          standing: { leases: 1, leaseExpiresAt: 1_760_000 },
          renewedProjectIds: [seed.projectIds[0]],
        });
        expect(await port.renewLeases(human, () => 860_000)).toEqual({
          standing: { leases: 0, leaseExpiresAt: null },
          renewedProjectIds: [],
        });
        expect(await port.expiredLeasesOf(seed.projectIds[1], 860_000)).toEqual([
          { claimId: elsewhere.id, reason: 'lease_expired' },
        ]);
        expect(await port.expiredLeasesOf(seed.projectIds[0], 1_759_999)).toEqual([]);
        expect(await port.expiredLeasesOf(seed.projectIds[0], 1_760_000)).toEqual([
          { claimId: leased.id, reason: 'lease_expired' },
        ]);
        expect(await port.projectsWithExpiredLeases(860_000, 10)).toEqual([seed.projectIds[1]]);
        // Oldest expired lease first: the second project's ran out at 860,000.
        expect(await port.projectsWithExpiredLeases(1_760_000, 10)).toEqual([
          seed.projectIds[1],
          seed.projectIds[0],
        ]);
        expect(await port.projectsWithExpiredLeases(1_760_000, 1)).toEqual([seed.projectIds[1]]);
      },
    ),
    // `wbs-claim-display` C1: one observation answers the rows, steps, claims
    // and holder names the claims read joins, so every claim sits on a row
    // and a step it answers.
    storeCase(
      'claims',
      'claims.observeProject:legacy-observation',
      openers.claims,
      async ({ port, seed, readers }) => {
        const [projectId] = seed.projectIds;
        const [leaf, child] = seed.workItemIds[0];
        const [stepId, otherStepId] = seed.stepIds[0];
        const [agent] = seed.personIds;
        const held = {
          id: 'claim-observed',
          workItemId: child,
          stepId: otherStepId,
          personId: agent,
          runId: 'run-observed',
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        expect(await port.add([held], [], seed.stamps[0], [])).toBe('written');
        const observed = await port.observeProject(projectId, { kind: 'legacy' });
        if (observed.kind !== 'observed')
          throw new Error(`the observation answered ${observed.kind}`);
        const placement = (row: {
          id: string;
          parentId: string | null;
          position: number;
          frozenNumber: string | null;
          name: string;
        }) => [row.id, row.parentId, row.position, row.frozenNumber, row.name];
        const byId = (left: unknown[], right: unknown[]) =>
          String(left[0]) < String(right[0]) ? -1 : 1;
        expect(observed.rows.map(placement).sort(byId)).toEqual(
          (await readers.workItems.listByProject(projectId)).map(placement).sort(byId),
        );
        expect(observed.rows.map(({ id }) => id).sort()).toEqual([leaf, child].sort());
        expect(observed.stepIds).toEqual(
          (await readers.projects.stepsOf(projectId)).map(({ id }) => id),
        );
        expect(observed.stepIds).toContain(stepId);
        expect(observed.claims).toEqual([
          { ...held, claimedAt: seed.stamps[0].at, leaseExpiresAt: null, leaseRevokedAt: null },
        ]);
        const named = (await readers.directory.listPeople()).find(({ id }) => id === agent);
        if (named === undefined) throw new Error('the seed holds no such person');
        expect([...observed.personNames]).toEqual([[agent, named.name]]);
        const other = await port.observeProject(seed.projectIds[1], { kind: 'legacy' });
        if (other.kind !== 'observed') throw new Error(`the observation answered ${other.kind}`);
        expect(other.claims).toEqual([]);
        expect(other.personNames.size).toBe(0);
        expect(await port.observeProject('project-absent', { kind: 'legacy' })).toEqual({
          kind: 'not_found',
        });
      },
    ),
    // `wbs-claim-leases` L8 and `wbs-claim-display` C2: a revocation ends the
    // lease at its instant, and the stamped read answers that instant beside
    // the expiry, so a client can say why the claim is releasing.
    storeCase(
      'claims',
      'claims.lease:revoked-instant-read',
      openers.claims,
      async ({ port, seed, scenario }) => {
        if (scenario.kind !== 'lease-revocation')
          throw new Error(
            `the revoked-instant case needs a lease revocation, not ${scenario.kind}`,
          );
        const [leaf] = seed.workItemIds[0];
        const [stepId, otherStepId] = seed.stepIds[0];
        const [agent, human] = seed.personIds;
        const leased = {
          id: 'claim-revoked',
          workItemId: leaf,
          stepId,
          personId: agent,
          runId: 'run-revoked',
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const unleased = { ...leased, id: 'claim-kept', stepId: otherStepId, personId: human };
        expect(
          await port.add(
            [leased],
            [],
            seed.stamps[0],
            [],
            [{ claimId: leased.id, expiresAt: 900_000 }],
          ),
        ).toBe('written');
        expect(await port.add([unleased], [], seed.stamps[0], [])).toBe('written');
        const stamped = (leaseExpiresAt: number | null, leaseRevokedAt: number | null) => [
          { ...leased, claimedAt: seed.stamps[0].at, leaseExpiresAt, leaseRevokedAt },
          { ...unleased, claimedAt: seed.stamps[0].at, leaseExpiresAt: null, leaseRevokedAt: null },
        ];
        expect(await port.listStampedByProject(seed.projectIds[0])).toEqual(stamped(900_000, null));
        expect(await scenario.endLeasesOf(human, 5_000)).toBe(0);
        expect(await scenario.endLeasesOf(agent, 5_000)).toBe(1);
        expect(await port.listStampedByProject(seed.projectIds[0])).toEqual(stamped(5_000, 5_000));
        // A revoked lease is never renewed again, and expires as revoked.
        expect(await port.renewLeases(agent, () => 4_000)).toEqual({
          standing: { leases: 0, leaseExpiresAt: null },
          renewedProjectIds: [],
        });
        expect(await port.expiredLeasesOf(seed.projectIds[0], 5_000)).toEqual([
          { claimId: leased.id, reason: 'credential_revoked' },
        ]);
        // The plain reads stay unstamped: the journal stores what they answer.
        expect(await port.listByProject(seed.projectIds[0])).toEqual([leased, unleased]);
        expect(await port.findById(seed.projectIds[0], leased.id)).toEqual(leased);
      },
    ),
    storeCase(
      'claims',
      'claims.occupancy:hold-read-cascade',
      openers.claims,
      async ({ port, seed }) => {
        const [, leaf] = seed.workItemIds[0];
        const [stepId, otherStepId] = seed.stepIds[0];
        const [ram] = CONFORMANCE_RESOURCES;
        const first = {
          id: 'claim-a',
          workItemId: leaf,
          stepId,
          personId: seed.personIds[0],
          runId: 'run-a',
          parentClaimId: null,
          accountId: seed.ownerIds[0],
        };
        const second = {
          ...first,
          id: 'claim-b',
          stepId: otherStepId,
          personId: seed.personIds[1],
          runId: null,
        };
        const held = (claimId: string) => [{ claimId, resourceId: ram.id, units: 4 }];
        expect(await port.add([first], [], seed.stamps[0], held(first.id))).toBe('written');
        expect(await port.add([second], [], seed.stamps[1], held(second.id))).toBe('written');
        const row = (claim: typeof first | typeof second) => ({
          claimId: claim.id,
          workItemId: leaf,
          personId: claim.personId,
          runId: claim.runId,
          resourceId: ram.id,
          units: 4,
        });
        expect(await port.occupancyOf(seed.projectIds[0])).toEqual([row(first), row(second)]);
        expect(await port.occupancyOf(seed.projectIds[1])).toEqual([]);
        const third = { ...first, id: 'claim-c', workItemId: seed.workItemIds[0][0] };
        expect(
          await port.add([third], [], seed.stamps[1], [
            { claimId: third.id, resourceId: 'resource-absent', units: 1 },
          ]),
        ).toBe('unknown_resource');
        expect(
          await failureOf(
            port.add([third], [], seed.stamps[1], [
              { claimId: 'claim-elsewhere', resourceId: ram.id, units: 1 },
            ]),
          ),
        ).toContain('not added');
        expect(await port.listByProject(seed.projectIds[0])).toHaveLength(2);
        await port.remove([first], [], seed.stamps[1]);
        expect(await port.occupancyOf(seed.projectIds[0])).toEqual([row(second)]);
      },
    ),
    ...demandRegistrations(openers.demands),
    ...dependencyRegistrations(openers.dependencies),
    ...typedDependencyRegistrations(openers.typedDependencies),
    ...directoryRegistrations(openers.directory),
    ...directoryResourceRegistrations(openers.directory),
    ...eventLogRegistrations(openers.eventLog),
    ...planEventRegistrations(openers.planEvents),
    ...subtreeRegistrations(openers.subtrees),
    ...journalRegistrations(openers.journal),
    ...savedPlanRegistrations(openers.savedPlans),
    ...savedPlanCaptureRegistrations(openers.savedPlanCapture),
  ];
}

/** Adds the declaration-selected supplemental history cases to every store family. */
export function sourceConformanceRegistrations(
  declaration: Pick<SourceDeclaration, 'historyAdmission'>,
  openers: SourceConformanceOpeners,
): readonly CaseRegistration[] {
  return [
    ...existingStoreRegistrations(openers),
    ...historyBatchRegistrations(declaration.historyAdmission, openers.historyBatch),
  ];
}

/** What a promise rejected with, as text; throws when it resolved. */
async function failureOf(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    return String(error);
  }
  throw new Error('the promise resolved');
}
