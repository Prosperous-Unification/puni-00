import type { MachineCredentialRecord } from '@wbs/domain';

/** How coarse `last_used_at` is (`wbs-machine-credentials` A13): one write per credential per minute. */
export const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * The reads and the one hot-path write the machine-credential verification
 * path needs (`wbs-machine-credentials` A13, A22). Creation, rotation and
 * revocation are the administration routes' (slice 2), not this port's.
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
