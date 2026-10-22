import type { OrganizationLimitsReading } from '@wbs/domain';

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
}
