import { randomUUID } from 'node:crypto';

import { eq, ne, or, sql } from 'drizzle-orm';

import { auditOnCreate } from './audit';
import { type Drizzle, drizzleOuterTransaction } from './db';
import { backfillExternalIdentities } from './external-identity';
import { readOrganizationActivation } from './organization-activation';
import {
  OrganizationOwnershipRepository,
  type OwnedRootKind,
  type OwnershipConflict,
  type UnmappedRoot,
} from './organization-ownership';
import { externalIdentity, organization, organizationMembership, users } from './schema';

/** What the operator asks for: the organization's name and Dany's account, by id or username. */
export interface LegacyActivationRequest {
  readonly name: string;
  readonly superAdmin: string;
  /** The instant the organization, its memberships and the marker are stamped with. */
  readonly at: number;
  /** False rehearses the whole transaction and rolls it back. */
  readonly isApplied: boolean;
  /**
   * Deletes the `event_sequencer` and `event_log` rows of `project:<id>` streams whose project
   * row no longer exists, before reconciliation. Project deletion leaves them behind, and
   * reconciliation otherwise refuses them as unresolved streams.
   */
  readonly isPruningRetainedStreams: boolean;
}

/** One membership activation grants. */
export interface GrantedMembership {
  readonly id: string;
  readonly username: string;
  readonly role: 'super_admin' | 'member';
}

/** One legacy `project.solution_slug` pair moved into `project_solution`. */
export interface MovedSolution {
  readonly projectId: string;
  readonly slug: string;
  readonly url: string;
}

/** One legacy identity pair copied into `external_identity`. */
export interface MappedIdentity {
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
}

/** What activation created and mapped, or would have in a rehearsal. */
export interface LegacyActivation {
  readonly mode: 'applied' | 'dry_run';
  /** A rehearsal's id is discarded with its rollback; apply generates a new one. */
  readonly organization: { readonly id: string; readonly name: string };
  readonly superAdmin: { readonly id: string; readonly username: string };
  /** Every membership granted, by user id: the super-admin and every other user as `member`. */
  readonly members: readonly GrantedMembership[];
  /** Rows each root kind gained; a kind the bridge had already mapped gains none. */
  readonly mappedRoots: ReadonlyMap<OwnedRootKind, number>;
  readonly solutionLinks: readonly MovedSolution[];
  /** Identities added, by user id; a pair already mapped to its own user is not listed. */
  readonly externalIdentities: readonly MappedIdentity[];
  /** Retained streams deleted, by name; empty unless pruning was requested. */
  readonly prunedStreams: readonly string[];
  /** Null in a rehearsal, which leaves the marker `pre_activation`. */
  readonly activatedAt: number | null;
}

/** Why activation refused; nothing was written. */
export type LegacyActivationRefusal =
  | { readonly refusal: 'already_activated' }
  | { readonly refusal: 'organization_exists'; readonly organizations: number }
  | { readonly refusal: 'super_admin_unresolved'; readonly candidates: readonly string[] }
  | {
      readonly refusal: 'reconciliation_failed';
      readonly unmappedRoots: readonly UnmappedRoot[];
      readonly catalogNameDrift: readonly UnmappedRoot[];
      readonly ownershipConflicts: readonly OwnershipConflict[];
    };

export type LegacyActivationOutcome =
  | { readonly ok: true; readonly activation: LegacyActivation }
  | { readonly ok: false; readonly refused: LegacyActivationRefusal };

/**
 * Activates organization isolation on a store that has none yet: one legacy organization, the
 * named super-admin and every other user as `member`, every root mapped through
 * {@link OrganizationOwnershipRepository.backfillLegacyOwnership}, legacy solution pairs moved
 * into `project_solution`, legacy identity pairs copied by {@link backfillExternalIdentities},
 * then the same three reconciliation queries the ownership preflight reports, and finally the
 * marker. All of it in one `BEGIN IMMEDIATE` on `db`, which the caller must hold exclusively;
 * a rehearsal runs every step and rolls back.
 *
 * One-way: the marker's triggers refuse reverting or deleting `activated`, and schema reversal
 * across it is refused (`organization-ownership-and-access`, "Migration and rollback preserve
 * tenant isolation"). Recovery is an organization-aware release or forward repair.
 *
 * With {@link LegacyActivationRequest.isPruningRetainedStreams} it first deletes the event
 * streams of deleted projects, which reconciliation would otherwise refuse.
 *
 * Not covered here, and still the operator's: old organization-unaware processes must have
 * drained (afterwards their root inserts map to nothing), the MCP credential epoch and
 * trusted policy state of task 7.1.
 *
 * @throws {OrganizationActivationRefused} when the marker is absent, unreadable or malformed.
 * @throws when a legacy identity or solution pair is malformed, or any write fails; the
 * transaction is rolled back first.
 */
