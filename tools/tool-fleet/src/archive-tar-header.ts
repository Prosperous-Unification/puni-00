/** Strict NUL-terminated tar text; outer archive errors remain stable across both readers. */
export function readTarField(header: Buffer, start: number, end: number): string {
  const segment = header.subarray(start, end);
  const terminator = segment.indexOf(0);
  if (terminator >= 0 && !segment.subarray(terminator).every((byte) => byte === 0))
    // Proof: Removing NUL-tail validation accepted the hidden header suffix; ambiguous-name negative failed; Task25c1 ambiguous-header also failed when removed.
    throw new Error('Object store archive has an ambiguous header');
  return segment.subarray(0, terminator < 0 ? segment.length : terminator).toString('utf8');
}

/** Reads bounded octal tar numbers; base-256 and ambiguous encodings are unsupported. */
export function readTarOctal(header: Buffer, start: number, end: number): number {
  const text = header
    .subarray(start, end)
    .toString('utf8')
    .replace(/[\0 ]+$/, '');
  if (!/^[0-7]+$/.test(text))
    // Proof: Removing octal validation lost the specific invalid-header refusal; octal negative failed; Task25c1 inner-octal also failed when removed.
    throw new Error('Object store archive has invalid octal metadata');
  return Number.parseInt(text, 8);
}

/** Verifies the unsigned tar checksum before trusting a header. */
export function requireTarChecksum(header: Buffer): void {
  const checksum = header.reduce(
    (sum, byte, position) => sum + (position >= 148 && position < 156 ? 32 : byte),
    0,
  );
  if (readTarOctal(header, 148, 156) !== checksum)
    // Proof: Removing checksum validation accepted the altered header; checksum negative failed; Task25c1 inner-checksum also failed when removed.
    throw new Error('Object store archive header checksum differs');
}
