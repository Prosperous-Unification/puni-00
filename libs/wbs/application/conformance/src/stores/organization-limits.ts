import type { TransactionalStores } from '@wbs/core';
import type { Claim, OrganizationLimitValues } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { DETERMINISTIC_SEED } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

const A = 'org-limits-a';
const B = 'org-limits-b';
const [projectA, projectB] = DETERMINISTIC_SEED.projectIds;
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
 * first project and has its own caps; B owns the second and has none, so it
 * reads the defaults. A holds two agents and a human; B one agent. A's claims
 * are four rows but two bound claims: one person under one run on both steps
 * of a leaf, and one run-less person on both steps of another (L5).
 */
export const LIMITS_FIXTURE = {
  defaults: { maxAgentPersons: 50, maxConcurrentClaims: 200, maxCapacityUnitsPerResource: 10_000 },
  ownCaps: { organizationId: A, maxAgentPersons: 8, maxConcurrentClaims: 40 },
  organizationIds: [A, B],
  projects: [
    { projectId: projectA, organizationId: A },
    { projectId: projectB, organizationId: B },
  ],
  persons: [
    { id: 'limits-a-agent-1', kind: 'agent', organizationId: A },
    { id: 'limits-a-agent-2', kind: 'agent', organizationId: A },
    { id: 'limits-a-human', kind: 'person', organizationId: A },
    { id: 'limits-b-agent', kind: 'agent', organizationId: B },
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
  ownProject(projectId: string, organizationId: string): void;
  setCaps(organizationId: string, caps: OrganizationLimitValues): void;
}

/**
 * Seeds {@link LIMITS_FIXTURE} into a source already holding the deterministic
 * seed: persons and claims through the ports, the rest through `side`.
 *
 * @throws when a port refuses a seed row.
 */
export async function seedOrganizationLimits(
  stores: Pick<TransactionalStores, 'directory' | 'claims'>,
  side: LimitsSideTables,
): Promise<void> {
  const stamp = DETERMINISTIC_SEED.stamps[0];
  for (const organizationId of LIMITS_FIXTURE.organizationIds) side.organization(organizationId);
  for (const { projectId, organizationId } of LIMITS_FIXTURE.projects)
    side.ownProject(projectId, organizationId);
  for (const { id, kind, organizationId } of LIMITS_FIXTURE.persons) {
    const added = await stores.directory.addPerson({ id, name: id, kind }, [], stamp);
    if (!added.ok) throw new Error(`the limits person ${id} was refused`);
    side.ownPerson(id, organizationId);
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
    // memory certification failed here, A reading 4; with its project's
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
  ];
}
