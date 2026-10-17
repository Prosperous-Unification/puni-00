import { type Drizzle, drizzleReadTransaction } from './db';
import { type OrganizationActivation, readOrganizationActivation } from './organization-activation';
import {
  OrganizationOwnershipRepository,
  type OwnershipConflict,
  type UnmappedRoot,
} from './organization-ownership';

/** Marker and relational ownership findings from the same SQLite snapshot. */
export interface OwnershipPreflight {
  readonly marker: OrganizationActivation;
  readonly unmappedRoots: readonly UnmappedRoot[];
  readonly catalogNameDrift: readonly UnmappedRoot[];
  readonly ownershipConflicts: readonly OwnershipConflict[];
}

/**
 * Inspects the trusted marker and three existing ownership queries on a dedicated connection.
 * The caller must keep that connection exclusive until this promise settles; the operator CLI
 * opens its own read-only connection. Uses a deferred snapshot across asynchronous probes,
 * committing on success and rolling back on failure so the connection remains reusable.
 *
 * Empty findings are not activation approval: opaque journal/captured bodies, production
 * identity/access review, process drain and MCP epoch evidence remain outside this report.
 * See `docs/runbook-organization-ownership-preflight.md` for the operator contract.
 *
 * @throws When marker validation or any required query fails; no partial report is returned.
 */
export async function preflightOrganizationOwnership(db: Drizzle): Promise<OwnershipPreflight> {
  const snapshot = drizzleReadTransaction(db);
  // Proof: removing the snapshot or committing independently after marker, unmapped roots,
  // or catalog drift failed `pins marker and every finding across a competing commit and all
  // probes`; each observed 2026-10-17 in this change's evidence.
  snapshot.begin();
  try {
    // Proof: bypassing this read failed all three `refuses ... marker` tests, 2026-10-17.
    const marker = readOrganizationActivation(db);
    const ownership = new OrganizationOwnershipRepository(db);
    // Proof: replacing each probe independently with [] failed `reports all three findings
    // together without dropping any probe`, observed 2026-10-17.
    const unmappedRoots = await ownership.findUnmappedRoots();
    const catalogNameDrift = await ownership.findCatalogNameDrift();
    const ownershipConflicts = await ownership.findOwnershipConflicts();
    snapshot.commit();
    return { marker, unmappedRoots, catalogNameDrift, ownershipConflicts };
  } catch (cause) {
    // Proof: omitting rollback failed `throws on unavailable query state and rolls back before
    // reuse` with an active-transaction refusal on the next inspection, 2026-10-17.
    snapshot.rollback();
    throw cause;
  }
}
