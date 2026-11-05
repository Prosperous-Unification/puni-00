import { fileURLToPath } from 'node:url';

import { type } from 'arktype';

const Unsigned64 = type('string')
  .matching(/^(0|[1-9][0-9]*)$/)
  .narrow((quantity) => quantity.length <= 20 && BigInt(quantity) <= 18446744073709551615n);

/** Exact native identity for new repair contracts; historical v1 JSON stays opaque. */
export const RepairSnapshot = type({
  device: Unsigned64,
  inode: Unsigned64,
  owner: 'number.integer >= 0 & number <= 4294967295',
  mode: "'0600'",
  links: '1',
  logicalBytes: "'8589934592'",
  allocatedBytes: Unsigned64,
  mtimeNs: Unsigned64,
  ctimeNs: Unsigned64,
})
  .onUndeclaredKey('reject')
  .narrow(
    (snapshot) =>
      BigInt(snapshot.allocatedBytes) <= 8590983168n &&
      BigInt(snapshot.allocatedBytes) % 4096n === 0n,
  );

export type RepairSnapshot = typeof RepairSnapshot.infer;

/** Validate without coercion or loss of native integer precision. Throws on unsafe input. */
export function parseRepairSnapshot(value: unknown): RepairSnapshot {
  // Proof: parser-dependency bypass admits unsafe identities in the adjacent native-nanoseconds test.
  const snapshot = RepairSnapshot(value);
  if (snapshot instanceof type.errors) throw new Error('repair-snapshot-invalid');
  return snapshot;
}

const Envelope = type({
  schemaVersion: '1',
  scope: "'raw-repair-preparation'",
  accepted: 'true',
  nonce: type('string').matching(/^[a-f0-9]{32}$/),
  receiptDigest: type('string').matching(/^[a-f0-9]{64}$/),
  guestAuthority: 'false',
  fullRehearsalAuthority: 'false',
}).onUndeclaredKey('reject');

export type RawRepairPreparation = typeof Envelope.infer;

/** Fixed-policy request: historical evidence pins stay independent of the current source closure. */
export interface RawRepairRequest {
  schemaVersion: 1;
  root: string;
  state: string;
  nonce: string;
  pins: { path: string; sha256: string; bytes: number; uid: number; mode: number }[];
  image: string;
  rawRequest: string;
  rawReceipt: string;
  rawProvenance: string;
  priorGuestRequest: string;
  priorGuestFailure: string;
  postBootEvidence: string;
  witness: string;
  expectedRaw: RepairSnapshot;
}

export class RawRepairRefusal extends Error {
  constructor(
    readonly category:
      | 'invalid-arguments'
      | 'dependency-unavailable'
      | 'producer-refused'
      | 'producer-output-bound'
      | 'producer-timeout'
      | 'producer-malformed',
  ) {
    super(`raw repair: ${category}`);
  }
}

/** Run one source-pinned same-inode repair. Component acceptance grants no seed or guest authority. */
export function prepareRawRepair(requestPath: string, requestDigest: string): RawRepairPreparation {
  if (requestPath.trim() === '' || !/^[a-f0-9]{64}$/.test(requestDigest)) {
    throw new RawRepairRefusal('invalid-arguments');
  }
  const helper = fileURLToPath(new URL('./lab-raw-repair.py', import.meta.url));
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
    throw new RawRepairRefusal('dependency-unavailable');
  }
  if (invocation.exitedDueToMaxBuffer) throw new RawRepairRefusal('producer-output-bound');
  if (invocation.exitedDueToTimeout) throw new RawRepairRefusal('producer-timeout');
  if (invocation.exitCode !== 0) throw new RawRepairRefusal('producer-refused');
  let projection: unknown;
  try {
    projection = JSON.parse(invocation.stdout.toString());
  } catch {
    throw new RawRepairRefusal('producer-malformed');
  }
  const envelope = Envelope(projection);
  if (envelope instanceof type.errors || invocation.stderr.length !== 0)
    throw new RawRepairRefusal('producer-malformed');
  return envelope;
}
