/** One caller-selected capacity scope; adapters retain placement and ownership policy. */
export interface Capacity {
  readonly memoryMiB: number;
  readonly cpuMilli: number;
  readonly diskMiB: number;
}

/** An independently identified contribution, never a readiness or ownership receipt. */
export interface CapacityCharge extends Capacity {
  readonly identity: string;
}

/** Read the existing preflight memory syntax as MiB; refuse unknown or nonfinite quantities through caller policy. */
export function readMemoryMiB(quantity: string, refuse: (reason: string) => never): number {
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T)?$/.exec(quantity);
  // Proof: removing this refusal failed `unknown memory quantity refuses` with its named fault.
  if (match === null) refuse('memory-unknown');
  const factors: Record<string, number> = {
    '': 1 / 1048576,
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1048576,
    K: 1000 / 1048576,
    M: 1000000 / 1048576,
    G: 1000000000 / 1048576,
    T: 1000000000000 / 1048576,
  };
  const memory = Number(match[1]) * factors[match.at(2) ?? ''];
  // Proof: removing this refusal failed `overflowing memory quantity refuses` with its named fault.
  if (!Number.isFinite(memory)) refuse('memory-unknown');
  return memory;
}

/** Read the existing preflight CPU syntax as milli-cores without rounding fractional requests. */
export function readCPUMilli(quantity: string, refuse: (reason: string) => never): number {
  const match = /^(\d+(?:\.\d+)?)(m|u|n)?$/.exec(quantity);
  // Proof: removing this refusal failed `unknown node CPU refuses` with its named fault.
  if (match === null) refuse('cpu-unknown');
  const multiplier =
    match[2] === 'm' ? 1 : match[2] === 'u' ? 0.001 : match[2] === 'n' ? 0.000001 : 1000;
  const cpu = Number(match[1]) * multiplier;
  // Proof: removing this refusal failed `overflowing CPU quantity refuses` with its named fault.
  if (!Number.isFinite(cpu)) refuse('cpu-unknown');
  return cpu;
}

const dimensions = ['memoryMiB', 'cpuMilli', 'diskMiB'] as const;

/** Sum finite nonnegative named contributions without provider shapes or rounding.
 * Throws on malformed amounts, duplicate identities or overflow. A partial ledger sum is only known contributions.
 */
export function sumCapacity(charges: readonly CapacityCharge[]): Capacity {
  const identities = new Set<string>();
  const required = { memoryMiB: 0, cpuMilli: 0, diskMiB: 0 };
  for (const charge of charges) {
    // Proof: Task25a charge-identity removal admitted duplicate contributions.
    if (charge.identity === '' || identities.has(charge.identity))
      throw new Error('Capacity duplicate or empty identity');
    identities.add(charge.identity);
    for (const dimension of dimensions) {
      // Proof: Task25a demand-finite removal admitted negative contribution amounts.
      if (!Number.isFinite(charge[dimension]) || charge[dimension] < 0)
        throw new Error('Capacity invalid contribution');
      // Proof: Task25a zeroed summation failed native known totals and all three preflight deficit negatives.
      required[dimension] += charge[dimension];
      // Proof: Task25a sum-finite removal admitted summed finite-input overflow.
      if (!Number.isFinite(required[dimension])) throw new Error('Capacity sum overflow');
    }
  }
  return required;
}

/** Compare complete contributions to one declared scope without rounding.
 * Throws on malformed trusted amounts. Fit grants no mutation or admission authority.
 */
export function assessCapacity(capacity: Capacity, charges: readonly CapacityCharge[]) {
  for (const dimension of dimensions)
    // Proof: Task25a available-finite removal admitted NaN availability.
    if (!Number.isFinite(capacity[dimension]) || capacity[dimension] < 0)
      throw new Error('Capacity invalid available amount');
  const required = sumCapacity(charges);
  const deficits = dimensions.flatMap((dimension) =>
    // Proof: Task25a fit-deficit bypass hid the source-derived one-MiB deficit.
    required[dimension] > capacity[dimension]
      ? [
          {
            dimension,
            required: required[dimension],
            available: capacity[dimension],
            missing: required[dimension] - capacity[dimension],
          },
        ]
      : [],
  );
  return {
    state: deficits.length === 0 ? ('fits' as const) : ('deficit' as const),
    required,
    deficits,
  };
}
