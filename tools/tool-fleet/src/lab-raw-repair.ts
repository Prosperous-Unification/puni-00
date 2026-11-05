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
