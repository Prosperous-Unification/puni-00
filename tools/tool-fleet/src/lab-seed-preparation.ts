import { fileURLToPath } from 'node:url';

import { type } from 'arktype';

export type SeedMemberName =
  | 'user-data'
  | 'meta-data'
  | 'network-config'
  | 'docker-ce.deb'
  | 'docker-ce-cli.deb'
  | 'containerd.io.deb';

export interface SeedPin {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly uid: number;
  readonly mode: number;
}

/** Operator-reviewed historical source evidence; current source files cannot replace these pins. */
export interface SeedRawProvenance {
  readonly schemaVersion: 1;
  readonly sourceRevision: string;
  readonly sourcePins: readonly SeedPin[];
  readonly requestDigest: string;
  readonly receiptDigest: string;
}

/**
 * Private JSON input to {@link prepareSeed}; the caller independently reviews its exact byte digest.
 * Pins include current source/tool/library closure, selected image, signed input metadata, all six
 * members, the dependency report and original raw receipt/request/allocation/provenance records.
 * Provenance explicitly names pinned trust records; every selected path is rehashed natively.
 * Member files are immutable0400; original raw state is observed read-only and never recreated.
 * rawProvenance points to {@link SeedRawProvenance}, rawRequest to the accepted original request.
 * The raw allocation record must be pinned beside rawReceipt as allocation.json.
 * No resource profile or guest-authority field is caller selectable.
 */
export interface SeedPreparationRequest {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly state: string;
  readonly nonce: string;
  readonly pins: readonly SeedPin[];
  readonly members: Readonly<Record<SeedMemberName, Pick<SeedPin, 'path' | 'sha256' | 'bytes'>>>;
  readonly image: string;
  readonly dependencyReport: string;
  readonly rawReceipt: string;
  readonly rawRequest: string;
  readonly rawProvenance: string;
  readonly provenance: readonly string[];
}

const Digest = type('string').matching(/^[a-f0-9]{64}$/);
const Receipt = type({
  schemaVersion: '1',
  scope: "'seed-preparation'",
  accepted: 'true',
  nonce: type('string').matching(/^[a-f0-9]{32}$/),
  receiptDigest: Digest,
  guestAuthority: 'false',
  fullRehearsalAuthority: 'false',
}).onUndeclaredKey('reject');

export type SeedPreparation = typeof Receipt.infer;
export type SeedPreparationFailure =
  | 'invalid-arguments'
  | 'dependency-unavailable'
  | 'producer-refused'
  | 'producer-output-bound'
  | 'producer-timeout'
  | 'producer-malformed';

/** Public categories deliberately exclude child diagnostics, private paths and raw causes. */
export class SeedPreparationRefusal extends Error {
  constructor(readonly category: SeedPreparationFailure) {
    super(`seed preparation: ${category}`);
  }
}

/**
 * Prepare exactly one fixed-profile six-member NoCloud ISO from an independently hashed private request.
 * The adjacent Linux helper owns admission, native enforcement, cancellation and durable evidence.
 * Existing attempts are never adopted or overwritten; component success grants no guest authority.
 * Request bytes follow {@link SeedPreparationRequest}; retain the adjacent Python/raw runtime siblings.
 */
export function prepareSeed(requestPath: string, requestDigest: string): SeedPreparation {
  if (requestPath.trim() === '' || !/^[a-f0-9]{64}$/.test(requestDigest)) {
    throw new SeedPreparationRefusal('invalid-arguments');
  }
  const helper = fileURLToPath(new URL('./lab-seed-preparation.py', import.meta.url));
  let invocation: Bun.SyncSubprocess<'pipe', 'pipe'>;
  try {
    invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', helper, requestPath, requestDigest],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 95000,
        killSignal: 'SIGTERM',
        maxBuffer: 65536,
      },
    );
  } catch {
    throw new SeedPreparationRefusal('dependency-unavailable');
  }
  if (invocation.exitedDueToMaxBuffer) throw new SeedPreparationRefusal('producer-output-bound');
  if (invocation.exitedDueToTimeout) throw new SeedPreparationRefusal('producer-timeout');
  if (invocation.exitCode !== 0) throw new SeedPreparationRefusal('producer-refused');
  let projection: unknown;
  try {
    projection = JSON.parse(invocation.stdout.toString());
  } catch {
    throw new SeedPreparationRefusal('producer-malformed');
  }
  const receipt = Receipt(projection);
  if (receipt instanceof type.errors || invocation.stderr.length !== 0) {
    throw new SeedPreparationRefusal('producer-malformed');
  }
  return receipt;
}
