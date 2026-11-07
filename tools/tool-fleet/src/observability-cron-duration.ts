const durationLimit = 1n << 63n;
const durationUnits = new Map([
  ['ns', 1n],
  ['us', 1000n],
  ['µs', 1000n],
  ['μs', 1000n],
  ['ms', 1000000n],
  ['s', 1000000000n],
  ['m', 60000000000n],
  ['h', 3600000000000n],
]);

/** Validation-only port of Go1.26.0 time.ParseDuration/leadingFraction (BSD-3-Clause).
 * Source: https://github.com/golang/go/blob/go1.26.0/src/time/format.go; exact license in docs/infra/observability-cron-licenses.md.
 * Pinned format.go SHA256 f288c56858ab25828551681778f006b591ed140fc12e60122b6a9a7e35b07eb7.
 * Keeps Go's bounded fractional accumulation, float64 scaling/truncation and uint64 accumulation before signed-int64 checks.
 * Throws on malformed units, absent digits or overflow; no whitespace normalization. Used by {@link readCronSchedule}.
 */
export function readCronDuration(source: string): bigint {
  const malformed = (): never => {
    throw new Error('Cron duration malformed');
  };
  let remaining = source;
  const isNegative = remaining.startsWith('-');
  if (isNegative || remaining.startsWith('+')) remaining = remaining.slice(1);
  if (remaining === '0') return 0n;
  // Proof: Task54 duration-empty removal accepted an empty @every duration in the native prepass test.
  if (remaining === '') malformed();
  let total = 0n;
  while (remaining !== '') {
    const integerEnd = remaining.search(/[^0-9]/);
    const integer = integerEnd === -1 ? remaining : remaining.slice(0, integerEnd);
    let amount = integer === '' ? 0n : BigInt(integer);
    remaining = remaining.slice(integer.length);
    let fraction = 0n;
    let scale = 1;
    let digits = '';
    if (remaining.startsWith('.')) {
      remaining = remaining.slice(1);
      const fractionEnd = remaining.search(/[^0-9]/);
      digits = fractionEnd === -1 ? remaining : remaining.slice(0, fractionEnd);
      remaining = remaining.slice(digits.length);
      let hasOverflow = false;
      for (const digit of digits) {
        if (hasOverflow) continue;
        const next = fraction * 10n + BigInt(digit);
        if (fraction > (durationLimit - 1n) / 10n || next > durationLimit) {
          hasOverflow = true;
          continue;
        }
        fraction = next;
        scale *= 10;
      }
    }
    // Proof: Task54 duration-digits removal accepted @every .s in the native prepass test.
    if (integer === '' && digits === '') malformed();
    const unitEnd = remaining.search(/[0-9.]/);
    const unitName = unitEnd === -1 ? remaining : remaining.slice(0, unitEnd);
    // Proof: Task54 duration-unit-dependency defaulting an unknown unit to ns admitted 1fortnight in the native prepass test.
    const unit = durationUnits.get(unitName);
    // Proof: Task54 duration-multiply removal admitted a negative multiplied overflow in the native prepass test.
    if (unit === undefined || amount > durationLimit / unit) return malformed();
    remaining = remaining.slice(unitName.length);
    amount *= unit;
    if (fraction > 0n) {
      // Proof: Task54 duration-float64 rational substitution admitted an int64-edge interval in the native float64 safety test.
      amount += BigInt(Math.trunc(Number(fraction) * (Number(unit) / scale)));
      // Proof: Task54 duration-fraction removal let an oversized fraction wrap a prior int64-min magnitude in the native pre-sum overflow test.
      if (amount > durationLimit) malformed();
    }
    total = BigInt.asUintN(64, total + amount);
    // Proof: Task54 duration-sum removal admitted the native summed-overflow interval.
    if (total > durationLimit) malformed();
  }
  if (isNegative) return -total;
  // Proof: Task54 duration-positive-limit removal admitted +2^63ns in the native positive-limit test.
  if (total >= durationLimit) malformed();
  return total;
}
