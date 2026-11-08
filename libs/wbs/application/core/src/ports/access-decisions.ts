import type { AuthenticatedUser } from '@wbs/contracts';
import {
  CONTRIBUTOR_CAP,
  type EffectiveRole,
  type InterimPackageChain,
  type Permission,
  type ProjectChain,
} from '@wbs/domain';

/**
 * Who a decision is about (`wbs-permissions` P12, P17): the account `id`
 * whose membership decides (for a machine credential its agent person's
 * bound account; for a consent delegation the mapped sign-in account the
 * delegation verifier installs) and what authenticated the request.
 */
export type ScopedPrincipal = Pick<AuthenticatedUser, 'id' | 'authentication'>;

/**
 * Whose grants reach a {@link ScopedPrincipal} (`wbs-permissions` P17): a
 * machine or consent credential holds only the grants naming it; any other
 * principal holds its account's, its access groups' and the
 * organization-members subject's. `accountId` is checked for membership
 * either way.
 */
export type AccessSubject =
  | { readonly kind: 'credential'; readonly accountId: string; readonly credentialId: string }
  | { readonly kind: 'account'; readonly accountId: string };

/**
 * The {@link AccessSubject} of `principal`. An upstream token without a
 * machine credential acts as its account until `wbs-machine-credentials`
 * slice 4 refuses it (P17).
 */
export function accessSubjectOf(principal: ScopedPrincipal): AccessSubject {
  const authentication = principal.authentication;
  return authentication?.kind === 'machine' || authentication?.kind === 'consent'
    ? { kind: 'credential', accountId: principal.id, credentialId: authentication.credentialId }
    : { kind: 'account', accountId: principal.id };
}

/**
 * The cap a decision for `subject` intersects with (P12, CP8):
 * {@link CONTRIBUTOR_CAP} for a credential, null (uncapped) for an account.
 */
export function capOf(subject: AccessSubject): ReadonlySet<Permission> | null {
  return subject.kind === 'credential' ? CONTRIBUTOR_CAP : null;
}

/**
 * What a decision is about (`wbs-permissions` "The `may` port", P13). A work
 * package carries its `restricted` flag (P5) and, until `wbs-work-packages`
 * slice 2 gives it a project, only an {@link InterimPackageChain}: the
 * listing has no project branch, so no project grant reaches a package in
 * detail either (a `projectId` on a structurally wider chain is ignored),
 * and list and detail agree. Task 3.4 widens the member to `WorkPackageChain`
 * together with the listing's project branch (3.2).
 */
export type AccessTarget =
  | { readonly kind: 'organization'; readonly organizationId: string }
  | { readonly kind: 'project'; readonly chain: ProjectChain }
  | {
      readonly kind: 'work_package';
      readonly chain: InterimPackageChain;
      readonly restricted: boolean;
    };

/**
 * Grant decisions (`wbs-permissions` P13, `wbs-custom-permissions` CP1, CP9,
 * CP17, CP18): one statement per call, no cache. Installed on the SQLite
 * source's public catalogs and on every catalog a unit of work admits, so a
 * batch decides inside its own transaction and sees its own grant writes.
 *
 * Every grant counts only while `principal.id` is a current member of the
 * organization: a removed member's grants reach nothing.
 *
 * @throws {UnknownPermissionRow}, {PermissionKindRow} or {EmptyRoleSet}
 * (`@wbs/domain`) when a reaching grant's stored role rows are corrupt, on
 * either method; never skipped. Also when trusted state is unreadable.
 */
export interface AccessDecisions {
  /**
   * `principal`'s permissions on `target` with the grants that contributed
   * (`via`), after P5's transformation and the cap. Null means invisible: the
   * target's read permission (`project.read`, `package.read`) is not in the
   * set (CP17). The organization target is never null.
   */
  effectiveRoleAt(principal: ScopedPrincipal, target: AccessTarget): Promise<EffectiveRole | null>;
  /**
   * The ids of `organizationId`'s work packages whose effective set holds
   * `package.read` for `principal`: exactly those for which
   * {@link AccessDecisions.effectiveRoleAt} is not null.
   */
  readablePackageIds(
    principal: ScopedPrincipal,
    organizationId: string,
  ): Promise<ReadonlySet<string>>;
}
