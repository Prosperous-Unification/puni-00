import { type } from 'arktype';

/** Aggregate directory occupancy held across the organization. */
export const directoryTotals = type({
  capacity: 'number >= 0',
  occupied: 'number >= 0',
  free: 'number',
});
