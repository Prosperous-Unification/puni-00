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
