import { fileURLToPath } from 'node:url';

import { type } from 'arktype';

const Digest = type('string').matching(/^[a-f0-9]{64}$/);
const Receipt = type({
  schemaVersion: '1',
  scope: "'raw-preparation'",
  accepted: 'true',
  nonce: type('string').matching(/^[a-f0-9]{32}$/),
  receiptDigest: Digest,
  guestAuthority: 'false',
  fullRehearsalAuthority: 'false',
}).onUndeclaredKey('reject');

export type RawPreparation = typeof Receipt.infer;
export type RawPreparationFailure =
  | 'invalid-arguments'
  | 'dependency-unavailable'
  | 'producer-refused'
  | 'producer-output-bound'
  | 'producer-timeout'
  | 'producer-malformed';

/** Public categories deliberately exclude child diagnostics, private paths and raw causes. */
export class RawPreparationRefusal extends Error {
  constructor(readonly category: RawPreparationFailure) {
    super(`raw preparation: ${category}`);
  }
}

/**
 * Prepare exactly one fixed-profile raw artifact from an independently hashed private request.
 * The adjacent Linux helper owns admission, native enforcement, cancellation and durable evidence.
 * Existing attempts are never adopted or overwritten; component success grants no guest authority.
 * Run from source, retaining the Python producer and allocation-inspector siblings.
 */
export function prepareRaw(requestPath: string, requestDigest: string): RawPreparation {
  if (requestPath.trim() === '' || !/^[a-f0-9]{64}$/.test(requestDigest)) {
    throw new RawPreparationRefusal('invalid-arguments');
  }
  const helper = fileURLToPath(new URL('./lab-raw-preparation.py', import.meta.url));
  let invocation: Bun.SyncSubprocess<'pipe', 'pipe'>;
  try {
    invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', helper, requestPath, requestDigest],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 935000,
        killSignal: 'SIGTERM',
        maxBuffer: 65536,
      },
    );
  } catch {
    throw new RawPreparationRefusal('dependency-unavailable');
  }
  if (invocation.exitedDueToMaxBuffer) throw new RawPreparationRefusal('producer-output-bound');
  if (invocation.exitedDueToTimeout) throw new RawPreparationRefusal('producer-timeout');
  if (invocation.exitCode !== 0) throw new RawPreparationRefusal('producer-refused');
  let projection: unknown;
  try {
    projection = JSON.parse(invocation.stdout.toString());
  } catch {
    throw new RawPreparationRefusal('producer-malformed');
  }
  const receipt = Receipt(projection);
  if (receipt instanceof type.errors || invocation.stderr.length !== 0) {
    throw new RawPreparationRefusal('producer-malformed');
  }
  return receipt;
}
