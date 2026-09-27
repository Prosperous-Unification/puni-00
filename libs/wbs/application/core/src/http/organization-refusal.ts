import type { OrganizationAccessRefusal } from '../ports/organization-access';

/** An authenticated caller with no organization authority: typed 403, never a lookup. */
export const organizationRefusal = (refusal: OrganizationAccessRefusal) =>
  ({ ok: false, status: 403, body: { error: refusal } }) as const;
