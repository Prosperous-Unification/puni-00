import { type ChargedEstimate, WORKDAY_MINUTES } from '@wbs/domain/estimate';

import { showDay } from './plan-number-format';

/** Reads the native charge; minute figures never pass through rounded workday display. */
export function showDuration(charge: ChargedEstimate): string {
  if (charge.unit === 'workdays') return `${showDay(charge.days)} d`;
  if (charge.minutes >= WORKDAY_MINUTES)
    return `${String(Number((charge.minutes / WORKDAY_MINUTES).toFixed(1)))} d`;
  const hours = Math.floor(charge.minutes / 60);
  const minutes = charge.minutes % 60;
  if (hours === 0) return `${String(minutes)} min`;
  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}

/** Reads native minutes from a trusted plan; absence is allowed only for an unestimated step. */
export function minuteCharge(
  row: {
    finalDays: Readonly<Record<string, number | undefined>>;
    charged?: Readonly<Record<string, ChargedEstimate | undefined>>;
  },
  stepId: string,
): Extract<ChargedEstimate, { unit: 'minutes' }> | undefined {
  if (row.finalDays[stepId] === undefined) return undefined;
  return readMinuteCharge(row.charged, stepId);
}

/** Requires a native charge for an estimated minute step without reconstructing it from an axis figure. */
export function readMinuteCharge(
  charged: Readonly<Record<string, ChargedEstimate | undefined>> | undefined,
  stepId: string,
): Extract<ChargedEstimate, { unit: 'minutes' }> {
  const charge = charged?.[stepId];
  // Proof: removing this guard made the mounted missing-native-charge Error Boundary case render the plan; watched 2026-10-12.
  if (charge?.unit !== 'minutes') throw new Error(`Missing native minute charge for ${stepId}`);
  return charge;
}
