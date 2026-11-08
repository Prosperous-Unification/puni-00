import type {
  CapReading,
  EffectiveOrganizationLimits,
  LimitsWriteMode,
  OperatorLimitsAct,
  OrganizationLimitGauge,
  OrganizationLimits,
  OrganizationLimitsChange,
  OrganizationLimitsChanged,
} from '@wbs/core';
import {
  isOrganizationLimit,
  type OrganizationLimitsReading,
  type OrganizationLimitsSource,
  type OrganizationLimitUsage,
  type OrganizationLimitValues,
  type ResourceCapacityUsage,
} from '@wbs/domain';
import { and, asc, count, eq, ne, sql, sum, TransactionRollbackError } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnOperatorCreate, auditOnUpdate } from './audit';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  claim,
  organization,
  organizationLimits,
  person,
  personOrganization,
  projectOrganization,
  projectResourceCapacity,
  resource,
  resourceOrganization,
  workItem,
} from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];
type Reader = Pick<SQLiteBunDatabase, 'select' | 'selectDistinct'>;

/**
 * @throws when `limits` is absent or any of it is outside the bounds an
 * organization may hold.
 */
export function checkedLimits(
  limits: OrganizationLimitValues | undefined,
  owner: string,
): OrganizationLimitValues {
  // An untyped caller (a spawned script calling `bootBe01`) can pass nothing;
  // without this the boot failed as "undefined is not an object".
  // Proof: with this check removed, `refuses absent deployment defaults,
  // naming them` (organization-limits.db.test.ts) failed on the TypeError
  // text; watched 2026-10-22.
  if (limits === undefined) throw new Error(`organization limits of ${owner} are missing`);
  if (
    !isOrganizationLimit(limits.maxAgentPersons) ||
    !isOrganizationLimit(limits.maxConcurrentClaims) ||
    !isOrganizationLimit(limits.maxCapacityUnitsPerResource)
  )
    throw new Error(`organization limits of ${owner} are malformed`);
  return limits;
}

/**
 * The organization's caps: its own row with `source: 'organization'`, or
 * `defaults` with `source: 'default'` when it has none (L6). Never mixes the two.
 *
 * @throws on a stored row no writer could have stored.
 */
export function readEffectiveLimits(
  db: Reader,
  organizationId: string,
  defaults: OrganizationLimitValues,
): { source: OrganizationLimitsSource; limits: OrganizationLimitValues } {
  const row = db
    .select({
      maxAgentPersons: organizationLimits.maxAgentPersons,
      maxConcurrentClaims: organizationLimits.maxConcurrentClaims,
      maxCapacityUnitsPerResource: organizationLimits.maxCapacityUnitsPerResource,
    })
    .from(organizationLimits)
    .where(eq(organizationLimits.organizationId, organizationId))
    .get();
  if (row === undefined) return { source: 'default', limits: defaults };
  return { source: 'organization', limits: checkedLimits(row, `organization ${organizationId}`) };
}

/**
 * How many persons of kind `agent` the organization owns (L5), read through
 * `person_organization`.
 *
 * Proof, each watched 2026-10-22 in `organization-limits.db.test.ts` (11 pass,
 * 1 fail): dropping the organization predicate, then the kind predicate, each
 * failed `counts only A’s agents, never its humans or B’s agents`.
 */
export function countAgentPersons(db: Reader, organizationId: string): number {
  const row = db
    .select({ n: count() })
    .from(person)
    .innerJoin(personOrganization, eq(personOrganization.resourceId, person.id))
    .where(and(eq(personOrganization.organizationId, organizationId), eq(person.kind, 'agent')))
    .get();
  if (row === undefined) throw new Error('agent person count answered no row');
  return row.n;
}

/**
 * How many bound claims the organization's projects hold (L5): distinct
 * `(work item, person, run)` triples with at least one claim row, so a
 * whole-leaf claim writing four step rows is one and two persons on one leaf
 * are two. Two claims without a run on one leaf by one person are one triple.
 *
 * Proof, each watched 2026-10-22 in `organization-limits.db.test.ts`: counting
 * rows instead of triples failed `counts a four-step leaf under one run once…`
 * and `counts two run-less claims of one person on one leaf as one` (10 pass,
 * 2 fail); dropping the organization predicate failed `counts only A’s bound
 * claims` (11 pass, 1 fail).
 */
