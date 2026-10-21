/** Where a machine credential's proof comes from (`wbs-machine-credentials` A3, A8, A21). */
export type MachineCredentialSource = 'api_key' | 'oidc' | 'mcp_consent';

/** One stored API-key secret of a credential: its SHA-256 hex digest and expiry. */
export interface MachineSecretRecord {
  readonly digest: string;
  /** Null until a rotation gives it the end of its window (A11, A15). */
  readonly expiresAt: number | null;
}

/**
 * A machine credential as the admission decision reads it: the stored row, the
 * account its person is bound to now, and for `api_key` every secret it holds.
 */
export interface MachineCredentialRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
  readonly source: MachineCredentialSource;
  /** `person.account_id` read now; null when the person was unbound. */
  readonly boundAccountId: string | null;
  readonly revokedAt: number | null;
  readonly trustedIssuerId: string | null;
  readonly mcpFamilyId: string | null;
  /** Empty for every source but `api_key`. */
  readonly secrets: readonly MachineSecretRecord[];
}

/**
 * What the request presented, already verified by its own verifier: the
 * digest of an API key's secret, the trusted issuer whose key set verified a
 * JWT, or the MCP family a delegation names.
 */
export type PresentedMachineProof =
  | { readonly kind: 'api_key'; readonly digest: string }
  | { readonly kind: 'oidc'; readonly trustedIssuerId: string }
  | { readonly kind: 'mcp_consent'; readonly familyId: string };

/** The only scopes a machine credential ever carries (A12): never `editor`. */
export const MACHINE_SCOPES = ['read', 'write'] as const;

/**
 * Who an admitted machine credential acts as (A12): the account its person is
 * bound to, in the credential's organization, pinned to that person.
 */
export interface MachineActor {
  readonly credentialId: string;
  readonly accountId: string;
  readonly organizationId: string;
  readonly personId: string;
  readonly scopes: typeof MACHINE_SCOPES;
}

export type MachineAdmission =
  | { readonly kind: 'admitted'; readonly actor: MachineActor }
  | { readonly kind: 'refused'; readonly refusal: 'unknown_identity' };

const UNKNOWN: MachineAdmission = { kind: 'refused', refusal: 'unknown_identity' };

/**
 * Whether two lowercase hex SHA-256 digests are equal, reading every character
 * of both whatever the first difference: the comparison time depends only on
 * the length, which is fixed at 64 for every stored and presented digest.
 * Written out rather than `node:crypto`'s `timingSafeEqual` because this ring
 * imports no runtime.
 *
 * Proof: with the body replaced by `left === right`, `reads every character of
 * both digests whatever the first difference` (machine-credential.test.ts)
 * counted 0 reads; watched 2026-10-22.
 */
export function digestsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let at = 0; at < left.length; at += 1)
    difference |= left.charCodeAt(at) ^ right.charCodeAt(at);
  return difference === 0;
}

/**
 * The one admission decision of a machine credential (`wbs-machine-credentials`
 * A13, A22), whichever source presented it. Every refusal is the same
 * `unknown_identity`, so a caller cannot tell an unknown credential from a
 * revoked one, an expired secret, a wrong secret, a source mismatch or an
 * unbound person.
 *
 * - The credential must exist, be of the presented source and be unrevoked;
 *   revocation wins over every secret, whatever its expiry.
 * - `api_key`: the presented digest must equal one of the credential's
 *   secrets, compared with {@link digestsEqual} against every secret (no early
 *   exit), and that secret must be unexpired at `now` (`expiresAt > now`).
 * - `oidc`: the credential must belong to the trusted issuer that verified the
 *   token, so two organizations trusting one issuer URL never admit each
 *   other's subjects.
 * - `mcp_consent`: the credential must name the delegation's family.
 * - The person must still be bound to an account: that account is the actor
 *   ({@link MachineActor}).
 */
export function admitMachineCredential(
  presented: PresentedMachineProof,
  credential: MachineCredentialRecord | null,
  now: number,
): MachineAdmission {
  if (credential === null) return UNKNOWN;
  // Proof: with this predicate removed, `refuses a revoked credential` and
  // the property `refuses a revoked credential whatever its secrets' expiries`
  // (machine-credential.test.ts) admitted, and mounted `is refused
  // unknown_identity after revoke` (machine-credential.controller.db.test.ts)
  // answered 200; watched 2026-10-22.
  if (credential.revokedAt !== null) return UNKNOWN;
  // Proof: with this comparison removed, `refuses an API key against a
  // credential of another source holding its digest` admitted; watched
  // 2026-10-22.
  if (credential.source !== presented.kind) return UNKNOWN;
  if (!matchesProof(presented, credential, now)) return UNKNOWN;
  // Proof: admitting an unbound person (an empty account) made `refuses a
  // credential whose person is no longer bound to an account` fail; watched
  // 2026-10-22.
  if (credential.boundAccountId === null) return UNKNOWN;
  return {
    kind: 'admitted',
    actor: {
      credentialId: credential.id,
      accountId: credential.boundAccountId,
      organizationId: credential.organizationId,
      personId: credential.personId,
      scopes: MACHINE_SCOPES,
    },
  };
}

function matchesProof(
  presented: PresentedMachineProof,
  credential: MachineCredentialRecord,
  now: number,
): boolean {
  switch (presented.kind) {
    case 'api_key': {
      let live = false;
      for (const secret of credential.secrets) {
        // Proof: with `secret.expiresAt > now` replaced by `true`, `refuses a
        // secret at and after its expiry` (machine-credential.test.ts)
        // admitted the expired secret; watched 2026-10-22.
        const unexpired = secret.expiresAt === null || secret.expiresAt > now;
        if (digestsEqual(secret.digest, presented.digest) && unexpired) live = true;
      }
      return live;
    }
    case 'oidc':
      // Proof: with this comparison answering true, `never admits another
      // trusted issuer's credential for the same subject`
      // (machine-credential.test.ts) admitted B's token as A's; watched
      // 2026-10-22.
      return credential.trustedIssuerId === presented.trustedIssuerId;
    case 'mcp_consent':
      // Proof: answering true here made `admits a consent credential only for
      // its own family` admit family-2; watched 2026-10-22.
      return credential.mcpFamilyId === presented.familyId;
  }
}