export async function activateLegacyOrganization(
  db: Drizzle,
  request: LegacyActivationRequest,
): Promise<LegacyActivationOutcome> {
  const transaction = drizzleOuterTransaction(db);
  transaction.begin();
  try {
    const outcome = await activateWithin(db, request);
    // Proof: 2026-10-20, committing every successful outcome made `rehearses without --apply,
    // printing the plan and writing nothing` observe the identity, mappings and moved pairs.
    if (outcome.ok && request.isApplied) transaction.commit();
    else transaction.rollback();
    return outcome;
  } catch (cause) {
    transaction.rollback();
    throw cause;
  }
}

async function activateWithin(
  db: Drizzle,
  request: LegacyActivationRequest,
): Promise<LegacyActivationOutcome> {
  // Proof: 2026-10-20, with this check removed `refuses a second apply before touching the
  // store` exited 4 (`organization_exists`) instead of 3, and `refuses an activated marker even
  // when no organization exists` reached the marker's no-revert trigger (exit 1).
  if (readOrganizationActivation(db) !== 'pre_activation')
    return { ok: false, refused: { refusal: 'already_activated' } };
  const organizations = db.select({ id: organization.id }).from(organization).all().length;
  if (organizations > 0)
    return { ok: false, refused: { refusal: 'organization_exists', organizations } };
  const candidates = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(or(eq(users.id, request.superAdmin), eq(users.username, request.superAdmin)))
    .all();
  const superAdmin = candidates.at(0);
  if (superAdmin === undefined || candidates.length !== 1)
    return {
      ok: false,
      refused: {
        refusal: 'super_admin_unresolved',
        candidates: candidates.map((candidate) => candidate.id),
      },
    };

  const stamp = { at: request.at, by: superAdmin.id };
  const created = { id: randomUUID(), name: request.name };
  db.insert(organization)
    .values({ ...created, legacy: true, ...auditOnCreate(stamp) })
    .run();
  const ownership = new OrganizationOwnershipRepository(db);
  const mapped = await ownership.backfillLegacyOwnership();
  const granted = db.transaction((tx) => {
    tx.insert(organizationMembership)
      .values({
        organizationId: created.id,
        userId: superAdmin.id,
        role: 'super_admin',
        ...auditOnCreate(stamp),
      })
      .run();
    const others = tx.select({ id: users.id }).from(users).where(ne(users.id, superAdmin.id)).all();
    for (const other of others)
      tx.insert(organizationMembership)
        .values({
          organizationId: created.id,
          userId: other.id,
          role: 'member',
          ...auditOnCreate(stamp),
        })
        .run();
    return readGrantedMemberships(tx, created.id);
  });
  const solutionLinks = moveLegacySolutions(db, created.id);
  const externalIdentities = db.transaction((tx) => {
    const before = new Set(readIdentityKeys(tx));
    backfillExternalIdentities(tx, request.at);
    return readIdentities(tx).filter(
      (identity) => !before.has(`${identity.issuer}\n${identity.subject}`),
    );
  });
  const prunedStreams = request.isPruningRetainedStreams ? pruneRetainedStreams(db) : [];

  const unmappedRoots = await ownership.findUnmappedRoots();
  const catalogNameDrift = await ownership.findCatalogNameDrift();
  const ownershipConflicts = await ownership.findOwnershipConflicts();
  // Proof: 2026-10-20, with this check removed `refuses and rolls back over a root planted
  // after the backfill` and `refuses an event stream that resolves to no project` both exited 0,
  // committing the marker over the unmapped tag and the unresolved stream.
  if (unmappedRoots.length + catalogNameDrift.length + ownershipConflicts.length > 0)
    return {
      ok: false,
      refused: {
        refusal: 'reconciliation_failed',
        unmappedRoots,
        catalogNameDrift,
        ownershipConflicts,
      },
    };

  if (request.isApplied) {
    db.run(
      sql`UPDATE organization_activation SET state = 'activated', activated_at = ${request.at}
        WHERE singleton = 1`,
    );
    if (readOrganizationActivation(db) !== 'activated')
      throw new Error('organization activation marker did not record activation');
  }
  return {
    ok: true,
    activation: {
      mode: request.isApplied ? 'applied' : 'dry_run',
      organization: created,
      superAdmin,
      members: granted,
      mappedRoots: mapped,
      solutionLinks,
      externalIdentities,
      prunedStreams,
      activatedAt: request.isApplied ? request.at : null,
    },
  };
}