export function countBoundClaims(db: Reader, organizationId: string): number {
  const triples = db
    .selectDistinct({
      workItemId: claim.workItemId,
      personId: claim.personId,
      runId: claim.runId,
    })
    .from(claim)
    .innerJoin(workItem, eq(workItem.id, claim.workItemId))
    .innerJoin(projectOrganization, eq(projectOrganization.resourceId, workItem.projectId))
    .where(eq(projectOrganization.organizationId, organizationId))
    .as('bound_claim');
  const row = db.select({ n: count() }).from(triples).get();
  if (row === undefined) throw new Error('bound claim count answered no row');
  return row.n;
}

/**
 * Per resource of the organization with at least one stated capacity, its
 * stated units summed over the organization's projects, in resource-id order
 * (L5, L8). Only the organization's own projects and resources are read (L16).
 *
 * Proof, watched 2026-10-22 in `organization-limits.db.test.ts`: dropping the
 * project's organization predicate failed `sums stated capacity per resource
 * over A’s projects only…`, B's statement of A's resource counted (11 pass, 1 fail).
 */
export function readCapacityUsage(
  db: Reader,
  organizationId: string,
): readonly ResourceCapacityUsage[] {
  return db
    .select({
      resourceId: resourceOrganization.resourceId,
      name: resourceOrganization.name,
      unitLabel: resource.unitLabel,
      units: sql<number>`${sum(projectResourceCapacity.units)}`.mapWith(Number),
    })
    .from(projectResourceCapacity)
    .innerJoin(
      projectOrganization,
      eq(projectOrganization.resourceId, projectResourceCapacity.projectId),
    )
    .innerJoin(
      resourceOrganization,
      eq(resourceOrganization.resourceId, projectResourceCapacity.resourceId),
    )
    .innerJoin(resource, eq(resource.id, projectResourceCapacity.resourceId))
    .where(
      and(
        eq(projectOrganization.organizationId, organizationId),
        eq(resourceOrganization.organizationId, organizationId),
      ),
    )
    .groupBy(resourceOrganization.resourceId, resourceOrganization.name, resource.unitLabel)
    .orderBy(asc(resourceOrganization.resourceId))
    .all();
}

/**
 * The units of `resourceId` the organization's projects other than
 * `exceptProjectId` state, summed; 0 when none does, and 0 for a resource the
 * organization does not own. What a capacity write to `exceptProjectId` adds
 * its own units to (L9), read by {@link OrganizationLimitGaugeRepository.readCapacityCap}. Reads exactly the rows
 * {@link readCapacityUsage} sums, less the excluded project's: both require the
 * project and the resource to be the organization's (L16).
 *
 * Proof, watched 2026-10-22 in `organization-limits.db.test.ts`: dropping the
 * resource's organization predicate failed `never sums a resource the
 * organization does not own` (12 pass, 1 fail).
 *
 * Proof, watched 2026-10-22 in capacity-limit.controller.db.test.ts: dropping
 * the resource predicate failed `sums each resource on its own`, another
 * resource's 64 refusing one unit of `worktrees` (11 pass, 1 fail).
 *
 * Proof, watched 2026-10-22 in `organization-limits.db.test.ts`: dropping the
 * excluded project's predicate failed `sums another project’s units, never the
 * one being written` (11 pass, 1 fail).
 */
export function sumStatedCapacity(
  db: Reader,
  organizationId: string,
  resourceId: string,
  exceptProjectId: string,
): number {
  const row = db
    .select({ units: sum(projectResourceCapacity.units).mapWith(Number) })
    .from(projectResourceCapacity)
    .innerJoin(
      projectOrganization,
      eq(projectOrganization.resourceId, projectResourceCapacity.projectId),
    )
    .innerJoin(
      resourceOrganization,
      eq(resourceOrganization.resourceId, projectResourceCapacity.resourceId),
    )
    .where(
      and(
        eq(projectOrganization.organizationId, organizationId),
        eq(resourceOrganization.organizationId, organizationId),
        eq(projectResourceCapacity.resourceId, resourceId),
        ne(projectResourceCapacity.projectId, exceptProjectId),
      ),
    )
    .get();
  if (row === undefined) throw new Error('stated capacity sum answered no row');
  // SUM over no rows is NULL, which `mapWith(Number)` leaves as null: no
  // other project states this resource.
  return row.units ?? 0;
}

