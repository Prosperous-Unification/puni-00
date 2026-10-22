import type { MachineCredentialRecord, MachineCredentialSource } from '@wbs/domain';

import type { AuditedAct } from './organization-audit';

/** How coarse `last_used_at` is (`wbs-machine-credentials` A13): one write per credential per minute. */
export const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * The reads and the one hot-path write the machine-credential verification
 * path needs (`wbs-machine-credentials` A13, A22). Creation, rotation and
 * revocation are {@link MachineCredentialAdministration}'s, not this port's.
 */
export interface MachineCredentials {
  /**
   * The credential with this id, its person's bound account read now, and
   * every secret it holds; null when no credential has this id. Revoked
   * credentials and expired secrets are returned as they are: the admission
   * decision ({@link admitMachineCredential}) refuses them.
   *
   * @throws when a stored row is malformed (trusted state).
   */
  findById(id: string): Promise<MachineCredentialRecord | null>;
  /**
   * Records a use at `at` when the last recorded use is absent or at least
   * {@link LAST_USED_RESOLUTION_MS} older; otherwise writes nothing.
   *
   * @throws on every store failure: a failed write is a server fault.
   */
  touchLastUsed(id: string, at: number): Promise<void>;
}

/**
 * A deployment, or a fixture, holding no machine credential: every API key
 * reads as unknown (`unknown_identity`), and nothing is ever touched.
 */
export const NO_MACHINE_CREDENTIALS: MachineCredentials = {
  findById: () => Promise.resolve(null),
  touchLastUsed: () => Promise.reject(new Error('no machine credential exists to record a use of')),
};

/** How long a rotated API-key secret keeps admitting beside its successor (A15). */
export const MACHINE_ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One API-key secret as listed: never the secret or its digest. */
export interface MachineSecretSummary {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number | null;
}

/**
 * A machine credential as its administrators list it: never a secret or a
 * digest. `issuer` and `subject` are set for `oidc` only; `secrets` holds an
 * `api_key`'s secrets live at the listing time; `rotationEndsAt` is the end of
 * an open rotation window, else null.
 */
export interface MachineCredentialSummary {
  readonly id: string;
  readonly source: MachineCredentialSource;
  readonly name: string;
  readonly personId: string;
  readonly issuedBy: string;
  readonly issuer: string | null;
  readonly subject: string | null;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  readonly revokedAt: number | null;
  readonly rotationEndsAt: number | null;
  readonly secrets: readonly MachineSecretSummary[];
}

/**
 * Why an administration act was refused before anything was read about the
 * credential: `inactive` before activation, `forbidden` for a viewer or an
 * actor who is no longer a member.
 */
export type MachineCredentialActorRefusal = 'inactive' | 'forbidden';

/** A new API-key credential: ids minted by the caller, only the digest of its secret. */
export interface ApiKeyDraft {
  readonly id: string;
  readonly name: string;
  readonly personId: string;
  readonly secretId: string;
  readonly digest: string;
}

/**
 * Machine credential administration (`wbs-machine-credentials` A7, A11, A15,
 * A17). Every act rechecks activation, the actor's role and, for a `member`,
 * that the credential's person is bound to the actor's own account, inside
 * the one immediate transaction that also writes its `organization_audit`
 * row, so the act and its audit row commit or roll back together. An `admin`
 * or `super_admin` acts on every agent person of the organization; a `viewer`
 * on none. Only a SHA-256 digest of a secret ever reaches the store.
 *
 * @throws when trusted state is missing, unreadable or malformed, and when the
 * audit row cannot be written (the act is then rolled back).
 */
export interface MachineCredentialAdministration {
  /**
   * Unrevoked credentials of the organization (`includeRevoked` adds the
   * revoked), narrowed to `personId` when given, and for a `member` to agent
   * persons bound to the actor's account; secrets as live at `at`.
   */
  list(
    organizationId: string,
    actorId: string,
    filter: { readonly personId?: string; readonly includeRevoked: boolean },
    at: number,
  ): Promise<readonly MachineCredentialSummary[] | MachineCredentialActorRefusal>;
  /**
   * Creates an `api_key` credential issued by `actorId` for an agent person of
   * the organization. `unknown_person` for a person of another organization or
   * of kind `person`; for a `member`, `forbidden` for any person not bound to
   * the actor's account; `person_not_bound` when the person is unbound;
   * `account_not_member` when its account is no member; `name_taken` when an
   * unrevoked credential of the organization has the name.
   */
  createApiKey(
    organizationId: string,
    actorId: string,
    draft: ApiKeyDraft,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'created'; readonly credential: MachineCredentialSummary }
    | {
        readonly kind:
          | MachineCredentialActorRefusal
          | 'unknown_person'
          | 'person_not_bound'
          | 'account_not_member'
          | 'name_taken';
      }
  >;
  /**
   * Adds a secret under the unchanged credential id and gives the previous
   * one `act.stamp.at +` {@link MACHINE_ROTATION_WINDOW_MS}. `not_found` for a
   * revoked credential, another organization's, or for a `member` one whose
   * person is not bound to the actor's account; `rotation_at_issuer` for a
   * source other than `api_key`; `rotation_in_progress` while a window is open.
   */
  rotateApiKey(
    organizationId: string,
    actorId: string,
    credentialId: string,
    successor: { readonly secretId: string; readonly digest: string },
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'rotated'; readonly previousExpiresAt: number }
    | {
        readonly kind:
          | MachineCredentialActorRefusal
          | 'not_found'
          | 'rotation_at_issuer'
          | 'rotation_in_progress';
      }
  >;
  /**
   * Sets `revoked_at` and ends every secret at `act.stamp.at`. `not_found` as
   * for {@link rotateApiKey}, a revoked credential included.
   */
  revoke(
    organizationId: string,
    actorId: string,
    credentialId: string,
    act: AuditedAct,
  ): Promise<'revoked' | MachineCredentialActorRefusal | 'not_found'>;
}

/**
 * Administration for an app composed without it: every act answers as before
 * activation (`no_active_organization`). Production wires the SQLite store.
 */
export const INACTIVE_MACHINE_CREDENTIAL_ADMINISTRATION: MachineCredentialAdministration = {
  list: () => Promise.resolve('inactive'),
  createApiKey: () => Promise.resolve({ kind: 'inactive' }),
  rotateApiKey: () => Promise.resolve({ kind: 'inactive' }),
  revoke: () => Promise.resolve('inactive'),
};
