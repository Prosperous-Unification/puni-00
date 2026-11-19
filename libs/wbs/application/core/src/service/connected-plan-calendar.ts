import { indexTree } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { workdayOrdinalOf } from '@wbs/domain/workday';

import type { DependencyCalendarMissing } from './connected-plan-projection';
import type { ConnectedPlanCapture } from './connected-plan-values';

/** Calendar evidence on surviving work packages; empty work packages contribute neither origin nor required date. */
export type ConnectedCalendar =
  | DependencyCalendarMissing
  | {
      readonly kind: 'calendar';
      readonly originOrdinal: number | null;
      readonly shiftByWorkPackage: ReadonlyMap<string, number>;
    };

/** Resolve the same absolute workday axis regardless of target or rank. Missing required inputs throw. */
export function resolveConnectedCalendar(
  capture: ConnectedPlanCapture,
  inputs: ReadonlyMap<string, ScheduleInput>,
): ConnectedCalendar {
  const missing: DependencyCalendarMissing['workPackages'][number][] = [];
  const ordinals = new Map<string, number>();
  for (const member of capture.workPackages) {
    const input = inputs.get(member.workPackageId);
    // Proof (diagnostic): deleting this check failed `refuses absent prepared calendars and broken reverse identities` (property-access error).
    if (input === undefined)
      throw new Error(`missing prepared work package ${member.workPackageId}`);
    if (input.slices.length === 0) continue;
    const anchor = member.reads.workPackage.startDate;
    // Proof: bypassing this branch failed `retains graph and capture when a required calendar is missing` and the shared-person peer case (lost typed outcome).
    if (anchor === null)
      missing.push({
        workPackageId: member.workPackageId,
        abbreviation: member.abbreviation,
        name: member.reads.workPackage.name,
      });
    else ordinals.set(member.workPackageId, workdayOrdinalOf(anchor));
  }
  if (missing.length > 0) return { kind: 'dependency_calendar_missing', workPackages: missing };
  const originOrdinal = ordinals.size === 0 ? null : Math.min(...ordinals.values());
  return {
    kind: 'calendar',
    originOrdinal,
    shiftByWorkPackage: new Map(
      [...ordinals].map(([workPackageId, ordinal]) => {
        // Invariant diagnostic: a visited ordinal implies a nonempty ordinal map.
        if (originOrdinal === null) throw new Error('nonempty calendar has no origin');
        // Proof: zeroing shifts failed `retains own Wednesday floor and workPackages back to each own anchor` (start 1 instead of 2).
        return [workPackageId, ordinal - originOrdinal];
      }),
    ),
  };
}

/** Affine translation keeps signed/fractional offsets and imposes every surviving leaf's own start. */
export function translateConnectedCalendar(
  input: ScheduleInput,
  shift: number,
): Pick<ScheduleInput, 'notBefore' | 'deadlines'> {
  // Proof: rounding shift + offset failed `preserves signed fractional numeric calendar constraints without date round trips`.
  const notBefore = new Map([...input.notBefore].map(([id, offset]) => [id, shift + offset]));
  // Proof: omitting leaf floors failed `retains own Wednesday floor and workPackages back to each own anchor` (start 1 instead of 2).
  for (const id of indexTree(input.rows).leafIds)
    notBefore.set(id, Math.max(shift, notBefore.get(id) ?? shift));
  return {
    notBefore,
    deadlines: new Map([...input.deadlines].map(([id, offset]) => [id, shift + offset])),
  };
}