/**
 * Whether `actorId` may read `organizationId`'s limits now: `inactive` before
 * activation, `forbidden` for anyone but a current `admin` or `super_admin`,
 * null when permitted. Read inside the caller's transaction.
 *
 * Proof, each watched 2026-10-22: with the role test answering null, `answers
 * a member and a viewer 403 forbidden with no usage in the body`
 * (organization-limits.controller.db.test.ts) answered 200, and `answers caps and usage to an admin and a super-admin, and
 * forbidden to everyone else` (organization-limits.db.test.ts) failed; with the
 * activation test removed, `answers inactive before activation` failed.
 */
function limitsReaderRefusal(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): 'inactive' | 'forbidden' | null {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const role = roleIn(tx, organizationId, actorId);
  return role === 'admin' || role === 'super_admin' ? null : 'forbidden';
}

/** The organization's usage against each cap, read in the caller's transaction (L5, L8). */
function readUsage(db: Reader, organizationId: string): OrganizationLimitUsage {
  return {
    agentPersons: countAgentPersons(db, organizationId),
    concurrentClaims: countBoundClaims(db, organizationId),
    capacityUnits: readCapacityUsage(db, organizationId),
  };
}

/**
 * Whether an operator may act on `organizationId`'s limits now: `inactive`
 * before activation (a legacy store is uncapped), `unknown_organization` when
 * no such organization exists, null when it may. The operator holds no
 * membership: the host login is the authority (L12).
 *
 * Proof, each watched 2026-10-22 in `organization-limits-cli.db.test.ts` (27
 * pass, 1 fail): with the existence test removed, `refuses an unknown
 * organization, writing nothing` exited 1 instead of 4; with the activation
 * test removed, `refuses before activation` failed.
 */
function operatorRefusal(
  db: Transaction,
  organizationId: string,
): 'inactive' | 'unknown_organization' | null {
  if (readOrganizationActivation(db) !== 'activated') return 'inactive';
  const found = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .get();
  return found === undefined ? 'unknown_organization' : null;
}

function isSameLimits(left: OrganizationLimitValues, right: OrganizationLimitValues): boolean {
  return (
    left.maxAgentPersons === right.maxAgentPersons &&
    left.maxConcurrentClaims === right.maxConcurrentClaims &&
    left.maxCapacityUnitsPerResource === right.maxCapacityUnitsPerResource
  );
}

/**
 * The one `organization_limits_changed` row of a set or reset (L13): flat
 * before and after, in the act's own transaction.
 */
function appendLimitsAudit(
  tx: Transaction,
  organizationId: string,
  act: OperatorLimitsAct,
  before: EffectiveOrganizationLimits,
  after: EffectiveOrganizationLimits,
): void {
  appendOrganizationAudit(tx, {
    id: act.auditId,
    organizationId,
    actorId: act.actor,
    action: 'organization_limits_changed',
    subjectKind: 'organization_limits',
    subjectId: organizationId,
    detail: {
      beforeSource: before.source,
      afterSource: after.source,
      beforeMaxAgentPersons: before.limits.maxAgentPersons,
      afterMaxAgentPersons: after.limits.maxAgentPersons,
      beforeMaxConcurrentClaims: before.limits.maxConcurrentClaims,
      afterMaxConcurrentClaims: after.limits.maxConcurrentClaims,
      beforeMaxCapacityUnitsPerResource: before.limits.maxCapacityUnitsPerResource,
      afterMaxCapacityUnitsPerResource: after.limits.maxCapacityUnitsPerResource,
    },
    at: act.at,
  });
}

/**
 * The caps a `set` leaves the organization holding: each one `change` names,
 * the rest at their effective value, never 0 or a guess (L12).
 *
 * @throws when `change` names no cap or a value outside the bounds.
 */