type Transaction = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

function readGrantedMemberships(tx: Transaction, organizationId: string): GrantedMembership[] {
  return tx
    .select({ id: users.id, username: users.username, role: organizationMembership.role })
    .from(organizationMembership)
    .innerJoin(users, eq(users.id, organizationMembership.userId))
    .where(eq(organizationMembership.organizationId, organizationId))
    .orderBy(users.id)
    .all()
    .map((row) => {
      // Written above in this transaction; anything else is a write this function did not make.
      if (row.role !== 'super_admin' && row.role !== 'member')
        throw new Error(`activation granted an unexpected role ${row.role}`);
      return { id: row.id, username: row.username, role: row.role };
    });
}

/**
 * Moves every legacy `project.solution_slug` pair into `project_solution`, so a single
 * representation remains after activation (task 3.5). A half pair fails `project_solution`'s
 * NOT NULL and rolls everything back.
 */
function moveLegacySolutions(db: Drizzle, organizationId: string): MovedSolution[] {
  const moved = db
    .all<{ projectId: unknown; slug: unknown; url: unknown }>(
      sql`SELECT id AS projectId, solution_slug AS slug, solution_url AS url FROM project
        WHERE solution_slug IS NOT NULL OR solution_url IS NOT NULL ORDER BY id`,
    )
    .map(({ projectId, slug, url }) => {
      // Raw SQL rows arrive unknown; a half or non-text pair is corrupt trusted state.
      if (typeof projectId !== 'string' || typeof slug !== 'string' || typeof url !== 'string')
        throw new Error(`project ${String(projectId)} has a partial legacy solution pair`);
      return { projectId, slug, url };
    });
  db.run(
    sql`INSERT INTO project_solution (project_id, organization_id, slug, url)
      SELECT id, ${organizationId}, solution_slug, solution_url FROM project
      WHERE solution_slug IS NOT NULL OR solution_url IS NOT NULL`,
  );
  db.run(
    sql`UPDATE project SET solution_slug = NULL, solution_url = NULL
      WHERE solution_slug IS NOT NULL OR solution_url IS NOT NULL`,
  );
  return moved;
}

function readIdentities(tx: Transaction): MappedIdentity[] {
  return tx
    .select({
      userId: externalIdentity.userId,
      issuer: externalIdentity.issuer,
      subject: externalIdentity.subject,
    })
    .from(externalIdentity)
    .orderBy(externalIdentity.userId, externalIdentity.issuer, externalIdentity.subject)
    .all();
}

function readIdentityKeys(tx: Transaction): string[] {
  return readIdentities(tx).map((identity) => `${identity.issuer}\n${identity.subject}`);
}

/**
 * Deletes every `project:<id>` stream whose project row is gone, returning their names. A
 * stream naming a live project, or any other subscription, is never touched.
 */
function pruneRetainedStreams(db: Drizzle): string[] {
  const retained = db
    .all<{ subscription: unknown }>(
      // Proof: 2026-10-20, with the NOT EXISTS guard removed `prunes only streams whose project
      // is gone, then activates` (store) and `prunes a deleted project's retained stream only
      // with --apply` (be-01 CLI) each saw the live project's stream pruned too.
      sql`SELECT subscription FROM (
          SELECT subscription FROM event_sequencer UNION SELECT subscription FROM event_log)
        WHERE substr(subscription, 1, 8) = 'project:'
          AND NOT EXISTS (SELECT 1 FROM project WHERE 'project:' || project.id = subscription)
        ORDER BY subscription`,
    )
    .map(({ subscription }) => {
      // Raw SQL rows arrive unknown; subscriptions are text keys.
      if (typeof subscription !== 'string') throw new Error('event stream has a non-text name');
      return subscription;
    });
  for (const subscription of retained) {
    db.run(sql`DELETE FROM event_log WHERE subscription = ${subscription}`);
    db.run(sql`DELETE FROM event_sequencer WHERE subscription = ${subscription}`);
  }
  return retained;
}
