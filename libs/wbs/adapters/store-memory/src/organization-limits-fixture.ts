import type { CapReading, OrganizationLimitGauge } from '@wbs/core';
import { isOrganizationLimit, type OrganizationLimitValues } from '@wbs/domain';

import type { MemoryClaimTable } from './claim-fixture';
import type { MemoryDirectoryTables } from './directory-fixture';
import type { MemoryWorkItemTables } from './memory-work-item-fixture';

/**
 * `organization_limits` and `project_organization` as far as the limits gauge
 * reads them: each organization's own caps, and which organization owns each
 * project. No memory port writes either; the source fixture's setters do, as
 * the operator CLI and the organization side tables do on SQLite.
 */
export interface MemoryOrganizationLimitTables {
  readonly caps: Map<string, OrganizationLimitValues>;
  readonly projectOrganization: Map<string, string>;
}

export function memoryOrganizationLimitTables(): MemoryOrganizationLimitTables {
  return { caps: new Map(), projectOrganization: new Map() };
}

/** @throws when any of `limits` is outside the bounds an organization may hold. */
export function checkedOrganizationLimits(
  limits: OrganizationLimitValues,
  owner: string,
): OrganizationLimitValues {
  if (
    !isOrganizationLimit(limits.maxAgentPersons) ||
    !isOrganizationLimit(limits.maxConcurrentClaims) ||
    !isOrganizationLimit(limits.maxCapacityUnitsPerResource)
  )
    throw new Error(`organization limits of ${owner} are malformed`);
  return limits;
}

/** What the memory gauge reads: the tables of the one state it is bound over. */
export interface MemoryLimitReads {
  readonly limits: MemoryOrganizationLimitTables;
  readonly directory: MemoryDirectoryTables;
  readonly claims: MemoryClaimTable;
  readonly workItems: MemoryWorkItemTables;
}

/**
 * The memory twin of SQLite's `OrganizationLimitGaugeRepository`: the same
 * effective caps (the organization's own, else `defaults`) and the same counts
 * (L5), read from the staged state the unit of work hands its batch, so a
 * claim written earlier in the batch is counted.
 *
 * Proof, each watched 2026-10-22 in the memory certification
 * (source-conformance.test.ts, 74 pass, 1 fail each): counting claim rows
 * instead of triples made `organizationLimits.readConcurrentClaimCap:bound-triples`
 * read 4 for A; dropping the project's organization test made it read 3, B's
 * claim among them; dropping the kind test made
 * `organizationLimits.readAgentPersonCap:organization-scope` read 3 agents.
 */
export function inMemoryOrganizationLimitGauge(
  reads: MemoryLimitReads,
  defaults: OrganizationLimitValues,
): OrganizationLimitGauge {
  const fallback = checkedOrganizationLimits(defaults, 'the deployment default');
  const capsOf = (organizationId: string) => reads.limits.caps.get(organizationId) ?? fallback;
  return {
    readAgentPersonCap(organizationId): Promise<CapReading> {
      let current = 0;
      for (const person of reads.directory.people.values())
        if (
          person.kind === 'agent' &&
          reads.directory.organizationOf.get(person.id) === organizationId
        )
          current += 1;
      return Promise.resolve({ cap: capsOf(organizationId).maxAgentPersons, current });
    },
    readConcurrentClaimCap(organizationId): Promise<CapReading> {
      const triples = new Set<string>();
      for (const row of reads.claims.rows) {
        const workItem = reads.workItems.byId.get(row.workItemId);
        // A claim's work item reference cascades on delete: corrupt trusted state.
        if (workItem === undefined)
          throw new Error(`claim ${row.id} names absent work item ${row.workItemId}`);
        if (reads.limits.projectOrganization.get(workItem.projectId) !== organizationId) continue;
        triples.add(JSON.stringify([row.workItemId, row.personId, row.runId]));
      }
      return Promise.resolve({
        cap: capsOf(organizationId).maxConcurrentClaims,
        current: triples.size,
      });
    },
  };
}
