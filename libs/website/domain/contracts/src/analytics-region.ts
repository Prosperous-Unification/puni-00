/** Approximate local IP-country policy; independent of a visitor's saved analytics choice. */
export type AnalyticsRegion = 'consent-required' | 'elsewhere' | 'unknown';

/** Public maintenance metadata; a due release remains the same release until manually replaced. */
export interface AnalyticsDatabase {
  month: string;
  refreshDue: string;
  updateDue: boolean;
}

/** `GET /analytics/region`; null database explicitly means no reader was injected. */
export type AnalyticsRegionResponse =
  { region: AnalyticsRegion; database: AnalyticsDatabase } | { region: 'unknown'; database: null };

function readFields(value: unknown, keys: string[]): Record<string, unknown> {
  // Proof: removing the own-key count admitted identifying extra fields in analytics-region.test.
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.propertyIsEnumerable.call(value, key))
  )
    throw new Error('Invalid analytics region');
  return Object.fromEntries(keys.map((key) => [key, Reflect.get(value, key)]));
}

/**
 * Validates the wire response, rejecting extra/identifying fields and malformed maintenance
 * dates. A missing reader can only report unknown. Throws at the network response boundary.
 */
export function parseAnalyticsRegionResponse(value: unknown): AnalyticsRegionResponse {
  const { region, database } = readFields(value, ['region', 'database']);
  // Proof: removing category validation admitted the US category in the malformed-response test.
  if (region !== 'consent-required' && region !== 'elsewhere' && region !== 'unknown')
    throw new Error('Invalid analytics region');
  if (database === null && region === 'unknown') return { region, database };
  const { month, refreshDue, updateDue } = readFields(database, [
    'month',
    'refreshDue',
    'updateDue',
  ]);
  // Proof: omitting the boolean check admitted updateDue="false" in the wire-boundary test.
  if (
    typeof month !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    typeof refreshDue !== 'string' ||
    typeof updateDue !== 'boolean'
  )
    throw new Error('Invalid analytics region');
  const nextMonth = new Date(`${month}-01T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  // Proof: removing the date check admitted an invalid or non-next-month refresh date.
  if (refreshDue !== nextMonth.toISOString().slice(0, 10))
    throw new Error('Invalid analytics region');
  return { region, database: { month, refreshDue, updateDue } };
}
