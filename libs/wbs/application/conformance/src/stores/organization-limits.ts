import type { TransactionalStores } from '@wbs/core';
import type { Claim, OrganizationLimitValues } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { DETERMINISTIC_SEED } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

const A = 'org-limits-a';
const B = 'org-limits-b';
const [workPackageA, workPackageB] = DETERMINISTIC_SEED.workPackageIds;
const [[aOne, aTwo], [bOne]] = DETERMINISTIC_SEED.workItemIds;
const [[aDev, aQa], [bDev]] = DETERMINISTIC_SEED.stepIds;
const [ownerA, ownerB] = DETERMINISTIC_SEED.ownerIds;

const heldBy = (
  id: string,
  workItemId: string,
  stepId: string,
  personId: string,
  runId: string | null,
  accountId: string,
): Claim => ({ id, workItemId, stepId, personId, runId, parentClaimId: null, accountId });

/**
 * What every source seeds for the `organizationLimits` cases, through whatever
 * side tables it has (no port writes ownership or caps): A owns the seed's
 * first work package and has its own caps; B owns the second and has none, so it
 * reads the defaults. A holds two agents and a human; B one agent. A's claims
 * are four rows but two bound claims: one person under one run on both steps
 * of a leaf, and one run-less person on both steps of another (L5). A owns
 * `ram` and `stage`, B owns `bRam`; A's work package states 48 of `ram`, 1 of
 * `stage` and 5 of B's `bRam`, B's work package 16 of A's `ram` and 7 of `bRam`,
 * so a sum over A reads only A's work package and A's resources (L2, L16).
 */
export const LIMITS_FIXTURE = {
  defaults: { maxAgentPersons: 50, maxConcurrentClaims: 200, maxCapacityUnitsPerResource: 10_000 },
  ownCaps: { organizationId: A, maxAgentPersons: 8, maxConcurrentClaims: 40 },
  organizationIds: [A, B],
  workPackages: [
    { workPackageId: workPackageA, organizationId: A },
    { workPackageId: workPackageB, organizationId: B },
  ],
  persons: [
    { id: 'limits-a-agent-1', kind: 'agent', organizationId: A },
    { id: 'limits-a-agent-2', kind: 'agent', organizationId: A },
    { id: 'limits-a-human', kind: 'person', organizationId: A },
    { id: 'limits-b-agent', kind: 'agent', organizationId: B },
  ],
  resources: [
    { id: 'limits-ram', name: 'limits-ram', organizationId: A },
    { id: 'limits-stage', name: 'limits-stage', organizationId: A },
    { id: 'limits-b-ram', name: 'limits-b-ram', organizationId: B },
  ],
  capacities: [
    { workPackageId: workPackageA, resourceId: 'limits-ram', units: 48 },
    { workPackageId: workPackageA, resourceId: 'limits-stage', units: 1 },
    { workPackageId: workPackageA, resourceId: 'limits-b-ram', units: 5 },
    { workPackageId: workPackageB, resourceId: 'limits-ram', units: 16 },
    { workPackageId: workPackageB, resourceId: 'limits-b-ram', units: 7 },
  ],
  claims: [
    heldBy('limits-claim-1', aOne, aDev, 'limits-a-agent-1', 'r1', ownerA),
    heldBy('limits-claim-2', aOne, aQa, 'limits-a-agent-1', 'r1', ownerA),
    heldBy('limits-claim-3', aTwo, aDev, 'limits-a-agent-2', null, ownerA),
    heldBy('limits-claim-4', aTwo, aQa, 'limits-a-agent-2', null, ownerA),
    heldBy('limits-claim-5', bOne, bDev, 'limits-b-agent', 'r1', ownerB),
  ],
} as const;

/** How a source writes the ownership and cap rows its ports cannot. */
export interface LimitsSideTables {
  organization(organizationId: string): void;
  ownPerson(personId: string, organizationId: string): void;
  ownWorkPackage(workPackageId: string, organizationId: string): void;
  ownResource(resourceId: string, organizationId: string): void;
  setCaps(organizationId: string, caps: OrganizationLimitValues): void;
}

/**
 * Seeds {@link LIMITS_FIXTURE} into a source already holding the deterministic
 * seed: persons and claims through the ports, the rest through `side`.
 * `held` uses organizations and packages already born with coherent parents;
 * people, resources and cap rows are still seeded here.
 *
 * @throws when a port refuses a seed row.
 */
