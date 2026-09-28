import { ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { type OrganizationActivation, readOrganizationActivation } from './organization-activation';

/** One membership as the preview reports it. */
export interface PreviewedMembership {
  readonly organizationId: string;
  readonly role: OrganizationRole;
}

/**
 * What a browser session of one local user would have to do once sessions
 * bind an active organization (task 2.4): `onboarding_required` with no
 * membership, otherwise `selection_required` among its candidates. Selection
 * is always explicit, even for one candidate; nothing picks the first row.
 */
export type PreviewedSelection =
  | { readonly status: 'onboarding_required' }
  | {
      readonly status: 'selection_required';
      readonly candidates: readonly PreviewedMembership[];
    };

export interface SelectionPreview {
  readonly marker: OrganizationActivation;
  readonly users: readonly ({ readonly userId: string } & PreviewedSelection)[];
}

/**
 * A read-only preview of every local user's organization selection, for a
 * dry run over a database copy before task 2.4 binds sessions. It reports
 * only what the database can tell: memberships, not browser sessions, which
 * are stateless and not stored.
 *
 * @throws when the activation marker is absent, unreadable or malformed, a
 * stored membership role is not one of {@link ORGANIZATION_ROLES}, or a
 * membership names a missing user or organization: trusted state this report
 * must never paper over.
 */
export function previewOrganizationSelection(db: Pick<Drizzle, 'all'>): SelectionPreview {
  const marker = readOrganizationActivation(db);
  const users = db.all<{ id: string }>(sql`SELECT id FROM users ORDER BY id`);
  const memberships = db.all<{
    userId: string;
    organizationId: string;
    role: string;
    userFound: number;
    organizationFound: number;
  }>(
    sql`SELECT m.user_id AS userId, m.organization_id AS organizationId, m.role,
        u.id IS NOT NULL AS userFound, o.id IS NOT NULL AS organizationFound
      FROM organization_membership AS m
        LEFT JOIN users AS u ON u.id = m.user_id
        LEFT JOIN organization AS o ON o.id = m.organization_id
      ORDER BY m.user_id, m.organization_id`,
  );
  const known: readonly string[] = ORGANIZATION_ROLES;
  const byUser = new Map<string, PreviewedMembership[]>();
  for (const each of memberships) {
    // Proof: skipping this check made `fails on a membership of a missing user
    // or organization` in `organization-selection-preview.db.test.ts` report
    // the dangling membership; watched 2026-09-28.
    if (each.userFound === 0 || each.organizationFound === 0) {
      throw new Error(
        `membership of "${each.userId}" in "${each.organizationId}" names a missing user or organization`,
      );
    }
    // Proof: accepting any stored role made `fails on a malformed membership
    // role` in `organization-selection-preview.db.test.ts` report it;
    // watched 2026-09-28.
    if (!known.includes(each.role)) {
      throw new Error(
        `membership of "${each.userId}" in "${each.organizationId}" has a malformed role`,
      );
    }
    byUser.set(each.userId, [
      ...(byUser.get(each.userId) ?? []),
      // Narrowed by the membership test above, which is the boundary this is.
      { organizationId: each.organizationId, role: each.role as OrganizationRole },
    ]);
  }
  return {
    marker,
    users: users.map(({ id }) => {
      const candidates = byUser.get(id) ?? [];
      // Proof: answering `selection_required` with no candidates made
      // `reports zero, one and several memberships` in
      // `organization-selection-preview.db.test.ts` fail for the unaffiliated
      // user; watched 2026-09-28.
      return candidates.length === 0
        ? { userId: id, status: 'onboarding_required' }
        : { userId: id, status: 'selection_required', candidates };
    }),
  };
}
