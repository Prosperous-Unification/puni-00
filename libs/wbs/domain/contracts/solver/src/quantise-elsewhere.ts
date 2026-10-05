import { checkElsewhere, type Elsewhere, type ElsewhereBooking, SOLVER_QUANTUM } from '@wbs/domain';

import type { SolverPreflight } from './solver-preflight';
import { SOLVER_HORIZON_UNITS_MAX, type SolverElsewhere } from './wire-types';

/**
 * Project workdays become conservative fixed intervals: round starts down and
 * ends up, clip at zero, omit expired bookings, and union rounded overlaps.
 * Adjacency stays a hand-off. The caller retains the original holder-bearing
 * bookings for materialisation and publication diagnostics. The scaled copy
 * is solely the quantised Fast hint's axis; a union names its first holder.
 * @throws When the domain bookings are malformed, through {@link checkElsewhere}.
 */
export function quantiseElsewhere(
  elsewhere: Elsewhere = new Map(),
):
  | { readonly ok: true; readonly wire: SolverElsewhere; readonly scaled: Elsewhere }
  | Extract<SolverPreflight, { ok: false }> {
  checkElsewhere(elsewhere);
  const wire: Record<string, [number, number][]> = {};
  const scaled = new Map<string, ElsewhereBooking[]>();
  for (const [personId, bookings] of elsewhere) {
    const union: ElsewhereBooking[] = [];
    for (const booking of bookings) {
      if (booking.end <= 0) continue;
      // Proof: start rounded up, zero clipping removed, expired intervals retained,
      // or rounded-union disabled each failed the outward-rounding case (0 pass / 1 fail).
      const start = Math.max(0, Math.floor(booking.start * SOLVER_QUANTUM));
      const end = Math.ceil(booking.end * SOLVER_QUANTUM);
      // Proof: dropping this guard made the production request-pair/SQLite
      // arithmetic negatives fail (4 pass / 3 fail), before slot cleanup.
      if (!Number.isSafeInteger(end) || end > SOLVER_HORIZON_UNITS_MAX) {
        return {
          ok: false,
          failure: 'horizon-overflow',
          detail: `booking for ${personId} ends beyond the solver horizon`,
        };
      }
      const previous = union.at(-1);
      if (previous !== undefined && start < previous.end) {
        union[union.length - 1] = { ...previous, end: Math.max(previous.end, end) };
      } else union.push({ ...booking, start, end });
    }
    if (union.length === 0) continue;
    Object.defineProperty(wire, personId, {
      value: union.map(({ start, end }) => [start, end]),
      enumerable: true,
    });
    scaled.set(personId, union);
  }
  return { ok: true, wire, scaled };
}
