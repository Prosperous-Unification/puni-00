import type {
  OrganizationLimitsReading,
  OrganizationLimitsSource,
  OrganizationLimitUsage,
  OrganizationLimitValues,
} from '@wbs/domain';

/**
 * Organization limits (`organization-limits`): the caps an organization holds,
 * its own or the deployment default, read beside its usage.
 *
 * @throws when trusted state is missing, unreadable or malformed, including a
 * stored row outside the bounds no writer could have stored.
 */
export interface OrganizationLimits {
  /**
   * The organization's caps and usage, read in one transaction so they agree
   * (L8): `inactive` before activation, `forbidden` for anyone but a current
   * `admin` or `super_admin` of it, who reads no usage.
   */
  read(
    organizationId: string,
    actorId: string,
  ): Promise<OrganizationLimitsReading | 'inactive' | 'forbidden'>;
  /**
   * The organization's caps and usage for a host operator (L12), who holds no
   * membership: `inactive` before activation, `unknown_organization` when no
   * organization has that id.
   */
  inspect(
    organizationId: string,
  ): Promise<OrganizationLimitsReading | 'inactive' | 'unknown_organization'>;
  /**
   * Writes the organization's own row (L12): each cap `change` names, and for
   * the rest the row's value, or the deployment default when it has none, so
   * the row is always complete (L6). Writes one `organization_limits_changed`
   * audit row in the same transaction (L13). A change naming the values the
   * organization's own row already holds writes nothing and answers
   * `unchanged`. A cap below usage is accepted (L11). `rehearse` decides and
   * writes as `apply` would, then rolls back.
   *
   * @throws when `change` names no cap or a value outside the bounds: the
   * caller's boundary refuses both first. Also when the audit row cannot be
   * written, after rolling back the row.
   */
  set(
    organizationId: string,
    change: OrganizationLimitsChange,
    act: OperatorLimitsAct,
    mode: LimitsWriteMode,
  ): Promise<OrganizationLimitsChanged | 'inactive' | 'unknown_organization'>;
  /**
   * Deletes the organization's own row so the deployment default applies
   * again, with its audit row in the same transaction (L12, L13): `no_row`
   * when it already holds the default.
   *
   * @throws when the audit row cannot be written, after rolling back.
   */
  reset(
    organizationId: string,
    act: OperatorLimitsAct,
    mode: LimitsWriteMode,
  ): Promise<OrganizationLimitsChanged | 'inactive' | 'unknown_organization' | 'no_row'>;
}

/** The caps a `set` names, at least one; the rest keep their effective value. */
export type OrganizationLimitsChange = Partial<OrganizationLimitValues>;

/** Whether a limits write commits, or decides as it would and rolls back. */
export type LimitsWriteMode = 'apply' | 'rehearse';

/**
 * Who changes an organization's limits and when (L13): `actor` is what the
 * audit row names, `operator:<os login>` for the CLI, and `auditId` the id
 * that row takes. Built once per act by the caller, which holds the clock.
 * There is no user, so the limits row's `created_by` stays empty.
 */
export interface OperatorLimitsAct {
  readonly actor: string;
  readonly at: number;
  readonly auditId: string;
}

/** An organization's caps and where they came from. */
export interface EffectiveOrganizationLimits {
  readonly source: OrganizationLimitsSource;
  readonly limits: OrganizationLimitValues;
}

/** What a `set` or `reset` did, or would do when rehearsed, beside the usage it read. */
export interface OrganizationLimitsChanged {
  readonly change: 'set' | 'reset' | 'unchanged';
  readonly before: EffectiveOrganizationLimits;
  readonly after: EffectiveOrganizationLimits;
  readonly usage: OrganizationLimitUsage;
}

/** An organization's cap on one capped thing beside how many of it the organization holds now. */
export interface CapReading {
  readonly cap: number;
  readonly current: number;
}

/**
 * What a writing transaction reads to decide an organization limit
 * (`wbs-organization-limits` L10). It opens no transaction and takes no write
 * turn of its own: the caller holds the batch's turn and its open
 * transaction, so the count it answers is the one the write commits against,
 * and two racing writes are serialized by that turn rather than by this read.
 *
 * @throws when trusted state is missing, unreadable or malformed, including a
 * stored cap outside the bounds no writer could have stored.
 */
export interface OrganizationLimitGauge {
  /**
   * The organization's effective `maxAgentPersons` (its own row, else the
   * deployment default) and how many persons of kind `agent` it owns.
   */
  readAgentPersonCap(organizationId: string): Promise<CapReading>;
  /**
   * The organization's effective `maxConcurrentClaims` and how many bound
   * claims its projects hold: distinct `(work item, person, run)` triples
   * with at least one claim row (L5), including any the caller's open
   * transaction has written.
   */
  readConcurrentClaimCap(organizationId: string): Promise<CapReading>;
  /**
   * The organization's effective `maxCapacityUnitsPerResource` and, as
   * `current`, the units of `resourceId` its projects other than
   * `exceptProjectId` state, summed (L2): what a capacity write to
   * `exceptProjectId` adds its own units to, so the project's own statement
   * never counts against itself. 0 when no other project states it, and 0 for
   * a resource the organization does not own (L16).
   */
  readCapacityCap(
    organizationId: string,
    resourceId: string,
    exceptProjectId: string,
  ): Promise<CapReading>;
}
