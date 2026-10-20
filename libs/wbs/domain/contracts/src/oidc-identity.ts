export type WbsScope = 'read' | 'write' | 'editor';

/** Identity established from a verified upstream OIDC credential. */
export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  scopes: readonly WbsScope[];
  /**
   * Whether the token carried the groups claim at all (`wbs_groups`), even an
   * empty one. A browser login always does (the Auth0 action sets it); a
   * machine-to-machine token does not. After activation an unmapped pair
   * without it is refused rather than given an account (`wbs-team-claims` D6b).
   */
  groupsClaimed: boolean;
}
