import type { OrganizationLimitValues } from '@wbs/domain';

/**
 * The deployment default organization limits every test composition boots
 * with: the proposal's starting numbers (`wbs-organization-limits` L7).
 */
export const TEST_ORGANIZATION_DEFAULT_LIMITS: OrganizationLimitValues = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