export async function seedOrganizationLimits(
  stores: Pick<TransactionalStores, 'directory' | 'claims' | 'resourceCapacity'>,
  side: LimitsSideTables,
  ownership: 'create' | 'held' = 'create',
): Promise<void> {
  const stamp = DETERMINISTIC_SEED.stamps[0];
  // Proof: forcing creation over held actual SQLite owners fails on duplicate
  // organization insertion (current-sqlite-scoped-fixture-effect-held-ownership-v1).
  if (ownership === 'create') {
    for (const organizationId of LIMITS_FIXTURE.organizationIds) side.organization(organizationId);
    for (const { workPackageId, organizationId } of LIMITS_FIXTURE.workPackages)
      side.ownWorkPackage(workPackageId, organizationId);
  }
  for (const { id, kind, organizationId } of LIMITS_FIXTURE.persons) {
    const added = await stores.directory.addPerson({ id, name: id, kind }, [], stamp);
    if (!added.ok) throw new Error(`the limits person ${id} was refused`);
    side.ownPerson(id, organizationId);
  }
  for (const { id, name, organizationId } of LIMITS_FIXTURE.resources) {
    const added = await stores.directory.addResource(
      { id, name, kind: 'divisible', unitLabel: 'GB' },
      stamp,
    );
    if (!added.ok) throw new Error(`the limits resource ${id} was refused`);
    side.ownResource(id, organizationId);
  }
  for (const { workPackageId, resourceId, units } of LIMITS_FIXTURE.capacities) {
    const stated = await stores.resourceCapacity.set(workPackageId, resourceId, units, stamp);
    if (!stated.ok) throw new Error(`the limits capacity ${resourceId} was refused`);
  }
  const { organizationId, maxAgentPersons, maxConcurrentClaims } = LIMITS_FIXTURE.ownCaps;
  side.setCaps(organizationId, {
    maxAgentPersons,
    maxConcurrentClaims,
    maxCapacityUnitsPerResource: 64,
  });
  const written = await stores.claims.add([...LIMITS_FIXTURE.claims], [], stamp, []);
  if (written !== 'written') throw new Error(`the limits claims were refused: ${written}`);
}

/** The organization limits gauge cases (`wbs-organization-limits` L5, L10). */
export function organizationLimitRegistrations(
  open: OpenCase<'organizationLimits'>,
): readonly CaseRegistration[] {
  const { defaults } = LIMITS_FIXTURE;
  return [
    // Proof: with the memory gauge's kind test dropped, the memory
    // certification failed here, A reading 3 agents (74 pass, 1 fail);
    // watched 2026-10-22. SQLite's twin is organization-limits.db.test.ts.
    storeCase(
      'organizationLimits',
      'organizationLimits.readAgentPersonCap:organization-scope',
      open,
      async ({ port }) => {
        if (port === undefined) throw new Error('declared organization limits are absent');
        expect(await port.readAgentPersonCap(A)).toEqual({ cap: 8, current: 2 });
        expect(await port.readAgentPersonCap(B)).toEqual({
          cap: defaults.maxAgentPersons,
          current: 1,
        });
        expect(await port.readAgentPersonCap('org-limits-none')).toEqual({
          cap: defaults.maxAgentPersons,
          current: 0,
        });
      },
    ),
    // Proof: with the memory gauge counting claim rows instead of triples the
    // memory certification failed here, A reading 4; with its work package's
    // organization test dropped, A read B's claim too, 3 (74 pass, 1 fail
    // each); watched 2026-10-22.
    storeCase(
      'organizationLimits',
      'organizationLimits.readConcurrentClaimCap:bound-triples',
      open,
      async ({ port }) => {
        if (port === undefined) throw new Error('declared organization limits are absent');
        expect(await port.readConcurrentClaimCap(A)).toEqual({ cap: 40, current: 2 });
        expect(await port.readConcurrentClaimCap(B)).toEqual({
          cap: defaults.maxConcurrentClaims,
          current: 1,
        });
        expect(await port.readConcurrentClaimCap('org-limits-none')).toEqual({
          cap: defaults.maxConcurrentClaims,
          current: 0,
        });
      },
    ),
    // Proof, each watched 2026-10-22 in the memory certification: see
    // `inMemoryOrganizationLimitGauge`. SQLite's twin is organization-limits.db.test.ts.
    storeCase(
      'organizationLimits',
      'organizationLimits.readCapacityCap:per-resource-except-work-package',
      open,
      async ({ port }) => {
        if (port === undefined) throw new Error('declared organization limits are absent');
        // A's cap is its own 64; the sum is A's work package's 48 of `ram`, never
        // B's 16 of it, and nothing once A's own work package is the one excepted.
        expect(await port.readCapacityCap(A, 'limits-ram', 'work-package-none')).toEqual({
          cap: 64,
          current: 48,
        });
        expect(await port.readCapacityCap(A, 'limits-ram', workPackageA)).toEqual({
          cap: 64,
          current: 0,
        });
        expect(await port.readCapacityCap(A, 'limits-stage', 'work-package-none')).toEqual({
          cap: 64,
          current: 1,
        });
        // B's resource stated in A's work package counts for neither (L16).
        expect(await port.readCapacityCap(A, 'limits-b-ram', 'work-package-none')).toEqual({
          cap: 64,
          current: 0,
        });
        expect(await port.readCapacityCap(B, 'limits-b-ram', 'work-package-none')).toEqual({
          cap: defaults.maxCapacityUnitsPerResource,
          current: 7,
        });
        expect(await port.readCapacityCap(B, 'limits-ram', 'work-package-none')).toEqual({
          cap: defaults.maxCapacityUnitsPerResource,
          current: 0,
        });
      },
    ),
  ];
}