function changedLimits(
  effective: OrganizationLimitValues,
  change: OrganizationLimitsChange,
  organizationId: string,
): OrganizationLimitValues {
  if (
    change.maxAgentPersons === undefined &&
    change.maxConcurrentClaims === undefined &&
    change.maxCapacityUnitsPerResource === undefined
  )
    throw new Error(`a limits change for organization ${organizationId} names no cap`);
  // Proof: 2026-10-22, starting from zeros instead of `effective` made
  // `writes a complete row from the defaults, audited before and after` and
  // three more cases of organization-limits-cli.db.test.ts fail (24 pass, 4 fail).
  return checkedLimits(
    {
      maxAgentPersons: change.maxAgentPersons ?? effective.maxAgentPersons,
      maxConcurrentClaims: change.maxConcurrentClaims ?? effective.maxConcurrentClaims,
      maxCapacityUnitsPerResource:
        change.maxCapacityUnitsPerResource ?? effective.maxCapacityUnitsPerResource,
    },
    `the change for organization ${organizationId}`,
  );
}

/**
 * {@link OrganizationLimits} over the shared database, with the deployment
 * defaults be-01 read at boot (L7).
 */
export class OrganizationLimitsRepository implements OrganizationLimits {
  private readonly defaults: OrganizationLimitValues;

  /** @throws when `defaults` are outside the bounds an organization may hold. */
  constructor(
    private readonly db: SQLiteBunDatabase,
    defaults: OrganizationLimitValues,
  ) {
    this.defaults = checkedLimits(defaults, 'the deployment default');
  }

  async read(
    organizationId: string,
    actorId: string,
  ): Promise<OrganizationLimitsReading | 'inactive' | 'forbidden'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refusal = limitsReaderRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      return {
        ...readEffectiveLimits(tx, organizationId, this.defaults),
        usage: readUsage(tx, organizationId),
      };
    });
  }

  async inspect(
    organizationId: string,
  ): Promise<OrganizationLimitsReading | 'inactive' | 'unknown_organization'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refusal = operatorRefusal(tx, organizationId);
      if (refusal !== null) return refusal;
      return {
        ...readEffectiveLimits(tx, organizationId, this.defaults),
        usage: readUsage(tx, organizationId),
      };
    });
  }

  async set(
    organizationId: string,
    change: OrganizationLimitsChange,
    act: OperatorLimitsAct,
    mode: LimitsWriteMode,
  ): Promise<OrganizationLimitsChanged | 'inactive' | 'unknown_organization'> {
    await Promise.resolve();
    return this.write(mode, (tx) => {
      const refusal = operatorRefusal(tx, organizationId);
      if (refusal !== null) return refusal;
      const before = readEffectiveLimits(tx, organizationId, this.defaults);
      const after: EffectiveOrganizationLimits = {
        source: 'organization',
        limits: changedLimits(before.limits, change, organizationId),
      };
      const usage = readUsage(tx, organizationId);
      if (before.source === 'organization' && isSameLimits(before.limits, after.limits))
        return { change: 'unchanged', before, after: before, usage };
      if (before.source === 'default')
        tx.insert(organizationLimits)
          .values({ organizationId, ...after.limits, ...auditOnOperatorCreate(act.at) })
          .run();
      else
        tx.update(organizationLimits)
          .set({ ...after.limits, ...auditOnUpdate(act) })
          .where(eq(organizationLimits.organizationId, organizationId))
          .run();
      // Proof: 2026-10-22, appending this in its own transaction after the
      // write committed left the row of 8 behind in `writes nothing and exits
      // non-zero naming the failure when the audit cannot be written`.
      appendLimitsAudit(tx, organizationId, act, before, after);
      return { change: 'set', before, after, usage };
    });
  }

  async reset(
    organizationId: string,
    act: OperatorLimitsAct,
    mode: LimitsWriteMode,
  ): Promise<OrganizationLimitsChanged | 'inactive' | 'unknown_organization' | 'no_row'> {
    await Promise.resolve();
    return this.write(mode, (tx) => {
      const refusal = operatorRefusal(tx, organizationId);
      if (refusal !== null) return refusal;
      const before = readEffectiveLimits(tx, organizationId, this.defaults);
      if (before.source === 'default') return 'no_row';
      const after: EffectiveOrganizationLimits = { source: 'default', limits: this.defaults };
      tx.delete(organizationLimits)
        .where(eq(organizationLimits.organizationId, organizationId))
        .run();
      appendLimitsAudit(tx, organizationId, act, before, after);
      return { change: 'reset', before, after, usage: readUsage(tx, organizationId) };
    });
  }

  /**
   * Runs `decide` in one immediate transaction (L13): `apply` commits it, and
   * `rehearse` rolls back whatever it wrote, answering what it decided. A
   * throw rolls back too, so a failed audit write leaves no limits row.
   *
   * Proof: 2026-10-22, never rolling a rehearsal back failed `rehearses
   * without --apply, printing the change and writing nothing` and `rehearses
   * a reset without --apply, keeping the row` (organization-limits-cli.db.test.ts,
   * 26 pass, 2 fail).
   */
  private write<T>(mode: LimitsWriteMode, decide: (tx: Transaction) => T): T {
    const decided: T[] = [];
    try {
      this.db.transaction(
        (tx) => {
          decided.push(decide(tx));
          if (mode === 'rehearse') tx.rollback();
        },
        { behavior: 'immediate' },
      );
    } catch (cause) {
      // The rehearsal's own rollback is the one throw this recovers from.
      if (!(mode === 'rehearse' && cause instanceof TransactionRollbackError)) throw cause;
    }
    if (decided.length !== 1) throw new Error('the limits transaction decided nothing');
    return decided[0];
  }
}

