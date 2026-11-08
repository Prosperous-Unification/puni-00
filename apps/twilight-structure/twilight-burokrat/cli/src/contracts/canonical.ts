import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted by UTF-16 code unit, no whitespace, and `JSON.stringify`
 * scalars, so one record has one byte spelling whatever order its keys were built in.
 *
 * @throws when a value has no exact JSON spelling: `undefined`, a non-finite number, or
 * anything other than null, booleans, strings, numbers, arrays and plain objects.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON needs finite numbers');
    return JSON.stringify(value);
  }
  if (value === undefined) throw new Error('canonical JSON cannot carry undefined');
  if (Array.isArray(value)) return `[${value.map((element) => canonicalJson(element)).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
  }
  throw new Error(`canonical JSON accepts only plain JSON values, not ${typeof value}`);
}

/** SHA-256, lowercase hex, of a value's {@link canonicalJson} bytes. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/** The {@link digestOf} a record without its own digest `field`. */
export function digestWithout(record: object, field: string): string {
  return digestOf(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field)));
}

/**
 * Recomputes a record's digest without its own `field` and compares.
 *
 * @throws when the record has no string `field`, or the embedded digest differs.
 */
export function verifyDigest(record: object, field: string): void {
  const embedded: unknown = Object.entries(record).find(([key]) => key === field)?.[1];
  if (typeof embedded !== 'string') throw new Error(`record has no ${field}`);
  const computed = digestWithout(record, field);
  // Proof: replacing this comparison with `false` made `verifyDigest accepts the record it
  // digested and refuses a tampered one` fail: the tampered record verified (2026-10-11).
  if (computed !== embedded) {
    throw new Error(
      `${field} does not match the record: embedded ${embedded}, computed ${computed}`,
    );
  }
}

/** SHA-256, lowercase hex, of the exact original bytes without text decoding. */
export function digestBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
