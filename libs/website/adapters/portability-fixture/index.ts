import { formatTurns } from '@shared/portability-format';
export function describeAllowance(limit: number, used: number): string {
  return formatTurns(Math.max(0, limit - used));
}