/**
 * The organization's agent-person cap and count, read through `db`: the
 * caller's transaction when it holds one. The one reading `addPerson`'s cap
 * check (through {@link OrganizationLimitGaugeRepository}) and an agent pool's
 * creation (`AgentPoolRepository`) both decide by.
 */
export function readAgentPersonCapIn(
  db: Reader,
  organizationId: string,
  defaults: OrganizationLimitValues,
): CapReading {
  return {
    cap: readEffectiveLimits(db, organizationId, defaults).limits.maxAgentPersons,
    current: countAgentPersons(db, organizationId),
  };
}

/**
 * {@link OrganizationLimitGauge} over the shared database: plain reads on the
 * process's one connection, inside whatever transaction its caller holds. The
 * source installs it among the stores a batch is admitted with, so a batch
 * reads its count in its own `BEGIN IMMEDIATE` under its write turn (L10).
 */
export class OrganizationLimitGaugeRepository implements OrganizationLimitGauge {
  private readonly defaults: OrganizationLimitValues;

  /** @throws when `defaults` are outside the bounds an organization may hold. */
  constructor(
    private readonly db: SQLiteBunDatabase,
    defaults: OrganizationLimitValues,
  ) {
    this.defaults = checkedLimits(defaults, 'the deployment default');
  }

  async readAgentPersonCap(organizationId: string): Promise<CapReading> {
    await Promise.resolve();
    return readAgentPersonCapIn(this.db, organizationId, this.defaults);
  }

  // Proof: answering `maxAgentPersons` as the cap here failed the SQLite
  // certification's `organizationLimits.readConcurrentClaimCap:bound-triples`
  // and both orders of claim-limit-race.db.test.ts (74 pass, 4 fail); watched 2026-10-22.
  async readConcurrentClaimCap(organizationId: string): Promise<CapReading> {
    await Promise.resolve();
    return {
      cap: readEffectiveLimits(this.db, organizationId, this.defaults).limits.maxConcurrentClaims,
      current: countBoundClaims(this.db, organizationId),
    };
  }

  // Proof: answering `maxConcurrentClaims` as the cap here failed the SQLite
  // certification's `organizationLimits.readCapacityCap:per-resource-except-project`,
  // both orders of capacity-limit-race.db.test.ts and its model (74 pass, 4 fail);
  // watched 2026-10-22.
  async readCapacityCap(
    organizationId: string,
    resourceId: string,
    exceptProjectId: string,
  ): Promise<CapReading> {
    await Promise.resolve();
    return {
      cap: readEffectiveLimits(this.db, organizationId, this.defaults).limits
        .maxCapacityUnitsPerResource,
      current: sumStatedCapacity(this.db, organizationId, resourceId, exceptProjectId),
    };
  }
}
