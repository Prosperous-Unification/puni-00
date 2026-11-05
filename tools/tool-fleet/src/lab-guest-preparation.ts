import { fileURLToPath } from 'node:url';

import { type } from 'arktype';

import type { SeedPin } from './lab-seed-preparation';

/** Exact current source pins and historical seed trust; no resource limits are selectable. */
export interface GuestPreparationRequest {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly state: string;
  readonly nonce: string;
  readonly pins: readonly SeedPin[];
  readonly seedRequest: string;
  readonly seedReceipt: string;
  readonly seedProvenance: string;
  readonly bootstrapSha256: string;
  readonly kvm: {
    readonly identity: readonly [number, number, number, number];
    readonly rdev: number;
  };
}

const Digest = type('string').matching(/^[a-f0-9]{64}$/);
const Receipt = type({
  schemaVersion: '1',
  scope: "'guest-preparation'",
  accepted: 'true',
  nonce: type('string').matching(/^[a-f0-9]{32}$/),
  receiptDigest: Digest,
  guestAuthority: 'false',
  fullRehearsalAuthority: 'false',
}).onUndeclaredKey('reject');

export type GuestPreparation = typeof Receipt.infer;
export type GuestPreparationFailure =
  | 'invalid-arguments'
  | 'dependency-unavailable'
  | 'producer-refused'
  | 'producer-output-bound'
  | 'producer-timeout'
  | 'producer-malformed';

/** Public categories deliberately exclude child diagnostics, private paths and raw causes. */
export class GuestPreparationRefusal extends Error {
  constructor(readonly category: GuestPreparationFailure) {
    super(`guest preparation: ${category}`);
  }
}

/**
 * Boot exactly the original accepted raw and seed under the fixed bounded guest profile.
 * The adjacent Linux helper owns admission, native enforcement, cancellation and durable evidence.
 * Existing attempts are never adopted or overwritten; component success grants no full platform or live migration authority.
 * Request bytes follow {@link GuestPreparationRequest}; retain the adjacent Python/raw runtime siblings.
 */
export function prepareGuest(requestPath: string, requestDigest: string): GuestPreparation {
  // Proof: removing this barrier invoked the child for malformed arguments (api-argument-barrier.log).
  if (requestPath.trim() === '' || !/^[a-f0-9]{64}$/.test(requestDigest)) {
    throw new GuestPreparationRefusal('invalid-arguments');
  }
  const helper = fileURLToPath(new URL('./lab-guest-preparation.py', import.meta.url));
  let invocation: Bun.SyncSubprocess<'pipe', 'pipe'>;
  try {
    invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', helper, requestPath, requestDigest],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 925000,
        killSignal: 'SIGTERM',
        maxBuffer: 65536,
      },
    );
  } catch {
    // Proof: rethrowing the injected child cause leaked PRIVATE_CHILD_DIAGNOSTIC (api-private-cause.log).
    throw new GuestPreparationRefusal('dependency-unavailable');
  }
  if (invocation.exitedDueToMaxBuffer) throw new GuestPreparationRefusal('producer-output-bound');
  if (invocation.exitedDueToTimeout) throw new GuestPreparationRefusal('producer-timeout');
  if (invocation.exitCode !== 0) throw new GuestPreparationRefusal('producer-refused');
  let projection: unknown;
  try {
    projection = JSON.parse(invocation.stdout.toString());
  } catch {
    throw new GuestPreparationRefusal('producer-malformed');
  }
  const receipt = Receipt(projection);
  if (receipt instanceof type.errors || invocation.stderr.length !== 0) {
    throw new GuestPreparationRefusal('producer-malformed');
  }
  return receipt;
}
